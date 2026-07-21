import { FULL_VOLUME_DISTANCE, SILENT_DISTANCE } from './proximityAudioConstants';

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Smooth proximity falloff: 1 within fullDistance, 0 at/after silentDistance,
 * smoothstep between. Invalid inputs yield 0.
 */
export function calculateProximityVolume(
  distance: number,
  fullVolumeDistance: number = FULL_VOLUME_DISTANCE,
  silentDistance: number = SILENT_DISTANCE,
): number {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(fullVolumeDistance) ||
    !Number.isFinite(silentDistance)
  ) {
    return 0;
  }

  if (fullVolumeDistance < 0 || silentDistance <= fullVolumeDistance) {
    return 0;
  }

  const safeDistance = Math.max(0, distance);

  if (safeDistance <= fullVolumeDistance) {
    return 1;
  }

  if (safeDistance >= silentDistance) {
    return 0;
  }

  const normalized =
    (safeDistance - fullVolumeDistance) / (silentDistance - fullVolumeDistance);
  const smoothstep = normalized * normalized * (3 - 2 * normalized);
  return clamp01(1 - smoothstep);
}
