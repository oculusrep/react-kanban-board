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
  buildCompetitorRow, buildEmployerRow, buildSchoolRow, byDistance, COMPETITOR_OPERATOR_TYPES,
  COMPETITORS_COLUMNS, type CompetitorsRow, csvBytes, DENSITY_COUNTING_TYPES, EMPLOYERS_COLUMNS, type EmployersRow,
  FLAG_CHECK, SCHOOLS_COLUMNS, type SchoolFill, type SchoolsRow, toCsv,
} from '../csv.ts';
import { haversineMiles, ringFor, round1 } from './geo.ts';
import { censusGeocode, distanceIfExact, type GeocodeMatch } from './geocode.ts';
import { arcgisQuery, TOOL_DEFINITIONS } from './tools.ts';
import { NCES_ARCGIS } from './nces-config.ts';
import type { DemographicsQuality, EsriDataQuality } from './snapshot.ts';

export const DEEP_PASS_USER_MESSAGE =
  'Run the deep pass: fill the school data gaps, go deep on the story carriers, and write the executive summary.';
export const SCHOOL_FILL_PROMPT_KEY = 'deep_pass_school_fill';
export const DEEP_PASS_PROMPT_KEY = 'deep_pass';
export const FILL_SEARCH_BUDGET = 15;
export const DEEP_PASS_SEARCH_BUDGET = 30; // matches the prompt's stated budget (was 25, prompt said 30)
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

/**
 * Employment that concentrates DAYTIME POPULATION. Customer-facing retail, QSR, grocery, big box,
 * convenience, pharmacy and mall retail are excluded: their staff counts are small and their traffic
 * is the same trade-area customers, so they are not an employment story (decided 2026-09-16).
 */
export const EMPLOYER_TYPES = [
  'corporate_office', 'regional_office', 'distribution_warehouse', 'manufacturing', 'hospital',
  'medical_campus', 'university_college', 'school', 'government', 'call_center', 'data_center',
  'other_institutional',
] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

/** Types that can legitimately carry a retail brand's name (a back-of-house facility, not a store). */
const FACILITY_TYPES = new Set<string>(['corporate_office', 'regional_office', 'distribution_warehouse', 'manufacturing', 'call_center', 'data_center']);

const EXCLUDED_BRANDS = [
  'kroger', 'publix', 'walmart', 'wal-mart', 'costco', 'target', "sam's club", 'aldi', 'lidl', 'whole foods',
  'trader joe', 'ingles', 'food lion', 'harris teeter', 'winn-dixie', "bj's wholesale", 'sprouts',
  "mcdonald", 'chick-fil-a', 'chickfila', 'chick fil a', 'starbucks', 'dunkin', "wendy's", 'burger king',
  'taco bell', 'kfc', 'popeyes', 'zaxby', 'raising cane', 'chipotle', 'panera', 'subway', "arby's", 'sonic drive',
  "culver's", 'whataburger', 'jersey mike', 'firehouse subs', 'dairy queen', 'waffle house', 'cracker barrel',
  '7-eleven', 'quiktrip', 'racetrac', 'wawa', 'circle k', 'sheetz', "buc-ee", 'walgreens', 'cvs', 'rite aid',
  'home depot', "lowe's", 'best buy', 'dollar general', 'dollar tree', 'family dollar', 'tj maxx', 'marshalls',
  'ross stores', "kohl's", "macy's", "dick's sporting", 'academy sports', 'tractor supply', 'autozone',
  "o'reilly auto", 'advance auto', 'ulta', 'sephora', 'petco', 'petsmart', 'michaels', 'hobby lobby',
  'five below', 'big lots', 'aeropostale', 'old navy',
];
const EXCLUDED_KEYWORDS = [
  'grocery', 'supermarket', 'restaurant', 'qsr', 'quick service', 'fast food', 'drive-thru', 'drive thru',
  'coffee shop', 'cafe', 'café', 'pizzeria', 'steakhouse', 'diner', 'bakery cafe', 'food court', 'deli counter',
  'convenience store', 'gas station', 'fuel center', 'truck stop', 'pharmacy', 'drugstore', 'drug store',
  'big box', 'supercenter', 'superstore', 'shopping center', 'shopping mall', 'outlet mall', 'mall retail',
  'retail store', 'storefront', 'boutique', 'car dealership', 'auto dealership', 'car wash', 'nail salon',
  'hair salon', 'fitness center', 'liquor store',
];
/** Words that mark a back-of-house facility rather than a store. */
const FACILITY_WORDS = [
  'corporate', 'headquarters', 'hq', 'regional office', 'support center', 'operations center', 'distribution',
  'fulfillment', 'warehouse', 'manufacturing', 'plant', 'production facility', 'processing', 'call center',
  'contact center', 'data center', 'campus', 'back office', 'shared services',
];

const hit = (haystack: string, needles: string[]) => needles.find((n) => haystack.includes(n)) ?? null;

export const RECORD_EMPLOYER_TOOL = {
  name: 'record_employer',
  description:
    'Record one site-level employer near the site, as soon as a source states it. ONLY employment that ' +
    'concentrates daytime population counts: corporate and regional offices, distribution and warehouse, ' +
    'manufacturing, hospitals and large medical campuses, universities and colleges, government centers, ' +
    'call centers, data centers, and schools as institutional employers. Customer-facing retail is NOT an ' +
    'employer here and is rejected: grocery, big box, restaurants and QSR, convenience, pharmacy, mall ' +
    'retail. A retail brand is allowed only for a back-of-house facility (its distribution center, ' +
    'corporate office, plant), named as such. The street, city, state and zip only as the source states ' +
    'them (a street must begin with its street number; leave it out otherwise). headcount only when the ' +
    'source states a specific number for THIS site. The address is geocoded here: the result carries ' +
    'distance_miles and ring when the address matches exactly, and distance_miles null when it could not ' +
    'be located (then say the distance could not be determined).',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      employer_type: {
        type: 'string',
        enum: [...EMPLOYER_TYPES],
        description: 'What kind of employment site this is. Customer-facing retail has no type here and is not recorded.',
      },
      street: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      headcount: { type: 'integer', minimum: 0 },
      source: { type: 'string', description: 'URL of the source, or the named source.' },
      source_year: { type: 'string', description: 'The year the figure refers to.' },
      notes: { type: 'string' },
    },
    required: ['name', 'employer_type', 'source'],
  },
};

export const RECORD_COFFEE_COMPETITOR_TOOL = {
  name: 'record_coffee_competitor',
  description:
    'Record one coffee operation within 5 mi that is not a Starbucks (Starbucks come from the Atlas data ' +
    'and are added to the export automatically). operator_type says how it competes, which is a different ' +
    'question from whether it has a lane: national_dt (national or regional drive-thru brand — Dutch Bros, ' +
    '7 Brew, Scooter\'s, Dunkin\', Caribou), local_dt (independent or local operator with a drive-thru), ' +
    'institutional (coffee inside a church, school, hospital, grocery, campus or office building, with or ' +
    'without a lane), cafe (no drive-thru). Every type is exported and mapped; only national_dt and ' +
    'local_dt may be counted in a drive-thru competitive-density claim. The address is geocoded here for ' +
    'the map: give the street as the source states it.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      brand: { type: 'string', description: 'The chain or brand, when it belongs to one.' },
      operator_type: { type: 'string', enum: [...COMPETITOR_OPERATOR_TYPES] },
      street: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      drive_thru: { type: 'boolean', description: 'Does this location have a drive-thru lane?' },
      source: { type: 'string' },
      notes: { type: 'string', description: 'For institutional: the host (church, school, hospital, grocery).' },
    },
    required: ['name', 'operator_type', 'source'],
  },
};

export interface RecordedCompetitor {
  name: string;
  brand: string | null;
  operator_type: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_miles_unrounded: number | null;
  drive_thru: boolean | null;
  source: string;
  notes: string | null;
}

export async function recordCoffeeCompetitor(
  input: Record<string, unknown>,
  site: { latitude: number; longitude: number } | null,
  geocode: (address: string) => Promise<GeocodeMatch | null> = censusGeocode,
): Promise<Record<string, unknown>> {
  const rejected: Array<{ field: string; reason: string }> = [];
  const name = str(input.name);
  const source = str(input.source);
  const operatorType = str(input.operator_type);
  if (!name || !source) return { recorded: null, rejected: [{ field: !name ? 'name' : 'source', reason: 'required' }] };
  if (!operatorType || !(COMPETITOR_OPERATOR_TYPES as readonly string[]).includes(operatorType)) {
    return {
      recorded: null,
      rejected: [{ field: 'operator_type', reason: `must be one of: ${COMPETITOR_OPERATOR_TYPES.join(', ')}` }],
      note: 'Not recorded. Classify it: coffee inside a church, school, hospital, grocery or office building is institutional even when it has a lane.',
    };
  }

  let street = str(input.street);
  if (street && !STREET_WITH_NUMBER.test(street)) { rejected.push({ field: 'street', reason: 'must begin with the street number the source states' }); street = null; }
  const city = str(input.city), state = str(input.state), zip = str(input.zip);
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
      if (!match) notes.push('Census geocoder found no match; not placed on the map');
      else if (distance === null) notes.push(`Census geocoder match was ${match.match_quality} (${match.matched_address}); not placed on the map`);
    } catch (e) {
      notes.push(`Census geocoder unavailable (${e instanceof Error ? e.message : String(e)})`);
    }
  } else {
    notes.push('no street address with a city or zip; not placed on the map');
  }

  const counts = (DENSITY_COUNTING_TYPES as readonly string[]).includes(operatorType);
  const recorded: RecordedCompetitor = {
    name: clip(name, 200), brand: str(input.brand) ? clip(str(input.brand)!, 120) : null,
    operator_type: operatorType, street: street ? clip(street, 200) : null,
    city: city ? clip(city, 100) : null, state: state ? clip(state, 50) : null, zip: zip ? clip(zip, 20) : null,
    latitude: distance !== null && match ? match.latitude : null,
    longitude: distance !== null && match ? match.longitude : null,
    distance_miles_unrounded: distance,
    drive_thru: typeof input.drive_thru === 'boolean' ? input.drive_thru : null,
    source: clip(source, 2000), notes: notes.join('; ') || null,
  };
  return {
    recorded,
    distance_miles: distance === null ? null : round1(distance),
    counts_toward_density: counts,
    rejected,
    note: counts
      ? 'Recorded, and it counts toward a drive-thru competitive-density claim — say which types you counted.'
      : `Recorded as ${operatorType}: exported and mapped, but it may NOT be counted in a "drive-thru competitors within X mi" statement.`,
  };
}

const DEEP_PASS_OVIS_TOOLS = ['query_nearby_starbucks', 'query_municipal_projects', 'query_traffic_counts', 'geocode_address', 'distance_between_addresses'];

export const SCHOOL_FILL_CLIENT_TOOLS: Array<Record<string, unknown>> = [RECORD_SCHOOL_FILL_TOOL];
export const DEEP_PASS_CLIENT_TOOLS: Array<Record<string, unknown>> = [
  ...(TOOL_DEFINITIONS as unknown as Array<Record<string, unknown>>).filter((t) => DEEP_PASS_OVIS_TOOLS.includes(String(t.name))),
  RECORD_EMPLOYER_TOOL,
  RECORD_COFFEE_COMPETITOR_TOOL,
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
  employer_type: EmployerType;
  /** Where distance_miles_unrounded came from: the school row already on file, or this geocode. */
  distance_source: 'school_on_file' | 'census_geocode' | null;
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

/** Normalized street key: "5910 Zebulon Rd" and "5910 ZEBULON ROAD" are the same place. */
export function streetKey(street: string | null | undefined): string | null {
  const t = (street ?? '').trim().toLowerCase().replace(/[.,]/g, '');
  if (!t) return null;
  return t
    .replace(/\b(road|rd)\b/g, 'rd').replace(/\b(drive|dr)\b/g, 'dr').replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(avenue|ave)\b/g, 'ave').replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(parkway|pkwy)\b/g, 'pkwy').replace(/\b(lane|ln)\b/g, 'ln').replace(/\s+/g, ' ');
}

/**
 * A generator has ONE distance. Schools arrive with NCES's own physical geocode; recording the same
 * school as an institutional employer used to geocode its street again through Census and produce a
 * second, different number (Macon 2026-09-16: Carter Elementary 0.3 mi in schools.csv, 0.2 mi in
 * employers.csv and the prose). When the street matches a school already on file, that school's
 * distance is reused and nothing is re-geocoded.
 */
export function knownSchoolDistance(
  street: string | null | undefined,
  schools: SchoolRecord[],
): { school: SchoolRecord; distance_miles: number } | null {
  const key = streetKey(street);
  if (!key) return null;
  const hit = schools.find((s) => streetKey(s.street) === key && s.distance_miles !== null);
  return hit ? { school: hit, distance_miles: hit.distance_miles as number } : null;
}

export async function recordEmployer(
  input: Record<string, unknown>,
  site: { latitude: number; longitude: number } | null,
  geocode: (address: string) => Promise<GeocodeMatch | null> = censusGeocode,
  schoolsOnFile: SchoolRecord[] = [],
): Promise<Record<string, unknown>> {
  const rejected: Array<{ field: string; reason: string }> = [];
  const name = str(input.name);
  const source = str(input.source);
  if (!name || !source) {
    return { recorded: null, rejected: [{ field: !name ? 'name' : 'source', reason: 'required' }] };
  }

  // ---- category filter: daytime-population employment only ----
  const employerType = str(input.employer_type) as EmployerType | null;
  if (!employerType || !(EMPLOYER_TYPES as readonly string[]).includes(employerType)) {
    return {
      recorded: null,
      rejected: [{ field: 'employer_type', reason: `must be one of: ${EMPLOYER_TYPES.join(', ')}. Customer-facing retail, QSR, grocery, big box, convenience, pharmacy and mall retail are not employers here.` }],
      note: 'Not recorded. This tool takes only employment that concentrates daytime population.',
    };
  }
  const haystack = `${name} ${str(input.notes) ?? ''}`.toLowerCase();
  const brand = hit(haystack, EXCLUDED_BRANDS);
  const keyword = hit(haystack, EXCLUDED_KEYWORDS);
  const facilityWord = hit(haystack, FACILITY_WORDS);
  if (keyword && !FACILITY_TYPES.has(employerType)) {
    return {
      recorded: null,
      rejected: [{ field: 'name', reason: `"${keyword}" is customer-facing retail, restaurant or convenience: not an employment story. Record it only as a back-of-house facility (distribution centre, corporate office, plant), named as such.` }],
      note: 'Not recorded. Customer-facing retail is excluded from employers and from every employment figure.',
    };
  }
  if (brand && !(FACILITY_TYPES.has(employerType) && facilityWord)) {
    return {
      recorded: null,
      rejected: [{ field: 'name', reason: `"${brand}" is a customer-facing retail or QSR brand. Record it only when the source names a back-of-house facility (for example "${brand} distribution center"), with a matching employer_type.` }],
      note: 'Not recorded. A store of a retail brand is not an employer here; its distribution centre, plant or corporate office is.',
    };
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
  let distanceSource: RecordedEmployer['distance_source'] = null;

  // A school already on file keeps its NCES distance: one generator, one distance.
  const known = knownSchoolDistance(street, schoolsOnFile);
  if (known) {
    distance = known.distance_miles;
    distanceSource = 'school_on_file';
    notes.push(`distance from the NCES school row already on file (${known.school.name ?? known.school.school_id}), not re-geocoded`);
  } else if (street && (city || zip)) {
    const oneLine = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    try {
      match = await geocode(oneLine);
      distance = distanceIfExact(match, site);
      if (distance !== null) distanceSource = 'census_geocode';
      if (!match) notes.push('Census geocoder found no match; distance not determined');
      else if (distance === null) notes.push(`Census geocoder match was ${match.match_quality} (${match.matched_address}); distance not determined`);
    } catch (e) {
      notes.push(`Census geocoder unavailable (${e instanceof Error ? e.message : String(e)}); distance not determined`);
    }
  } else {
    notes.push('no street address with a city or zip; distance not determined');
  }

  const recorded: RecordedEmployer = {
    name: clip(name, 200), employer_type: employerType, distance_source: distanceSource, street: street ? clip(street, 200) : null, city: city ? clip(city, 100) : null,
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

/** The Data check line. Handles the demographics-block shape and the older property-only shape. */
export function esriDataCheckLine(q: DemographicsQuality | EsriDataQuality): string {
  if ('rings_miles' in q) {
    return q.status === 'missing' ? `ESRI: MISSING. ${q.note}` : `ESRI: ${q.status.toUpperCase()}. ${q.note}`;
  }
  return q.status === 'missing'
    ? `ESRI: MISSING. ${q.note}`
    : q.status === 'partial'
      ? `ESRI: PARTIAL. ${q.note} Empty fields: ${q.missing_fields.join(', ')}.`
      : `ESRI: present (enriched ${q.esri_enriched_at}).`;
}

export function deepPassOpening(a: {
  esri: DemographicsQuality | EsriDataQuality;
  archetypePrimary: string | null;
  archetypeSecondary: string | null;
  storyCarriers: string[];
  bands: BandTotals;
  bandWarnings: string[];
  fills: Array<AcceptedFill & { name: string | null }>;
  fillSummary: string | null;
  firstPassReport: string | null;
}): string {
  const esriLine = esriDataCheckLine(a.esri);

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

/**
 * NOTHING IS FILTERED OUT OF AN EXPORT (decided 2026-09-25, replacing the 100-enrolled / 100-staff
 * floors). Every school, employer and coffee operation found is exported with its number, blank when
 * unknown, and flagged CHECK when the mapper needs to look. Classification governs what the NARRATIVE
 * may claim — small schools are not generators, institutional coffee is not a drive-thru competitor —
 * never what reaches the file. Filtering is the mapping step's job.
 */
export interface CsvFilterCounts {
  /** Rows written to the file (every row found). */
  kept: number;
  /** Rows written with a CHECK flag: no number on file, or not placeable on a map. */
  flagged: number;
}

export function buildSchoolsCsv(
  schools: SchoolRecord[],
  fills: AcceptedFill[],
): { csv: string; rows: SchoolsRow[]; filtered: CsvFilterCounts } {
  const merged = mergeFills(fills);
  const all = schools
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
  return {
    csv: toCsv(SCHOOLS_COLUMNS, all),
    rows: all,
    filtered: { kept: all.length, flagged: all.filter((r) => r.flag === FLAG_CHECK).length },
  };
}

export function buildEmployersCsv(recorded: RecordedEmployer[]): { csv: string; rows: EmployersRow[]; filtered: CsvFilterCounts } {
  const seen = new Set<string>();
  const all: EmployersRow[] = [];
  for (const e of recorded) {
    const key = `${e.name.toLowerCase()}|${(e.street ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(buildEmployerRow({
      name: e.name, employer_type: e.employer_type, street: e.street, city: e.city, state: e.state, zip: e.zip, headcount: e.headcount,
      distance_miles: e.distance_miles_unrounded, source: e.source, source_year: e.source_year, notes: e.notes,
    }));
  }
  all.sort(byDistance);
  return {
    csv: toCsv(EMPLOYERS_COLUMNS, all),
    rows: all,
    filtered: { kept: all.length, flagged: all.filter((r) => r.flag === FLAG_CHECK).length },
  };
}

export { csvBytes };

// ---------------------------------------------------------------------------
// competitors.csv
// ---------------------------------------------------------------------------

/** Every coffee operation within this many miles goes in competitors.csv. */
export const COMPETITOR_RADIUS_MILES = 5;

export interface AtlasCoffeeRow {
  name: string | null;
  brand: string;
  operator_type: CompetitorOperatorTypeLike;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number;
  longitude: number;
  distance_miles: number;
  drive_thru: boolean | null;
  company_operated: boolean;
  rtm_sales: number | null;
  sales_as_of: string | null;
  source: string;
  notes: string | null;
}
type CompetitorOperatorTypeLike = 'national_dt' | 'local_dt' | 'institutional' | 'cafe';

/**
 * Starbucks within COMPETITOR_RADIUS_MILES, straight from the Atlas tables — the export never depends
 * on the model having called a tool. Company-operated store_type DT / DTO is a drive-thru; a licensed
 * kiosk inside a host business is institutional whatever its lane, which is the same rule applied to
 * everyone else's coffee.
 */
// deno-lint-ignore no-explicit-any
export async function atlasCoffeeWithin(service: any, site: { latitude: number; longitude: number }): Promise<AtlasCoffeeRow[]> {
  const pt = { lat: site.latitude, lng: site.longitude };
  const out: AtlasCoffeeRow[] = [];

  const { data: stores, error: sErr } = await service
    .from('starbucks_store')
    .select('store_number, store_name, city, state, latitude, longitude')
    .not('latitude', 'is', null).not('longitude', 'is', null);
  if (sErr) throw new Error(`starbucks_store lookup failed: ${sErr.message}`);
  const near = ((stores ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({ r, d: haversineMiles(pt, { lat: Number(r.latitude), lng: Number(r.longitude) }) }))
    .filter((x) => x.d <= COMPETITOR_RADIUS_MILES);

  if (near.length) {
    const { data: snaps, error: nErr } = await service
      .from('starbucks_snapshot')
      .select('store_number, snapshot_date, store_type, rtm_sales')
      .in('store_number', near.map((x) => String(x.r.store_number)))
      .order('snapshot_date', { ascending: false });
    if (nErr) throw new Error(`starbucks_snapshot lookup failed: ${nErr.message}`);
    const latest = new Map<string, Record<string, unknown>>();
    for (const row of (snaps ?? []) as Array<Record<string, unknown>>) {
      const k = String(row.store_number);
      if (!latest.has(k)) latest.set(k, row);
    }
    for (const { r, d } of near) {
      const snap = latest.get(String(r.store_number));
      const type = (snap?.store_type as string) ?? null;
      const driveThru = type ? /^DT/i.test(type) : null;
      out.push({
        name: (r.store_name as string) ?? `Starbucks ${r.store_number}`,
        brand: 'Starbucks',
        operator_type: driveThru ? 'national_dt' : 'cafe',
        // Company-operated Atlas rows carry no street address — never invent one.
        street: null, city: (r.city as string) ?? null, state: (r.state as string) ?? null, zip: null,
        latitude: Number(r.latitude), longitude: Number(r.longitude), distance_miles: d,
        drive_thru: driveThru, company_operated: true,
        rtm_sales: typeof snap?.rtm_sales === 'number' && (snap.rtm_sales as number) > 0 ? (snap.rtm_sales as number) : null,
        sales_as_of: (snap?.snapshot_date as string) ?? null,
        source: 'Starbucks Atlas (starbucks_store + starbucks_snapshot)',
        notes: type ? `store_type ${type}` : null,
      });
    }
  }

  const { data: licensed, error: lErr } = await service
    .from('starbucks_licensed_store')
    .select('store_number, store_name, licensee_name, segment, store_type, address, city, state, postal_code, latitude, longitude, verified_latitude, verified_longitude')
    .limit(1000);
  if (lErr) throw new Error(`starbucks_licensed_store lookup failed: ${lErr.message}`);
  for (const l of (licensed ?? []) as Array<Record<string, unknown>>) {
    const lat = Number(l.verified_latitude ?? l.latitude), lng = Number(l.verified_longitude ?? l.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineMiles(pt, { lat, lng });
    if (d > COMPETITOR_RADIUS_MILES) continue;
    out.push({
      name: (l.store_name as string) ?? `Starbucks licensed ${l.store_number}`,
      brand: 'Starbucks',
      operator_type: 'institutional', // a kiosk inside a host business, lane or not
      street: (l.address as string) ?? null, city: (l.city as string) ?? null, state: (l.state as string) ?? null,
      zip: (l.postal_code as string) ?? null, latitude: lat, longitude: lng, distance_miles: d,
      drive_thru: null, company_operated: false, rtm_sales: null, sales_as_of: null,
      source: 'Starbucks Atlas (starbucks_licensed_store)',
      notes: [l.licensee_name as string, l.segment as string].filter(Boolean).join(' / ') || null,
    });
  }
  return out;
}

export function buildCompetitorsCsv(
  atlas: AtlasCoffeeRow[],
  recorded: RecordedCompetitor[],
): { csv: string; rows: CompetitorsRow[]; filtered: CsvFilterCounts } {
  const rows: CompetitorsRow[] = [];
  const seen = new Set<string>();
  const push = (r: CompetitorsRow) => {
    const key = `${String(r.name ?? '').toLowerCase()}|${streetKey(String(r.street ?? '')) ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(r);
  };
  for (const a of atlas) {
    push(buildCompetitorRow({ ...a, rtm_sales: a.rtm_sales, distance_miles: a.distance_miles }));
  }
  for (const c of recorded) {
    push(buildCompetitorRow({
      name: c.name, brand: c.brand, operator_type: c.operator_type, street: c.street, city: c.city,
      state: c.state, zip: c.zip, latitude: c.latitude, longitude: c.longitude,
      distance_miles: c.distance_miles_unrounded, drive_thru: c.drive_thru, company_operated: false,
      rtm_sales: null, sales_as_of: null, source: c.source, notes: c.notes,
    }));
  }
  rows.sort(byDistance);
  return {
    csv: toCsv(COMPETITORS_COLUMNS, rows),
    rows,
    filtered: { kept: rows.length, flagged: rows.filter((r) => r.flag === FLAG_CHECK).length },
  };
}

/** Rows a "N drive-thru competitors within X mi" claim may count. */
export function densityCountable(rows: CompetitorsRow[], withinMiles: number): CompetitorsRow[] {
  return rows.filter((r) =>
    (DENSITY_COUNTING_TYPES as readonly string[]).includes(String(r.operator_type)) &&
    typeof r.distance_mi === 'number' && (r.distance_mi as number) <= withinMiles);
}
