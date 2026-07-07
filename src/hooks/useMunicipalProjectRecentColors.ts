import { useCallback, useSyncExternalStore } from 'react';

// LRU of colors the user has recently applied to a Municipal Projects polygon
// (fill, stage-line, or global stroke override). Shared across the Layers panel
// so the user can quickly re-apply a color they just picked — e.g. matching a
// stage's line color to its fill.
const STORAGE_KEY = 'municipal_project_recent_colors_v1';
const MAX = 10;
const HEX = /^#[0-9a-fA-F]{6}$/;

function loadFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c: unknown): c is string => typeof c === 'string' && HEX.test(c))
      .map((c) => c.toLowerCase())
      .slice(0, MAX);
  } catch {
    return [];
  }
}

let colors: string[] = loadFromStorage();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string[] {
  return colors;
}

export function pushRecentColor(color: string | null | undefined): void {
  if (!color || !HEX.test(color)) return;
  const normalized = color.toLowerCase();
  const next = [normalized, ...colors.filter((c) => c !== normalized)].slice(0, MAX);
  if (next.length === colors.length && next.every((c, i) => c === colors[i])) return;
  colors = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // private mode / quota — non-fatal
  }
  for (const l of listeners) l();
}

export function useMunicipalProjectRecentColors() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const push = useCallback((color: string | null | undefined) => pushRecentColor(color), []);
  return { colors: list, push };
}
