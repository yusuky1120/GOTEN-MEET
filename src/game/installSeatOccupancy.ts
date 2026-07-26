import Phaser from 'phaser';
import {
  REMOTE_PLAYER_POSITION_EVENT,
  REMOTE_PLAYER_REMOVE_EVENT,
  REMOTE_PLAYERS_CLEAR_EVENT,
  type RemotePlayerPositionDetail,
  type RemotePlayerRemoveDetail,
} from './gamePositionEvents';
import {
  RemoteSeatOccupancy,
  createSeatKey,
  getLocalParticipantIdentity,
  selectSeatOwner,
  type SeatDescriptor,
} from './seatOccupancy';

type RuntimeSeat = SeatDescriptor & {
  direction: string;
  standX: number;
  standY: number;
};

type HouseSceneRuntime = Phaser.Scene & {
  seats?: RuntimeSeat[];
  seated?: RuntimeSeat | null;
  sit?: (seat: RuntimeSeat) => void;
  standUp?: () => void;
};

type LastRemotePosition = {
  participantIdentity: string;
  x: number;
  y: number;
};

function isHouseSceneRuntime(scene: Phaser.Scene): scene is HouseSceneRuntime {
  const candidate = scene as HouseSceneRuntime;
  return (
    Array.isArray(candidate.seats) &&
    candidate.seats.length > 0 &&
    typeof candidate.sit === 'function' &&
    typeof candidate.standUp === 'function'
  );
}

/**
 * Adds multiplayer seat locking without changing the single-player map code.
 *
 * A remote participant is considered seated only when their authoritative
 * Presence coordinates match a registered seat anchor. Normal movement cannot
 * reach those coordinates because seats are inside furniture colliders.
 */
export function installSeatOccupancy(game: Phaser.Game): () => void {
  const occupancy = new RemoteSeatOccupancy();
  const lastRemotePositions = new Map<string, LastRemotePosition>();
  let scene: HouseSceneRuntime | null = null;
  let originalSit: ((seat: RuntimeSeat) => void) | null = null;
  let notice: Phaser.GameObjects.Text | null = null;
  let noticeGeneration = 0;

  const showNotice = (message: string) => {
    if (!scene) return;
    if (!notice) {
      notice = scene.add
        .text(480, 570, '', {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: '#fffaf0',
          backgroundColor: 'rgba(78,35,30,.95)',
          padding: { x: 16, y: 10 },
          align: 'center',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(60_001)
        .setVisible(false);
    }

    const generation = ++noticeGeneration;
    notice.setText(message).setVisible(true);
    scene.time.delayedCall(1_300, () => {
      if (generation === noticeGeneration) notice?.setVisible(false);
    });
  };

  const resolveLocalConflict = () => {
    if (!scene?.seated || !scene.standUp) return;

    const seatKey = createSeatKey(scene.seated);
    const remoteOccupants = occupancy.occupants(seatKey);
    if (remoteOccupants.length === 0) return;

    const localIdentity = getLocalParticipantIdentity();
    const owner = selectSeatOwner(
      localIdentity ? [localIdentity, ...remoteOccupants] : remoteOccupants,
    );

    // If the local identity is unavailable, fail closed and give the observed
    // remote participant the seat. During a normal connected session the
    // identity is captured before Presence connects.
    if (!localIdentity || owner !== localIdentity) {
      scene.standUp();
      showNotice('この席はほかのユーザーが使用しています');
    }
  };

  const syncRemotePosition = (position: LastRemotePosition) => {
    if (!scene?.seats) return;
    occupancy.update(scene.seats, position);
    resolveLocalConflict();
  };

  const onRemotePosition = (event: Event) => {
    const detail = (event as CustomEvent<RemotePlayerPositionDetail>).detail;
    const position: LastRemotePosition = {
      participantIdentity: detail.participantIdentity,
      x: detail.x,
      y: detail.y,
    };
    lastRemotePositions.set(detail.participantIdentity, position);
    syncRemotePosition(position);
  };

  const onRemoteRemove = (event: Event) => {
    const detail = (event as CustomEvent<RemotePlayerRemoveDetail>).detail;
    lastRemotePositions.delete(detail.participantIdentity);
    occupancy.remove(detail.participantIdentity);
  };

  const onRemoteClear = () => {
    lastRemotePositions.clear();
    occupancy.clear();
  };

  const tryAttach = () => {
    if (scene) return;
    const candidate = game.scene.getScenes(true).find(isHouseSceneRuntime);
    if (!candidate || !candidate.sit) return;

    scene = candidate;
    originalSit = candidate.sit;
    candidate.sit = (seat: RuntimeSeat) => {
      const seatKey = createSeatKey(seat);
      if (occupancy.isOccupied(seatKey)) {
        showNotice('この席はほかのユーザーが使用しています');
        return;
      }
      originalSit?.call(candidate, seat);
    };

    for (const position of lastRemotePositions.values()) {
      syncRemotePosition(position);
    }
  };

  window.addEventListener(REMOTE_PLAYER_POSITION_EVENT, onRemotePosition);
  window.addEventListener(REMOTE_PLAYER_REMOVE_EVENT, onRemoteRemove);
  window.addEventListener(REMOTE_PLAYERS_CLEAR_EVENT, onRemoteClear);
  game.events.on(Phaser.Core.Events.POST_STEP, tryAttach);
  tryAttach();

  return () => {
    window.removeEventListener(REMOTE_PLAYER_POSITION_EVENT, onRemotePosition);
    window.removeEventListener(REMOTE_PLAYER_REMOVE_EVENT, onRemoteRemove);
    window.removeEventListener(REMOTE_PLAYERS_CLEAR_EVENT, onRemoteClear);
    game.events.off(Phaser.Core.Events.POST_STEP, tryAttach);
    if (scene && originalSit) scene.sit = originalSit;
    notice?.destroy();
    notice = null;
    scene = null;
    occupancy.clear();
    lastRemotePositions.clear();
  };
}
