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
  /** Extra attribute fields to request. Only fields the layer actually has — an
   *  unknown field fails the whole query. */
  extraFields?: string[];
  /** Per-attempt timeout. Default 30 s. */
  timeoutMs?: number;
  /** Retries after a timeout / 5xx / server-side wait timeout. Default 0. */
  retries?: number;
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
    extraFields: ['STATEDAREA'],
  },
  {
    // Henry County's own ArcGIS Server, behind an Imperva WAF. Anonymous and
    // CORS-open, but it hangs: queries have taken 20–60 s, and the server's own
    // queue gives up at 60 s with an HTTP 200 carrying {"error":{"code":503,
    // "message":"…Wait timeout for the request exceeded."}} (seen 2026-11-12).
    // Hence the long timeout and a retry. PARCEL_NO comes dashed or not
    // (128-02065000, H04A01001000); likeFromRuns + the normalized compare
    // handle both. Jenkinsburg is in Butts County, not Henry — not matched here.
    matches: (n) => /^(henry county|mcdonough|stockbridge|hampton|locust grove)$/i.test(n),
    label: 'Henry County',
    layerUrl: 'https://arcgis.co.henry.ga.us/server/rest/services/Parcels/MapServer/12',
    idField: 'PARCEL_NO',
    whereFor: (id) => likeFromRuns('PARCEL_NO', id),
    timeoutMs: 75_000,
    retries: 1,
  },
  {
    // Gainesville-Hall County GIS, Esri-hosted (hallgis.maps.arcgis.com). There is
    // no county-run server; this AGOL layer is the public one. Data last edited
    // 2025-07-22 — a parcel split since then won't be in it, which surfaces as a
    // "missing" id, same as a re-plat. PIN is "10081 000099" or "15043D000069",
    // with an optional 1–2 letter suffix; likeFromRuns + the normalized compare
    // handle the space / dash variants sources write. Braselton straddles four
    // counties, so it isn't matched.
    matches: (n) => /^(hall county|gainesville|flowery branch|oakwood|lula|clermont|gillsville)$/i.test(n),
    label: 'Hall County',
    layerUrl: 'https://services1.arcgis.com/3t0UAc8xSMWWaD2c/arcgis/rest/services/parcel_owner_public/FeatureServer/0',
    idField: 'PIN',
    whereFor: (id) => likeFromRuns('PIN', id),
    retries: 1,
  },
];

export const adapterFor = (municipalityName: string | null | undefined): CountyAdapter | null =>
  COUNTY_ADAPTERS.find((a) => a.matches((municipalityName ?? '').trim())) ?? null;

export interface ParcelFetchResult {
  resolved: { parcelId: string; geometry: unknown }[];
  /** Asked for but absent from the current fabric — almost always re-platted. */
  missing: string[];
}

export interface FetchProgress {
  attempt: number;
  of: number;
  /** Why the previous attempt failed, when this is a retry. */
  retryReason?: string;
}

class RetryableError extends Error {}

/**
 * One GET with a per-attempt timeout, retried on timeouts and server-side
 * failures. A caller abort is never retried. ArcGIS reports its own failures as
 * HTTP 200 with an `error` body, so those are classified too.
 */
async function queryWithRetry(
  adapter: CountyAdapter,
  url: string,
  signal: AbortSignal | undefined,
  onProgress?: (p: FetchProgress) => void,
): Promise<any> {
  const timeoutMs = adapter.timeoutMs ?? 30_000;
  const of = 1 + (adapter.retries ?? 0);
  let lastReason = '';
  for (let attempt = 1; attempt <= of; attempt++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    onProgress?.({ attempt, of, retryReason: attempt > 1 ? lastReason : undefined });

    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(url, { signal: ctl.signal });
      } catch (e) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        throw new RetryableError(timedOut
          ? `no answer after ${Math.round(timeoutMs / 1000)} s`
          : `network error (${e instanceof Error ? e.message : String(e)})`);
      }
      if (res.status >= 500) throw new RetryableError(`server returned ${res.status}`);
      if (!res.ok) throw new Error(`${adapter.label} parcel service returned ${res.status}`);
      let body: any;
      try {
        body = await res.json();
      } catch {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
        throw new RetryableError(timedOut ? `no answer after ${Math.round(timeoutMs / 1000)} s` : 'unreadable response');
      }
      if (body?.error) {
        const code = Number(body.error.code);
        const msg = body.error.message ?? 'query failed';
        if (code >= 500 || /timeout/i.test(msg)) throw new RetryableError(`server: ${msg}`);
        throw new Error(`${adapter.label} parcel service: ${msg}`);
      }
      return body;
    } catch (e) {
      if (!(e instanceof RetryableError)) throw e;
      lastReason = e.message;
      if (attempt === of) {
        throw new Error(
          `${adapter.label}'s parcel server didn't respond (${lastReason}`
          + `${of > 1 ? `, ${of} attempts` : ''}). It's often slow — try again in a minute, or draw the boundary by hand.`,
        );
      }
      await new Promise((r) => setTimeout(r, 2_000));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw new Error('unreachable');
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
  onProgress?: (p: FetchProgress) => void,
): Promise<ParcelFetchResult> {
  const wanted = parcelIds.filter(Boolean);
  if (wanted.length === 0) return { resolved: [], missing: [] };

  const params = new URLSearchParams({
    where: wanted.map((id) => adapter.whereFor(id)).join(' OR '),
    outFields: [adapter.idField, ...(adapter.extraFields ?? [])].join(','),
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });

  const body = await queryWithRetry(adapter, `${adapter.layerUrl}/query?${params}`, signal, onProgress);

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
