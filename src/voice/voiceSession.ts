import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalTrackPublication,
  type LocalParticipant,
  type Participant,
} from 'livekit-client';
import {
  POSITION_AUDIO_STALE_MS,
  PROXIMITY_DEBUG_UI_INTERVAL_MS,
  VOLUME_EPSILON,
  VOLUME_SMOOTHING_FACTOR,
  VOLUME_SMOOTHING_INTERVAL_MS,
} from '../audio/proximityAudioConstants';
import { calculateProximityVolume, clamp01 } from '../audio/proximityVolume';
import {
  classifiedConnectionError,
  classifyFetchNetworkError,
  classifyHttpApiFailure,
} from '../realtime/connectionErrors';
import type {
  ParticipantSummary,
  TokenResponse,
  VoiceSessionListener,
  VoiceSessionSnapshot,
} from './types';

type ConnectOptions = {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  audioContainer: HTMLElement;
};

type SwitchRoomOptions = {
  roomName: string;
};

function isTokenResponse(value: unknown): value is TokenResponse {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.serverUrl === 'string' &&
    typeof record.participantToken === 'string' &&
    typeof record.participantIdentity === 'string'
  );
}

export class VoiceSession {
  private room: Room | null = null;
  private audioContainer: HTMLElement | null = null;
  private listeners = new Set<VoiceSessionListener>();
  private status: VoiceSessionSnapshot['status'] = 'idle';
  private roomName = '';
  private participantName = '';
  private participantIdentity: string | null = null;
  private muted = false;
  private needsAudioStart = false;
  private errorMessage: string | null = null;
  private attachedElements = new Map<string, HTMLMediaElement[]>();

  private generation = 0;
  private operationChain: Promise<void> = Promise.resolve();
  private desiredRoomName: string | null = null;
  private switchLoopRunning = false;

  private proximityAudioEnabled = true;
  private targetVolumes = new Map<string, number>();
  private currentVolumes = new Map<string, number>();
  private lastDistanceAt = new Map<string, number>();
  private lastDistances = new Map<string, number>();
  private volumeSmoothingTimer: ReturnType<typeof setInterval> | null = null;
  private lastProximityDebugEmitAt = 0;
  private nearestDistance: number | null = null;
  private nearestVolume: number | null = null;
  private staleParticipantCount = 0;

  private readonly onTrackSubscribed = (
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    if (track.kind !== Track.Kind.Audio) return;
    this.ensureProximityState(participant.identity);
    this.attachRemoteAudio(track, participant.identity);
    this.applyVolumeToParticipant(participant.identity, this.currentVolumes.get(participant.identity) ?? 0);
    this.emit();
  };

  private readonly onTrackUnsubscribed = (
    track: RemoteTrack,
    _publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    if (track.kind !== Track.Kind.Audio) return;
    this.detachRemoteAudio(track, participant.identity);
    this.emit();
  };

  private readonly onParticipantConnected = (participant: RemoteParticipant) => {
    this.ensureProximityState(participant.identity);
    this.applyVolumeToParticipant(participant.identity, 0);
    this.emit();
  };

  private readonly onParticipantDisconnected = (participant: RemoteParticipant) => {
    this.clearProximityState(participant.identity);
    this.emit();
  };

  private readonly onLocalTrackPublished = () => {
    this.emit();
  };

  private readonly onLocalTrackUnpublished = (
    publication: LocalTrackPublication,
    _participant: LocalParticipant,
  ) => {
    publication.track?.detach();
    this.emit();
  };

  private readonly onDisconnected = () => {
    if (this.status === 'switching' || this.status === 'disconnecting') {
      return;
    }
    this.clearAllProximityState();
    this.teardownActiveRoom({ clearAudioContainer: false });
    this.status = 'idle';
    this.participantIdentity = null;
    this.muted = false;
    this.needsAudioStart = false;
    this.desiredRoomName = null;
    this.emit();
  };

  private readonly onAudioPlaybackChanged = () => {
    if (!this.room) return;
    this.needsAudioStart = !this.room.canPlaybackAudio;
    this.emit();
  };

  subscribe(listener: VoiceSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): VoiceSessionSnapshot {
    return {
      status: this.status,
      roomName: this.roomName,
      participantIdentity: this.participantIdentity,
      participants: this.listParticipants(),
      muted: this.muted,
      needsAudioStart: this.needsAudioStart,
      errorMessage: this.errorMessage,
      voiceParticipantCount: this.room ? 1 + this.room.remoteParticipants.size : 0,
      proximityAudioEnabled: this.proximityAudioEnabled,
      nearestDistance: this.nearestDistance,
      nearestVolume: this.nearestVolume,
      staleParticipantCount: this.staleParticipantCount,
    };
  }

  async connect(options: ConnectOptions): Promise<void> {
    return this.enqueue(async (generation) => {
      if (this.room || this.status === 'connecting' || this.status === 'switching') {
        throw new Error('Already connected or connecting');
      }

      const participantName = options.participantName.trim();
      if (!participantName) {
        throw new Error('Display name is required');
      }

      const participantIdentity = options.participantIdentity.trim();
      if (!participantIdentity) {
        throw new Error('Participant identity is required');
      }

      const roomName = options.roomName.trim();
      if (!roomName) {
        throw new Error('Room name is required');
      }

      this.status = 'connecting';
      this.roomName = roomName;
      this.participantName = participantName;
      this.participantIdentity = participantIdentity;
      this.audioContainer = options.audioContainer;
      this.errorMessage = null;
      this.needsAudioStart = false;
      this.desiredRoomName = roomName;
      this.emit();

      try {
        await this.joinLiveKitRoom({
          roomName,
          participantName,
          participantIdentity,
          muted: false,
          generation,
        });
        if (generation !== this.generation) return;
        this.status = 'connected';
        this.emit();
      } catch (error) {
        if (generation !== this.generation) return;
        this.teardownActiveRoom({ clearAudioContainer: true });
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : 'Failed to connect';
        this.desiredRoomName = null;
        this.emit();
        throw error;
      }
    });
  }

  async switchRoom(options: SwitchRoomOptions): Promise<void> {
    const roomName = options.roomName.trim();
    if (!roomName) {
      throw new Error('Room name is required');
    }

    if (!this.participantName || !this.participantIdentity) {
      throw new Error('Not connected');
    }

    if (
      roomName === this.roomName &&
      (this.status === 'connected' || this.status === 'switching')
    ) {
      this.desiredRoomName = roomName;
      return;
    }

    this.desiredRoomName = roomName;
    if (this.switchLoopRunning) {
      return;
    }

    return this.enqueue(async (generation) => {
      this.switchLoopRunning = true;
      try {
        while (generation === this.generation) {
          const target = this.desiredRoomName;
          if (!target) {
            break;
          }
          if (target === this.roomName && this.status === 'connected' && this.room) {
            break;
          }

          await this.performSwitch(target, generation);

          if (generation !== this.generation) {
            break;
          }
          if (this.desiredRoomName === target) {
            break;
          }
        }
      } finally {
        this.switchLoopRunning = false;
      }
    });
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room || (this.status !== 'connected' && this.status !== 'switching')) {
      throw new Error('Not connected');
    }
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
    this.muted = muted;
    this.emit();
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.setMuted(!enabled);
  }

  async startAudio(): Promise<void> {
    if (!this.room) {
      throw new Error('Not connected');
    }
    await this.room.startAudio();
    this.needsAudioStart = !this.room.canPlaybackAudio;
    this.emit();
  }

  setProximityAudioEnabled(enabled: boolean): void {
    this.proximityAudioEnabled = enabled;
    if (!enabled) {
      for (const identity of this.collectProximityIdentities()) {
        this.targetVolumes.set(identity, 1);
      }
    } else {
      for (const [identity, distance] of this.lastDistances) {
        this.targetVolumes.set(identity, calculateProximityVolume(distance));
      }
      for (const identity of this.collectProximityIdentities()) {
        if (!this.lastDistances.has(identity)) {
          this.targetVolumes.set(identity, 0);
        }
      }
    }
    this.startVolumeSmoothing();
    this.refreshProximityDebug(true);
    this.emit();
  }

  setParticipantDistance(participantIdentity: string, distance: number): void {
    if (!participantIdentity) return;
    if (this.status !== 'connected' && this.status !== 'switching') return;
    // Only adjust volume for participants currently in this Voice Room.
    if (!this.room?.remoteParticipants.has(participantIdentity)) return;

    this.ensureProximityState(participantIdentity);
    this.lastDistanceAt.set(participantIdentity, Date.now());
    this.lastDistances.set(participantIdentity, distance);

    const target = this.proximityAudioEnabled ? calculateProximityVolume(distance) : 1;
    this.targetVolumes.set(participantIdentity, target);
    this.startVolumeSmoothing();
    this.refreshProximityDebug(false);
  }

  clearParticipantProximity(participantIdentity: string): void {
    this.clearProximityState(participantIdentity);
    this.refreshProximityDebug(true);
    this.emit();
  }

  async disconnect(): Promise<void> {
    this.desiredRoomName = null;
    this.generation += 1;
    const generation = this.generation;

    return this.enqueue(async () => {
      if (!this.room && this.status === 'idle') {
        return;
      }

      this.status = 'disconnecting';
      this.emit();

      try {
        await this.leaveCurrentRoom();
      } finally {
        if (generation !== this.generation) {
          return;
        }
        this.teardownActiveRoom({ clearAudioContainer: true });
        this.status = 'idle';
        this.roomName = '';
        this.participantIdentity = null;
        this.muted = false;
        this.needsAudioStart = false;
        this.errorMessage = null;
        this.clearAllProximityState();
        this.emit();
      }
    });
  }

  dispose(): void {
    this.desiredRoomName = null;
    this.generation += 1;
    this.clearAllProximityState();
    void this.disconnect();
    this.listeners.clear();
  }

  private enqueue(task: (generation: number) => Promise<void>): Promise<void> {
    const generation = this.generation;
    const run = this.operationChain.then(() => {
      if (generation !== this.generation) {
        throw new Error('Operation cancelled');
      }
      return task(generation);
    });
    this.operationChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async performSwitch(roomName: string, generation: number): Promise<void> {
    if (!this.audioContainer) {
      throw new Error('Audio container is missing');
    }
    if (!this.participantName || !this.participantIdentity) {
      throw new Error('Display name is missing');
    }

    if (roomName === this.roomName && this.room && this.status === 'connected') {
      return;
    }

    const previousRoomName = this.roomName;
    const previousMuted = this.muted;
    this.status = 'switching';
    this.roomName = roomName;
    this.errorMessage = null;
    this.clearAllProximityState();
    this.emit();

    try {
      const tokenPayload = await this.fetchToken(
        roomName,
        this.participantName,
        this.participantIdentity,
      );
      if (generation !== this.generation || this.desiredRoomName !== roomName) {
        if (this.room) {
          this.roomName = previousRoomName;
          this.status = 'connected';
          this.emit();
        }
        return;
      }

      await this.leaveCurrentRoom();
      if (generation !== this.generation || this.desiredRoomName !== roomName) {
        return;
      }

      await this.attachToRoom({
        tokenPayload,
        muted: previousMuted,
        roomName,
        generation,
      });

      if (generation !== this.generation) {
        return;
      }

      this.status = 'connected';
      this.emit();
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }

      if (this.room) {
        this.roomName = previousRoomName;
        this.status = 'connected';
        this.errorMessage =
          error instanceof Error ? error.message : 'Failed to switch voice room';
        this.emit();
        throw error;
      }

      this.teardownActiveRoom({ clearAudioContainer: false });
      this.status = 'error';
      // Keep participantIdentity so Presence + clothing stay tied to the same session.
      this.muted = false;
      this.needsAudioStart = false;
      this.errorMessage =
        error instanceof Error ? error.message : 'Failed to switch voice room';
      this.desiredRoomName = null;
      this.roomName = '';
      this.emit();
      throw error;
    }
  }

  private async joinLiveKitRoom(options: {
    roomName: string;
    participantName: string;
    participantIdentity: string;
    muted: boolean;
    generation: number;
  }): Promise<void> {
    const tokenPayload = await this.fetchToken(
      options.roomName,
      options.participantName,
      options.participantIdentity,
    );
    if (options.generation !== this.generation) {
      return;
    }
    await this.attachToRoom({
      tokenPayload,
      muted: options.muted,
      roomName: options.roomName,
      generation: options.generation,
    });
  }

  private async attachToRoom(options: {
    tokenPayload: TokenResponse;
    muted: boolean;
    roomName: string;
    generation: number;
  }): Promise<void> {
    if (!this.audioContainer) {
      throw new Error('Audio container is missing');
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    this.bindRoomEvents(room);

    try {
      await room.connect(options.tokenPayload.serverUrl, options.tokenPayload.participantToken);
      if (options.generation !== this.generation) {
        this.unbindRoomEvents(room);
        await room.disconnect();
        return;
      }

      await room.localParticipant.setMicrophoneEnabled(!options.muted);
      if (options.generation !== this.generation) {
        this.unbindRoomEvents(room);
        await room.disconnect();
        return;
      }

      this.room = room;
      this.roomName = options.roomName;
      this.participantIdentity = options.tokenPayload.participantIdentity;
      this.muted = options.muted;
      this.needsAudioStart = !room.canPlaybackAudio;
      this.startVolumeSmoothing();
    } catch (error) {
      this.unbindRoomEvents(room);
      try {
        await room.disconnect();
      } catch {
        // ignore cleanup errors
      }
      throw error;
    }
  }

  private async leaveCurrentRoom(): Promise<void> {
    this.clearAllProximityState();

    const room = this.room;
    this.room = null;
    this.clearAttachedAudio();

    if (!room) {
      return;
    }

    this.unbindRoomEvents(room);
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch {
      // mic may already be unavailable while tearing down
    }
    try {
      await room.disconnect();
    } catch {
      // ignore disconnect errors during teardown
    }
  }

  private async fetchToken(
    roomName: string,
    participantName: string,
    participantIdentity: string,
  ): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await fetch('/api/livekit/voice-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomName, participantName, participantIdentity }),
      });
    } catch (error) {
      throw classifiedConnectionError(classifyFetchNetworkError(error, 'voice-token'));
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw classifiedConnectionError(
        classifyHttpApiFailure(response.status, payload, 'voice-token'),
      );
    }

    if (!isTokenResponse(payload) || !payload.participantToken || !payload.serverUrl) {
      throw classifiedConnectionError('Voiceトークンの応答が不完全です');
    }

    return payload;
  }

  private bindRoomEvents(room: Room): void {
    room
      .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
      .on(RoomEvent.ParticipantConnected, this.onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
      .on(RoomEvent.LocalTrackPublished, this.onLocalTrackPublished)
      .on(RoomEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
      .on(RoomEvent.Disconnected, this.onDisconnected)
      .on(RoomEvent.AudioPlaybackStatusChanged, this.onAudioPlaybackChanged);
  }

  private unbindRoomEvents(room: Room): void {
    room
      .off(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
      .off(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
      .off(RoomEvent.ParticipantConnected, this.onParticipantConnected)
      .off(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
      .off(RoomEvent.LocalTrackPublished, this.onLocalTrackPublished)
      .off(RoomEvent.LocalTrackUnpublished, this.onLocalTrackUnpublished)
      .off(RoomEvent.Disconnected, this.onDisconnected)
      .off(RoomEvent.AudioPlaybackStatusChanged, this.onAudioPlaybackChanged);
  }

  private attachRemoteAudio(track: RemoteTrack, participantIdentity: string): void {
    if (!this.audioContainer) return;

    const element = track.attach();
    element.dataset.participantIdentity = participantIdentity;
    element.autoplay = true;
    element.setAttribute('playsinline', 'true');
    this.audioContainer.appendChild(element);

    const existing = this.attachedElements.get(participantIdentity) ?? [];
    existing.push(element);
    this.attachedElements.set(participantIdentity, existing);
  }

  private detachRemoteAudio(track: RemoteTrack, participantIdentity: string): void {
    const detached = track.detach();
    for (const element of detached) {
      element.remove();
    }

    const remaining = (this.attachedElements.get(participantIdentity) ?? []).filter(
      (element) => !detached.includes(element),
    );
    if (remaining.length === 0) {
      this.attachedElements.delete(participantIdentity);
    } else {
      this.attachedElements.set(participantIdentity, remaining);
    }
  }

  private clearAttachedAudio(): void {
    for (const elements of this.attachedElements.values()) {
      for (const element of elements) {
        element.remove();
      }
    }
    this.attachedElements.clear();

    if (this.audioContainer) {
      this.audioContainer.replaceChildren();
    }
  }

  private teardownActiveRoom(options: { clearAudioContainer: boolean }): void {
    this.stopVolumeSmoothing();
    const room = this.room;
    this.room = null;
    if (room) {
      this.unbindRoomEvents(room);
    }
    this.clearAttachedAudio();
    if (options.clearAudioContainer) {
      this.audioContainer = null;
    }
  }

  private ensureProximityState(identity: string): void {
    if (!this.targetVolumes.has(identity)) {
      this.targetVolumes.set(identity, this.proximityAudioEnabled ? 0 : 1);
    }
    if (!this.currentVolumes.has(identity)) {
      this.currentVolumes.set(identity, this.proximityAudioEnabled ? 0 : 1);
    }
  }

  private clearProximityState(identity: string): void {
    this.applyVolumeToParticipant(identity, 0);
    this.targetVolumes.delete(identity);
    this.currentVolumes.delete(identity);
    this.lastDistanceAt.delete(identity);
    this.lastDistances.delete(identity);
  }

  private clearAllProximityState(): void {
    for (const identity of this.collectProximityIdentities()) {
      this.applyVolumeToParticipant(identity, 0);
    }
    this.targetVolumes.clear();
    this.currentVolumes.clear();
    this.lastDistanceAt.clear();
    this.lastDistances.clear();
    this.nearestDistance = null;
    this.nearestVolume = null;
    this.staleParticipantCount = 0;
    this.stopVolumeSmoothing();
  }

  private collectProximityIdentities(): string[] {
    return [...new Set([...this.targetVolumes.keys(), ...this.currentVolumes.keys()])];
  }

  private startVolumeSmoothing(): void {
    if (this.volumeSmoothingTimer !== null) return;
    this.volumeSmoothingTimer = setInterval(() => {
      this.tickVolumeSmoothing();
    }, VOLUME_SMOOTHING_INTERVAL_MS);
  }

  private stopVolumeSmoothing(): void {
    if (this.volumeSmoothingTimer !== null) {
      clearInterval(this.volumeSmoothingTimer);
      this.volumeSmoothingTimer = null;
    }
  }

  private tickVolumeSmoothing(): void {
    if (!this.room || (this.status !== 'connected' && this.status !== 'switching')) {
      return;
    }

    const now = Date.now();
    let changed = false;

    for (const identity of this.collectProximityIdentities()) {
      const lastAt = this.lastDistanceAt.get(identity);
      if (
        this.proximityAudioEnabled &&
        lastAt !== undefined &&
        now - lastAt >= POSITION_AUDIO_STALE_MS
      ) {
        this.targetVolumes.set(identity, 0);
      }

      const target = this.targetVolumes.get(identity) ?? 0;
      const current = this.currentVolumes.get(identity) ?? 0;
      const delta = target - current;

      let next = current;
      if (Math.abs(delta) <= VOLUME_EPSILON) {
        next = target;
      } else {
        next = clamp01(current + delta * VOLUME_SMOOTHING_FACTOR);
      }

      if (Math.abs(next - current) > 1e-6) {
        this.currentVolumes.set(identity, next);
        this.applyVolumeToParticipant(identity, next);
        changed = true;
      }
    }

    this.refreshProximityDebug(false);
    if (changed) {
      // Avoid React spam: debug emit already throttled; participant lists unchanged.
    }
  }

  private applyVolumeToParticipant(identity: string, volume: number): void {
    const room = this.room;
    if (!room) return;
    if (this.status !== 'connected' && this.status !== 'switching') return;

    const participant = room.remoteParticipants.get(identity);
    if (!participant) return;

    try {
      participant.setVolume(clamp01(volume), Track.Source.Microphone);
    } catch {
      // Participant may already be gone during teardown.
    }
  }

  private refreshProximityDebug(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProximityDebugEmitAt < PROXIMITY_DEBUG_UI_INTERVAL_MS) {
      return;
    }
    this.lastProximityDebugEmitAt = now;

    let nearestDistance: number | null = null;
    let nearestVolume: number | null = null;
    let stale = 0;

    for (const [identity, distance] of this.lastDistances) {
      const lastAt = this.lastDistanceAt.get(identity) ?? 0;
      if (now - lastAt >= POSITION_AUDIO_STALE_MS) {
        stale += 1;
      }
      if (nearestDistance === null || distance < nearestDistance) {
        nearestDistance = distance;
        nearestVolume = this.currentVolumes.get(identity) ?? null;
      }
    }

    const changed =
      this.nearestDistance !== nearestDistance ||
      this.nearestVolume !== nearestVolume ||
      this.staleParticipantCount !== stale;

    this.nearestDistance = nearestDistance;
    this.nearestVolume = nearestVolume;
    this.staleParticipantCount = stale;

    if (changed || force) {
      this.emit();
    }
  }

  private listParticipants(): ParticipantSummary[] {
    if (!this.room) return [];

    const local = this.room.localParticipant;
    const remote = Array.from(this.room.remoteParticipants.values());

    return [local, ...remote].map((participant: Participant) => ({
      identity: participant.identity,
      name: participant.name || participant.identity,
      isLocal: participant === local,
    }));
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
