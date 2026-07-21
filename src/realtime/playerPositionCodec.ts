export function sanitizeDisplayName(name: string, fallbackIdentity: string): string {
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const source = cleaned.length > 0 ? cleaned : fallbackIdentity.slice(0, 8);
  if (source.length <= 16) return source;
  return `${source.slice(0, 15)}…`;
}
