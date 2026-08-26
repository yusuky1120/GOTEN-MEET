import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from 'react';
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
import {
  getPlayerClothingVariant,
  setLocalAvatarModel,
  type AvatarModel,
} from '../game/playerClothing';
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
import '../voice-onboarding.css';

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

function voiceStatusShortLabel(status: VoiceSessionSnapshot['status']): string {
  switch (status) {
    case 'connected':
      return '音声オン';
    case 'connecting':
    case 'switching':
      return '接続中…';
    case 'disconnecting':
      return '切断中…';
    case 'error':
      return '音声エラー';
    default:
      return '音声オフ';
  }
}

export type VoiceChromeState = {
  muted: boolean;
  voiceConnected: boolean;
  canToggleMute: boolean;
  needsAudioStart: boolean;
  busy: boolean;
  error: string | null;
  statusLabel: string;
};

export type VoicePanelHandle = {
  toggleMute: () => void;
  startAudio: () => void;
  leave: () => void;
  retryVoice: () => void;
};

export type VoicePanelProps = {
  currentMapRoom: string;
  micMenuOpen?: boolean;
  onJoinedChange?: (joined: boolean) => void;
  onVoiceChromeChange?: (state: VoiceChromeState) => void;
  onCloseMicMenu?: () => void;
};

const VoicePanel = forwardRef<VoicePanelHandle, VoicePanelProps>(function VoicePanel(
  {
    currentMapRoom,
    micMenuOpen = false,
    onJoinedChange,
    onVoiceChromeChange,
    onCloseMicMenu,
  },
  ref,
) {
  const presenceRef = useRef<PresenceSession | null>(null);
  const voiceRef = useRef<VoiceSession | null>(null);
  const audioContainerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const sessionIdentityRef = useRef<string | null>(null);
  const lastMapRoomRef = useRef<string | null>(null);
  const lastLocalPositionRef = useRef<LocalPlayerPositionDetail | null>(null);
  const chatSeenIdsRef = useRef(new Set<string>());
  const chatSendInFlightRef = useRef(false);
  const wasPresenceConnectedRef = useRef(false);

  const [participantName, setParticipantName] = useState('');
  const [avatarModel, setAvatarModel] = useState<AvatarModel>('male');
  const [presence, setPresence] = useState<PresenceSessionSnapshot>(INITIAL_PRESENCE);
  const [voice, setVoice] = useState<VoiceSessionSnapshot>(INITIAL_VOICE);
  const [localError, setLocalError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [chatMessages, setChatMessages] = useState<HouseChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const mappedLiveKitRoom = toLiveKitRoomName(currentMapRoom);
  const presenceConnected = presence.status === 'connected';
  const voiceConnected = voice.status === 'connected';
  const voiceBusy =
    connecting ||
    voice.status === 'connecting' ||
    voice.status === 'disconnecting' ||
    voice.status === 'switching';
  const canConnect =
    !connecting &&
    !presenceConnected &&
    participantName.trim().length > 0 &&
    Boolean(mappedLiveKitRoom);
  const errorMessage = localError || presence.errorMessage || voice.errorMessage;
  const canToggleMute = voiceConnected && !voiceBusy;

  function enqueueChatMessage(message: HouseChatMessage): void {
    if (chatSeenIdsRef.current.has(message.id)) return;
    chatSeenIdsRef.current.add(message.id);
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
      if (!mountedRef.current || !isValidIncomingChatPayload(payload)) return;
      const validated = validateOutgoingChatText(payload.text);
      if (!validated.ok) return;
      const localIdentity = presenceSession.getIdentity();
      enqueueChatMessage({
        id: payload.id,
        participantIdentity: payload.participantIdentity,
        participantName: sanitizeChatDisplayName(
          payload.participantName,
          payload.participantIdentity,
        ),
        text: validated.text,
        sentAt: normalizeChatSentAt(payload.sentAt),
        own: Boolean(localIdentity && payload.participantIdentity === localIdentity),
      });
    });

    const onLocalPosition = (event: Event) => {
      const detail = (event as CustomEvent<LocalPlayerPositionDetail>).detail;
      lastLocalPositionRef.current = detail;
      const activePresence = presenceRef.current;
      const activeVoice = voiceRef.current;
      if (!activePresence || activePresence.getSnapshot().status !== 'connected') return;
      const voiceSnapshot = activeVoice?.getSnapshot();
      const voiceRoomName =
        voiceSnapshot &&
        (voiceSnapshot.status === 'connected' || voiceSnapshot.status === 'switching')
          ? voiceSnapshot.roomName || null
          : null;
      void activePresence.publishPresence(
        toPresenceState(detail, lastMapRoomRef.current, voiceRoomName),
      );
    };

    const onDistance = (event: Event) => {
      const detail = (event as CustomEvent<RemotePlayerDistanceDetail>).detail;
      const activeVoice = voiceRef.current;
      if (!activeVoice) return;
      if (!detail.voiceRoomName || detail.voiceRoomName !== activeVoice.getSnapshot().roomName) {
        return;
      }
      activeVoice.setParticipantDistance(detail.participantIdentity, detail.distance);
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
      setLocalAvatarModel('male');
      dispatchLocalPlayerClothing({ clothingVariant: 0 });
    };
  }, []);

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

  useEffect(() => {
    onJoinedChange?.(presenceConnected);
  }, [presenceConnected, onJoinedChange]);

  useEffect(() => {
    onVoiceChromeChange?.({
      muted: voice.muted,
      voiceConnected,
      canToggleMute,
      needsAudioStart: voice.needsAudioStart,
      busy: voiceBusy,
      error: errorMessage,
      statusLabel: voiceStatusShortLabel(voice.status),
    });
  }, [
    voice.muted,
    voiceConnected,
    canToggleMute,
    voice.needsAudioStart,
    voiceBusy,
    errorMessage,
    voice.status,
    onVoiceChromeChange,
  ]);

  useEffect(() => {
    const mapRoom = currentMapRoom || null;
    if (mapRoom === lastMapRoomRef.current) return;
    lastMapRoomRef.current = mapRoom;
    const activePresence = presenceRef.current;
    if (!activePresence || activePresence.getSnapshot().status !== 'connected') return;
    void activePresence.notifyRoomChange({ mapRoomName: mapRoom });
  }, [currentMapRoom]);

  useEffect(() => {
    if (!presenceConnected) return;
    if (voice.status !== 'connected' && voice.status !== 'switching') return;
    if (!mappedLiveKitRoom) {
      setLocalError(NO_MAPPED_ROOM_MESSAGE);
      return;
    }
    if (mappedLiveKitRoom === voice.roomName && voice.status === 'connected') return;

    let cancelled = false;
    const activeVoice = voiceRef.current;
    const activePresence = presenceRef.current;
    if (!activeVoice || !activePresence) return;

    void (async () => {
      try {
        setLocalError(null);
        await activeVoice.switchRoom({ roomName: mappedLiveKitRoom });
        if (cancelled || !mountedRef.current) return;
        await activePresence.notifyRoomChange({
          mapRoomName: lastMapRoomRef.current,
          voiceRoomName: mappedLiveKitRoom,
        });
      } catch (error) {
        if (cancelled || !mountedRef.current) return;
        if (error instanceof Error && error.message === 'Operation cancelled') return;
        await activePresence.notifyRoomChange({ voiceRoomName: null });
        setLocalError(userFacingConnectionMessage(error, 'voice-switch'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mappedLiveKitRoom, presenceConnected, voice.roomName, voice.status]);

  async function handleConnect(event: FormEvent) {
    event.preventDefault();
    if (!mountedRef.current || connecting) return;
    setLocalError(null);

    const activePresence = presenceRef.current;
    const activeVoice = voiceRef.current;
    const audioContainer = audioContainerRef.current;
    if (!activePresence || !activeVoice || !audioContainer) return;

    const name = participantName.trim();
    if (!name) {
      setLocalError('表示名を入力してください');
      return;
    }
    const roomName = mappedLiveKitRoom;
    if (!roomName) {
      setLocalError(NO_MAPPED_ROOM_MESSAGE);
      return;
    }

    setConnecting(true);
    lastMapRoomRef.current = currentMapRoom || null;
    setLocalAvatarModel(avatarModel);
    dispatchLocalPlayerClothing({ clothingVariant: 0 });

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
        await activePresence.connect({
          serverUrl: sessionPayload.serverUrl,
          presenceToken: sessionPayload.presenceToken,
          participantIdentity: sessionPayload.participantIdentity,
          participantName: name,
        });
      } catch (error) {
        throw classifiedConnectionError(classifyConnectError(error, 'presence'));
      }

      if (lastLocalPositionRef.current) {
        await activePresence.publishPresence(
          toPresenceState(lastLocalPositionRef.current, lastMapRoomRef.current, null),
        );
      }

      try {
        await activeVoice.connect({
          roomName,
          participantName: name,
          participantIdentity: sessionPayload.participantIdentity,
          audioContainer,
        });
        if (lastLocalPositionRef.current) {
          await activePresence.publishPresence(
            toPresenceState(lastLocalPositionRef.current, lastMapRoomRef.current, roomName),
          );
        }
        await activePresence.notifyRoomChange({
          mapRoomName: lastMapRoomRef.current,
          voiceRoomName: roomName,
        });
      } catch (voiceError) {
        await activePresence.notifyRoomChange({ voiceRoomName: null });
        if (mountedRef.current) {
          setLocalError(
            `マップには接続しました。音声のみ利用できません: ${userFacingConnectionMessage(
              voiceError,
              'voice',
            )}`,
          );
        }
      }
    } catch (error) {
      sessionIdentityRef.current = null;
      try {
        await activePresence.disconnect();
      } catch {
        /* ignore */
      }
      try {
        await activeVoice.disconnect();
      } catch {
        /* ignore */
      }
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'Operation cancelled') return;
      setLocalError(userFacingConnectionMessage(error, 'generic'));
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }

  async function handleToggleMute() {
    setLocalError(null);
    try {
      await voiceRef.current?.setMuted(!voice.muted);
    } catch (error) {
      if (mountedRef.current) {
        setLocalError(error instanceof Error ? error.message : 'ミュート切替に失敗しました');
      }
    }
  }

  async function handleLeave() {
    setLocalError(null);
    onCloseMicMenu?.();
    try {
      await voiceRef.current?.disconnect();
      await presenceRef.current?.disconnect();
      sessionIdentityRef.current = null;
      setLocalAvatarModel('male');
      dispatchLocalPlayerClothing({ clothingVariant: 0 });
    } catch (error) {
      if (mountedRef.current) {
        setLocalError(error instanceof Error ? error.message : '退出に失敗しました');
      }
    }
  }

  async function handleStartAudio() {
    setLocalError(null);
    try {
      await voiceRef.current?.startAudio();
    } catch (error) {
      if (mountedRef.current) {
        setLocalError(error instanceof Error ? error.message : '音声再生を開始できませんでした');
      }
    }
  }

  async function handleRetryVoice() {
    if (!mountedRef.current || connecting || voiceBusy) return;
    setLocalError(null);

    const activePresence = presenceRef.current;
    const activeVoice = voiceRef.current;
    const audioContainer = audioContainerRef.current;
    const identity = sessionIdentityRef.current;
    const name = participantName.trim();
    const roomName = mappedLiveKitRoom;

    if (!activePresence || !activeVoice || !audioContainer || !identity || !name || !roomName) {
      setLocalError('音声を再接続できません。いったん退出してから入室し直してください。');
      return;
    }
    if (activePresence.getSnapshot().status !== 'connected') {
      setLocalError('マップ接続が切れているため、再入室してください。');
      return;
    }

    setConnecting(true);
    try {
      if (activeVoice.getSnapshot().status === 'connected') {
        await activeVoice.disconnect();
      }
      await activeVoice.connect({
        roomName,
        participantName: name,
        participantIdentity: identity,
        audioContainer,
      });
      if (lastLocalPositionRef.current) {
        await activePresence.publishPresence(
          toPresenceState(lastLocalPositionRef.current, lastMapRoomRef.current, roomName),
        );
      }
      await activePresence.notifyRoomChange({
        mapRoomName: lastMapRoomRef.current,
        voiceRoomName: roomName,
      });
    } catch (error) {
      await activePresence.notifyRoomChange({ voiceRoomName: null });
      if (mountedRef.current) {
        setLocalError(userFacingConnectionMessage(error, 'voice'));
      }
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      toggleMute: () => {
        void handleToggleMute();
      },
      startAudio: () => {
        void handleStartAudio();
      },
      leave: () => {
        void handleLeave();
      },
      retryVoice: () => {
        void handleRetryVoice();
      },
    }),
    // Handlers close over latest state via refs/state above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voice.muted, voiceBusy, connecting, mappedLiveKitRoom, participantName],
  );

  async function handleSendChat(raw: string): Promise<boolean> {
    if (chatSendInFlightRef.current) return false;
    const activePresence = presenceRef.current;
    if (!activePresence || activePresence.getSnapshot().status !== 'connected') {
      setChatError('接続するとチャットできます');
      return false;
    }
    const validated = validateOutgoingChatText(raw);
    if (!validated.ok) {
      setChatError(validated.message);
      return false;
    }
    const identity = activePresence.getIdentity();
    if (!identity) {
      setChatError('参加者情報がありません。再接続してください。');
      return false;
    }

    chatSendInFlightRef.current = true;
    setChatSending(true);
    setChatError(null);
    try {
      const { id, sentAt } = await activePresence.sendChatText(validated.text);
      if (!mountedRef.current) return true;
      enqueueChatMessage({
        id,
        participantIdentity: identity,
        participantName: sanitizeChatDisplayName(participantName, identity),
        text: validated.text,
        sentAt: normalizeChatSentAt(sentAt),
        own: true,
      });
      return true;
    } catch {
      if (mountedRef.current) setChatError('メッセージの送信に失敗しました。');
      return false;
    } finally {
      chatSendInFlightRef.current = false;
      if (mountedRef.current) setChatSending(false);
    }
  }

  return (
    <>
      {!presenceConnected && (
        <div className="join-overlay" role="dialog" aria-modal="true" aria-labelledby="join-title">
          <form className="join-card" onSubmit={handleConnect}>
            <p className="join-card__eyebrow">WELCOME TO GOTEN MEET</p>
            <h2 id="join-title">シェアハウスに入る</h2>
            <p className="join-card__lead">表示名とアバターを選んでください。</p>

            <label className="join-field">
              <span>表示名</span>
              <input
                autoFocus
                type="text"
                value={participantName}
                onChange={(event) => {
                  setParticipantName(event.target.value);
                  setLocalError(null);
                }}
                placeholder="例：さやか"
                maxLength={32}
                disabled={connecting}
                autoComplete="off"
              />
            </label>

            <fieldset className="avatar-picker" disabled={connecting}>
              <legend>アバターモデル</legend>
              <div className="avatar-picker__options">
                {(['male', 'female'] as const).map((model) => (
                  <label
                    key={model}
                    className={`avatar-option${avatarModel === model ? ' avatar-option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="avatar-model"
                      value={model}
                      checked={avatarModel === model}
                      onChange={() => {
                        setAvatarModel(model);
                        setLocalAvatarModel(model);
                        dispatchLocalPlayerClothing({ clothingVariant: 0 });
                      }}
                    />
                    <span className={`avatar-preview avatar-preview--${model}`} aria-hidden="true">
                      <i className="avatar-preview__hair" />
                      <i className="avatar-preview__face" />
                      <i className="avatar-preview__body" />
                    </span>
                    <strong>{model === 'male' ? '男性モデル' : '女性モデル'}</strong>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="join-card__room">
              <span>開始地点</span>
              <strong>{currentMapRoom || '玄関'}</strong>
            </div>

            <p className="join-card__hint">
              入室するとマイク権限を求めます。ブラウザの許可ダイアログで「許可」を選んでください。
            </p>

            {errorMessage && (
              <p className="join-card__error" role="alert">
                {errorMessage}
              </p>
            )}

            <button className="join-card__submit" type="submit" disabled={!canConnect}>
              {connecting || presence.status === 'connecting' ? '接続中…' : '入室する'}
            </button>
          </form>
        </div>
      )}

      {presenceConnected && micMenuOpen && (
        <aside className="voice-mic-menu" aria-label="マイク設定">
          <div className="voice-mic-menu__status">
            <span className={`voice-mic-menu__dot${voiceConnected ? ' is-connected' : ''}`} />
            <div>
              <strong>{voice.muted ? 'ミュート中' : 'マイクON'}</strong>
              <small>{voiceStatusShortLabel(voice.status)}</small>
            </div>
          </div>

          <div className="voice-mic-menu__actions">
            <button type="button" onClick={handleToggleMute} disabled={!canToggleMute}>
              {voice.muted ? 'ミュート解除' : 'ミュート'}
            </button>
            {voice.needsAudioStart && (
              <button type="button" onClick={handleStartAudio}>
                音声を有効化
              </button>
            )}
            {!voiceConnected && !voiceBusy && (
              <button type="button" onClick={handleRetryVoice}>
                音声を再接続
              </button>
            )}
            <button type="button" className="voice-mic-menu__leave" onClick={handleLeave}>
              退出
            </button>
          </div>

          {errorMessage && (
            <p className="voice-mic-menu__error" role="alert">
              {errorMessage}
            </p>
          )}
        </aside>
      )}

      {presenceConnected && (
        <HouseChatPanel
          presenceConnected={presenceConnected}
          messages={chatMessages}
          sending={chatSending}
          error={chatError}
          onClearError={() => setChatError(null)}
          onSend={handleSendChat}
        />
      )}

      <div ref={audioContainerRef} className="voice-audio-container" aria-hidden="true" />
    </>
  );
});

export default VoicePanel;
