import {
  Room,
  RoomEvent,
  type RemoteParticipant,
  type TextStreamHandler,
} from 'livekit-client';
import {
  dispatchRemotePlayerPosition,
  dispatchRemotePlayerRemove,
  dispatchRemotePlayersClear,
} from '../game/gamePositionEvents';
import { HOUSE_CHAT_TOPIC, HOUSE_CHAT_VERSION } from '../chat/chatConstants';
import { readBoundedHouseChatText } from '../chat/chatStream';
import type { IncomingHouseChatPayload } from '../chat/chatTypes';
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
  SNAPSHOT_MIN_INTERVAL_MS,
} from '../realtime/playerPositionConstants';
import type { LocalPresenceState, PresenceSessionSnapshot } from './presenceTypes';

export type PresenceSessionListener = (snapshot: PresenceSessionSnapshot) => void;
export type PresenceChatListener = (payload: IncomingHouseChatPayload) => void;

function toPublishableBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

export class PresenceSession {
  private room: Room | null = null;
  private listeners = new Set<PresenceSessionListener>();
  private chatListeners = new Set<PresenceChatListener>();
  private textStreamRoom: Room | null = null;
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
    if (!participant || this.status !== 'connected') return;
    const message = decodePlayerPresencePayload(payload, topic);
    if (!message) return;

    const previous = this.lastAcceptedSequence.get(participant.identity);
    if (previous !== undefined && message.sequence <= previous) return;
    this.lastAcceptedSequence.set(participant.identity, message.sequence);

    const wasKnown = this.knownRemotes.has(participant.identity);
    this.knownRemotes.add(participant.identity);
    dispatchRemotePlayerPosition({
      participantIdentity: participant.identity,
      participantName: participant.name || participant.identity,
      avatarModel: message.avatarModel,
      x: message.x,
      y: message.y,
      direction: message.direction,
      moving: message.moving,
      sequence: message.sequence,
      sentAt: message.sentAt,
      mapRoomName: message.mapRoomName,
      voiceRoomName: message.voiceRoomName,
    });
    if (!wasKnown) this.emit();
  };

  private readonly onTextStream: TextStreamHandler = (reader, participantInfo) => {
    const generation = this.generation;
    void (async () => {
      try {
        const text = await readBoundedHouseChatText(reader);
        if (text === null || generation !== this.generation) return;
        if (!this.room || this.status !== 'connected') return;
        const identity = participantInfo.identity?.trim() ?? '';
        if (!identity) return;
        const payload: IncomingHouseChatPayload = {
          id: reader.info.id,
          participantIdentity: identity,
          participantName: this.resolveParticipantName(identity),
          text,
          sentAt: reader.info.timestamp,
          attributes: reader.info.attributes,
        };
        for (const listener of this.chatListeners) listener(payload);
      } catch {
        // Ignore malformed chat streams; do not affect presence connection.
      }
    })();
  };

  subscribe(listener: PresenceSessionListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeChat(listener: PresenceChatListener): () => void {
    this.chatListeners.add(listener);
    return () => this.chatListeners.delete(listener);
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
        this.unregisterTextStream(room);
        this.unbind(room);
        await room.disconnect();
        return;
      }
      this.room = room;
      this.registerTextStream(room);
      this.status = 'connected';
      this.positionSyncStatus = 'syncing';
      this.startWatchdog();
      this.emit();
      void this.publishSnapshot();
    } catch (error) {
      this.unregisterTextStream(room);
      this.unbind(room);
      try { await room.disconnect(); } catch { /* ignore */ }
      this.status = 'error';
      this.positionSyncStatus = 'error';
      this.errorMessage = error instanceof Error ? error.message : 'Presence connect failed';
      this.emit();
      throw error;
    }
  }

  async sendChatText(text: string): Promise<{ id: string; sentAt: number }> {
    if (!this.room || this.status !== 'connected') {
      throw new Error('Presence未接続のため送信できません。');
    }
    const generation = this.generation;
    const info = await this.room.localParticipant.sendText(text, {
      topic: HOUSE_CHAT_TOPIC,
      attributes: { version: HOUSE_CHAT_VERSION },
    });
    if (generation !== this.generation) throw new Error('Operation cancelled');
    return { id: info.id, sentAt: info.timestamp };
  }

  async publishPresence(state: LocalPresenceState): Promise<void> {
    this.lastState = state;
    if (!this.room || this.status !== 'connected') return;
    const generation = this.generation;
    this.sequence += 1;
    const payload = toPublishableBytes(
      encodePlayerPresenceMessage(state, { sequence: this.sequence, sentAt: Date.now() }),
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
    this.lastState = {
      ...this.lastState,
      mapRoomName: partial.mapRoomName !== undefined ? partial.mapRoomName : this.lastState.mapRoomName,
      voiceRoomName: partial.voiceRoomName !== undefined ? partial.voiceRoomName : this.lastState.voiceRoomName,
    };
    await this.publishSnapshot();
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    this.clearRemotes();
    const room = this.room;
    this.room = null;
    this.stopWatchdog();
    if (room) {
      this.unregisterTextStream(room);
      this.unbind(room);
      try { await room.disconnect(); } catch { /* ignore */ }
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
    this.chatListeners.clear();
  }

  private bind(room: Room): void {
    room.on(RoomEvent.ParticipantConnected, this.onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected);
    room.on(RoomEvent.Disconnected, this.onDisconnected);
    room.on(RoomEvent.DataReceived, this.onDataReceived);
  }

  private unbind(room: Room): void {
    room.off(RoomEvent.ParticipantConnected, this.onParticipantConnected);
    room.off(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected);
    room.off(RoomEvent.Disconnected, this.onDisconnected);
    room.off(RoomEvent.DataReceived, this.onDataReceived);
  }

  private registerTextStream(room: Room): void {
    if (this.textStreamRoom === room) return;
    room.registerTextStreamHandler(HOUSE_CHAT_TOPIC, this.onTextStream);
    this.textStreamRoom = room;
  }

  private unregisterTextStream(room: Room): void {
    if (this.textStreamRoom !== room) return;
    room.unregisterTextStreamHandler(HOUSE_CHAT_TOPIC);
    this.textStreamRoom = null;
  }

  private resolveParticipantName(identity: string): string {
    if (identity === this.participantIdentity) return this.participantName || identity;
    return this.room?.remoteParticipants.get(identity)?.name || identity;
  }

  private async publishSnapshot(targetIdentities?: string[]): Promise<void> {
    if (!this.lastState || !this.room || this.status !== 'connected') return;
    const now = Date.now();
    const targets = targetIdentities ?? [...this.room.remoteParticipants.keys()];
    const eligible = targets.filter((identity) => {
      const last = this.lastSnapshotSentAt.get(identity) ?? 0;
      if (now - last < SNAPSHOT_MIN_INTERVAL_MS) return false;
      this.lastSnapshotSentAt.set(identity, now);
      return true;
    });
    if (targetIdentities && eligible.length === 0) return;
    await this.publishPresence(this.lastState);
    this.positionSyncStatus = 'syncing';
    this.emit();
  }

  /** Presence membership, not packet age, owns remote-player lifetime. */
  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      if (!this.room || this.status !== 'connected') return;
      for (const identity of [...this.knownRemotes]) {
        if (!this.room.remoteParticipants.has(identity)) {
          this.forgetRemote(identity);
        }
      }
      void this.publishSnapshot();
    }, 5_000);
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private forgetRemote(identity: string): void {
    this.knownRemotes.delete(identity);
    this.lastAcceptedSequence.delete(identity);
    this.lastSnapshotSentAt.delete(identity);
    dispatchRemotePlayerRemove(identity);
  }

  private clearRemotes(): void {
    this.knownRemotes.clear();
    this.lastAcceptedSequence.clear();
    dispatchRemotePlayersClear();
  }

  private countOnline(): number {
    if (!this.room || this.status !== 'connected') return 0;
    return 1 + this.room.remoteParticipants.size;
  }

  private teardownRoom(): void {
    if (!this.room) return;
    this.unregisterTextStream(this.room);
    this.unbind(this.room);
    this.room = null;
    this.stopWatchdog();
  }

  private logPublishErrorOnce(): void {
    const now = Date.now();
    if (now - this.lastPublishErrorLogAt < POSITION_PUBLISH_ERROR_LOG_COOLDOWN_MS) return;
    this.lastPublishErrorLogAt = now;
    console.warn('[presence] position publish failed');
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
