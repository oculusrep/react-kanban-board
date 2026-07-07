import { useCallback, useSyncExternalStore } from 'react';

// Global style applied to ALL municipal_project polygons. Fill color comes from
// the stage; line color is either the stage's own line_color (falling back to
// the fill color when unset) or a global override configured here.
export interface MunicipalPolygonStyle {
  fillOpacity: number;   // 0..1
  strokeOpacity: number; // 0..1
  strokeWeight: number;  // px, 0..8
  strokeColorMode: 'stage' | 'global';
  strokeColor: string;   // hex, used when strokeColorMode === 'global'
}

const STORAGE_KEY = 'municipal_project_polygon_style_v1';

export const DEFAULT_POLYGON_STYLE: MunicipalPolygonStyle = {
  fillOpacity: 0.2,
  strokeOpacity: 0.9,
  strokeWeight: 2,
  strokeColorMode: 'stage',
  strokeColor: '#002147',
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function isValid(parsed: unknown): parsed is Partial<MunicipalPolygonStyle> {
  if (!parsed || typeof parsed !== 'object') return false;
  const p = parsed as Record<string, unknown>;
  return (
    typeof p.fillOpacity === 'number' &&
    typeof p.strokeOpacity === 'number' &&
    typeof p.strokeWeight === 'number'
  );
}

function loadFromStorage(): MunicipalPolygonStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POLYGON_STYLE;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return DEFAULT_POLYGON_STYLE;
    const mode = parsed.strokeColorMode === 'global' ? 'global' : 'stage';
    const color =
      typeof parsed.strokeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.strokeColor)
        ? parsed.strokeColor
        : DEFAULT_POLYGON_STYLE.strokeColor;
    return {
      fillOpacity: clamp(parsed.fillOpacity as number, 0, 1),
      strokeOpacity: clamp(parsed.strokeOpacity as number, 0, 1),
      strokeWeight: clamp(parsed.strokeWeight as number, 0, 8),
      strokeColorMode: mode,
      strokeColor: color,
    };
  } catch {
    return DEFAULT_POLYGON_STYLE;
  }
}

// Module-level shared store. Multiple components (InlineFilters as writer,
// MunicipalProjectLayer as reader) need to observe the same state so slider
// moves reflect on the map in real time — plain useState created independent
// copies that only synced through localStorage on next mount.
let currentStyle: MunicipalPolygonStyle = loadFromStorage();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MunicipalPolygonStyle {
  return currentStyle;
}

function setStyleAndNotify(next: MunicipalPolygonStyle) {
  currentStyle = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota — non-fatal
  }
  for (const l of listeners) l();
}

export function useMunicipalProjectPolygonStyle() {
  const style = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const update = useCallback((partial: Partial<MunicipalPolygonStyle>) => {
    setStyleAndNotify({ ...currentStyle, ...partial });
  }, []);

  const resetToDefaults = useCallback(() => {
    setStyleAndNotify(DEFAULT_POLYGON_STYLE);
  }, []);

  return { style, update, resetToDefaults };
}
