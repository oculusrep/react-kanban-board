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
    p_source_vintage: adapter.sourceVintage ?? null,
    p_max_variance_pct: adapter.maxAcreageVariancePct ?? null,
    p_require_stated: adapter.requireStatedAcres ?? false,
  });
  if (error) throw error;

  const d = (data ?? {}) as Record<string, unknown>;
  // Low-trust source (e.g. a stale snapshot) refused to save: say why.
  if (d.skipped === 'snapshot_mismatch') {
    throw new Error(
      `Snapshot mismatch: the ${adapter.sourceVintage ?? 'parcel map'} gives ${d.computed_acres} ac against `
      + `${d.stated_acres} ac stated (${d.variance_pct}%, limit ${adapter.maxAcreageVariancePct}%). `
      + 'Nothing was saved — the parcels have likely been re-platted since. Draw the boundary by hand.',
    );
  }
  if (d.skipped === 'no_stated_acres') {
    throw new Error(
      `Not saved: boundaries from the ${adapter.sourceVintage ?? 'parcel map'} need a stated acreage to check against `
      + `(fetched ${d.computed_acres} ac), and this record has none. Add the acreage to the parcel notes, or draw it by hand.`,
    );
  }
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

export interface AutoPlaceOutcome {
  placed: { name: string; acres: number | null; variancePct: number | null; flagged: boolean }[];
  /** Resolved nothing — every parcel id is gone from the fabric (re-platted). */
  failed: { name: string; reason: string }[];
  /** Has parcel ids but no county adapter, so nothing was attempted. */
  skipped: { name: string; municipality: string | null }[];
}

/**
 * Place records from their parcel boundaries automatically, right after approve.
 *
 * Only touches records that are UNPLACED — a precise address geocode already gave
 * them a location and is not second-guessed. FETCH ONCE: a record that already has
 * a boundary is never re-fetched, here or anywhere, because the county fabric
 * refreshes nightly and a re-plat would overwrite a correct boundary.
 *
 * A partial resolution still places: the RPC unions whatever parcels came back and
 * flags the acreage variance, which is exactly the retired-parcel-id signal. A
 * flagged record is placed AND left flagged for review rather than held back — a
 * boundary that is probably right beats no boundary, as long as it says so.
 */
export async function autoPlaceFromParcels(
  runIds: string[],
  signal?: AbortSignal,
): Promise<AutoPlaceOutcome> {
  const out: AutoPlaceOutcome = { placed: [], failed: [], skipped: [] };
  if (runIds.length === 0) return out;

  const { data, error } = await supabase
    .from('municipal_project_v')
    .select('id, project_name, municipality_name, parcel_numbers, is_unplaced')
    .in('source_research_run_id', runIds)
    .eq('is_unplaced', true)
    .range(0, 4999);
  if (error) throw error;

  for (const row of (data ?? []) as {
    id: string; project_name: string | null; municipality_name: string | null;
    parcel_numbers: string[] | null;
  }[]) {
    const name = row.project_name ?? '(unnamed)';
    if (!row.parcel_numbers?.length) continue;   // nothing to look up
    if (!adapterFor(row.municipality_name)) {
      out.skipped.push({ name, municipality: row.municipality_name });
      continue;
    }
    try {
      const r = await applyParcelBoundary({
        projectId: row.id,
        municipalityName: row.municipality_name,
        parcelNumbers: row.parcel_numbers,
        statedAcres: null,          // the RPC parses it from parcel_boundary_notes
        signal,
      });
      out.placed.push({
        name, acres: r.computedAcres, variancePct: r.variancePct, flagged: r.needsReview,
      });
    } catch (e) {
      // Left unplaced, on the worklist, with the manual Fetch button still available.
      out.failed.push({ name, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
