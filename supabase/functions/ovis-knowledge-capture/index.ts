/**
 * OVIS Knowledge Capture — Edge Function.
 *
 * The conversational endpoint behind the Knowledge Capture panel: a note comes in,
 * the model proposes which OVIS records and topics it belongs to, the user
 * confirms or corrects, and it is filed permanently.
 *
 * Two actions, both requiring a Supabase user JWT from an internal user:
 *
 *   1. { action: 'converse', messages, entry_draft } -> { reply, proposal, ready_to_file }
 *      One turn of the conversation. Stateless: the browser sends the whole
 *      exchange each time. Nothing is written.
 *
 *   2. { action: 'file', entry } -> { entry_id, embedded, correction_written }
 *      Writes entry + links + tags (+ a correction row when the saved state
 *      differs from the model's first proposal) in one transaction, as the user,
 *      and stores the embedding.
 *
 * Unlike ovis-site-research this runs synchronously. That function had to move to
 * a background queue because Opus with web search blew past Supabase's 150 s idle
 * timeout; a turn here is Sonnet plus a few name lookups against Postgres, so the
 * browser can wait for it.
 *
 * Docs: docs/KNOWLEDGE_CAPTURE.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { runTurn } from '../_shared/knowledge-capture/converse.ts';
import { normalizeMessages } from '../_shared/knowledge-capture/messages.ts';
import { fileEntry } from '../_shared/knowledge-capture/file.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ---- Auth: user JWT only. Same shape as ovis-site-research. ----
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (!bearer) return jsonResponse({ error: 'missing_jwt' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } },
  );

  const { data: authData, error: authErr } = await userClient.auth.getUser(bearer);
  if (authErr || !authData?.user) return jsonResponse({ error: 'invalid_jwt' }, 401);

  // Internal users only — company knowledge, not portal or coach content. Called
  // on userClient so auth.uid() resolves inside the helper. The UI gate is a
  // convenience; this is the control.
  const { data: isInternal, error: gateErr } = await userClient.rpc('is_internal_user');
  if (gateErr) return jsonResponse({ error: 'permission_check_failed', detail: gateErr.message }, 500);
  if (!isInternal) {
    return jsonResponse({ error: 'forbidden', detail: 'internal users only' }, 403);
  }

  try {
    const action = body.action;
    if (action === 'converse') return await converse(service, body);
    if (action === 'file') return await file(service, userClient, body);
    return jsonResponse({ error: 'unknown_action', detail: String(action ?? '') }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[knowledge-capture] failed:', detail);
    return jsonResponse({ error: status === 500 ? 'internal_error' : 'request_failed', detail }, status);
  }
});

// ---------------------------------------------------------------------------
// Action: converse
// ---------------------------------------------------------------------------
async function converse(service: SupabaseClient, body: Record<string, unknown>): Promise<Response> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonResponse({ error: 'anthropic_key_missing' }, 500);

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    return jsonResponse({ error: 'messages is required' }, 400);
  }

  // entry_draft.raw_text is the note as typed. Used only as the clean_text
  // fallback; the first user message carries the same text to the model.
  const draft = (body.entry_draft ?? {}) as Record<string, unknown>;
  const rawText = typeof draft.raw_text === 'string' && draft.raw_text.trim()
    ? draft.raw_text.trim()
    : messages[0].content;

  const result = await runTurn({ service, apiKey, messages, rawText });
  return jsonResponse(result);
}

// ---------------------------------------------------------------------------
// Action: file
// ---------------------------------------------------------------------------
async function file(
  service: SupabaseClient,
  userClient: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const entry = (body.entry ?? body) as Record<string, unknown>;
  const result = await fileEntry({
    service,
    userClient,
    body: {
      raw_text: String(entry.raw_text ?? ''),
      clean_text: String(entry.clean_text ?? ''),
      source: typeof entry.source === 'string' ? entry.source : undefined,
      is_general: entry.is_general === true,
      links: entry.links,
      tags: entry.tags,
      proposed: entry.proposed,
      proposal_model: typeof entry.proposal_model === 'string' ? entry.proposal_model : undefined,
    },
  });
  return jsonResponse(result, 201);
}
