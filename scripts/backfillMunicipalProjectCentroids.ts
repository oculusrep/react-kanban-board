/**
 * Backfill municipal_project.centroid + geocoded_address for rows that
 * don't have a centroid yet — necessary for the Municipal Projects map
 * layer to render a pin. Mirrors how the importer (see
 * MUNICIPAL_PROJECT_IMPORTER_SPEC.md) geocodes addresses pre-insert.
 *
 * Usage:
 *   bun scripts/backfillMunicipalProjectCentroids.ts
 *   bun scripts/backfillMunicipalProjectCentroids.ts --run-id <uuid>   # only rows from one research_run
 *   bun scripts/backfillMunicipalProjectCentroids.ts --limit 25        # cap how many to do
 *   bun scripts/backfillMunicipalProjectCentroids.ts --dry-run         # fetch + geocode, no DB write
 *
 * Uses VITE_GOOGLE_GEOCODING_API_KEY (falls back to VITE_GOOGLE_MAPS_API_KEY)
 * and SUPABASE_SERVICE_ROLE_KEY from .env.
 */

import { createClient } from '@supabase/supabase-js';

const GOOGLE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';
const RATE_LIMIT_MS = 100; // 10 req/sec — well under Google's quota

const args = process.argv.slice(2);
const argVal = (key: string): string | undefined => {
  const i = args.indexOf(`--${key}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes('--dry-run');
const onlyRunId = argVal('run-id');
const limit = parseInt(argVal('limit') ?? '100', 10);

const apiKey = process.env.VITE_GOOGLE_GEOCODING_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
const supaUrl = process.env.VITE_SUPABASE_URL;
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!apiKey) { console.error('Missing VITE_GOOGLE_GEOCODING_API_KEY (or VITE_GOOGLE_MAPS_API_KEY)'); process.exit(1); }
if (!supaUrl || !supaKey) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

async function geocode(address: string): Promise<{ lat: number; lng: number; formatted: string } | null> {
  const url = `${GOOGLE_BASE}?` + new URLSearchParams({ address, key: apiKey!, region: 'us' });
  const resp = await fetch(url);
  if (!resp.ok) { console.error(`  geocode http ${resp.status} for ${address}`); return null; }
  const data = await resp.json();
  if (data.status !== 'OK' || !data.results?.length) {
    console.error(`  geocode ${data.status} for ${address}`); return null;
  }
  const r = data.results[0];
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address };
}

async function main() {
  let query = supabase
    .from('municipal_project')
    .select('id, project_name, address, source_research_run_id')
    .is('centroid', null)
    .not('address', 'is', null)
    .limit(limit);
  if (onlyRunId) query = query.eq('source_research_run_id', onlyRunId);

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) { console.log('No rows need backfill.'); return; }

  console.log(`Backfilling ${rows.length} rows${dryRun ? ' (dry-run)' : ''}…`);
  let success = 0, failed = 0;

  for (const row of rows) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    console.log(`  ${row.project_name} @ ${row.address}`);
    const g = await geocode(row.address!);
    if (!g) { failed++; continue; }
    console.log(`    → ${g.lat}, ${g.lng} (${g.formatted})`);
    if (dryRun) { success++; continue; }

    // PostGIS Point as WKT — supabase-js can pass this as a string into a
    // geometry column; PostgreSQL casts it via ST_GeomFromText behind the scenes.
    const wkt = `SRID=4326;POINT(${g.lng} ${g.lat})`;
    const { error: updErr } = await supabase
      .from('municipal_project')
      .update({ centroid: wkt, geocoded_address: g.formatted })
      .eq('id', row.id);
    if (updErr) { console.error(`    UPDATE failed:`, updErr.message); failed++; continue; }
    success++;
  }

  console.log(`Done. success=${success}, failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
