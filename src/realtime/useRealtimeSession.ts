import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { DEFAULT_AVATAR_TYPE, type AvatarType } from '../avatar/avatarTypes';
import type { HouseChatMessage } from '../chat/chatTypes';
import {
  appendChatMessage,
  isValidIncomingChatPayload,
  normalizeChatSentAt,
  sanitizeChatDisplayName,
  validateOutgoingChatText,
} from '../chat/chatValidation';
import {
  dispatchLocalPlayerAvatar,
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
import { toLiveKitRoomName } from '../voice/roomMapping';
import type { VoiceSessionSnapshot } from '../voice/types';
import { VoiceSession } from '../voice/voiceSession';
import {
  classifiedConnectionError,
  classifyConnectError,
  classifyFetchNetworkError,
  classifyHttpApiFailure,
  NO_MAPPED_ROOM_MESSAGE,
  userFacingConnectionMessage,
} from './connectionErrors';
import { toPresenceState } from './playerPresenceCodec';
import { canStartJoin, validateJoinName } from '../onboarding/joinValidation';

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

export type JoinProfile = {
  participantName: string;
  avatarType: AvatarType;
};

export type UseRealtimeSessionOptions = {
  currentMapRoom: string;
};

export function useRealtimeSession(options: UseRealtimeSessionOptions): {
  join: (profile: JoinProfile) => Promise<void>;
  retryVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  startAudio: () => Promise<void>;
  sendChat: (text: string) => Promise<boolean>;
  clearChatError: () => void;
  leave: () => Promise<void>;

  presence: PresenceSessionSnapshot;
  voice: VoiceSessionSnapshot;
  joining: boolean;
  joined: boolean;
  joinError: string | null;
  voiceError: string | null;
  chatMessages: HouseChatMessage[];
  chatSending: boolean;
  chatError: string | null;
  audioContainerRef: RefObject<HTMLDivElement | null>;
  avatarType: AvatarType | null;
  participantName: string | null;
} {
  const { currentMapRoom } = options;

  const presenceRef = useRef<PresenceSession | null>(null);
  const voiceRef = useRef<VoiceSession | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const sessionIdentityRef = useRef<string | null>(null);
  const participantNameRef = useRef<string | null>(null);
  const avatarTypeRef = useRef<AvatarType | null>(null);
  const lastMapRoomRef = useRef<string | null>(null);
  const lastVoiceRoomRef = useRef<string | null>(null);
  const lastLocalPositionRef = useRef<LocalPlayerPositionDetail | null>(null);
  const chatSeenIdsRef = useRef(new Set<string>());
  const chatSendInFlightRef = useRef(false);
  const wasPresenceConnectedRef = useRef(false);
  const joiningRef = useRef(false);
  const retryVoiceInFlightRef = useRef(false);
  const currentMapRoomRef = useRef(currentMapRoom);

  const [presence, setPresence] = useState<PresenceSessionSnapshot>(INITIAL_PRESENCE);
  const [voice, setVoice] = useState<VoiceSessionSnapshot>(INITIAL_VOICE);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<HouseChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [avatarType, setAvatarType] = useState<AvatarType | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);

  currentMapRoomRef.current = currentMapRoom;
  const mappedLiveKitRoom = toLiveKitRoomName(currentMapRoom);
  const joined = presence.status === 'connected';

  function enqueueChatMessage(message: HouseChatMessage): void {
    const seenIds = chatSeenIdsRef.current;
    if (seenIds.has(message.id)) return;
    seenIds.add(message.id);
    setChatMessages((previous) => appendChatMessage(previous, message));
  }

  const clearChatHistory = useCallback(() => {
    chatSeenIdsRef.current.clear();
    chatSendInFlightRef.current = false;
    setChatMessages([]);
    setChatSending(false);
    setChatError(null);
  }, []);

  const resetLocalProfile = useCallback(() => {
    sessionIdentityRef.current = null;
    participantNameRef.current = null;
    avatarTypeRef.current = null;
    lastVoiceRoomRef.current = null;
    setParticipantName(null);
    setAvatarType(null);
    dispatchLocalPlayerAvatar({
      avatarType: DEFAULT_AVATAR_TYPE,
      clothingVariant: 0,
    });
  }, []);

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
      const nextAvatarType = avatarTypeRef.current ?? DEFAULT_AVATAR_TYPE;
      void presenceSessionInner.publishPresence(
        toPresenceState(detail, mapRoomName, voiceRoomName, nextAvatarType),
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
      dispatchLocalPlayerAvatar({
        avatarType: DEFAULT_AVATAR_TYPE,
        clothingVariant: 0,
      });
    };
  }, []);

  useEffect(() => {
    const connected = presence.status === 'connected';
    if (wasPresenceConnectedRef.current && !connected) {
      clearChatHistory();
    }
    wasPresenceConnectedRef.current = connected;
  }, [presence.status, clearChatHistory]);

  useEffect(() => {
    const mapRoom = currentMapRoom || null;
    if (mapRoom === lastMapRoomRef.current) return;
    lastMapRoomRef.current = mapRoom;

    const presenceSession = presenceRef.current;
    if (!presenceSession || presenceSession.getSnapshot().status !== 'connected') return;
    void presenceSession.notifyRoomChange({ mapRoomName: mapRoom });
  }, [currentMapRoom]);

  useEffect(() => {
    if (presence.status !== 'connected') return;
    if (voice.status !== 'connected' && voice.status !== 'switching') {
      return;
    }
    if (!mappedLiveKitRoom) {
      if (mountedRef.current) setVoiceError(NO_MAPPED_ROOM_MESSAGE);
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
        if (mountedRef.current) setVoiceError(null);
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
        setVoiceError(userFacingConnectionMessage(error, 'voice-switch'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentMapRoom,
    mappedLiveKitRoom,
    presence.status,
    voice.status,
    voice.roomName,
  ]);

  const clearChatError = useCallback(() => {
    setChatError(null);
  }, []);

  const join = useCallback(async (profile: JoinProfile) => {
    if (!mountedRef.current) return;

    const presenceSession = presenceRef.current;
    const voiceSession = voiceRef.current;
    if (!presenceSession || !voiceSession) return;

    if (
      !canStartJoin({
        joining: joiningRef.current,
        presenceConnected: presenceSession.getSnapshot().status === 'connected',
      })
    ) {
      return;
    }

    const validatedName = validateJoinName(profile.participantName);
    if (!validatedName.ok) {
      setJoinError(validatedName.message);
      return;
    }
    const name = validatedName.name;

    joiningRef.current = true;
    setJoining(true);
    setJoinError(null);
    setVoiceError(null);
    lastMapRoomRef.current = currentMapRoomRef.current || null;

    const selectedAvatarType = profile.avatarType;
    const roomName = toLiveKitRoomName(currentMapRoomRef.current);

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

      const identity = sessionPayload.participantIdentity;
      sessionIdentityRef.current = identity;
      participantNameRef.current = name;
      avatarTypeRef.current = selectedAvatarType;
      setParticipantName(name);
      setAvatarType(selectedAvatarType);
      dispatchLocalPlayerAvatar({
        avatarType: selectedAvatarType,
        clothingVariant: getPlayerClothingVariant(identity),
      });

      try {
        await presenceSession.connect({
          serverUrl: sessionPayload.serverUrl,
          presenceToken: sessionPayload.presenceToken,
          participantIdentity: identity,
          participantName: name,
        });
      } catch (error) {
        throw classifiedConnectionError(classifyConnectError(error, 'presence'));
      }

      const latest = lastLocalPositionRef.current;
      if (latest) {
        await presenceSession.publishPresence(
          toPresenceState(latest, lastMapRoomRef.current, null, selectedAvatarType),
        );
      }

      if (!roomName) {
        if (mountedRef.current) setVoiceError(NO_MAPPED_ROOM_MESSAGE);
        return;
      }

      const audioContainer = audioContainerRef.current;
      if (!audioContainer) {
        if (mountedRef.current) {
          setVoiceError(userFacingConnectionMessage(new Error('Audio container is missing'), 'voice'));
        }
        return;
      }

      try {
        await voiceSession.connect({
          roomName,
          participantName: name,
          participantIdentity: identity,
          audioContainer,
        });
        lastVoiceRoomRef.current = roomName;
        if (lastLocalPositionRef.current) {
          await presenceSession.publishPresence(
            toPresenceState(
              lastLocalPositionRef.current,
              lastMapRoomRef.current,
              roomName,
              selectedAvatarType,
            ),
          );
        }
        await presenceSession.notifyRoomChange({
          mapRoomName: lastMapRoomRef.current,
          voiceRoomName: roomName,
        });
        if (mountedRef.current) setVoiceError(null);
      } catch (error) {
        lastVoiceRoomRef.current = null;
        if (lastLocalPositionRef.current) {
          await presenceSession.publishPresence(
            toPresenceState(
              lastLocalPositionRef.current,
              lastMapRoomRef.current,
              null,
              selectedAvatarType,
            ),
          );
        } else {
          await presenceSession.notifyRoomChange({ voiceRoomName: null });
        }
        if (mountedRef.current) {
          setVoiceError(userFacingConnectionMessage(error, 'voice'));
        }
      }
    } catch (error) {
      sessionIdentityRef.current = null;
      participantNameRef.current = null;
      avatarTypeRef.current = null;
      if (mountedRef.current) {
        setParticipantName(null);
        setAvatarType(null);
      }
      dispatchLocalPlayerAvatar({
        avatarType: DEFAULT_AVATAR_TYPE,
        clothingVariant: 0,
      });
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
      setJoinError(userFacingConnectionMessage(error, 'generic'));
    } finally {
      joiningRef.current = false;
      if (mountedRef.current) setJoining(false);
    }
  }, []);

  const retryVoice = useCallback(async () => {
    if (!mountedRef.current) return;
    if (joiningRef.current || retryVoiceInFlightRef.current) return;

    const presenceSession = presenceRef.current;
    const voiceSession = voiceRef.current;
    const audioContainer = audioContainerRef.current;
    const identity = sessionIdentityRef.current;
    const name = participantNameRef.current?.trim() ?? '';
    const selectedAvatarType = avatarTypeRef.current ?? DEFAULT_AVATAR_TYPE;

    if (!presenceSession || !voiceSession || !audioContainer || !identity || !name) {
      setVoiceError('音声再接続に必要な情報がありません。もう一度参加してください。');
      return;
    }
    if (presenceSession.getSnapshot().status !== 'connected') {
      setVoiceError('参加してから音声を再接続してください。');
      return;
    }

    const roomName = toLiveKitRoomName(currentMapRoomRef.current);
    if (!roomName) {
      setVoiceError(NO_MAPPED_ROOM_MESSAGE);
      return;
    }

    const voiceStatus = voiceSession.getSnapshot().status;
    if (voiceStatus !== 'idle' && voiceStatus !== 'error') {
      return;
    }

    retryVoiceInFlightRef.current = true;
    setVoiceError(null);

    try {
      await voiceSession.connect({
        roomName,
        participantName: name,
        participantIdentity: identity,
        audioContainer,
      });
      lastVoiceRoomRef.current = roomName;
      if (lastLocalPositionRef.current) {
        await presenceSession.publishPresence(
          toPresenceState(
            lastLocalPositionRef.current,
            lastMapRoomRef.current,
            roomName,
            selectedAvatarType,
          ),
        );
      }
      await presenceSession.notifyRoomChange({
        mapRoomName: lastMapRoomRef.current,
        voiceRoomName: roomName,
      });
      if (mountedRef.current) setVoiceError(null);
    } catch (error) {
      lastVoiceRoomRef.current = null;
      try {
        await presenceSession.notifyRoomChange({ voiceRoomName: null });
      } catch {
        // ignore
      }
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'Operation cancelled') return;
      setVoiceError(userFacingConnectionMessage(error, 'voice'));
    } finally {
      retryVoiceInFlightRef.current = false;
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const muted = voiceRef.current?.getSnapshot().muted ?? false;
      await voiceRef.current?.setMuted(!muted);
    } catch (error) {
      if (!mountedRef.current) return;
      setVoiceError(error instanceof Error ? error.message : 'Failed to toggle mute');
    }
  }, []);

  const startAudio = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      await voiceRef.current?.startAudio();
    } catch (error) {
      if (!mountedRef.current) return;
      setVoiceError(error instanceof Error ? error.message : 'Failed to start audio playback');
    }
  }, []);

  const leave = useCallback(async () => {
    if (!mountedRef.current) return;
    setJoinError(null);
    setVoiceError(null);
    try {
      await voiceRef.current?.disconnect();
      await presenceRef.current?.disconnect();
      resetLocalProfile();
      clearChatHistory();
    } catch (error) {
      if (!mountedRef.current) return;
      if (error instanceof Error && error.message === 'Operation cancelled') return;
      setJoinError(error instanceof Error ? error.message : 'Failed to leave');
    }
  }, [clearChatHistory, resetLocalProfile]);

  const sendChat = useCallback(async (raw: string): Promise<boolean> => {
    if (chatSendInFlightRef.current) return false;
    const presenceSession = presenceRef.current;
    if (!presenceSession || presenceSession.getSnapshot().status !== 'connected') {
      setChatError('参加するとチャットできます');
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

    const displayName = participantNameRef.current ?? '';
    chatSendInFlightRef.current = true;
    setChatSending(true);
    setChatError(null);

    try {
      const { id, sentAt } = await presenceSession.sendChatText(validated.text);
      if (!mountedRef.current) return true;

      const message: HouseChatMessage = {
        id,
        participantIdentity: identity,
        participantName: sanitizeChatDisplayName(displayName, identity),
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
  }, []);

  return {
    join,
    retryVoice,
    toggleMute,
    startAudio,
    sendChat,
    clearChatError,
    leave,
    presence,
    voice,
    joining,
    joined,
    joinError,
    voiceError,
    chatMessages,
    chatSending,
    chatError,
    audioContainerRef,
    avatarType,
    participantName,
  };
}
