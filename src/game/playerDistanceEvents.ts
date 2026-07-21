export const REMOTE_PLAYER_DISTANCE_EVENT = 'goten:remote-player-distance';

export type RemotePlayerDistanceDetail = {
  participantIdentity: string;
  distance: number;
  voiceRoomName: string | null;
  calculatedAt: number;
};

export function dispatchRemotePlayerDistance(detail: RemotePlayerDistanceDetail): void {
  window.dispatchEvent(
    new CustomEvent<RemotePlayerDistanceDetail>(REMOTE_PLAYER_DISTANCE_EVENT, { detail }),
  );
}
