/**
 * Model configuration for Knowledge Capture — the ONLY place a model string is
 * named. Business logic (tools, prompt, converse, file) imports from here and
 * never hardcodes a model, so swapping either model is a change to this file
 * plus, for a provider swap, embedding.ts.
 *
 * Every value can be overridden with a Supabase secret, so a model can be
 * changed (or rolled back) without a deploy:
 *
 *   KNOWLEDGE_CHAT_MODEL            e.g. claude-opus-5
 *   KNOWLEDGE_CHAT_MAX_TOKENS
 *   KNOWLEDGE_CHAT_EFFORT           low | medium | high | xhigh | max
 *   KNOWLEDGE_EMBEDDING_MODEL       e.g. text-embedding-3-large
 *   KNOWLEDGE_EMBEDDING_DIMENSIONS  must match knowledge_entry.embedding's width
 *
 * Follows the shape of _shared/site-research/model.ts (buildBaseParams +
 * anthropicCreate + PRICING), which is the repo's existing pattern.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';
import type { CreateFn, ModelResponse, Pricing } from './loop.ts';

function envStr(key: string, fallback: string): string {
  const v = Deno.env.get(key);
  return v && v.trim() ? v.trim() : fallback;
}

function envInt(key: string, fallback: number): number {
  const v = Number(Deno.env.get(key));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

// ---------------------------------------------------------------------------
// Chat model
// ---------------------------------------------------------------------------
// Claude Sonnet 5: this loop reads one short note and makes a few name lookups
// against Postgres. It is not the reasoning-heavy work site-research does on
// Opus, and it runs in the browser's request path, so latency matters.
export const CHAT_MODEL = envStr('KNOWLEDGE_CHAT_MODEL', 'claude-sonnet-5');

// Replies are a couple of sentences plus a small JSON proposal. Non-streaming,
// so this also stays well inside the SDK's HTTP timeout.
export const CHAT_MAX_TOKENS = envInt('KNOWLEDGE_CHAT_MAX_TOKENS', 4000);

// 'low' — matching a note to a handful of records is shallow work, and the user
// is waiting on the reply. Raise via the secret if tagging quality disappoints;
// knowledge_capture_correction.proposal_model is what tells you whether it did.
export const CHAT_EFFORT = envStr('KNOWLEDGE_CHAT_EFFORT', 'low');

// Anthropic pricing, $/million tokens, for Claude Sonnet 5 (verified 2026-09-20
// against the Claude API model table). Cache reads bill at 0.1x input, writes at
// 1.25x. Update alongside CHAT_MODEL — these two travel together.
export const CHAT_PRICING: Pricing = {
  usdPerMInput: 2.0,
  usdPerMOutput: 10.0,
  usdPerMCacheRead: 0.2,
  usdPerMCacheWrite: 2.5,
};

// One model request should take seconds. Cap it well inside the edge function's
// wall clock so a hung request returns an error the panel can show, rather than
// the platform killing the function.
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Base request params. The system prompt is the cached prefix: it's identical on
 * every turn and every user, so each request after the first reads it from cache.
 */
export function buildBaseParams(systemPrompt: string): Record<string, unknown> {
  // Also used, unchanged, for the one-shot signature extraction (emailLookup.ts):
  // same model and effort, its own cached system prompt.
  return {
    model: CHAT_MODEL,
    max_tokens: CHAT_MAX_TOKENS,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    // Sonnet 5 takes adaptive thinking only — budget_tokens is rejected with a 400.
    thinking: { type: 'adaptive' },
    output_config: { effort: CHAT_EFFORT },
  };
}

/**
 * The model call. No SDK retries: one attempt, so a failure surfaces in the panel
 * and the user can resend, rather than silently costing 3x on a bad day.
 */
export function anthropicCreate(apiKey: string): CreateFn {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
  return (params) => client.messages.create(params as never) as unknown as Promise<ModelResponse>;
}

// ---------------------------------------------------------------------------
// Embedding model
// ---------------------------------------------------------------------------
// OpenAI text-embedding-3-small at 1536 dimensions — the width of
// knowledge_entry.embedding. Changing EMBEDDING_DIMENSIONS alone will make every
// insert fail: the column is vector(1536), so a new width needs a migration
// first. createEmbedding() asserts the returned length matches.
export const EMBEDDING_MODEL = envStr('KNOWLEDGE_EMBEDDING_MODEL', 'text-embedding-3-small');
export const EMBEDDING_DIMENSIONS = envInt('KNOWLEDGE_EMBEDDING_DIMENSIONS', 1536);
