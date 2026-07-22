import {
  HOUSE_CHAT_VERSION,
  MAX_CHAT_DISPLAY_NAME_LENGTH,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_MESSAGES,
} from './chatConstants';
import type { HouseChatMessage, IncomingHouseChatPayload } from './chatTypes';

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Count visible characters by Unicode code points (not UTF-16 code units). */
export function countChatCharacters(text: string): number {
  return Array.from(text).length;
}

/** Collapse newlines/whitespace runs, then trim. */
export function normalizeChatText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export type ChatValidationFailure = {
  ok: false;
  message: string;
};

export type ChatValidationSuccess = {
  ok: true;
  text: string;
};

export function validateOutgoingChatText(
  raw: string,
): ChatValidationSuccess | ChatValidationFailure {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'メッセージが不正です。' };
  }

  const text = normalizeChatText(raw);
  if (countChatCharacters(text) === 0) {
    return { ok: false, message: 'メッセージが空です。' };
  }
  if (countChatCharacters(text) > MAX_CHAT_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `メッセージは${MAX_CHAT_MESSAGE_LENGTH}文字以内にしてください。`,
    };
  }
  if (CONTROL_CHARS.test(text)) {
    return { ok: false, message: '使用できない文字が含まれています。' };
  }

  return { ok: true, text };
}

export function sanitizeChatDisplayName(name: string, fallbackIdentity: string): string {
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const source = cleaned.length > 0 ? cleaned : fallbackIdentity || 'unknown';
  if (countChatCharacters(source) <= MAX_CHAT_DISPLAY_NAME_LENGTH) return source;
  return `${Array.from(source).slice(0, MAX_CHAT_DISPLAY_NAME_LENGTH - 1).join('')}…`;
}

export function isValidIncomingChatPayload(payload: IncomingHouseChatPayload): boolean {
  if (!payload.id || typeof payload.id !== 'string') return false;
  if (!payload.participantIdentity || typeof payload.participantIdentity !== 'string') {
    return false;
  }
  if (typeof payload.text !== 'string') return false;

  const version = payload.attributes?.version;
  if (version !== undefined && version !== HOUSE_CHAT_VERSION) return false;

  return validateOutgoingChatText(payload.text).ok;
}

export function appendChatMessage(
  messages: readonly HouseChatMessage[],
  next: HouseChatMessage,
  seenIds: Set<string>,
): { messages: HouseChatMessage[]; added: boolean } {
  if (seenIds.has(next.id)) {
    return { messages: [...messages], added: false };
  }

  seenIds.add(next.id);
  const merged = [...messages, next];
  if (merged.length <= MAX_CHAT_MESSAGES) {
    return { messages: merged, added: true };
  }

  const overflow = merged.length - MAX_CHAT_MESSAGES;
  const trimmed = merged.slice(overflow);
  for (const removed of merged.slice(0, overflow)) {
    seenIds.delete(removed.id);
  }
  return { messages: trimmed, added: true };
}
