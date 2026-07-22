import type { AvatarType } from '../avatar/avatarTypes';
import type { LocalPlayerPosition, RemotePlayerPosition } from '../realtime/playerPositionTypes';

export const LOCAL_PLAYER_POSITION_EVENT = 'goten:local-player-position';
export const LOCAL_PLAYER_AVATAR_EVENT = 'goten:local-player-avatar';
/** @deprecated Prefer LOCAL_PLAYER_AVATAR_EVENT */
export const LOCAL_PLAYER_CLOTHING_EVENT = 'goten:local-player-clothing';
export const REMOTE_PLAYER_POSITION_EVENT = 'goten:remote-player-position';
export const REMOTE_PLAYER_REMOVE_EVENT = 'goten:remote-player-remove';
export const REMOTE_PLAYERS_CLEAR_EVENT = 'goten:remote-players-clear';

export type LocalPlayerPositionDetail = LocalPlayerPosition;

export type LocalPlayerAvatarDetail = {
  avatarType: AvatarType;
  clothingVariant: number;
};

export type LocalPlayerClothingDetail = {
  clothingVariant: number;
};

export type RemotePlayerPositionDetail = RemotePlayerPosition;

export type RemotePlayerRemoveDetail = {
  participantIdentity: string;
};

export function dispatchLocalPlayerPosition(detail: LocalPlayerPositionDetail): void {
  window.dispatchEvent(
    new CustomEvent<LocalPlayerPositionDetail>(LOCAL_PLAYER_POSITION_EVENT, { detail }),
  );
}

export function dispatchLocalPlayerAvatar(detail: LocalPlayerAvatarDetail): void {
  window.dispatchEvent(
    new CustomEvent<LocalPlayerAvatarDetail>(LOCAL_PLAYER_AVATAR_EVENT, { detail }),
  );
}

export function dispatchLocalPlayerClothing(detail: LocalPlayerClothingDetail): void {
  window.dispatchEvent(
    new CustomEvent<LocalPlayerClothingDetail>(LOCAL_PLAYER_CLOTHING_EVENT, { detail }),
  );
}

export function dispatchRemotePlayerPosition(detail: RemotePlayerPositionDetail): void {
  window.dispatchEvent(
    new CustomEvent<RemotePlayerPositionDetail>(REMOTE_PLAYER_POSITION_EVENT, { detail }),
  );
}

export function dispatchRemotePlayerRemove(participantIdentity: string): void {
  window.dispatchEvent(
    new CustomEvent<RemotePlayerRemoveDetail>(REMOTE_PLAYER_REMOVE_EVENT, {
      detail: { participantIdentity },
    }),
  );
}

export function dispatchRemotePlayersClear(): void {
  window.dispatchEvent(new CustomEvent(REMOTE_PLAYERS_CLEAR_EVENT));
}
