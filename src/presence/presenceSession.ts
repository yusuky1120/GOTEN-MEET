import {
  Room,
  RoomEvent,
  type RemoteParticipant,
  type Participant,
} from 'livekit-client';
import {
  dispatchRemotePlayerPosition,
  dispatchRemotePlayerRemove,
  dispatchRemotePlayersClear,
} from '../game/gamePositionEvents';
import {
  PLAYER_PRESENCE_TOPIC,
  PRESENCE_ROOM_NAME,
} from './presenceConstants';
import {
  decodePlayerPresencePayload,
  encodePlayerPresenceMessage,
} from '../realtime/playerPresenceCodec';
import {
  POSITION_PUBLISH_ERROR_LOG_COOLDOWN_MS,
  REMOTE_PLAYER_TIMEOUT_MS,
  SNAPSHOT_MIN_INTERVAL_MS,
} from '../realtime/playerPositionConstants';
import type { LocalPresenceState, PresenceSessionSnapshot } from './presenceTypes';

export type PresenceSessionListener = (snapshot: PresenceSessionSnapshot) => void;

function toPublishableBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

export class PresenceSession {
  private room: Room | null = null;
  private listeners = new Set<PresenceSessionListener>();
  private status: PresenceSessionSnapshot['status'] = 'disconnected';
  private participantIdentity: string | null = null;
  private participantName = '';
  private serverUrl = '';
  private errorMessage: string | null = null;
  private positionSyncStatus: PresenceSessionSnapshot['positionSyncStatus'] = 'idle';
  private generation = 0;
  private sequence = 0;
  private lastState: LocalPresenceState | null = null;
  private lastAcceptedSequence = new Map<string, number>();
  private lastRemotePacketAt = new Map<string, number>();
  private knownRemotes = new Set<string>();
  private lastSnapshotSentAt = new Map<string, number>();
  private lastPublishErrorLogAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  private readonly onParticipantConnected = (participant: RemoteParticipant) => {
    this.emit();
    void this.publishSnapshot([participant.identity]);
  };

  private readonly onParticipantDisconnected = (participant: RemoteParticipant) => {
    this.forgetRemote(participant.identity);
    this.emit();
  };

  private readonly onDisconnected = () => {
    this.clearRemotes();
    this.teardownRoom();
    this.status = 'disconnected';
    this.positionSyncStatus = 'idle';
    this.emit();
  };

  private readonly onDataReceived = (
    payload: Uint8Array,
    participant?: RemoteParticipant,
    _kind?: unknown,
    topic?: string,
  ) => {
    if (!participant) return;
    if (this.status !== 'connected') return;

    const message = decodePlayerPresencePayload(payload, topic);
    if (!message) return;

    const previous = this.lastAcceptedSequence.get(participant.identity);
    if (previous !== undefined && message.sequence <= previous) {
      return;
    }
    this.lastAcceptedSequence.set(participant.identity, message.sequence);
    this.lastRemotePacketAt.set(participant.identity, Date.now());

    const wasKnown = this.knownRemotes.has(participant.identity);
    this.knownRemotes.add(participant.identity);

    dispatchRemotePlayerPosition({
      participantIdentity: participant.identity,
      participantName: participant.name || participant.identity,
      x: message.x,
      y: message.y,
      direction: message.direction,
      moving: message.moving,
      sequence: message.sequence,
      sentAt: message.sentAt,
      mapRoomName: message.mapRoomName,
      voiceRoomName: message.voiceRoomName,
    });

    if (!wasKnown) {
      this.emit();
    }
  };

  subscribe(listener: PresenceSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PresenceSessionSnapshot {
    return {
      status: this.status,
      participantIdentity: this.participantIdentity,
      onlineCount: this.countOnline(),
      positionSyncStatus: this.positionSyncStatus,
      errorMessage: this.errorMessage,
    };
  }

  getIdentity(): string | null {
    return this.participantIdentity;
  }

  async connect(options: {
    serverUrl: string;
    presenceToken: string;
    participantIdentity: string;
    participantName: string;
  }): Promise<void> {
    if (this.room || this.status === 'connecting' || this.status === 'connected') {
      throw new Error('Presence already connected or connecting');
    }

    this.status = 'connecting';
    this.errorMessage = null;
    this.participantIdentity = options.participantIdentity;
    this.participantName = options.participantName;
    this.serverUrl = options.serverUrl;
    this.emit();

    const generation = ++this.generation;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.bind(room);

    try {
      await room.connect(options.serverUrl, options.presenceToken);
      if (generation !== this.generation) {
        this.unbind(room);
        await room.disconnect();
        return;
      }
      this.room = room;
      this.status = 'connected';
      this.positionSyncStatus = 'syncing';
      this.startWatchdog();
      this.emit();
      void this.publishSnapshot();
    } catch (error) {
      this.unbind(room);
      try {
        await room.disconnect();
      } catch {
        // ignore
      }
      this.status = 'error';
      this.positionSyncStatus = 'error';
      this.errorMessage = error instanceof Error ? error.message : 'Presence connect failed';
      this.emit();
      throw error;
    }
  }

  async publishPresence(state: LocalPresenceState): Promise<void> {
    this.lastState = state;
    if (!this.room || this.status !== 'connected') return;

    const generation = this.generation;
    this.sequence += 1;
    const payload = toPublishableBytes(
      encodePlayerPresenceMessage(state, {
        sequence: this.sequence,
        sentAt: Date.now(),
      }),
    );

    try {
      await this.room.localParticipant.publishData(payload, {
        reliable: false,
        topic: PLAYER_PRESENCE_TOPIC,
      });
      if (generation !== this.generation) return;
    } catch {
      this.logPublishErrorOnce();
    }
  }

  async notifyRoomChange(partial: {
    mapRoomName?: string | null;
    voiceRoomName?: string | null;
  }): Promise<void> {
    if (!this.lastState) return;
    const next: LocalPresenceState = {
      ...this.lastState,
      mapRoomName:
        partial.mapRoomName !== undefined ? partial.mapRoomName : this.lastState.mapRoomName,
      voiceRoomName:
        partial.voiceRoomName !== undefined ? partial.voiceRoomName : this.lastState.voiceRoomName,
    };
    this.lastState = next;
    await this.publishSnapshot();
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    this.clearRemotes();
    const room = this.room;
    this.room = null;
    this.stopWatchdog();
    if (room) {
      this.unbind(room);
      try {
        await room.disconnect();
      } catch {
        // ignore
      }
    }
    this.status = 'disconnected';
    this.participantIdentity = null;
    this.positionSyncStatus = 'idle';
    this.errorMessage = null;
    this.sequence = 0;
    this.lastAcceptedSequence.clear();
    this.lastSnapshotSentAt.clear();
    this.emit();
  }

  dispose(): void {
    void this.disconnect();
    this.listeners.clear();
  }

  private async publishSnapshot(destinationIdentities?: string[]): Promise<void> {
    if (!this.room || this.status !== 'connected' || !this.lastState) return;

    const now = Date.now();
    if (destinationIdentities?.length === 1) {
      const identity = destinationIdentities[0]!;
      const last = this.lastSnapshotSentAt.get(identity) ?? 0;
      if (now - last < SNAPSHOT_MIN_INTERVAL_MS) return;
      this.lastSnapshotSentAt.set(identity, now);
    }

    const generation = this.generation;
    this.sequence += 1;
    const payload = toPublishableBytes(
      encodePlayerPresenceMessage(this.lastState, {
        sequence: this.sequence,
        sentAt: now,
      }),
    );

    try {
      await this.room.localParticipant.publishData(payload, {
        reliable: true,
        topic: PLAYER_PRESENCE_TOPIC,
        destinationIdentities,
      });
      if (generation !== this.generation) return;
    } catch {
      this.logPublishErrorOnce();
    }
  }

  private forgetRemote(identity: string): void {
    this.lastAcceptedSequence.delete(identity);
    this.lastRemotePacketAt.delete(identity);
    this.lastSnapshotSentAt.delete(identity);
    if (this.knownRemotes.delete(identity)) {
      dispatchRemotePlayerRemove(identity);
      this.emit();
    } else {
      dispatchRemotePlayerRemove(identity);
    }
  }

  private clearRemotes(): void {
    this.knownRemotes.clear();
    this.lastAcceptedSequence.clear();
    this.lastRemotePacketAt.clear();
    this.lastSnapshotSentAt.clear();
    dispatchRemotePlayersClear();
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      if (!this.room || this.status !== 'connected') return;
      const now = Date.now();
      for (const identity of [...this.knownRemotes]) {
        const stillInRoom = this.room.remoteParticipants.has(identity);
        const last = this.lastRemotePacketAt.get(identity) ?? 0;
        if (!stillInRoom || now - last >= REMOTE_PLAYER_TIMEOUT_MS) {
          this.forgetRemote(identity);
        }
      }
    }, 2_000);
  }

  private stopWatchdog(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  private bind(room: Room): void {
    room
      .on(RoomEvent.ParticipantConnected, this.onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
      .on(RoomEvent.Disconnected, this.onDisconnected)
      .on(RoomEvent.DataReceived, this.onDataReceived);
  }

  private unbind(room: Room): void {
    room
      .off(RoomEvent.ParticipantConnected, this.onParticipantConnected)
      .off(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
      .off(RoomEvent.Disconnected, this.onDisconnected)
      .off(RoomEvent.DataReceived, this.onDataReceived);
  }

  private teardownRoom(): void {
    this.stopWatchdog();
    const room = this.room;
    this.room = null;
    if (room) this.unbind(room);
  }

  private countOnline(): number {
    if (!this.room) return 0;
    return 1 + this.room.remoteParticipants.size;
  }

  private logPublishErrorOnce(): void {
    const now = Date.now();
    if (now - this.lastPublishErrorLogAt < POSITION_PUBLISH_ERROR_LOG_COOLDOWN_MS) return;
    this.lastPublishErrorLogAt = now;
    console.warn('[presence] publish failed');
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export { PRESENCE_ROOM_NAME };
