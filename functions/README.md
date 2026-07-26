# Pages Functions

These Functions keep the frontend API contract from commit `db772238`:

- `POST /api/livekit/session`
- `POST /api/livekit/voice-token`

They proxy to the separately deployed token Worker. No LiveKit credential is stored in the Pages project or frontend bundle.

Optional Pages runtime variable:

```text
TOKEN_API_BASE_URL=https://goten-meet-token-api.yusuky1120.workers.dev
```

The current Worker URL is also used as a non-secret fallback.
