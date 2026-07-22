/**
 * Onboarding / join session policy checks.
 * Run: npx tsx scripts/check-onboarding-session.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canStartJoin,
  shouldCloseJoinOverlay,
  shouldKeepJoinOverlayOnPresenceFailure,
  shouldKeepPresenceOnVoiceFailure,
  validateJoinName,
} from '../src/onboarding/joinValidation.ts';
import { toLiveKitRoomName } from '../src/voice/roomMapping.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(!validateJoinName('').ok, 'empty name rejected');
assert(!validateJoinName('   ').ok, 'whitespace-only rejected');
const trimmed = validateJoinName('  wasd  ');
assert(trimmed.ok && trimmed.name === 'wasd', 'trim applied');
assert(!validateJoinName('あ'.repeat(33)).ok, 'overlong name rejected');

assert(canStartJoin({ joining: false, presenceConnected: false }), 'idle can join');
assert(!canStartJoin({ joining: true, presenceConnected: false }), 'joining blocks double submit');
assert(!canStartJoin({ joining: false, presenceConnected: true }), 'already joined blocks join');

assert(
  shouldCloseJoinOverlay({ presenceConnected: true }),
  'joined closes overlay',
);
assert(
  !shouldCloseJoinOverlay({ presenceConnected: false }),
  'not joined keeps overlay',
);

assert(
  shouldKeepJoinOverlayOnPresenceFailure({
    presenceConnected: false,
    joinError: '接続できません',
  }),
  'presence failure keeps overlay',
);

assert(
  shouldKeepPresenceOnVoiceFailure({
    presenceConnected: true,
    voiceFailed: true,
  }),
  'voice failure keeps presence',
);

assert(toLiveKitRoomName('リビング') === 'living-room', 'map room decides voice room');
assert(toLiveKitRoomName('キッチン') === toLiveKitRoomName('廊下'), 'kitchen/hallway shared');

const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
assert(!appSource.includes('VoicePanel'), 'App does not mount VoicePanel');
assert(!appSource.includes('left-panel-stack'), 'left panel stack removed');

const sessionSource = readFileSync(resolve('src/realtime/useRealtimeSession.ts'), 'utf8');
assert(!sessionSource.includes('manualRoomName'), 'no manual voice room input state');
assert(!sessionSource.includes('syncWithMap'), 'no map-sync checkbox state');
assert(sessionSource.includes('toLiveKitRoomName(currentMapRoomRef.current)'), 'voice room from map');

const joinOverlay = readFileSync(resolve('src/onboarding/JoinOverlay.tsx'), 'utf8');
assert(joinOverlay.includes('参加する'), 'join button present');
assert(!joinOverlay.includes('Presenceへ接続'), 'no Presence jargon on join');
assert(!joinOverlay.includes('Voiceへ接続'), 'no Voice jargon on join');

console.log('check-onboarding-session: ok');
