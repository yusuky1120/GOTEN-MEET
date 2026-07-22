import type Phaser from 'phaser';
import { DEFAULT_AVATAR_TYPE, type AvatarType, AVATAR_TYPES } from '../avatar/avatarTypes';
import { drawAvatar } from '../avatar/drawAvatar';
import {
  clothingTextureKey,
  DEFAULT_CLOTHING_PALETTE,
  type AvatarPose,
  type ClothingPalette,
  PLAYER_CLOTHING_PALETTES,
} from './playerClothing';

export function avatarTextureKey(
  avatarType: AvatarType,
  pose: AvatarPose,
  variantIndex: number,
): string {
  return `avatar-${avatarType}-v${variantIndex}-${pose}`;
}

export function ensureDefaultAvatarTextures(scene: Phaser.Scene): void {
  ensureAvatarVariantTextures(scene, DEFAULT_AVATAR_TYPE, 0);
  ensureClothingVariantTextures(scene, 0);
  for (const pose of ['idle', 'step', 'sit'] as const) {
    const legacy = `avatar-${pose}`;
    const variantKey = clothingTextureKey(pose, 0);
    if (!scene.textures.exists(legacy) && scene.textures.exists(variantKey)) {
      createAvatarTexture(scene, legacy, DEFAULT_AVATAR_TYPE, pose, DEFAULT_CLOTHING_PALETTE);
    }
  }
}

/** @deprecated Prefer ensureAvatarVariantTextures with explicit avatarType. */
export function ensureClothingVariantTextures(scene: Phaser.Scene, variantIndex: number): void {
  ensureAvatarVariantTextures(scene, DEFAULT_AVATAR_TYPE, variantIndex);
}

export function ensureAvatarVariantTextures(
  scene: Phaser.Scene,
  avatarType: AvatarType,
  variantIndex: number,
): void {
  const palette = PLAYER_CLOTHING_PALETTES[variantIndex] ?? DEFAULT_CLOTHING_PALETTE;
  for (const pose of ['idle', 'step', 'sit'] as const) {
    createAvatarTexture(
      scene,
      avatarTextureKey(avatarType, pose, variantIndex),
      avatarType,
      pose,
      palette,
    );
    // Keep male textures also under legacy clothing keys for transitional callers.
    if (avatarType === 'male') {
      createAvatarTexture(scene, clothingTextureKey(pose, variantIndex), avatarType, pose, palette);
    }
  }
}

export function ensureAllClothingTextures(scene: Phaser.Scene): void {
  for (const avatarType of AVATAR_TYPES) {
    for (let i = 0; i < PLAYER_CLOTHING_PALETTES.length; i += 1) {
      ensureAvatarVariantTextures(scene, avatarType, i);
    }
  }
}

function createAvatarTexture(
  scene: Phaser.Scene,
  key: string,
  avatarType: AvatarType,
  pose: AvatarPose,
  clothing: ClothingPalette,
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 40, 56);
  if (!texture) return;
  drawAvatar(texture.context, { avatarType, pose, clothing });
  texture.refresh();
}
