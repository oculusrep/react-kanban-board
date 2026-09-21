/**
 * One conversational turn: note (and any back-and-forth) in, reply + proposal out.
 *
 * Stateless — the browser sends the whole conversation each time, the same way
 * the Messages API itself works. Nothing is written to the database here; filing
 * is a separate, explicit action.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { anthropicCreate, buildBaseParams, CHAT_MODEL, CHAT_PRICING } from './config.ts';
import { runToolLoop } from './loop.ts';
import { PROPOSAL_OUTPUT_FORMAT, SYSTEM_PROMPT } from './prompt.ts';
import { cleanProposedLinks, cleanTags, cleanText, cleanUnresolved, type ModelAnswer, parseModelJson } from './proposal.ts';
import { createExecutor, TOOL_DEFINITIONS, verifyLinks } from './tools.ts';
import type { TurnMessage } from './messages.ts';

export type { TurnMessage };

export interface TurnResult {
  reply: string;
  proposal: {
    clean_text: string;
    links: Array<{ object_type: string; object_id: string; object_name: string }>;
    tags: string[];
    is_general: boolean;
  };
  ready_to_file: boolean;
  /** Proposed links that don't exist in OVIS; shown, never filed. */
  dropped_links: Array<{ object_type?: string; object_id?: string }>;
  /**
   * Names the model couldn't find — the panel offers to create these, prefilled
   * with any details verified against the note text.
   */
  unresolved: Array<{
    object_type: string;
    name: string;
    details?: Record<string, string>;
  }>;
  model: string;
  cost_usd: number | null;
}

/**
 * Run one turn.
 *
 * `rawText` is the user's original note — used only as the clean_text fallback if
 * the model returns an empty one, so a filed entry can never have empty text.
 */
export async function runTurn(opts: {
  service: SupabaseClient;
  apiKey: string;
  messages: TurnMessage[];
  rawText: string;
}): Promise<TurnResult> {
  const { service, apiKey, messages, rawText } = opts;
  if (messages.length === 0) throw Object.assign(new Error('messages is required'), { status: 400 });

  const result = await runToolLoop({
    create: anthropicCreate(apiKey),
    execute: createExecutor(service),
    baseParams: buildBaseParams(SYSTEM_PROMPT),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: TOOL_DEFINITIONS,
    pricing: CHAT_PRICING,
    outputFormat: PROPOSAL_OUTPUT_FORMAT,
  });

  const parsed = parseModelJson(result.text);
  const answer = await hydrate(service, parsed, rawText);

  return {
    reply: answer.reply,
    proposal: {
      clean_text: answer.clean_text,
      links: answer.links,
      tags: answer.tags,
      is_general: answer.is_general,
    },
    ready_to_file: answer.ready_to_file,
    dropped_links: answer.dropped_links,
    unresolved: answer.unresolved,
    model: CHAT_MODEL,
    cost_usd: result.cost_usd,
  };
}

/**
 * Turn the model's JSON into something safe to show and, later, to file: every
 * link id is checked against the live tables and carries the name OVIS holds, not
 * the name the model typed.
 */
async function hydrate(
  service: SupabaseClient,
  parsed: Record<string, unknown>,
  rawText: string,
): Promise<ModelAnswer> {
  const { links, dropped } = await verifyLinks(service, cleanProposedLinks(parsed.links));

  // is_general and links contradict each other. Trust the links: the model found
  // and confirmed real records, which is stronger evidence than the flag.
  const isGeneral = links.length > 0 ? false : parsed.is_general !== false;

  let reply = cleanText(parsed.reply, 'Here is what I have.');
  if (dropped.length > 0) {
    reply += `\n\n(I proposed ${dropped.length} record${dropped.length === 1 ? '' : 's'} I then ` +
      `couldn't find in OVIS, so I left ${dropped.length === 1 ? 'it' : 'them'} off. Add ` +
      `${dropped.length === 1 ? 'it' : 'them'} with the + button if you know the record.)`;
  }

  return {
    reply,
    clean_text: cleanText(parsed.clean_text, rawText),
    links,
    // rawText is the note the user actually typed: the only source a detail may
    // come from. verifyDetails() drops anything not found in it.
    unresolved: cleanUnresolved(parsed.unresolved, links, rawText),
    tags: cleanTags(parsed.tags),
    is_general: isGeneral,
    ready_to_file: parsed.ready_to_file === true,
    dropped_links: dropped,
  };
}
