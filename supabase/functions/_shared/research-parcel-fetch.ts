/**
 * Post-run parcel fetch for staged research records (the last step of
 * dedupe → Gemini → dedupe → parcel fetch, before "Sweep ready").
 *
 * Same adapters and fetch as the browser button (./parcel-adapters.ts, incl.
 * Henry's 75 s timeout + retry); same rules, enforced in the
 * set_staging_polygon_from_parcels RPC: union, acreage validation,
 * partial-parcel flag, valid MultiPolygon only, dashed until reviewed, never
 * replace an existing boundary. The pin is placed inside the shape on approve.
 *
 * Targets: PENDING rows of the given runs that have parcel ids, no boundary,
 * aren't matched to a committed record (that path never carries geometry), and
 * haven't already been resolved or found missing from the fabric. Records whose
 * municipality has no adapter are marked no_adapter (retried on a later pass,
 * in case an adapter has been added since).
 */

import { adapterFor, fetchParcelPolygons } from './parcel-adapters.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface ParcelFetchSummary {
  attempted: number;
  resolved: number;
  partial: number;
  none_resolved: number;
  no_adapter: number;
  snapshot_mismatch: number;
  no_stated_acres: number;
  errors: number;
}

export async function fetchBoundariesForRuns(supabase: Supa, runIds: string[]): Promise<ParcelFetchSummary> {
  const sum: ParcelFetchSummary = { attempted: 0, resolved: 0, partial: 0, none_resolved: 0, no_adapter: 0, snapshot_mismatch: 0, no_stated_acres: 0, errors: 0 };
  if (runIds.length === 0) return sum;

  const { data, error } = await supabase
    .from('municipal_project_staging')
    .select('id, parcel_numbers, parcel_fetch_status, boundary_municipality(name)')
    .in('research_run_id', runIds)
    .eq('approval_state', 'pending')
    .is('geometry', null)
    .is('matched_existing_id', null);
  if (error) throw new Error(`load staging for parcel fetch: ${error.message}`);

  // deno-lint-ignore no-explicit-any
  const rows = (data ?? []).filter((r: any) =>
    Array.isArray(r.parcel_numbers) && r.parcel_numbers.some((p: string) => p && p.trim())
    && !['resolved', 'partial', 'none_resolved', 'snapshot_mismatch', 'no_stated_acres'].includes(r.parcel_fetch_status ?? ''));

  const mark = (id: string, status: string, note: string | null) =>
    supabase.from('municipal_project_staging')
      .update({ parcel_fetch_status: status, parcel_fetch_note: note, parcel_fetch_at: new Date().toISOString() })
      .eq('id', id).eq('approval_state', 'pending');

  // One record at a time: some county servers (Henry) are slow and fragile.
  for (const r of rows) {
    const muni: string | null = r.boundary_municipality?.name ?? null;
    const adapter = adapterFor(muni);
    if (!adapter) {
      await mark(r.id, 'no_adapter', `no parcel adapter for ${muni ?? 'this municipality'}`);
      sum.no_adapter++;
      continue;
    }
    sum.attempted++;
    try {
      const ids = (r.parcel_numbers as string[]).map((p) => p.trim()).filter(Boolean);
      const { resolved, missing } = await fetchParcelPolygons(adapter, ids);
      if (resolved.length === 0) {
        await mark(r.id, 'none_resolved',
          `none of the parcel ids are in the current ${adapter.label} fabric (likely re-platted): ${missing.join(', ')}`);
        sum.none_resolved++;
        continue;
      }
      const { data: res, error: rpcErr } = await supabase.rpc('set_staging_polygon_from_parcels', {
        p_id: r.id,
        p_parts: resolved.map((x) => x.geometry),
        p_parcels: resolved.map((x) => x.parcelId),
        p_missing: missing,
        p_source_vintage: adapter.sourceVintage ?? null,
        p_max_variance_pct: adapter.maxAcreageVariancePct ?? null,
        p_require_stated: adapter.requireStatedAcres ?? false,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      // The RPC records snapshot_mismatch / no_stated_acres itself (not saved).
      if (res?.skipped === 'snapshot_mismatch') sum.snapshot_mismatch++;
      else if (res?.skipped === 'no_stated_acres') sum.no_stated_acres++;
      else if (missing.length > 0) sum.partial++; else sum.resolved++;
    } catch (e) {
      sum.errors++;
      await mark(r.id, 'error', (e instanceof Error ? e.message : String(e)).slice(0, 400));
    }
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Committed municipal_project records (locate step's parcel ids)
// ---------------------------------------------------------------------------

export interface ProjectFetchResult {
  id: string;
  name: string | null;
  status: 'resolved' | 'partial' | 'none_resolved' | 'no_adapter' | 'has_boundary' | 'snapshot_mismatch' | 'no_stated_acres' | 'error';
  computed_acres?: number | null;
  stated_acres?: number | null;
  variance_pct?: number | null;
  needs_review?: boolean;
  missing?: string[];
  note?: string;
}

/**
 * Same fetch + rules as the "Fetch from parcels" button, server-side, through
 * set_municipal_project_polygon_from_parcels (union, acreage validation from
 * parcel_boundary_notes, partial flag, dashed until reviewed). Never replaces
 * an existing boundary.
 */
export async function fetchBoundariesForProjects(supabase: Supa, projectIds: string[]): Promise<ProjectFetchResult[]> {
  const out: ProjectFetchResult[] = [];
  if (projectIds.length === 0) return out;
  const { data, error } = await supabase.from('municipal_project')
    .select('id, project_name, parcel_numbers, geometry_source, municipality(name)').in('id', projectIds);
  if (error) throw new Error(`load projects for parcel fetch: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  for (const p of (data ?? []) as any[]) {
    const base = { id: p.id as string, name: p.project_name as string | null };
    if (p.geometry_source) { out.push({ ...base, status: 'has_boundary' }); continue; }
    const adapter = adapterFor(p.municipality?.name ?? null);
    if (!adapter) { out.push({ ...base, status: 'no_adapter', note: `no parcel adapter for ${p.municipality?.name}` }); continue; }
    const ids = ((p.parcel_numbers ?? []) as string[]).map((x) => x.trim()).filter(Boolean);
    try {
      const { resolved, missing } = await fetchParcelPolygons(adapter, ids);
      if (resolved.length === 0) { out.push({ ...base, status: 'none_resolved', missing }); continue; }
      const { data: res, error: rpcErr } = await supabase.rpc('set_municipal_project_polygon_from_parcels', {
        p_id: p.id,
        p_parts: resolved.map((x) => x.geometry),
        p_parcels: resolved.map((x) => x.parcelId),
        p_fetched_at: new Date().toISOString(),
        p_source_vintage: adapter.sourceVintage ?? null,
        p_max_variance_pct: adapter.maxAcreageVariancePct ?? null,
        p_require_stated: adapter.requireStatedAcres ?? false,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      if (res?.skipped) { out.push({ ...base, status: res.skipped, computed_acres: res.computed_acres, stated_acres: res.stated_acres ?? null, variance_pct: res.variance_pct ?? null, missing }); continue; }
      out.push({
        ...base, status: missing.length ? 'partial' : 'resolved', missing,
        computed_acres: res?.computed_acres ?? null, stated_acres: res?.stated_acres ?? null,
        variance_pct: res?.variance_pct ?? null, needs_review: res?.needs_review ?? null,
      });
    } catch (e) {
      out.push({ ...base, status: 'error', note: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }
  return out;
}
