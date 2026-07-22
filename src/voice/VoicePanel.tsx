import { useEffect, useRef, useState, type FormEvent } from 'react';
import HouseChatPanel from '../chat/HouseChatPanel';
import type { HouseChatMessage } from '../chat/chatTypes';
import {
  appendChatMessage,
  isValidIncomingChatPayload,
  normalizeChatSentAt,
  sanitizeChatDisplayName,
  validateOutgoingChatText,
} from '../chat/chatValidation';
import {
  dispatchLocalPlayerClothing,
  LOCAL_PLAYER_POSITION_EVENT,
  REMOTE_PLAYER_REMOVE_EVENT,
  type LocalPlayerPositionDetail,
  type RemotePlayerRemoveDetail,
} from '../game/gamePositionEvents';
import { getPlayerClothingVariant } from '../game/playerClothing';
import {
  REMOTE_PLAYER_DISTANCE_EVENT,
  type RemotePlayerDistanceDetail,
} from '../game/playerDistanceEvents';
import { PresenceSession } from '../presence/presenceSession';
import type { PresenceSessionSnapshot } from '../presence/presenceTypes';
import {
  classifiedConnectionError,
  classifyConnectError,
  classifyFetchNetworkError,
  classifyHttpApiFailure,
  NO_MAPPED_ROOM_MESSAGE,
  userFacingConnectionMessage,
} from '../realtime/connectionErrors';
import { toPresenceState } from '../realtime/playerPresenceCodec';
import { toLiveKitRoomName } from './roomMapping';
import type { VoiceSessionSnapshot } from './types';
import { VoiceSession } from './voiceSession';

type SessionResponse = {
  serverUrl: string;
  participantIdentity: string;
  presenceToken: string;
  presenceRoomName?: string;
};

const INITIAL_PRESENCE: PresenceSessionSnapshot = {
  status: 'disconnected',
  participantIdentity: null,
  onlineCount: 0,
  positionSyncStatus: 'idle',
  errorMessage: null,
};

const INITIAL_VOICE: VoiceSessionSnapshot = {
  status: 'idle',
  roomName: '',
  participantIdentity: null,
  participants: [],
  muted: false,
  needsAudioStart: false,
  errorMessage: null,
  voiceParticipantCount: 0,
  proximityAudioEnabled: true,
  nearestDistance: null,
  nearestVolume: null,
  staleParticipantCount: 0,
};

function isSessionResponse(value: unknown): value is SessionResponse {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.serverUrl === 'string' &&
    typeof record.participantIdentity === 'string' &&
    typeof record.presenceToken === 'string'
  );
}

export type VoicePanelProps = {
  currentMapRoom: string;
};

export default function VoicePanel({ currentMapRoom }: VoicePanelProps) {
  const presenceRef = useRef<PresenceSession | null>(null);
  const voiceRef = useRef<VoiceSession | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const sessionIdentityRef = useRef<string | null>(null);
  const lastMapRoomRef = useRef<string | null>(null);
  const lastVoiceRoomRef = useRef<string | null>(null);
  const lastLocalPositionRef = useRef<LocalPlayerPositionDetail | null>(null);
  const chatSeenIdsRef = useRef(new Set<string>());
  const chatSendInFlightRef = useRef(false);
  const wasPresenceConnectedRef = useRef(false);

  const [participantName, setParticipantName] = useState('');
  const [syncWithMap, setSyncWithMap] = useState(true);
  const [manualRoomName, setManualRoomName] = useState('living-room');
  const [presence, setPresence] = useState<PresenceSessionSnapshot>(INITIAL_PRESENCE);
  const [voice, setVoice] = useState<VoiceSessionSnapshot>(INITIAL_VOICE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [chatMessages, setChatMessages] = useState<HouseChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const mappedLiveKitRoom = toLiveKitRoomName(currentMapRoom);
  const effectiveRoomName = syncWithMap ? (mappedLiveKitRoom ?? '') : manualRoomName;

  function enqueueChatMessage(message: HouseChatMessage): void {
    const seenIds = chatSeenIdsRef.current;
    if (seenIds.has(message.id)) return;
    seenIds.add(message.id);
    setChatMessages((previous) => appendChatMessage(previous, message));
  }

  useEffect(() => {
    mountedRef.current = true;
    const presenceSession = new PresenceSession();
    const voiceSession = new VoiceSession();
    presenceRef.current = presenceSession;
    voiceRef.current = voiceSession;

    const unsubPresence = presenceSession.subscribe((next) => {
      if (mountedRef.current) setPresence(next);
    });
    const unsubVoice = voiceSession.subscribe((next) => {
      if (mountedRef.current) setVoice(next);
    });
    const unsubChat = presenceSession.subscribeChat((payload) => {
      if (!mountedRef.current) return;
      if (!isValidIncomingChatPayload(payload)) return;
      const validated = validateOutgoingChatText(payload.text);
      if (!validated.ok) return;

      const localIdentity = presenceSession.getIdentity();
      const message: HouseChatMessage = {
        id: payload.id,
        participantIdentity: payload.participantIdentity,
        participantName: sanitizeChatDisplayName(
          payload.participantName,
          payload.participantIdentity,
        ),
        text: validated.text,
        sentAt: normalizeChatSentAt(payload.sentAt),
        own: Boolean(localIdentity && payload.participantIdentity === localIdentity),
      };

      // Dedup + seenIds update happen outside the React state updater.
      enqueueChatMessage(message);
    });

    const onLocalPosition = (event: Event) => {
      const detail = (event as CustomEvent<LocalPlayerPositionDetail>).detail;
      lastLocalPositionRef.current = detail;
      const presenceSessionInner = presenceRef.current;
      const voiceSessionInner = voiceRef.current;
      if (!presenceSessionInner || presenceSessionInner.getSnapshot().status !== 'connected') {
        return;
      }
      const voiceSnap = voiceSessionInner?.getSnapshot();
      const voiceRoomName =
        voiceSnap && (voiceSnap.status === 'connected' || voiceSnap.status === 'switching')
          ? voiceSnap.roomName || null
          : null;
      const mapRoomName = lastMapRoomRef.current;
      void presenceSessionInner.publishPresence(
        toPresenceState(detail, mapRoomName, voiceRoomName),
      );
    };

    const onDistance = (event: Event) => {
      const detail = (event as CustomEvent<RemotePlayerDistanceDetail>).detail;
      const voiceSessionInner = voiceRef.current;
      if (!voiceSessionInner) return;
      const currentVoiceRoom = voiceSessionInner.getSnapshot().roomName;
      if (!detail.voiceRoomName || detail.voiceRoomName !== currentVoiceRoom) {
        return;
      }
      voiceSessionInner.setParticipantDistance(detail.participantIdentity, detail.distance);
    };

    const onRemoteRemove = (event: Event) => {
      const detail = (event as CustomEvent<RemotePlayerRemoveDetail>).detail;
      voiceRef.current?.clearParticipantProximity(detail.participantIdentity);
    };

    window.addEventListener(LOCAL_PLAYER_POSITION_EVENT, onLocalPosition);
    window.addEventListener(REMOTE_PLAYER_DISTANCE_EVENT, onDistance);
    window.addEventListener(REMOTE_PLAYER_REMOVE_EVENT, onRemoteRemove);

    return () => {
      mountedRef.current = false;
      window.removeEventListener(LOCAL_PLAYER_POSITION_EVENT, onLocalPosition);
      window.removeEventListener(REMOTE_PLAYER_DISTANCE_EVENT, onDistance);
      window.removeEventListener(REMOTE_PLAYER_REMOVE_EVENT, onRemoteRemove);
      unsubPresence();
      unsubVoice();
      unsubChat();
      presenceSession.dispose();
      voiceSession.dispose();
      presenceRef.current = null;
      voiceRef.current = null;
      sessionIdentityRef.current = null;
      chatSeenIdsRef.current.clear();
      dispatchLocalPlayerClothing({ clothingVariant: 0 });
    };
  }, []);

  // Clear realtime-only chat history when Presence disconnects.
  useEffect(() => {
    const connected = presence.status === 'connected';
    if (wasPresenceConnectedRef.current && !connected) {
      chatSeenIdsRef.current.clear();
      chatSendInFlightRef.current = false;
      setChatMessages([]);
      setChatSending(false);
      setChatError(null);
    }
    wasPresenceConnectedRef.current = connected;
  }, [presence.status]);

  // Keep mapRoomName on presence when the local map room changes.
  useEffect(() => {
    const mapRoom = currentMapRoom || null;
    if (mapRoom === lastMapRoomRef.current) return;
    lastMapRoomRef.current = mapRoom;

    const presenceSession = presenceRef.current;
    if (!presenceSession || presenceSession.getSnapshot().status !== 'connected') return;
    void presenceSession.notifyRoomChange({ mapRoomName: mapRoom });
  }, [currentMapRoom]);

  // Voice room follows map (or stays on manual room until reconnect).
  useEffect(() => {
    if (!syncWithMap) return;
    if (presence.status !== 'connected') return;
    if (voice.status !== 'connected' && voice.status !== 'switching') {
      return;
    }
    if (!mappedLiveKitRoom) {
      if (mountedRef.current) setLocalError(NO_MAPPED_ROOM_MESSAGE);
      return;
    }
    if (mappedLiveKitRoom === voice.roomName && voice.status === 'connected') {
      return;
    }

    let cancelled = false;
    const voiceSession = voiceRef.current;
    const presenceSession = presenceRef.current;
    if (!voiceSession || !presenceSession) return;

    void (async () => {
      try {
        if (mountedRef.current) setLocalError(null);
        await voiceSession.switchRoom({ roomName: mappedLiveKitRoom });
        if (cancelled || !mountedRef.current) return;
        lastVoiceRoomRef.current = mappedLiveKitRoom;
        await presenceSession.notifyRoomChange({
          mapRoomName: lastMapRoomRef.current,
          voiceRoomName: mappedLiveKitRoom,
        });
      } catch (error) {
        if (cancelled || !mountedRef.current) return;
        if (error instanceof Error && error.message === 'Operation cancelled') return;
        lastVoiceRoomRef.current = null;
        await presenceSession.notifyRoomChange({ voiceRoomName: null });
        setLocalError(userFacingConnectionMessage(error, 'voice-switch'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentMapRoom,
    syncWithMap,
    mappedLiveKitRoom,
    presence.status,
    voice.status,
    voice.roomName,
  ]);

  const presenceConnected = presence.status === 'connected';
  const voiceBusy =
    voice.status === 'connecting' ||
    voice.status === 'disconnecting' ||
    voice.status === 'switching' ||
    connecting;
  const voiceConnected = voice.status === 'connected';
  const canConnect =
    !voiceBusy &&
    !presenceConnected &&
    !connecting &&
    participantName.trim().length > 0;
  const errorMessage = localError || presence.errorMessage || voice.errorMessage;

  async function handleConnect(event: FormEvent) {
    event.preventDefault();
    if (!mountedRef.current) return;
    setLocalError(null);

    const presenceSession = presenceRef.current;
    const voiceSession = voiceRef.current;
    const audioContainer = audioContainerRef.current;
    if (!presenceSession || !voiceSession || !audioContainer) return;

    const name = participantName.trim();
    if (!name) {
      setLocalError('表示名を入力してください');
      return;
    }

    const roomName = syncWithMap ? mappedLiveKitRoom : manualRoomName.trim();
    if (syncWithMap && !roomName) {
      setLocalError(NO_MAPPED_ROOM_MESSAGE);
      return;
    }
    if (!roomName) {
      setLocalError('LiveKit room 名を入力してください');
      return;
    }

    setConnecting(true);
    lastMapRoomRef.current = currentMapRoom || null;

    try {
      let sessionResponse: Response;
      try {
        sessionResponse = await fetch('/api/livekit/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participantName: name }),
        });
      } catch (error) {
        throw classifiedConnectionError(classifyFetchNetworkError(error, 'session'));
      }

      let sessionPayload: unknown = null;
      try {
        sessionPayload = await sessionResponse.json();
      } catch {
        sessionPayload = null;
      }
      if (!sessionResponse.ok || !isSessionResponse(sessionPayload)) {
        throw classifiedConnectionError(
          classifyHttpApiFailure(sessionResponse.status, sessionPayload, 'session'),
        );
      }

      sessionIdentityRef.current = sessionPayload.participantIdentity;
      dispatchLocalPlayerClothing({
        clothingVariant: getPlayerClothingVariant(sessionPayload.participantIdentity),
      });

      try {
        await presenceSession.connect({
          serverUrl: sessionPayload.serverUrl,
          presenceToken: sessionPayload.presenceToken,
          participantIdentity: sessionPayload.participantIdentity,
          participantName: name,
        });
      } catch (error) {
        throw classifiedConnectionError(classifyConnectError(error, 'presence'));
      }

      const latest = lastLocalPositionRef.current;
      if (latest) {
        await presenceSession.publishPresence(
          toPresenceState(latest, lastMapRoomRef.current, null),
        );
      }

      try {
        await voiceSession.connect({
          roomName,
          participantName: name,
          participantIdentity: sessionPayload.participantIdentity,
          audioContainer,
        });
        lastVoiceRoomRef.current = roomName;
        if (lastLocalPositionRef.current) {
          await presenceSession.publishPresence(
            toPresenceState(
              lastLocalPositionRef.current,
              lastMapRoomRef.current,
              roomName,
            ),
          );
        }
        await presenceSession.notifyRoomChange({
          mapRoomName: lastMapRoomRef.current,
          voiceRoomName: roomName,
        });
      } catch (voiceError) {
        lastVoiceRoomRef.current = null;
        if (lastLocalPositionRef.current) {
          await presenceSession.publishPresence(
            toPresenceState(
              lastLocalPositionRef.current,
              lastMapRoomRef.current,
              null,
            ),
          );
        } else {
          await presenceSession.notifyRoomChange({ voiceRoomName: null });
        }
        if (mountedRef.current) {
          setLocalError(
            `マップ表示のみ接続中（音声エラー）: ${userFacingConnectionMessage(voiceError, 'voice')}`,
          );
        }
      }
    } catch (error) {
      sessionIdentityRef.current = null;
      dispatchLocalPlayerClothing({ clothingVariant: 0 });
      try {
        await presenceRef.current?.disconnect();
      } catch {
        // ignore
      }
      try {
        await voiceRef.current?.disconnect();
      } catch {
        // ignore
      }
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'Operation cancelled') return;
      setLocalError(userFacingConnectionMessage(error, 'generic'));
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }

  async function handleToggleMute() {
    if (!mountedRef.current) return;
    setLocalError(null);
    try {
      await voiceRef.current?.setMuted(!voice.muted);
    } catch (error) {
      if (!mountedRef.current) return;
      setLocalError(error instanceof Error ? error.message : 'Failed to toggle mute');
    }
  }

  async function handleLeave() {
    if (!mountedRef.current) return;
    setLocalError(null);
    try {
      await voiceRef.current?.disconnect();
      await presenceRef.current?.disconnect();
      sessionIdentityRef.current = null;
      lastVoiceRoomRef.current = null;
      dispatchLocalPlayerClothing({ clothingVariant: 0 });
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'Operation cancelled') return;
      setLocalError(error instanceof Error ? error.message : 'Failed to leave');
    }
  }

  async function handleStartAudio() {
    if (!mountedRef.current) return;
    setLocalError(null);
    try {
      await voiceRef.current?.startAudio();
    } catch (error) {
      if (!mountedRef.current) return;
      setLocalError(error instanceof Error ? error.message : 'Failed to start audio playback');
    }
  }

  async function handleSendChat(raw: string): Promise<boolean> {
    if (chatSendInFlightRef.current) return false;
    const presenceSession = presenceRef.current;
    if (!presenceSession || presenceSession.getSnapshot().status !== 'connected') {
      setChatError('Presenceに接続するとチャットできます');
      return false;
    }

    const validated = validateOutgoingChatText(raw);
    if (!validated.ok) {
      setChatError(validated.message);
      return false;
    }

    const identity = presenceSession.getIdentity();
    if (!identity) {
      setChatError('参加者情報がありません。再接続してください。');
      return false;
    }

    chatSendInFlightRef.current = true;
    setChatSending(true);
    setChatError(null);

    try {
      const { id, sentAt } = await presenceSession.sendChatText(validated.text);
      if (!mountedRef.current) return true;

      const message: HouseChatMessage = {
        id,
        participantIdentity: identity,
        participantName: sanitizeChatDisplayName(participantName, identity),
        text: validated.text,
        sentAt: normalizeChatSentAt(sentAt),
        own: true,
      };
      enqueueChatMessage(message);
      return true;
    } catch {
      if (mountedRef.current) {
        setChatError('メッセージの送信に失敗しました。');
      }
      return false;
    } finally {
      chatSendInFlightRef.current = false;
      if (mountedRef.current) setChatSending(false);
    }
  }

  return (
    <>
      <aside className="voice-panel" aria-label="Voice chat">
      <div className="voice-panel__header">
        <h2>接続（Presence + Voice）</h2>
        <p>
          全体表示は固定 Presence Room、音声だけがマップ部屋の Voice Room に入ります。服の色で参加者を区別します。
        </p>
      </div>

      <label className="voice-sync">
        <input
          type="checkbox"
          checked={syncWithMap}
          onChange={(event) => {
            setSyncWithMap(event.target.checked);
            setLocalError(null);
          }}
          disabled={voiceBusy || presenceConnected}
        />
        <span>マップの部屋と音声を連動する</span>
      </label>

      <label className="voice-sync">
        <input
          type="checkbox"
          checked={voice.proximityAudioEnabled}
          onChange={(event) => {
            voiceRef.current?.setProximityAudioEnabled(event.target.checked);
          }}
          disabled={voice.status === 'idle'}
        />
        <span>距離に応じて音量を変える</span>
      </label>

      <div className="voice-panel__status">
        <p>
          <span>マップ部屋</span>
          <strong>{currentMapRoom || '—'}</strong>
        </p>
        <p>
          <span>対応 Voice room</span>
          <strong>{mappedLiveKitRoom ?? '（なし）'}</strong>
        </p>
      </div>

      <form className="voice-panel__form" onSubmit={handleConnect}>
        <label className="voice-field">
          <span>表示名</span>
          <input
            type="text"
            value={participantName}
            onChange={(event) => setParticipantName(event.target.value)}
            placeholder="例: alice"
            maxLength={32}
            disabled={voiceBusy || presenceConnected}
            autoComplete="off"
          />
        </label>

        <label className="voice-field">
          <span>Voice room 名</span>
          <input
            type="text"
            value={effectiveRoomName}
            onChange={(event) => {
              if (!syncWithMap) {
                setManualRoomName(event.target.value);
              }
            }}
            placeholder={syncWithMap ? 'マップ連動中' : 'living-room'}
            maxLength={64}
            readOnly={syncWithMap}
            disabled={voiceBusy || presenceConnected}
            autoComplete="off"
          />
        </label>

        <div className="voice-panel__actions">
          <button type="submit" disabled={!canConnect}>
            {connecting || presence.status === 'connecting' || voice.status === 'connecting'
              ? '接続中…'
              : voice.status === 'switching'
                ? '切替中…'
                : '接続'}
          </button>
          <button
            type="button"
            onClick={handleToggleMute}
            disabled={(!voiceConnected && voice.status !== 'switching') || voiceBusy}
          >
            {voice.muted ? 'ミュート解除' : 'ミュート'}
          </button>
          <button
            type="button"
            onClick={handleLeave}
            disabled={
              !presenceConnected &&
              voice.status === 'idle' &&
              !connecting
            }
          >
            退出
          </button>
        </div>
      </form>

      <div className="voice-panel__status">
        <p>
          <span>全体接続</span>
          <strong>{presenceStatusLabel(presence.status)}</strong>
        </p>
        <p>
          <span>オンライン人数</span>
          <strong>{presenceConnected ? presence.onlineCount : '—'}</strong>
        </p>
        <p>
          <span>位置同期</span>
          <strong>{positionSyncLabel(presence.positionSyncStatus)}</strong>
        </p>
        <p>
          <span>音声接続</span>
          <strong>{voiceStatusLabel(voice.status)}</strong>
        </p>
        <p>
          <span>現在の音声 room</span>
          <strong>{voice.roomName || '—'}</strong>
        </p>
        <p>
          <span>同じ音声 room の人数</span>
          <strong>{voiceConnected || voice.status === 'switching' ? voice.voiceParticipantCount : '—'}</strong>
        </p>
        <p>
          <span>Identity</span>
          <strong>{presence.participantIdentity ?? sessionIdentityRef.current ?? '—'}</strong>
        </p>
        <p>
          <span>距離減衰</span>
          <strong>{voice.proximityAudioEnabled ? 'ON' : 'OFF'}</strong>
        </p>
        <p>
          <span>最近傍距離</span>
          <strong>
            {voice.nearestDistance === null ? '—' : `${voice.nearestDistance.toFixed(0)}px`}
          </strong>
        </p>
        <p>
          <span>最近傍音量</span>
          <strong>
            {voice.nearestVolume === null ? '—' : voice.nearestVolume.toFixed(2)}
          </strong>
        </p>
        <p>
          <span>stale人数</span>
          <strong>{voice.staleParticipantCount}</strong>
        </p>
      </div>

      {voice.participants.length > 0 && (
        <ul className="voice-panel__participants">
          {voice.participants.map((participant) => (
            <li key={participant.identity}>
              {participant.name}
              {participant.isLocal ? '（自分）' : ''}
            </li>
          ))}
        </ul>
      )}

      {voice.needsAudioStart && (
        <div className="voice-panel__audio-unlock">
          <p>ブラウザが音声再生をブロックしています。</p>
          <button type="button" onClick={handleStartAudio}>
            音声を有効にする
          </button>
        </div>
      )}

      {errorMessage && (
        <p className="voice-panel__error" role="alert">
          {errorMessage}
        </p>
      )}

      <div ref={audioContainerRef} className="voice-audio-container" aria-hidden="true" />
    </aside>

      <HouseChatPanel
        presenceConnected={presenceConnected}
        messages={chatMessages}
        sending={chatSending}
        error={chatError}
        onClearError={() => setChatError(null)}
        onSend={handleSendChat}
      />
    </>
  );
}

function presenceStatusLabel(status: PresenceSessionSnapshot['status']): string {
  switch (status) {
    case 'disconnected':
      return '未接続';
    case 'connecting':
      return '接続中';
    case 'connected':
      return '接続済み';
    case 'error':
      return 'エラー';
    default:
      return status;
  }
}

function voiceStatusLabel(status: VoiceSessionSnapshot['status']): string {
  switch (status) {
    case 'idle':
      return '未接続';
    case 'connecting':
      return '接続中';
    case 'connected':
      return '接続済み';
    case 'switching':
      return '部屋切替中';
    case 'disconnecting':
      return '切断中';
    case 'error':
      return 'エラー';
    default:
      return status;
  }
}

function positionSyncLabel(status: PresenceSessionSnapshot['positionSyncStatus']): string {
  switch (status) {
    case 'idle':
      return '未接続';
    case 'syncing':
      return '同期中';
    case 'error':
      return 'エラー';
    default:
      return status;
  }
}
