import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createParticipantToken } from './livekit/createParticipantToken.js';
import {
  parseSessionRequest,
  parseVoiceTokenRequest,
} from './validation/tokenRequest.js';

const PRESENCE_ROOM_NAME = 'goten-presence';

export type WorkerBindings = {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  ALLOWED_ORIGINS?: string;
};

type WorkerEnv = {
  Bindings: WorkerBindings;
};

type WorkerConfig = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
};

function requireBinding(bindings: WorkerBindings, name: keyof WorkerBindings): string {
  const value = bindings[name]?.trim();
  if (!value) {
    throw new Error(`Missing required Worker binding: ${name}`);
  }
  return value;
}

function loadWorkerConfig(bindings: WorkerBindings): WorkerConfig {
  const livekitUrl = requireBinding(bindings, 'LIVEKIT_URL');
  if (!/^wss?:\/\//i.test(livekitUrl)) {
    throw new Error('LIVEKIT_URL must start with ws:// or wss://');
  }

  return {
    livekitUrl,
    livekitApiKey: requireBinding(bindings, 'LIVEKIT_API_KEY'),
    livekitApiSecret: requireBinding(bindings, 'LIVEKIT_API_SECRET'),
  };
}

function allowedOrigins(bindings: WorkerBindings): Set<string> {
  return new Set(
    (bindings.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

/**
 * Exact ALLOWED_ORIGINS matches, plus Cloudflare Pages per-deployment hosts
 * when the project apex (e.g. https://goten-meet.pages.dev) is allowlisted.
 */
export function isOriginAllowed(origin: string, allowed: Set<string>): boolean {
  if (!origin) return false;
  if (allowed.has(origin)) return true;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== 'https:') return false;

  for (const entry of allowed) {
    let allowedUrl: URL;
    try {
      allowedUrl = new URL(entry);
    } catch {
      continue;
    }
    if (allowedUrl.protocol !== 'https:') continue;
    if (!allowedUrl.hostname.endsWith('.pages.dev')) continue;
    if (
      originUrl.hostname === allowedUrl.hostname ||
      originUrl.hostname.endsWith(`.${allowedUrl.hostname}`)
    ) {
      return true;
    }
  }

  return false;
}

const app = new Hono<WorkerEnv>();

app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin')?.replace(/\/$/, '') ?? '';
  if (origin) {
    if (!isOriginAllowed(origin, allowedOrigins(c.env))) {
      return c.json(
        {
          error: {
            code: 'ORIGIN_NOT_ALLOWED',
            message: 'Request origin is not allowed',
          },
        },
        403,
      );
    }

    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Headers', 'Content-Type');
    c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    c.header('Access-Control-Max-Age', '86400');
    c.header('Vary', 'Origin');
  }

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
});

app.get('/health', (c) => c.json({ status: 'ok', runtime: 'cloudflare-workers' }));

app.post('/api/livekit/session', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON',
        },
      },
      400,
    );
  }

  const parsed = parseSessionRequest(body);
  if ('code' in parsed) return c.json({ error: parsed }, 400);

  const config = loadWorkerConfig(c.env);
  const participantIdentity = crypto.randomUUID();

  try {
    const { participantToken: presenceToken } = await createParticipantToken({
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      roomName: PRESENCE_ROOM_NAME,
      participantName: parsed.participantName,
      participantIdentity,
      grantKind: 'presence',
    });

    return c.json({
      serverUrl: config.livekitUrl,
      participantIdentity,
      presenceToken,
      presenceRoomName: PRESENCE_ROOM_NAME,
    });
  } catch (error) {
    console.error('Failed to create LiveKit session', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'unknown error',
    });
    throw new HTTPException(500, { message: 'Failed to create session' });
  }
});

app.post('/api/livekit/voice-token', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON',
        },
      },
      400,
    );
  }

  const parsed = parseVoiceTokenRequest(body);
  if ('code' in parsed) return c.json({ error: parsed }, 400);

  const config = loadWorkerConfig(c.env);

  try {
    const { participantToken } = await createParticipantToken({
      apiKey: config.livekitApiKey,
      apiSecret: config.livekitApiSecret,
      roomName: parsed.roomName,
      participantName: parsed.participantName,
      participantIdentity: parsed.participantIdentity,
      grantKind: 'voice',
    });

    return c.json({
      serverUrl: config.livekitUrl,
      participantToken,
      participantIdentity: parsed.participantIdentity,
    });
  } catch (error) {
    console.error('Failed to create LiveKit voice token', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : 'unknown error',
    });
    throw new HTTPException(500, { message: 'Failed to create voice token' });
  }
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    const status = error.status;
    if (status >= 500) {
      return c.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
          },
        },
        status,
      );
    }
    return c.json(
      {
        error: {
          code: 'REQUEST_ERROR',
          message: error.message || 'Request failed',
        },
      },
      status,
    );
  }

  console.error('Unhandled Worker error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : 'unknown error',
  });

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    },
    500,
  );
});

export default app;
