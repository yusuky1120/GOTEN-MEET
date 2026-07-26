# Cloudflare Workers / Pages deployment

The repository now contains a Cloudflare Workers entry point for the existing LiveKit token API. The local Node server remains available and unchanged for `npm run dev:app`.

## Added runtime layout

```text
Cloudflare Pages
  React / Phaser frontend
        |
        | POST /api/livekit/session
        | POST /api/livekit/voice-token
        v
Cloudflare Workers
  Hono token API
        |
        v
LiveKit Cloud
```

## What can be checked before obtaining LiveKit Cloud credentials

```bash
cd server
npm ci
npm run typecheck
npm run build
npm run worker:check
```

`worker:check` bundles the Worker with Wrangler in dry-run mode and does not deploy it.

The health route does not read LiveKit credentials:

```bash
cd server
npm run worker:dev
curl -i http://localhost:8787/health
```

Expected response:

```json
{"status":"ok","runtime":"cloudflare-workers"}
```

## Local Worker test with the local LiveKit server

```bash
cp server/.dev.vars.example server/.dev.vars
livekit-server --dev
cd server
npm run worker:dev
```

`server/.dev.vars` is ignored by Git. The checked-in example only contains the standard `livekit-server --dev` development credentials.

## Values to add after creating the LiveKit Cloud project

The Worker expects these bindings:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `ALLOWED_ORIGINS`

Do not add the API secret to `wrangler.jsonc` or source files. From `server/`, set the values with Wrangler or the Cloudflare dashboard:

```bash
npx wrangler@4 secret put LIVEKIT_URL
npx wrangler@4 secret put LIVEKIT_API_KEY
npx wrangler@4 secret put LIVEKIT_API_SECRET
npx wrangler@4 secret put ALLOWED_ORIGINS
```

For `ALLOWED_ORIGINS`, enter the exact frontend origin without a trailing slash, for example:

```text
https://goten-meet.pages.dev
```

Multiple origins can be comma-separated while migrating between GitHub Pages and Cloudflare Pages.

## Deploy the Worker

After the bindings are configured:

```bash
cd server
npm run worker:deploy
```

Then verify:

```bash
curl -i https://<worker-host>/health
```

## Configure the frontend

For Cloudflare Pages, configure these build variables:

```text
VITE_TOKEN_API_BASE_URL=https://<worker-host>
VITE_BASE_PATH=/
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

For the existing GitHub Pages build, keep:

```text
VITE_TOKEN_API_BASE_URL=
VITE_BASE_PATH=/GOTEN-MEET/
```

When `VITE_TOKEN_API_BASE_URL` is empty, local development continues to use Vite's `/api` proxy and the Node token server on port 8787.

## Security boundary

The browser receives short-lived participant tokens only. LiveKit API credentials remain in Worker bindings and are never included in the frontend bundle. The Worker rejects browser requests whose `Origin` is not present in `ALLOWED_ORIGINS`.
