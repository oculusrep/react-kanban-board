/**
 * The model/tool loop for ovis-site-research, with a run-level web search budget.
 *
 * Lives in its own module (not index.ts, which starts a server on import) so it can be
 * tested with a stubbed `create`, no network and no spend.
 *
 * WHY THE BUDGET IS COUNTED HERE: web_search's `max_uses` caps searches PER API REQUEST
 * (https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool). This
 * loop makes up to MAX_ITERATIONS requests, so a static max_uses of 12 allowed 12 x 15 =
 * 180 searches in one run. The budget is enforced across the whole loop instead:
 *
 *  - Searches actually run are summed from usage.server_tool_use.web_search_requests.
 *  - While budget remains, each request carries max_uses = remaining, so no single
 *    request can overshoot.
 *  - Once spent, web_search is removed from the tools, which leaves the client tools usable.
 *  - Exception: if the last assistant turn has a server_tool_use still waiting for its
 *    result (a search deferred because it was called in parallel with a client tool), the
 *    API requires the tool to stay defined on the next request. Then the tool stays, and
 *    tool_choice is set to none so no NEW call of any kind can start. The deferred search
 *    still runs; that single parallel group is the only possible overshoot.
 *  - If the API rejects a request that dropped the tool because earlier search blocks are
 *    in the history, the loop retries that request in the locked form and stays locked.
 *
 * Search fees are billed on top of tokens ($10 per 1,000 searches) and are included in
 * cost_usd, because cost_usd is the number used to decide whether this runs on every site.
 */

export const MAX_ITERATIONS = 15;
export const USD_PER_WEB_SEARCH = 10 / 1000; // https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool#usage-and-pricing

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

export interface LoopResult {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  /** Tokens + web search fees. */
  cost_usd: number | null;
  web_search_requests: number;
  stop_reason: string | null;
}

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function webSearchRequests(usage: Usage | undefined): number {
  const stu = usage?.server_tool_use as Record<string, unknown> | undefined;
  return n(stu?.web_search_requests);
}

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

/** A server_tool_use in this content with no result block carrying its id. */
export function hasPendingServerToolUse(content: Block[] | undefined): boolean {
  if (!Array.isArray(content)) return false;
  const answered = new Set(
    content.filter((b) => typeof b.type === 'string' && (b.type as string).endsWith('_tool_result'))
      .map((b) => String(b.tool_use_id)),
  );
  return content.some((b) => b.type === 'server_tool_use' && !answered.has(String(b.id)));
}

export type SearchPlan =
  | { mode: 'search'; maxUses: number }
  | { mode: 'drop' }
  | { mode: 'lock' };

export function planSearch(budget: number, used: number, pending: boolean, dropRejected: boolean): SearchPlan {
  const remaining = budget - used;
  if (remaining > 0) return { mode: 'search', maxUses: remaining };
  return pending || dropRejected ? { mode: 'lock' } : { mode: 'drop' };
}

function isDropRejection(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  const msg = String(err?.message ?? '');
  return (err?.status === 400 || /\b400\b/.test(msg)) && msg.includes('web_search');
}

/** Build request params for one model call under a search plan. */
export function buildRequestParams(
  baseParams: Record<string, unknown>,
  convo: Array<Record<string, unknown>>,
  clientTools: Array<Record<string, unknown>>,
  webSearchTool: Record<string, unknown> | null,
  plan: SearchPlan,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...baseParams, messages: convo };
  const tools: Array<Record<string, unknown>> = [];
  if (webSearchTool && plan.mode === 'search') tools.push({ ...webSearchTool, max_uses: plan.maxUses });
  if (webSearchTool && plan.mode === 'lock') tools.push({ ...webSearchTool, max_uses: 1 });
  tools.push(...clientTools);
  if (tools.length) params.tools = tools;
  if (webSearchTool && plan.mode === 'lock') params.tool_choice = { type: 'none' };
  return params;
}

/** The last assistant turn in a conversation, for detecting a deferred server tool call. */
export function lastAssistantContent(convo: Array<Record<string, unknown>>): Block[] | undefined {
  for (let i = convo.length - 1; i >= 0; i--) {
    if (convo[i].role === 'assistant') return convo[i].content as Block[];
    if (convo[i].role === 'user' && typeof convo[i].content === 'string') return undefined;
  }
  return undefined;
}

/**
 * ONE model request under the run-level search budget, including the fallback when
 * the API rejects dropping web_search. Used by the background worker (one request per
 * invocation) and by runToolLoop (tests / synchronous callers).
 */
export async function requestOnce(opts: {
  create: CreateFn;
  baseParams: Record<string, unknown>;
  convo: Array<Record<string, unknown>>;
  clientTools: Array<Record<string, unknown>>;
  webSearchTool: Record<string, unknown> | null;
  searchBudget: number;
  searchesUsed: number;
  dropRejected: boolean;
  log?: (msg: string) => void;
}): Promise<{ resp: ModelResponse; plan: SearchPlan; dropRejected: boolean }> {
  const log = opts.log ?? ((m) => console.log(m));
  let dropRejected = opts.dropRejected;
  let plan: SearchPlan = opts.webSearchTool
    ? planSearch(opts.searchBudget, opts.searchesUsed, hasPendingServerToolUse(lastAssistantContent(opts.convo)), dropRejected)
    : { mode: 'drop' };
  const build = (p: SearchPlan) => buildRequestParams(opts.baseParams, opts.convo, opts.clientTools, opts.webSearchTool, p);
  try {
    return { resp: await opts.create(build(plan)), plan, dropRejected };
  } catch (e) {
    if (opts.webSearchTool && plan.mode === 'drop' && isDropRejection(e)) {
      log('[site-research] API rejected dropping web_search from a history that contains searches; locking tool calls instead');
      dropRejected = true;
      plan = { mode: 'lock' };
      return { resp: await opts.create(build(plan)), plan, dropRejected };
    }
    throw e;
  }
}

export async function runToolLoop(opts: {
  create: CreateFn;
  execute: ExecuteFn;
  baseParams: Record<string, unknown>; // model, max_tokens, system, thinking, output_config, betas...
  messages: Array<Record<string, unknown>>;
  clientTools: Array<Record<string, unknown>>;
  webSearchTool: Record<string, unknown> | null; // null = no web search at all
  searchBudget: number;
  pricing: Pricing;
  log?: (msg: string) => void;
}): Promise<LoopResult> {
  const log = opts.log ?? ((m) => console.log(m));
  const convo = opts.messages.map((m) => ({ ...m }));

  let inTok = 0, outTok = 0, costUsd = 0, sawUsage = false, searches = 0;
  let lastStop: string | null = null;
  let dropRejected = false;
  const toolsUsed: string[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const r = await requestOnce({
      create: opts.create, baseParams: opts.baseParams, convo, clientTools: opts.clientTools,
      webSearchTool: opts.webSearchTool, searchBudget: opts.searchBudget, searchesUsed: searches,
      dropRejected, log,
    });
    const resp = r.resp;
    dropRejected = r.dropRejected;

    if (resp.usage) {
      sawUsage = true;
      inTok += n(resp.usage.input_tokens);
      outTok += n(resp.usage.output_tokens);
      const s = webSearchRequests(resp.usage);
      searches += s;
      costUsd += tokenCostUsd(resp.usage, opts.pricing) + s * USD_PER_WEB_SEARCH;
    }
    lastStop = resp.stop_reason ?? null;

    if (opts.webSearchTool && searches > opts.searchBudget) {
      log(`[site-research] web search budget overshoot: ${searches}/${opts.searchBudget} (a deferred parallel search ran after the budget was spent)`);
    }

    // Always check stop_reason before reading content — a refusal returns HTTP 200.
    if (resp.stop_reason === 'refusal') {
      const cat = resp.stop_details?.category ?? 'unspecified';
      throw new Error(`model_refused: the model declined this request (category: ${cat})`);
    }

    // pause_turn: a server tool is mid-flight. Echo the content back verbatim.
    if (resp.stop_reason === 'pause_turn') {
      convo.push({ role: 'assistant', content: resp.content });
      continue;
    }

    if (resp.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: resp.content });
      // All results in ONE user message, nothing but tool_result blocks — the API
      // requires that when a deferred server tool is waiting on this turn.
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
          log(`[site-research] tool ${name} failed: ${detail}`);
          results.push({
            type: 'tool_result',
            tool_use_id: id,
            is_error: true,
            content: `Tool ${name} failed: ${detail}. Report this category as not determinable rather than guessing.`,
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

    log(
      `[site-research] finished in ${iteration + 1} iteration(s); web searches: ${searches}` +
        `${opts.webSearchTool ? `/${opts.searchBudget}` : ''}; cost_usd: ${costUsd.toFixed(4)}; tools: ${
          toolsUsed.length ? toolsUsed.join(', ') : 'none'
        }`,
    );

    return {
      text,
      input_tokens: sawUsage ? inTok : null,
      output_tokens: sawUsage ? outTok : null,
      cost_usd: sawUsage ? costUsd : null,
      web_search_requests: searches,
      stop_reason: lastStop,
    };
  }

  throw new Error(
    `tool_loop_exhausted: hit MAX_ITERATIONS (${MAX_ITERATIONS}) without a final answer. ` +
      `Web searches: ${searches}. Tools called: ${toolsUsed.join(', ') || 'none'}.`,
  );
}
