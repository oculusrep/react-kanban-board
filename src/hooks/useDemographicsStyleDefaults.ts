import { useCallback, useSyncExternalStore } from 'react';

// User-configurable defaults for the demographics-analysis overlays
// (rings, drive-time isochrones, custom polygon). Persisted to
// localStorage so opening a fresh point starts with the user's colors
// instead of the hardcoded red palette.
//
// Pattern intentionally mirrors useMunicipalProjectPolygonStyle.
export interface DemographicsStyleDefaults {
  ringColors: Record<number, string>;
  driveTimeFillColors: Record<number, string>;
  driveTimeLineColors: Record<number, string>;
  driveTimeFillOpacities: Record<number, number>;
  polygonColor: string;
  strokeOpacity: number;
  fillOpacity: number;
  strokeWeight: number;
}

const STORAGE_KEY = 'demographics_style_defaults_v1';

// Factory-fresh values — kept in sync with DemographicsAnalysisSlideout
// defaults so "Reset" behaves the same before and after the user has
// ever saved.
export const FACTORY_DEFAULTS: DemographicsStyleDefaults = {
  ringColors: {},
  driveTimeFillColors: {},
  driveTimeLineColors: {},
  driveTimeFillOpacities: {},
  polygonColor: '#DC2626',
  strokeOpacity: 0.85,
  fillOpacity: 0.1,
  strokeWeight: 2,
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function sanitizeColorMap(input: unknown): Record<number, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = Number(k);
    if (!Number.isFinite(key)) continue;
    if (typeof v === 'string' && HEX_RE.test(v)) out[key] = v;
  }
  return out;
}

function sanitizeOpacityMap(input: unknown): Record<number, number> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const key = Number(k);
    if (!Number.isFinite(key)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp(v, 0, 1);
  }
  return out;
}

function loadFromStorage(): DemographicsStyleDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return FACTORY_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<DemographicsStyleDefaults> | null;
    if (!parsed || typeof parsed !== 'object') return FACTORY_DEFAULTS;
    return {
      ringColors: sanitizeColorMap(parsed.ringColors),
      driveTimeFillColors: sanitizeColorMap(parsed.driveTimeFillColors),
      driveTimeLineColors: sanitizeColorMap(parsed.driveTimeLineColors),
      driveTimeFillOpacities: sanitizeOpacityMap(parsed.driveTimeFillOpacities),
      polygonColor:
        typeof parsed.polygonColor === 'string' && HEX_RE.test(parsed.polygonColor)
          ? parsed.polygonColor
          : FACTORY_DEFAULTS.polygonColor,
      strokeOpacity:
        typeof parsed.strokeOpacity === 'number'
          ? clamp(parsed.strokeOpacity, 0, 1)
          : FACTORY_DEFAULTS.strokeOpacity,
      fillOpacity:
        typeof parsed.fillOpacity === 'number'
          ? clamp(parsed.fillOpacity, 0, 1)
          : FACTORY_DEFAULTS.fillOpacity,
      strokeWeight:
        typeof parsed.strokeWeight === 'number'
          ? clamp(parsed.strokeWeight, 1, 6)
          : FACTORY_DEFAULTS.strokeWeight,
    };
  } catch {
    return FACTORY_DEFAULTS;
  }
}

let current: DemographicsStyleDefaults = loadFromStorage();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): DemographicsStyleDefaults {
  return current;
}

function setAndNotify(next: DemographicsStyleDefaults) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota — non-fatal
  }
  for (const l of listeners) l();
}

export function useDemographicsStyleDefaults() {
  const defaults = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const saveAsDefaults = useCallback((next: DemographicsStyleDefaults) => {
    setAndNotify(next);
  }, []);

  const resetToFactory = useCallback(() => {
    setAndNotify(FACTORY_DEFAULTS);
  }, []);

  return { defaults, saveAsDefaults, resetToFactory };
}
