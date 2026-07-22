/**
 * Ensures remote-player removal is membership-based, not packet-timeout-based.
 * Run: npx tsx scripts/check-remote-presence-policy.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const root = resolve(import.meta.dirname, '..');
const presence = readFileSync(resolve(root, 'src/presence/presenceSession.ts'), 'utf8');
const remotes = readFileSync(resolve(root, 'src/game/remotePlayers.ts'), 'utf8');
const constants = readFileSync(resolve(root, 'src/realtime/playerPositionConstants.ts'), 'utf8');

assert(!constants.includes('REMOTE_PLAYER_TIMEOUT_MS'), 'REMOTE_PLAYER_TIMEOUT_MS must be removed');
assert(!presence.includes('lastRemotePacketAt'), 'presenceSession must not track lastRemotePacketAt');
assert(!presence.includes('REMOTE_PLAYER_TIMEOUT_MS'), 'presenceSession must not use packet timeout');
assert(
  presence.includes('remoteParticipants.has(identity)'),
  'watchdog must use Presence Room membership',
);
assert(!remotes.includes('REMOTE_PLAYER_TIMEOUT_MS'), 'remotePlayers must not timeout-delete');
assert(!remotes.includes('lastUpdateAt'), 'remotePlayers must not store lastUpdateAt for deletion');
assert(
  !/timeMs\s*-\s*view\.lastUpdateAt/.test(remotes),
  'remotePlayers must not compare Phaser time to update stamps',
);

console.log('check-remote-presence-policy: ok');
