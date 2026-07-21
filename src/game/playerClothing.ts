export type ClothingPalette = {
  id: string;
  base: string;
  shadow: string;
};

/** Original shirt colors drawn in houseGame2 avatar textures. */
export const DEFAULT_CLOTHING_PALETTE: ClothingPalette = {
  id: 'blue',
  base: '#3e7392',
  shadow: '#315f79',
};

export const PLAYER_CLOTHING_PALETTES: readonly ClothingPalette[] = [
  DEFAULT_CLOTHING_PALETTE,
  { id: 'red', base: '#b85c5c', shadow: '#8f4242' },
  { id: 'mustard', base: '#c4a35a', shadow: '#9a7d3d' },
  { id: 'purple', base: '#7a6aa8', shadow: '#5c5080' },
  { id: 'teal', base: '#4f9a8f', shadow: '#3a756c' },
  { id: 'olive', base: '#7a8f54', shadow: '#5c6c3d' },
] as const;

export type AvatarPose = 'idle' | 'step' | 'sit';

export function getPlayerClothingVariant(participantIdentity: string): number {
  if (!participantIdentity) {
    return 0;
  }

  let hash = 0;
  for (const char of participantIdentity) {
    hash = Math.imul(31, hash) + char.charCodeAt(0);
    hash |= 0;
  }

  const length = PLAYER_CLOTHING_PALETTES.length;
  // Avoid Math.abs(INT_MIN) edge case by using unsigned remainder.
  return ((hash % length) + length) % length;
}

export function getClothingPalette(participantIdentity: string): ClothingPalette {
  const index = getPlayerClothingVariant(participantIdentity);
  return PLAYER_CLOTHING_PALETTES[index] ?? DEFAULT_CLOTHING_PALETTE;
}

export function clothingTextureKey(pose: AvatarPose, variantIndex: number): string {
  return `avatar-v${variantIndex}-${pose}`;
}
