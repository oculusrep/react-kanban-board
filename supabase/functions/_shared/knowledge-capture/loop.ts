/**
 * The model/tool loop for Knowledge Capture.
 *
 * Same pattern as _shared/site-research/loop.ts — check stop_reason before
 * reading content, echo a paused turn back verbatim, return every tool_result in
 * ONE user message, cap the iterations — but deliberately its own file, because
 * that loop is mostly web-search budget and code-execution container handling.
 * This feature has neither tool, and its tool-failure text ("report this
 * category as not determinable") is site-research's wording, not ours.
 *
 * Lives in its own module (not index.ts, which starts a server on import) so it
 * can be tested with a stubbed `create`: no network, no spend.
 */

// A note plus a handful of name lookups. If the model hasn't settled in 6
// requests it's looping, not working.
export const MAX_ITERATIONS = 6;

export type Block = Record<string, unknown>;
export type Usage = Record<string, unknown>;

export interface ModelResponse {
  content: Block[];
  usage?: Usage;
  stop_reason?: string | null;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
}

export type CreateFn = (params: Record<string, unknown>) => Promise<ModelResponse>;

export type ExecuteFn = (name: string, input: Record<string, unknown>) => Promise<unknown>;

export interface Pricing {
  usdPerMInput: number;
  usdPerMOutput: number;
  usdPerMCacheRead: number;
  usdPerMCacheWrite: number;
}

/**
 * A 400 that names the output format, i.e. the API refusing structured output for
 * this request shape (most plausibly alongside tools, which is a combination the
 * docs don't spell out). Such a request can be retried without the format: the
 * prompt states the required JSON shape too, and parseModelJson accepts the
 * fenced/embedded forms, so the turn degrades instead of failing.
 */
export function isOutputFormatRejection(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (status !== 400) return false;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /output_config|output_format|json_schema|response_format/.test(msg);
}

export interface LoopResult {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  stop_reason: string | null;
  tools_used: string[];
}

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function tokenCostUsd(usage: Usage | undefined, p: Pricing): number {
  if (!usage) return 0;
  return (
    (n(usage.input_tokens) * p.usdPerMInput +
      n(usage.output_tokens) * p.usdPerMOutput +
      n(usage.cache_read_input_tokens) * p.usdPerMCacheRead +
      n(usage.cache_creation_input_tokens) * p.usdPerMCacheWrite) /
    1_000_000
  );
}

export async function runToolLoop(opts: {
  create: CreateFn;
  execute: ExecuteFn;
  /** model, max_tokens, system, thinking, output_config — from config.buildBaseParams(). */
  baseParams: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  pricing: Pricing;
  /** Constrains the FINAL answer only; tool calls are unaffected. */
  outputFormat?: Record<string, unknown> | null;
  log?: (msg: string) => void;
}): Promise<LoopResult> {
  const log = opts.log ?? ((m) => console.log(m));
  const convo = opts.messages.map((m) => ({ ...m }));
  const toolsUsed: string[] = [];

  let inTok = 0, outTok = 0, costUsd = 0, sawUsage = false;
  let lastStop: string | null = null;
  let formatDropped = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const params: Record<string, unknown> = {
      ...opts.baseParams,
      messages: convo,
      tools: opts.tools,
    };
    if (opts.outputFormat && !formatDropped) {
      // Merge, don't replace: baseParams already carries output_config.effort.
      params.output_config = {
        ...(opts.baseParams.output_config as Record<string, unknown> ?? {}),
        format: opts.outputFormat,
      };
    }

    let resp: ModelResponse;
    try {
      resp = await opts.create(params);
    } catch (e) {
      // One retry, without the format, then stay without it for the rest of the loop.
      if (opts.outputFormat && !formatDropped && isOutputFormatRejection(e)) {
        log('[knowledge-capture] API rejected the structured output format; retrying without it');
        formatDropped = true;
        delete params.output_config;
        if (opts.baseParams.output_config) params.output_config = opts.baseParams.output_config;
        resp = await opts.create(params);
      } else {
        throw e;
      }
    }

    if (resp.usage) {
      sawUsage = true;
      inTok += n(resp.usage.input_tokens);
      outTok += n(resp.usage.output_tokens);
      costUsd += tokenCostUsd(resp.usage, opts.pricing);
    }
    lastStop = resp.stop_reason ?? null;

    // Always check stop_reason before reading content — a refusal returns HTTP 200.
    if (resp.stop_reason === 'refusal') {
      const cat = resp.stop_details?.category ?? 'unspecified';
      throw new Error(`model_refused: the model declined this request (category: ${cat})`);
    }

    // A server tool is mid-flight. Echo the content back verbatim.
    if (resp.stop_reason === 'pause_turn') {
      convo.push({ role: 'assistant', content: resp.content });
      continue;
    }

    if (resp.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: resp.content });
      // All results in ONE user message: splitting them teaches the model to
      // stop calling tools in parallel.
      const results: Block[] = [];
      for (const block of resp.content) {
        if (block.type !== 'tool_use') continue;
        const name = String(block.name);
        const id = String(block.id);
        toolsUsed.push(name);
        try {
          const out = await opts.execute(name, (block.input ?? {}) as Record<string, unknown>);
          results.push({ type: 'tool_result', tool_use_id: id, content: JSON.stringify(out) });
        } catch (e) {
          const detail = e instanceof Error ? e.message : String(e);
          log(`[knowledge-capture] tool ${name} failed: ${detail}`);
          results.push({
            type: 'tool_result',
            tool_use_id: id,
            is_error: true,
            content:
              `Tool ${name} failed: ${detail}. Say you couldn't search OVIS for that and ask the ` +
              'user to confirm the record by name — do not invent an id.',
          });
        }
      }
      convo.push({ role: 'user', content: results });
      continue;
    }

    // end_turn / max_tokens — done.
    const text = resp.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();
    if (!text) throw new Error(`empty_model_response (stop_reason: ${resp.stop_reason ?? 'null'})`);
    // max_tokens means the JSON is very likely cut off mid-structure; say so
    // here rather than letting the parse fail with something cryptic.
    if (resp.stop_reason === 'max_tokens') {
      throw new Error('response_truncated: the model hit max_tokens before finishing its answer');
    }

    log(
      `[knowledge-capture] finished in ${iteration + 1} iteration(s); cost_usd: ${costUsd.toFixed(5)}` +
        `; tools: ${toolsUsed.length ? toolsUsed.join(', ') : 'none'}`,
    );

    return {
      text,
      input_tokens: sawUsage ? inTok : null,
      output_tokens: sawUsage ? outTok : null,
      cost_usd: sawUsage ? costUsd : null,
      stop_reason: lastStop,
      tools_used: toolsUsed,
    };
  }

  throw new Error(
    `tool_loop_exhausted: hit MAX_ITERATIONS (${MAX_ITERATIONS}) without a final answer. ` +
      `Tools called: ${toolsUsed.join(', ') || 'none'}.`,
  );
}
