/**
 * Fail Cloudflare Pages builds when the token Worker URL is missing.
 * Local `npm run build` stays unchanged; use `npm run build:pages` for deploy artifacts.
 */
const base = process.env.VITE_TOKEN_API_BASE_URL?.trim() ?? '';
if (!base) {
  console.error(
    [
      'VITE_TOKEN_API_BASE_URL is required for Cloudflare Pages builds.',
      'Example:',
      '  VITE_TOKEN_API_BASE_URL=https://goten-meet-token-api.yusuky1120.workers.dev npm run build:pages',
      'Without it the SPA POSTs /api/livekit/session to Pages itself and gets HTTP 405.',
    ].join('\n'),
  );
  process.exit(1);
}

if (!/^https:\/\//i.test(base)) {
  console.error('VITE_TOKEN_API_BASE_URL must be an https:// Worker URL.');
  process.exit(1);
}

console.log(`build:pages using token API host: ${new URL(base).host}`);
