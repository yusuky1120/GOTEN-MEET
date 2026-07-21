/**
 * Lightweight checks for proximity volume math (no test framework).
 * Run: npx tsx scripts/check-proximity-volume.ts
 */
import {
  FULL_VOLUME_DISTANCE,
  SILENT_DISTANCE,
} from '../src/audio/proximityAudioConstants.ts';
import { calculateProximityVolume } from '../src/audio/proximityVolume.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function approx(actual: number, expected: number, epsilon = 1e-6): boolean {
  return Math.abs(actual - expected) <= epsilon;
}

assert(calculateProximityVolume(0) === 1, 'distance 0 => 1');
assert(calculateProximityVolume(FULL_VOLUME_DISTANCE) === 1, 'full distance => 1');
assert(
  calculateProximityVolume(FULL_VOLUME_DISTANCE - 0.01) === 1,
  'just inside full => 1',
);
assert(calculateProximityVolume(SILENT_DISTANCE) === 0, 'silent distance => 0');
assert(calculateProximityVolume(SILENT_DISTANCE + 10) === 0, 'beyond silent => 0');

const mid = (FULL_VOLUME_DISTANCE + SILENT_DISTANCE) / 2;
const midVolume = calculateProximityVolume(mid);
assert(midVolume > 0 && midVolume < 1, 'midpoint in (0,1)');

const samples = [0, 40, 80, 160, 240, 320, 400].map((d) => calculateProximityVolume(d));
for (let i = 1; i < samples.length; i += 1) {
  assert(samples[i]! <= samples[i - 1]! + 1e-9, 'volume is monotonically non-increasing');
}

assert(calculateProximityVolume(Number.NaN) === 0, 'NaN => 0');
assert(calculateProximityVolume(Number.POSITIVE_INFINITY) === 0, 'Infinity => 0');
assert(calculateProximityVolume(-10) === 1, 'negative distance treated as 0 => 1');
assert(calculateProximityVolume(100, 200, 100) === 0, 'invalid full/silent => 0');
assert(calculateProximityVolume(50, -1, 100) === 0, 'negative full => 0');

for (const value of samples) {
  assert(value >= 0 && value <= 1, 'volume always clamped to 0..1');
}

assert(approx(calculateProximityVolume(FULL_VOLUME_DISTANCE + 0.01), 1, 0.02), 'just outside full near 1');

console.log('proximity volume checks passed');
