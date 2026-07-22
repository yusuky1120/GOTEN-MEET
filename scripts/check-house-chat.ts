/**
 * Lightweight checks for house chat validation and Presence wiring.
 * Run: npx tsx scripts/check-house-chat.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOUSE_CHAT_TOPIC,
  HOUSE_CHAT_VERSION,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_MESSAGES,
} from '../src/chat/chatConstants.ts';
import type { HouseChatMessage, IncomingHouseChatPayload } from '../src/chat/chatTypes.ts';
import {
  appendChatMessage,
  countChatCharacters,
  isValidIncomingChatPayload,
  normalizeChatText,
  sanitizeChatDisplayName,
  validateOutgoingChatText,
} from '../src/chat/chatValidation.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(HOUSE_CHAT_TOPIC === 'goten.house-chat.v1', 'topic is fixed');
assert(MAX_CHAT_MESSAGE_LENGTH === 140, 'max length is 140');
assert(MAX_CHAT_MESSAGES === 100, 'cap is 100');
assert(countChatCharacters('あ'.repeat(140)) === 140, 'code point count jp');
assert(countChatCharacters('😀') === 1, 'emoji is one code point');

assert(!validateOutgoingChatText('').ok, 'empty rejected');
assert(!validateOutgoingChatText('   ').ok, 'whitespace-only rejected');
assert(validateOutgoingChatText('a'.repeat(140)).ok, '140 allowed');
assert(!validateOutgoingChatText('a'.repeat(141)).ok, '141 rejected');
assert(validateOutgoingChatText('あ'.repeat(140)).ok, 'jp 140 allowed');
assert(!validateOutgoingChatText('あ'.repeat(141)).ok, 'jp 141 rejected');
assert(validateOutgoingChatText('😀'.repeat(140)).ok, '140 emoji allowed');
assert(!validateOutgoingChatText('😀'.repeat(141)).ok, '141 emoji rejected');

const trimmed = validateOutgoingChatText('  hello  ');
assert(trimmed.ok && trimmed.text === 'hello', 'leading/trailing spaces trimmed');

const normalized = validateOutgoingChatText('hello\nworld');
assert(normalized.ok && normalized.text === 'hello world', 'newlines normalized to spaces');
assert(normalizeChatText('a\n\tb') === 'a b', 'normalizeChatText collapses whitespace');

assert(sanitizeChatDisplayName('', 'abcdef12xyz') === 'abcdef12xyz', 'fallback identity');

const seen = new Set<string>();
let messages: HouseChatMessage[] = [];
for (let i = 0; i < MAX_CHAT_MESSAGES; i += 1) {
  const result = appendChatMessage(
    messages,
    {
      id: `id-${i}`,
      participantIdentity: 'x',
      participantName: 'x',
      text: `m${i}`,
      sentAt: i,
      own: false,
    },
    seen,
  );
  messages = result.messages;
  assert(result.added, `added ${i}`);
}
assert(messages.length === MAX_CHAT_MESSAGES, 'cap filled');

const overflow = appendChatMessage(
  messages,
  {
    id: 'id-new',
    participantIdentity: 'x',
    participantName: 'x',
    text: 'newest',
    sentAt: 9999,
    own: false,
  },
  seen,
);
assert(overflow.messages.length === MAX_CHAT_MESSAGES, 'still capped at 100');
assert(overflow.messages[0]?.id === 'id-1', 'oldest removed');
assert(overflow.messages.at(-1)?.id === 'id-new', 'newest kept');

const dup = appendChatMessage(overflow.messages, overflow.messages.at(-1)!, seen);
assert(!dup.added, 'duplicate stream id rejected');
assert(dup.messages.length === MAX_CHAT_MESSAGES, 'length unchanged on dup');

const goodIncoming: IncomingHouseChatPayload = {
  id: 'stream-1',
  participantIdentity: 'alice',
  participantName: 'alice',
  text: 'hi',
  sentAt: 1,
  attributes: { version: HOUSE_CHAT_VERSION },
};
assert(isValidIncomingChatPayload(goodIncoming), 'valid incoming');
assert(
  !isValidIncomingChatPayload({ ...goodIncoming, attributes: { version: '0' } }),
  'bad version rejected',
);
assert(!isValidIncomingChatPayload({ ...goodIncoming, id: '' }), 'empty id rejected');

const root = resolve(import.meta.dirname, '..');
const presenceSource = readFileSync(resolve(root, 'src/presence/presenceSession.ts'), 'utf8');
assert(
  presenceSource.includes('registerTextStreamHandler(HOUSE_CHAT_TOPIC'),
  'PresenceSession registers text stream handler',
);
assert(
  presenceSource.includes('unregisterTextStreamHandler(HOUSE_CHAT_TOPIC)'),
  'PresenceSession unregisters text stream handler',
);
assert(
  presenceSource.includes('sendText(text,') && presenceSource.includes('topic: HOUSE_CHAT_TOPIC'),
  'sendText uses HOUSE_CHAT_TOPIC',
);
assert(presenceSource.includes('subscribeChat'), 'subscribeChat exists');

console.log('check-house-chat: ok');
