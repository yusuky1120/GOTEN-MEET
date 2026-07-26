import app, { type WorkerBindings } from '../src/worker.ts';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const frontendOrigin = 'http://localhost:5173';
const bindings: WorkerBindings = {
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
  ALLOWED_ORIGINS: frontendOrigin,
};

const health = await app.request('http://worker.test/health');
assert(health.status === 200, 'health returns 200 without bindings');
const healthPayload = (await health.json()) as Record<string, unknown>;
assert(healthPayload.status === 'ok', 'health payload is ok');
assert(healthPayload.runtime === 'cloudflare-workers', 'health reports Worker runtime');

const preflight = await app.request(
  'http://worker.test/api/livekit/session',
  {
    method: 'OPTIONS',
    headers: { Origin: frontendOrigin },
  },
  bindings,
);
assert(preflight.status === 204, 'allowed CORS preflight succeeds');
assert(
  preflight.headers.get('Access-Control-Allow-Origin') === frontendOrigin,
  'allowed CORS origin is echoed',
);

const rejectedOrigin = await app.request(
  'http://worker.test/api/livekit/session',
  {
    method: 'OPTIONS',
    headers: { Origin: 'https://not-allowed.example' },
  },
  bindings,
);
assert(rejectedOrigin.status === 403, 'unknown CORS origin is rejected');

const session = await app.request(
  'http://worker.test/api/livekit/session',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: frontendOrigin,
    },
    body: JSON.stringify({ participantName: 'worker-check' }),
  },
  bindings,
);
assert(session.status === 200, 'session endpoint returns 200');
assert(
  session.headers.get('Access-Control-Allow-Origin') === frontendOrigin,
  'session response includes CORS header',
);
const sessionPayload = (await session.json()) as Record<string, unknown>;
assert(sessionPayload.serverUrl === bindings.LIVEKIT_URL, 'session returns configured LiveKit URL');
assert(typeof sessionPayload.participantIdentity === 'string', 'session returns participant identity');
assert(typeof sessionPayload.presenceToken === 'string', 'session returns presence token');
assert(sessionPayload.presenceRoomName === 'goten-presence', 'session uses fixed Presence Room');

const participantIdentity = sessionPayload.participantIdentity as string;
const voice = await app.request(
  'http://worker.test/api/livekit/voice-token',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: frontendOrigin,
    },
    body: JSON.stringify({
      roomName: 'living-room',
      participantName: 'worker-check',
      participantIdentity,
    }),
  },
  bindings,
);
assert(voice.status === 200, 'voice-token endpoint returns 200');
const voicePayload = (await voice.json()) as Record<string, unknown>;
assert(voicePayload.serverUrl === bindings.LIVEKIT_URL, 'voice token returns configured LiveKit URL');
assert(typeof voicePayload.participantToken === 'string', 'voice token is present');
assert(
  voicePayload.participantIdentity === participantIdentity,
  'voice token preserves session identity',
);

const invalidRequest = await app.request(
  'http://worker.test/api/livekit/session',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantName: '' }),
  },
  bindings,
);
assert(invalidRequest.status === 400, 'invalid request is rejected');

console.log('check-worker: ok');
