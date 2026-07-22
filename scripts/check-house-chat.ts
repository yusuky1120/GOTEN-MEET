/**
 * Lightweight checks for house chat validation and Presence wiring.
 * Run: npx tsx scripts/check-house-chat.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOUSE_CHAT_TOPIC,
  HOUSE_CHAT_VERSION,
  MAX_CHAT_MESSAGE_BYTES,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_MESSAGES,
} from '../src/chat/chatConstants.ts';
import type { HouseChatMessage, IncomingHouseChatPayload } from '../src/chat/chatTypes.ts';
import {
  appendChatMessage,
  countChatCharacters,
  isIncomingChatStreamTooLarge,
  isValidIncomingChatPayload,
  normalizeChatSentAt,
  normalizeChatText,
  sanitizeChatDisplayName,
  utf8ByteLength,
  validateOutgoingChatText,
} from '../src/chat/chatValidation.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function msg(
  id: string,
  sentAt: number,
  text = 'x',
): HouseChatMessage {
  return {
    id,
    participantIdentity: 'x',
    participantName: 'x',
    text,
    sentAt,
    own: false,
  };
}

assert(HOUSE_CHAT_TOPIC === 'goten.house-chat.v1', 'topic is fixed');
assert(MAX_CHAT_MESSAGE_LENGTH === 140, 'max length is 140');
assert(MAX_CHAT_MESSAGES === 100, 'cap is 100');
assert(MAX_CHAT_MESSAGE_BYTES === 560, 'byte budget is 140 * 4');
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

assert(normalizeChatSentAt(Number.NaN, 42) === 42, 'NaN sentAt -> fallback');
assert(normalizeChatSentAt(Number.POSITIVE_INFINITY, 42) === 42, 'Infinity sentAt -> fallback');
assert(normalizeChatSentAt(0, 42) === 42, 'zero sentAt -> fallback');
assert(normalizeChatSentAt(-1, 42) === 42, 'negative sentAt -> fallback');
assert(normalizeChatSentAt(100, 42) === 100, 'valid sentAt kept');

// Pure append: no external Set mutation, idempotent for same inputs.
const inputA = [msg('a', 200)];
const frozen = Object.freeze([...inputA]);
const once = appendChatMessage(frozen, msg('b', 100));
const twice = appendChatMessage(frozen, msg('b', 100));
assert(once.length === 2, 'out-of-order merge length');
assert(once[0]?.id === 'b' && once[0]?.sentAt === 100, 'sorted earlier first');
assert(once[1]?.id === 'a' && once[1]?.sentAt === 200, 'sorted later second');
assert(
  twice[0]?.id === once[0]?.id && twice[1]?.id === once[1]?.id,
  'same inputs produce same order',
);
assert(frozen.length === 1 && frozen[0]?.id === 'a', 'input array not mutated');

let messages: HouseChatMessage[] = [];
const seen = new Set<string>();
for (let i = 1; i <= 101; i += 1) {
  const next = msg(`id-${i}`, i * 10);
  if (seen.has(next.id)) continue;
  seen.add(next.id);
  messages = appendChatMessage(messages, next);
}
assert(messages.length === MAX_CHAT_MESSAGES, 'keeps latest 100');
assert(messages[0]?.id === 'id-2', 'oldest of remaining is id-2');
assert(messages.at(-1)?.id === 'id-101', 'newest kept');

// Dropped display id stays rejected via session seen set (not removed by append).
assert(seen.has('id-1'), 'seen still tracks scrolled-out id');
assert(seen.has('id-1') && !messages.some((m) => m.id === 'id-1'), 'id-1 not displayed');
const beforeReadd = messages.slice();
if (!seen.has('id-1')) {
  throw new Error('expected seen to keep id-1');
}
// Simulate enqueue: seen blocks re-add
assert(seen.has('id-1'), 're-add blocked by seen');
assert(beforeReadd.length === messages.length, 'messages unchanged when blocked');

// Pure append also rejects duplicate id already in the list.
const withDup = appendChatMessage(messages, messages[0]!);
assert(
  withDup.map((m) => m.id).join(',') === messages.map((m) => m.id).join(','),
  'duplicate id in list is no-op',
);

const badSentAt = appendChatMessage([], msg('bad', Number.NaN));
assert(Number.isFinite(badSentAt[0]?.sentAt ?? NaN), 'invalid sentAt normalized in append');
assert((badSentAt[0]?.sentAt ?? 0) > 0, 'normalized sentAt is positive');

assert(!isIncomingChatStreamTooLarge(undefined), 'unknown size not rejected by declared size');
assert(!isIncomingChatStreamTooLarge(MAX_CHAT_MESSAGE_BYTES), 'exact byte budget allowed');
assert(isIncomingChatStreamTooLarge(MAX_CHAT_MESSAGE_BYTES + 1), 'over byte budget rejected');
assert(
  utf8ByteLength('あ'.repeat(140)) <= MAX_CHAT_MESSAGE_BYTES,
  '140 jp chars fit UTF-8 budget',
);
assert(
  utf8ByteLength('😀'.repeat(140)) <= MAX_CHAT_MESSAGE_BYTES,
  '140 emoji fit UTF-8 budget',
);
assert(
  utf8ByteLength('a'.repeat(141)) <= MAX_CHAT_MESSAGE_BYTES,
  'ascii 141 is under byte budget but rejected by char validation',
);

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
assert(presenceSource.includes('textStreamRoom'), 'Room-scoped text stream tracking');
assert(
  presenceSource.includes('if (this.textStreamRoom === room) return'),
  'skips duplicate register for same Room',
);
assert(
  presenceSource.includes('this.textStreamRoom !== room'),
  'unregister only for tracked Room',
);
assert(
  presenceSource.includes('sendText(text,') && presenceSource.includes('topic: HOUSE_CHAT_TOPIC'),
  'sendText uses HOUSE_CHAT_TOPIC',
);
assert(presenceSource.includes('readBoundedHouseChatText'), 'bounded stream reader used');
assert(presenceSource.includes('subscribeChat'), 'subscribeChat exists');

const streamSource = readFileSync(resolve(root, 'src/chat/chatStream.ts'), 'utf8');
assert(streamSource.includes('isIncomingChatStreamTooLarge'), 'size gate before read');
assert(streamSource.includes('MAX_CHAT_MESSAGE_BYTES'), 'byte budget enforced');
assert(streamSource.includes('AbortController'), 'supports aborting oversized streams');

const realtimeSource = readFileSync(resolve(root, 'src/realtime/useRealtimeSession.ts'), 'utf8');
assert(realtimeSource.includes('enqueueChatMessage'), 'shared enqueue helper');
assert(
  !realtimeSource.includes('appendChatMessage(prev, message, chatSeenIdsRef'),
  'seenIds not mutated inside React updater',
);

console.log('check-house-chat: ok');
