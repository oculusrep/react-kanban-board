/**
 * Parcel-layer unit count for Market Research leads (post-run, no LLM).
 *
 * For a pending lead with no count, in a county with a parcel layer that names
 * subdivisions: count the subdivision's lots in the county parcel layer.
 *
 *   - Name match: the subdivision name fields AND the legal description. Hall's
 *     new plats leave SUBD_NAME blank; the name is only in LEGAL_DESC
 *     ("FALCON LANDING LOT 12").
 *   - Common areas are dropped: open space, amenity, HOA / association owners,
 *     detention, pump station.
 *   - Phased record ("Phase 2", "Unit 1", "V and VI", "new section"): only
 *     parcels tagged with every named phase count (Coweta SubdivisionPhase /
 *     Section, or "PH 2" / "UNIT 1" in the name or legal text). If any named
 *     phase isn't tagged, no count is written.
 *
 * A count is WRITTEN only when it doesn't double as an old neighborhood:
 *   - lot numbers 1..N with no gaps on (nearly) every parcel → N, 'reported';
 *   - else, on a layer with year built, every lot unbuilt or built in the last
 *     3 years → the parcel count, 'estimated'.
 * Anything else (gaps, mixed old/new build years, no lot or year data) writes a
 * note for the reviewer and no count. A whole-subdivision count for a new
 * section of an old neighborhood is exactly the mistake this guards against.
 *
 * Doc: docs/MARKET_RESEARCH_LEAD_PASS_2026-11-26.md (Automation)
 * ArcGIS query reference: https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
 */

import { COUNTY_ADAPTERS } from './parcel-adapters.ts';

export interface CountLayer {
  label: string;
  url: string;
  matches: (municipalityName: string) => boolean;
  timeoutMs: number;
  fields: {
    id: string;
    /** Fields matched against the project name (subdivision name, legal description). */
    names: string[];
    lot?: string;
    phase?: string[];
    owner?: string;
    propertyClass?: string;
    acres?: string;
    yearBuilt?: string;
  };
}

const adapterMatch = (label: string) => {
  const a = COUNTY_ADAPTERS.find((x) => x.label === label);
  if (!a) throw new Error(`no parcel adapter labelled ${label}`);
  return a.matches;
};
const HENRY = /^(henry county|mcdonough|stockbridge|hampton|locust grove)$/i;

// Field lists checked against each layer's ?f=json on 2026-11-26 (Henry's
// from subdivision-layers.ts: its server refuses this session).
export const COUNT_LAYERS: CountLayer[] = [
  {
    label: 'Hall County parcel layer',
    url: 'https://services1.arcgis.com/3t0UAc8xSMWWaD2c/arcgis/rest/services/parcel_owner_public/FeatureServer/0',
    matches: adapterMatch('Hall County'),
    timeoutMs: 45_000,
    fields: { id: 'PIN', names: ['SUBD_NAME', 'LEGAL_DESC'], lot: 'SUBD_LOT', owner: 'OWNER', propertyClass: 'DIGCLASS_DESC', acres: 'CALC_ACRE' },
  },
  {
    label: 'Coweta County parcel layer',
    url: 'https://services1.arcgis.com/AaPyNbrJpNGryRqh/ArcGIS/rest/services/WeeklyUpdate_WinGapParcels/FeatureServer/0',
    matches: adapterMatch('Coweta County'),
    timeoutMs: 45_000,
    fields: {
      id: 'ParcelNumber', names: ['SubdivisionName', 'LegalDescription'], lot: 'SubdivisionLot',
      phase: ['SubdivisionPhase', 'SubdivisionSection'], owner: 'OwnerName', acres: 'TotalAcres', yearBuilt: 'YearBuilt',
    },
  },
  {
    label: 'Douglas County parcel layer',
    url: 'https://maps.douglascountyga.gov/arcgis/rest/services/CountyLayers/Parcels/MapServer/15',
    matches: adapterMatch('Douglas County'),
    timeoutMs: 45_000,
    fields: { id: 'ParcelNo', names: ['SUBDIVISION'], owner: 'Owner', acres: 'totalacres', yearBuilt: 'yr_built', propertyClass: 'digclass' },
  },
  {
    label: 'Henry County parcel layer',
    url: 'https://arcgis.co.henry.ga.us/server/rest/services/Parcels/MapServer/12',
    matches: (n) => HENRY.test(n),
    timeoutMs: 60_000,
    fields: { id: 'PARCEL_NO', names: ['SUBDIVISIO'] },
  },
];

export const countLayersFor = (municipalityName: string | null | undefined) =>
  municipalityName ? COUNT_LAYERS.filter((l) => l.matches(municipalityName.trim())) : [];

// ---------------------------------------------------------------------------
// Names and phases (pure)
// ---------------------------------------------------------------------------

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const PHASE_WORD = /\b(phase|ph|unit|section|sec|pod)\b\.?\s*/i;

/** Phase numbers named in a label: "Phase V and VI" → [5, 6]; "Phase 2B" → [2]; "Unit 1 (platted)" → [1]. */
export function parsePhases(label: string | null | undefined): number[] {
  if (!label) return [];
  const out = new Set<number>();
  // Each token is a whole word: "2", "2B", "VI". "Section Viewpoint" is not phase 6.
  const re = /\b(?:phase|ph|unit|section|sec)\b\.?\s*((?:(?:\d+[a-z]?|[ivx]+)\b(?:\s*(?:,|&|and|\+)\s*)?)+)/gi;
  for (const m of label.matchAll(re)) {
    for (const tok of m[1].split(/\s*(?:,|&|\band\b|\+)\s*/i)) {
      const t = tok.trim();
      if (/^\d+[a-z]?$/i.test(t)) out.add(parseInt(t, 10));
      else if (ROMAN[t.toUpperCase()]) out.add(ROMAN[t.toUpperCase()]);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The record is one part of a bigger neighborhood, so a whole-subdivision count is wrong. */
export function isPartialRecord(projectName: string | null, phaseLabel: string | null): boolean {
  const t = `${projectName ?? ''} ${phaseLabel ?? ''}`;
  return parsePhases(t).length > 0 || PHASE_WORD.test(phaseLabel ?? '') ||
    /\b(new section|expansion|addition|extension|amendment)\b/i.test(t);
}

/** Subdivision names to look up: "Union Heights (formerly Caracel Farms at Mulberry Creek)" → ["UNION HEIGHTS", "CARACEL FARMS AT MULBERRY CREEK"]. */
export function candidateNames(projectName: string | null): string[] {
  if (!projectName) return [];
  const out: string[] = [];
  const add = (s: string) => {
    const n = s.toUpperCase()
      .replace(/&/g, ' AND ')
      .replace(/\b(PHASE|PH|UNIT|SECTION|SEC)\b\.?\s*[\dIVX]+[A-Z]?(\s*(,|AND|\+|-)\s*[\dIVX]+[A-Z]?)*/g, ' ')
      .replace(/\b(SUBDIVISION|SUBD|COMMUNITY|DEVELOPMENT|NEIGHBORHOOD|NEW SECTION|EXPANSION|RESIDENTIAL|HOMES|TOWNHOMES|TOWNHOUSES|APARTMENTS|PLANNED|PUD|PRD|PDR|PD)\b/g, ' ')
      .replace(/[^A-Z0-9 ']/g, ' ').replace(/\s+/g, ' ').trim();
    // Two words at least, or one distinctive word of 6+ letters: "THE PARK" is not a name.
    const words = n.split(' ').filter((w) => !['THE', 'AT', 'OF', 'AND', 'ON'].includes(w));
    if (words.length >= 2 || (words.length === 1 && words[0].length >= 6)) if (!out.includes(n)) out.push(n);
  };
  for (const m of projectName.matchAll(/\(([^)]*)\)/g)) {
    const inner = m[1].replace(/^\s*(formerly|fka|f\/k\/a|aka|a\/k\/a)\s+/i, '');
    if (/^(formerly|fka|aka)\b/i.test(m[1].trim())) add(inner);
  }
  const base = projectName.replace(/\([^)]*\)/g, ' ');
  for (const part of base.split(/\s+(?:\/|–|—)\s+|\s+-\s+/)) add(part);
  return out;
}

const COMMON_AREA = /\b(open space|o\/s|common area|amenity|recreation|clubhouse|detention|retention|pond|pump station|lift station|stormwater|greenspace|green space|buffer|right of way|r\/w|mail kiosk|cemetery)\b|^\s*OS\s*\d/i;
const HOA_OWNER = /\b(homeowners?|home owners?|hoa|community association|property owners association|poa)\b/i;

export interface Parcel {
  id: string;
  names: string[];      // the matched name / legal fields, trimmed upper case
  lot: number | null;
  phase: number | null; // tagged phase / section, if the layer has one
  owner: string | null;
  propertyClass: string | null;
  acres: number | null;
  yearBuilt: number | null;
}

const lotFrom = (s: string | null) => {
  const m = s?.match(/\bLOT\s*#?\s*(\d{1,4})\b/i);
  return m ? Number(m[1]) : null;
};
const phaseFrom = (s: string) => {
  const p = parsePhases(s);
  return p.length === 1 ? p[0] : null;
};

export interface ParcelCountResult {
  units: number | null;
  confidence: 'reported' | 'estimated' | null;
  note: string;
  matched: number;   // parcels matched by name before filtering
}

/** Decide a count from matched parcels (pure, unit-tested). */
export function decideCount(
  parcels: Parcel[], opts: { layer: string; names: string[]; phases: number[]; partial: boolean; hasYearBuilt: boolean; nowYear: number },
): ParcelCountResult {
  const nm = opts.names.join(' / ');
  const matched = parcels.length;
  if (!matched) return { units: null, confidence: null, note: `no parcels named ${nm}`, matched };

  const lots = parcels.filter((p) => !COMMON_AREA.test(p.names.join(' ')) && !HOA_OWNER.test(p.owner ?? '')
    && !(p.propertyClass && /^(c|i|e|commercial|industrial|exempt|utility)/i.test(p.propertyClass.trim())));
  const dropped = matched - lots.length;

  let scope = lots;
  if (opts.partial) {
    if (!opts.phases.length) {
      return { units: null, confidence: null, matched,
        note: `${lots.length} lots named ${nm}, but the record is a section of it and the layer can't tell which lots belong to that section` };
    }
    const tagged = (p: Parcel) => p.phase ?? phaseFrom(p.names.join(' '));
    const per = opts.phases.map((ph) => ({ ph, n: lots.filter((p) => tagged(p) === ph).length }));
    const missing = per.filter((x) => x.n === 0).map((x) => x.ph);
    if (missing.length) {
      const have = per.filter((x) => x.n > 0).map((x) => `phase ${x.ph}: ${x.n}`).join(', ');
      return { units: null, confidence: null, matched,
        note: `${lots.length} lots named ${nm}; phase ${missing.join(', ')} not tagged in the layer${have ? ` (${have})` : ''}` };
    }
    scope = lots.filter((p) => opts.phases.includes(tagged(p) as number));
  }

  const n = scope.length;
  const ids = new Set(scope.map((p) => p.id));
  const nums = scope.map((p) => p.lot).filter((x): x is number => x != null);
  const distinct = [...new Set(nums)].sort((a, b) => a - b);
  const phaseTxt = opts.partial ? ` (phase ${opts.phases.join(' + ')})` : '';
  const base = `${opts.layer}: ${ids.size} lots named ${nm}${phaseTxt}${dropped ? `, ${dropped} common-area parcel${dropped === 1 ? '' : 's'} dropped` : ''}`;

  // Lot numbers 1..N, no gaps, on (nearly) every parcel. Per-phase numbering
  // restarts at 1, so only the unphased case can use it.
  if (!opts.partial && nums.length >= 0.9 * n && distinct.length && distinct[0] === 1
      && distinct[distinct.length - 1] === distinct.length && distinct.length >= 0.9 * n) {
    return { units: distinct.length, confidence: 'reported', matched,
      note: `${base}; lot numbers 1–${distinct.length} with no gaps` };
  }
  const range = distinct.length ? `; lot numbers ${distinct[0]}–${distinct[distinct.length - 1]}${distinct.length !== distinct[distinct.length - 1] - distinct[0] + 1 ? ' with gaps' : ''}` : '';

  if (opts.hasYearBuilt) {
    const yrs = scope.map((p) => p.yearBuilt).filter((y): y is number => y != null && y > 1800);
    const old = yrs.filter((y) => y < opts.nowYear - 3);
    if (!old.length) {
      return { units: ids.size, confidence: opts.partial ? 'reported' : 'estimated', matched,
        note: `${base}${range}; ${yrs.length ? `built ${Math.min(...yrs)}–${Math.max(...yrs)} or unbuilt` : 'none built yet'}` };
    }
    return { units: null, confidence: null, matched,
      note: `${base}${range}; ${old.length} built before ${opts.nowYear - 3} (oldest ${Math.min(...old)}), so the name covers an older neighborhood — no count taken` };
  }
  return { units: null, confidence: null, matched, note: `${base}${range}; no lot sequence or year built to confirm it — no count taken` };
}

// ---------------------------------------------------------------------------
// Layer query
// ---------------------------------------------------------------------------

const sq = (s: string) => s.replace(/'/g, "''");

async function getJson(url: string, timeoutMs: number): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (OVIS research)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body?.error) throw new Error(String(body.error.message ?? 'query failed'));
    return body;
  } catch (e) {
    throw new Error(ctl.signal.aborted ? `no answer after ${Math.round(timeoutMs / 1000)} s` : (e instanceof Error ? e.message : String(e)));
  } finally {
    clearTimeout(t);
  }
}

export async function queryParcels(layer: CountLayer, names: string[]): Promise<Parcel[]> {
  const F = layer.fields;
  const clauses = names.flatMap((n) => F.names.map((f) =>
    `(UPPER(${f}) = '${sq(n)}' OR UPPER(${f}) LIKE '${sq(n)} %')`));
  const out = new Map<string, Parcel>();
  const str = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const num = (v: unknown) => { const x = Number(String(v ?? '').trim()); return v != null && String(v).trim() !== '' && Number.isFinite(x) ? x : null; };
  const fields = [F.id, ...F.names, F.lot, ...(F.phase ?? []), F.owner, F.propertyClass, F.acres, F.yearBuilt].filter(Boolean) as string[];
  const page = 1000;
  for (let offset = 0; offset < 10_000; offset += page) {
    const params = new URLSearchParams({
      where: clauses.join(' OR '), outFields: fields.join(','), returnGeometry: 'false',
      orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: String(page), f: 'json',
    });
    const body = await getJson(`${layer.url}/query?${params}`, layer.timeoutMs);
    const feats = body?.features ?? [];
    for (const f of feats) {
      const a = f?.attributes ?? {};
      const id = str(a[F.id]);
      if (!id) continue;
      const nameVals = F.names.map((k) => str(a[k])).filter((x): x is string => !!x).map((x) => x.toUpperCase());
      const phaseVals = (F.phase ?? []).map((k) => num(a[k])).filter((x): x is number => x != null && x > 0);
      out.set(id.replace(/[^0-9A-Za-z]/g, '').toUpperCase(), {
        id, names: nameVals,
        lot: (F.lot ? num(a[F.lot]) : null) ?? lotFrom(nameVals.join(' ')),
        phase: phaseVals[0] ?? null,
        owner: F.owner ? str(a[F.owner]) : null,
        propertyClass: F.propertyClass ? str(a[F.propertyClass]) : null,
        acres: F.acres ? num(a[F.acres]) : null,
        yearBuilt: F.yearBuilt ? num(a[F.yearBuilt]) : null,
      });
    }
    if (feats.length < page && !body?.exceededTransferLimit) break;
  }
  return [...out.values()];
}

/** Count a lead's lots from the county parcel layer. null = no layer covers it. */
export async function countFromParcelLayer(
  r: { project_name: string | null; phase_label: string | null; boundary_municipality: { name: string } | null },
  nowYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric' }).format(new Date())),
): Promise<(ParcelCountResult & { layer: string }) | null> {
  const layers = countLayersFor(r.boundary_municipality?.name);
  const names = candidateNames(r.project_name);
  if (!layers.length || !names.length) return null;
  const partial = isPartialRecord(r.project_name, r.phase_label);
  const phases = parsePhases(`${r.phase_label ?? ''} ${r.project_name ?? ''}`);
  let last: (ParcelCountResult & { layer: string }) | null = null;
  for (const layer of layers) {
    const parcels = await queryParcels(layer, names);
    const res = { ...decideCount(parcels, { layer: layer.label, names, phases, partial, hasYearBuilt: !!layer.fields.yearBuilt, nowYear }), layer: layer.label };
    if (res.units != null) return res;
    if (!last || res.matched > last.matched) last = res;
  }
  return last;
}
