/**
 * One iteration of a deep_pass run, dispatched on research_thread_run.pass_phase:
 *
 *   prepare      (code)  Step 1 school results → EDGE check → fill list → school_fill, or straight to deep_pass
 *   school_fill  (model) record_school_fill + web_search (15) → on end_turn: deep_pass
 *   deep_pass    (model) record_employer, geocode_address, OVIS tools + web_search (20) → on end_turn: exports
 *   exports      (code)  schools.csv + employers.csv to Dropbox → finalize the report message
 *
 * Every phase change goes through advance_thread_run_phase (lease-checked, commits the
 * iteration). Model phases reuse runModelIteration, so retries, cost and the search budget
 * behave exactly as in Step 1.
 */

import {
  type AcceptedFill, type AtlasCoffeeRow, buildCompetitorsCsv, buildEmployersCsv, buildFillList,
  buildSchoolsCsv, csvBytes, DEEP_PASS_CLIENT_TOOLS, DEEP_PASS_PROMPT_KEY, DEEP_PASS_SEARCH_BUDGET,
  deepPassOpening, type EdgeLocation, extractStep1Schools, FILL_SEARCH_BUDGET, type FillItem,
  type RecordedCompetitor, recordCoffeeCompetitor, type RecordedEmployer, recordEmployer,
  SCHOOL_FILL_CLIENT_TOOLS, SCHOOL_FILL_PROMPT_KEY, type SchoolRecord, schoolFillOpening, validateSchoolFill,
} from './deep-pass.ts';
import { type ClaimedRun, type IterationDeps, type IterationOutcome, PermanentError, runModelIteration } from './iteration.ts';
import { isPermanentApiError, MODEL } from './model.ts';
import { dataQualityFor } from './snapshot.ts';

export interface DeepPassDb {
  advancePhase(a: {
    runId: string; owner: string; iteration: number; attempt: number; nextPhase: 'school_fill' | 'deep_pass' | 'exports';
    convo: Array<Record<string, unknown>>; promptTemplateId: string | null; phaseSearchBudget: number;
    statePatch: Record<string, unknown>;
  }): Promise<boolean>;
  patchState(runId: string, owner: string, patch: Record<string, unknown>): Promise<boolean>;
  /** Committed, non-error query_nearby_schools results of the thread's latest complete archetype run, in call order. */
  step1SchoolResults(threadId: string): Promise<{ runId: string | null; results: Array<{ output: unknown }> }>;
  /** Committed, non-error results of one tool in this run, in call order. */
  committedToolOutputs(runId: string, toolName: string): Promise<unknown[]>;
  promptIdByKey(key: string): Promise<string>;
  firstPassReport(threadId: string): Promise<string | null>;
}

export interface DeepPassDeps extends Omit<IterationDeps, 'clientTools' | 'webSearchTool' | 'onEndTurn'> {
  dp: DeepPassDb;
  webSearchTool: Record<string, unknown>;
  edgePrivate: (ppins: string[]) => Promise<Map<string, EdgeLocation>>;
  /** Starbucks within 5 mi from the Atlas tables, for competitors.csv. */
  atlasCoffee: (site: { latitude: number; longitude: number }) => Promise<AtlasCoffeeRow[]>;
  recordEmployer?: typeof recordEmployer;
  recordCoffeeCompetitor?: typeof recordCoffeeCompetitor;
  /** Upload the CSVs to the site submit's Dropbox folder; returns where they landed. */
  exportFiles: (siteSubmitId: string, files: Array<{ name: string; bytes: Uint8Array }>) => Promise<Array<{ name: string; path: string; size: number }>>;
}

const siteOf = (run: ClaimedRun) => {
  const s = (run.pinned_context as { site?: { latitude?: unknown; longitude?: unknown } } | null)?.site;
  const lat = Number(s?.latitude), lng = Number(s?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
};

export async function runDeepPassIteration(run: ClaimedRun, owner: string, deps: DeepPassDeps): Promise<IterationOutcome> {
  const log = deps.log ?? ((m) => console.log(m));
  const tag = `[site-research] run=${run.id} iter=${run.iteration} attempt=${run.attempt} phase=${run.pass_phase}`;
  const state = (run.phase_state ?? {}) as Record<string, unknown>;
  const lastAttempt = run.attempt >= (run.max_attempts ?? 3);

  const fail = async (error: string): Promise<IterationOutcome> => {
    await deps.db.fail(run.id, error);
    log(`${tag} FAILED: ${error}`);
    if (deps.onFailed) await deps.onFailed(run.id, error).catch(() => {});
    return 'failed';
  };
  /** Code-only phases: a transient error releases the lease for a retry, a permanent one fails the run. */
  const guarded = async (body: () => Promise<IterationOutcome>): Promise<IterationOutcome> => {
    try {
      return await body();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof PermanentError || isPermanentApiError(e)) return await fail(msg);
      await deps.db.release(run.id, owner, run.iteration, run.attempt, msg);
      log(`${tag} transient error, lease released for retry: ${msg}`);
      return 'released';
    }
  };

  const advance = async (
    nextPhase: 'school_fill' | 'deep_pass' | 'exports', convo: Array<Record<string, unknown>>,
    promptKey: string | null, budget: number, statePatch: Record<string, unknown>,
  ): Promise<IterationOutcome> => {
    const ok = await deps.dp.advancePhase({
      runId: run.id, owner, iteration: run.iteration, attempt: run.attempt, nextPhase, convo,
      promptTemplateId: promptKey ? await deps.dp.promptIdByKey(promptKey) : null,
      phaseSearchBudget: budget, statePatch,
    });
    log(`${tag} → ${nextPhase}${ok ? '' : ' (NOT committed: lease lost)'}`);
    if (!ok) return 'lease_lost';
    await deps.chain(run.id);
    return 'chained';
  };

  const openDeepPass = async (schools: SchoolRecord[], fillList: FillItem[], fillSummary: string | null, extra: Record<string, unknown>) => {
    const accepted = fillList.length
      ? (await deps.dp.committedToolOutputs(run.id, 'record_school_fill'))
          .map((o) => (o as { accepted?: AcceptedFill | null }).accepted)
          .filter((a): a is AcceptedFill => !!a)
      : [];
    const names = new Map(schools.map((s) => [s.school_id, s.name]));
    const opening = deepPassOpening({
      esri: dataQualityFor(run.pinned_context).esri,
      archetypePrimary: run.archetype_primary ?? null,
      archetypeSecondary: run.archetype_secondary ?? null,
      storyCarriers: run.story_carriers ?? [],
      bands: (extra.bands ?? state.bands ?? {}) as Record<string, { public: unknown; private: unknown } | null>,
      bandWarnings: (extra.step1_warnings ?? state.step1_warnings ?? []) as string[],
      fills: accepted.map((a) => ({ ...a, name: names.get(a.school_id) ?? null })),
      fillSummary,
      firstPassReport: await deps.dp.firstPassReport(run.thread_id),
    });
    return advance('deep_pass', [{ role: 'user', content: opening }], DEEP_PASS_PROMPT_KEY, DEEP_PASS_SEARCH_BUDGET,
      { ...extra, school_fill_summary: fillSummary, school_fills_accepted: accepted.length });
  };

  switch (run.pass_phase) {
    case 'prepare':
      return await guarded(async () => {
        if (!run.archetype_primary) throw new PermanentError('deep_pass_needs_step1: this thread has no archetype call yet');
        const step1 = await deps.dp.step1SchoolResults(run.thread_id);
        const extracted = extractStep1Schools(step1.results);
        const ppins = extracted.schools
          .filter((s) => s.public_private === 'private' && s.address_is_mailing)
          .map((s) => s.school_id.slice('private:'.length));

        let edge: Map<string, EdgeLocation> | null = new Map();
        let edgeError: string | null = null;
        if (ppins.length) {
          try {
            edge = await deps.edgePrivate(ppins);
          } catch (e) {
            if (!lastAttempt) throw e; // retry first; EDGE outages are usually brief
            edge = null;
            edgeError = e instanceof Error ? e.message : String(e);
          }
        }
        const { schools, fillList } = buildFillList(extracted.schools, edge);
        const patch = {
          step1_run_id: step1.runId, bands: extracted.bands, step1_warnings: extracted.warnings,
          schools, fill_list: fillList, edge_checked: ppins.length, edge_error: edgeError,
        };
        log(`${tag} step1_results=${step1.results.length} schools=${schools.length} edge_checked=${ppins.length} fill_list=${fillList.length}`);
        if (fillList.length === 0) {
          return await openDeepPass(schools, fillList, 'No school needed a web fill: every in-band school has NCES enrollment (or is planned) and an NCES-confirmed physical address.', patch);
        }
        return await advance('school_fill', [{ role: 'user', content: schoolFillOpening(fillList) }],
          SCHOOL_FILL_PROMPT_KEY, FILL_SEARCH_BUDGET, patch);
      });

    case 'school_fill': {
      const fillList = (state.fill_list ?? []) as FillItem[];
      return await runModelIteration(run, owner, {
        ...deps,
        clientTools: SCHOOL_FILL_CLIENT_TOOLS,
        webSearchTool: deps.webSearchTool,
        execute: async (name, input) => {
          if (name !== 'record_school_fill') throw new Error(`tool ${name} is not available in the school fill phase`);
          return validateSchoolFill(input, fillList);
        },
        onEndTurn: async ({ text }) =>
          await openDeepPass((state.schools ?? []) as SchoolRecord[], fillList, text, {}),
      });
    }

    case 'deep_pass': {
      const record = deps.recordEmployer ?? recordEmployer;
      const recordCompetitor = deps.recordCoffeeCompetitor ?? recordCoffeeCompetitor;
      const schoolsOnFile = (state.schools ?? []) as SchoolRecord[];
      return await runModelIteration(run, owner, {
        ...deps,
        clientTools: DEEP_PASS_CLIENT_TOOLS,
        webSearchTool: deps.webSearchTool,
        execute: async (name, input, r) => {
          // schoolsOnFile: a school recorded as an employer keeps its NCES distance, never a second one.
          if (name === 'record_employer') return await record(input, siteOf(r), undefined, schoolsOnFile);
          if (name === 'record_coffee_competitor') return await recordCompetitor(input, siteOf(r));
          if (name === 'query_nearby_schools') throw new Error('query_nearby_schools is not available in the deep pass; the school bands are already computed');
          return await deps.execute(name, input, r);
        },
        onEndTurn: async ({ text, convo }) =>
          await advance('exports', convo, null, 0, { report: text }),
      });
    }

    case 'exports':
      return await guarded(async () => {
        const report = typeof state.report === 'string' ? state.report : null;
        if (!report) throw new PermanentError('exports phase has no report text');

        const fills = (await deps.dp.committedToolOutputs(run.id, 'record_school_fill'))
          .map((o) => (o as { accepted?: AcceptedFill | null }).accepted).filter((a): a is AcceptedFill => !!a);
        const employers = (await deps.dp.committedToolOutputs(run.id, 'record_employer'))
          .map((o) => (o as { recorded?: RecordedEmployer | null }).recorded).filter((e): e is RecordedEmployer => !!e);
        const competitors = (await deps.dp.committedToolOutputs(run.id, 'record_coffee_competitor'))
          .map((o) => (o as { recorded?: RecordedCompetitor | null }).recorded).filter((c): c is RecordedCompetitor => !!c);
        const site = siteOf(run);
        // Atlas coffee is code-sourced: competitors.csv never depends on the model having called a tool.
        const atlas = site ? await deps.atlasCoffee(site) : [];
        const schoolsCsv = buildSchoolsCsv((state.schools ?? []) as SchoolRecord[], fills);
        const employersCsv = buildEmployersCsv(employers);
        const competitorsCsv = buildCompetitorsCsv(atlas, competitors);

        let exportsState: Record<string, unknown>;
        try {
          const uploaded = await deps.exportFiles(run.site_submit_id, [
            { name: 'schools.csv', bytes: csvBytes(schoolsCsv.csv) },
            { name: 'employers.csv', bytes: csvBytes(employersCsv.csv) },
            { name: 'competitors.csv', bytes: csvBytes(competitorsCsv.csv) },
          ]);
          exportsState = {
            status: 'uploaded',
            files: uploaded.map((u) => {
              const built = u.name === 'schools.csv' ? schoolsCsv : u.name === 'employers.csv' ? employersCsv : competitorsCsv;
              return { ...u, ...built.filtered, rows: built.rows.length };
            }),
          };
        } catch (e) {
          // Retry the upload first; on the last attempt deliver the report anyway rather than lose it.
          if (!lastAttempt) throw e;
          exportsState = { status: 'failed', error: e instanceof Error ? e.message : String(e) };
        }
        await deps.dp.patchState(run.id, owner, { exports: exportsState });

        const files = (exportsState.files ?? []) as Array<{ name: string; path: string; rows: number; flagged: number }>;
        const footer = exportsState.status === 'uploaded'
          ? `\n\n---\n**Exports** (site submit Dropbox folder): ${files.map((f) =>
              `${f.name} (${f.rows} rows` + (f.flagged ? `; ${f.flagged} flagged CHECK` : '') + ')').join(', ')} — ${files[0]?.path.replace(/\/[^/]+$/, '') ?? ''}. Nothing is filtered out of an export; the banded totals above are unchanged by it.`
          : `\n\n---\n**Exports failed:** the CSVs could not be written to Dropbox (${String(exportsState.error).slice(0, 300)}). The report above is complete.`;

        const result = await deps.db.finalize({
          runId: run.id, owner, iteration: run.iteration, attempt: run.attempt, convo: run.convo,
          content: report + footer, model: MODEL, parsed: false,
          archetypePrimary: null, archetypeSecondary: null, storyCarriers: null,
        });
        log(`${tag} exports=${exportsState.status} schools=${schoolsCsv.rows.length} employers=${employersCsv.rows.length} competitors=${competitorsCsv.rows.length} finalize=${result.status}`);
        return result.status;
      });

    default:
      return await fail(`deep_pass run has unknown pass_phase ${String(run.pass_phase)}`);
  }
}

// deno-lint-ignore no-explicit-any
type Service = { rpc: (fn: string, args?: Record<string, unknown>) => any; from: (t: string) => any };

export function supabaseDeepPassDb(service: Service): DeepPassDb {
  const committedOutputs = async (runId: string, toolName: string): Promise<unknown[]> => {
    const { data: steps, error: sErr } = await service
      .from('research_thread_run_step').select('iteration, attempt').eq('run_id', runId).eq('outcome', 'committed');
    if (sErr) throw new Error(`run step lookup failed: ${sErr.message}`);
    const committed = new Set(((steps ?? []) as Array<{ iteration: number; attempt: number }>).map((s) => `${s.iteration}:${s.attempt}`));
    const { data, error } = await service
      .from('research_thread_tool_result')
      .select('iteration, attempt, output, is_error, created_at')
      .eq('run_id', runId).eq('tool_name', toolName).eq('is_error', false)
      .order('iteration', { ascending: true }).order('created_at', { ascending: true })
      .range(0, 999);
    if (error) throw new Error(`tool result lookup failed: ${error.message}`);
    return ((data ?? []) as Array<{ iteration: number; attempt: number; output: unknown }>)
      .filter((r) => committed.has(`${r.iteration}:${r.attempt}`))
      .map((r) => r.output);
  };

  return {
    advancePhase: async (a) => {
      const { data, error } = await service.rpc('advance_thread_run_phase', {
        p_run_id: a.runId, p_owner: a.owner, p_iteration: a.iteration, p_attempt: a.attempt,
        p_next_phase: a.nextPhase, p_convo: a.convo, p_prompt_template_id: a.promptTemplateId,
        p_phase_search_budget: a.phaseSearchBudget, p_state_patch: a.statePatch,
      });
      if (error) throw new Error(`advance_thread_run_phase failed: ${error.message}`);
      return data === true;
    },
    patchState: async (runId, owner, patch) => {
      const { data, error } = await service.rpc('patch_thread_run_state', { p_run_id: runId, p_owner: owner, p_patch: patch });
      if (error) throw new Error(`patch_thread_run_state failed: ${error.message}`);
      return data === true;
    },
    step1SchoolResults: async (threadId) => {
      const { data: runs, error } = await service
        .from('research_thread_run').select('id')
        .eq('thread_id', threadId).eq('kind', 'archetype').eq('state', 'complete')
        .order('finished_at', { ascending: false }).limit(1);
      if (error) throw new Error(`step 1 run lookup failed: ${error.message}`);
      const runId = (runs as Array<{ id: string }> | null)?.[0]?.id ?? null;
      if (!runId) {
        throw new PermanentError('deep_pass_needs_step1_results: this thread has no Step 1 run with saved tool results (threads created before background runs have none). Start a new site story, then run the deep pass on it.');
      }
      return { runId, results: (await committedOutputs(runId, 'query_nearby_schools')).map((output) => ({ output })) };
    },
    committedToolOutputs: committedOutputs,
    promptIdByKey: async (key) => {
      const { data, error } = await service
        .from('prompt_template').select('id')
        .eq('key', key).eq('is_active', true).is('client_id', null)
        .order('version', { ascending: false }).limit(1);
      if (error) throw new Error(`prompt_template lookup failed: ${error.message}`);
      const id = (data as Array<{ id: string }> | null)?.[0]?.id;
      if (!id) throw new PermanentError(`no active prompt_template for key '${key}'`);
      return id;
    },
    firstPassReport: async (threadId) => {
      const { data, error } = await service
        .from('research_thread_message').select('content')
        .eq('thread_id', threadId).eq('seq', 0).eq('role', 'assistant').maybeSingle();
      if (error) throw new Error(`first pass report lookup failed: ${error.message}`);
      return (data as { content: string } | null)?.content ?? null;
    },
  };
}
