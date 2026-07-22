/**
 * Lightweight checks for presence payload codec (no test framework).
 * Run: npx tsx scripts/check-player-presence.ts
 */
import { DEFAULT_AVATAR_TYPE } from '../src/avatar/avatarTypes.ts';
import { PLAYER_PRESENCE_TOPIC } from '../src/presence/presenceConstants.ts';
import {
  decodePlayerPresencePayload,
  encodePlayerPresenceMessage,
} from '../src/realtime/playerPresenceCodec.ts';
import type { LocalPresenceState } from '../src/presence/presenceTypes.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const state: LocalPresenceState = {
  x: 100,
  y: 200,
  direction: 'down',
  moving: true,
  mapRoomName: 'リビング',
  voiceRoomName: 'kitchen',
  avatarType: DEFAULT_AVATAR_TYPE,
};

const encoded = encodePlayerPresenceMessage(state, { sequence: 3, sentAt: 1_700_000_000_000 });
const decoded = decodePlayerPresencePayload(encoded, PLAYER_PRESENCE_TOPIC);
assert(decoded !== null, 'valid payload decodes');
assert(decoded!.version === 3, 'version 3');
assert(decoded!.avatarType === DEFAULT_AVATAR_TYPE, 'avatarType preserved');
assert(decoded!.voiceRoomName === 'kitchen', 'voiceRoomName preserved');
assert(decoded!.mapRoomName === 'リビング', 'mapRoomName preserved');
assert(decoded!.sequence === 3, 'sequence preserved');

// Different voice room must still be accepted (no room filter in codec).
const otherRoom = encodePlayerPresenceMessage(
  { ...state, voiceRoomName: 'hallway' },
  { sequence: 4, sentAt: 1_700_000_000_001 },
);
assert(
  decodePlayerPresencePayload(otherRoom, PLAYER_PRESENCE_TOPIC) !== null,
  'different voiceRoomName still accepted',
);

// Reject wrong topic
assert(decodePlayerPresencePayload(encoded, 'goten.player-position.v1') === null, 'old topic rejected');

// Reject bad coordinates
const badCoords = new TextEncoder().encode(
  JSON.stringify({
    type: 'player-presence',
    version: 3,
    x: 999_999,
    y: 0,
    direction: 'up',
    moving: false,
    mapRoomName: null,
    voiceRoomName: null,
    avatarType: 'male',
    sequence: 1,
    sentAt: 1,
  }),
);
assert(decodePlayerPresencePayload(badCoords, PLAYER_PRESENCE_TOPIC) === null, 'bad coords rejected');

// Reject old version
const oldVersion = new TextEncoder().encode(
  JSON.stringify({
    type: 'player-presence',
    version: 1,
    x: 1,
    y: 2,
    direction: 'up',
    moving: false,
    mapRoomName: null,
    voiceRoomName: null,
    sequence: 1,
    sentAt: 1,
  }),
);
assert(decodePlayerPresencePayload(oldVersion, PLAYER_PRESENCE_TOPIC) === null, 'old version rejected');

// Sequence duplicate check (mirrors PresenceSession accept rule).
function shouldAcceptSequence(previous: number | undefined, next: number): boolean {
  if (previous !== undefined && next <= previous) return false;
  return true;
}
assert(shouldAcceptSequence(undefined, 1), 'first sequence accepted');
assert(shouldAcceptSequence(5, 6), 'increasing accepted');
assert(!shouldAcceptSequence(5, 5), 'duplicate rejected');
assert(!shouldAcceptSequence(5, 4), 'older rejected');

console.log('check-player-presence: ok');
