import { useCallback, useEffect, useState } from 'react';

// Global style applied to ALL municipal_project polygons. Fill color comes from
// the stage; line color is either the stage's own line_color (falling back to
// the fill color when unset) or a global override configured here.
export interface MunicipalPolygonStyle {
  fillOpacity: number;   // 0..1
  strokeOpacity: number; // 0..1
  strokeWeight: number;  // px, 1..6
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
