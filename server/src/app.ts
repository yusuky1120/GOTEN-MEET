import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ServerConfig } from './config.js';
import { createParticipantToken } from './livekit/createParticipantToken.js';
import {
  parseSessionRequest,
  parseVoiceTokenRequest,
} from './validation/tokenRequest.js';

/** Fixed presence room shared by all connected clients. */
export const PRESENCE_ROOM_NAME = 'goten-presence';

export type AppBindings = {
  Variables: {
    config: ServerConfig;
  };
};

export function createApp(config: ServerConfig) {
  const app = new Hono<AppBindings>();

  app.use('*', async (c, next) => {
    c.set('config', config);
    await next();
  });

  app.get('/health', (c) => c.json({ status: 'ok' }));

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
    if ('code' in parsed) {
      return c.json({ error: parsed }, 400);
    }

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
        message: error instanceof Error ? error.message : 'unknown error',
      });
      throw new HTTPException(500, {
        message: 'Failed to create session',
      });
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
    if ('code' in parsed) {
      return c.json({ error: parsed }, 400);
    }

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
        message: error instanceof Error ? error.message : 'unknown error',
      });
      throw new HTTPException(500, {
        message: 'Failed to create voice token',
      });
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

    console.error('Unhandled server error', {
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

  return app;
}
