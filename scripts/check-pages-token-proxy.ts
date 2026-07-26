import { onRequest as handleSession } from '../functions/api/livekit/session.js';
import { onRequest as handleVoiceToken } from '../functions/api/livekit/voice-token.js';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type PagesContext = {
  request: Request;
  env: Record<string, string>;
};

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; method: string; origin: string | null; body: string }> = [];

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input.toString();
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const body = typeof init?.body === 'string'
    ? init.body
    : init?.body
      ? await new Response(init.body).text()
      : '';

  calls.push({
    url,
    method,
    origin: headers.get('origin'),
    body,
  });

  return Response.json({ ok: true });
};

try {
  const env = { TOKEN_API_BASE_URL: 'https://token.example.test/' };

  const sessionResponse = await handleSession({
    request: new Request('https://goten.example/api/livekit/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://goten.example',
      },
      body: JSON.stringify({ participantName: 'alice' }),
    }),
    env,
  } as PagesContext);

  assert(sessionResponse.status === 200, 'session proxy returns upstream response');
  assert(calls[0]?.url === 'https://token.example.test/api/livekit/session', 'session target URL');
  assert(calls[0]?.method === 'POST', 'session method preserved');
  assert(calls[0]?.origin === 'https://goten.example', 'session origin preserved');
  assert(calls[0]?.body.includes('alice'), 'session body preserved');

  const voiceResponse = await handleVoiceToken({
    request: new Request('https://goten.example/api/livekit/voice-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://goten.example',
      },
      body: JSON.stringify({
        roomName: 'living-room',
        participantName: 'alice',
        participantIdentity: '00000000-0000-4000-8000-000000000000',
      }),
    }),
    env,
  } as PagesContext);

  assert(voiceResponse.status === 200, 'voice proxy returns upstream response');
  assert(calls[1]?.url === 'https://token.example.test/api/livekit/voice-token', 'voice target URL');
  assert(calls[1]?.body.includes('living-room'), 'voice body preserved');

  const beforeGet = calls.length;
  const getResponse = await handleSession({
    request: new Request('https://goten.example/api/livekit/session'),
    env,
  } as PagesContext);

  assert(getResponse.status === 405, 'non-POST request rejected');
  assert(calls.length === beforeGet, 'rejected method is not forwarded');

  console.log('check-pages-token-proxy: ok');
} finally {
  globalThis.fetch = originalFetch;
}
