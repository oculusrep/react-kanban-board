/**
 * Site research Step 2 (deep pass): the pure parts and the NCES/Census lookups.
 * Orchestration lives in deep-pass-worker.ts; the plan in docs/SITE_RESEARCH_STEP2_DEEP_PASS_PLAN.md.
 *
 * Rules this module enforces in code, so the model cannot drift from them:
 *  - School rows and banded totals come from Step 1's PERSISTED query_nearby_schools results.
 *    query_nearby_schools is never re-run, and a band's total is exactly the tool's.
 *  - A row's band is the smallest Step 1 call (1, 3, 5 mi) that returned it: the same membership
 *    the totals were computed from, not a re-derivation from a rounded distance.
 *  - Web search is spent only on null enrollment, or an address NCES cannot confirm as physical
 *    (a mailing-flagged private address EDGE has no physical street for, or a PO box).
 *  - WEB values fill blanks only, carry their own source, and never touch an NCES total.
 *  - Employer distance comes from the Census geocoder and only on an exact match; otherwise blank.
 */

import {
  buildEmployerRow, buildSchoolRow, byDistance, csvBytes, EMPLOYERS_COLUMNS, type EmployersRow,
  SCHOOLS_COLUMNS, type SchoolFill, type SchoolsRow, toCsv,
} from '../csv.ts';
import { ringFor, round1 } from './geo.ts';
import { censusGeocode, distanceIfExact, type GeocodeMatch } from './geocode.ts';
import { arcgisQuery, TOOL_DEFINITIONS } from './tools.ts';
import { NCES_ARCGIS } from './nces-config.ts';
import type { EsriDataQuality } from './snapshot.ts';

export const DEEP_PASS_USER_MESSAGE =
  'Run the deep pass: fill the school data gaps, go deep on the story carriers, and write the executive summary.';
export const SCHOOL_FILL_PROMPT_KEY = 'deep_pass_school_fill';
export const DEEP_PASS_PROMPT_KEY = 'deep_pass';
export const FILL_SEARCH_BUDGET = 15;
export const DEEP_PASS_SEARCH_BUDGET = 20;
export const BANDS = [1, 3, 5] as const;
export type Band = (typeof BANDS)[number];

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const RECORD_SCHOOL_FILL_TOOL = {
  name: 'record_school_fill',
  description:
    'Record a value a source states for a school on your list. Pass only the field(s) that school is missing ' +
    'and that the source states. enrollment: a single stated whole number. street: the physical campus street ' +
    'address beginning with its street number, never a PO box; include city, state and zip as the source gives ' +
    'them. The result says what was accepted and what was rejected and why.',
  input_schema: {
    type: 'object',
    properties: {
      school_id: { type: 'string', description: 'The school_id exactly as given in your list.' },
      enrollment: { type: 'integer', minimum: 0 },
      street: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      source_url: { type: 'string', description: 'URL of the page that states the value.' },
      notes: { type: 'string', description: 'The year or school year the source refers to, and anything else worth keeping.' },
    },
    required: ['school_id', 'source_url'],
  },
};

export const RECORD_EMPLOYER_TOOL = {
  name: 'record_employer',
  description:
    'Record one site-level employer near the site, as soon as a source states it. The street, city, state ' +
    'and zip only as the source states them (a street must begin with its street number; leave it out ' +
    'otherwise). headcount only when the source states a specific number for THIS site. The address is ' +
    'geocoded here: the result carries distance_miles and ring when the address matches exactly, and ' +
    'distance_miles null when it could not be located (then say the distance could not be determined).',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      street: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      headcount: { type: 'integer', minimum: 0 },
      source: { type: 'string', description: 'URL of the source, or the named source.' },
      source_year: { type: 'string', description: 'The year the figure refers to.' },
      notes: { type: 'string' },
    },
    required: ['name', 'source'],
  },
};

const DEEP_PASS_OVIS_TOOLS = ['query_nearby_starbucks', 'query_municipal_projects', 'query_traffic_counts', 'geocode_address'];

export const SCHOOL_FILL_CLIENT_TOOLS: Array<Record<string, unknown>> = [RECORD_SCHOOL_FILL_TOOL];
export const DEEP_PASS_CLIENT_TOOLS: Array<Record<string, unknown>> = [
  ...(TOOL_DEFINITIONS as unknown as Array<Record<string, unknown>>).filter((t) => DEEP_PASS_OVIS_TOOLS.includes(String(t.name))),
  RECORD_EMPLOYER_TOOL,
];

// ---------------------------------------------------------------------------
// Step 1 extraction
// ---------------------------------------------------------------------------

export interface SchoolRecord {
  school_id: string; // public:<NCESSCH> | private:<PPIN>
  public_private: 'public' | 'private';
  name: string | null;
  street: string | null; // null when the address still needs a physical street
  city: string | null;
  state: string | null;
  zip: string | null;
  enrollment: number | null;
  school_level: string | null;
  grade_low: string | null;
  grade_high: string | null;
  distance_miles: number | null; // as Step 1 reported it (one decimal)
  band: Band | null;
  school_year: string | null;
  status: string | null; // public only; 'Future' = planned
  address_is_mailing: boolean;
  notes: string[];
}

export type BandTotals = Record<string, { public: unknown; private: unknown } | null>;

export interface Step1Schools {
  bands: BandTotals; // "1" | "3" | "5" -> the tool's totals for that call, or null when no call was made
  schools: SchoolRecord[];
  warnings: string[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function splitGrades(row: Record<string, unknown>): [string | null, string | null] {
  const lo = str(row.grade_low), hi = str(row.grade_high);
  if (lo || hi) return [lo, hi];
  const g = str(row.grades); // results persisted before grade_low/grade_high existed
  if (!g) return [null, null];
  const parts = g.split('-');
  return parts.length === 2 ? [parts[0], parts[1]] : [g, g];
}

/**
 * Pull the banded totals and the school rows out of Step 1's persisted query_nearby_schools
 * results (committed, non-error, in call order). A later call at the same radius wins.
 */
export function extractStep1Schools(results: Array<{ output: unknown }>): Step1Schools {
  const byBand = new Map<Band, Record<string, unknown>>();
  for (const r of results) {
    const out = r.output as Record<string, unknown> | null;
    const radius = Number(out?.radius_miles);
    if ((BANDS as readonly number[]).includes(radius)) byBand.set(radius as Band, out!);
  }

  const warnings: string[] = [];
  const bands: BandTotals = {};
  for (const b of BANDS) {
    const out = byBand.get(b);
    bands[String(b)] = out ? (out.totals as { public: unknown; private: unknown }) : null;
    if (!out) warnings.push(`The first pass made no query_nearby_schools call at ${b} mi, so there is no ${b} mi band.`);
    if (out?.public_truncated) warnings.push(`NCES public school list at ${b} mi was truncated.`);
    if (out?.private_truncated) warnings.push(`Private school list at ${b} mi was truncated.`);
  }

  const schools = new Map<string, SchoolRecord>();
  for (const b of BANDS) { // ascending, so the first band a school appears in is its band
    const out = byBand.get(b);
    if (!out) continue;
    for (const row of (out.public_schools ?? []) as Array<Record<string, unknown>>) {
      const id = `public:${row.nces_id}`;
      if (schools.has(id)) continue;
      const [lo, hi] = splitGrades(row);
      schools.set(id, {
        school_id: id, public_private: 'public', name: str(row.name),
        street: str(row.address), city: str(row.city), state: str(row.state), zip: str(row.zip),
        enrollment: numOrNull(row.enrollment_incl_prek), school_level: str(row.level),
        grade_low: lo, grade_high: hi, distance_miles: numOrNull(row.distance_miles), band: b,
        school_year: str(row.vintage), status: str(row.status), address_is_mailing: false, notes: [],
      });
    }
    for (const row of (out.private_schools ?? []) as Array<Record<string, unknown>>) {
      const id = `private:${row.pss_id}`;
      if (schools.has(id)) continue;
      const [lo, hi] = splitGrades(row);
      schools.set(id, {
        school_id: id, public_private: 'private', name: str(row.name),
        street: str(row.address), city: str(row.city), state: str(row.state), zip: str(row.zip),
        enrollment: numOrNull(row.enrollment_k12_ungraded), school_level: str(row.level),
        grade_low: lo, grade_high: hi, distance_miles: numOrNull(row.distance_miles), band: b,
        school_year: str(row.vintage), status: null, address_is_mailing: row.address_is_mailing === true, notes: [],
      });
    }
  }
  return { bands, schools: [...schools.values()], warnings };
}

// ---------------------------------------------------------------------------
// NCES EDGE physical-location check (D4) and the fill list
// ---------------------------------------------------------------------------

export interface EdgeLocation { ppin: string; street: string | null; city: string | null; state: string | null; zip: string | null }

const PO_BOX = /\bP\.?\s*O\.?\s*BOX\b|\bPOST\s+OFFICE\s+BOX\b|\bPO\s*DRAWER\b/i;
export const isPoBox = (s: string | null | undefined) => !!s && PO_BOX.test(s);

/** Physical street for each PPIN from NCES EDGE. Throws on a service error (the caller decides). */
export async function edgePrivateLocations(ppins: string[]): Promise<Map<string, EdgeLocation>> {
  const out = new Map<string, EdgeLocation>();
  for (let i = 0; i < ppins.length; i += NCES_ARCGIS.characteristicsBatchSize) {
    const batch = ppins.slice(i, i + NCES_ARCGIS.characteristicsBatchSize);
    const res = await arcgisQuery(NCES_ARCGIS.privateLocations, {
      where: `PPIN IN (${batch.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')})`,
      outFields: 'PPIN,STREET,CITY,STATE,ZIP',
    });
    for (const f of res.features) {
      const a = f.attributes;
      out.set(String(a.PPIN), { ppin: String(a.PPIN), street: str(a.STREET), city: str(a.CITY), state: str(a.STATE), zip: str(a.ZIP) });
    }
  }
  return out;
}

export type FillField = 'enrollment' | 'street';

export interface FillItem {
  school_id: string;
  name: string | null;
  public_private: 'public' | 'private';
  city: string | null;
  state: string | null;
  distance_miles: number | null;
  band: Band | null;
  school_level: string | null;
  grades: string | null;
  missing: FillField[];
  address_on_record: string | null; // the NCES address text that could not be confirmed, if any
}

/**
 * Apply the EDGE check and decide which schools need a web search.
 * `edge` null means the EDGE lookup failed: mailing-flagged addresses are then unconfirmed.
 */
export function buildFillList(
  input: SchoolRecord[],
  edge: Map<string, EdgeLocation> | null,
): { schools: SchoolRecord[]; fillList: FillItem[] } {
  const schools = input.map((s) => ({ ...s, notes: [...s.notes] }));
  const fillList: FillItem[] = [];

  for (const s of schools) {
    const missing: FillField[] = [];
    let addressOnRecord: string | null = null;
    const recorded = [s.street, s.city, [s.state, s.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;

    if (s.public_private === 'private' && s.address_is_mailing) {
      const e = edge?.get(s.school_id.slice('private:'.length));
      if (e?.street && !isPoBox(e.street)) {
        s.street = e.street; s.city = e.city ?? s.city; s.state = e.state ?? s.state; s.zip = e.zip ?? s.zip;
        s.notes.push('address confirmed as physical by NCES EDGE');
      } else {
        addressOnRecord = recorded;
        s.street = null;
        s.notes.push(`NCES mailing address, physical location not confirmed${recorded ? `: ${recorded}` : ''}`);
        missing.push('street');
      }
    } else if (!s.street || isPoBox(s.street)) {
      if (s.street) {
        addressOnRecord = recorded;
        s.notes.push(`NCES address is a PO box: ${recorded}`);
      }
      s.street = null;
      missing.push('street');
    }

    if (s.status === 'Future') {
      s.notes.push('planned (NCES status Future), not yet open');
    } else if (s.enrollment === null) {
      missing.push('enrollment');
    }

    if (missing.length) {
      fillList.push({
        school_id: s.school_id, name: s.name, public_private: s.public_private, city: s.city, state: s.state,
        distance_miles: s.distance_miles, band: s.band, school_level: s.school_level,
        grades: s.grade_low && s.grade_high ? (s.grade_low === s.grade_high ? s.grade_low : `${s.grade_low}-${s.grade_high}`) : null,
        missing, address_on_record: addressOnRecord,
      });
    }
  }

  fillList.sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity));
  return { schools, fillList };
}

export function schoolFillOpening(fillList: FillItem[]): string {
  const lines = fillList.map((f, i) => {
    const where = [f.city, f.state].filter(Boolean).join(', ');
    const what = f.missing.map((m) => (m === 'street' ? 'physical street address' : 'enrollment')).join(' and ');
    return `${i + 1}. school_id ${f.school_id} | ${f.name ?? '(no name)'} | ${f.public_private}` +
      `${f.school_level ? `, ${f.school_level}` : ''}${f.grades ? `, grades ${f.grades}` : ''}` +
      `${where ? ` | ${where}` : ''} | ${f.distance_miles ?? '?'} mi straight-line | missing: ${what}` +
      `${f.address_on_record ? ` | address on record (not confirmed physical): ${f.address_on_record}` : ''}`;
  });
  return `Schools to fill, closest first (${fillList.length}):\n\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// record_school_fill
// ---------------------------------------------------------------------------

export interface AcceptedFill {
  school_id: string;
  enrollment?: number;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  source_url: string;
  notes?: string;
}

const STREET_WITH_NUMBER = /^\d+[A-Za-z]?(-\d+)?\s+\S/;
const clip = (s: string, n: number) => s.trim().slice(0, n);

export function validateSchoolFill(
  input: Record<string, unknown>,
  fillList: FillItem[],
): { accepted: AcceptedFill | null; rejected: Array<{ field: string; reason: string }> } {
  const rejected: Array<{ field: string; reason: string }> = [];
  const item = fillList.find((f) => f.school_id === input.school_id);
  if (!item) return { accepted: null, rejected: [{ field: 'school_id', reason: 'not on your list' }] };
  const url = str(input.source_url);
  if (!url || !/^https?:\/\/\S+$/i.test(url)) {
    return { accepted: null, rejected: [{ field: 'source_url', reason: 'a source URL (http or https) is required' }] };
  }

  const accepted: AcceptedFill = { school_id: item.school_id, source_url: clip(url, 2000) };
  let any = false;

  if (input.enrollment !== undefined && input.enrollment !== null) {
    if (!item.missing.includes('enrollment')) rejected.push({ field: 'enrollment', reason: 'NCES already reports enrollment for this school' });
    else if (typeof input.enrollment !== 'number' || !Number.isInteger(input.enrollment) || input.enrollment < 0) {
      rejected.push({ field: 'enrollment', reason: 'must be a single stated whole number' });
    } else { accepted.enrollment = input.enrollment; any = true; }
  }

  const addressGiven = ['street', 'city', 'state', 'zip'].some((k) => str(input[k]) !== null);
  if (addressGiven) {
    const street = str(input.street);
    if (!item.missing.includes('street')) rejected.push({ field: 'street', reason: 'NCES already confirms a physical address for this school' });
    else if (!street) rejected.push({ field: 'street', reason: 'city, state or zip alone is not an address; record them with the street' });
    else if (isPoBox(street)) rejected.push({ field: 'street', reason: 'a PO box is not a physical address' });
    else if (!STREET_WITH_NUMBER.test(street)) rejected.push({ field: 'street', reason: 'must begin with the street number the source states' });
    else {
      accepted.street = clip(street, 200);
      for (const k of ['city', 'state', 'zip'] as const) { const v = str(input[k]); if (v) accepted[k] = clip(v, 100); }
      any = true;
    }
  }

  const notes = str(input.notes);
  if (notes) accepted.notes = clip(notes, 500);
  if (!any && rejected.length === 0) rejected.push({ field: '(none)', reason: 'no enrollment or street given' });
  return { accepted: any ? accepted : null, rejected };
}

/** First accepted value wins per field; the address travels as one group with its own URL. */
export function mergeFills(fills: AcceptedFill[]): Map<string, SchoolFill> {
  const acc = new Map<string, { enrollment?: AcceptedFill; address?: AcceptedFill; notes: string[] }>();
  for (const f of fills) {
    const cur = acc.get(f.school_id) ?? { notes: [] };
    if (f.enrollment !== undefined && !cur.enrollment) cur.enrollment = f;
    if (f.street && !cur.address) cur.address = f;
    if (f.notes && (f === cur.enrollment || f === cur.address) && !cur.notes.includes(f.notes)) cur.notes.push(f.notes);
    acc.set(f.school_id, cur);
  }
  const out = new Map<string, SchoolFill>();
  for (const [id, c] of acc) {
    const urls = [
      c.enrollment ? `enrollment ${c.enrollment.source_url}` : null,
      c.address ? `address ${c.address.source_url}` : null,
    ].filter(Boolean) as string[];
    const sameUrl = c.enrollment && c.address && c.enrollment.source_url === c.address.source_url;
    out.set(id, {
      enrollment: c.enrollment?.enrollment ?? null,
      street: c.address?.street ?? null,
      city: c.address?.city ?? null,
      state: c.address?.state ?? null,
      zip: c.address?.zip ?? null,
      source_url: sameUrl ? c.enrollment!.source_url : urls.length === 1 ? (c.enrollment ?? c.address)!.source_url : urls.join('; '),
      notes: c.notes.join('; ') || null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// record_employer
// ---------------------------------------------------------------------------

export interface RecordedEmployer {
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  headcount: number | null;
  source: string;
  source_year: string | null;
  notes: string | null;
  distance_miles_unrounded: number | null;
  geocode: { match_quality: string; matched_address: string } | null;
}

export async function recordEmployer(
  input: Record<string, unknown>,
  site: { latitude: number; longitude: number } | null,
  geocode: (address: string) => Promise<GeocodeMatch | null> = censusGeocode,
): Promise<Record<string, unknown>> {
  const rejected: Array<{ field: string; reason: string }> = [];
  const name = str(input.name);
  const source = str(input.source);
  if (!name || !source) {
    return { recorded: null, rejected: [{ field: !name ? 'name' : 'source', reason: 'required' }] };
  }

  let street = str(input.street);
  if (street && isPoBox(street)) { rejected.push({ field: 'street', reason: 'a PO box is not a site address' }); street = null; }
  else if (street && !STREET_WITH_NUMBER.test(street)) { rejected.push({ field: 'street', reason: 'must begin with the street number the source states' }); street = null; }
  const city = str(input.city), state = str(input.state), zip = str(input.zip);

  let headcount: number | null = null;
  if (input.headcount !== undefined && input.headcount !== null) {
    if (typeof input.headcount === 'number' && Number.isInteger(input.headcount) && input.headcount >= 0) headcount = input.headcount;
    else rejected.push({ field: 'headcount', reason: 'must be a specific whole number stated for this site' });
  }

  const notes: string[] = [];
  const given = str(input.notes);
  if (given) notes.push(clip(given, 500));

  let match: GeocodeMatch | null = null;
  let distance: number | null = null;
  if (street && (city || zip)) {
    const oneLine = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    try {
      match = await geocode(oneLine);
      distance = distanceIfExact(match, site);
      if (!match) notes.push('Census geocoder found no match; distance not determined');
      else if (distance === null) notes.push(`Census geocoder match was ${match.match_quality} (${match.matched_address}); distance not determined`);
    } catch (e) {
      notes.push(`Census geocoder unavailable (${e instanceof Error ? e.message : String(e)}); distance not determined`);
    }
  } else {
    notes.push('no street address with a city or zip; distance not determined');
  }

  const recorded: RecordedEmployer = {
    name: clip(name, 200), street: street ? clip(street, 200) : null, city: city ? clip(city, 100) : null,
    state: state ? clip(state, 50) : null, zip: zip ? clip(zip, 20) : null, headcount, source: clip(source, 2000),
    source_year: str(input.source_year) ? clip(String(input.source_year), 20) : null,
    notes: notes.join('; ') || null,
    distance_miles_unrounded: distance,
    geocode: match ? { match_quality: match.match_quality, matched_address: match.matched_address } : null,
  };
  return {
    recorded,
    distance_miles: distance === null ? null : round1(distance),
    ring: ringFor(distance),
    rejected,
    note: distance === null
      ? 'Recorded. The distance could not be determined: say so wherever you cite this employer; do not estimate it.'
      : 'Recorded. distance_miles is straight-line from the site, one decimal.',
  };
}

// ---------------------------------------------------------------------------
// Deep pass opening message
// ---------------------------------------------------------------------------

export function deepPassOpening(a: {
  esri: EsriDataQuality;
  archetypePrimary: string | null;
  archetypeSecondary: string | null;
  storyCarriers: string[];
  bands: BandTotals;
  bandWarnings: string[];
  fills: Array<AcceptedFill & { name: string | null }>;
  fillSummary: string | null;
  firstPassReport: string | null;
}): string {
  const esriLine = a.esri.status === 'missing'
    ? `ESRI: MISSING. ${a.esri.note}`
    : a.esri.status === 'partial'
      ? `ESRI: PARTIAL. ${a.esri.note} Empty fields: ${a.esri.missing_fields.join(', ')}.`
      : `ESRI: present (enriched ${a.esri.esri_enriched_at}).`;

  const fills = a.fills.length
    ? a.fills.map((f) => `- ${f.name ?? f.school_id}: ${[
        f.enrollment !== undefined ? `enrollment ${f.enrollment}` : null,
        f.street ? `physical address ${[f.street, f.city, [f.state, f.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}` : null,
      ].filter(Boolean).join('; ')} (WEB, ${f.source_url}${f.notes ? `; ${f.notes}` : ''})`).join('\n')
    : '- none';

  return [
    'Deep pass inputs. Everything below was computed or recorded by code; cite it, do not recompute it.',
    '',
    '## Data check',
    esriLine,
    '',
    '## First pass call',
    `Archetype: ${a.archetypePrimary ?? '(none recorded)'}${a.archetypeSecondary ? ` / ${a.archetypeSecondary}` : ''}`,
    `Story carriers: ${a.storyCarriers.length ? a.storyCarriers.join('; ') : '(none recorded)'}`,
    '',
    '## Banded school totals (NCES, from the first pass tool calls; final)',
    'Keys are the cumulative bands in miles ("within 1 / 3 / 5 mi"). null means the first pass made no call at that band.',
    '```json',
    JSON.stringify(a.bands, null, 2),
    '```',
    ...(a.bandWarnings.length ? ['', ...a.bandWarnings.map((w) => `- ${w}`)] : []),
    '',
    '## Web-sourced school fills (never part of an NCES total)',
    fills,
    ...(a.fillSummary ? ['', `Fill-in summary: ${a.fillSummary}`] : []),
    '',
    '## First pass report (reference only)',
    a.firstPassReport ?? '(not available)',
    '',
    'Write the deep pass now, following your instructions.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CSVs
// ---------------------------------------------------------------------------

export function buildSchoolsCsv(schools: SchoolRecord[], fills: AcceptedFill[]): { csv: string; rows: SchoolsRow[] } {
  const merged = mergeFills(fills);
  const rows = schools
    .filter((s) => s.band !== null)
    .map((s) => {
      const row = buildSchoolRow({
        name: s.name, public_private: s.public_private, street: s.street, city: s.city, state: s.state, zip: s.zip,
        enrollment: s.enrollment, school_level: s.school_level, grade_low: s.grade_low, grade_high: s.grade_high,
        distance_miles: s.distance_miles, school_year: s.school_year, notes: s.notes.join('; ') || null,
      }, merged.get(s.school_id));
      // Band = Step 1 membership (what the totals were computed from), not bandFor(rounded distance).
      row.band = s.band;
      if (row.enrollment_source === 'NCES') {
        const basis = s.public_private === 'public' ? 'NCES enrollment includes pre-K' : 'NCES enrollment excludes pre-K';
        row.notes = [basis, row.notes].filter(Boolean).join('; ');
      }
      return row;
    })
    .sort(byDistance);
  return { csv: toCsv(SCHOOLS_COLUMNS, rows), rows };
}

export function buildEmployersCsv(recorded: RecordedEmployer[]): { csv: string; rows: EmployersRow[] } {
  const seen = new Set<string>();
  const rows: EmployersRow[] = [];
  for (const e of recorded) {
    const key = `${e.name.toLowerCase()}|${(e.street ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(buildEmployerRow({
      name: e.name, street: e.street, city: e.city, state: e.state, zip: e.zip, headcount: e.headcount,
      distance_miles: e.distance_miles_unrounded, source: e.source, source_year: e.source_year, notes: e.notes,
    }));
  }
  rows.sort(byDistance);
  return { csv: toCsv(EMPLOYERS_COLUMNS, rows), rows };
}

export { csvBytes };
