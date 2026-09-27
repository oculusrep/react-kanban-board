import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';

// Screenshot-ready modal: total housing units by stage for municipal projects
// falling inside each of the four catchments around an ad-hoc point.
// Nested catchments are cumulative (a project inside 1mi also counts toward
// 3mi, 5min, 10min if it falls inside those too).
//
// Two modes, selected via the `mode` prop:
//   - 'polygon' (default): count a project when its drawn boundary (geometry_geojson)
//     intersects the catchment. Any overlap counts the project's full unit total.
//   - 'pin': count a project when its map-pin point (centroid_lat/lng) falls inside
//     the catchment. A fast read on units before polygons are drawn — every project
//     with a pin and units is counted, regardless of whether it has a polygon yet.

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coordinates: { lat: number; lng: number } | null;
  // Drive-time isochrone polygons from the parent slideout's fetch,
  // keyed like "5min_drive" / "10min_drive".
  isochrones: Record<string, { type: 'Polygon'; coordinates: number[][][] }>;
  // How to place a project in a catchment. Defaults to 'polygon'.
  mode?: 'polygon' | 'pin';
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

type UnitsByStageByCatchment = Record<string, Partial<Record<CatchmentKey, number>>>;

/** What public.site_pipeline_matrix returns per band; both membership variants, labelled. */
type PipelineMatrixBands = Array<{
  band: CatchmentKey;
  phases: Record<string, { units_centroid: number; units_intersects: number }>;
}>;

function stageLabelFor(rawStage: string | null): string | null {
  if (!rawStage) return null;
  const lower = rawStage.trim().toLowerCase();
  for (const row of STAGE_ROWS) {
    if (row.matches.includes(lower)) return row.label;
  }
  return null;
}

const formatNumber = (n: number | null | undefined) =>
  n == null ? '—' : Math.round(n).toLocaleString();

const MunicipalUnitsScreenshotModal: React.FC<Props> = ({
  isOpen,
  onClose,
  coordinates,
  isochrones,
  mode = 'polygon',
}) => {
  const [matrix, setMatrix] = useState<PipelineMatrixBands | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ONE count, shared with site research: public.site_pipeline_matrix (20260927085437). The counting
  // used to live here in turf and separately in the edge function, and the two drifted — site
  // research reported 860 units for Macon where this modal showed 2,478.
  useEffect(() => {
    if (!isOpen || !coordinates) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase.rpc('site_pipeline_matrix', {
        p_latitude: coordinates.lat,
        p_longitude: coordinates.lng,
        p_households: {},
        p_site_submit_id: null,
        p_isochrones: Object.keys(isochrones ?? {}).length ? isochrones : null,
      });
      if (cancelled) return;
      if (error) {
        console.error('[MunicipalUnitsScreenshot] site_pipeline_matrix failed:', error);
        setLoadError(error.message);
        setIsLoading(false);
        return;
      }
      setMatrix((data as { bands: PipelineMatrixBands }).bands ?? null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, coordinates, isochrones]);

  // 'polygon' reads the boundary-intersects count, 'pin' the centroid count — same numbers the
  // function hands site research, just the variant this modal is showing.
  const totals = useMemo(() => {
    if (!matrix) return null;
    const out: UnitsByStageByCatchment = {};
    for (const row of STAGE_ROWS) out[row.label] = {};
    for (const band of matrix) {
      for (const [phase, cell] of Object.entries(band.phases ?? {})) {
        const label = stageLabelFor(phase);
        if (!label) continue;
        const units = mode === 'pin' ? cell.units_centroid : cell.units_intersects;
        if (units) out[label][band.band] = (out[label][band.band] ?? 0) + units;
      }
    }
    return out;
  }, [matrix, mode]);

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
