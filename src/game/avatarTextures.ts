import type Phaser from 'phaser';
import {
  clothingTextureKey,
  DEFAULT_CLOTHING_PALETTE,
  type AvatarPose,
  type ClothingPalette,
  PLAYER_CLOTHING_PALETTES,
} from './playerClothing';

function drawAvatar(
  context: CanvasRenderingContext2D,
  pose: AvatarPose,
  clothing: ClothingPalette,
): void {
  const stepping = pose === 'step';
  const sitting = pose === 'sit';

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, 40, 56);

  context.fillStyle = '#26352d';
  context.fillRect(11, 3, 18, 5);
  context.fillRect(8, 8, 24, 11);
  context.fillStyle = '#efc09b';
  context.fillRect(11, 10, 18, 13);
  context.fillStyle = '#2b2b29';
  context.fillRect(14, 14, 2, 2);
  context.fillRect(24, 14, 2, 2);
  context.fillStyle = '#c98366';
  context.fillRect(18, 19, 4, 1);

  context.fillStyle = '#e5ad86';
  context.fillRect(17, 23, 6, 4);
  context.fillStyle = clothing.base;
  context.fillRect(9, 27, 22, sitting ? 16 : 18);
  context.fillStyle = clothing.shadow;
  context.fillRect(6, 29, 5, 15);
  context.fillRect(29, 29, 5, 15);
  context.fillStyle = '#efc09b';
  context.fillRect(6, 42, 5, 4);
  context.fillRect(29, 42, 5, 4);

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

export function ensureDefaultAvatarTextures(scene: Phaser.Scene): void {
  ensureClothingVariantTextures(scene, 0);
  // Keep legacy keys pointing at default blue for any leftover references.
  for (const pose of ['idle', 'step', 'sit'] as const) {
    const legacy = `avatar-${pose}`;
    const variantKey = clothingTextureKey(pose, 0);
    if (!scene.textures.exists(legacy) && scene.textures.exists(variantKey)) {
      // Phaser can't alias easily; draw once into legacy key.
      createAvatarTexture(scene, legacy, pose, DEFAULT_CLOTHING_PALETTE);
    }
  }
}

export function ensureClothingVariantTextures(scene: Phaser.Scene, variantIndex: number): void {
  const palette = PLAYER_CLOTHING_PALETTES[variantIndex] ?? DEFAULT_CLOTHING_PALETTE;
  for (const pose of ['idle', 'step', 'sit'] as const) {
    createAvatarTexture(scene, clothingTextureKey(pose, variantIndex), pose, palette);
  }
}

export function ensureAllClothingTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < PLAYER_CLOTHING_PALETTES.length; i += 1) {
    ensureClothingVariantTextures(scene, i);
  }
}

function createAvatarTexture(
  scene: Phaser.Scene,
  key: string,
  pose: AvatarPose,
  clothing: ClothingPalette,
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 40, 56);
  if (!texture) return;
  drawAvatar(texture.context, pose, clothing);
  texture.refresh();
}
