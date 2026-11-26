/**
 * Unit-count estimator for Market Research staged records.
 *
 * Runs after a research run closes for review (final submit_research_report).
 * For every PENDING staged row with no usable unit count:
 *
 *   0a. County parcel layer (research-unit-parcels.ts): lots counted by
 *       subdivision name, only when the lot numbers or build years show the
 *       name isn't an older neighborhood. 'reported' / 'estimated'.
 *   0b. Cited-document reader (research-unit-documents.ts): Gemini with
 *       url_context opens the cited documents and the ones a link away, and
 *       must quote the count. 'approved' / 'reported' / 'estimated' (proposed
 *       or cap). Not for recently built rows or rows already out of radius.
 *   1. Gemini 2.5 Flash with Google Search grounding, given the project name,
 *      jurisdiction, address / location and builder. A count is accepted only
 *      when a source states one for this project. → units_confidence='estimated',
 *      Gemini's answer + sources appended to notes.
 *   2. Else, if the row has acreage (parsed from its text) AND a residential
 *      zoning: acres × the zoning's typical gross density. Same 'estimated'
 *      tag, with the math in notes.
 *   3. Else nothing is written: the row has no count, so the approval screen
 *      already files it under Leads.
 *
 * Every attempt is logged to research_unit_estimate (answer, sources, tokens,
 * cost) and the run's total cost is kept on research_run.unit_estimate_cost_cents.
 *
 * Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md
 *
 * API reference (verified with a live call 2026-11-14):
 *   https://ai.google.dev/gemini-api/docs/google-search — generateContent with
 *   tools: [{ google_search: {} }]; sources in
 *   candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}.
 *   usageMetadata: promptTokenCount, toolUsePromptTokenCount,
 *   candidatesTokenCount, thoughtsTokenCount.
 *   Pricing: https://ai.google.dev/gemini-api/docs/pricing
 */

import { isListingHost, isListingUrl, resolveUrl } from './source-rules.ts';
import { countFromParcelLayer } from './research-unit-parcels.ts';
import { readCitedDocuments } from './research-unit-documents.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;

const MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Paid-tier list prices for gemini-2.5-flash, in cents. Grounding is free for
// the first 1,500 grounded prompts/day, then $35 / 1,000. We charge every call
// the grounding fee, so the recorded cost is an UPPER bound.
const CENTS_PER_INPUT_TOKEN = 30 / 1_000_000;    // $0.30 / 1M
const CENTS_PER_OUTPUT_TOKEN = 250 / 1_000_000;  // $2.50 / 1M (incl. thinking)
const CENTS_PER_GROUNDED_PROMPT = 3.5;           // $35 / 1,000

const CONCURRENCY = 4;
const CALL_TIMEOUT_MS = 60_000;
// The document reader is the slow step (it reads whole packets). Rows that
// reach it after this budget skip it in this pass; "Fill missing units"
// picks them up. Keeps the post-run job inside the edge-function wall clock.
const DOCUMENT_BUDGET_MS = 150_000;

export interface EstimateSummary {
  research_run_id: string;
  considered: number;
  gemini: number;
  density: number;
  parcel: number;
  document: number;
  document_skipped_budget: number;
  lead: number;
  error: number;
  skipped_already_tried: number;
  cost_cents: number;
}

interface StagingRow {
  id: string;
  project_name: string | null;
  address: string | null;
  location_description: string | null;
  parcel_boundary_notes: string | null;
  builder_developer: string | null;
  zoning: string | null;
  phase_label: string | null;
  notes: string | null;
  source: string | null;
  total_housing_units: number | null;
  units_needs_review: boolean;
  discovery_source?: string | null;
  permit_url?: string | null;
  lead_reason?: string | null;
  boundary_municipality: { name: string; kind: string; state: string } | null;
}

/** No usable count: null, 0/negative, or flagged by the unit-count trigger. */
export function lacksUnitCount(r: { total_housing_units: number | null; units_needs_review: boolean }) {
  return r.units_needs_review || r.total_housing_units == null || r.total_housing_units <= 0;
}

// ---------------------------------------------------------------------------
// Acreage × zoning density
// ---------------------------------------------------------------------------

/** Typical GROSS residential density by zoning, units per acre. First match wins. */
const DENSITY_RULES: { re: RegExp; perAcre: number; label: string }[] = [
  { re: /multi-?family|apartment|\bMF\b|\bR-?M\b|\bRM-?\d*\b|\bMR\b|\bHDR\b/i, perAcre: 14, label: 'multifamily' },
  { re: /townho|\bTH\b|\bRT\b|\bR-?TH\b/i, perAcre: 8, label: 'townhome' },
  { re: /\bPUD\b|\bPRD\b|\bPD\b|\bMXD\b|\bMU\b|\bTCM\b|mixed[- ]use/i, perAcre: 6, label: 'planned / mixed-use' },
  { re: /\bR-?([4-9])(\.\d+)?\b/i, perAcre: 4, label: 'small-lot single-family (R-4+)' },
  { re: /\bR-?3\b/i, perAcre: 3.5, label: 'single-family R-3' },
  { re: /\bR-?2\b/i, perAcre: 2.5, label: 'single-family R-2' },
  { re: /\bR-?1\b|\bRS\b|single-family/i, perAcre: 1.5, label: 'single-family R-1' },
  { re: /\bAR\b|\bA-?1\b|\bAG\b|\bRA\b|agricultur/i, perAcre: 0.5, label: 'agricultural-residential' },
];

export function densityForZoning(zoning: string | null): { perAcre: number; label: string } | null {
  if (!zoning || !zoning.trim()) return null;
  for (const r of DENSITY_RULES) if (r.re.test(zoning)) return { perAcre: r.perAcre, label: r.label };
  return null; // commercial / industrial / institutional only: no residential density
}

/** First "<n> acre(s)" / "<n>-acre" / "<n> ac" in the row's text. */
export function parseAcres(...texts: (string | null)[]): number | null {
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(/(\d{1,4}(?:,\d{3})*(?:\.\d+)?)\s*(?:-|\s)?\s*(?:acres?|ac\b)/i);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

interface GeminiResult {
  units: number | null;
  basis: string;
  answer: string;
  sources: { title: string; uri: string }[];
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
}

function buildPrompt(r: StagingRow): string {
  const bm = r.boundary_municipality;
  const where = bm ? `${bm.name}${bm.kind === 'county' ? '' : ` (${bm.kind})`}, ${bm.state}` : 'Georgia';
  const lines = [
    `Project name: ${r.project_name ?? '(unnamed)'}`,
    r.phase_label ? `Phase: ${r.phase_label}` : null,
    `Jurisdiction: ${where}`,
    r.address ? `Address: ${r.address}` : null,
    r.location_description ? `Location / cross-streets: ${r.location_description}` : null,
    r.builder_developer ? `Builder / developer: ${r.builder_developer}` : null,
    r.zoning ? `Zoning: ${r.zoning}` : null,
    r.source ? `What the research agent cited: ${r.source.slice(0, 800)}` : null,
    r.notes ? `Research notes: ${r.notes.slice(0, 1200)}` : null,
  ].filter(Boolean).join('\n');
  const recent = r.discovery_source === 'gemini_recent';

  return `Find the total number of housing units (lots, homes, townhomes or apartment units) in this residential development. Search the web: news, builder/developer sites, apartment listings, planning/zoning agendas and minutes, plats.

${lines}

Rules:
- Only give a number if a source states a unit or lot count for THIS project (and this phase, if a phase is named). Do not guess, average, or derive one from acreage.
- If the cited source or notes above already state a count for this project, use that.
- Developments are often built in phases. If this record names a phase, the count must be for that phase. If it names no phase and sources give counts for different phases, return null rather than picking one.
- If sources disagree, give the most recent planned total and say so.
- If you cannot find a stated count, units must be null.${recent ? `
- This is a completed community. Listing or aggregator pages (Zillow, Redfin, Realtor.com, Homes.com, Trulia, Apartments.com, NewHomeSource, Livabl, after55, rental listing sites) never count as a source for the total. Use builder/developer, property-management, government or news sources. source_url = the page that states the total.` : ''}

Reply with ONLY a JSON object, no prose around it:
{"units": <integer or null>, "basis": "<one sentence: what the source says, quoted where possible>"${recent ? ', "source_url": "<url or null>"' : ''}}`;
}

async function askGemini(r: StagingRow, apiKey: string): Promise<GeminiResult> {
  const g = await askGeminiRaw(r, apiKey);
  if (r.discovery_source !== 'gemini_recent' || g.units == null) return g;
  // Recently built: the count must rest on a non-listing page. Check the URL
  // Gemini names (resolved from its redirect link), else the grounding domains.
  let src: string | null = null;
  try { src = JSON.parse(g.answer.match(/\{[\s\S]*\}/)?.[0] ?? '{}').source_url ?? null; } catch { /* none */ }
  const real = src ? await resolveUrl(String(src)) : null;
  const ok = real ? !isListingUrl(real) : g.sources.some((s) => s.title && !isListingHost(s.title));
  if (ok) return { ...g, basis: real ? `${g.basis} (source: ${real})` : g.basis };
  return { ...g, units: null, basis: `${g.basis} [discarded: count only from a listing/aggregator page${real ? ` — ${real}` : ''}]` };
}

async function askGeminiRaw(r: StagingRow, apiKey: string): Promise<GeminiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  let data: any;
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(r) }] }],
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
  const cost_cents = input_tokens * CENTS_PER_INPUT_TOKEN
    + output_tokens * CENTS_PER_OUTPUT_TOKEN
    + CENTS_PER_GROUNDED_PROMPT;

  const cand = data.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
  const sources = ((cand?.groundingMetadata?.groundingChunks ?? []) as any[])
    .map((c) => c.web).filter(Boolean)
    .map((w: any) => ({ title: String(w.title ?? ''), uri: String(w.uri ?? '') }));

  let units: number | null = null;
  let basis = '';
  const json = answer.match(/\{[\s\S]*\}/)?.[0];
  if (json) {
    try {
      const parsed = JSON.parse(json);
      const n = Number(parsed.units);
      units = parsed.units != null && Number.isInteger(n) && n > 0 ? n : null;
      basis = typeof parsed.basis === 'string' ? parsed.basis : '';
    } catch { /* unparseable → treated as no count */ }
  }
  // A count with no grounding source behind it is a guess, not a finding.
  if (units != null && sources.length === 0) {
    basis = `${basis} [discarded: no web source returned]`.trim();
    units = null;
  }
  return { units, basis, answer, sources, input_tokens, output_tokens, cost_cents };
}

// ---------------------------------------------------------------------------
// Run driver
// ---------------------------------------------------------------------------

type Confidence = 'approved' | 'reported' | 'estimated';

async function writeUnitCount(supabase: Supa, r: StagingRow, units: number, note: string, confidence: Confidence) {
  const notes = [r.notes?.trim(), note].filter(Boolean).join('\n\n');
  // Flag columns set in the same statement, so the unit-count trigger
  // leaves them alone; units_confidence carries the "estimated" caveat.
  const { error: upErr } = await supabase
    .from('municipal_project_staging')
    .update({
      total_housing_units: units,
      units_confidence: confidence,
      units_needs_review: false,
      units_review_reason: null,
      notes,
    })
    .eq('id', r.id)
    .eq('approval_state', 'pending');
  if (upErr) throw new Error(`update ${r.id}: ${upErr.message}`);
  r.notes = notes;
}

const OUT_OF_RADIUS = /^\s*outside the/i;

/**
 * Steps 0a / 0b: parcel layer, then the cited documents. true = a count was
 * written and the row is done. Each attempt is logged; a failure is logged as
 * 'error' and the row carries on to the web search.
 */
async function countFromStatedSources(
  supabase: Supa, runId: string, r: StagingRow, apiKey: string, today: string,
  summary: EstimateSummary, documentDeadline: number,
): Promise<boolean> {
  const base = { research_run_id: runId, staging_id: r.id, project_name: r.project_name };
  if (r.lead_reason && OUT_OF_RADIUS.test(r.lead_reason)) return false; // not worth reading

  try {
    const p = await countFromParcelLayer(r);
    if (p) {
      await supabase.from('research_unit_estimate').insert({
        ...base, method: 'parcel', units: p.units, model: p.layer, answer: p.note, cost_cents: 0,
      });
      if (p.units != null && p.confidence) {
        await writeUnitCount(supabase, r, p.units, `[Unit count ${today} — parcel layer] ${p.units} lots. ${p.note}.`, p.confidence);
        summary.parcel++;
        return true;
      }
      // No count, but what the layer shows helps the reviewer. Once per row.
      if (p.matched > 0 && !(r.notes ?? '').includes('— parcel layer]')) {
        const notes = [r.notes?.trim(), `[Unit check ${today} — parcel layer] ${p.note}.`].filter(Boolean).join('\n\n');
        await supabase.from('municipal_project_staging').update({ notes }).eq('id', r.id).eq('approval_state', 'pending');
        r.notes = notes;
      }
    }
  } catch (e) {
    await supabase.from('research_unit_estimate').insert({
      ...base, method: 'error', answer: `[parcel layer] ${e instanceof Error ? e.message : String(e)}`, cost_cents: 0,
    });
  }

  if (r.discovery_source === 'gemini_recent') return false; // listing-sourced: nothing to read
  if (Date.now() > documentDeadline) { summary.document_skipped_budget++; return false; }
  try {
    const d = await readCitedDocuments(r, apiKey);
    summary.cost_cents += d.cost_cents;
    await supabase.from('research_unit_estimate').insert({
      ...base, method: 'document', units: d.units, model: MODEL, answer: d.answer,
      sources: { given: d.urls_given, read: d.urls_read, search: d.sources, url: d.url, page: d.page, quote: d.quote, status: d.status },
      input_tokens: d.input_tokens, output_tokens: d.output_tokens, cost_cents: d.cost_cents,
    });
    if (d.units != null && d.confidence) {
      const what = d.status === 'approved' ? 'approved' : d.status === 'proposed' ? 'PROPOSED' : d.status === 'cap' ? 'CAP (maximum allowed)' : 'stated';
      await writeUnitCount(supabase, r, d.units,
        `[Unit count ${today} — cited document] ${d.units} units, ${what}: "${d.quote.slice(0, 400)}" — ${d.url}${d.page ? ` p.${d.page}` : ''}. ${d.basis}`.trim(),
        d.confidence);
      summary.document++;
      return true;
    }
  } catch (e) {
    await supabase.from('research_unit_estimate').insert({
      ...base, method: 'error', model: MODEL, answer: `[document reader] ${e instanceof Error ? e.message : String(e)}`, cost_cents: 0,
    });
  }
  return false;
}

function easternDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/**
 * Estimate unit counts for one research run's pending no-count rows.
 * Idempotent: a row with an existing research_unit_estimate attempt is skipped.
 */
export async function estimateMissingUnits(
  supabase: Supa,
  researchRunId: string,
  geminiApiKey: string,
  // retryTried: re-ask rows that an earlier pass already tried and left as
  // leads (the "Fill missing units" rerun, with the current prompt). Rows that
  // got an estimated count never come back: they no longer lack a count.
  opts: { retryTried?: boolean; documentBudgetMs?: number } = {},
): Promise<EstimateSummary> {
  const summary: EstimateSummary = {
    research_run_id: researchRunId, considered: 0, gemini: 0, density: 0, parcel: 0, document: 0,
    document_skipped_budget: 0, lead: 0, error: 0, skipped_already_tried: 0, cost_cents: 0,
  };
  const documentDeadline = Date.now() + (opts.documentBudgetMs ?? DOCUMENT_BUDGET_MS);

  const { data: rows, error } = await supabase
    .from('municipal_project_staging')
    .select('id, project_name, address, location_description, parcel_boundary_notes, builder_developer, zoning, phase_label, notes, source, permit_url, lead_reason, discovery_source, total_housing_units, units_needs_review, boundary_municipality(name, kind, state)')
    .eq('research_run_id', researchRunId)
    .eq('approval_state', 'pending');
  if (error) throw new Error(`load staging: ${error.message}`);

  const { data: tried, error: triedErr } = await supabase
    .from('research_unit_estimate')
    .select('staging_id')
    .eq('research_run_id', researchRunId)
    .neq('method', 'error'); // a failed call is retried on the next pass
  if (triedErr) throw new Error(`load prior estimates: ${triedErr.message}`);
  const triedIds = new Set((tried ?? []).map((t: any) => t.staging_id));

  // Recently built rows are asked too (stricter sources, see askGemini) but
  // never get an acreage × density count.
  const todo = (rows as StagingRow[]).filter((r) => lacksUnitCount(r));
  summary.considered = todo.length;
  const today = easternDate();

  await pool(todo, CONCURRENCY, async (r) => {
    if (!opts.retryTried && triedIds.has(r.id)) { summary.skipped_already_tried++; return; }

    if (await countFromStatedSources(supabase, researchRunId, r, geminiApiKey, today, summary, documentDeadline)) return;

    let g: GeminiResult | null = null;
    let gErr: string | null = null;
    try {
      g = await askGemini(r, geminiApiKey);
    } catch (e) {
      gErr = e instanceof Error ? e.message : String(e);
    }
    const cost = g?.cost_cents ?? 0;
    summary.cost_cents += cost;

    const log = {
      research_run_id: researchRunId,
      staging_id: r.id,
      project_name: r.project_name,
      model: MODEL,
      answer: g ? g.answer : gErr,
      sources: g?.sources ?? null,
      input_tokens: g?.input_tokens ?? null,
      output_tokens: g?.output_tokens ?? null,
      cost_cents: cost,
    };

    const writeCount = (units: number, note: string, confidence: Confidence = 'estimated') =>
      writeUnitCount(supabase, r, units, note, confidence);

    try {
      if (g && g.units != null) {
        const src = g.sources.map((s) => `${s.title} <${s.uri}>`).join('; ');
        await writeCount(g.units,
          `[Unit estimate ${today} — Gemini web search] ${g.units} units. ${g.basis}\nSources: ${src}`,
          r.discovery_source === 'gemini_recent' ? 'reported' : 'estimated');
        await supabase.from('research_unit_estimate').insert({ ...log, method: 'gemini', units: g.units });
        summary.gemini++;
        return;
      }

      const acres = parseAcres(r.location_description, r.notes, r.parcel_boundary_notes, r.project_name);
      const dens = densityForZoning(r.zoning);
      // Density only fills a genuinely missing count. A flagged count (e.g.
      // exactly 25) may still be sourced; only a stated one replaces it.
      const missing = r.total_housing_units == null || r.total_housing_units <= 0;
      if (missing && acres != null && dens && r.discovery_source !== 'gemini_recent') {
        const units = Math.max(1, Math.round(acres * dens.perAcre));
        const why = g ? ` Gemini found no stated count${g.basis ? ` (${g.basis})` : ''}.` : ` Gemini call failed: ${gErr}.`;
        await writeCount(units,
          `[Unit estimate ${today} — acreage × zoning density] ${acres} ac × ${dens.perAcre} units/ac (typical gross density for ${dens.label}, from zoning "${r.zoning}") = ${units} units.${why}`);
        await supabase.from('research_unit_estimate').insert({
          ...log, method: 'density', units, acres, density_per_acre: dens.perAcre,
        });
        summary.density++;
        return;
      }

      await supabase.from('research_unit_estimate').insert({
        ...log, method: g ? 'lead' : 'error', acres,
      });
      if (g) summary.lead++; else summary.error++;
    } catch (e) {
      summary.error++;
      await supabase.from('research_unit_estimate').insert({
        ...log, method: 'error', answer: `${log.answer ?? ''}\n[write failed] ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  });

  // Run totals are recomputed from the log, so re-runs and partial runs stay exact.
  const { data: all } = await supabase
    .from('research_unit_estimate')
    .select('cost_cents')
    .eq('research_run_id', researchRunId);
  const total = (all ?? []).reduce((s: number, x: any) => s + Number(x.cost_cents ?? 0), 0);
  await supabase.from('research_run').update({
    unit_estimate_calls: (all ?? []).length,
    unit_estimate_cost_cents: Math.round(total * 10_000) / 10_000,
    unit_estimate_ran_at: new Date().toISOString(),
  }).eq('id', researchRunId);

  summary.cost_cents = Math.round(summary.cost_cents * 100) / 100;
  return summary;
}
