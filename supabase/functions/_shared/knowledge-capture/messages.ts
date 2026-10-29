/**
 * Conversation history handling. Kept free of the Anthropic SDK import (which
 * config.ts owns) so it can be unit-tested without npm resolution — the same
 * reason site-research keeps its loop out of index.ts.
 */

export interface TurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Caps what a single capture conversation can carry. */
export const MAX_MESSAGES = 30;
export const MAX_MESSAGE_LENGTH = 4000;

/**
 * The browser sends the whole exchange each turn, so this is untrusted input:
 * drop anything that isn't a non-empty user/assistant string, keep the most
 * recent turns, and make sure the result starts on a user turn (the API rejects a
 * history that opens with an assistant message).
 */
export function normalizeMessages(raw: unknown): TurnMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: TurnMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, MAX_MESSAGE_LENGTH) });
  }
  const tail = out.slice(-MAX_MESSAGES);
  while (tail.length && tail[0].role !== 'user') tail.shift();
  return tail;
}
