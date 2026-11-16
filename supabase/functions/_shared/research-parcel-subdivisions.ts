/**
 * Parcel subdivisions pass: built-out neighborhoods from the county parcel layer.
 *
 *   1. Residential parcels within the site radius, from every parcel layer with a
 *      subdivision field (subdivision-layers.ts), grouped by subdivision name.
 *      Blank / non-residential names and groups under 25 parcels are skipped.
 *   2. Each group is unioned into one polygon and looked up in OVIS (name, or a
 *      record's pin / boundary inside the polygon). A match is never re-staged:
 *      when it has fewer units than the parcel count (beyond 5%) it gets a
 *      pending replace suggestion; otherwise it's logged.
 *   3. Not in OVIS → Gemini (live search): "When was the <subdivision>
 *      neighborhood in <city>, GA built?" Listing / aggregator pages are not
 *      sources. Then:
 *        build-out (or majority completion) 2020+  → staged Recently Completed
 *        still building, no majority year          → staged Under Construction
 *        before 2020                               → established_subdivision
 *                                                    (own map layer, no totals)
 *        no sourced year                           → logged only
 *      Staged rows: units = parcel count (reported), source "<layer>, N
 *      parcels", polygon = union of the parcels.
 *   4. Post-run: name dedupe → distance check.
 *
 * Doc: docs/MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md
 * Gemini grounding: https://ai.google.dev/gemini-api/docs/google-search
 */

import { isListingUrl, resolveUrl } from './source-rules.ts';
import { notifyResearchTelegram } from './research-telegram.ts';
import {
  fetchSubdivisionParcels, groupSubdivisions, layersFor, type ParcelFeature, type SubdivisionGroup,
} from './subdivision-layers.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;
// deno-lint-ignore no-explicit-any
type Row = any;

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CENTS_PER_INPUT_TOKEN = 30 / 1_000_000;
const CENTS_PER_OUTPUT_TOKEN = 250 / 1_000_000;
const CENTS_PER_GROUNDED_PROMPT = 3.5;
const CALL_TIMEOUT_MS = 120_000;
const SINCE_YEAR = 2020;
export const MIN_PARCELS = 25;
const CONCURRENCY = 8;
const EST_CALL_CENTS = 4.5;
/** Still building counts as Under Construction only if first homes came 2015 or later. */
export const BUILDING_FIRST_YEAR_MIN = 2015;

export interface BuiltAnswer {
  first_homes_year: number | null;
  built_out_year: number | null;
  majority_year: number | null;
  still_building: boolean | null;
  evidence: string | null;
  sources: string[];          // resolved, listing pages removed
  listing_only: boolean;      // had sources, all of them listing pages
  searched: boolean;
  cost: number;
}

export type BuiltClass = 'recent' | 'building' | 'established' | 'unknown';

/** The year that decides: build-out, else majority completion. */
export function classify(
  a: Pick<BuiltAnswer, 'built_out_year' | 'majority_year' | 'still_building' | 'sources' | 'first_homes_year'>,
): { cls: BuiltClass; year: number | null } {
  if (a.sources.length === 0) return { cls: 'unknown', year: null };
  const key = a.built_out_year ?? a.majority_year;
  if (key != null) return { cls: key >= SINCE_YEAR ? 'recent' : 'established', year: key };
  // "Still building" with first homes long before 2020 is usually resales or a
  // late phase, not a pipeline of N new homes: logged for a look, not staged.
  if (a.still_building && (a.first_homes_year == null || a.first_homes_year >= BUILDING_FIRST_YEAR_MIN)) {
    return { cls: 'building', year: null };
  }
  return { cls: 'unknown', year: null };
}

export function builtPrompt(name: string, city: string): string {
  return `When was the ${name} neighborhood in ${city}, GA built? Year first homes were completed and year built out. Cite sources.

Rules:
- Search the web before answering. Good sources: the builder or developer, the HOA, the city or county (plats, permits, minutes), news articles, Wikipedia.
- Listing or aggregator pages are NOT sources: Zillow, Redfin, Realtor.com, Homes.com, Trulia, NewHomeSource, Neighborhoods.com, Niche, Movoto, Compass, apartment or rental listing sites. Do not cite them.
- built_out_year = the year the last homes were completed (sold out / built out). If homes are still being built or sold, still_building = true and built_out_year = null.
- majority_completed_year = the year by which most of the homes were completed, if a source supports it; else null.
- Never guess a year. null when no source states or clearly implies it.

Reply with ONLY a JSON object, no prose around it:
{"first_homes_year": <int or null>, "built_out_year": <int or null>, "majority_completed_year": <int or null>, "still_building": <true | false | null>, "evidence": "<one line: what the sources say>", "sources": ["<url>"]}`;
}

const yearOf = (x: unknown) => {
  const n = Number(String(x ?? '').match(/\d{4}/)?.[0]);
  return Number.isInteger(n) && n >= 1850 && n <= 2100 ? n : null;
};

export async function askBuilt(name: string, city: string, apiKey: string, urlCache: Map<string, string | null>): Promise<BuiltAnswer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let data: Row;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text: builtPrompt(name, city) }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const u = data.usageMetadata ?? {};
  const cost = ((u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0)) * CENTS_PER_INPUT_TOKEN
    + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * CENTS_PER_OUTPUT_TOKEN + CENTS_PER_GROUNDED_PROMPT;
  const cand = data.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? []).map((p: Row) => p.text ?? '').join('').trim();
  const searched = (cand?.groundingMetadata?.webSearchQueries ?? []).length > 0
    || (cand?.groundingMetadata?.groundingChunks ?? []).length > 0;

  let j: Row = {};
  try { j = JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch { j = {}; }
  // One subdivision per call, so the grounding citations are this answer's sources too.
  const chunkUris = ((cand?.groundingMetadata?.groundingChunks ?? []) as Row[]).map((c) => c.web?.uri).filter(Boolean) as string[];
  const raw = [...(Array.isArray(j.sources) ? j.sources : []), ...chunkUris]
    .filter((s: unknown) => typeof s === 'string' && /^https?:\/\//.test(s as string));
  const resolved = (await Promise.all(raw.map((s: string) => resolveUrl(s, urlCache)))).filter(Boolean) as string[];
  const sources = [...new Set(resolved.filter((s) => !isListingUrl(s)))];
  const ev = typeof j.evidence === 'string' && j.evidence.trim() ? j.evidence.trim() : null;
  return {
    first_homes_year: yearOf(j.first_homes_year),
    built_out_year: yearOf(j.built_out_year),
    majority_year: yearOf(j.majority_completed_year),
    still_building: typeof j.still_building === 'boolean' ? j.still_building : null,
    evidence: ev,
    // Ungrounded answers carry no usable source.
    sources: searched ? sources : [],
    listing_only: resolved.length > 0 && sources.length === 0,
    searched,
    cost,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const easternDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

async function siteOf(supabase: Supa, siteId: string): Promise<{ lat: number; lng: number; name: string }> {
  const { data, error } = await supabase.from('site_submit')
    .select('site_submit_name, verified_latitude, verified_longitude, property(verified_latitude, verified_longitude, latitude, longitude)')
    .eq('id', siteId).single();
  if (error) throw new Error(`site: ${error.message}`);
  const p = data.property ?? {};
  const lat = data.verified_latitude ?? p.verified_latitude ?? p.latitude;
  const lng = data.verified_longitude ?? p.verified_longitude ?? p.longitude;
  if (lat == null || lng == null) throw new Error('site has no coordinates');
  return { lat: Number(lat), lng: Number(lng), name: data.site_submit_name };
}

export async function previewParcelSubdivisions(supabase: Supa, siteId: string, radiusMiles: number) {
  const { data: munis, error } = await supabase.rpc('get_municipalities_in_radius_for_site', { p_site_id: siteId, p_radius_miles: radiusMiles });
  if (error) throw new Error(error.message);
  const layers = layersFor((munis ?? []).map((m: Row) => m.name));
  return {
    municipalities: (munis ?? []).map((m: Row) => m.name),
    layers: layers.map((l) => l.label),
    no_layer: (munis ?? []).map((m: Row) => m.name).filter((n: string) => !layers.some((l) => l.matches(n))),
    cents_per_subdivision: EST_CALL_CENTS,
    basis: 'one Gemini search (~4.5¢) per subdivision of 25+ parcels not already in OVIS; the count is known only once the parcel layer answers',
  };
}

export async function createParcelRun(supabase: Supa, a: { siteId: string; radiusMiles: number; triggeredBy?: string | null }) {
  const { data: munis, error: mErr } = await supabase.rpc('get_municipalities_in_radius_for_site', { p_site_id: a.siteId, p_radius_miles: a.radiusMiles });
  if (mErr) throw new Error(mErr.message);
  const { data, error } = await supabase.from('research_run').insert({
    site_submit_id: a.siteId, radius_miles: a.radiusMiles, research_mode: 'quick', research_scope: 'parcel_subdivisions',
    state: 'running', triggered_by: a.triggeredBy ?? null,
    recent_muni_ids: (munis ?? []).map((m: Row) => m.boundary_municipality_id),
  }).select('id').single();
  if (error) throw new Error(`create run: ${error.message}`);
  return { runId: data.id as string, municipalities: (munis ?? []).map((m: Row) => m.name as string) };
}

export interface SubdivisionResult {
  name: string;
  parcels: number;
  city: string | null;
  lat: number | null;
  lng: number | null;
  distance_mi: number | null;
  outcome: 'staged_recent' | 'staged_building' | 'established' | 'unknown' | 'in_ovis_replace' | 'in_ovis' | 'error';
  year: number | null;
  first_homes_year: number | null;
  detail: string;
  matches: { kind: string; name: string; units: number | null; how: string }[];
}

export interface ParcelRunSummary {
  research_run_id: string;
  layers_ok: string[];
  layers_failed: { layer: string; error: string }[];
  parcels: number;
  skipped: { name: string; parcels: number; reason: string }[];
  results: SubdivisionResult[];
  gemini_calls: number;
  cost_cents: number;
  deduped: number;
  outside_radius: number;
  errors: string[];
}

export async function processParcelRun(
  supabase: Supa, runId: string, keys: { gemini: string }, opts: { notify?: boolean; deadlineMs?: number } = {},
): Promise<ParcelRunSummary> {
  const sum: ParcelRunSummary = {
    research_run_id: runId, layers_ok: [], layers_failed: [], parcels: 0, skipped: [], results: [],
    gemini_calls: 0, cost_cents: 0, deduped: 0, outside_radius: 0, errors: [],
  };
  const today = easternDate();
  const { data: run, error: rErr } = await supabase.from('research_run')
    .select('site_submit_id, radius_miles, recent_muni_ids').eq('id', runId).single();
  if (rErr) throw new Error(rErr.message);
  const site = await siteOf(supabase, run.site_submit_id);
  const { data: munis } = await supabase.from('boundary_municipality').select('name').in('id', run.recent_muni_ids ?? []);
  const layers = layersFor((munis ?? []).map((m: Row) => m.name));
  const { data: stages } = await supabase.from('project_stage').select('id, name').in('name', ['Recently Completed', 'Under Construction']);
  const stageId = (n: string) => (stages ?? []).find((s: Row) => s.name === n)?.id ?? null;

  // 1. Parcels from every layer that answers.
  const feats: ParcelFeature[] = [];
  await Promise.all(layers.map(async (l) => {
    try {
      const f = await fetchSubdivisionParcels(l, site.lat, site.lng, run.radius_miles);
      feats.push(...f);
      sum.layers_ok.push(`${l.label} (${f.length} parcels)`);
    } catch (e) {
      sum.layers_failed.push({ layer: l.label, error: e instanceof Error ? e.message : String(e) });
    }
  }));
  const { groups, skipped } = groupSubdivisions(feats, MIN_PARCELS);
  sum.skipped = skipped;
  sum.parcels = groups.reduce((n, g) => n + g.parcels.length, 0);

  // Already in the established layer (an earlier run)? Not asked again.
  const { data: est } = await supabase.from('established_subdivision').select('subdivision_key, name, county, year_built_out, year_majority');
  const urlCache = new Map<string, string | null>();
  const logs: Row[] = [];
  const county = layers[0]?.county ?? 'unknown';

  // 2a. Union + OVIS lookup for every group first.
  const lookups = await pool(groups, CONCURRENCY, async (g) => {
    try {
      const { data, error } = await supabase.rpc('research_parcel_subdivision_lookup', {
        p_run_id: runId, p_name: g.name, p_parts: g.parcels.map((p) => p.geometry),
      });
      if (error) throw new Error(error.message);
      return { lk: data as Row, err: null as string | null };
    } catch (e) {
      return { lk: null, err: `lookup: ${e instanceof Error ? e.message : String(e)}` };
    }
  });
  // A record matched BY NAME belongs to that subdivision: drop it from other
  // groups' spatial matches (a misplaced pin can sit inside a neighbor). Among
  // a group's matches: name first, then the closest unit count.
  const claimed = new Set<string>();
  for (const l of lookups) for (const m of (l.lk?.matches ?? []) as Row[]) if (m.how === 'name') claimed.add(m.id);
  lookups.forEach((l, i) => {
    if (!l.lk) return;
    const n = groups[i].parcels.length;
    l.lk.matches = ((l.lk.matches ?? []) as Row[])
      .filter((m) => m.how === 'name' || !claimed.has(m.id))
      .sort((a, b) => Number(b.how === 'name') - Number(a.how === 'name')
        || Math.abs((a.units ?? 0) - n) - Math.abs((b.units ?? 0) - n));
  });
  const polygonJobs: { id: string; name: string; geojson: unknown; parcels: string[] }[] = [];

  const handle = async (gi: number): Promise<SubdivisionResult> => {
    const g = groups[gi];
    const n = g.parcels.length;
    const sourceText = `${g.layers.join(' + ')}, ${n} parcels`;
    const base: SubdivisionResult = { name: g.name, parcels: n, city: g.city, lat: null, lng: null, distance_mi: null,
      outcome: 'error', year: null, first_homes_year: null, detail: '', matches: [] };
    try {
      if (opts.deadlineMs && Date.now() > opts.deadlineMs) return { ...base, detail: 'out of time — run again to finish' };
      const { lk, err } = lookups[gi];
      if (!lk) throw new Error(err ?? 'lookup failed');
      const r: SubdivisionResult = { ...base, lat: lk.lat, lng: lk.lng, distance_mi: lk.distance_mi, matches: lk.matches ?? [] };

      // In OVIS → replace suggestion or log. Never re-staged.
      if (r.matches.length) {
        const m = (lk.matches as Row[])[0];
        const ovis = m.units == null ? null : Number(m.units);
        const higher = ovis == null || n > ovis * 1.05;
        logs.push({
          research_run_id: runId, name: g.name, basis: 'parcels', parcel_count: n,
          outcome: higher ? 'replace_suggested' : n < ovis! ? 'dropped_lower' : 'dropped_equal',
          state: higher ? 'pending' : 'logged',
          known_kind: m.kind, known_project_id: m.kind === 'committed' ? m.id : null,
          known_staging_id: m.kind === 'staged' ? m.id : null, known_name: m.name,
          ovis_units: ovis, gemini_units: n, gemini_source: sourceText, year_completed: null,
          detail: `matched by ${m.how}${r.matches.length > 1 ? `; also inside: ${(lk.matches as Row[]).slice(1).map((x) => `${x.name} (${x.units ?? '—'})`).join(', ')}` : ''}`,
        });
        return { ...r, outcome: higher ? 'in_ovis_replace' : 'in_ovis',
                 detail: `${m.name} (${m.kind}, ${ovis ?? 'no'} units, matched by ${m.how})` };
      }

      const known = (est ?? []).find((e: Row) => e.county === county && e.name.toLowerCase() === g.name.toLowerCase());
      if (known) {
        return { ...r, outcome: 'established', year: known.year_built_out ?? known.year_majority, detail: 'already in the established layer' };
      }

      const city = g.city ? g.city.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase()) : 'Henry County';
      const a = await askBuilt(g.name, city, keys.gemini, urlCache);
      sum.gemini_calls++;
      sum.cost_cents += a.cost;
      const { cls, year } = classify(a);
      const years = `first homes ${a.first_homes_year ?? '?'}, built out ${a.built_out_year ?? (a.still_building ? 'still building' : '?')}`
        + `${a.majority_year ? `, mostly complete by ${a.majority_year}` : ''}`;
      const out = { ...r, year, first_homes_year: a.first_homes_year };

      if (cls === 'unknown') {
        logs.push({ research_run_id: runId, name: g.name, basis: 'parcels', parcel_count: n, outcome: 'unknown_year', state: 'logged',
                    gemini_units: n, gemini_source: a.sources[0] ?? null,
                    detail: a.listing_only ? `only listing sources (${years})` : !a.searched ? 'Gemini did not search' : `${years}${a.evidence ? ` — ${a.evidence}` : ''}` });
        return { ...out, outcome: 'unknown', detail: a.listing_only ? `only listing sources: ${years}` : `no sourced year: ${years}` };
      }

      if (cls === 'established') {
        const { error: uErr } = await supabase.rpc('upsert_established_subdivision', { p: {
          county, name: g.name, source_layers: g.layers, boundary_municipality_id: lk.boundary_municipality_id, city,
          parcel_count: n, year_first_homes: a.first_homes_year, year_built_out: a.built_out_year, year_majority: a.majority_year,
          basis_detail: `${years}. ${a.evidence ?? ''}`.trim(), sources: a.sources, geojson: lk.geojson, research_run_id: runId,
        } });
        if (uErr) throw new Error(`established: ${uErr.message}`);
        logs.push({ research_run_id: runId, name: g.name, basis: 'parcels', parcel_count: n, outcome: 'established', state: 'logged',
                    gemini_units: n, gemini_source: a.sources[0], year_completed: year, detail: years });
        return { ...out, outcome: 'established', detail: years };
      }

      const recent = cls === 'recent';
      const { data: ins, error: sErr } = await supabase.from('municipal_project_staging').insert({
        research_run_id: runId,
        boundary_municipality_id: lk.boundary_municipality_id,
        project_name: g.name,
        address: null,
        location_description: `Subdivision "${g.key}" in the ${g.layers.join(' + ')} (${n} parcels, ${lk.acres} ac)`,
        total_housing_units: n,
        units_confidence: 'reported',
        status_stage_id: stageId(recent ? 'Recently Completed' : 'Under Construction'),
        year_completed: recent ? year : null,
        discovery_source: 'parcel_layer',
        discovery_source_raw: 'parcel_layer',
        source: `${sourceText} ; ${a.sources.join(' ; ')}`,
        notes: `[Parcel subdivisions ${today}] ${sourceText}. Gemini web search: ${years}.${a.evidence ? ` ${a.evidence}` : ''}`
          + ` Units = parcel count (may include a few common-area lots).`,
        phase_label: '',
      }).select('id').single();
      if (sErr) throw new Error(`stage: ${sErr.message}`);
      // Set after the run leaves 'running' (the staging guard refuses edits before).
      polygonJobs.push({ id: ins.id, name: g.name, geojson: lk.geojson, parcels: g.parcels.map((p) => p.parcelNo) });
      logs.push({ research_run_id: runId, name: g.name, basis: 'parcels', parcel_count: n, outcome: 'staged', state: 'logged',
                  gemini_units: n, gemini_source: a.sources[0], year_completed: year, detail: `${recent ? 'Recently Completed' : 'Under Construction'}: ${years}` });
      return { ...out, outcome: recent ? 'staged_recent' : 'staged_building', detail: years };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sum.errors.push(`${g.name}: ${msg}`);
      return { ...base, detail: msg };
    }
  };

  sum.results = await pool(groups.map((_, i) => i), CONCURRENCY, handle);

  if (logs.length) {
    const cols = ['research_run_id', 'name', 'basis', 'parcel_count', 'outcome', 'state', 'known_kind', 'known_project_id',
      'known_staging_id', 'known_name', 'ovis_units', 'gemini_units', 'gemini_source', 'year_completed', 'detail'];
    const { error } = await supabase.from('research_recent_log')
      .insert(logs.map((l) => Object.fromEntries(cols.map((c) => [c, l[c] ?? null]))));
    if (error) sum.errors.push(`log: ${error.message}`);
  }
  await supabase.from('research_run').update({
    state: 'awaiting_review', completed_at: new Date().toISOString(),
    recent_calls: sum.gemini_calls, recent_cost_cents: Math.round(sum.cost_cents * 10_000) / 10_000,
  }).eq('id', runId);

  // Polygon = union of the subdivision's parcels.
  for (const j of polygonJobs) {
    const { error } = await supabase.rpc('set_staging_polygon_from_parcels', {
      p_id: j.id, p_parts: [j.geojson], p_parcels: j.parcels, p_missing: [],
    });
    if (error) sum.errors.push(`${j.name} polygon: ${error.message}`);
  }

  try {
    const { data, error } = await supabase.rpc('research_auto_dedupe_by_name', { p_run_ids: [runId], p_dry_run: false });
    if (error) throw new Error(error.message);
    sum.deduped = ['rejected_no_count', 'rejected_equal_count', 'rejected_within_5pct', 'rejected_same_address']
      .reduce((n, k) => n + ((data as Row)?.[k]?.length ?? 0), 0);
  } catch (e) { sum.errors.push(`dedupe: ${e instanceof Error ? e.message : String(e)}`); }
  try {
    const { data, error } = await supabase.rpc('research_distance_check', { p_run_ids: [runId] });
    if (error) throw new Error(error.message);
    sum.outside_radius = (data ?? []).length;
  } catch (e) { sum.errors.push(`distance check: ${e instanceof Error ? e.message : String(e)}`); }
  await supabase.from('research_run').update({ post_run_done_at: new Date().toISOString() }).eq('id', runId);
  sum.cost_cents = Math.round(sum.cost_cents * 100) / 100;

  if (opts.notify !== false) {
    const c = (o: SubdivisionResult['outcome']) => sum.results.filter((r) => r.outcome === o);
    const units = (rs: SubdivisionResult[]) => rs.reduce((n, r) => n + r.parcels, 0).toLocaleString('en-US');
    await notifyResearchTelegram([
      `Parcel subdivisions — ${site.name}`,
      `🧱 ${sum.results.length} subdivisions (${sum.parcels.toLocaleString('en-US')} parcels)`,
      `🏘 ${c('staged_recent').length} recently completed · ${units(c('staged_recent'))} units; 🏗 ${c('staged_building').length} still building · ${units(c('staged_building'))}`,
      `📜 ${c('established').length} established (pre-2020) · ${c('unknown').length} no sourced year · ${c('in_ovis').length + c('in_ovis_replace').length} already in OVIS (${c('in_ovis_replace').length} replace suggestions)`,
      ...(sum.layers_failed.length ? [`⚠️ no answer: ${sum.layers_failed.map((l) => l.layer).join(', ')}`] : []),
      `$${(sum.cost_cents / 100).toFixed(2)}`,
    ].join('\n'));
  }
  return sum;
}
