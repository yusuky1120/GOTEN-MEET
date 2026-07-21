import type { PlayerDirection } from '../realtime/playerPositionTypes';

export type PresenceConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type PlayerPresenceMessage = {
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

export type LocalPresenceState = {
  x: number;
  y: number;
  direction: PlayerDirection;
  moving: boolean;
  mapRoomName: string | null;
  voiceRoomName: string | null;
};

export type PresenceSessionSnapshot = {
  status: PresenceConnectionStatus;
  participantIdentity: string | null;
  onlineCount: number;
  positionSyncStatus: 'idle' | 'syncing' | 'error';
  errorMessage: string | null;
};
