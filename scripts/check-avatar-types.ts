/**
 * Avatar type / presence v3 checks.
 * Run: npx tsx scripts/check-avatar-types.ts
 */
import { DEFAULT_AVATAR_TYPE } from '../src/avatar/avatarTypes.ts';
import { avatarTextureKey } from '../src/game/avatarTextures.ts';
import { PLAYER_PRESENCE_TOPIC } from '../src/presence/presenceConstants.ts';
import type { LocalPresenceState } from '../src/presence/presenceTypes.ts';
import {
  decodePlayerPresencePayload,
  encodePlayerPresenceMessage,
} from '../src/realtime/playerPresenceCodec.ts';
import type { RemotePlayerPosition } from '../src/realtime/playerPositionTypes.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  avatarTextureKey('male', 'idle', 0) !== avatarTextureKey('female', 'idle', 0),
  'male/female texture keys differ',
);
assert(
  avatarTextureKey('male', 'idle', 0) !== avatarTextureKey('male', 'step', 0),
  'pose texture keys differ',
);
assert(
  avatarTextureKey('male', 'idle', 0) !== avatarTextureKey('male', 'idle', 1),
  'clothing variant texture keys differ',
);

const state: LocalPresenceState = {
  x: 120,
  y: 240,
  direction: 'left',
  moving: false,
  mapRoomName: 'リビング',
  voiceRoomName: 'living-room',
  avatarType: 'female',
};

const encoded = encodePlayerPresenceMessage(state, { sequence: 9, sentAt: 1_800_000_000_000 });
const decoded = decodePlayerPresencePayload(encoded, PLAYER_PRESENCE_TOPIC);
assert(decoded !== null, 'v3 roundtrip decodes');
assert(decoded!.version === 3, 'normalized version is 3');
assert(decoded!.avatarType === 'female', 'female roundtrip');

const maleState: LocalPresenceState = { ...state, avatarType: 'male' };
const maleDecoded = decodePlayerPresencePayload(
  encodePlayerPresenceMessage(maleState, { sequence: 10, sentAt: 1_800_000_000_001 }),
  PLAYER_PRESENCE_TOPIC,
);
assert(maleDecoded?.avatarType === 'male', 'male roundtrip');

const badAvatar = new TextEncoder().encode(
  JSON.stringify({
    type: 'player-presence',
    version: 3,
    x: 1,
    y: 2,
    direction: 'up',
    moving: false,
    mapRoomName: null,
    voiceRoomName: null,
    avatarType: 'robot',
    sequence: 1,
    sentAt: 1,
  }),
);
assert(decodePlayerPresencePayload(badAvatar, PLAYER_PRESENCE_TOPIC) === null, 'unknown avatar rejected');

const v2Payload = new TextEncoder().encode(
  JSON.stringify({
    type: 'player-presence',
    version: 2,
    x: 10,
    y: 20,
    direction: 'down',
    moving: true,
    mapRoomName: '玄関',
    voiceRoomName: 'entrance',
    sequence: 2,
    sentAt: 99,
  }),
);
const v2Decoded = decodePlayerPresencePayload(v2Payload, PLAYER_PRESENCE_TOPIC);
assert(v2Decoded !== null, 'v2 still accepted');
assert(v2Decoded!.avatarType === DEFAULT_AVATAR_TYPE, 'v2 falls back to default avatar');
assert(v2Decoded!.version === 3, 'v2 normalized to v3 shape');

const remote: RemotePlayerPosition = {
  participantIdentity: 'p1',
  participantName: 'A',
  x: 1,
  y: 2,
  direction: 'up',
  moving: false,
  sequence: 1,
  sentAt: 1,
  mapRoomName: null,
  voiceRoomName: null,
  avatarType: 'female',
};
assert(remote.avatarType === 'female', 'RemotePlayerPosition carries avatarType');

console.log('check-avatar-types: ok');
