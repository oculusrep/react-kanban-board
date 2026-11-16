/**
 * "Recently built" pass: residential communities (25+ homes/units) completed
 * since April 2020 (the 2020 Census), per municipality in the site's radius.
 * Purpose: capture neighborhoods built since the Census as NEW Recently
 * Completed records — not to validate existing records.
 * Run by OVIS with Gemini (live Google search), not by the research agent.
 *
 *   1. One Gemini call per municipality in the radius.
 *   2. Each community is looked up in OVIS (research_recent_lookup) BEFORE
 *      anything is staged:
 *        - not in OVIS → staged as a new Recently Completed record, but only
 *          with real completion evidence (sold out / closeout, CO, final-phase
 *          plat recorded, lease-up). Without it → logged, not staged.
 *        - in OVIS, Gemini count > OVIS count by more than 5% (or OVIS has
 *          none) → a pending "replace" suggestion (research_recent_log), applied
 *          only by one click. Never changed automatically.
 *        - in OVIS, equal / lower / no Gemini count → logged only.
 *      A count is used only when its source is not a listing or aggregator
 *      page (Zillow, Redfin, Apartments.com, NewHomeSource, …). Gemini's
 *      grounding redirect links are resolved to the real URL to check that.
 *   3. Post-run on the staged records: name dedupe → locate → dedupe →
 *      parcel fetch → distance check (outside radius → lead).
 *
 * Triggers: the "Include recently built (since 2020)" checkbox on research /
 * sweep confirm (once per sweep), and the "Recently built only" button.
 * Doc: docs/MARKET_RESEARCH_RECENTLY_BUILT.md
 * Gemini grounding: https://ai.google.dev/gemini-api/docs/google-search
 */

import { locateRun } from './research-locate.ts';
import { fetchBoundariesForRuns } from './research-parcel-fetch.ts';
import { notifyResearchTelegram, sendSweepReadyIfDone } from './research-telegram.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;
// deno-lint-ignore no-explicit-any
type Row = any;

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CENTS_PER_INPUT_TOKEN = 30 / 1_000_000;
const CENTS_PER_OUTPUT_TOKEN = 250 / 1_000_000;
const CENTS_PER_GROUNDED_PROMPT = 3.5; // upper bound: charged on every call
const CALL_TIMEOUT_MS = 120_000;
// Since the 2020 Census (April 1, 2020). A 2020 completion with no month is kept.
const SINCE_YEAR = 2020;
const SINCE_MONTH = 4;
const MIN_UNITS = 25;
/** Fallback estimates for the preview, until past runs give real averages. */
const EST_SEARCH_CENTS = 5;
const EST_LOCATE_CENTS = 4.5;

export interface Muni { boundary_municipality_id: string; kind: string; name: string; distance_mi: number }

export async function municipalitiesFor(supabase: Supa, siteId: string, radiusMiles: number): Promise<Muni[]> {
  const { data, error } = await supabase.rpc('get_municipalities_in_radius_for_site', {
    p_site_id: siteId, p_radius_miles: radiusMiles,
  });
  if (error) throw new Error(`municipalities in radius: ${error.message}`);
  return data ?? [];
}

/** Preview: municipalities and an estimated cost (search is per municipality; locating depends on what comes back). */
export async function previewRecent(supabase: Supa, siteId: string, radiusMiles: number) {
  const munis = await municipalitiesFor(supabase, siteId, radiusMiles);
  const { data: hist } = await supabase.from('research_run')
    .select('recent_calls, recent_cost_cents, locate_calls, locate_cost_cents')
    .eq('research_scope', 'recent_built').not('recent_calls', 'is', null).limit(50);
  const calls = (hist ?? []).reduce((n: number, h: Row) => n + Number(h.recent_calls ?? 0), 0);
  const searchCents = calls ? (hist ?? []).reduce((n: number, h: Row) => n + Number(h.recent_cost_cents ?? 0), 0) / calls : EST_SEARCH_CENTS;
  const locCalls = (hist ?? []).reduce((n: number, h: Row) => n + Number(h.locate_calls ?? 0), 0);
  const locateCents = locCalls ? (hist ?? []).reduce((n: number, h: Row) => n + Number(h.locate_cost_cents ?? 0), 0) / locCalls : EST_LOCATE_CENTS;
  // Records needing a locate, per municipality: from history, else a guess of 4.
  const locPerMuni = calls ? locCalls / calls : 4;
  const search = munis.length * searchCents;
  const locate = munis.length * locPerMuni * locateCents;
  return {
    municipalities: munis.map((m) => ({ id: m.boundary_municipality_id, name: m.name, kind: m.kind, distance_mi: m.distance_mi })),
    search_calls: munis.length,
    search_cents_each: Math.round(searchCents * 100) / 100,
    est_search_cents: Math.round(search * 100) / 100,
    est_locate_cents: Math.round(locate * 100) / 100,
    est_total_cents: Math.round((search + locate) * 100) / 100,
    basis: calls ? `averages from ${calls} earlier searches` : 'first run: ~5¢ per search, ~4 locates per municipality at ~4.5¢',
  };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

interface Community {
  name: string;
  builder: string | null;
  year_completed: number | null;
  month_completed: number | null;
  evidence: string | null;          // one of EVIDENCE, else null
  evidence_detail: string | null;
  evidence_source: string | null;
  total_units: number | null;
  units_source: string | null;
  address: string | null;
  intersection: string | null;
  sources: string[];
  type: string | null;
}

function prompt(m: Muni): string {
  const place = m.kind === 'county' ? `unincorporated ${m.name}` : m.name;
  return `List residential communities of ${MIN_UNITS}+ homes or units in ${place}, GA completed since April 2020 (after the 2020 Census). For each: name, builder, when it was completed, total homes/units, street address or nearest intersection, and the evidence that it is complete. Cite a source for each.

Rules:
- Include single-family subdivisions, townhome communities and apartment complexes.
- Completed means real evidence, one of: sold out / builder closeout; certificate of occupancy for the final building; final-phase plat recorded; apartments in lease-up or fully leased. "Now selling", "coming soon", groundbreaking, zoning or plat approval for an earlier phase, or street/utility work are NOT completion — skip those communities.
- ${m.kind === 'county' ? `Only communities outside city limits (unincorporated ${m.name}).` : `Only communities in or immediately around ${m.name}.`}
- total_units only when a source states the community's total; otherwise null. Never estimate. Listing or aggregator pages (Zillow, Redfin, Realtor.com, Homes.com, Trulia, Apartments.com, NewHomeSource, Livabl, rental listing sites) never count as a total-units source. units_source = the URL that states the total.
- completed = "YYYY-MM" when the month is known, else "YYYY".
- street_address needs a house number; intersection is two named roads. null when unknown.
- Every community needs at least one source URL.

Reply with ONLY a JSON object, no prose around it:
{"communities": [{"name": "<name>", "builder": <string or null>, "completed": "<YYYY-MM or YYYY or null>", "completion_evidence": "<sold_out | closeout | certificate_of_occupancy | final_plat_recorded | lease_up | none>", "evidence_detail": "<one line: what the source says>", "evidence_source": <url or null>, "total_units": <integer or null>, "units_source": <url or null>, "street_address": <string or null>, "intersection": <string or null>, "type": "<single-family | townhomes | apartments | mixed>", "sources": ["<url>"]}]}`;
}

async function askGemini(text: string, apiKey: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let data: Row;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const u = data.usageMetadata ?? {};
  const input = (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0);
  const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  const cost = input * CENTS_PER_INPUT_TOKEN + output * CENTS_PER_OUTPUT_TOKEN + CENTS_PER_GROUNDED_PROMPT;
  const cand = data.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? []).map((p: Row) => p.text ?? '').join('').trim();
  const chunks = ((cand?.groundingMetadata?.groundingChunks ?? []) as Row[]).map((c) => c.web).filter(Boolean)
    .map((w: Row) => ({ title: String(w.title ?? ''), uri: String(w.uri ?? '') }));
  const searched = (cand?.groundingMetadata?.webSearchQueries ?? []).length > 0;

  const str = (x: unknown) => (typeof x === 'string' && x.trim() && !/^(null|none|unknown|n\/a)$/i.test(x.trim()) ? x.trim() : null);
  const list: Community[] = [];
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      for (const c of JSON.parse(json).communities ?? []) {
        const name = str(c?.name);
        if (!name) continue;
        const units = Number(c.total_units);
        const ym = String(c.completed ?? c.year_completed ?? '').match(/^(\d{4})(?:-(\d{1,2}))?/);
        const year = ym ? Number(ym[1]) : NaN;
        const month = ym?.[2] ? Number(ym[2]) : null;
        const ev = str(c.completion_evidence)?.toLowerCase().replace(/[\s-]+/g, '_') ?? null;
        const sources = (Array.isArray(c.sources) ? c.sources : []).map(str).filter(Boolean) as string[];
        list.push({
          name,
          builder: str(c.builder),
          year_completed: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : null,
          month_completed: month && month >= 1 && month <= 12 ? month : null,
          evidence: ev && EVIDENCE.has(ev) ? ev : null,
          evidence_detail: str(c.evidence_detail),
          evidence_source: str(c.evidence_source),
          total_units: c.total_units != null && Number.isInteger(units) && units > 0 ? units : null,
          units_source: str(c.units_source),
          address: str(c.street_address),
          intersection: str(c.intersection),
          sources,
          type: str(c.type),
        });
      }
    } catch { /* unparseable → nothing */ }
  }
  // Ungrounded → nothing. Each community needs its own source.
  const grounded = chunks.length > 0 || searched;
  const kept = grounded ? list.filter((c) => c.sources.length > 0 || c.units_source) : [];
  return { answer, chunks, list: kept, dropped_unsourced: list.length - kept.length, input, output, cost };
}

const EVIDENCE = new Set(['sold_out', 'closeout', 'certificate_of_occupancy', 'final_plat_recorded', 'lease_up']);
const EVIDENCE_LABEL: Record<string, string> = {
  sold_out: 'sold out', closeout: 'builder closeout', certificate_of_occupancy: 'certificate of occupancy',
  final_plat_recorded: 'final-phase plat recorded', lease_up: 'lease-up',
};

/** Listing and aggregator sites: never a total-units source. Builder, developer,
 *  property-management, government and news sites are fine. */
const LISTING_HOST = /(^|\.)(zillow|redfin|realtor|trulia|homes|movoto|homesnap|point2homes|compass|remax|century21|coldwellbankerhomes|kw|bhhs|har|homefinder|fmls|georgiamls|newhomesource|newhomeguide|livabl|newhomesdirectory|apartments|apartmentlist|apartmentguide|apartmentfinder|apartmenthomeliving|rent|rentcafe|rentable|rentals|rentlingo|zumper|hotpads|padmapper|forrent|niche|neighborhoods|realestate|yelp)\.(com|net|org)$/i;

export function isListingUrl(u: string | null): boolean {
  if (!u) return false;
  try { return LISTING_HOST.test(new URL(u).hostname.replace(/^www\./, '')); } catch { return false; }
}

/** Gemini cites vertexaisearch grounding-api-redirect links; resolve them to the
 *  real page (they also expire). Unresolvable → null. */
async function resolveUrl(u: string, cache: Map<string, string | null>): Promise<string | null> {
  if (cache.has(u)) return cache.get(u)!;
  let out: string | null = u;
  if (/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(u)) {
    out = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(u, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
      clearTimeout(t);
      out = res.headers.get('location');
      await res.body?.cancel();
    } catch { out = null; }
  }
  cache.set(u, out);
  return out;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function easternDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

/** Name key for de-duplicating the pass's own list across municipalities. */
const nameKey = (n: string) => n.toLowerCase()
  .replace(/\b(the|at|of|subdivision|community|neighborhood|townhomes?|homes|apartments?|phase\s*\w+)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '');

export async function createRecentRun(
  supabase: Supa, a: { siteId: string; radiusMiles: number; sweepId?: string | null; triggeredBy?: string | null },
): Promise<{ runId: string; munis: Muni[] }> {
  const munis = await municipalitiesFor(supabase, a.siteId, a.radiusMiles);
  const { data, error } = await supabase.from('research_run').insert({
    site_submit_id: a.siteId, radius_miles: a.radiusMiles, research_mode: 'quick', research_scope: 'recent_built',
    state: 'running', sweep_id: a.sweepId ?? null, triggered_by: a.triggeredBy ?? null,
    recent_muni_ids: munis.map((m) => m.boundary_municipality_id),
  }).select('id').single();
  if (error) throw new Error(`create run: ${error.message}`);
  return { runId: data.id, munis };
}

export interface RecentSummary {
  research_run_id: string;
  municipalities: number;
  found: number;
  under_threshold_or_old: number;
  unsourced: number;
  duplicates_in_list: number;
  staged: number;
  no_evidence: number;
  count_from_listing: number;
  already_in_ovis: number;
  replace_suggestions: { name: string; known_name: string; ovis_units: number | null; gemini_units: number }[];
  dropped_known: number;
  deduped: number;
  located: { pins: number; hints: number; parcel_ids: number };
  boundaries: number;
  outside_radius: number;
  recent_records: number;
  recent_units: number;
  without_count: number;
  search_cost_cents: number;
  locate_cost_cents: number;
  errors: string[];
}

export async function processRecentRun(
  supabase: Supa, runId: string, munis: Muni[],
  keys: { gemini: string; geocode: string | null }, opts: { deadlineMs?: number; notify?: boolean } = {},
): Promise<RecentSummary> {
  const sum: RecentSummary = {
    research_run_id: runId, municipalities: munis.length, found: 0, under_threshold_or_old: 0, unsourced: 0,
    duplicates_in_list: 0, staged: 0, no_evidence: 0, count_from_listing: 0, already_in_ovis: 0,
    replace_suggestions: [], dropped_known: 0, deduped: 0, located: { pins: 0, hints: 0, parcel_ids: 0 },
    boundaries: 0, outside_radius: 0, recent_records: 0, recent_units: 0, without_count: 0,
    search_cost_cents: 0, locate_cost_cents: 0, errors: [],
  };
  const today = easternDate();
  const { data: run } = await supabase.from('research_run').select('site_submit_id, sweep_id, radius_miles, site_submit(site_submit_name)').eq('id', runId).single();
  const { data: stage } = await supabase.from('project_stage').select('id').eq('name', 'Recently Completed').single();

  // 1. One search per municipality (parallel: they're independent).
  const results = await Promise.all(munis.map(async (m) => {
    try {
      return { m, r: await askGemini(prompt(m), keys.gemini) };
    } catch (e) {
      sum.errors.push(`${m.name}: ${e instanceof Error ? e.message : String(e)}`);
      return { m, r: null };
    }
  }));

  // 2. Filter + de-duplicate the list itself (a county answer repeats the city ones).
  const seen = new Map<string, true>();
  const cands: { m: Muni; c: Community; src: string[]; units: number | null; unitsSrc: string | null }[] = [];
  const logs: Row[] = [];
  const urlCache = new Map<string, string | null>();
  // City answers first, so a community found in both is filed under the city.
  for (const { m, r } of results.sort((a, b) => (a.m.kind === 'city' ? 0 : 1) - (b.m.kind === 'city' ? 0 : 1))) {
    if (!r) continue;
    sum.search_cost_cents += r.cost;
    sum.unsourced += r.dropped_unsourced;
    for (const c of r.list) {
      sum.found++;
      const tooOld = c.year_completed != null && (c.year_completed < SINCE_YEAR
        || (c.year_completed === SINCE_YEAR && c.month_completed != null && c.month_completed < SINCE_MONTH));
      if ((c.total_units != null && c.total_units < MIN_UNITS) || tooOld) {
        sum.under_threshold_or_old++;
        logs.push({ research_run_id: runId, name: c.name, outcome: 'dropped_old_or_small', gemini_units: c.total_units,
                    year_completed: c.year_completed, detail: tooOld ? `completed ${c.year_completed}${c.month_completed ? `-${c.month_completed}` : ''}` : `${c.total_units} units` });
        continue;
      }
      const k = nameKey(c.name);
      if (!k || seen.has(k)) { sum.duplicates_in_list++; continue; }
      seen.set(k, true);
      cands.push({ m, c, src: [], units: null, unitsSrc: null });
    }
  }

  // Resolve source links; a count stands only on a non-listing source.
  await Promise.all(cands.map(async (x) => {
    const raw = [...new Set([...(x.c.units_source ? [x.c.units_source] : []), ...(x.c.evidence_source ? [x.c.evidence_source] : []), ...x.c.sources])];
    const resolved = await Promise.all(raw.map((u) => resolveUrl(u, urlCache)));
    x.src = [...new Set(resolved.filter(Boolean) as string[])];
    if (x.c.evidence_source) x.c.evidence_source = await resolveUrl(x.c.evidence_source, urlCache);
    if (x.c.total_units != null && x.c.units_source) {
      const u = await resolveUrl(x.c.units_source, urlCache);
      if (u && !isListingUrl(u)) { x.units = x.c.total_units; x.unitsSrc = u; }
      else if (u) sum.count_from_listing++;
    }
  }));

  // Already in OVIS? (committed, or another run's pending/approved staged row)
  const known = new Map<string, Row>();
  if (cands.length) {
    const { data, error } = await supabase.rpc('research_recent_lookup', {
      p_run_id: runId,
      p_candidates: cands.map((x, i) => ({ key: String(i), name: x.c.name, address: x.c.address ?? x.c.intersection })),
    });
    if (error) throw new Error(`lookup: ${error.message}`);
    for (const k of data ?? []) if (k.known_id) known.set(k.key, k);
  }

  const rows: Row[] = [];
  cands.forEach((x, i) => {
    const { m, c, src } = x;
    const k = known.get(String(i));
    if (k) {
      sum.already_in_ovis++;
      const ovis = k.ovis_units == null ? null : Number(k.ovis_units);
      const higher = x.units != null && (ovis == null || x.units > ovis * 1.05);
      const outcome = higher ? 'replace_suggested' : x.units == null ? 'dropped_no_count' : x.units < ovis! ? 'dropped_lower' : 'dropped_equal';
      if (higher) sum.replace_suggestions.push({ name: c.name, known_name: k.known_name, ovis_units: ovis, gemini_units: x.units! });
      else sum.dropped_known++;
      logs.push({
        research_run_id: runId, name: c.name, outcome, state: higher ? 'pending' : 'logged',
        known_kind: k.known_kind, known_project_id: k.known_kind === 'committed' ? k.known_id : null,
        known_staging_id: k.known_kind === 'staged' ? k.known_id : null, known_name: k.known_name,
        ovis_units: ovis, gemini_units: x.units ?? c.total_units, gemini_source: x.unitsSrc ?? src[0] ?? null,
        year_completed: c.year_completed,
        detail: x.units == null && c.total_units != null ? 'Gemini count came from a listing page or an unresolvable link' : null,
      });
      return;
    }
    if (!c.evidence) {
      sum.no_evidence++;
      logs.push({ research_run_id: runId, name: c.name, outcome: 'dropped_no_evidence', gemini_units: x.units,
                  gemini_source: src[0] ?? null, year_completed: c.year_completed, detail: c.evidence_detail });
      return;
    }
    const ev = `${EVIDENCE_LABEL[c.evidence]}${c.evidence_detail ? ` — ${c.evidence_detail}` : ''}${c.evidence_source ? ` (${c.evidence_source})` : ''}`;
    rows.push({
      research_run_id: runId,
      boundary_municipality_id: m.boundary_municipality_id,
      project_name: c.name,
      address: c.address ?? c.intersection ?? null,
      location_description: c.address && c.intersection ? `near ${c.intersection}` : null,
      builder_developer: c.builder,
      total_housing_units: x.units,
      units_confidence: x.units != null ? 'reported' : null,
      status_stage_id: stage?.id ?? null,
      year_completed: c.year_completed,
      discovery_source: 'gemini_recent',
      discovery_source_raw: 'gemini_recent',
      source: `Gemini web search (recently built pass, ${today}): ${src.join(' ; ')}`,
      notes: `[Recently built ${today} — Gemini web search] ${c.type ?? 'residential'}`
        + `${c.year_completed ? `, completed ${c.year_completed}${c.month_completed ? `-${String(c.month_completed).padStart(2, '0')}` : ''}` : ', completion date not stated'}`
        + `. Completion: ${ev}`
        + `${x.units != null ? `. ${x.units} units per ${x.unitsSrc}` : c.total_units != null ? `. Gemini said ${c.total_units} units, but only from a listing page — not used` : '. No stated unit count'}.`,
      phase_label: '',
    });
  });

  if (rows.length) {
    const { error } = await supabase.from('municipal_project_staging').insert(rows);
    if (error) sum.errors.push(`stage: ${error.message}`); else sum.staged = rows.length;
  }
  if (logs.length) {
    const { error } = await supabase.from('research_recent_log').insert(logs);
    if (error) sum.errors.push(`log: ${error.message}`);
  }
  await supabase.from('research_run').update({
    state: 'awaiting_review', completed_at: new Date().toISOString(),
    recent_calls: munis.length, recent_cost_cents: Math.round(sum.search_cost_cents * 10_000) / 10_000,
  }).eq('id', runId);

  // 3. Post-run.
  const step = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { sum.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const dedupe = async () => {
    const { data, error } = await supabase.rpc('research_auto_dedupe_by_name', { p_run_ids: [runId], p_dry_run: false });
    if (error) throw new Error(error.message);
    sum.deduped += ['rejected_no_count', 'rejected_equal_count', 'rejected_within_5pct', 'rejected_same_address']
      .reduce((n, k) => n + ((data as Row)?.[k]?.length ?? 0), 0);
  };
  await step('dedupe', dedupe);
  if (keys.geocode) {
    await step('locate', async () => {
      const l = await locateRun(supabase, runId, { gemini: keys.gemini, geocode: keys.geocode! }, { deadlineMs: opts.deadlineMs });
      sum.located = { pins: l.pins_placed, hints: l.hints_improved, parcel_ids: l.parcel_ids_found };
      sum.locate_cost_cents = Math.round((l.gemini_cost_cents + l.geocode_cost_cents) * 100) / 100;
    });
  } else sum.errors.push('locate skipped: GOOGLE_GEOCODING_API_KEY not set');
  await step('dedupe 2', dedupe);
  if (!opts.deadlineMs || Date.now() < opts.deadlineMs) {
    await step('parcel fetch', async () => {
      const pf = await fetchBoundariesForRuns(supabase, [runId]);
      sum.boundaries = pf.resolved + pf.partial;
    });
  } else sum.errors.push('parcel fetch skipped: out of time (use Fill missing units & locations)');
  await step('distance check', async () => {
    const { data, error } = await supabase.rpc('research_distance_check', { p_run_ids: [runId] });
    if (error) throw new Error(error.message);
    sum.outside_radius = (data ?? []).length;
  });

  const { data: s } = await supabase.rpc('get_research_summary', { p_run_ids: [runId] });
  sum.recent_records = Number(s?.recent?.records ?? 0);
  sum.recent_units = Number(s?.recent?.units ?? 0);
  sum.without_count = Number(s?.recent?.without_count ?? 0);
  sum.search_cost_cents = Math.round(sum.search_cost_cents * 100) / 100;
  await supabase.from('research_run').update({ post_run_done_at: new Date().toISOString() }).eq('id', runId);

  if (opts.notify !== false) {
    if (run?.sweep_id) await sendSweepReadyIfDone(supabase, run.sweep_id);
    else {
      const total = (sum.search_cost_cents + sum.locate_cost_cents) / 100;
      await notifyResearchTelegram([
        `Recently built — ${run?.site_submit?.site_submit_name ?? 'site'}`,
        `🏘 ${sum.recent_records} recently built · ${sum.recent_units.toLocaleString('en-US')} units${sum.without_count ? ` (${sum.without_count} without a count)` : ''}`,
        ...(sum.replace_suggestions.length ? [`🔁 ${sum.replace_suggestions.length} unit-count replace suggestion${sum.replace_suggestions.length === 1 ? '' : 's'}`] : []),
        `${sum.outside_radius} outside the radius · $${total.toFixed(2)}`,
      ].join('\n'));
    }
  }
  return sum;
}
