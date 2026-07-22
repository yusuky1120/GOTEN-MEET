import type { AvatarType } from '../avatar/avatarTypes';
import type { AvatarPose, ClothingPalette } from '../game/playerClothing';

export type DrawAvatarOptions = {
  avatarType: AvatarType;
  pose: AvatarPose;
  clothing: ClothingPalette;
};

/**
 * Shared pixel-art avatar painter for Phaser textures and React canvas previews.
 */
export function drawAvatar(
  context: CanvasRenderingContext2D,
  options: DrawAvatarOptions,
): void {
  const { avatarType, pose, clothing } = options;
  const stepping = pose === 'step';
  const sitting = pose === 'sit';
  const female = avatarType === 'female';

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, 40, 56);

  // Hair / silhouette
  context.fillStyle = '#26352d';
  if (female) {
    context.fillRect(10, 2, 20, 6);
    context.fillRect(7, 7, 26, 12);
    context.fillRect(6, 18, 5, 10);
    context.fillRect(29, 18, 5, 10);
  } else {
    context.fillRect(11, 3, 18, 5);
    context.fillRect(8, 8, 24, 11);
  }

  // Face
  context.fillStyle = '#efc09b';
  context.fillRect(female ? 12 : 11, 10, female ? 16 : 18, 13);
  context.fillStyle = '#2b2b29';
  context.fillRect(14, 14, 2, 2);
  context.fillRect(24, 14, 2, 2);
  context.fillStyle = '#c98366';
  context.fillRect(18, 19, 4, 1);

  // Neck
  context.fillStyle = '#e5ad86';
  context.fillRect(17, 23, 6, 4);

  // Torso
  context.fillStyle = clothing.base;
  if (female) {
    context.fillRect(11, 27, 18, sitting ? 15 : 17);
    // Skirt / hem flare
    context.fillRect(9, sitting ? 40 : 41, 22, 4);
  } else {
    context.fillRect(9, 27, 22, sitting ? 16 : 18);
  }

  context.fillStyle = clothing.shadow;
  if (female) {
    context.fillRect(8, 29, 4, 13);
    context.fillRect(28, 29, 4, 13);
  } else {
    context.fillRect(6, 29, 5, 15);
    context.fillRect(29, 29, 5, 15);
  }

  context.fillStyle = '#efc09b';
  context.fillRect(female ? 8 : 6, 42, female ? 4 : 5, 4);
  context.fillRect(female ? 28 : 29, 42, female ? 4 : 5, 4);

  // Legs / shoes
  context.fillStyle = '#2b3540';
  if (sitting) {
    context.fillRect(10, 42, 9, 7);
    context.fillRect(21, 42, 9, 7);
    context.fillStyle = '#1c2228';
    context.fillRect(8, 48, 12, 5);
    context.fillRect(20, 48, 12, 5);
  } else if (stepping) {
    context.fillRect(11, 44, 7, 8);
    context.fillRect(23, 43, 7, 10);
    context.fillStyle = '#1c2228';
    context.fillRect(9, 51, 9, 4);
    context.fillRect(23, 52, 10, 3);
  } else {
    context.fillRect(11, 44, 7, 9);
    context.fillRect(22, 44, 7, 9);
    context.fillStyle = '#1c2228';
    context.fillRect(9, 52, 10, 3);
    context.fillRect(22, 52, 10, 3);
  }
}
