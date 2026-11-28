import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { CompProperty, unmappedReasonLabel } from '../../../lib/compTypes';

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

interface Props {
  /** Opens the ordinary comp slideout — the same one a pin click opens. */
  onSelect: (comp: CompProperty) => void;
  /** Id of the comp currently open, so the list can show which one it is. */
  selectedId?: string | null;
  /** Bumped by the parent after a placement, to re-read the list. */
  refreshToken?: number;
}

/**
 * The unmapped worklist for the Comp Database layer — mostly NNN listings whose
 * address no geocoder could place (Census, then Google). Modeled on
 * MunicipalProjectUnplacedPanel and rendered the same way: INSIDE the Comp
 * Database row of the Layers menu, and OUTSIDE that row's `isVisible` guard, so
 * the count stays visible with the layer switched off.
 *
 * Clicking a row opens the comp slideout, whose "Drop a pin" button starts the
 * map pin drop. Unmapped = no usable coordinate (verified_* or raw), the same
 * test the layer uses to skip a comp, so the list can't disagree with the map.
 * Rejected comps are never drawn and so are never listed.
 */
const CompUnplacedPanel: React.FC<Props> = ({ onSelect, selectedId, refreshToken }) => {
  const [rows, setRows] = useState<CompProperty[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Small by nature; ranged past the default 1000 so a bad sweep can't truncate it.
      const { data, error: err } = await supabase
        .from('comp_property')
        .select('*')
        .is('latitude', null)
        .is('verified_latitude', null)
        .neq('review_status', 'rejected')
        .order('created_at', { ascending: false })
        .range(0, 4999);
      if (err) throw err;
      setRows((data ?? []) as CompProperty[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // Nothing unmapped and nothing to report: say nothing at all.
  if (!loading && rows.length === 0 && !error) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-gray-50"
        style={{ border: `1px solid ${BRAND.slate}` }}
        title="Comps / NNN listings with no location. Open one to drop its pin."
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
            No geocoder could place these. Open one and drop its pin.
          </div>

          {error && (
            <div className="px-2 py-1.5 text-xs" style={{ color: BRAND.terracotta }}>{error}</div>
          )}

          <div className="max-h-64 overflow-y-auto divide-y border-t" style={{ borderColor: BRAND.slate }}>
            {loading && rows.length === 0 && (
              <div className="px-2 py-1.5 text-xs" style={{ color: BRAND.slate }}>Loading…</div>
            )}
            {rows.map((c) => (
              <button key={c.id} type="button" onClick={() => onSelect(c)}
                      className="w-full text-left px-2 py-1.5 hover:bg-gray-50"
                      style={{ backgroundColor: c.id === selectedId ? '#F8FAFC' : undefined }}>
                <div className="text-xs font-medium truncate" style={{ color: BRAND.midnight }}>
                  {c.name || c.address || '(unnamed)'}
                  {c.review_status === 'pending_review' && (
                    <span className="ml-1 text-[10px] uppercase" style={{ color: BRAND.terracotta }}>pending</span>
                  )}
                </div>
                <div className="text-xs truncate" style={{ color: BRAND.slate }}>
                  {[c.address, c.city].filter(Boolean).join(', ')}
                </div>
                <div className="text-xs mt-0.5" style={{ color: BRAND.steel }}>
                  {unmappedReasonLabel(c.geocode_status)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompUnplacedPanel;
