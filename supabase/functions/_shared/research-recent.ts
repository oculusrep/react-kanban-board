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
import { isListingUrl, resolveUrl } from './source-rules.ts';
import { estimateMissingUnits } from './research-unit-estimator.ts';
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
  const builders = await Promise.all(munis.map((m) => buildersFor(supabase, m).catch(() => [] as string[])));
  const searchCalls = munis.length * 2 + builders.filter((b) => b.length > 0).length;
  const { data: hist } = await supabase.from('research_run')
    .select('recent_calls, recent_cost_cents, recent_muni_ids, locate_calls, locate_cost_cents, unit_estimate_calls, unit_estimate_cost_cents')
    .eq('research_scope', 'recent_built').not('recent_calls', 'is', null).limit(50);
  const h = (hist ?? []) as Row[];
  const sumOf = (f: (r: Row) => number) => h.reduce((n, r) => n + f(r), 0);
  const calls = sumOf((r) => Number(r.recent_calls ?? 0));
  const muniRuns = sumOf((r) => (r.recent_muni_ids ?? []).length);
  const searchCents = calls ? sumOf((r) => Number(r.recent_cost_cents ?? 0)) / calls : EST_SEARCH_CENTS;
  // Per municipality, from history: locate + unit-count spend. Fallback: ~4 locates.
  const followPerMuni = muniRuns
    ? sumOf((r) => Number(r.locate_cost_cents ?? 0) + Number(r.unit_estimate_cost_cents ?? 0)) / muniRuns
    : 4 * EST_LOCATE_CENTS;
  const search = searchCalls * searchCents;
  const follow = munis.length * followPerMuni;
  return {
    municipalities: munis.map((m, i) => ({ id: m.boundary_municipality_id, name: m.name, kind: m.kind, distance_mi: m.distance_mi, builders: builders[i] })),
    search_calls: searchCalls,
    search_cents_each: Math.round(searchCents * 100) / 100,
    est_search_cents: Math.round(search * 100) / 100,
    est_locate_cents: Math.round(follow * 100) / 100,
    est_total_cents: Math.round((search + follow) * 100) / 100,
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

export type SearchKind = 'single_family' | 'rental' | 'builder';

const RULES = (m: Muni) => `Rules:
- Completed means real evidence, one of: sold out / builder closeout; certificate of occupancy for the final building; final-phase plat recorded; apartments in lease-up or fully leased. "Now selling", "coming soon", groundbreaking, zoning or plat approval for an earlier phase, or street/utility work are NOT completion — skip those communities.
- ${m.kind === 'county' ? `Only communities outside city limits (unincorporated ${m.name}).` : `Only communities in or immediately around ${m.name}.`}
- total_units only when a source states the community's total; otherwise null. Never estimate. Listing or aggregator pages (Zillow, Redfin, Realtor.com, Homes.com, Trulia, Apartments.com, NewHomeSource, Livabl, rental listing sites) never count as a total-units source. units_source = the URL that states the total.
- completed = "YYYY-MM" when the month is known, else "YYYY".
- street_address needs a house number; intersection is two named roads. null when unknown.
- Every community needs at least one source URL. Search the web before answering.

Reply with ONLY a JSON object, no prose around it:
{"communities": [{"name": "<name>", "builder": <string or null>, "completed": "<YYYY-MM or YYYY or null>", "completion_evidence": "<sold_out | closeout | certificate_of_occupancy | final_plat_recorded | lease_up | none>", "evidence_detail": "<one line: what the source says>", "evidence_source": <url or null>, "total_units": <integer or null>, "units_source": <url or null>, "street_address": <string or null>, "intersection": <string or null>, "type": "<single-family | townhomes | apartments | build-to-rent | mixed>", "sources": ["<url>"]}]}`;

/** Three searches per municipality, merged: single-family; rental (apartments,
 *  townhomes, build-to-rent); and builder-led for the builders OVIS already has
 *  in that area. */
export function prompt(m: Muni, kind: SearchKind, builders: string[] = []): string {
  const place = m.kind === 'county' ? `unincorporated ${m.name}` : m.name;
  const ask = 'For each: name, builder, when it was completed, total homes/units, street address or nearest intersection, and the evidence that it is complete. Cite a source for each.';
  if (kind === 'single_family') {
    return `List single-family subdivisions of ${MIN_UNITS}+ homes in ${place}, GA completed (sold out or built out) since April 2020, after the 2020 Census. ${ask}\n\n${RULES(m)}`;
  }
  if (kind === 'rental') {
    return `List apartment complexes, townhome communities and build-to-rent communities of ${MIN_UNITS}+ units in ${place}, GA completed or leased up since April 2020, after the 2020 Census. ${ask}\n\n${RULES(m)}`;
  }
  return `List the communities of ${MIN_UNITS}+ homes or units these builders have in ${place}, GA that were completed (sold out, closed out or leased up) since April 2020: ${builders.join('; ')}. Search each builder ("<builder> communities in ${m.name} GA"), including sold-out and closeout communities. ${ask}\n\n${RULES(m)}`;
}

/** Builders OVIS already has in a municipality (committed + staged), most
 *  frequent first. Names are messy (", LLC, Atlanta GA (agent: …)"), so they are
 *  cut to the company and grouped; people and land/holding entities are dropped. */
const BUILDER_WORD = /homes|home builders|communities|horton|\bdrb\b|\blgi\b|pulte|lennar|ashton woods|century|stanley martin|smith douglas|meritage|taylor morrison|weekley|kb home|starlight|rangewater|continental|residential|properties|\bnvr\b|ryan|toll|mungo|rockhaven|trophy|mattamy|eastwood|chafin|brock built|piedmont|liberty communities/i;
const NOT_BUILDER = /applicant|agent|engineer|representative|attorney|\bpc\b|land company|land,|acquisitions|holdings|investors|capital|\bland\b/i;
export function builderKey(n: string): string {
  return n.toLowerCase().replace(/\b(inc|llc|lp|co|company|group|homes?|of [a-z ]+|the)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
}
export async function buildersFor(supabase: Supa, m: Muni, max = 8): Promise<string[]> {
  const [{ data: staged }, { data: committed }] = await Promise.all([
    supabase.from('municipal_project_staging').select('builder_developer')
      .eq('boundary_municipality_id', m.boundary_municipality_id).in('approval_state', ['pending', 'approved'])
      .not('builder_developer', 'is', null).limit(1000),
    supabase.from('municipal_project').select('builder_developer, municipality!inner(name)')
      .eq('municipality.name', m.name).not('builder_developer', 'is', null).limit(1000),
  ]);
  const counts = new Map<string, { name: string; n: number }>();
  for (const r of [...(staged ?? []), ...(committed ?? [])]) {
    for (const part of String(r.builder_developer).split(/\s\/\s|;/)) {
      const name = part.split(/[,(]/)[0].replace(/\b(inc|llc)\.?$/i, '').trim();
      if (!name || !BUILDER_WORD.test(name) || NOT_BUILDER.test(part.split('(')[0])) continue;
      const k = builderKey(name);
      if (!k) continue;
      const e = counts.get(k);
      if (e) { e.n++; if (name.length < e.name.length) e.name = name; } else counts.set(k, { name, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max).map((e) => e.name);
}

/** Retry once when Gemini answers empty without actually searching. */
async function askWithRetry(text: string, apiKey: string) {
  const first = await askGemini(text, apiKey);
  if (first.searched || first.list.length > 0) return { ...first, retried: false };
  const second = await askGemini(text, apiKey);
  return { ...second, cost: first.cost + second.cost, retried: true };
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
  return { answer, chunks, searched: grounded, list: kept, dropped_unsourced: list.length - kept.length, input, output, cost };
}

const EVIDENCE = new Set(['sold_out', 'closeout', 'certificate_of_occupancy', 'final_plat_recorded', 'lease_up']);
const EVIDENCE_LABEL: Record<string, string> = {
  sold_out: 'sold out', closeout: 'builder closeout', certificate_of_occupancy: 'certificate of occupancy',
  final_plat_recorded: 'final-phase plat recorded', lease_up: 'lease-up',
};

/** Gemini labels evidence loosely ("move-in ready homes available" → closeout).
 *  The label stands only when its own one-line detail says the thing. */
const SOLD_OUT_TEXT = /sold[\s-]?out|close[\s-]?out|final (home|homes|phase|lots?)|last (home|homes|lots?)|only (\d+|one|two|three|a few) (homes?|lots?|homesites?)( are)? (remain|left)|model (home )?(closed|sold)|fully built|built[\s-]?out|build[\s-]?out (is )?complete/i;
const STILL_SELLING_TEXT = /now selling|coming soon|grand opening|launch|move[\s-]?in ready|under construction|homes? available|lots? available|new phase/i;
const RENTAL_TEXT = /lease|leasing|for rent|occupan|opened|completed|built in \d{4}|certificate of occupancy/i;

export { isListingUrl };

export function evidenceHolds(kind: string, detail: string | null, type: string | null): boolean {
  const d = detail ?? '';
  const rental = /apartment|rental|senior|active adult|build[\s-]?to[\s-]?rent/i.test(type ?? '') || kind === 'lease_up';
  if (kind === 'sold_out' || kind === 'closeout') return SOLD_OUT_TEXT.test(d) && !(/move[\s-]?in ready|now selling/i.test(d));
  if (kind === 'final_plat_recorded') return /final/i.test(d) && /plat/i.test(d);
  if (kind === 'certificate_of_occupancy') return /certificate of occupancy|\bC\.?O\.?\b/.test(d) || (rental && RENTAL_TEXT.test(d) && !STILL_SELLING_TEXT.test(d));
  if (kind === 'lease_up') return RENTAL_TEXT.test(d);
  return false;
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

/** Fill the first-seen copy's gaps from a later copy (another search found it too). */
function mergeCommunity(a: Community, b: Community) {
  a.builder ??= b.builder;
  a.address ??= b.address;
  a.intersection ??= b.intersection;
  a.type ??= b.type;
  if (a.year_completed == null) { a.year_completed = b.year_completed; a.month_completed = b.month_completed; }
  if (a.total_units == null && b.total_units != null) { a.total_units = b.total_units; a.units_source = b.units_source; }
  const aHolds = a.evidence && evidenceHolds(a.evidence, a.evidence_detail, a.type);
  if (!aHolds && b.evidence && evidenceHolds(b.evidence, b.evidence_detail, b.type)) {
    a.evidence = b.evidence; a.evidence_detail = b.evidence_detail; a.evidence_source = b.evidence_source;
  }
  a.sources = [...new Set([...a.sources, ...b.sources])];
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
  search_calls: number;
  searches: { municipality: string; kind: string; found: number; retried: boolean; note: string }[];
  units_found: number;
  unit_cost_cents: number;
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
    search_cost_cents: 0, search_calls: 0, searches: [], units_found: 0, unit_cost_cents: 0,
    locate_cost_cents: 0, errors: [],
  };
  const today = easternDate();
  const { data: run } = await supabase.from('research_run').select('site_submit_id, sweep_id, radius_miles, site_submit(site_submit_name)').eq('id', runId).single();
  const { data: stage } = await supabase.from('project_stage').select('id').eq('name', 'Recently Completed').single();

  // 1. Three searches per municipality (single-family, rental, builder-led),
  //    all in parallel. Builder-led is skipped when OVIS has no builders there.
  const jobs: { m: Muni; kind: SearchKind; text: string }[] = [];
  for (const m of munis) {
    const builders = await buildersFor(supabase, m).catch(() => [] as string[]);
    jobs.push({ m, kind: 'single_family', text: prompt(m, 'single_family') });
    jobs.push({ m, kind: 'rental', text: prompt(m, 'rental') });
    if (builders.length) jobs.push({ m, kind: 'builder', text: prompt(m, 'builder', builders) });
    sum.searches.push({ municipality: m.name, kind: 'builders', found: builders.length, retried: false, note: builders.join('; ') });
  }
  const results = await Promise.all(jobs.map(async (j) => {
    try {
      const r = await askWithRetry(j.text, keys.gemini);
      sum.search_calls += r.retried ? 2 : 1;
      sum.searches.push({ municipality: j.m.name, kind: j.kind, found: r.list.length, retried: r.retried, note: r.searched ? '' : 'no search' });
      return { m: j.m, r };
    } catch (e) {
      sum.search_calls++;
      sum.errors.push(`${j.m.name} ${j.kind}: ${e instanceof Error ? e.message : String(e)}`);
      return { m: j.m, r: null };
    }
  }));

  // 2. Filter + de-duplicate the list itself (a county answer repeats the city ones).
  const seen = new Map<string, Community>();
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
      if (!k) continue;
      const prev = seen.get(k);
      if (prev) { sum.duplicates_in_list++; mergeCommunity(prev, c); continue; }
      seen.set(k, c);
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
    if (!c.evidence || !evidenceHolds(c.evidence, c.evidence_detail, c.type)) {
      sum.no_evidence++;
      logs.push({ research_run_id: runId, name: c.name, outcome: 'dropped_no_evidence', gemini_units: x.units,
                  gemini_source: c.evidence_source ?? src[0] ?? null, year_completed: c.year_completed,
                  detail: `${c.evidence ?? 'none'}: ${c.evidence_detail ?? 'no detail'}` });
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
    recent_calls: sum.search_calls, recent_cost_cents: Math.round(sum.search_cost_cents * 10_000) / 10_000,
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
  // Gemini unit count (no acreage × density) for records still without a count.
  await step('unit count', async () => {
    const u = await estimateMissingUnits(supabase, runId, keys.gemini);
    sum.units_found = u.gemini;
    sum.unit_cost_cents = u.cost_cents;
  });
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
      const total = (sum.search_cost_cents + sum.unit_cost_cents + sum.locate_cost_cents) / 100;
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
