/**
 * County parcel adapters + the parcel-polygon fetch. SHARED: imported by the
 * browser (src/services/parcelFabric.ts re-exports everything here) and by edge
 * functions (the post-run parcel fetch). Keep it free of Deno and DOM-only
 * APIs and of any Supabase client: pure data + fetch.
 *
 * Moved here from src/services/parcelFabric.ts on 2026-11-14 so the server-side
 * post-run fetch uses exactly the button's adapters and rules.
 */

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
  /**
   * The county's parcel-number shape, tested on the id with separators
   * collapsed to single spaces. Used to accept parcel ids found by web search
   * (locate step): anything else — land lots, districts, another county's
   * format — is not written. Shapes from ids that resolved in this fabric.
   */
  idPattern: RegExp;
  /**
   * Set for a LOW-TRUST source (e.g. '2022 third-party snapshot'). Every boundary
   * it draws carries this label (geometry_source_vintage, the record's notes, a
   * tag on the record card).
   */
  sourceVintage?: string;
  /** Max |fetched - stated| / stated acreage, in %. Past it the boundary is NOT
   *  saved ("snapshot mismatch"). Unset = the normal flag-only tolerance. */
  maxAcreageVariancePct?: number;
  /** Acreage validation is mandatory: no stated acres = nothing saved. */
  requireStatedAcres?: boolean;
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
    // "220-017", "C14-043", "178-899", "102-010-001"
    idPattern: /^[A-Z]?\d{1,3}[A-Z]? \d{3}( \d{1,3})?$/i,
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
    // "101-01001000", "079-01015005", "H04A01001000" (3–4 + 8)
    idPattern: /^[A-Z0-9]{3,4} ?\d{8}$/i,
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
    // "10081 000099", "15043D000069", optional 1–2 letter suffix
    idPattern: /^\d{5}[A-Z]? ?\d{6}[A-Z]{0,2}$/i,
    retries: 1,
  },
  {
    // Coweta County, Esri-hosted and refreshed weekly ("WeeklyUpdate" in the
    // name), so the fabric moves after a fetch — another reason to fetch once.
    // ParcelNumber is padded with internal whitespace: '162  1259 001' (double
    // space), '075A      012'. Sources write '162-1259-001' or '163 1261 002'.
    // likeFromRuns splits on any separator run, so the padding never reaches the
    // where clause, and the normalized compare is exact (65,417 distinct ids, zero
    // collisions after stripping punctuation — profiled 2026-11-13).
    // Haralson straddles Coweta and Meriwether; a Meriwether parcel just comes back
    // "missing". Palmetto and Chattahoochee Hills are mostly Fulton — not matched.
    matches: (n) =>
      /^(coweta county|newnan|senoia|haralson|grantville|moreland|turin|sharpsburg)$/i.test(n),
    label: 'Coweta County',
    layerUrl: 'https://services1.arcgis.com/AaPyNbrJpNGryRqh/ArcGIS/rest/services/WeeklyUpdate_WinGapParcels/FeatureServer/0',
    idField: 'ParcelNumber',
    whereFor: (id) => likeFromRuns('ParcelNumber', id),
    // "162-1259-001", "163 1261 002", "163 1262 003D", "075A 012"
    idPattern: /^\d{3}[A-Z]?( \d{4})? \d{3}[A-Z]?$/i,
    retries: 1,
  },
  {
    // Houston County publishes no queryable parcel layer of its own (its AGOL org
    // "hcga" carries only a service-line inventory; the assessor links qPublic).
    // This is the City of Warner Robins Planning & Engineering layer, Esri-hosted,
    // covering ALL of Houston (71,012 parcels) and Peach (14,608), last edited
    // 2026-11-02. Anonymous, CORS `*`; pages answer in 0.4–1.6 s (profiled
    // 2026-11-17), so the default timeout and one retry.
    // Parcel_No is stored single-spaced, 6 + 6 ("0W1330 039000"); qPublic pads it
    // ("0W1330    039000"), which likeFromRuns ignores. Normalizing is lossless
    // within Houston (70,773 distinct -> 70,773). Map prefix: 0W Warner Robins,
    // 0P Perry, 0C Centerville, 00 unincorporated, so an id renumbered on
    // annexation (001040 129000 -> 0W1330 089000) comes back "missing".
    // Warner Robins (7.8%) and Perry (6.5%) straddle Peach County: a Peach-side
    // parcel uses Peach's format, which the parser doesn't read. Byron and Fort
    // Valley are Peach: not matched.
    matches: (n) => /^(houston county|warner robins|perry|centerville)$/i.test(n),
    label: 'Houston County',
    layerUrl: 'https://services6.arcgis.com/wtKwyZlCD3bY8Zh4/arcgis/rest/services/Base_Map_Polygon/FeatureServer/0',
    idField: 'Parcel_No',
    whereFor: (id) => likeFromRuns('Parcel_No', id),
    // "0W1330 039000", "00122A 105000", "0W68A0 05B000", "000340 001CEL"
    idPattern: /^0[0-9WPC][0-9A-Z]{4} \d{2}[0-9A-Z](\d{3}|CEL)$/i,
    retries: 1,
  },
  {
    // Douglas County's own ArcGIS Server — not in the ArcGIS Online index.
    // Anonymous, no token; CORS reflects the caller's origin. 55,100 parcels;
    // pages of 2,000 answer in 0.4–0.6 s and single ids in ~0.5 s (profiled
    // 2026-11-23), so the default timeout and one retry. The service publishes
    // no edit date. ParcelNo is land lot + district + section + parcel with no
    // separators: '06461820001', '0016015A013', '04811820005B'. Sources write it
    // dashed ('0978-182-0001'); likeFromRuns + the normalized compare handle
    // both (54,992 distinct -> 54,992 normalized). Austell (3% Douglas, mostly
    // Cobb) and Villa Rica (32% Douglas, mostly Carroll) straddle: not matched.
    // 'Douglas' is a Coffee County city, not this one.
    matches: (n) => /^(douglas county|douglasville)$/i.test(n),
    label: 'Douglas County',
    layerUrl: 'https://maps.douglascountyga.gov/arcgis/rest/services/CountyLayers/Parcels/MapServer/15',
    idField: 'ParcelNo',
    whereFor: (id) => likeFromRuns('ParcelNo', id),
    // "06461820001", "0978 182 0001", "0016015A013", "04811820005B";
    // district+section is always 01-5, 01-3, 02-5, 03-5 or 18-2
    idPattern: /^\d{4} ?(01 ?[35]|02 ?5|03 ?5|18 ?2) ?[0-9A-Z]\d{3}[A-Z]?$/i,
    extraFields: ['totalacres'],
    retries: 1,
  },
  {
    // FALLBACK, low trust. Newton County's own layer (gis.ncboc.com/.../Public/
    // Newton_Parcels) is token-gated (499), so this is a third-party AGOL
    // snapshot: owner mhackman_UofMD, last edited 2022-02-26, 45,755 parcels,
    // CORS open. DXF_TEXT holds the short id our sources write ("27-127";
    // Covington city parcels look like "CO1-1-1"); PARCEL_NO is the padded form
    // ("00270-00000-127-000"). A post-2022 re-plat comes back missing or as the
    // old tract, so acreage validation is mandatory and >15% off is not saved.
    // Social Circle straddles Newton and Walton: not matched.
    matches: (n) => /^(newton county|covington|oxford|porterdale|mansfield|newborn)$/i.test(n),
    label: 'Newton County',
    layerUrl: 'https://services1.arcgis.com/qTQ6qYkHpxlu0G82/arcgis/rest/services/Newton_Parcels/FeatureServer/0',
    idField: 'DXF_TEXT',
    whereFor: (id) => likeFromRuns('DXF_TEXT', id),
    // DXF_TEXT short form: "27-127", "82-4A", "CO1-1-1"
    idPattern: /^([A-Z]{1,2}\d{1,2}|\d{1,3}[A-Z]?)( \d{1,4}[A-Z]?){1,2}$/i,
    extraFields: ['TotalAcres'],
    retries: 1,
    sourceVintage: '2022 third-party snapshot',
    maxAcreageVariancePct: 15,
    requireStatedAcres: true,
  },
];

/** Does a parcel id have this county's shape? Separators collapse to one space. */
export function idMatchesAdapter(adapter: CountyAdapter, id: string): boolean {
  const s = id.trim().replace(/[\s\-_.\/]+/g, ' ');
  return adapter.idPattern.test(s);
}

export const adapterFor = (municipalityName: string | null | undefined): CountyAdapter | null =>
  COUNTY_ADAPTERS.find((a) => a.matches((municipalityName ?? '').trim())) ?? null;

/**
 * Counties checked and found to have NO public parcel service (login-gated,
 * raster tiles only, or nothing published). Listing one stops the research
 * run/sweep view from flagging it as "no parcel adapter". Add an entry only
 * after actually checking, with the date and what was found; the cc prompt in
 * docs/PARCEL_ADAPTER_CC_PROMPT.md ends by adding one when that's the answer.
 */
export interface CountyWithoutParcelService {
  /** Matched against the county name, e.g. /^butts county$/i. */
  matches: (countyName: string) => boolean;
  label: string;
  checkedOn: string; // YYYY-MM-DD
  reason: string;
}
export const COUNTIES_WITHOUT_PARCEL_SERVICE: CountyWithoutParcelService[] = [];

/** 'adapter' = fetchable; 'none' = checked, no public service; 'missing' = not yet checked. */
export const countyParcelStatus = (countyName: string | null | undefined): 'adapter' | 'none' | 'missing' => {
  const n = (countyName ?? '').trim();
  if (adapterFor(n)) return 'adapter';
  if (COUNTIES_WITHOUT_PARCEL_SERVICE.some((c) => c.matches(n))) return 'none';
  return 'missing';
};

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

