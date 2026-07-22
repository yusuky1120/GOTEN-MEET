export type AvatarType = 'male' | 'female';

export const AVATAR_TYPES: readonly AvatarType[] = ['male', 'female'] as const;

export const DEFAULT_AVATAR_TYPE: AvatarType = 'male';

export function isAvatarType(value: unknown): value is AvatarType {
  return value === 'male' || value === 'female';
}

export function avatarTypeLabel(avatarType: AvatarType): string {
  return avatarType === 'female' ? '女性アバター' : '男性アバター';
}
