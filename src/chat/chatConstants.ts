export const HOUSE_CHAT_TOPIC = 'goten.house-chat.v1';

export const HOUSE_CHAT_VERSION = '1';

/** Maximum Unicode code points in a single chat message (after normalize/trim). */
export const MAX_CHAT_MESSAGE_LENGTH = 140;

/**
 * Maximum UTF-8 byte size for an incoming Text Stream body.
 * 140 code points × up to 4 UTF-8 bytes each.
 */
export const MAX_CHAT_MESSAGE_BYTES = MAX_CHAT_MESSAGE_LENGTH * 4;

/** Keep at most this many messages in browser memory for the current Presence session. */
export const MAX_CHAT_MESSAGES = 100;

/** Max display-name length shown in chat. */
export const MAX_CHAT_DISPLAY_NAME_LENGTH = 32;
