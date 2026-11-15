/**
 * Locate step for Market Research records: find WHERE a project is when its
 * address doesn't give a precise pin.
 *
 * Pipeline position (post-run job and "Fill missing units & locations"):
 *   dedupe → Gemini units → Gemini location (this) → dedupe → parcel fetch → Sweep ready
 *
 * 1. Classify every pending staged record once (location_precision):
 *    boundary | precise | imprecise | no_address | failed. "precise" = the
 *    record's own address geocodes ROOFTOP / RANGE_INTERPOLATED (or to a
 *    resolved intersection) AND isn't just a road + city.
 * 2. For the rest, ask Gemini 2.5 Flash with live Google Search where the
 *    project is (street address / intersection, side of road, landmarks,
 *    parcel IDs, acreage, a source per fact).
 * 3. Write-back:
 *    - address or intersection found → geocode it; if precise AND within 3 mi
 *      of the record's municipality boundary, it becomes the pin
 *      (location_confidence='estimated'). Staged rows: the site distance is
 *      re-checked; outside the radius → lead_reason.
 *    - otherwise landmarks / directions → location_description becomes
 *      "Pin hint: …"; the old text is kept in notes.
 *    - parcel IDs / acreage → parcel_boundary_notes in the "Parcel IDs: …"
 *      format (staged only), so the parcel fetch picks them up.
 *    - sources → notes.
 * Committed records (locateCommitted): pins and hints only, never moved to
 * leads, never over a boundary or hand-placed pin.
 *
 * Every Gemini call is logged to research_location_estimate (answer, sources,
 * tokens, cost, outcome, old/new hint).
 *
 * Doc: docs/MARKET_RESEARCH_LOCATE.md
 * APIs:
 *   Gemini grounding: https://ai.google.dev/gemini-api/docs/google-search
 *   Geocoding: https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 *     results[0].geometry.location_type ∈ ROOFTOP | RANGE_INTERPOLATED |
 *     GEOMETRIC_CENTER | APPROXIMATE; results[0].types includes 'intersection'
 *     for a resolved intersection. $5 / 1,000 requests.
 */

import { adapterFor, idMatchesAdapter } from './parcel-adapters.ts';
import { fetchBoundariesForProjects, type ProjectFetchResult } from './research-parcel-fetch.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;
// deno-lint-ignore no-explicit-any
type Row = any;

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CENTS_PER_INPUT_TOKEN = 30 / 1_000_000;
const CENTS_PER_OUTPUT_TOKEN = 250 / 1_000_000;
const CENTS_PER_GROUNDED_PROMPT = 3.5; // charged on every call: an upper bound
const CENTS_PER_GEOCODE = 0.5;
const CONCURRENCY = 4;
const CALL_TIMEOUT_MS = 60_000;
/** A located pin further than this from the record's municipality is a different place. */
const MAX_MUNI_MILES = 3;

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

export interface Geo {
  lat: number;
  lng: number;
  location_type: string;
  types: string[];
  formatted: string;
}

export async function geocode(address: string, key: string): Promise<Geo | null> {
  const res = await fetch('https://maps.googleapis.com/maps/api/geocode/json?'
    + new URLSearchParams({ address, key, region: 'us' }));
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const d = await res.json();
  if (d.status === 'ZERO_RESULTS') return null;
  if (d.status !== 'OK') throw new Error(`geocode ${d.status}: ${d.error_message ?? ''}`);
  const r = d.results[0];
  return {
    lat: r.geometry.location.lat, lng: r.geometry.location.lng,
    location_type: r.geometry.location_type, types: r.types ?? [],
    formatted: r.formatted_address ?? address,
  };
}

const isIntersectionText = (a: string) => /\s(&|and|at|@)\s|\//i.test(a);

/** Only a road + city: no house number and not an intersection. */
export function isRoadOnly(address: string | null): boolean {
  const a = (address ?? '').trim();
  if (!a) return true;
  return !/^\d+[a-z]?\b/i.test(a) && !isIntersectionText(a);
}

export function isPrecise(g: Geo | null): boolean {
  if (!g) return false;
  return g.location_type === 'ROOFTOP' || g.location_type === 'RANGE_INTERPOLATED'
    || g.types.includes('intersection');
}

function withPlace(address: string, city: string | null, county: string | null): string {
  const a = address.trim();
  if (/\bGA\b|georgia/i.test(a)) return a;
  const place = city ?? (county ? `${county} County` : null);
  return place && !a.toLowerCase().includes(place.toLowerCase()) ? `${a}, ${place}, GA` : `${a}, GA`;
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

interface LocateAnswer {
  street_address: string | null;
  intersection: string | null;
  side_of_road: string | null;
  landmarks_directions: string | null;
  parcel_ids: string[];
  acreage: number | null;
  facts: { fact: string; source: string }[];
}

interface GeminiOut {
  parsed: LocateAnswer | null;
  answer: string;
  sources: { title: string; uri: string }[];
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
}

interface Rec {
  kind: 'staged' | 'committed';
  id: string;
  research_run_id: string | null;
  project_name: string | null;
  phase_label: string | null;
  builder_developer: string | null;
  address: string | null;
  location_description: string | null;
  parcel_boundary_notes: string | null;
  parcel_numbers: string[] | null;
  notes: string | null;
  source: string | null;
  lead_reason?: string | null;
  parcel_fetch_status?: string | null;
  municipality?: { name: string } | null;
}

function buildPrompt(r: Rec, city: string | null, county: string | null): string {
  const name = r.project_name?.trim() || '(unnamed project)';
  const builder = r.builder_developer?.trim() ? ` (${r.builder_developer.trim()})` : '';
  const where = [city, county ? `${county} County` : null].filter(Boolean).join(', ');
  const ctx = [
    r.phase_label ? `Phase on this record: ${r.phase_label}` : null,
    r.address ? `Address on the record (may be vague): ${r.address}` : null,
    r.location_description ? `Location text on the record: ${r.location_description}` : null,
    r.parcel_boundary_notes ? `Parcel notes on the record: ${r.parcel_boundary_notes}` : null,
    r.source ? `What the research agent cited: ${r.source.slice(0, 800)}` : null,
    r.notes ? `Research notes: ${r.notes.slice(0, 1200)}` : null,
  ].filter(Boolean).join('\n');

  return `Where exactly is ${name}${builder} in ${where || 'Georgia'}, GA being built? Give the street address or nearest intersection, which side of the road, and nearby landmarks or directions. If a rezoning or plat record lists parcel IDs or acreage, include them. Cite the source for each fact.

Context from our record:
${ctx || '(none)'}

Rules:
- Only report what a source states for THIS project. Do not guess an address.
- The project may be built in phases. Do not pick between phases: if phases are at different locations and our record names no phase, describe the location that covers the whole project, or say where each phase is in landmarks_directions.
- street_address must be a real street address with a house number; otherwise null. intersection is two named roads ("Alcovy Rd & Underwood Dr"); otherwise null.
- parcel_ids: exactly as written in the source (e.g. "C123-0045"); [] if none.

Reply with ONLY a JSON object, no prose around it:
{"street_address": <string or null>, "intersection": <string or null>, "side_of_road": <string or null>, "landmarks_directions": <string or null>, "parcel_ids": [<string>], "acreage": <number or null>, "facts": [{"fact": "<what>", "source": "<url>"}]}`;
}

async function askGemini(prompt: string, apiKey: string): Promise<GeminiOut> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let data: Row;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const u = data.usageMetadata ?? {};
  const input_tokens = (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0);
  const output_tokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  const cost_cents = input_tokens * CENTS_PER_INPUT_TOKEN + output_tokens * CENTS_PER_OUTPUT_TOKEN + CENTS_PER_GROUNDED_PROMPT;
  const cand = data.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? []).map((p: Row) => p.text ?? '').join('').trim();
  const sources = ((cand?.groundingMetadata?.groundingChunks ?? []) as Row[])
    .map((c) => c.web).filter(Boolean)
    .map((w: Row) => ({ title: String(w.title ?? ''), uri: String(w.uri ?? '') }));

  let parsed: LocateAnswer | null = null;
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const p = JSON.parse(json);
      const str = (x: unknown) => (typeof x === 'string' && x.trim() && !/^(null|none|unknown|n\/a)$/i.test(x.trim()) ? x.trim() : null);
      const acres = Number(p.acreage);
      parsed = {
        street_address: str(p.street_address),
        intersection: str(p.intersection),
        side_of_road: str(p.side_of_road),
        landmarks_directions: str(p.landmarks_directions),
        parcel_ids: Array.isArray(p.parcel_ids) ? p.parcel_ids.map(str).filter(Boolean) as string[] : [],
        acreage: p.acreage != null && Number.isFinite(acres) && acres > 0 ? acres : null,
        facts: Array.isArray(p.facts)
          ? p.facts.filter((f: Row) => f && typeof f.fact === 'string').map((f: Row) => ({ fact: f.fact, source: String(f.source ?? '') }))
          : [],
      };
    } catch { /* unparseable → nothing found */ }
  }
  // "Context from user record" is our own text coming back, not a finding.
  if (parsed) parsed.facts = parsed.facts.filter((f) => f.source.trim() && !/context|user|record/i.test(f.source));
  // Ungrounded answers are guesses: keep the text in the log, write nothing.
  // groundingChunks is sometimes empty even when the search ran (facts then
  // cite grounding URLs or chunk numbers), so any of these counts as grounded.
  const searched = (cand?.groundingMetadata?.webSearchQueries ?? []).length > 0;
  const urlFacts = parsed?.facts.some((f) => /^https?:\/\//i.test(f.source)) ?? false;
  if (parsed && !(sources.length > 0 || urlFacts || (searched && parsed.facts.length > 0))) parsed = null;
  return { parsed, answer, sources, input_tokens, output_tokens, cost_cents };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function easternDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

const appendNote = (notes: string | null, add: string) => [notes?.trim(), add].filter(Boolean).join('\n\n');

function sourcesNote(a: LocateAnswer | null, g: GeminiOut): string {
  const facts = (a?.facts ?? []).map((f) => `- ${f.fact}${f.source ? ` <${f.source}>` : ''}`).join('\n');
  const src = g.sources.map((s) => `${s.title} <${s.uri}>`).join('; ');
  return [facts ? `Facts:\n${facts}` : null, src ? `Sources: ${src}` : null].filter(Boolean).join('\n');
}

function hintText(a: LocateAnswer): string | null {
  const parts = [
    a.intersection ? `near ${a.intersection}` : null,
    a.side_of_road,
    a.landmarks_directions,
  ].filter(Boolean);
  return parts.length ? `Pin hint: ${parts.join('; ')}` : null;
}

const HINT_STOP = new Set(['the', 'and', 'for', 'with', 'pin', 'hint', 'near', 'along', 'located', 'project', 'property',
  'side', 'road', 'county', 'unincorporated', 'georgia', 'from', 'this', 'that', 'into', 'its', 'are', 'was', 'has']);
const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !HINT_STOP.has(w)));

/** At least 3 significant words the record's own text doesn't already have. */
function addsInformation(hint: string, existing: (string | null)[]): boolean {
  const have = words(existing.filter(Boolean).join(' '));
  let fresh = 0;
  for (const w of words(hint)) if (!have.has(w)) fresh++;
  return fresh >= 3;
}

/**
 * Roads the record itself names ("Dearing Road" → "dearing", "Highway 212" →
 * "212"). When there are any, a located address must be on one of them, or
 * Gemini has probably matched a different project with a similar name.
 */
const ROAD_SUFFIX = 'road|rd|street|st|drive|dr|parkway|pkwy|lane|ln|avenue|ave|boulevard|blvd|circle|cir|trail|trl|way|pike|court|ct';
const ROAD_NAME_STOP = new Set(['on', 'off', 'along', 'at', 'near', 'of', 'the', 'and', 'from', 'via', 'to', 'n', 's', 'e', 'w',
  'north', 'south', 'east', 'west', 'old', 'new', 'existing', 'county', 'city', 'corridor', 'state', 'us', 'in', 'behind']);
export function roadTokens(...texts: (string | null)[]): string[] {
  const t = texts.filter(Boolean).join(' ');
  const out = new Set<string>();
  for (const m of t.matchAll(new RegExp(`\\b([A-Za-z][A-Za-z']+(?:\\s+[A-Za-z][A-Za-z']+)?)\\s+(?:${ROAD_SUFFIX})\\b`, 'gi'))) {
    // The whole name ('pickett bridge'), minus leading filler words.
    const name = m[1].toLowerCase().split(/\s+/).filter((w) => !ROAD_NAME_STOP.has(w)).join(' ');
    if (name.length >= 3) out.add(name);
  }
  for (const m of t.matchAll(/\b(?:highway|hwy|sr|us|ga|state route|route)[\s-]*(\d{1,3})\b/gi)) out.add(m[1]);
  return [...out];
}
function onNamedRoad(candidate: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const c = candidate.toLowerCase();
  return tokens.some((tk) => (/^\d+$/.test(tk)
    ? new RegExp(`\\b${tk}\\b`).test(c)
    : tk.split(' ').every((w) => c.includes(w))));
}

/**
 * Real parcel numbers only. Gemini also returns land-lot / district references
 * ("Land Lots 79", "83 of the 8th District") and bare lot numbers; those are
 * survey descriptions the parcel fabric can't look up. A "(portion)" suffix
 * is dropped (the parcel is still the right one to fetch).
 */
export function validParcelIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const p = raw.replace(/\(\s*portion\s*\)/i, '').trim();
    if (/land|lot|district|section|county|parcel|georgia|tract/i.test(p)) continue;
    if (!/^[A-Z0-9][A-Z0-9 .\-]{3,24}$/i.test(p)) continue;
    if ((p.match(/\d/g) ?? []).length < 4) continue;
    out.push(p);
  }
  return out;
}

/** The record's parcel notes already state an acreage ("33.34 +/- acres", "5.74± acres", "22 ac"). */
export function hasStatedAcres(t: string | null): boolean {
  return /\d[\d,]*(?:\.\d+)?\s*(?:\+\/-|±)?\s*(?:-\s*)?(?:gross\s+|net\s+)?(?:acres?|ac\b)/i.test(t ?? '');
}

/** Under 2 acres is a lot or a building pad, not the development tract. */
export const tractAcres = (a: number | null) => (a != null && a >= 2 ? a : null);

/**
 * Committed records: only ids in the shape of the record's county adapter
 * (no adapter → none). Land lots / districts are already gone (validParcelIds).
 */
export function committedParcelIds(municipalityName: string | null | undefined, ids: string[]): { ok: string[]; rejected: string[]; adapter: string | null } {
  const adapter = adapterFor(municipalityName);
  const valid = validParcelIds(ids);
  const ok = adapter ? valid.filter((id) => idMatchesAdapter(adapter, id)) : [];
  return { ok, rejected: ids.filter((id) => !ok.includes(id.replace(/\(\s*portion\s*\)/i, '').trim())), adapter: adapter?.label ?? null };
}

export function parcelLine(ids: string[], acres: number | null): string | null {
  if (ids.length === 0 && acres == null) return null;
  return [ids.length ? `Parcel IDs: ${ids.join(', ')}` : null, acres != null ? `approx ${acres} acres` : null]
    .filter(Boolean).join('; ');
}

export interface LocateSummary {
  classified: number;
  already_precise: number;
  asked: number;
  pins_placed: number;
  hints_improved: number;
  parcel_ids_found: number;
  moved_out_of_radius: number;
  guard_failed: number;
  nothing_found: number;
  errors: number;
  skipped_already_tried: number;
  gemini_cost_cents: number;
  geocode_cost_cents: number;
  details: Row[];
  /** Committed records that got new parcel ids (the parcel fetch runs on these). */
  committed_parcel_ids: string[];
  parcel_fetch?: ProjectFetchResult[];
}

const emptySummary = (): LocateSummary => ({
  classified: 0, already_precise: 0, asked: 0, pins_placed: 0, hints_improved: 0, parcel_ids_found: 0,
  moved_out_of_radius: 0, guard_failed: 0, nothing_found: 0, errors: 0, skipped_already_tried: 0,
  gemini_cost_cents: 0, geocode_cost_cents: 0, details: [], committed_parcel_ids: [],
});

/** Locate one record (staged or committed). Mutates `sum`. */
async function locateOne(
  supabase: Supa, r: Rec, keys: { gemini: string; geocode: string }, sum: LocateSummary,
): Promise<void> {
  const today = easternDate();
  const { data: geo0 } = await supabase.rpc('research_locate_geo', { p_kind: r.kind, p_id: r.id });
  const city: string | null = geo0?.muni_kind === 'city' ? geo0.muni_name : null;
  const county: string | null = geo0?.county ?? null;

  let g: GeminiOut | null = null;
  let err: string | null = null;
  try { g = await askGemini(buildPrompt(r, city, county), keys.gemini); } catch (e) { err = e instanceof Error ? e.message : String(e); }
  sum.asked++;
  sum.gemini_cost_cents += g?.cost_cents ?? 0;

  const a = g?.parsed ?? null;
  let geocodeCalls = 0;
  let outcome = 'nothing';
  let placed: { lat: number; lng: number; address: string; site_miles: number | null } | null = null;
  let movedToLeads = false;
  let newHint: string | null = null;
  const oldHint = r.location_description;
  let guardNote: string | null = null;
  let before: Row = null;

  try {
    if (!g) throw new Error(err ?? 'Gemini failed');

    // 1. A pin from the address or intersection — on a road the record names,
    //    when it names any.
    const roads = roadTokens(r.address, r.location_description);
    for (const cand of [a?.street_address, a?.intersection].filter(Boolean) as string[]) {
      if (!onNamedRoad(cand, roads)) {
        guardNote = `${cand} is not on the road our record names (${roads.join(', ')}); not used, may be a different project`;
        continue;
      }
      const q = withPlace(cand, city, county);
      const geo = await geocode(q, keys.geocode);
      geocodeCalls++;
      if (!isPrecise(geo)) continue;
      const { data: d } = await supabase.rpc('research_locate_geo', { p_kind: r.kind, p_id: r.id, p_lat: geo!.lat, p_lng: geo!.lng });
      if (d?.muni_miles != null && Number(d.muni_miles) > MAX_MUNI_MILES) {
        guardNote = `${geo!.formatted} is ${d.muni_miles} mi outside ${d.muni_name}; not used`;
        continue;
      }
      placed = { lat: geo!.lat, lng: geo!.lng, address: geo!.formatted, site_miles: d?.site_miles ?? null };
      const radius = d?.radius_miles != null ? Number(d.radius_miles) : null;
      if (r.kind === 'staged' && radius != null && placed.site_miles != null && placed.site_miles > radius && !r.lead_reason) {
        movedToLeads = true;
      }
      break;
    }

    // Every candidate rejected by a guard and no pin: the answer is probably
    // about a different project, so its hint / parcels / acreage aren't used either.
    const suspect = !placed && guardNote != null;

    // 2. Hint, if no pin — and only if it says something the record didn't.
    const hint = a && !suspect ? hintText(a) : null;
    if (!placed && hint && addsInformation(hint, [r.location_description, r.address, r.notes])) newHint = hint;

    // 3. Parcel IDs / acreage. Committed records: only ids in the county
    //    adapter's format (committedParcelIds).
    const known = new Set((r.parcel_numbers ?? []).map((p) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()));
    // More than 10 ids is a whole subdivision's lots, not the rezoning tract:
    // kept in notes, not handed to the parcel fetch.
    const allIds = suspect ? []
      : r.kind === 'committed' ? committedParcelIds(r.municipality?.name, a?.parcel_ids ?? []).ok
      : validParcelIds(a?.parcel_ids ?? []);
    const newIds = (allIds.length > 10 ? [] : allIds).filter((p) => !known.has(p.replace(/[^0-9a-z]/gi, '').toUpperCase()));
    const acres = suspect || hasStatedAcres(r.parcel_boundary_notes) ? null : tractAcres(a?.acreage ?? null);
    // Committed: acreage only alongside ids (it validates the fetched boundary).
    const pLine = r.kind === 'staged' || newIds.length ? parcelLine(newIds, acres) : null;
    if (newIds.length) sum.parcel_ids_found++;
    before = {
      location_description: r.location_description, notes: r.notes, parcel_boundary_notes: r.parcel_boundary_notes,
      parcel_numbers: r.parcel_numbers, parcel_fetch_status: r.parcel_fetch_status ?? null, lead_reason: r.lead_reason ?? null,
    };

    const head = `[Locate ${today} — Gemini web search]`;
    const found = [
      placed ? `Estimated location: ${placed.address}${a?.side_of_road ? ` (${a.side_of_road})` : ''}.` : null,
      a?.landmarks_directions && placed ? `Landmarks: ${a.landmarks_directions}.` : null,
      guardNote ? `Rejected: ${guardNote}.` : null,
      newIds.length ? `Parcel IDs: ${newIds.join(', ')}.` : null,
      a?.acreage != null && !suspect ? `Acreage (as found): ${a.acreage}.` : null,
      !placed && !hint && !newIds.length ? 'No location found.' : null,
    ].filter(Boolean).join(' ');
    let notes = appendNote(r.notes, `${head} ${found}\n${sourcesNote(a, g)}`.trim());
    if (newHint && oldHint?.trim()) notes = appendNote(notes, `[Previous location text, replaced by the pin hint] ${oldHint.trim()}`);

    if (r.kind === 'staged') {
      const upd: Row = { notes, locate_status: placed ? 'pin' : newHint ? 'hint' : 'nothing', locate_at: new Date().toISOString() };
      if (placed) Object.assign(upd, {
        located_lat: placed.lat, located_lng: placed.lng, located_address: placed.address,
        location_confidence: 'estimated',
      });
      if (newHint) upd.location_description = newHint;
      if (pLine) {
        upd.parcel_boundary_notes = [pLine, r.parcel_boundary_notes?.trim()].filter(Boolean).join(' | ');
        if (newIds.length) {
          upd.parcel_numbers = [...(r.parcel_numbers ?? []), ...newIds];
          upd.parcel_fetch_status = null; // new ids: let the parcel fetch try again
        }
      }
      if (movedToLeads) {
        upd.lead_reason = `Outside the ${geo0?.radius_miles ?? '?'}-mile radius: estimated location ${placed!.address} is ${placed!.site_miles} mi from the site`;
      }
      const { error } = await supabase.from('municipal_project_staging').update(upd).eq('id', r.id).eq('approval_state', 'pending');
      if (error) throw new Error(error.message);
    } else {
      if (placed) {
        const { data: res, error } = await supabase.rpc('set_municipal_project_estimated_pin', {
          p_id: r.id, p_lat: placed.lat, p_lng: placed.lng, p_located_address: placed.address,
          p_note: `${head} ${found}\n${sourcesNote(a, g)}`.trim(),
        });
        if (error) throw new Error(error.message);
        if (before) before.pin = res?.old ?? null;
        if (!res?.updated) { placed = null; outcome = 'nothing'; }
      } else {
        const upd: Row = { notes };
        if (newHint) upd.location_description = newHint;
        const { error } = await supabase.from('municipal_project').update(upd).eq('id', r.id);
        if (error) throw new Error(error.message);
      }
      if (pLine && newIds.length) {
        const { error } = await supabase.from('municipal_project').update({
          parcel_boundary_notes: [pLine, r.parcel_boundary_notes?.trim()].filter(Boolean).join(' | '),
          parcel_numbers: [...(r.parcel_numbers ?? []), ...newIds],
        }).eq('id', r.id);
        if (error) throw new Error(error.message);
        sum.committed_parcel_ids.push(r.id);
      }
    }

    outcome = placed ? 'pin' : newHint ? 'hint' : guardNote ? 'guard_failed' : newIds.length ? 'parcels' : 'nothing';
    if (placed) sum.pins_placed++;
    if (newHint) sum.hints_improved++;
    if (movedToLeads) sum.moved_out_of_radius++;
    if (outcome === 'guard_failed') sum.guard_failed++;
    if (outcome === 'nothing') sum.nothing_found++;
  } catch (e) {
    outcome = 'error';
    sum.errors++;
    err = `${err ?? ''} ${e instanceof Error ? e.message : String(e)}`.trim();
    if (r.kind === 'staged') {
      await supabase.from('municipal_project_staging').update({ locate_status: 'error', locate_at: new Date().toISOString() })
        .eq('id', r.id).eq('approval_state', 'pending');
    }
  }

  sum.geocode_cost_cents += geocodeCalls * CENTS_PER_GEOCODE;
  const detail = {
    kind: r.kind, id: r.id, name: r.project_name, outcome,
    old_hint: oldHint, new_hint: newHint, located_address: placed?.address ?? null,
    site_miles: placed?.site_miles ?? null, moved_to_leads: movedToLeads,
    parcel_ids: a?.parcel_ids ?? [], acreage: a?.acreage ?? null, guard: guardNote,
  };
  sum.details.push(detail);
  await supabase.from('research_location_estimate').insert({
    research_run_id: r.research_run_id, staging_id: r.kind === 'staged' ? r.id : null,
    municipal_project_id: r.kind === 'committed' ? r.id : null,
    project_name: r.project_name, model: MODEL,
    answer: g ? g.answer : err, parsed: a, sources: g?.sources ?? null,
    input_tokens: g?.input_tokens ?? null, output_tokens: g?.output_tokens ?? null,
    cost_cents: g?.cost_cents ?? 0, geocode_calls: geocodeCalls, geocode_cost_cents: geocodeCalls * CENTS_PER_GEOCODE,
    outcome, old_hint: oldHint, new_hint: newHint,
    new_lat: placed?.lat ?? null, new_lng: placed?.lng ?? null, located_address: placed?.address ?? null,
    site_miles: placed?.site_miles ?? null, moved_to_leads: movedToLeads,
    parcel_ids: a?.parcel_ids ?? null, acreage: a?.acreage ?? null, before,
  });
}

// ---------------------------------------------------------------------------
// Staged records (one run)
// ---------------------------------------------------------------------------

const STAGED_COLS = 'id, research_run_id, project_name, phase_label, builder_developer, address, location_description, parcel_boundary_notes, parcel_numbers, parcel_fetch_status, notes, source, lead_reason, geometry_source, location_precision, located_lat, locate_status, boundary_municipality(name, kind)';

/** Classify pending rows that have no location_precision yet. Returns the rows needing a locate. */
async function classifyRun(supabase: Supa, runId: string, geocodeKey: string, sum: LocateSummary): Promise<Row[]> {
  const { data: rows, error } = await supabase.from('municipal_project_staging')
    .select(STAGED_COLS).eq('research_run_id', runId).eq('approval_state', 'pending');
  if (error) throw new Error(`load staging: ${error.message}`);

  for (const r of rows ?? []) {
    if (r.location_precision) continue;
    let p: string;
    if (r.geometry_source) p = 'boundary';
    else if (!r.address?.trim()) p = 'no_address';
    else {
      try {
        const bm = r.boundary_municipality;
        const place = bm ? (bm.kind === 'county' ? bm.name : `${bm.name}`) : null;
        const g = await geocode(withPlace(r.address, place, null), geocodeKey);
        sum.geocode_cost_cents += CENTS_PER_GEOCODE;
        p = !g ? 'failed' : isPrecise(g) && !isRoadOnly(r.address) ? 'precise' : 'imprecise';
      } catch { p = 'failed'; }
    }
    sum.classified++;
    r.location_precision = p;
    await supabase.from('municipal_project_staging').update({ location_precision: p }).eq('id', r.id).eq('approval_state', 'pending');
  }
  return (rows ?? []).filter((r: Row) => {
    if (['boundary', 'precise'].includes(r.location_precision) || r.located_lat != null) { sum.already_precise++; return false; }
    return true;
  });
}

/**
 * Locate a run's pending records with no precise pin. Idempotent: a record with
 * an earlier locate attempt is skipped unless retryTried.
 */
export async function locateRun(
  supabase: Supa, runId: string, keys: { gemini: string; geocode: string }, opts: { retryTried?: boolean } = {},
): Promise<LocateSummary> {
  const sum = emptySummary();
  const todo = await classifyRun(supabase, runId, keys.geocode, sum);
  const ask = todo.filter((r) => {
    if (!opts.retryTried && r.locate_status && r.locate_status !== 'error') { sum.skipped_already_tried++; return false; }
    return true;
  });
  await pool(ask, CONCURRENCY, (r) => locateOne(supabase, { ...r, kind: 'staged' }, keys, sum));

  const { data: all } = await supabase.from('research_location_estimate')
    .select('cost_cents, geocode_cost_cents').eq('research_run_id', runId);
  const total = (all ?? []).reduce((s: number, x: Row) => s + Number(x.cost_cents ?? 0) + Number(x.geocode_cost_cents ?? 0), 0);
  await supabase.from('research_run').update({
    locate_calls: (all ?? []).length,
    locate_cost_cents: Math.round(total * 10_000) / 10_000,
  }).eq('id', runId);

  sum.gemini_cost_cents = Math.round(sum.gemini_cost_cents * 100) / 100;
  sum.geocode_cost_cents = Math.round(sum.geocode_cost_cents * 100) / 100;
  return sum;
}

// ---------------------------------------------------------------------------
// Committed records (one-off pass)
// ---------------------------------------------------------------------------

/**
 * Committed municipal_project records with no pin, or an address-geocode pin
 * whose address now geocodes imprecisely (or is only a road + city). Pins and
 * hints only; never moved; never over a boundary or a hand-placed pin.
 */
export async function locateCommitted(
  supabase: Supa, keys: { gemini: string; geocode: string }, opts: { dryRun?: boolean } = {},
): Promise<LocateSummary & { targets: Row[] }> {
  const sum = emptySummary();
  const rows: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('municipal_project')
      .select('id, project_name, phase_label, builder_developer, address, location_description, parcel_boundary_notes, parcel_numbers, notes, source, centroid_source, geometry_source, location_confidence, municipality(name)')
      .is('geometry', null).range(off, off + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const { data: tried } = await supabase.from('research_location_estimate')
    .select('municipal_project_id').not('municipal_project_id', 'is', null).neq('outcome', 'error');
  const triedIds = new Set((tried ?? []).map((t: Row) => t.municipal_project_id));

  const targets: Row[] = [];
  for (const r of rows) {
    if (r.centroid_source === 'manual_pin' || r.centroid_source === 'polygon' || r.location_confidence) continue;
    if (triedIds.has(r.id)) { sum.skipped_already_tried++; continue; }
    if (r.centroid_source == null) { targets.push({ ...r, why: 'no pin' }); continue; }
    // address_geocode pin: re-check the address the pin came from.
    let precise = false;
    try {
      const g = r.address?.trim() ? await geocode(withPlace(r.address, r.municipality?.name ?? null, null), keys.geocode) : null;
      sum.geocode_cost_cents += CENTS_PER_GEOCODE;
      precise = isPrecise(g) && !isRoadOnly(r.address);
      if (!precise) targets.push({ ...r, why: `imprecise pin (${g ? g.location_type : 'no geocode'}${isRoadOnly(r.address) ? ', road + city only' : ''})` });
    } catch { /* leave it alone on a geocode error */ }
    sum.classified++;
    if (precise) sum.already_precise++;
  }
  if (!opts.dryRun) {
    await pool(targets, CONCURRENCY, (r) => locateOne(supabase, { ...r, kind: 'committed', research_run_id: null }, keys, sum));
    if (sum.committed_parcel_ids.length) sum.parcel_fetch = await fetchBoundariesForProjects(supabase, sum.committed_parcel_ids);
  }
  sum.gemini_cost_cents = Math.round(sum.gemini_cost_cents * 100) / 100;
  sum.geocode_cost_cents = Math.round(sum.geocode_cost_cents * 100) / 100;
  return { ...sum, targets: targets.map((t) => ({ id: t.id, name: t.project_name, why: t.why, address: t.address })) };
}
