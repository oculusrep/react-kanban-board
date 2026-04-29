/**
 * Claude API shared module — Legal Orchestration
 *
 * Lightweight wrapper around the Anthropic SDK for the legal module's
 * AI calls (handbook extraction, clause matching, position decisions,
 * citation Q&A). Use-case-specific prompts and shapes live in caller
 * modules; this file owns:
 *
 *   - model constants (Sonnet 4.6 default, Opus 4.7 escalation)
 *   - client factory
 *   - retry-with-backoff for rate limits and 5xx
 *   - prompt-caching helpers for the playbook context
 *   - thin sendMessage / sendStructured / streamMessage entry points
 *
 * Prompt caching is critical: every redline analysis sends the playbook
 * as system context. Caching it amortizes the cost across all calls.
 *
 * SDK version 0.32.1 is the version already in OVIS use (matches
 * claude-cfo-agent.ts). The SDK is mostly a thin HTTP client, so
 * passing newer fields (cache_control, adaptive thinking, current
 * model IDs) works fine even on this older version — they're just
 * JSON properties on the request body.
 */

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';

// ============================================================================
// MODEL CONSTANTS
// ============================================================================

/** Sonnet 4.6 — default model for extraction, classification, citation Q&A. */
export const SONNET_MODEL = 'claude-sonnet-4-6';

/** Opus 4.7 — used for one-time handbook extraction and high-stakes / low-confidence position decisions. */
export const OPUS_MODEL = 'claude-opus-4-7';

/** Discriminator used by callers that want to log the model used. */
export type ClaudeModel = typeof SONNET_MODEL | typeof OPUS_MODEL;

// ============================================================================
// CLIENT FACTORY
// ============================================================================

/**
 * Returns a configured Anthropic client. Throws if ANTHROPIC_API_KEY is unset.
 */
export function createClaudeClient(): Anthropic {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY env var is not set');
  }
  return new Anthropic({ apiKey });
}

// ============================================================================
// RETRY-WITH-BACKOFF
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Wraps an Anthropic call with exponential backoff for 429s and 5xx errors.
 * Mirrors the pattern in claude-cfo-agent.ts but lighter; legal calls are
 * lower-volume than CFO chat so the longer per-minute backoff isn't needed.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 4, baseDelayMs = 2000, maxDelayMs = 60000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;
      const message = (error as Error).message || '';

      const isRateLimit = message.includes('429') || message.includes('rate_limit') || message.includes('would exceed');
      const isServerError = /\b5\d\d\b/.test(message) || message.includes('overloaded');
      const retryable = isRateLimit || isServerError;

      if (!retryable || attempt === maxRetries) {
        throw error;
      }

      const isPreemptiveLimit = message.includes('would exceed');
      const baseForAttempt = isPreemptiveLimit ? 30000 : baseDelayMs;
      const exponentialDelay = baseForAttempt * Math.pow(1.5, attempt);
      const jitter = Math.random() * 2000;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      console.log(`[claude] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms (${message.slice(0, 120)})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

/**
 * Build a system block array from one or more text segments, with optional
 * cache_control on each. Use this when the playbook is part of the system
 * prompt — the playbook segment should set `cached: true` so the prefix
 * gets reused across calls.
 *
 * Example:
 *   const system = buildSystem([
 *     { text: "You are an LOI legal analyst." },
 *     { text: playbookText, cached: true },  // ← cached prefix
 *   ]);
 */
export function buildSystem(
  segments: Array<{ text: string; cached?: boolean }>,
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  return segments.map((seg) => {
    const block: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } } = {
      type: 'text',
      text: seg.text,
    };
    if (seg.cached) {
      block.cache_control = { type: 'ephemeral' };
    }
    return block;
  });
}

// ============================================================================
// SEND MESSAGE — basic call
// ============================================================================

export interface SendMessageOptions {
  /** Which model to use. Defaults to Sonnet 4.6. */
  model?: ClaudeModel;
  /** System prompt. Either a plain string or an array from buildSystem(). */
  system?: string | ReturnType<typeof buildSystem>;
  /** User message. */
  user: string;
  /** Max output tokens. Defaults to 8192. */
  maxTokens?: number;
  /**
   * Adaptive thinking. Pass `true` for adaptive (default off).
   * Set `'summarized'` to also surface thinking summaries on Opus 4.7.
   */
  thinking?: boolean | 'summarized';
  /** Optional effort level for output_config. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface SendMessageResult {
  text: string;
  model: string;
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

/**
 * Send a single message and return the text response.
 *
 * For structured JSON output, use `sendStructured()` instead — it asks for
 * JSON and parses the response. For long outputs (handbook extraction),
 * use `streamMessage()`.
 */
export async function sendMessage(
  client: Anthropic,
  options: SendMessageOptions,
): Promise<SendMessageResult> {
  const {
    model = SONNET_MODEL,
    system,
    user,
    maxTokens = 8192,
    thinking,
    effort,
  } = options;

  // deno-lint-ignore no-explicit-any
  const requestBody: any = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };

  if (system) {
    requestBody.system = system;
  }

  if (thinking) {
    requestBody.thinking =
      thinking === 'summarized'
        ? { type: 'adaptive', display: 'summarized' }
        : { type: 'adaptive' };
  }

  if (effort) {
    requestBody.output_config = { effort };
  }

  const response = await withRetry(() => client.messages.create(requestBody));

  const textBlock = response.content.find((b) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;

  return {
    text: textBlock?.text ?? '',
    model: response.model,
    stopReason: response.stop_reason,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      // deno-lint-ignore no-explicit-any
      cacheReadTokens: (response.usage as any).cache_read_input_tokens ?? 0,
      // deno-lint-ignore no-explicit-any
      cacheCreationTokens: (response.usage as any).cache_creation_input_tokens ?? 0,
    },
  };
}

// ============================================================================
// SEND STRUCTURED — JSON-parsed response
// ============================================================================

export interface SendStructuredOptions<T> extends SendMessageOptions {
  /**
   * If provided, the parsed JSON is validated by this function. Throw to reject.
   * Useful for type-narrowing once the model returns valid-shaped data.
   */
  validate?: (data: unknown) => T;
}

export interface SendStructuredResult<T> extends Omit<SendMessageResult, 'text'> {
  data: T;
  rawText: string;
}

/**
 * Send a message expecting a JSON response. Strips ```json fences if present,
 * parses, and (optionally) validates.
 *
 * The caller is responsible for instructing the model to return JSON in the
 * user prompt — this function just parses the response.
 */
export async function sendStructured<T = unknown>(
  client: Anthropic,
  options: SendStructuredOptions<T>,
): Promise<SendStructuredResult<T>> {
  const result = await sendMessage(client, options);

  const cleaned = stripJsonFences(result.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from Claude response: ${(err as Error).message}\n\nRaw text:\n${result.text.slice(0, 500)}`,
    );
  }

  const data = options.validate ? options.validate(parsed) : (parsed as T);

  return {
    data,
    rawText: result.text,
    model: result.model,
    stopReason: result.stopReason,
    usage: result.usage,
  };
}

/**
 * Strip leading/trailing whitespace and ```json … ``` fences from a model
 * response. Models sometimes wrap JSON in fenced code blocks even when asked
 * for raw JSON.
 */
function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

// ============================================================================
// STREAM MESSAGE — long outputs (handbook extraction)
// ============================================================================

export interface StreamMessageOptions extends SendMessageOptions {
  /** Called for each text delta as it arrives. Optional. */
  onDelta?: (delta: string) => void;
}

/**
 * Stream a message and return the assembled final text.
 *
 * Use this for long-running calls (e.g., handbook extraction) where the
 * default 60s SDK timeout would otherwise abort the request. Streaming
 * keeps the connection alive on each token.
 */
export async function streamMessage(
  client: Anthropic,
  options: StreamMessageOptions,
): Promise<SendMessageResult> {
  const {
    model = SONNET_MODEL,
    system,
    user,
    maxTokens = 16384,
    thinking,
    effort,
    onDelta,
  } = options;

  // deno-lint-ignore no-explicit-any
  const requestBody: any = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) requestBody.system = system;
  if (thinking) {
    requestBody.thinking =
      thinking === 'summarized'
        ? { type: 'adaptive', display: 'summarized' }
        : { type: 'adaptive' };
  }
  if (effort) requestBody.output_config = { effort };

  return await withRetry(async () => {
    let assembledText = '';
    // deno-lint-ignore no-explicit-any
    const stream = (client.messages.stream(requestBody) as unknown) as any;

    if (onDelta && typeof stream.on === 'function') {
      stream.on('text', (delta: string) => {
        assembledText += delta;
        onDelta(delta);
      });
    }

    const finalMessage = await stream.finalMessage();

    // If we didn't subscribe to deltas, pull text from the final message.
    if (!onDelta) {
      const textBlock = finalMessage.content.find(
        // deno-lint-ignore no-explicit-any
        (b: any) => b.type === 'text',
      );
      assembledText = textBlock?.text ?? '';
    }

    return {
      text: assembledText,
      model: finalMessage.model,
      stopReason: finalMessage.stop_reason,
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
      },
    };
  });
}

// ============================================================================
// CONVENIENCE — pick model based on confidence threshold
// ============================================================================

/**
 * Returns OPUS_MODEL if any of the escalation conditions are met, else SONNET_MODEL.
 *
 * Per spec Q14: Sonnet default, Opus escalation when:
 *   - The clause is high-stakes (HIGH confidence tier per the playbook)
 *   - Sonnet's prior pass returned low confidence (< threshold)
 *   - The caller explicitly requests it (e.g., one-time handbook extraction)
 */
export function pickModel(args: {
  highStakes?: boolean;
  priorConfidence?: number;
  forceOpus?: boolean;
  confidenceThreshold?: number;
}): ClaudeModel {
  const { highStakes, priorConfidence, forceOpus, confidenceThreshold = 0.7 } = args;
  if (forceOpus) return OPUS_MODEL;
  if (highStakes) return OPUS_MODEL;
  if (priorConfidence !== undefined && priorConfidence < confidenceThreshold) {
    return OPUS_MODEL;
  }
  return SONNET_MODEL;
}
