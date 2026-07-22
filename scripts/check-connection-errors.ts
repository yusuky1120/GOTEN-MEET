/**
 * Lightweight checks for user-facing connection error classification.
 * Run: npx tsx scripts/check-connection-errors.ts
 */
import {
  classifyConnectError,
  classifyFetchNetworkError,
  classifyHttpApiFailure,
} from '../src/realtime/connectionErrors.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  classifyHttpApiFailure(502, { error: { code: 'PROXY_ERROR', message: 'Token API is unavailable' } }, 'session').includes(
    'トークンAPI',
  ),
  '502 PROXY_ERROR => token API hint',
);
assert(
  classifyHttpApiFailure(503, null, 'voice-token').includes('トークンAPI'),
  '503 => token API hint',
);
assert(
  classifyHttpApiFailure(500, null, 'session').includes('トークンAPI'),
  'plain 500 => unavailable hint',
);
assert(
  classifyHttpApiFailure(
    500,
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    'session',
  ).includes('サーバーエラー'),
  'json 500 => real server error',
);
assert(
  classifyFetchNetworkError(new TypeError('Failed to fetch'), 'session').includes('トークンAPI'),
  'fetch fail => token API hint',
);

const mic = new Error('Permission denied');
mic.name = 'NotAllowedError';
assert(classifyConnectError(mic, 'voice').includes('マイク'), 'mic denied');

const livekit = new Error('could not establish websocket connection');
assert(classifyConnectError(livekit, 'presence').includes('Presence'), 'presence livekit hint');
assert(classifyConnectError(livekit, 'voice').includes('Voice'), 'voice livekit hint');

const leaked = classifyHttpApiFailure(
  400,
  { error: { message: 'bad eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc' } },
  'session',
);
assert(!leaked.includes('eyJ'), 'JWT-like API message stripped');

console.log('check-connection-errors: ok');
