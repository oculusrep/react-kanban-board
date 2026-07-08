import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as turf from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { supabase } from '../../../lib/supabaseClient';

// Screenshot-ready modal: total housing units by stage for municipal_project
// polygons that intersect each of the four catchments around an ad-hoc point.
// Any-overlap counts; nested catchments are cumulative (a project inside 1mi
// also counts toward 3mi, 5min, 10min if it intersects those too).

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coordinates: { lat: number; lng: number } | null;
  // Drive-time isochrone polygons from the parent slideout's fetch,
  // keyed like "5min_drive" / "10min_drive".
  isochrones: Record<string, { type: 'Polygon'; coordinates: number[][][] }>;
}

const GRID_LINE = '1px solid rgba(255, 255, 255, 0.18)';

// Row order = mockup order (RC → UC → AP → UR). Stored as the effective_stage_name
// text from municipal_project_v, matched case-insensitively.
const STAGE_ROWS: Array<{ label: string; abbr: string; matches: string[] }> = [
  { label: 'Recently Complete', abbr: 'RC', matches: ['recently completed', 'recently complete', 'built out'] },
  { label: 'Under Construction', abbr: 'UC', matches: ['under construction'] },
  { label: 'Approved', abbr: 'AP', matches: ['approved'] },
  { label: 'Planning', abbr: 'UR', matches: ['planning', 'under review'] },
];

type CatchmentKey = '1mi' | '3mi' | '5min' | '10min';

const CATCHMENTS: Array<{ label: string; key: CatchmentKey }> = [
  { label: '1mi', key: '1mi' },
  { label: '3mi', key: '3mi' },
  { label: '5min', key: '5min' },
  { label: '10min', key: '10min' },
];

interface ProjectRow {
  id: string;
  effective_stage_name: string | null;
  total_housing_units: number | null;
  geometry_geojson: Polygon | null;
}

type UnitsByStageByCatchment = Record<string, Partial<Record<CatchmentKey, number>>>;

function stageLabelFor(rawStage: string | null): string | null {
  if (!rawStage) return null;
  const lower = rawStage.trim().toLowerCase();
  for (const row of STAGE_ROWS) {
    if (row.matches.includes(lower)) return row.label;
  }
  return null;
}

function buildCatchmentFeatures(
  coordinates: { lat: number; lng: number },
  isochrones: Record<string, { type: 'Polygon'; coordinates: number[][][] }>,
): Partial<Record<CatchmentKey, Feature<Polygon>>> {
  const center: [number, number] = [coordinates.lng, coordinates.lat];
  const out: Partial<Record<CatchmentKey, Feature<Polygon>>> = {};

  out['1mi'] = turf.circle(center, 1, { units: 'miles', steps: 64 }) as Feature<Polygon>;
  out['3mi'] = turf.circle(center, 3, { units: 'miles', steps: 64 }) as Feature<Polygon>;

  const iso5 = isochrones['5min_drive'];
  if (iso5) out['5min'] = turf.polygon(iso5.coordinates) as Feature<Polygon>;
  const iso10 = isochrones['10min_drive'];
  if (iso10) out['10min'] = turf.polygon(iso10.coordinates) as Feature<Polygon>;

  return out;
}

function computeUnitsByStage(
  projects: ProjectRow[],
  catchments: Partial<Record<CatchmentKey, Feature<Polygon>>>,
): UnitsByStageByCatchment {
  const out: UnitsByStageByCatchment = {};
  for (const row of STAGE_ROWS) out[row.label] = {};

  for (const p of projects) {
    const stageLabel = stageLabelFor(p.effective_stage_name);
    if (!stageLabel) continue;
    if (!p.geometry_geojson || !p.total_housing_units) continue;

    let projectFeature: Feature<Polygon>;
    try {
      projectFeature = turf.polygon(p.geometry_geojson.coordinates) as Feature<Polygon>;
    } catch {
      continue;
    }

    for (const key of Object.keys(catchments) as CatchmentKey[]) {
      const catch_ = catchments[key];
      if (!catch_) continue;
      if (turf.booleanIntersects(projectFeature, catch_)) {
        out[stageLabel][key] = (out[stageLabel][key] ?? 0) + p.total_housing_units;
      }
    }
  }

  return out;
}

const formatNumber = (n: number | null | undefined) =>
  n == null ? '—' : Math.round(n).toLocaleString();

const MunicipalUnitsScreenshotModal: React.FC<Props> = ({
  isOpen,
  onClose,
  coordinates,
  isochrones,
}) => {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase
        .from('municipal_project_v')
        .select('id, effective_stage_name, total_housing_units, geometry_geojson')
        .not('geometry_geojson', 'is', null)
        .gt('total_housing_units', 0);
      if (cancelled) return;
      if (error) {
        console.error('[MunicipalUnitsScreenshot] fetch failed:', error);
        setLoadError(error.message);
        setIsLoading(false);
        return;
      }
      setProjects((data ?? []) as ProjectRow[]);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const catchmentFeatures = useMemo(() => {
    if (!coordinates) return {};
    return buildCatchmentFeatures(coordinates, isochrones);
  }, [coordinates, isochrones]);

  const totals = useMemo(() => {
    if (!projects) return null;
    return computeUnitsByStage(projects, catchmentFeatures);
  }, [projects, catchmentFeatures]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-lg shadow-2xl"
        style={{
          backgroundColor: '#2F2F2F',
          color: '#FFFFFF',
          padding: '32px 40px',
          minWidth: '560px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-3 text-lg leading-none"
          style={{ color: '#9CA3AF' }}
        >
          ×
        </button>

        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  padding: '0 26px 16px 0',
                  textAlign: 'left',
                  borderBottom: GRID_LINE,
                }}
              >
                Housing Growth
              </th>
              {CATCHMENTS.map((c) => (
                <th
                  key={c.key}
                  style={{
                    fontSize: '18px',
                    fontWeight: 400,
                    color: '#E5E7EB',
                    padding: '0 19px 16px',
                    textAlign: 'center',
                    borderBottom: GRID_LINE,
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAGE_ROWS.map((row) => (
              <tr key={row.abbr}>
                <td
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    padding: '9px 26px 9px 0',
                    whiteSpace: 'nowrap',
                    borderBottom: GRID_LINE,
                  }}
                >
                  {row.label} ({row.abbr})
                </td>
                {CATCHMENTS.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      fontSize: '16px',
                      color: '#FFFFFF',
                      padding: '9px 19px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                      borderBottom: GRID_LINE,
                    }}
                  >
                    {isLoading || !totals
                      ? '…'
                      : formatNumber(totals[row.label]?.[c.key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  padding: '9px 26px 9px 0',
                  textAlign: 'right',
                }}
              >
                Totals
              </td>
              {CATCHMENTS.map((c) => {
                const total = totals
                  ? STAGE_ROWS.reduce(
                      (sum, row) => sum + (totals[row.label]?.[c.key] ?? 0),
                      0,
                    )
                  : null;
                return (
                  <td
                    key={c.key}
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      padding: '9px 19px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {isLoading ? '…' : formatNumber(total)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        {loadError && (
          <div
            style={{
              marginTop: '16px',
              fontSize: '12px',
              color: '#F87171',
            }}
          >
            Failed to load: {loadError}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default MunicipalUnitsScreenshotModal;
