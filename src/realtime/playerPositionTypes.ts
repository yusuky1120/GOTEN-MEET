import type { AvatarType } from '../avatar/avatarTypes';

export type PlayerDirection = 'up' | 'down' | 'left' | 'right';

export const PLAYER_DIRECTIONS: readonly PlayerDirection[] = [
  'up',
  'down',
  'left',
  'right',
] as const;

export type LocalPlayerPosition = {
  x: number;
  y: number;
  direction: PlayerDirection;
  moving: boolean;
};

export type RemotePlayerPosition = {
  participantIdentity: string;
  participantName: string;
  x: number;
  y: number;
  direction: PlayerDirection;
  moving: boolean;
  sequence: number;
  sentAt: number;
  mapRoomName: string | null;
  voiceRoomName: string | null;
  avatarType: AvatarType;
};
