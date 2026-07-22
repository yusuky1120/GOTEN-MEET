/**
 * User-facing connection error messages. Never include secrets, JWTs, or stacks.
 */

export type ConnectionErrorContext =
  | 'session'
  | 'voice-token'
  | 'presence'
  | 'voice'
  | 'voice-switch'
  | 'generic';

const CLASSIFIED_MARKER = Symbol.for('goten.classifiedConnectionError');

export class ClassifiedConnectionError extends Error {
  readonly [CLASSIFIED_MARKER] = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'ClassifiedConnectionError';
  }
}

export function isClassifiedConnectionError(
  error: unknown,
): error is ClassifiedConnectionError {
  return (
    error instanceof ClassifiedConnectionError ||
    (typeof error === 'object' &&
      error !== null &&
      CLASSIFIED_MARKER in error &&
      (error as { [CLASSIFIED_MARKER]?: unknown })[CLASSIFIED_MARKER] === true)
  );
}

/** Wrap an already user-facing message so callers do not reclassify it. */
export function classifiedConnectionError(message: string): ClassifiedConnectionError {
  return new ClassifiedConnectionError(message);
}

function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function tokenApiUnavailableMessage(): string {
  if (isLocalDevHost()) {
    return 'トークンAPI（localhost:8787）に接続できません。server で npm run dev を起動してください。';
  }
  return 'トークンAPIに接続できません。バックエンドの公開URLまたはAPIルーティングを確認してください。';
}

function presenceUnreachableMessage(): string {
  return isLocalDevHost()
    ? 'Presence接続に失敗しました。LiveKit Server（localhost:7880）が起動しているか確認してください。'
    : 'Presence接続に失敗しました。LiveKit Serverの公開URLを確認してください。';
}

function voiceUnreachableMessage(): string {
  return isLocalDevHost()
    ? 'Voice接続に失敗しました。LiveKit Server（localhost:7880）が起動しているか確認してください。'
    : 'Voice接続に失敗しました。LiveKit Serverの公開URLを確認してください。';
}

function liveKitGenericUnreachableMessage(): string {
  return isLocalDevHost()
    ? 'LiveKit Serverに接続できません。livekit-server --dev が起動しているか確認してください。'
    : 'LiveKit Serverに接続できません。バックエンド／LiveKitの公開設定を確認してください。';
}

function readApiErrorMessage(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as { error?: { message?: unknown; code?: unknown } };
  if (typeof record.error?.message === 'string' && record.error.message.trim()) {
    const message = record.error.message.trim();
    if (/eyJ[A-Za-z0-9_-]{10,}/.test(message)) return null;
    return message;
  }
  return null;
}

function looksLikeOurApiErrorBody(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === 'object' &&
    'error' in (body as object) &&
    typeof (body as { error?: unknown }).error === 'object' &&
    (body as { error: unknown }).error !== null
  );
}

function isMicPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  const message = error.message.toLowerCase();
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    message.includes('permission denied') ||
    message.includes('notallowederror') ||
    (message.includes('microphone') && message.includes('denied'))
  );
}

function isLiveKitUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('websocket') ||
    message.includes('failed to connect') ||
    message.includes('connection refused') ||
    message.includes('networkerror') ||
    message.includes('could not establish') ||
    message.includes('server may be restarting') ||
    message.includes('room connection')
  );
}

function isFetchNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch/i.test(error.message))
  );
}

function messageForFetchFailure(context: ConnectionErrorContext): string {
  if (context === 'session' || context === 'voice-token') {
    return tokenApiUnavailableMessage();
  }
  if (context === 'presence') {
    return presenceUnreachableMessage();
  }
  if (context === 'voice' || context === 'voice-switch') {
    return voiceUnreachableMessage();
  }
  return tokenApiUnavailableMessage();
}

export function classifyFetchNetworkError(
  error: unknown,
  context: ConnectionErrorContext,
): string {
  if (isClassifiedConnectionError(error)) {
    return error.message;
  }

  if (isMicPermissionError(error)) {
    return 'マイクの使用が拒否されました。ブラウザのサイト設定でマイクを許可してください。';
  }

  if (isFetchNetworkFailure(error)) {
    return messageForFetchFailure(context);
  }

  if (isLiveKitUnreachable(error)) {
    if (context === 'presence') return presenceUnreachableMessage();
    if (context === 'voice' || context === 'voice-switch') return voiceUnreachableMessage();
    return liveKitGenericUnreachableMessage();
  }

  if (error instanceof Error && error.message === 'Operation cancelled') {
    return error.message;
  }

  if (context === 'presence') {
    return 'Presence接続に失敗しました。しばらくしてから再接続してください。';
  }
  if (context === 'voice') {
    return 'Voice接続に失敗しました。マップ表示は維持されています。';
  }
  if (context === 'voice-switch') {
    return 'Voice roomの切り替えに失敗しました。';
  }
  if (context === 'session') {
    return 'セッション開始に失敗しました。';
  }
  if (context === 'voice-token') {
    return 'Voiceトークンの取得に失敗しました。';
  }

  return '接続に失敗しました。';
}

export function classifyHttpApiFailure(
  status: number,
  body: unknown,
  context: 'session' | 'voice-token',
): string {
  const apiMessage = readApiErrorMessage(body);
  const errorCode =
    looksLikeOurApiErrorBody(body) &&
    typeof (body as { error?: { code?: unknown } }).error?.code === 'string'
      ? (body as { error: { code: string } }).error.code
      : null;

  if (status === 502 || status === 503 || status === 504 || errorCode === 'PROXY_ERROR') {
    return tokenApiUnavailableMessage();
  }

  if (status === 0) {
    return tokenApiUnavailableMessage();
  }

  if (status === 400 && apiMessage) {
    return apiMessage;
  }

  // GitHub Pages / static hosts: /api/* often returns 404 HTML with no JSON body.
  if (status === 404) {
    if (apiMessage) return apiMessage;
    if (!isLocalDevHost() && !looksLikeOurApiErrorBody(body)) {
      return tokenApiUnavailableMessage();
    }
    return context === 'session'
      ? `セッション開始に失敗しました（HTTP 404）。`
      : `Voiceトークンの取得に失敗しました（HTTP 404）。`;
  }

  // Vite may return HTTP 500 with empty/plain body when :8787 is down.
  if (status >= 500) {
    if (!looksLikeOurApiErrorBody(body)) {
      return tokenApiUnavailableMessage();
    }

    return context === 'session'
      ? 'セッション開始APIでサーバーエラーが発生しました。サーバーログとLiveKit設定を確認してください。'
      : 'VoiceトークンAPIでサーバーエラーが発生しました。サーバーログとLiveKit設定を確認してください。';
  }

  if (apiMessage) return apiMessage;

  return context === 'session'
    ? `セッション開始に失敗しました（HTTP ${status}）。`
    : `Voiceトークンの取得に失敗しました（HTTP ${status}）。`;
}

/**
 * Classify raw connect/network errors. Already-classified errors keep their message.
 */
export function classifyConnectError(
  error: unknown,
  context: ConnectionErrorContext,
): string {
  if (isClassifiedConnectionError(error)) {
    return error.message;
  }
  if (isMicPermissionError(error)) {
    return 'マイクの使用が拒否されました。ブラウザのサイト設定でマイクを許可してください。';
  }
  return classifyFetchNetworkError(error, context);
}

/** Prefer classified message; otherwise classify once for display. */
export function userFacingConnectionMessage(
  error: unknown,
  context: ConnectionErrorContext,
): string {
  return classifyConnectError(error, context);
}

export const NO_MAPPED_ROOM_MESSAGE = '現在のマップ位置に対応する音声ルームがありません';
