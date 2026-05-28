import { useCallback, useEffect, useState } from 'react';

// Global style applied to ALL municipal_project polygons. Stage color still drives
// the fill/stroke base color; this hook controls only opacity and stroke weight.
// Per-stage color override could be a v2 if needed.
export interface MunicipalPolygonStyle {
  fillOpacity: number;   // 0..1
  strokeOpacity: number; // 0..1
  strokeWeight: number;  // px, 1..6
}

const STORAGE_KEY = 'municipal_project_polygon_style_v1';

export const DEFAULT_POLYGON_STYLE: MunicipalPolygonStyle = {
  fillOpacity: 0.2,
  strokeOpacity: 0.9,
  strokeWeight: 2,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function isValid(parsed: unknown): parsed is MunicipalPolygonStyle {
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
    return {
      fillOpacity: clamp(parsed.fillOpacity, 0, 1),
      strokeOpacity: clamp(parsed.strokeOpacity, 0, 1),
      strokeWeight: clamp(parsed.strokeWeight, 1, 6),
    };
  } catch {
    return DEFAULT_POLYGON_STYLE;
  }
}

export function useMunicipalProjectPolygonStyle() {
  const [style, setStyle] = useState<MunicipalPolygonStyle>(loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
    } catch {
      // private mode / quota — non-fatal
    }
  }, [style]);

  const update = useCallback((partial: Partial<MunicipalPolygonStyle>) => {
    setStyle((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setStyle(DEFAULT_POLYGON_STYLE);
  }, []);

  return { style, update, resetToDefaults };
}
