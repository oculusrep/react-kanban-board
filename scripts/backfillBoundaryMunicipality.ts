/**
 * Boundary dataset backfill — counties + incorporated places from US Census TIGER/Line.
 *
 * v1 scope: GA only. Run for other states by passing --state <ABBR>; the script is
 * idempotent (ON CONFLICT (kind, state, geoid) DO UPDATE in the SQL helper).
 *
 * Source: TIGERweb ArcGIS REST.
 *   Counties:            /State_County/MapServer/1
 *   Incorporated Places: /Places_CouSub_ConCity_SubMCD/MapServer/4   (CDPs are layer 5, excluded)
 *
 * Usage:
 *   bun scripts/backfillBoundaryMunicipality.ts                  # GA (default), counties + places
 *   bun scripts/backfillBoundaryMunicipality.ts --state GA       # explicit
 *   bun scripts/backfillBoundaryMunicipality.ts --kind cities    # places only
 *   bun scripts/backfillBoundaryMunicipality.ts --kind counties  # counties only
 *   bun scripts/backfillBoundaryMunicipality.ts --dry-run        # fetch + transform, skip DB write
 *   bun scripts/backfillBoundaryMunicipality.ts --chunk 25       # smaller upsert chunks if payloads time out
 *
 * Acceptance (GA): ~159 counties + ~538 incorporated places upserted into boundary_municipality.
 */

import { createClient } from '@supabase/supabase-js';

const TIGER_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const COUNTIES_URL = `${TIGER_BASE}/State_County/MapServer/1/query`;
const PLACES_URL   = `${TIGER_BASE}/Places_CouSub_ConCity_SubMCD/MapServer/4/query`;
const SOURCE_YEAR  = 2025; // layer 4 / layer 1 are the "current" vintage on TIGERweb

const STATE_FIPS: Record<string, string> = {
  GA: '13',
  // extend as needed when expanding past v1
  FL: '12', AL: '01', SC: '45', TN: '47', NC: '37',
};

type RawFeature = {
  type: 'Feature';
  properties: Record<string, string | null>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
};

interface BoundaryRow {
  kind: 'county' | 'city';
  state: string;
  fips_state: string;
  geoid: string;
  name: string;
  raw_name: string;
  lsadc: string | null;
  source_year: number;
  geometry: { type: string; coordinates: unknown };
}

// ---------- arg parsing ----------
const args = process.argv.slice(2);
const argVal = (key: string, fallback?: string) => {
  const i = args.indexOf(`--${key}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const dryRun     = args.includes('--dry-run');
const state      = (argVal('state', 'GA') || 'GA').toUpperCase();
const kindFilter = argVal('kind');
const chunkSize  = parseInt(argVal('chunk', '50')!, 10);

const fipsState = STATE_FIPS[state];
if (!fipsState) {
  console.error(`Unknown state '${state}'. Add to STATE_FIPS map and rerun.`);
  process.exit(1);
}

// ---------- Supabase client (skipped in dry-run) ----------
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!supabaseUrl || !supabaseKey)) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const supabase = dryRun
  ? null
  : createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });

// ---------- TIGER fetch ----------
async function fetchTiger(endpoint: string, where: string): Promise<RawFeature[]> {
  // TIGER ArcGIS pages at 1000 rows by default; paginate via resultOffset.
  const features: RawFeature[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      where,
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
    });
    const url = `${endpoint}?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`TIGER request failed (${resp.status}): ${url}`);
    const data = await resp.json();
    if (data.error) throw new Error(`TIGER error: ${JSON.stringify(data.error)}`);
    const page = (data.features || []) as RawFeature[];
    features.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return features;
}

// ---------- name normalization ----------
function normalizeCountyName(rawName: string): string {
  // TIGER county NAME has no suffix ("Barrow"). Append " County" so display reads naturally.
  return rawName.toLowerCase().endsWith('county') ? rawName : `${rawName} County`;
}
function normalizePlaceName(rawName: string, basename: string | null): string {
  // BASENAME is the clean form ("Winder"). Fall back to stripping the suffix off NAME.
  if (basename) return basename;
  return rawName.replace(/\s+(city|town|borough|village|CDP)$/i, '');
}

// ---------- transforms ----------
async function fetchCounties(): Promise<BoundaryRow[]> {
  console.log(`Fetching ${state} counties (FIPS=${fipsState})…`);
  const features = await fetchTiger(COUNTIES_URL, `STATE='${fipsState}'`);
  console.log(`  ${features.length} counties returned`);
  return features.map(f => ({
    kind: 'county',
    state,
    fips_state: fipsState,
    geoid: String(f.properties.GEOID),
    name: normalizeCountyName(String(f.properties.NAME)),
    raw_name: String(f.properties.NAME),
    lsadc: null,
    source_year: SOURCE_YEAR,
    geometry: f.geometry,
  }));
}

async function fetchPlaces(): Promise<BoundaryRow[]> {
  console.log(`Fetching ${state} incorporated places (FIPS=${fipsState})…`);
  const features = await fetchTiger(PLACES_URL, `STATE='${fipsState}'`);
  console.log(`  ${features.length} places returned`);
  return features.map(f => ({
    kind: 'city',
    state,
    fips_state: fipsState,
    geoid: String(f.properties.GEOID),
    name: normalizePlaceName(String(f.properties.NAME), f.properties.BASENAME as string | null),
    raw_name: String(f.properties.NAME),
    lsadc: (f.properties.LSADC as string | null) ?? null,
    source_year: SOURCE_YEAR,
    geometry: f.geometry,
  }));
}

// ---------- upsert ----------
async function upsert(rows: BoundaryRow[]) {
  if (dryRun) {
    console.log(`[dry-run] would upsert ${rows.length} rows; sample:`);
    if (rows[0]) {
      const { geometry, ...rest } = rows[0];
      console.log('  ', { ...rest, geometry: { type: geometry.type, coordsTruncated: true } });
    }
    return;
  }
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase!.rpc('upsert_boundary_municipalities', { rows: chunk });
    if (error) {
      console.error(`Chunk starting at row ${i} failed:`, error);
      throw error;
    }
    total += chunk.length;
    console.log(`  upserted ${total}/${rows.length}`);
  }
}

// ---------- main ----------
async function main() {
  const want = !kindFilter
    ? (['county', 'city'] as const)
    : kindFilter === 'cities'
      ? (['city'] as const)
      : kindFilter === 'counties'
        ? (['county'] as const)
        : null;
  if (!want) {
    console.error(`Unknown --kind '${kindFilter}'. Use 'cities' or 'counties'.`);
    process.exit(1);
  }
  const all: BoundaryRow[] = [];
  if (want.includes('county')) all.push(...await fetchCounties());
  if (want.includes('city'))   all.push(...await fetchPlaces());
  console.log(`Total rows to upsert: ${all.length} (chunk=${chunkSize})`);
  await upsert(all);
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
