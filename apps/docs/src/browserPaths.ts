export function normalizePaths(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [];
  const unique = new Set<string>();
  for (const item of items) {
    const path = String(item ?? '').trim();
    if (path.startsWith('/')) unique.add(path);
  }
  return [...unique];
}

export function readStoredPaths(key: string): string[] {
  try {
    const value = localStorage.getItem(key);
    return value ? normalizePaths(JSON.parse(value)) : [];
  } catch {
    return [];
  }
}

export function saveStoredPaths(key: string, paths: string[]): void {
  localStorage.setItem(key, JSON.stringify(normalizePaths(paths)));
}

export function rememberRecentPath(key: string, path: string): string[] {
  const normalized = normalizePaths([path]);
  if (!normalized.length) return readStoredPaths(key).slice(0, 5);
  const next = [normalized[0], ...readStoredPaths(key).filter(item => item !== normalized[0])].slice(0, 5);
  saveStoredPaths(key, next);
  return next;
}
