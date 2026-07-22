/**
 * Lightweight checks for user-facing connection error classification.
 * Run: npx tsx scripts/check-connection-errors.ts
 *
 * Note: In Node, window is undefined so isLocalDevHost() is false — matching
 * GitHub Pages / published static hosts for 404 and token-API messaging.
 */
import {
  ClassifiedConnectionError,
  classifyConnectError,
  classifyFetchNetworkError,
  classifyHttpApiFailure,
  classifiedConnectionError,
  isClassifiedConnectionError,
  userFacingConnectionMessage,
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

const pages404Html = `<!DOCTYPE html><html><head><title>404</title></head><body>File not found</body></html>`;
assert(
  classifyHttpApiFailure(404, null, 'session').includes('バックエンドの公開URL'),
  'public 404 null => routing hint',
);
assert(
  classifyHttpApiFailure(404, pages404Html, 'session').includes('バックエンドの公開URL'),
  'GitHub Pages 404 HTML => routing hint',
);
assert(
  !classifyHttpApiFailure(404, pages404Html, 'session').includes('<!DOCTYPE'),
  '404 HTML body must not leak into UI message',
);
assert(
  classifyHttpApiFailure(
    404,
    { error: { code: 'NOT_FOUND', message: 'participant not found' } },
    'session',
  ).includes('participant not found'),
  'json 404 with safe message prefers API message',
);

assert(
  classifyFetchNetworkError(new TypeError('Failed to fetch'), 'session').includes('トークンAPI'),
  'Failed to fetch + session => token API',
);
assert(
  classifyFetchNetworkError(new TypeError('Failed to fetch'), 'voice-token').includes('トークンAPI'),
  'Failed to fetch + voice-token => token API',
);
assert(
  /Presence|LiveKit/.test(
    classifyFetchNetworkError(new TypeError('Failed to fetch'), 'presence'),
  ),
  'Failed to fetch + presence => Presence/LiveKit',
);
assert(
  /Voice|LiveKit/.test(classifyFetchNetworkError(new TypeError('Failed to fetch'), 'voice')),
  'Failed to fetch + voice => Voice/LiveKit',
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

const voiceTokenDetail = classifiedConnectionError(
  classifyHttpApiFailure(
    500,
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    'voice-token',
  ),
);
assert(isClassifiedConnectionError(voiceTokenDetail), 'marker is ClassifiedConnectionError');
assert(
  userFacingConnectionMessage(voiceTokenDetail, 'voice').includes('VoiceトークンAPIでサーバーエラー'),
  'classified voice-token 500 must not be overwritten by generic voice message',
);
assert(
  !(userFacingConnectionMessage(voiceTokenDetail, 'voice') === 'Voice接続に失敗しました。マップ表示は維持されています。'),
  'generic voice fallback must not replace classified detail',
);
assert(
  classifyConnectError(voiceTokenDetail, 'voice-switch').includes('VoiceトークンAPI'),
  'voice-switch path also preserves classified token errors',
);
assert(voiceTokenDetail instanceof ClassifiedConnectionError, 'instanceof ClassifiedConnectionError');

console.log('check-connection-errors: ok');
