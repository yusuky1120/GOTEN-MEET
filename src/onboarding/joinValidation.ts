const MAX_PARTICIPANT_NAME_LENGTH = 32;

export type JoinNameValidation =
  | { ok: true; name: string }
  | { ok: false; message: string };

export function validateJoinName(raw: string): JoinNameValidation {
  const name = raw.trim();
  if (!name) {
    return { ok: false, message: '表示名を入力してください' };
  }
  if (Array.from(name).length > MAX_PARTICIPANT_NAME_LENGTH) {
    return {
      ok: false,
      message: `表示名は${MAX_PARTICIPANT_NAME_LENGTH}文字以内にしてください`,
    };
  }
  return { ok: true, name };
}

export function shouldCloseJoinOverlay(options: {
  presenceConnected: boolean;
}): boolean {
  return options.presenceConnected;
}

/** Keep the modal visible until the full join attempt, including Voice, has settled. */
export function shouldShowJoinOverlay(options: {
  joining: boolean;
  presenceConnected: boolean;
}): boolean {
  return options.joining || !options.presenceConnected;
}

export function didPresenceDisconnect(options: {
  wasConnected: boolean;
  connected: boolean;
}): boolean {
  return options.wasConnected && !options.connected;
}

export function shouldKeepJoinOverlayOnPresenceFailure(options: {
  presenceConnected: boolean;
  joinError: string | null;
}): boolean {
  return !options.presenceConnected && Boolean(options.joinError);
}

export function shouldKeepPresenceOnVoiceFailure(options: {
  presenceConnected: boolean;
  voiceFailed: boolean;
}): boolean {
  return options.presenceConnected && options.voiceFailed;
}

/** Guard for join() / StrictMode double-submit. */
export function canStartJoin(options: {
  joining: boolean;
  presenceConnected: boolean;
}): boolean {
  if (options.joining) return false;
  if (options.presenceConnected) return false;
  return true;
}
