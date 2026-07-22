import type { AvatarType } from '../avatar/avatarTypes';
import type { PlayerDirection } from '../realtime/playerPositionTypes';

export type PresenceConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type PlayerPresenceMessageV2 = {
  type: 'player-presence';
  version: 2;
  x: number;
  y: number;
  direction: PlayerDirection;
  moving: boolean;
  mapRoomName: string | null;
  voiceRoomName: string | null;
  sequence: number;
  sentAt: number;
};

export type PlayerPresenceMessageV3 = {
  type: 'player-presence';
  version: 3;
  x: number;
  y: number;
  direction: PlayerDirection;
  moving: boolean;
  mapRoomName: string | null;
  voiceRoomName: string | null;
  avatarType: AvatarType;
  sequence: number;
  sentAt: number;
};

/** Normalized presence message used by the app after decode. */
export type PlayerPresenceMessage = PlayerPresenceMessageV3;

export type LocalPresenceState = {
  x: number;
  y: number;
  direction: PlayerDirection;
  moving: boolean;
  mapRoomName: string | null;
  voiceRoomName: string | null;
  avatarType: AvatarType;
};

export type PresenceSessionSnapshot = {
  status: PresenceConnectionStatus;
  participantIdentity: string | null;
  onlineCount: number;
  positionSyncStatus: 'idle' | 'syncing' | 'error';
  errorMessage: string | null;
};
