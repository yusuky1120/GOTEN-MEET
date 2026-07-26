const DEFAULT_TOKEN_API_BASE_URL = 'https://goten-meet-token-api.yusuky1120.workers.dev';

export async function onRequestPost(context) {
  const targetBaseUrl = String(
    context.env.TOKEN_API_BASE_URL || DEFAULT_TOKEN_API_BASE_URL,
  ).replace(/\/+$/, '');

  const headers = new Headers(context.request.headers);
  headers.delete('host');

  return fetch(`${targetBaseUrl}/api/livekit/session`, {
    method: 'POST',
    headers,
    body: context.request.body,
    redirect: 'manual',
  });
}

export function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
