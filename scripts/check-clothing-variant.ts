/**
 * Lightweight checks for clothing variant hashing (no test framework).
 * Run: npx tsx scripts/check-clothing-variant.ts
 */
import {
  PLAYER_CLOTHING_PALETTES,
  getPlayerClothingVariant,
} from '../src/game/playerClothing.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(getPlayerClothingVariant('') === 0, 'empty identity => 0');
assert(
  getPlayerClothingVariant('alice-id') === getPlayerClothingVariant('alice-id'),
  'same identity => same variant',
);

const a = getPlayerClothingVariant('11111111-1111-4111-8111-111111111111');
const b = getPlayerClothingVariant('22222222-2222-4222-8222-222222222222');
const c = getPlayerClothingVariant('33333333-3333-4333-8333-333333333333');
const d = getPlayerClothingVariant('44444444-4444-4444-8444-444444444444');
const e = getPlayerClothingVariant('55555555-5555-4555-8555-555555555555');

for (const index of [a, b, c, d, e]) {
  assert(index >= 0 && index < PLAYER_CLOTHING_PALETTES.length, 'variant in range');
}

const spread = new Set([a, b, c, d, e]);
assert(spread.size >= 2, 'different identities should spread across variants');

// INT_MIN-style stress: long string with high char codes should still be in range.
const stressed = getPlayerClothingVariant('ÿ'.repeat(64));
assert(stressed >= 0 && stressed < PLAYER_CLOTHING_PALETTES.length, 'stressed hash in range');

console.log('check-clothing-variant: ok');
