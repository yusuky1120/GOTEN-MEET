import { setLocalParticipantIdentity } from '../game/seatOccupancy';

const LIVEKIT_API_PATH_PREFIX = '/api/livekit/';
const SESSION_PATH = '/api/livekit/session';

function normalizeBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, '') ?? '';
}

function toUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof Request) return new URL(input.url);
    if (input instanceof URL) return new URL(input.toString());
    return new URL(input, window.location.origin);
  } catch {
    return null;
  }
}

function rewriteApiInput(input: RequestInfo | URL, apiBaseUrl: string): RequestInfo | URL {
  if (!apiBaseUrl) return input;

  const url = toUrl(input);
  if (
    !url ||
    url.origin !== window.location.origin ||
    !url.pathname.startsWith(LIVEKIT_API_PATH_PREFIX)
  ) {
    return input;
  }

  const rewritten = new URL(`${apiBaseUrl}${url.pathname}${url.search}${url.hash}`);
  if (input instanceof Request) return new Request(rewritten, input);
  return rewritten;
}

function isSessionRequest(input: RequestInfo | URL): boolean {
  return toUrl(input)?.pathname === SESSION_PATH;
}

async function captureSessionIdentity(response: Response): Promise<void> {
  if (!response.ok) return;
  try {
    const payload = (await response.clone().json()) as unknown;
    if (payload === null || typeof payload !== 'object') return;
    const identity = (payload as Record<string, unknown>).participantIdentity;
    if (typeof identity === 'string') setLocalParticipantIdentity(identity);
  } catch {
    // The normal connection flow owns response validation and error display.
  }
}

/**
 * Keep local development on Vite's /api proxy, while allowing Cloudflare Pages
 * to call a separately deployed Worker through VITE_TOKEN_API_BASE_URL.
 *
 * The successful session response is also the authoritative source of the
 * local LiveKit identity used to resolve simultaneous seat claims.
 */
export function installTokenApiFetch(): void {
  const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_TOKEN_API_BASE_URL);
  const originalFetch = window.fetch.bind(window);

  if (
    !apiBaseUrl &&
    typeof window !== 'undefined' &&
    /\.pages\.dev$/i.test(window.location.hostname)
  ) {
    console.error(
      '[GOTEN MEET] VITE_TOKEN_API_BASE_URL is empty on Cloudflare Pages. ' +
        'Session POSTs will hit Pages (HTTP 405). Rebuild with the Worker URL.',
    );
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(rewriteApiInput(input, apiBaseUrl), init);
    if (isSessionRequest(input)) await captureSessionIdentity(response);
    return response;
  };
}
