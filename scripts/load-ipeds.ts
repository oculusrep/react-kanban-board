/**
 * Bulk-load IPEDS higher education into ipeds_institution. Annual refresh.
 *
 *   deno run --allow-env --allow-net --allow-read scripts/load-ipeds.ts [--year 2023] [--state GA]
 *
 * Location and characteristics from the Urban Institute Education Data API's IPEDS directory,
 * enrollment from its headcount endpoint, joined on UNITID. Free, no key.
 *
 * Same pattern as the PSS private-school load and for the same reason: an API in the RUN path
 * fails silently as zero colleges, which reads as "no higher education here" rather than as an
 * outage. A table either has rows or is provably empty.
 *
 * Deliberately one count column — undergraduate + graduate headcount, the same unit as the K-12
 * enrollment — because the banded school totals add them together. FTE and the full-time/part-time
 * split are not loaded.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const API = 'https://educationdata.urban.org/api/v1/college-university/ipeds';

const arg = (name: string, fallback?: string) => {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 && Deno.args[i + 1] ? Deno.args[i + 1] : fallback;
};
const YEAR = Number(arg('year', '2023'));
const STATE_FIPS = arg('fips'); // optional: 13 = GA. Omitted loads the country.

async function pages<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`${res.status} from ${next}`);
    const body = await res.json() as { results: T[]; next: string | null };
    out.push(...(body.results ?? []));
    next = body.next;
  }
  return out;
}

type Dir = {
  unitid: number; inst_name: string; address: string | null; city: string | null;
  state_abbr: string | null; zip: string | null; latitude: number | null; longitude: number | null;
  inst_control: number | null; institution_level: number | null; degree_granting: number | null;
  inst_system_name: string | null;
};
type Head = { unitid: number; headcount: number | null };
type Chars = { unitid: number; oncampus_housing: number | null; dormitory_capacity: number | null };

const q = (path: string) => `${API}/${path}${path.includes('?') ? '&' : '?'}${STATE_FIPS ? `fips=${STATE_FIPS}&` : ''}per_page=10000`;

console.log(`IPEDS ${YEAR}${STATE_FIPS ? ` (fips ${STATE_FIPS})` : ' (national)'}`);
const dir = await pages<Dir>(q(`directory/${YEAR}/`));
console.log(`  directory: ${dir.length}`);

// sex=99 ftpt=99 race=99 is the all-students total row.
const ug = await pages<Head>(q(`enrollment-headcount/${YEAR}/undergraduate/?sex=99&ftpt=99&race=99`));
const gr = await pages<Head>(q(`enrollment-headcount/${YEAR}/graduate/?sex=99&ftpt=99&race=99`));
console.log(`  headcount rows: ${ug.length} undergrad, ${gr.length} graduate`);

const chars = await pages<Chars>(q(`institutional-characteristics/${YEAR}/`));
console.log(`  characteristics: ${chars.length}`);

const ugBy = new Map(ug.map((r) => [r.unitid, r.headcount]));
const grBy = new Map(gr.map((r) => [r.unitid, r.headcount]));
const chBy = new Map(chars.map((r) => [r.unitid, r]));

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// IPEDS uses -1/-2/-3 for "not applicable" and "not reported"; they are not zero.
const cnt = (v: number | null | undefined) => (typeof v === 'number' && v >= 0 ? v : null);
const flag = (v: number | null | undefined) => (v === 1 ? true : v === 2 ? false : null);

const rows = dir.map((d) => {
  const u = cnt(ugBy.get(d.unitid)), g = cnt(grBy.get(d.unitid));
  const c = chBy.get(d.unitid);
  return {
    unitid: d.unitid,
    name: (d.inst_name ?? '').trim(),
    street: d.address, city: d.city, state: d.state_abbr, zip: d.zip,
    latitude: n(d.latitude), longitude: n(d.longitude),
    control: d.inst_control ?? null,
    institution_level: d.institution_level ?? null,
    degree_granting: d.degree_granting === 1,
    // '-2' is the API's "not applicable" for a standalone institution.
    system_name: d.inst_system_name && !String(d.inst_system_name).startsWith('-') ? d.inst_system_name : null,
    headcount_undergrad: u,
    headcount_graduate: g,
    headcount_total: u === null && g === null ? null : (u ?? 0) + (g ?? 0),
    enrollment_year: YEAR,
    oncampus_housing: flag(c?.oncampus_housing),
    dormitory_capacity: cnt(c?.dormitory_capacity),
    directory_year: YEAR,
    loaded_at: new Date().toISOString(),
  };
}).filter((r) => r.name);

const withGeo = rows.filter((r) => r.latitude !== null && r.longitude !== null).length;
const withEnrol = rows.filter((r) => r.headcount_total !== null).length;
console.log(`  prepared ${rows.length} rows: ${withGeo} geocoded, ${withEnrol} with enrollment`);

const svc = createClient(Deno.env.get('VITE_SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!);
const CHUNK = 500;
for (let i = 0; i < rows.length; i += CHUNK) {
  // The connection drops occasionally mid-load (BadRecordMac at chunk 5000 on the first run).
  // The upsert is idempotent on unitid, so retrying a chunk is free.
  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error } = await svc.from('ipeds_institution').upsert(rows.slice(i, i + CHUNK), { onConflict: 'unitid' });
    if (!error) { lastErr = ''; break; }
    lastErr = error.message;
    console.log(`  retry ${attempt} at ${i}: ${error.message.slice(0, 80)}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  if (lastErr) throw new Error(`upsert at ${i} after 4 attempts: ${lastErr}`);
  console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
}
console.log('done.');
