/**
 * Onboarding / join session policy checks.
 * Run: npx tsx scripts/check-onboarding-session.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getVoiceControlMode } from '../src/controls/MicrophoneButton.tsx';
import {
  canStartJoin,
  didPresenceDisconnect,
  shouldCloseJoinOverlay,
  shouldKeepJoinOverlayOnPresenceFailure,
  shouldKeepPresenceOnVoiceFailure,
  shouldShowJoinOverlay,
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
  shouldShowJoinOverlay({ joining: true, presenceConnected: true }),
  'voice join attempt keeps overlay visible after Presence connects',
);
assert(
  !shouldShowJoinOverlay({ joining: false, presenceConnected: true }),
  'settled join with Presence closes overlay',
);
assert(
  shouldShowJoinOverlay({ joining: false, presenceConnected: false }),
  'Presence failure keeps overlay visible',
);

assert(
  didPresenceDisconnect({ wasConnected: true, connected: false }),
  'connected to disconnected is detected',
);
assert(
  !didPresenceDisconnect({ wasConnected: false, connected: false }),
  'initial disconnected state is not treated as a lost session',
);
assert(
  !didPresenceDisconnect({ wasConnected: true, connected: true }),
  'steady connected state is not treated as disconnect',
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

assert(getVoiceControlMode(false, 'idle') === 'disabled', 'not joined disables mic');
assert(getVoiceControlMode(true, 'idle') === 'retry', 'idle voice can retry');
assert(getVoiceControlMode(true, 'error') === 'retry', 'error voice can retry');
assert(getVoiceControlMode(true, 'connecting') === 'busy', 'connecting voice is busy');
assert(getVoiceControlMode(true, 'switching') === 'busy', 'switching voice is busy');
assert(getVoiceControlMode(true, 'disconnecting') === 'busy', 'disconnecting voice is busy');
assert(getVoiceControlMode(true, 'connected') === 'mute', 'connected voice toggles mute');

assert(toLiveKitRoomName('リビング') === 'living-room', 'map room decides voice room');
assert(toLiveKitRoomName('キッチン') === toLiveKitRoomName('廊下'), 'kitchen/hallway shared');

const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
assert(!appSource.includes('VoicePanel'), 'App does not mount VoicePanel');
assert(!appSource.includes('left-panel-stack'), 'left panel stack removed');
assert(appSource.includes('shouldShowJoinOverlay'), 'App keeps modal through the Voice attempt');
assert(appSource.includes('didPresenceDisconnect'), 'App detects unexpected Presence disconnect');
assert(appSource.includes('session.leave()'), 'App cleans Voice/profile after Presence disconnect');
assert(
  appSource.includes('installPhaserKeyboardCaptureSync(game)'),
  'App synchronizes Phaser key capture with DOM text focus',
);

const controlsIndex = appSource.indexOf('className="game-controls"');
const micIndex = appSource.indexOf('<MicrophoneButton', controlsIndex);
const helpIndex = appSource.indexOf('<GameHelpButton', controlsIndex);
assert(controlsIndex >= 0, 'game controls wrapper exists');
assert(micIndex > controlsIndex && helpIndex > micIndex, 'mic is rendered above the help button');

const hookOccurrences = appSource.match(/useRealtimeSession\(/g)?.length ?? 0;
assert(hookOccurrences === 1, 'App creates exactly one realtime session');
assert(
  !existsSync(resolve('src/realtime/RealtimeExperience.tsx')),
  'unused RealtimeExperience wrapper removed',
);

const sessionSource = readFileSync(resolve('src/realtime/useRealtimeSession.ts'), 'utf8');
assert(!sessionSource.includes('manualRoomName'), 'no manual voice room input state');
assert(!sessionSource.includes('syncWithMap'), 'no map-sync checkbox state');
assert(sessionSource.includes('toLiveKitRoomName(currentMapRoomRef.current)'), 'voice room from map');

const joinOverlay = readFileSync(resolve('src/onboarding/JoinOverlay.tsx'), 'utf8');
assert(joinOverlay.includes('参加する'), 'join button present');
assert(!joinOverlay.includes('Presenceへ接続'), 'no Presence jargon on join');
assert(!joinOverlay.includes('Voiceへ接続'), 'no Voice jargon on join');

const captureSource = readFileSync(resolve('src/game/phaserKeyboardCapture.ts'), 'utf8');
assert(captureSource.includes('isTextEntryFocused()'), 'capture sync uses the shared text-focus check');
assert(captureSource.includes('disableGlobalCapture()'), 'text focus disables Phaser key capture');
assert(captureSource.includes('enableGlobalCapture()'), 'blur restores Phaser key capture');
assert(captureSource.includes("addEventListener('focusin'"), 'focusin is observed');
assert(captureSource.includes("addEventListener('focusout'"), 'focusout is observed');

const remoteSource = readFileSync(resolve('src/game/remotePlayers.ts'), 'utf8');
assert(!remoteSource.includes('roomLabel'), 'remote room label is not rendered');
assert(remoteSource.includes('mapRoomName'), 'mapRoomName remains available internally');
assert(remoteSource.includes('nameLabel'), 'remote display name remains rendered');
assert(remoteSource.includes('REMOTE_NAME_OFFSET_Y = -32'), 'name label uses final y offset');

console.log('check-onboarding-session: ok');
