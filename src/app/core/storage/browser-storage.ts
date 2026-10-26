/**
 * Safe wrappers around Web Storage. Storage can be unavailable (private mode, blocked site data) or
 * full; callers then simply lose persistence instead of crashing.
 */
export type StorageArea = 'local' | 'session';

function area(kind: StorageArea): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function readItem(kind: StorageArea, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeItem(kind: StorageArea, key: string, value: string): void {
  try {
    area(kind)?.setItem(key, value);
  } catch {
    // Not persisted; the value lives for this page only.
  }
}

export function removeItem(kind: StorageArea, key: string): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

/** Reads and parses a JSON value; returns null when it is missing or not valid JSON. */
export function readJson(kind: StorageArea, key: string): unknown {
  const raw = readItem(kind, key);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeJson(kind: StorageArea, key: string, value: unknown): void {
  writeItem(kind, key, JSON.stringify(value));
}

/** Prefix of every key this app stores, so several deployments on one origin do not collide. */
export const STORAGE_PREFIX = 'gitlab-overseer.';
