import { useCallback, useEffect, useState } from 'react';

// Per-bucket polygon style. Stroke and fill are independent so the user
// can set, e.g., a solid green outline with a faint green fill.
// `visible` lets the user hide a single bucket without affecting the others;
// the master layer toggle is still required to show anything.
export interface PriorityStyle {
  visible: boolean;      // false → polygons in this bucket are detached from the map
  strokeColor: string;   // hex like '#16a34a'
  fillColor: string;     // hex
  fillOpacity: number;   // 0..1
  strokeWeight: number;  // px (not user-editable in v1; kept for the layer to read)
}

export type PriorityKey = 1 | 2 | 3;
// Style buckets: Starbucks priorities 1/2/3 plus 'orep' for OREP-drawn polygons (source='orep').
export type StyleBucketKey = PriorityKey | 'orep';
export type StarbucksTargetAreaStyles = Record<StyleBucketKey, PriorityStyle>;

// Bump the version suffix to force a defaults reset for everyone (e.g. on
// a future schema change). v1 = green/yellow/purple per Mike 2026-05-12.
// v2 adds the 'orep' bucket (blue) for OREP-drawn target areas.
const STORAGE_KEY = 'starbucks_target_area_styles_v2';

export const DEFAULT_STYLES: StarbucksTargetAreaStyles = {
  1: { visible: true, strokeColor: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.25, strokeWeight: 2 },   // green
  2: { visible: true, strokeColor: '#eab308', fillColor: '#eab308', fillOpacity: 0.18, strokeWeight: 2 },   // yellow
  3: { visible: true, strokeColor: '#9333ea', fillColor: '#9333ea', fillOpacity: 0.15, strokeWeight: 1.5 }, // purple
  orep: { visible: true, strokeColor: '#0000FF', fillColor: '#0000FF', fillOpacity: 0.2, strokeWeight: 2 }, // blue — OREP-drawn
};

const BUCKET_KEYS: StyleBucketKey[] = [1, 2, 3, 'orep'];

function isValid(parsed: any): parsed is StarbucksTargetAreaStyles {
  if (!parsed || typeof parsed !== 'object') return false;
  for (const k of BUCKET_KEYS) {
    const s = parsed[k];
    if (!s || typeof s.strokeColor !== 'string' || typeof s.fillColor !== 'string') return false;
    if (typeof s.fillOpacity !== 'number' || typeof s.strokeWeight !== 'number') return false;
  }
  return true;
}

function loadFromStorage(): StarbucksTargetAreaStyles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STYLES;
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return DEFAULT_STYLES;
    // Merge with defaults so unknown future fields fall back cleanly
    return {
      1: { ...DEFAULT_STYLES[1], ...parsed[1] },
      2: { ...DEFAULT_STYLES[2], ...parsed[2] },
      3: { ...DEFAULT_STYLES[3], ...parsed[3] },
      orep: { ...DEFAULT_STYLES.orep, ...parsed.orep },
    };
  } catch {
    return DEFAULT_STYLES;
  }
}

export function useStarbucksTargetAreaStyles() {
  const [styles, setStyles] = useState<StarbucksTargetAreaStyles>(loadFromStorage);

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
    } catch {
      // localStorage may be unavailable (Safari private mode, quota); ignore — state still works for this session
    }
  }, [styles]);

  const updateStyle = useCallback((bucket: StyleBucketKey, partial: Partial<PriorityStyle>) => {
    setStyles(prev => ({ ...prev, [bucket]: { ...prev[bucket], ...partial } }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setStyles(DEFAULT_STYLES);
  }, []);

  // Force all buckets visible without touching colors/opacity.
  // Called when the master layer toggle transitions off→on so re-enabling the layer
  // is always "show everything" (the user can re-hide individual buckets afterward).
  const showAllBuckets = useCallback(() => {
    setStyles(prev => ({
      1: { ...prev[1], visible: true },
      2: { ...prev[2], visible: true },
      3: { ...prev[3], visible: true },
      orep: { ...prev.orep, visible: true },
    }));
  }, []);

  return { styles, updateStyle, resetToDefaults, showAllBuckets };
}
