import Phaser from 'phaser';
import { DISTANCE_UPDATE_INTERVAL_MS } from '../audio/proximityAudioConstants';
import {
  MAX_DISPLAY_NAME_LENGTH,
  REMOTE_INTERPOLATION_SPEED,
  REMOTE_TELEPORT_DISTANCE,
} from '../realtime/playerPositionConstants';
import { sanitizeDisplayName } from '../realtime/playerPositionCodec';
import type { PlayerDirection, RemotePlayerPosition } from '../realtime/playerPositionTypes';
import { ensureClothingVariantTextures } from './avatarTextures';
import {
  REMOTE_PLAYER_POSITION_EVENT,
  REMOTE_PLAYER_REMOVE_EVENT,
  REMOTE_PLAYERS_CLEAR_EVENT,
  type RemotePlayerPositionDetail,
  type RemotePlayerRemoveDetail,
} from './gamePositionEvents';
import { clothingTextureKey, getPlayerClothingVariant } from './playerClothing';
import { dispatchRemotePlayerDistance } from './playerDistanceEvents';

const REMOTE_DEPTH = 40_000;
const REMOTE_LABEL_DEPTH = 40_001;

type RemotePlayerView = {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  nameLabel: Phaser.GameObjects.Text;
  roomLabel: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  direction: PlayerDirection;
  moving: boolean;
  mapRoomName: string | null;
  voiceRoomName: string | null;
  clothingVariant: number;
  stepping: boolean;
  lastStepAt: number;
  lastEmittedDistance: number;
  lastDistanceEmitAt: number;
};

export class RemotePlayersManager {
  private readonly views = new Map<string, RemotePlayerView>();
  private bound = false;

  private readonly onPosition = (event: Event) => {
    const detail = (event as CustomEvent<RemotePlayerPositionDetail>).detail;
    this.upsert(detail);
  };

  private readonly onRemove = (event: Event) => {
    const detail = (event as CustomEvent<RemotePlayerRemoveDetail>).detail;
    this.remove(detail.participantIdentity);
  };

  private readonly onClear = () => {
    this.clear();
  };

  constructor(private readonly scene: Phaser.Scene) {}

  bind(): void {
    if (this.bound) return;
    window.addEventListener(REMOTE_PLAYER_POSITION_EVENT, this.onPosition);
    window.addEventListener(REMOTE_PLAYER_REMOVE_EVENT, this.onRemove);
    window.addEventListener(REMOTE_PLAYERS_CLEAR_EVENT, this.onClear);
    this.bound = true;
  }

  unbind(): void {
    if (!this.bound) return;
    window.removeEventListener(REMOTE_PLAYER_POSITION_EVENT, this.onPosition);
    window.removeEventListener(REMOTE_PLAYER_REMOVE_EVENT, this.onRemove);
    window.removeEventListener(REMOTE_PLAYERS_CLEAR_EVENT, this.onClear);
    this.bound = false;
  }

  update(deltaMs: number, timeMs: number): void {
    const alpha = 1 - Math.exp((-REMOTE_INTERPOLATION_SPEED * deltaMs) / 1000);

    // Visibility is owned by Presence Room membership (PresenceSession).
    // Do not remove remotes here based on packet age or wall-clock vs Phaser time.
    for (const view of this.views.values()) {
      const dx = view.targetX - view.sprite.x;
      const dy = view.targetY - view.sprite.y;
      const distance = Math.hypot(dx, dy);

      if (distance > REMOTE_TELEPORT_DISTANCE) {
        view.sprite.setPosition(view.targetX, view.targetY);
      } else {
        view.sprite.x = Phaser.Math.Linear(view.sprite.x, view.targetX, alpha);
        view.sprite.y = Phaser.Math.Linear(view.sprite.y, view.targetY, alpha);
      }

      this.applyVisuals(view, timeMs);
    }
  }

  updateDistances(
    localX: number,
    localY: number,
    timeMs: number,
    options: { force?: boolean } = {},
  ): void {
    const force = options.force === true;

    for (const [identity, view] of this.views) {
      const distance = Phaser.Math.Distance.Between(
        localX,
        localY,
        view.sprite.x,
        view.sprite.y,
      );
      const elapsed = timeMs - view.lastDistanceEmitAt;
      if (!force && elapsed < DISTANCE_UPDATE_INTERVAL_MS) {
        continue;
      }

      view.lastEmittedDistance = distance;
      view.lastDistanceEmitAt = timeMs;
      dispatchRemotePlayerDistance({
        participantIdentity: identity,
        distance,
        voiceRoomName: view.voiceRoomName,
        calculatedAt: Date.now(),
      });
    }
  }

  clear(): void {
    for (const identity of [...this.views.keys()]) {
      this.remove(identity);
    }
  }

  destroy(): void {
    this.unbind();
    this.clear();
  }

  private upsert(position: RemotePlayerPosition): void {
    const existing = this.views.get(position.participantIdentity);
    const labelText = sanitizeDisplayName(
      position.participantName,
      position.participantIdentity,
    ).slice(0, MAX_DISPLAY_NAME_LENGTH);
    const clothingVariant = getPlayerClothingVariant(position.participantIdentity);
    ensureClothingVariantTextures(this.scene, clothingVariant);

    if (!existing) {
      const shadow = this.scene.add.ellipse(
        position.x,
        position.y + 19,
        30,
        12,
        0x17130f,
        0.22,
      );
      const sprite = this.scene.add.sprite(
        position.x,
        position.y,
        clothingTextureKey('idle', clothingVariant),
      );
      // Do NOT setTint — clothing color comes from palette-swapped textures.
      const nameLabel = this.scene.add
        .text(position.x, position.y - 39, labelText, {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: '#17301c',
          backgroundColor: '#d7eccb',
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);
      const roomLabel = this.scene.add
        .text(position.x, position.y - 24, position.mapRoomName ?? '', {
          fontFamily: 'sans-serif',
          fontSize: '9px',
          color: '#3a4634',
          backgroundColor: 'rgba(245,239,220,.72)',
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5);

      const view: RemotePlayerView = {
        sprite,
        shadow,
        nameLabel,
        roomLabel,
        targetX: position.x,
        targetY: position.y,
        direction: position.direction,
        moving: position.moving,
        mapRoomName: position.mapRoomName,
        voiceRoomName: position.voiceRoomName,
        clothingVariant,
        stepping: false,
        lastStepAt: 0,
        lastEmittedDistance: Number.NaN,
        lastDistanceEmitAt: 0,
      };
      this.applyVisuals(view, performance.now());
      this.views.set(position.participantIdentity, view);
      return;
    }

    const wasMoving = existing.moving;
    existing.targetX = position.x;
    existing.targetY = position.y;
    existing.direction = position.direction;
    existing.moving = position.moving;
    existing.mapRoomName = position.mapRoomName;
    existing.voiceRoomName = position.voiceRoomName;
    existing.nameLabel.setText(labelText);
    existing.roomLabel.setText(position.mapRoomName ?? '');

    if (wasMoving && !position.moving) {
      existing.lastDistanceEmitAt = 0;
    }
  }

  private remove(identity: string): void {
    const view = this.views.get(identity);
    if (!view) return;
    view.sprite.destroy();
    view.shadow.destroy();
    view.nameLabel.destroy();
    view.roomLabel.destroy();
    this.views.delete(identity);
  }

  private applyVisuals(view: RemotePlayerView, timeMs: number): void {
    view.sprite.setFlipX(view.direction === 'left');

    if (view.moving) {
      if (timeMs - view.lastStepAt > 170) {
        view.stepping = !view.stepping;
        view.lastStepAt = timeMs;
      }
      view.sprite.setTexture(
        clothingTextureKey(view.stepping ? 'step' : 'idle', view.clothingVariant),
      );
    } else {
      view.stepping = false;
      view.sprite.setTexture(clothingTextureKey('idle', view.clothingVariant));
    }

    view.shadow
      .setPosition(view.sprite.x, view.sprite.y + 19)
      .setDepth(REMOTE_DEPTH - 1);
    view.sprite.setDepth(REMOTE_DEPTH);
    view.nameLabel.setPosition(view.sprite.x, view.sprite.y - 39).setDepth(REMOTE_LABEL_DEPTH);
    view.roomLabel.setPosition(view.sprite.x, view.sprite.y - 24).setDepth(REMOTE_LABEL_DEPTH);
  }
}
