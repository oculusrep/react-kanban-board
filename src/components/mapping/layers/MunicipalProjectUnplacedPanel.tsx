import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { unplacedLabel } from '../../../services/placementPrecision';
import type { MunicipalProjectMapRow } from './MunicipalProjectLayer';

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

interface Props {
  /** Opens the ordinary project slideout — the same one a pin click opens. */
  onSelect: (row: MunicipalProjectMapRow) => void;
  /** Id of the project currently open, so the list can show which one it is. */
  selectedId?: string | null;
  /** Bumped by the parent after a placement, to re-read the list. */
  refreshToken?: number;
}

/**
 * The unplaced worklist, rendered INSIDE the Municipal Projects row of the
 * Layers menu.
 *
 * These are COMPLETE municipal_project records with no trustworthy coordinate —
 * a vague address that geocoded to a county/city centroid, or to a road. They are
 * deliberately absent from the map rather than pinned somewhere they aren't, so
 * without this list they would be invisible.
 *
 * It lives here, not floating over the map, for two reasons: the bottom-left
 * corner is the Site Submit Legend's, and a count of municipal projects belongs
 * with the municipal projects layer control. It sits OUTSIDE that row's
 * `isVisible` guard on purpose — the queue must stay countable when the layer is
 * switched off, or it grows unnoticed.
 *
 * Clicking a row opens the ordinary project card, with every field, from which
 * the boundary can be drawn, the parcel fetched, or a pin dropped. Nothing is
 * re-entered by hand.
 */
const MunicipalProjectUnplacedPanel: React.FC<Props> = ({ onSelect, selectedId, refreshToken }) => {
  const [rows, setRows] = useState<MunicipalProjectMapRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  // Filter by why it's unplaced. A road centroid is a near miss; a county
  // centroid is nowhere at all, and those are the ones worth doing first.
  const [reasonFilter, setReasonFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Small set by nature (24 at the time of writing), but ranged past the
      // default 1000 so a bad research run can't silently truncate the worklist.
      const { data, error: err } = await supabase
        .from('municipal_project_v')
        .select('*')
        .eq('is_unplaced', true)
        .order('municipality_name')
        .order('project_name')
        .range(0, 4999);
      if (err) throw err;
      setRows((data ?? []) as unknown as MunicipalProjectMapRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // Nothing unplaced and nothing to report: say nothing at all.
  if (!loading && rows.length === 0 && !error) return null;

  const reasons = [...new Set(rows.map((r) => r.unplaced_reason ?? 'unknown'))];
  const shown = reasonFilter === 'all'
    ? rows
    : rows.filter((r) => (r.unplaced_reason ?? 'unknown') === reasonFilter);

  const reasonChipLabel = (r: string) =>
    r === 'all' ? 'All'
    : r === 'admin_area_centroid' ? 'County / city only'
    : r === 'road_centroid' ? 'Road only'
    : r === 'geocode_failed' ? 'No geocode'
    : r === 'no_address' ? 'No address'
    : r;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-gray-50"
        style={{ border: `1px solid ${BRAND.slate}` }}
        title="Municipal projects with no reliable location. Open one to place it."
      >
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: BRAND.terracotta, color: '#FFFFFF' }}>
          {loading && rows.length === 0 ? '…' : rows.length}
        </span>
        <span className="text-xs font-medium" style={{ color: BRAND.midnight }}>
          not on map
        </span>
        <span className="text-xs ml-auto" style={{ color: BRAND.steel }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-1 rounded" style={{ border: `1px solid ${BRAND.slate}` }}>
          <div className="px-2 py-1.5 text-xs" style={{ color: BRAND.steel, backgroundColor: '#F8FAFC' }}>
            Complete records with no reliable location. Open one to draw its boundary
            or drop a pin.
          </div>

          {error && (
            <div className="px-2 py-1.5 text-xs" style={{ color: BRAND.terracotta }}>{error}</div>
          )}

          {reasons.length > 1 && (
            <div className="px-2 py-1.5 flex flex-wrap gap-1 border-t" style={{ borderColor: BRAND.slate }}>
              {['all', ...reasons].map((r) => {
                const active = reasonFilter === r;
                const n = r === 'all' ? rows.length
                  : rows.filter((x) => (x.unplaced_reason ?? 'unknown') === r).length;
                return (
                  <button key={r} type="button" onClick={() => setReasonFilter(r)}
                          className="text-xs px-1.5 py-0.5 rounded border"
                          style={{
                            borderColor: active ? BRAND.midnight : BRAND.slate,
                            backgroundColor: active ? BRAND.midnight : '#FFFFFF',
                            color: active ? '#FFFFFF' : BRAND.steel,
                          }}>
                    {reasonChipLabel(r)} ({n})
                  </button>
                );
              })}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto divide-y border-t" style={{ borderColor: BRAND.slate }}>
            {loading && rows.length === 0 && (
              <div className="px-2 py-1.5 text-xs" style={{ color: BRAND.slate }}>Loading…</div>
            )}
            {shown.map((r) => (
              <button key={r.id} type="button" onClick={() => onSelect(r)}
                      className="w-full text-left px-2 py-1.5 hover:bg-gray-50"
                      style={{ backgroundColor: r.id === selectedId ? '#F8FAFC' : undefined }}>
                <div className="text-xs font-medium truncate" style={{ color: BRAND.midnight }}>
                  {r.project_name || '(unnamed)'}
                </div>
                <div className="text-xs truncate" style={{ color: BRAND.slate }}>
                  {[r.municipality_name, r.total_housing_units != null ? `${r.total_housing_units} units` : null]
                    .filter(Boolean).join(' · ')}
                </div>
                <div className="text-xs mt-0.5" style={{ color: BRAND.steel }}>
                  {unplacedLabel(r.unplaced_reason)}
                  {(r.parcel_numbers?.length ?? 0) > 0 && (
                    <span style={{ color: BRAND.slate }}> · {r.parcel_numbers!.length} parcel
                      {r.parcel_numbers!.length === 1 ? '' : 's'} on file</span>
                  )}
                </div>
              </button>
            ))}
            {!loading && shown.length === 0 && (
              <div className="px-2 py-1.5 text-xs" style={{ color: BRAND.slate }}>
                Nothing in this category.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MunicipalProjectUnplacedPanel;
