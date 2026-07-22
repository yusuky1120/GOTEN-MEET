import {
  HOUSE_CHAT_VERSION,
  MAX_CHAT_DISPLAY_NAME_LENGTH,
  MAX_CHAT_MESSAGE_BYTES,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_MESSAGES,
} from './chatConstants';
import type { HouseChatMessage, IncomingHouseChatPayload } from './chatTypes';

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const textEncoder = new TextEncoder();

/** Count visible characters by Unicode code points (not UTF-16 code units). */
export function countChatCharacters(text: string): number {
  return Array.from(text).length;
}

export function utf8ByteLength(text: string): number {
  return textEncoder.encode(text).byteLength;
}

/** Collapse newlines/whitespace runs, then trim. */
export function normalizeChatText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Reject streams whose declared byte size already exceeds the chat limit.
 * Unknown / non-finite sizes are not rejected here (bounded during read).
 */
export function isIncomingChatStreamTooLarge(size: number | undefined): boolean {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return false;
  }
  return size > MAX_CHAT_MESSAGE_BYTES;
}

export function normalizeChatSentAt(sentAt: number, fallbackNow = Date.now()): number {
  if (!Number.isFinite(sentAt) || sentAt <= 0) {
    return fallbackNow;
  }
  return sentAt;
}

export function compareChatMessages(a: HouseChatMessage, b: HouseChatMessage): number {
  if (a.sentAt !== b.sentAt) return a.sentAt - b.sentAt;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
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

/**
 * Pure merge: does not mutate inputs or any external Set.
 * Sorts by sentAt (then id) and keeps the newest MAX_CHAT_MESSAGES.
 */
export function appendChatMessage(
  messages: readonly HouseChatMessage[],
  next: HouseChatMessage,
): HouseChatMessage[] {
  const normalized: HouseChatMessage = {
    ...next,
    sentAt: normalizeChatSentAt(next.sentAt),
  };

  if (messages.some((message) => message.id === normalized.id)) {
    return messages.slice();
  }

  const merged = [...messages, normalized];
  merged.sort(compareChatMessages);

  if (merged.length <= MAX_CHAT_MESSAGES) {
    return merged;
  }

  return merged.slice(merged.length - MAX_CHAT_MESSAGES);
}
