/**
 * Anthropic model configuration for site research, shared by the worker.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';
import type { CreateFn, ModelResponse, Pricing } from './loop.ts';

// Claude Opus 5. Do NOT copy 'claude-sonnet-4-20250514' from claude-cfo-agent.ts —
// that model string is behind current releases.
export const MODEL = 'claude-opus-5';

// Non-streaming ceiling. Adaptive thinking tokens count against this.
export const MAX_TOKENS = 16000;

// Anthropic pricing, $/million tokens, verified 2026-09-10 against the Claude API
// model table. Cache reads bill at 0.1x input, cache writes at 1.25x. Web search
// fees are in loop.ts (USD_PER_WEB_SEARCH).
export const PRICING: Pricing = {
  usdPerMInput: 5.0,
  usdPerMOutput: 25.0,
  usdPerMCacheRead: 0.5,
  usdPerMCacheWrite: 6.25,
};

// Server-side refusal fallback: on a policy decline the API re-runs the request on a
// fallback model inside the same call. Flip to false (one line) if the beta is not
// enabled for the org and requests start 400ing.
const ENABLE_REFUSAL_FALLBACK = true;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// A single model request should finish in ~1-2 minutes. Cap it well inside the edge
// function's 400 s wall clock so a hung request fails this attempt (and the engine
// retries) instead of the platform killing the worker mid-write.
const REQUEST_TIMEOUT_MS = 240_000;

/** System = the versioned prompt body, then the frozen site snapshot (cached prefix). */
export function buildBaseParams(systemPrompt: string, pinnedContext: unknown): Record<string, unknown> {
  const params: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: systemPrompt },
      {
        type: 'text',
        text: `Frozen site snapshot for this thread (JSON):\n${JSON.stringify(pinnedContext, null, 2)}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    // Opus 5 runs adaptive thinking by default; stated explicitly so a future reader
    // does not "helpfully" add budget_tokens (removed — 400 on Opus 5).
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
  };
  if (ENABLE_REFUSAL_FALLBACK) {
    params.betas = [FALLBACK_BETA];
    params.fallbacks = 'default';
  }
  return params;
}

/**
 * The model call. No SDK retries: one attempt per iteration attempt, so a failure
 * releases the lease and the engine's attempt counter (max 3) governs retries — each
 * of which is visible, with its cost, in research_thread_run_step.
 */
export function anthropicCreate(apiKey: string): CreateFn {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
  // Single cast at the call boundary: `fallbacks` is a beta parameter whose types lag
  // the pinned SDK version.
  return (params) => client.beta.messages.create(params as never) as unknown as Promise<ModelResponse>;
}

/**
 * Errors that a retry cannot fix: bad request, auth, not found, payload too large,
 * unprocessable. Everything else (429, 408, 409, 5xx, 529, network, timeouts) is
 * treated as transient.
 */
export function isPermanentApiError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return typeof status === 'number' && [400, 401, 403, 404, 413, 422].includes(status);
}
