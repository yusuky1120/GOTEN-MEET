# Cloudflare Workers / Pages deployment

The repository contains a Cloudflare Workers entry point for the LiveKit token API. The original frontend and local Node/Hono development flow remain unchanged.

## Runtime layout

```text
Cloudflare Pages
  React / Phaser frontend
        |
        | same-origin POST /api/livekit/session
        | same-origin POST /api/livekit/voice-token
        v
Cloudflare Pages Functions
  thin proxy only
        |
        v
Cloudflare Worker
  Hono token API
        |
        v
LiveKit Cloud
```

The frontend keeps the original relative `/api/livekit/*` requests from commit `db772238`. It does not replace `window.fetch` and does not contain a Worker URL routing hook.

## Worker checks before credentials

```bash
cd server
npm ci
npm run typecheck
npm run build
npm run worker:test
npm run worker:check
```

`worker:check` bundles the Worker with Wrangler in dry-run mode and does not deploy it.

The health route does not require LiveKit credentials:

```bash
cd server
npm run worker:dev
curl -i http://localhost:8787/health
```

Expected response:

```json
{"status":"ok","runtime":"cloudflare-workers"}
```

## Local Worker test with local LiveKit

```bash
cp server/.dev.vars.example server/.dev.vars
livekit-server --dev
cd server
npm run worker:dev
```

`server/.dev.vars` is ignored by Git. The checked-in example contains only the standard `livekit-server --dev` credentials.

## Worker bindings

The Worker expects:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `ALLOWED_ORIGINS`

Register them from `server/`:

```bash
npx wrangler@4 secret put LIVEKIT_URL
npx wrangler@4 secret put LIVEKIT_API_KEY
npx wrangler@4 secret put LIVEKIT_API_SECRET
npx wrangler@4 secret put ALLOWED_ORIGINS
```

For `ALLOWED_ORIGINS`, use the exact Pages origin without a trailing slash:

```text
https://goten-meet.pages.dev
```

Multiple origins can be comma-separated.

## Deploy the Worker

```bash
cd server
npm run worker:deploy
```

Verify:

```bash
curl -i https://goten-meet-token-api.yusuky1120.workers.dev/health
```

## Pages Functions proxy

These files preserve the original frontend API contract:

```text
functions/api/livekit/session.js
functions/api/livekit/voice-token.js
```

They forward same-origin Pages requests to the token Worker. The public Worker URL is used as the default. A Pages runtime variable can override it:

```text
TOKEN_API_BASE_URL=https://<worker-host>
```

This variable is not a secret. It is optional for the current deployment.

## Build and deploy Pages

Cloudflare Pages needs only the Vite base path at build time:

```text
VITE_BASE_PATH=/
```

Build:

```bash
VITE_BASE_PATH=/ npm run build
```

Deploy from the repository root so Wrangler includes both `dist/` and the top-level `functions/` directory:

```bash
npx wrangler@4 pages deploy dist \
  --project-name goten-meet \
  --branch main
```

For GitHub Pages, use:

```text
VITE_BASE_PATH=/GOTEN-MEET/
```

Local development continues to use the Vite `/api` proxy and the Node token server on port 8787:

```bash
npm run dev:app
```

## Security boundary

- The browser receives short-lived participant tokens only.
- LiveKit API credentials remain in Worker bindings.
- The frontend bundle does not contain the LiveKit API key or secret.
- Pages Functions only proxy the two LiveKit token routes.
- The Worker still validates `Origin` against `ALLOWED_ORIGINS`.
