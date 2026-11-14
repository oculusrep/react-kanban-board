import { supabase } from '../lib/supabaseClient';

// The adapter registry and the fetch live in a module shared with the edge
// functions (post-run parcel fetch), so the browser button and the server step
// can never drift apart. Everything is re-exported here for existing callers.
export * from '../../supabase/functions/_shared/parcel-adapters';
import { adapterFor, fetchParcelPolygons, type FetchProgress } from '../../supabase/functions/_shared/parcel-adapters';

export interface ApplyParcelBoundaryResult {
  computedAcres: number | null;
  statedAcres: number | null;
  variancePct: number | null;
  needsReview: boolean;
  /** The polygon hint cites a partial parcel ("(pt.)", "portion of"): the
   *  boundary covers the whole parcel, so it's flagged whatever the acreage. */
  partialParcel: boolean;
  missing: string[];
  parts: number;
}

/**
 * Fetch, union and store a project's boundary.
 *
 * The union happens in PostGIS, not here: ST_Union dissolves shared boundaries, so
 * contiguous parcels become one outline instead of stacked shapes.
 */
export async function applyParcelBoundary(opts: {
  projectId: string;
  municipalityName: string | null;
  parcelNumbers: string[];
  statedAcres: number | null;
  signal?: AbortSignal;
  onProgress?: (p: FetchProgress) => void;
}): Promise<ApplyParcelBoundaryResult> {
  const adapter = adapterFor(opts.municipalityName);
  if (!adapter) {
    throw new Error(
      `No parcel map is wired up for ${opts.municipalityName ?? 'this municipality'}. `
      + 'Draw the boundary by hand, or add a county adapter.',
    );
  }
  if (!opts.parcelNumbers?.length) {
    throw new Error('This project has no parcel numbers to look up.');
  }

  const { resolved, missing } = await fetchParcelPolygons(adapter, opts.parcelNumbers, opts.signal, opts.onProgress);
  if (resolved.length === 0) {
    throw new Error(
      `None of these parcel ids exist in the current ${adapter.label} parcel map `
      + `(${missing.join(', ')}). That usually means the development re-platted them.`,
    );
  }

  // Cancel only abandons the county fetch above. Once the polygons are in hand
  // the write goes through, so a late Cancel can't leave the UI claiming no
  // boundary was saved when one was.
  const { data, error } = await supabase.rpc('set_municipal_project_polygon_from_parcels', {
    p_id: opts.projectId,
    p_parts: resolved.map((r) => r.geometry),
    p_parcels: resolved.map((r) => r.parcelId),
    p_stated_acres: opts.statedAcres,
  });
  if (error) throw error;

  const d = (data ?? {}) as Record<string, unknown>;
  return {
    computedAcres: d.computed_acres == null ? null : Number(d.computed_acres),
    statedAcres: d.stated_acres == null ? null : Number(d.stated_acres),
    variancePct: d.variance_pct == null ? null : Number(d.variance_pct),
    needsReview: !!d.needs_review,
    partialParcel: !!d.partial_parcel,
    missing,
    parts: resolved.length,
  };
}
