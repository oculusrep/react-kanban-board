/**
 * One iteration of a background research run.
 *
 *   claim → [log start] → one model request → record response (cost lands now)
 *     → pause_turn : commit the paused turn, chain
 *     → tool_use   : run each client tool, persisting each result as it returns; commit, chain
 *     → end        : finalize (report message + archetype + run complete, one transaction)
 *   any transient error → release the lease (attempt failed, cost kept); the tick retries
 *   any permanent error → fail the run
 *
 * Every database write goes through lease-checked RPCs, so a worker that lost its lease
 * cannot commit, and a retried final iteration cannot write a second message.
 *
 * Dependencies are injected so the whole sequence is testable against fakes.
 */

import { parseArchetypeBlock } from './archetype.ts';
import {
  type Block, type CreateFn, type ExecuteFn, MAX_ITERATIONS, type ModelResponse, requestOnce,
  tokenCostUsd, USD_PER_WEB_SEARCH, webSearchRequests,
} from './loop.ts';
import { buildBaseParams, isPermanentApiError, MODEL, PRICING } from './model.ts';

export const LEASE_SECONDS = 420; // 400 s edge wall clock + margin

export interface ClaimedRun {
  id: string;
  thread_id: string;
  kind: 'archetype' | 'turn' | 'deep_pass';
  target_seq: number;
  prompt_template_id: string | null;
  iteration: number;
  attempt: number;
  convo: Array<Record<string, unknown>>;
  search_budget: number;
  web_search_requests: number;
  web_search_locked: boolean;
  site_submit_id: string;
  pinned_context: unknown;
  // Added by 20260915112139_site_research_deep_pass.sql. Optional so older fakes still type-check.
  max_attempts?: number;
  pass_phase?: 'prepare' | 'school_fill' | 'deep_pass' | 'exports' | null;
  phase_state?: Record<string, unknown>;
  phase_iteration_base?: number;
  phase_search_base?: number;
  archetype_primary?: string | null;
  archetype_secondary?: string | null;
  story_carriers?: string[] | null;
}

export interface WorkerDb {
  claim(runId: string, owner: string, leaseSeconds: number): Promise<ClaimedRun | null>;
  recordResponse(a: {
    runId: string; owner: string; iteration: number; attempt: number; stopReason: string | null;
    webSearchRequests: number; inputTokens: number; outputTokens: number;
    cacheReadTokens: number; cacheWriteTokens: number; costUsd: number;
  }): Promise<boolean>;
  recordToolResult(a: {
    runId: string; owner: string; iteration: number; attempt: number;
    toolUseId: string; toolName: string; input: unknown; output: unknown; isError: boolean;
  }): Promise<boolean>;
  completeStep(a: {
    runId: string; owner: string; iteration: number; attempt: number;
    convo: Array<Record<string, unknown>>; clientToolCalls: number; webSearchLocked: boolean;
  }): Promise<boolean>;
  finalize(a: {
    runId: string; owner: string; iteration: number; attempt: number; convo: Array<Record<string, unknown>>;
    content: string; model: string; parsed: boolean;
    archetypePrimary: string | null; archetypeSecondary: string | null; storyCarriers: string[] | null;
  }): Promise<{ status: 'finalized' | 'already_final' | 'lease_lost'; message_id?: string | null }>;
  release(runId: string, owner: string, iteration: number, attempt: number, error: string): Promise<void>;
  fail(runId: string, error: string): Promise<void>;
  promptBody(promptTemplateId: string | null): Promise<string>;
}

export interface IterationDeps {
  db: WorkerDb;
  create: CreateFn;
  execute: (name: string, input: Record<string, unknown>, run: ClaimedRun) => Promise<unknown>;
  clientTools: Array<Record<string, unknown>>;
  webSearchTool: Record<string, unknown> | null;
  chain: (runId: string) => Promise<void>;
  /**
   * What to do with a final (end_turn) response. Default: finalize the run with the text as
   * the thread message and parse the archetype block. The deep pass uses it to move to its
   * next phase instead. `convo` already ends with the assistant turn.
   */
  onEndTurn?: (a: { run: ClaimedRun; owner: string; text: string; convo: Array<Record<string, unknown>> }) => Promise<IterationOutcome>;
  onFailed?: (runId: string, error: string) => Promise<void>;
  log?: (msg: string) => void;
  now?: () => number;
}

export type IterationOutcome =
  | 'not_claimed' | 'chained' | 'finalized' | 'already_final' | 'lease_lost' | 'released' | 'failed';

export class PermanentError extends Error {}

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function runOneIteration(runId: string, owner: string, deps: IterationDeps): Promise<IterationOutcome> {
  const log = deps.log ?? ((m) => console.log(m));
  const run = await deps.db.claim(runId, owner, LEASE_SECONDS);
  if (!run) {
    log(`[site-research] run=${runId} not claimed (terminal, leased elsewhere, or out of attempts)`);
    return 'not_claimed';
  }
  return await runModelIteration(run, owner, deps);
}

/** One model request for an already-claimed run. */
export async function runModelIteration(run: ClaimedRun, owner: string, deps: IterationDeps): Promise<IterationOutcome> {
  const log = deps.log ?? ((m) => console.log(m));
  const now = deps.now ?? (() => Date.now());
  const tag = `[site-research] run=${run.id} iter=${run.iteration} attempt=${run.attempt}`;
  const t0 = now();
  log(`${tag} start kind=${run.kind} searches_so_far=${run.web_search_requests}/${run.search_budget}`);

  const fail = async (error: string): Promise<IterationOutcome> => {
    await deps.db.fail(run.id, error);
    log(`${tag} FAILED: ${error}`);
    if (deps.onFailed) await deps.onFailed(run.id, error).catch(() => {});
    return 'failed';
  };

  try {
    // Per phase for a deep pass (each phase starts its own conversation); per run otherwise.
    if (run.iteration - (run.phase_iteration_base ?? 0) >= MAX_ITERATIONS) {
      return await fail(`tool_loop_exhausted: reached ${MAX_ITERATIONS} iterations without a final answer${run.pass_phase ? ` in phase ${run.pass_phase}` : ''}`);
    }

    const systemPrompt = await deps.db.promptBody(run.prompt_template_id);
    const { resp, dropRejected } = await requestOnce({
      create: deps.create,
      baseParams: buildBaseParams(systemPrompt, run.pinned_context),
      convo: run.convo,
      clientTools: deps.clientTools,
      webSearchTool: deps.webSearchTool,
      searchBudget: run.search_budget,
      searchesUsed: run.web_search_requests,
      dropRejected: run.web_search_locked,
      log,
    });

    const usage = resp.usage ?? {};
    const searches = webSearchRequests(usage);
    const cost = tokenCostUsd(usage, PRICING) + searches * USD_PER_WEB_SEARCH;
    const stillLeased = await deps.db.recordResponse({
      runId: run.id, owner, iteration: run.iteration, attempt: run.attempt,
      stopReason: resp.stop_reason ?? null, webSearchRequests: searches,
      inputTokens: n(usage.input_tokens), outputTokens: n(usage.output_tokens),
      cacheReadTokens: n(usage.cache_read_input_tokens), cacheWriteTokens: n(usage.cache_creation_input_tokens),
      costUsd: cost,
    });
    if (!stillLeased) {
      log(`${tag} lease lost after the model responded; response discarded (cost recorded)`);
      return 'lease_lost';
    }

    if (resp.stop_reason === 'refusal') {
      throw new PermanentError(`model_refused: the model declined this request (category: ${resp.stop_details?.category ?? 'unspecified'})`);
    }

    const assistant = { role: 'assistant', content: resp.content };

    if (resp.stop_reason === 'pause_turn' || resp.stop_reason === 'tool_use') {
      const convo = [...run.convo, assistant];
      let toolCalls = 0;
      if (resp.stop_reason === 'tool_use') {
        const results: Block[] = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;
          const name = String(block.name);
          const id = String(block.id);
          const input = (block.input ?? {}) as Record<string, unknown>;
          toolCalls++;
          let output: unknown;
          let isError = false;
          try {
            output = await deps.execute(name, input, run);
          } catch (e) {
            // A dead tool is a finding for the model, not a crash of the run.
            isError = true;
            output = { error: e instanceof Error ? e.message : String(e) };
          }
          // Persisted the moment it returns: a worker killed after this keeps the result.
          await deps.db.recordToolResult({
            runId: run.id, owner, iteration: run.iteration, attempt: run.attempt,
            toolUseId: id, toolName: name, input, output, isError,
          });
          results.push(
            isError
              ? { type: 'tool_result', tool_use_id: id, is_error: true,
                  content: `Tool ${name} failed: ${(output as { error: string }).error}. Report this category as not determinable rather than guessing.` }
              : { type: 'tool_result', tool_use_id: id, content: JSON.stringify(output) },
          );
        }
        // All results in ONE user message, nothing but tool_result blocks.
        convo.push({ role: 'user', content: results });
      }
      const committed = await deps.db.completeStep({
        runId: run.id, owner, iteration: run.iteration, attempt: run.attempt,
        convo, clientToolCalls: toolCalls, webSearchLocked: dropRejected,
      });
      log(`${tag} end stop=${resp.stop_reason} tools=${toolCalls} searches=${searches} cost=${cost.toFixed(4)} ms=${now() - t0}${committed ? '' : ' (NOT committed: lease lost)'}`);
      if (!committed) return 'lease_lost';
      await deps.chain(run.id);
      return 'chained';
    }

    // end_turn / max_tokens: the final iteration.
    const text = resp.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();
    if (!text) throw new PermanentError(`empty_model_response (stop_reason: ${resp.stop_reason ?? 'null'})`);

    if (deps.onEndTurn) {
      const outcome = await deps.onEndTurn({ run, owner, text, convo: [...run.convo, assistant as Record<string, unknown>] });
      log(`${tag} end stop=${resp.stop_reason} end_turn=${outcome} searches=${searches} cost=${cost.toFixed(4)} ms=${now() - t0}`);
      return outcome;
    }

    const parsed = parseArchetypeBlock(text);
    if (!parsed) log(`${tag} no parseable archetype block; storing the text verbatim, columns unchanged`);
    const result = await deps.db.finalize({
      runId: run.id, owner, iteration: run.iteration, attempt: run.attempt,
      convo: [...run.convo, assistant as Record<string, unknown>],
      content: parsed ? parsed.prose : text, model: MODEL, parsed: !!parsed,
      archetypePrimary: parsed?.archetype_primary ?? null,
      archetypeSecondary: parsed?.archetype_secondary ?? null,
      storyCarriers: parsed ? parsed.story_carriers : null,
    });
    log(`${tag} end stop=${resp.stop_reason} finalize=${result.status} searches=${searches} cost=${cost.toFixed(4)} ms=${now() - t0}`);
    return result.status;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof PermanentError || isPermanentApiError(e)) return await fail(msg);
    await deps.db.release(run.id, owner, run.iteration, run.attempt, msg);
    log(`${tag} transient error, lease released for retry: ${msg}`);
    return 'released';
  }
}

// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => any; from: (t: string) => any };

/** WorkerDb backed by the lease-checked RPCs in 20260915094109_site_research_background_runs.sql. */
export function supabaseWorkerDb(service: Rpc): WorkerDb {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await service.rpc(fn, args);
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    return data as T;
  };
  return {
    claim: (runId, owner, lease) => call('claim_thread_run', { p_run_id: runId, p_owner: owner, p_lease_seconds: lease }),
    recordResponse: (a) => call('record_thread_run_response', {
      p_run_id: a.runId, p_owner: a.owner, p_iteration: a.iteration, p_attempt: a.attempt,
      p_stop_reason: a.stopReason, p_web_search_requests: a.webSearchRequests,
      p_input_tokens: a.inputTokens, p_output_tokens: a.outputTokens,
      p_cache_read_tokens: a.cacheReadTokens, p_cache_write_tokens: a.cacheWriteTokens, p_cost_usd: a.costUsd,
    }),
    recordToolResult: (a) => call('record_thread_tool_result', {
      p_run_id: a.runId, p_owner: a.owner, p_iteration: a.iteration, p_attempt: a.attempt,
      p_tool_use_id: a.toolUseId, p_tool_name: a.toolName, p_input: a.input, p_output: a.output, p_is_error: a.isError,
    }),
    completeStep: (a) => call('complete_thread_run_step', {
      p_run_id: a.runId, p_owner: a.owner, p_iteration: a.iteration, p_attempt: a.attempt,
      p_convo: a.convo, p_client_tool_calls: a.clientToolCalls, p_web_search_locked: a.webSearchLocked,
    }),
    finalize: (a) => call('finalize_thread_run', {
      p_run_id: a.runId, p_owner: a.owner, p_iteration: a.iteration, p_attempt: a.attempt, p_convo: a.convo,
      p_content: a.content, p_model: a.model, p_parsed: a.parsed,
      p_archetype_primary: a.archetypePrimary, p_archetype_secondary: a.archetypeSecondary, p_story_carriers: a.storyCarriers,
    }),
    release: (runId, owner, iteration, attempt, error) =>
      call('release_thread_run', { p_run_id: runId, p_owner: owner, p_iteration: iteration, p_attempt: attempt, p_error: error }),
    fail: (runId, error) => call('fail_thread_run', { p_run_id: runId, p_error: error }),
    promptBody: async (id) => {
      if (!id) throw new PermanentError('run has no prompt_template_id');
      const { data, error } = await service.from('prompt_template').select('body').eq('id', id).maybeSingle();
      if (error) throw new Error(`prompt_template lookup failed: ${error.message}`);
      if (!data?.body) throw new PermanentError(`prompt_template ${id} not found`);
      return data.body as string;
    },
  };
}

export type { ModelResponse };
