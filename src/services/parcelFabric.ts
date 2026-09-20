import { supabase } from '../lib/supabaseClient';

/**
 * Fetching a project's boundary from a county parcel fabric.
 *
 * Deliberately a REGISTRY, not a general "GA parcel geocoder". There is no
 * statewide Georgia parcel layer to build one on — the state clearinghouse is
 * login-gated, and the nationwide layers on ArcGIS are raster tiles that cannot
 * be queried by parcel number. Coverage is per-county and patchy (8 of 20 counties
 * probed had a usable public endpoint; Hall, the biggest research footprint, has
 * none). Adding a county is adding an entry here. See
 * docs/PARCEL_ID_GEOCODING_FEASIBILITY.md.
 *
 * FETCH ONCE, AT CREATION. There is no refetch by design: county fabrics refresh
 * nightly, and an approved development re-plats the very parcels its record cites,
 * so a refetch would overwrite a correct boundary with whatever replaced it.
 */

export interface CountyAdapter {
  /** boundary_municipality / municipality name this applies to, lowercased. */
  matches: (municipalityName: string) => boolean;
  label: string;
  layerUrl: string;
  idField: string;
  /**
   * Build the `where` clause for a parcel id.
   *
   * Forsyth stores PARCELID space-padded ("220   017") while every source writes
   * it "220-017", and the service rejects REPLACE() in a where clause (it enforces
   * standardized queries — verified: "400 Unable to perform query operation").
   * So the id's alphanumeric runs are joined with % and the result is verified
   * client-side by comparing normalized strings.
   */
  whereFor: (parcelId: string) => string;
}

/** Strip punctuation and case. Verified lossless on all 105,470 Forsyth parcels: */
/*  105,137 distinct raw ids -> 105,137 distinct normalized, zero collisions.    */
export const normalizeParcelId = (id: string) =>
  (id ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

const likeFromRuns = (field: string, parcelId: string) => {
  const runs = (parcelId ?? '').split(/[^0-9A-Za-z]+/).filter(Boolean);
  return `${field} LIKE '${runs.join('%')}'`;
};

export const COUNTY_ADAPTERS: CountyAdapter[] = [
  {
    // Forsyth County's own ArcGIS Server — not indexed by ArcGIS Online, which is
    // why a portal search does not find it. Anonymous, no token, Query-only.
    matches: (n) => /^forsyth county$/i.test(n) || /^cumming$/i.test(n),
    label: 'Forsyth County',
    layerUrl: 'https://geo.forsythco.com/gis/rest/services/Public/Tax_Parcel/FeatureServer/0',
    idField: 'PARCELID',
    whereFor: (id) => likeFromRuns('PARCELID', id),
  },
];

export const adapterFor = (municipalityName: string | null | undefined): CountyAdapter | null =>
  COUNTY_ADAPTERS.find((a) => a.matches((municipalityName ?? '').trim())) ?? null;

export interface ParcelFetchResult {
  resolved: { parcelId: string; geometry: unknown }[];
  /** Asked for but absent from the current fabric — almost always re-platted. */
  missing: string[];
}

/**
 * Pull the polygons for a set of parcel ids.
 *
 * `f=geojson`, never `f=json`: the two wind rings oppositely (verified — Esri's
 * own format returns clockwise outer rings), and the Esri format would invert
 * interior rings on every holed parcel.
 */
export async function fetchParcelPolygons(
  adapter: CountyAdapter,
  parcelIds: string[],
  signal?: AbortSignal,
): Promise<ParcelFetchResult> {
  const wanted = parcelIds.filter(Boolean);
  if (wanted.length === 0) return { resolved: [], missing: [] };

  const params = new URLSearchParams({
    where: wanted.map((id) => adapter.whereFor(id)).join(' OR '),
    outFields: `${adapter.idField},STATEDAREA`,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });

  const res = await fetch(`${adapter.layerUrl}/query?${params}`, { signal });
  if (!res.ok) throw new Error(`${adapter.label} parcel service returned ${res.status}`);
  const body = await res.json();
  if (body?.error) {
    throw new Error(`${adapter.label} parcel service: ${body.error.message ?? 'query failed'}`);
  }

  const byNorm = new Map<string, unknown>();
  for (const f of body?.features ?? []) {
    const raw = f?.properties?.[adapter.idField];
    if (!raw || !f.geometry) continue;
    // A LIKE pattern can over-match; only an exact normalized match counts.
    // Condominium parcels repeat the same footprint across rows, so first wins.
    const key = normalizeParcelId(String(raw));
    if (!byNorm.has(key)) byNorm.set(key, f.geometry);
  }

  const resolved: { parcelId: string; geometry: unknown }[] = [];
  const missing: string[] = [];
  for (const id of wanted) {
    const g = byNorm.get(normalizeParcelId(id));
    if (g) resolved.push({ parcelId: id, geometry: g });
    else missing.push(id);
  }
  return { resolved, missing };
}

export interface ApplyParcelBoundaryResult {
  computedAcres: number | null;
  statedAcres: number | null;
  variancePct: number | null;
  needsReview: boolean;
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

  const { resolved, missing } = await fetchParcelPolygons(adapter, opts.parcelNumbers, opts.signal);
  if (resolved.length === 0) {
    throw new Error(
      `None of these parcel ids exist in the current ${adapter.label} parcel map `
      + `(${missing.join(', ')}). That usually means the development re-platted them.`,
    );
  }

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
    missing,
    parts: resolved.length,
  };
}
