/**
 * Lightweight checks for kitchen/hallway shared Voice room mapping.
 * Run: npx tsx scripts/check-room-mapping.ts
 */
import {
  MAP_ROOM_TO_LIVEKIT_ROOM,
  toLiveKitRoomName,
} from '../src/voice/roomMapping.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(toLiveKitRoomName('キッチン') === 'kitchen-hallway', 'kitchen maps to kitchen-hallway');
assert(toLiveKitRoomName('廊下') === 'kitchen-hallway', 'hallway maps to kitchen-hallway');
assert(
  toLiveKitRoomName('キッチン') === toLiveKitRoomName('廊下'),
  'kitchen and hallway share the same Voice room',
);
assert(toLiveKitRoomName('リビング') === 'living-room', 'living-room unchanged');
assert(toLiveKitRoomName('作業部屋') === 'work-room', 'work-room unchanged');
assert(toLiveKitRoomName('玄関') === 'entrance', 'entrance unchanged');
assert(toLiveKitRoomName('unknown') === null, 'unknown map room returns null');
assert(MAP_ROOM_TO_LIVEKIT_ROOM['キッチン'] === 'kitchen-hallway', 'const kitchen');
assert(MAP_ROOM_TO_LIVEKIT_ROOM['廊下'] === 'kitchen-hallway', 'const hallway');
assert(MAP_ROOM_TO_LIVEKIT_ROOM['キッチン'] !== 'kitchen', 'legacy kitchen room removed');
assert(MAP_ROOM_TO_LIVEKIT_ROOM['廊下'] !== 'hallway', 'legacy hallway room removed');

console.log('check-room-mapping: ok');
