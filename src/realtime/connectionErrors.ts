/**
 * User-facing connection error messages. Never include secrets, JWTs, or stacks.
 */

export type ConnectionErrorContext =
  | 'session'
  | 'presence'
  | 'voice'
  | 'voice-switch'
  | 'generic';

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

export function classifyFetchNetworkError(
  error: unknown,
  context: ConnectionErrorContext,
): string {
  if (isMicPermissionError(error)) {
    return 'マイクの使用が拒否されました。ブラウザのサイト設定でマイクを許可してください。';
  }

  if (error instanceof TypeError || (error instanceof Error && /failed to fetch/i.test(error.message))) {
    return tokenApiUnavailableMessage();
  }

  if (isLiveKitUnreachable(error)) {
    if (context === 'presence') {
      return isLocalDevHost()
        ? 'Presence接続に失敗しました。LiveKit Server（localhost:7880）が起動しているか確認してください。'
        : 'Presence接続に失敗しました。LiveKit Serverの公開URLを確認してください。';
    }
    if (context === 'voice' || context === 'voice-switch') {
      return isLocalDevHost()
        ? 'Voice接続に失敗しました。LiveKit Server（localhost:7880）が起動しているか確認してください。'
        : 'Voice接続に失敗しました。LiveKit Serverの公開URLを確認してください。';
    }
    return isLocalDevHost()
      ? 'LiveKit Serverに接続できません。livekit-server --dev が起動しているか確認してください。'
      : 'LiveKit Serverに接続できません。バックエンド／LiveKitの公開設定を確認してください。';
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

  return '接続に失敗しました。';
}

export function classifyHttpApiFailure(
  status: number,
  body: unknown,
  context: 'session' | 'voice-token',
): string {
  const apiMessage = readApiErrorMessage(body);
  const errorCode =
    body !== null &&
    typeof body === 'object' &&
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

  // Vite may return HTTP 500 with empty/plain body when :8787 is down.
  if (status >= 500) {
    const looksLikeOurApi =
      body !== null &&
      typeof body === 'object' &&
      'error' in (body as object) &&
      typeof (body as { error?: unknown }).error === 'object';

    if (!looksLikeOurApi) {
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

export function classifyConnectError(
  error: unknown,
  context: ConnectionErrorContext,
): string {
  if (isMicPermissionError(error)) {
    return 'マイクの使用が拒否されました。ブラウザのサイト設定でマイクを許可してください。';
  }
  return classifyFetchNetworkError(error, context);
}

export const NO_MAPPED_ROOM_MESSAGE = '現在のマップ位置に対応する音声ルームがありません';
