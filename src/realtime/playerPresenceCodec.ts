import { DEFAULT_AVATAR_TYPE, isAvatarType } from '../avatar/avatarTypes';
import {
  MAX_ABS_COORDINATE,
  MAX_POSITION_PAYLOAD_BYTES,
} from './playerPositionConstants';
import {
  PLAYER_DIRECTIONS,
  type LocalPlayerPosition,
  type PlayerDirection,
} from './playerPositionTypes';
import { PLAYER_PRESENCE_TOPIC } from '../presence/presenceConstants';
import type { LocalPresenceState, PlayerPresenceMessage } from '../presence/presenceTypes';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isPlayerDirection(value: unknown): value is PlayerDirection {
  return typeof value === 'string' && (PLAYER_DIRECTIONS as readonly string[]).includes(value);
}

function isRoomNameOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= 64);
}

export function encodePlayerPresenceMessage(
  state: LocalPresenceState,
  meta: { sequence: number; sentAt: number },
): Uint8Array {
  const message: PlayerPresenceMessage = {
    type: 'player-presence',
    version: 3,
    x: state.x,
    y: state.y,
    direction: state.direction,
    moving: state.moving,
    mapRoomName: state.mapRoomName,
    voiceRoomName: state.voiceRoomName,
    avatarType: state.avatarType,
    sequence: meta.sequence,
    sentAt: meta.sentAt,
  };
  return textEncoder.encode(JSON.stringify(message));
}

export function decodePlayerPresencePayload(
  payload: Uint8Array,
  topic: string | undefined,
): PlayerPresenceMessage | null {
  if (topic !== PLAYER_PRESENCE_TOPIC) {
    return null;
  }

  if (payload.byteLength === 0 || payload.byteLength > MAX_POSITION_PAYLOAD_BYTES) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(payload));
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.type !== 'player-presence') return null;
  if (record.version !== 2 && record.version !== 3) return null;
  if (typeof record.x !== 'number' || !Number.isFinite(record.x)) return null;
  if (typeof record.y !== 'number' || !Number.isFinite(record.y)) return null;
  if (Math.abs(record.x) > MAX_ABS_COORDINATE || Math.abs(record.y) > MAX_ABS_COORDINATE) {
    return null;
  }
  if (!isPlayerDirection(record.direction)) return null;
  if (typeof record.moving !== 'boolean') return null;
  if (!isRoomNameOrNull(record.mapRoomName)) return null;
  if (!isRoomNameOrNull(record.voiceRoomName)) return null;
  if (
    typeof record.sequence !== 'number' ||
    !Number.isInteger(record.sequence) ||
    record.sequence < 0
  ) {
    return null;
  }
  if (typeof record.sentAt !== 'number' || !Number.isFinite(record.sentAt)) return null;

  let avatarType = DEFAULT_AVATAR_TYPE;
  if (record.version === 3) {
    if (!isAvatarType(record.avatarType)) return null;
    avatarType = record.avatarType;
  }

  return {
    type: 'player-presence',
    version: 3,
    x: record.x,
    y: record.y,
    direction: record.direction,
    moving: record.moving,
    mapRoomName: record.mapRoomName,
    voiceRoomName: record.voiceRoomName,
    avatarType,
    sequence: record.sequence,
    sentAt: record.sentAt,
  };
}

export function toPresenceState(
  position: LocalPlayerPosition,
  mapRoomName: string | null,
  voiceRoomName: string | null,
  avatarType = DEFAULT_AVATAR_TYPE,
): LocalPresenceState {
  return {
    x: position.x,
    y: position.y,
    direction: position.direction,
    moving: position.moving,
    mapRoomName,
    voiceRoomName,
    avatarType,
  };
}
