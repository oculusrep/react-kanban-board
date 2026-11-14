/**
 * Unit-count estimator for Market Research staged records.
 *
 * Runs after a research run closes for review (final submit_research_report).
 * For every PENDING staged row with no usable unit count:
 *
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

export interface EstimateSummary {
  research_run_id: string;
  considered: number;
  gemini: number;
  density: number;
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
  total_housing_units: number | null;
  units_needs_review: boolean;
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
  ].filter(Boolean).join('\n');

  return `Find the total number of housing units (lots, homes, townhomes or apartment units) in this residential development. Search the web: news, builder/developer sites, apartment listings, planning/zoning agendas and minutes, plats.

${lines}

Rules:
- Only give a number if a source states a unit or lot count for THIS project (and this phase, if a phase is named). Do not guess, average, or derive one from acreage.
- If sources disagree, give the most recent planned total and say so.
- If you cannot find a stated count, units must be null.

Reply with ONLY a JSON object, no prose around it:
{"units": <integer or null>, "basis": "<one sentence: what the source says, quoted where possible>"}`;
}

async function askGemini(r: StagingRow, apiKey: string): Promise<GeminiResult> {
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
): Promise<EstimateSummary> {
  const summary: EstimateSummary = {
    research_run_id: researchRunId, considered: 0, gemini: 0, density: 0, lead: 0,
    error: 0, skipped_already_tried: 0, cost_cents: 0,
  };

  const { data: rows, error } = await supabase
    .from('municipal_project_staging')
    .select('id, project_name, address, location_description, parcel_boundary_notes, builder_developer, zoning, phase_label, notes, total_housing_units, units_needs_review, boundary_municipality(name, kind, state)')
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

  const todo = (rows as StagingRow[]).filter(lacksUnitCount);
  summary.considered = todo.length;
  const today = easternDate();

  await pool(todo, CONCURRENCY, async (r) => {
    if (triedIds.has(r.id)) { summary.skipped_already_tried++; return; }

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

    const writeCount = async (units: number, note: string) => {
      const notes = [r.notes?.trim(), note].filter(Boolean).join('\n\n');
      // Flag columns set in the same statement, so the unit-count trigger
      // leaves them alone; units_confidence carries the "estimated" caveat.
      const { error: upErr } = await supabase
        .from('municipal_project_staging')
        .update({
          total_housing_units: units,
          units_confidence: 'estimated',
          units_needs_review: false,
          units_review_reason: null,
          notes,
        })
        .eq('id', r.id)
        .eq('approval_state', 'pending');
      if (upErr) throw new Error(`update ${r.id}: ${upErr.message}`);
    };

    try {
      if (g && g.units != null) {
        const src = g.sources.map((s) => `${s.title} <${s.uri}>`).join('; ');
        await writeCount(g.units,
          `[Unit estimate ${today} — Gemini web search] ${g.units} units. ${g.basis}\nSources: ${src}`);
        await supabase.from('research_unit_estimate').insert({ ...log, method: 'gemini', units: g.units });
        summary.gemini++;
        return;
      }

      const acres = parseAcres(r.location_description, r.notes, r.parcel_boundary_notes, r.project_name);
      const dens = densityForZoning(r.zoning);
      // Density only fills a genuinely missing count. A flagged count (e.g.
      // exactly 25) may still be sourced; only a stated one replaces it.
      const missing = r.total_housing_units == null || r.total_housing_units <= 0;
      if (missing && acres != null && dens) {
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
