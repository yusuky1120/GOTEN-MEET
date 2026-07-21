/**
 * Maps display names emitted by houseGame2.ts (`goten:room-change` detail)
 * to LiveKit room names. Only names that actually appear in the map are listed.
 */
export const MAP_ROOM_TO_LIVEKIT_ROOM = {
  キッチン: 'kitchen',
  廊下: 'hallway',
  リビング: 'living-room',
  作業部屋: 'work-room',
  玄関: 'entrance',
} as const;

export type MapRoomName = keyof typeof MAP_ROOM_TO_LIVEKIT_ROOM;
export type LiveKitRoomName = (typeof MAP_ROOM_TO_LIVEKIT_ROOM)[MapRoomName];

export function toLiveKitRoomName(mapRoomName: string): string | null {
  if (Object.prototype.hasOwnProperty.call(MAP_ROOM_TO_LIVEKIT_ROOM, mapRoomName)) {
    return MAP_ROOM_TO_LIVEKIT_ROOM[mapRoomName as MapRoomName];
  }
  return null;
}
