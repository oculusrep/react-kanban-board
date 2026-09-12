/**
 * OVIS Site Research — Edge Function
 *
 * The in-app research thread behind "Site story" on the Starbucks site_submit
 * sidebar. Calls the Anthropic API DIRECTLY — this is interactive, single-site,
 * request/response work. The OpenClaw external-agent pattern
 * (ovis-research-trigger + ovis-research-mcp) stays where it belongs: unattended
 * multi-site enumeration.
 *
 * Two actions, both requiring a Supabase user JWT:
 *
 *   1. { action: 'create_thread', site_submit_id }
 *      Resolves the site coordinate by the documented precedence, freezes a
 *      site+property snapshot into pinned_context, inserts the thread, resolves
 *      the active prompt_template, calls the model, parses the archetype block
 *      into columns, and writes the assistant message at seq 0.
 *
 *   2. { action: 'send_turn', thread_id, message }
 *      Appends the user turn, replays pinned_context + prior messages, writes
 *      the assistant reply.
 *
 * The gate (Starbucks account family + can_run_market_research) is re-checked
 * here on every call. The UI gate is a convenience, not a control.
 *
 * See docs/SITE_RESEARCH_THREAD_PHASE1.md.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// npm: specifier, NOT esm.sh. claude-cfo-agent.ts imports
// https://esm.sh/@anthropic-ai/sdk@0.32.1, but that pin predates every parameter
// this function needs (adaptive thinking, output_config.effort, the beta
// fallbacks field) — and esm.sh's build service currently 500s on the modern
// versions, so `deno check` can't even resolve their types. The npm: specifier
// resolves and typechecks cleanly under both Deno and the Supabase edge runtime.
import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';

// Gates research to the Starbucks account family: the Starbucks client itself OR
// any client whose parent_id is Starbucks (child accounts like
// "Starbucks - JW (Coastal GA)"). Mirrors ovis-research-trigger and
// SiteSubmitSidebar.tsx. Adding another client later is a constant change here
// plus a prompt_template row — never a prompt rewrite.
const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';

const PROMPT_KEY = 'archetype_call';

// Claude Opus 5. Do NOT copy 'claude-sonnet-4-20250514' from claude-cfo-agent.ts
// — that model string is behind current releases.
const MODEL = 'claude-opus-5';

// Non-streaming ceiling. Adaptive thinking tokens count against this, so leave
// real headroom; 16k keeps a normal turn well under the HTTP timeout. If turns
// ever start hitting the wall clock, that is the signal to switch to streaming
// + postgres_changes (see the Phase 1 doc).
const MAX_TOKENS = 16000;

// Anthropic pricing, $/million tokens, verified 2026-09-10 against the Claude
// API model table. Cache reads bill at 0.1x input, cache writes at 1.25x.
const USD_PER_M_INPUT = 5.0;
const USD_PER_M_OUTPUT = 25.0;
const USD_PER_M_CACHE_READ = USD_PER_M_INPUT * 0.1;
const USD_PER_M_CACHE_WRITE = USD_PER_M_INPUT * 1.25;

// Server-side refusal fallback: on a policy decline the API re-runs the request
// on a fallback model inside the same call, instead of just stopping. Retail
// site analysis is about as unlikely to trip a classifier as text gets, so this
// is insurance rather than a necessity — flip to false (one line) if the beta
// is not enabled for the org and requests start 400ing.
const ENABLE_REFUSAL_FALLBACK = true;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const ARCHETYPES = ['GROWTH', 'MATURE', 'REDEVELOPMENT', 'RELIEF', 'WHITE_SPACE'] as const;
type Archetype = (typeof ARCHETYPES)[number];

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

// ---------------------------------------------------------------------------
// Retry — same shape as claude-cfo-agent.ts's withRetry, at the spec's timings.
// ---------------------------------------------------------------------------
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelayMs = 2000, maxDelayMs = 30000 } = {},
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;
      const msg = (error as Error).message ?? '';
      // Retry only on transient failures. A 400 (bad params) retried three
      // times is three times the latency and the same error.
      const retryable =
        msg.includes('429') ||
        msg.includes('rate_limit') ||
        msg.includes('rate limit') ||
        msg.includes('overloaded') ||
        msg.includes('529') ||
        /\b5\d\d\b/.test(msg);
      if (!retryable || attempt === maxRetries) throw error;

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      console.warn(`[site-research] retry ${attempt + 1}/${maxRetries} in ${delay}ms: ${msg}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Coordinate resolution — REQUIRED precedence.
// ---------------------------------------------------------------------------
// Verified always beats unverified, regardless of which table it lives on:
//   site_submit.verified -> property.verified -> site_submit.sf_property -> property.lat
// A tier only counts when BOTH lat and lng are present; a half-populated tier
// falls through rather than pairing a latitude with the next tier's longitude.
//
// There is deliberately no address-string fallback. Mailing address and
// governing jurisdiction diverge — Johnson Ferry/Shallowford is a Marietta
// mailing address in unincorporated Cobb, with a Roswell-ZIP Publix across the
// intersection. A geocoded mailing address would quietly put the analysis in
// the wrong jurisdiction.
type Coordinate = { latitude: number; longitude: number; coordinate_source: string };

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveCoordinate(
  siteSubmit: Record<string, unknown>,
  property: Record<string, unknown> | null,
): Coordinate | null {
  const tiers: Array<[string, unknown, unknown]> = [
    ['site_submit.verified', siteSubmit.verified_latitude, siteSubmit.verified_longitude],
    ['property.verified', property?.verified_latitude, property?.verified_longitude],
    ['site_submit.sf_property', siteSubmit.sf_property_latitude, siteSubmit.sf_property_longitude],
    ['property.latitude', property?.latitude, property?.longitude],
  ];
  for (const [source, rawLat, rawLng] of tiers) {
    const latitude = num(rawLat);
    const longitude = num(rawLng);
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude, coordinate_source: source };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Archetype block parsing — defensive, mirroring submit_research_report.
// ---------------------------------------------------------------------------
// The model returns prose plus a fenced JSON block. A bad parse must NEVER lose
// the text: on any failure we return null, the caller stores the message
// verbatim, and the columns stay NULL ("not called") rather than wrong.
interface ParsedArchetype {
  archetype_primary: Archetype | null;
  archetype_secondary: Archetype | null;
  story_carriers: string[];
  /** The prose with the trailing JSON fence removed, for display. */
  prose: string;
}

function isArchetype(v: unknown): v is Archetype {
  return typeof v === 'string' && (ARCHETYPES as readonly string[]).includes(v);
}

function parseArchetypeBlock(text: string): ParsedArchetype | null {
  // Last fenced json block wins — if the model narrated an example earlier in
  // the message, the real answer is the one it ended on.
  const fences = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (fences.length === 0) return null;
  const last = fences[fences.length - 1];

  let parsed: unknown;
  try {
    parsed = JSON.parse(last[1]);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  // Primary is the one field that must be valid — without it there is no call
  // to record, and a thread with a wrong archetype is worse than one with none.
  if (!isArchetype(obj.archetype_primary)) return null;

  const carriers = Array.isArray(obj.story_carriers)
    ? obj.story_carriers
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && c.length <= 200)
        .slice(0, 10)
    : [];

  return {
    archetype_primary: obj.archetype_primary,
    archetype_secondary: isArchetype(obj.archetype_secondary) ? obj.archetype_secondary : null,
    story_carriers: carriers,
    prose: (text.slice(0, last.index ?? 0) + text.slice((last.index ?? 0) + last[0].length)).trim(),
  };
}

// ---------------------------------------------------------------------------
// Anthropic call
// ---------------------------------------------------------------------------
interface TurnResult {
  text: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  stop_reason: string | null;
}

function computeCostUsd(usage: Record<string, unknown> | undefined): number | null {
  if (!usage) return null;
  const input = num(usage.input_tokens) ?? 0;
  const output = num(usage.output_tokens) ?? 0;
  const cacheRead = num(usage.cache_read_input_tokens) ?? 0;
  const cacheWrite = num(usage.cache_creation_input_tokens) ?? 0;
  return (
    (input * USD_PER_M_INPUT +
      output * USD_PER_M_OUTPUT +
      cacheRead * USD_PER_M_CACHE_READ +
      cacheWrite * USD_PER_M_CACHE_WRITE) /
    1_000_000
  );
}

async function callModel(
  systemPrompt: string,
  pinnedContext: unknown,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<TurnResult> {
  // Dedicated workspace key — NOT the shared ANTHROPIC_API_KEY used by
  // cfo-query and bookkeeper-query, so this feature's spend is attributable and
  // can carry its own workspace limit.
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY_RESEARCH');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY_RESEARCH not configured');

  const client = new Anthropic({ apiKey });

  // System = the versioned prompt body, then the frozen site snapshot. Both are
  // stable for the life of the thread, so the cache breakpoint goes on the last
  // block and covers the whole prefix. (A short thread may fall under the model's
  // minimum cacheable prefix, in which case this is simply a no-op.)
  const system = [
    { type: 'text', text: systemPrompt },
    {
      type: 'text',
      text: `Frozen site snapshot for this thread (JSON):\n${JSON.stringify(pinnedContext, null, 2)}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  const params: Record<string, unknown> = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
    // Opus 5 runs adaptive thinking by default; stated explicitly so a future
    // reader does not "helpfully" add budget_tokens (removed — 400 on Opus 5).
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
  };
  if (ENABLE_REFUSAL_FALLBACK) {
    params.betas = [FALLBACK_BETA];
    params.fallbacks = 'default';
  }

  // Single cast at the call boundary: `fallbacks` is a beta parameter whose
  // types lag the pinned SDK version.
  const response = await withRetry(
    () => client.beta.messages.create(params as never),
    { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 },
  );

  const resp = response as unknown as {
    content: Array<{ type: string; text?: string }>;
    usage?: Record<string, unknown>;
    stop_reason?: string | null;
    stop_details?: { category?: string | null; explanation?: string | null } | null;
  };

  // Always check stop_reason before reading content — a refusal returns HTTP 200
  // with an empty or partial body.
  if (resp.stop_reason === 'refusal') {
    const cat = resp.stop_details?.category ?? 'unspecified';
    throw new Error(`model_refused: the model declined this request (category: ${cat})`);
  }

  const text = resp.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();

  if (!text) throw new Error(`empty_model_response (stop_reason: ${resp.stop_reason ?? 'null'})`);

  return {
    text,
    input_tokens: num(resp.usage?.input_tokens),
    output_tokens: num(resp.usage?.output_tokens),
    cost_usd: computeCostUsd(resp.usage),
    stop_reason: resp.stop_reason ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prompt template resolution
// ---------------------------------------------------------------------------
// Most specific wins: the highest active version for this client, else the
// highest active version of the global (client_id IS NULL) row.
async function resolvePromptTemplate(
  service: SupabaseClient,
  clientId: string,
): Promise<{ id: string; body: string }> {
  const { data, error } = await service
    .from('prompt_template')
    .select('id, body, client_id, version')
    .eq('key', PROMPT_KEY)
    .eq('is_active', true)
    .or(`client_id.eq.${clientId},client_id.is.null`)
    .order('version', { ascending: false });

  if (error) throw new Error(`prompt_template lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; body: string; client_id: string | null }>;
  if (rows.length === 0) throw new Error(`no active prompt_template for key '${PROMPT_KEY}'`);

  return rows.find((r) => r.client_id === clientId) ?? rows[0];
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------
function isStarbucksFamily(clientId: string | null, parentId: string | null): boolean {
  return clientId === STARBUCKS_CLIENT_ID || parentId === STARBUCKS_CLIENT_ID;
}

/** Loads the client row and enforces the account-family gate. */
async function assertStarbucksFamily(service: SupabaseClient, clientId: string | null): Promise<void> {
  if (!clientId) {
    throw Object.assign(new Error('site submit has no client'), { status: 400 });
  }
  const { data, error } = await service
    .from('client')
    .select('id, parent_id')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(`client lookup failed: ${error.message}`);
  const row = data as { id: string; parent_id: string | null } | null;
  if (!row || !isStarbucksFamily(row.id, row.parent_id)) {
    throw Object.assign(new Error('site research is limited to the Starbucks account family'), {
      status: 403,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
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

  // ---- Auth: user JWT only. Copied from ovis-research-trigger. ----
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (!bearer) return jsonResponse({ error: 'missing_jwt' }, 401);

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } },
  );

  const { data: authData, error: authErr } = await anonClient.auth.getUser(bearer);
  if (authErr || !authData?.user) return jsonResponse({ error: 'invalid_jwt' }, 401);

  // auth.uid() maps to user.auth_user_id (NOT user.id — that's the auth identity).
  const { data: userRow, error: userErr } = await service
    .from('user')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (userErr) return jsonResponse({ error: 'user_lookup_failed', detail: userErr.message }, 500);
  if (!userRow) return jsonResponse({ error: 'user_not_found' }, 403);
  const userId = (userRow as { id: string }).id;

  // Permission gate via the SQL helper. Called on anonClient so auth.uid() resolves.
  const { data: hasAccess, error: permErr } = await anonClient.rpc(
    'user_has_market_research_run_access',
  );
  if (permErr) return jsonResponse({ error: 'permission_check_failed', detail: permErr.message }, 500);
  if (!hasAccess) {
    return jsonResponse(
      { error: 'forbidden', detail: 'can_run_market_research permission required' },
      403,
    );
  }

  const action = body.action;

  try {
    if (action === 'create_thread') return await createThread(service, body, userId);
    if (action === 'send_turn') return await sendTurn(service, body);
    return jsonResponse({ error: 'unknown_action', detail: String(action ?? '') }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[site-research] failed:', detail);
    return jsonResponse({ error: status === 500 ? 'internal_error' : 'request_failed', detail }, status);
  }
});

// ---------------------------------------------------------------------------
// Action: create_thread
// ---------------------------------------------------------------------------
async function createThread(
  service: SupabaseClient,
  body: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const siteSubmitId = body.site_submit_id;
  if (typeof siteSubmitId !== 'string' || !siteSubmitId) {
    return jsonResponse({ error: 'site_submit_id is required' }, 400);
  }

  // trade_area and every ESRI demographic live on PROPERTY, not site_submit —
  // joined in here so the snapshot is complete in one shot.
  //
  // The submit_stage embed MUST carry the !site_submit_submit_stage_id_fkey
  // constraint hint. site_submit has two IDENTICAL foreign keys on
  // submit_stage_id (fk_site_submit_stage_id and site_submit_submit_stage_id_fkey),
  // so PostgREST refuses to pick one: "Could not embed because more than one
  // relationship was found for 'site_submit' and 'submit_stage_id'". The usual
  // column-name form (submit_stage:submit_stage_id) does NOT disambiguate —
  // both constraints sit on that same column, so only the constraint name works.
  // Every other site_submit query in the codebase carries this same hint.
  // property_id has a single FK and needs no hint.
  const { data: ssData, error: ssErr } = await service
    .from('site_submit')
    .select(`
      id, site_submit_name, client_id, notes, competitor_data,
      verified_latitude, verified_longitude,
      sf_property_latitude, sf_property_longitude,
      submit_stage!site_submit_submit_stage_id_fkey ( name ),
      property:property_id (
        id, address, city, state, zip, trade_area,
        latitude, longitude, verified_latitude, verified_longitude,
        pop_1_mile, pop_3_mile, pop_5_mile,
        households_1_mile, households_3_mile,
        hh_income_median_1_mile, hh_income_median_3_mile, hh_income_median_5_mile,
        daytime_pop_1_mile, daytime_pop_3_mile,
        median_age_3_mile,
        tapestry_segment_code, tapestry_segment_name,
        esri_enriched_at
      )
    `)
    .eq('id', siteSubmitId)
    .maybeSingle();

  if (ssErr) throw new Error(`site_submit lookup failed: ${ssErr.message}`);
  if (!ssData) return jsonResponse({ error: 'site_submit_not_found' }, 404);

  const ss = ssData as Record<string, unknown>;
  const property = (ss.property ?? null) as Record<string, unknown> | null;
  const clientId = ss.client_id as string | null;

  await assertStarbucksFamily(service, clientId);

  const coordinate = resolveCoordinate(ss, property);
  if (!coordinate) {
    // Refuse rather than guess. See resolveCoordinate() for why there is no
    // address fallback.
    return jsonResponse(
      {
        error: 'no_coordinate',
        detail:
          'This site has no usable coordinate on the site submit or its property. Verify the location on the map before starting a site story.',
      },
      422,
    );
  }

  const stage = (ss.submit_stage ?? null) as { name?: string | null } | null;

  const pinnedContext = {
    site: {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      coordinate_source: coordinate.coordinate_source,
      site_submit_name: ss.site_submit_name ?? null,
      client: 'Starbucks',
      submit_stage: stage?.name ?? null,
      notes: ss.notes ?? null,
      competitor_data: ss.competitor_data ?? null,
    },
    property: property
      ? {
          address: property.address ?? null,
          city: property.city ?? null,
          state: property.state ?? null,
          zip: property.zip ?? null,
          trade_area: property.trade_area ?? null,
          pop_1_mile: property.pop_1_mile ?? null,
          pop_3_mile: property.pop_3_mile ?? null,
          pop_5_mile: property.pop_5_mile ?? null,
          households_1_mile: property.households_1_mile ?? null,
          households_3_mile: property.households_3_mile ?? null,
          hh_income_median_1_mile: property.hh_income_median_1_mile ?? null,
          hh_income_median_3_mile: property.hh_income_median_3_mile ?? null,
          hh_income_median_5_mile: property.hh_income_median_5_mile ?? null,
          daytime_pop_1_mile: property.daytime_pop_1_mile ?? null,
          daytime_pop_3_mile: property.daytime_pop_3_mile ?? null,
          median_age_3_mile: property.median_age_3_mile ?? null,
          tapestry_segment_code: property.tapestry_segment_code ?? null,
          tapestry_segment_name: property.tapestry_segment_name ?? null,
          esri_enriched_at: property.esri_enriched_at ?? null,
        }
      : null,
  };

  const template = await resolvePromptTemplate(service, clientId!);

  const { data: threadRow, error: threadErr } = await service
    .from('research_thread')
    .insert({
      site_submit_id: siteSubmitId,
      client_id: clientId,
      prompt_template_id: template.id,
      pinned_context: pinnedContext,
      created_by: userId,
    })
    .select('id')
    .single();
  if (threadErr) throw new Error(`thread insert failed: ${threadErr.message}`);
  const threadId = (threadRow as { id: string }).id;

  try {
    const turn = await callModel(template.body, pinnedContext, [
      {
        role: 'user',
        content:
          'Make the archetype call for this site and write the executive summary, following your instructions.',
      },
    ]);

    const parsed = parseArchetypeBlock(turn.text);

    // A bad parse must never lose the text: store the raw message, leave the
    // columns NULL. A parsed message stores the prose with the fence stripped,
    // since the values now live in queryable columns.
    const { error: msgErr } = await service.from('research_thread_message').insert({
      thread_id: threadId,
      seq: 0,
      role: 'assistant',
      content: parsed ? parsed.prose : turn.text,
      model: MODEL,
      input_tokens: turn.input_tokens,
      output_tokens: turn.output_tokens,
      cost_usd: turn.cost_usd,
    });
    if (msgErr) throw new Error(`message insert failed: ${msgErr.message}`);

    if (parsed) {
      const { error: updErr } = await service
        .from('research_thread')
        .update({
          archetype_primary: parsed.archetype_primary,
          archetype_secondary: parsed.archetype_secondary,
          story_carriers: parsed.story_carriers,
        })
        .eq('id', threadId);
      if (updErr) console.warn('[site-research] archetype column update failed:', updErr.message);
    } else {
      console.warn(`[site-research] thread ${threadId}: no parseable archetype block; columns left NULL`);
    }

    return jsonResponse({
      thread_id: threadId,
      archetype_primary: parsed?.archetype_primary ?? null,
      archetype_secondary: parsed?.archetype_secondary ?? null,
      story_carriers: parsed?.story_carriers ?? [],
      parsed: !!parsed,
      coordinate_source: coordinate.coordinate_source,
      cost_usd: turn.cost_usd,
    });
  } catch (e) {
    // The thread row is kept — state='failed' is an audit record of an attempt,
    // and the pinned_context shows exactly what the model was given.
    await service.from('research_thread').update({ state: 'failed' }).eq('id', threadId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Action: send_turn
// ---------------------------------------------------------------------------
async function sendTurn(
  service: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const threadId = body.thread_id;
  const message = body.message;
  if (typeof threadId !== 'string' || !threadId) {
    return jsonResponse({ error: 'thread_id is required' }, 400);
  }
  if (typeof message !== 'string' || !message.trim()) {
    return jsonResponse({ error: 'message is required' }, 400);
  }

  const { data: threadData, error: threadErr } = await service
    .from('research_thread')
    .select('id, client_id, prompt_template_id, pinned_context, state')
    .eq('id', threadId)
    .maybeSingle();
  if (threadErr) throw new Error(`thread lookup failed: ${threadErr.message}`);
  if (!threadData) return jsonResponse({ error: 'thread_not_found' }, 404);

  const thread = threadData as {
    id: string;
    client_id: string;
    prompt_template_id: string | null;
    pinned_context: unknown;
    state: string;
  };
  if (thread.state === 'archived') {
    return jsonResponse({ error: 'thread_archived' }, 409);
  }

  // Re-check the gate per turn: the site's client could have changed since the
  // thread was created, and the UI gate is not a control.
  await assertStarbucksFamily(service, thread.client_id);

  // The thread replays against the template it was CREATED with, not whatever
  // is active now — otherwise activating v2 silently rewrites the reasoning
  // behind every open thread mid-conversation.
  let systemPrompt: string;
  if (thread.prompt_template_id) {
    const { data: tpl, error: tplErr } = await service
      .from('prompt_template')
      .select('body')
      .eq('id', thread.prompt_template_id)
      .maybeSingle();
    if (tplErr) throw new Error(`prompt_template lookup failed: ${tplErr.message}`);
    systemPrompt = (tpl as { body: string } | null)?.body
      ?? (await resolvePromptTemplate(service, thread.client_id)).body;
  } else {
    systemPrompt = (await resolvePromptTemplate(service, thread.client_id)).body;
  }

  const { data: priorData, error: priorErr } = await service
    .from('research_thread_message')
    .select('seq, role, content')
    .eq('thread_id', threadId)
    .order('seq', { ascending: true });
  if (priorErr) throw new Error(`message history lookup failed: ${priorErr.message}`);
  const prior = (priorData ?? []) as Array<{ seq: number; role: 'user' | 'assistant'; content: string }>;

  const nextSeq = prior.length === 0 ? 0 : prior[prior.length - 1].seq + 1;
  const userText = message.trim();

  const { error: userMsgErr } = await service.from('research_thread_message').insert({
    thread_id: threadId,
    seq: nextSeq,
    role: 'user',
    content: userText,
  });
  // A unique violation on (thread_id, seq) means a concurrent turn won the race.
  if (userMsgErr) {
    if ((userMsgErr as { code?: string }).code === '23505') {
      return jsonResponse(
        { error: 'concurrent_turn', detail: 'Another turn was sent on this thread. Reload and retry.' },
        409,
      );
    }
    throw new Error(`user message insert failed: ${userMsgErr.message}`);
  }

  // The API is stateless — the seq-0 archetype message must be replayed too, or
  // the model loses its own call. messages[] must start with a user turn, so a
  // history that opens with the assistant's seq 0 gets a short framing turn.
  const replay: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (prior.length > 0 && prior[0].role === 'assistant') {
    replay.push({
      role: 'user',
      content:
        'Make the archetype call for this site and write the executive summary, following your instructions.',
    });
  }
  for (const m of prior) replay.push({ role: m.role, content: m.content });
  replay.push({ role: 'user', content: userText });

  const turn = await callModel(systemPrompt, thread.pinned_context, replay);
  const parsed = parseArchetypeBlock(turn.text);

  const { error: asstErr } = await service.from('research_thread_message').insert({
    thread_id: threadId,
    seq: nextSeq + 1,
    role: 'assistant',
    content: parsed ? parsed.prose : turn.text,
    model: MODEL,
    input_tokens: turn.input_tokens,
    output_tokens: turn.output_tokens,
    cost_usd: turn.cost_usd,
  });
  if (asstErr) throw new Error(`assistant message insert failed: ${asstErr.message}`);

  // A follow-up turn only re-emits the JSON block when the call actually
  // changed, so a parse here is a revision — write it through.
  if (parsed) {
    const { error: updErr } = await service
      .from('research_thread')
      .update({
        archetype_primary: parsed.archetype_primary,
        archetype_secondary: parsed.archetype_secondary,
        story_carriers: parsed.story_carriers,
      })
      .eq('id', threadId);
    if (updErr) console.warn('[site-research] archetype column update failed:', updErr.message);
  }

  return jsonResponse({
    thread_id: threadId,
    seq: nextSeq + 1,
    revised: !!parsed,
    archetype_primary: parsed?.archetype_primary ?? null,
    cost_usd: turn.cost_usd,
  });
}
