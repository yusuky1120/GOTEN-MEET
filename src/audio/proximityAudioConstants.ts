/** Logical tile size in pixels (avatar width is ~40px; map is freeform, not a tilemap). */
export const PROXIMITY_TILE_SIZE_PX = 40;

/** Full volume within ~2 tiles. */
export const FULL_VOLUME_DISTANCE_TILES = 2;

/** Silent beyond ~8 tiles. */
export const SILENT_DISTANCE_TILES = 8;

export const FULL_VOLUME_DISTANCE =
  FULL_VOLUME_DISTANCE_TILES * PROXIMITY_TILE_SIZE_PX;

export const SILENT_DISTANCE = SILENT_DISTANCE_TILES * PROXIMITY_TILE_SIZE_PX;

/** Max rate for distance CustomEvents (~10/sec). */
export const DISTANCE_UPDATE_INTERVAL_MS = 100;

/** Shared volume smoothing tick. */
export const VOLUME_SMOOTHING_INTERVAL_MS = 50;
export const VOLUME_SMOOTHING_FACTOR = 0.25;
export const VOLUME_EPSILON = 0.01;

/** Zero receive volume when position updates go stale (before sprite timeout). */
export const POSITION_AUDIO_STALE_MS = 3_000;

/** Cap React debug proximity fields. */
export const PROXIMITY_DEBUG_UI_INTERVAL_MS = 500;
