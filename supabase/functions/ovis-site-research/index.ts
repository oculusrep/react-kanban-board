/**
 * OVIS Site Research — Edge Function (enqueue).
 *
 * The in-app research thread behind "Site story" on the Starbucks site_submit sidebar.
 * This function validates, freezes the site snapshot, and ENQUEUES a background run;
 * the model loop runs in ovis-site-research-worker, one iteration per invocation, so no
 * browser request ever waits on the model. (Synchronous runs 504'd at Supabase's 150 s
 * idle timeout on every v4/v5 call.) Design: docs/SITE_RESEARCH_BACKGROUND_RUNS_DESIGN.md.
 *
 * Actions, all requiring a Supabase user JWT, all returning 202 with the ids to watch:
 *
 *   1. { action: 'create_thread', site_submit_id }  -> { thread_id, run_id }
 *      Resolves the site coordinate by the documented precedence, freezes a site+property
 *      snapshot into pinned_context, inserts the thread, resolves the active
 *      prompt_template, enqueues an 'archetype' run that will write message seq 0.
 *
 *   2. { action: 'send_turn', thread_id, message }  -> { thread_id, run_id, seq }
 *      Writes the user message and enqueues a 'turn' run in one transaction.
 *
 *   3. { action: 'retry_run', thread_id }            -> { thread_id, run_id }
 *      Re-enqueues the thread's latest failed run (same kind and target message). A failed
 *      deep pass restarts from its first phase.
 *
 *   4. { action: 'start_deep_pass', thread_id }      -> { thread_id, run_id, seq }
 *      Step 2. Writes the deep pass request as a user message and enqueues a 'deep_pass' run
 *      (school fill → deep pass → CSV exports). Requires a completed Step 1 run on the thread,
 *      because the deep pass reads its persisted school results.
 *
 * The gate (Starbucks account family + can_run_market_research) is re-checked here on
 * every call. The UI gate is a convenience, not a control.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { OPENING_USER_MESSAGE, replayMessages } from '../_shared/site-research/archetype.ts';
import { kickWorker } from '../_shared/site-research/kick.ts';
import { STEP1_SEARCH_BUDGET } from '../_shared/site-research/tools.ts';
import { DEEP_PASS_PROMPT_KEY, DEEP_PASS_USER_MESSAGE } from '../_shared/site-research/deep-pass.ts';
import { buildDemographics, dataQualityFor } from '../_shared/site-research/snapshot.ts';

// Gates research to the Starbucks account family: the Starbucks client itself OR any
// client whose parent_id is Starbucks (child accounts like "Starbucks - JW (Coastal GA)").
// Mirrors ovis-research-trigger and SiteSubmitSidebar.tsx.
const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';

const PROMPT_KEY = 'archetype_call';

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

/**
 * Start the worker on a freshly enqueued run. Never fatal: if the kick fails, the
 * per-minute tick picks the queued run up within about two minutes.
 */
async function kick(service: SupabaseClient, runId: string): Promise<boolean> {
  try {
    const { data: secret, error } = await service.rpc('get_site_research_worker_secret');
    if (error || !secret) throw new Error(error?.message ?? 'worker secret unavailable');
    await kickWorker(runId, secret as string);
    return true;
  } catch (e) {
    console.warn(`[site-research] run=${runId} kick failed; the tick will start it:`, e);
    return false;
  }
}

/** Postgres error code of a supabase-js RPC error, if any. */
const pgCode = (e: unknown) => (e as { code?: string } | null)?.code;

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
    if (action === 'send_turn') return await sendTurn(service, body, userId);
    if (action === 'retry_run') return await retryRun(service, body, userId);
    if (action === 'start_deep_pass') return await startDeepPass(service, body, userId);
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

  // Esri demographics live in TWO places: site_submit.client_demographics (custom rings and drive
  // times pulled from the sidebar) and the property's Esri columns. Both are read here; see
  // buildDemographics for precedence. trade_area lives on the property.
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
      id, site_submit_name, client_id, notes, competitor_data, client_demographics,
      verified_latitude, verified_longitude,
      sf_property_latitude, sf_property_longitude,
      submit_stage!site_submit_submit_stage_id_fkey ( name ),
      property:property_id (
        id, address, city, state, zip, trade_area,
        latitude, longitude, verified_latitude, verified_longitude,
        pop_1_mile, pop_3_mile, pop_5_mile, pop_10min_drive,
        households_1_mile, households_3_mile, households_5_mile, households_10min_drive,
        hh_income_median_1_mile, hh_income_median_3_mile, hh_income_median_5_mile, hh_income_median_10min_drive,
        hh_income_avg_1_mile, hh_income_avg_3_mile, hh_income_avg_5_mile, hh_income_avg_10min_drive,
        daytime_pop_1_mile, daytime_pop_3_mile, daytime_pop_5_mile, daytime_pop_10min_drive,
        median_age_1_mile, median_age_3_mile, median_age_5_mile, median_age_10min_drive,
        employees_1_mile, employees_3_mile, employees_5_mile, employees_10min_drive,
        tapestry_segment_code, tapestry_segment_name, tapestry_lifemodes,
        esri_enriched_at, esri_enriched_latitude, esri_enriched_longitude
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

  // Demographics: site_submit.client_demographics first, the property's Esri columns as fallback
  // (the sidebar's order), carried on the rings that actually exist. The property block no longer
  // repeats Esri columns, so a null property field can't contradict site-submit demographics.
  const demographics = buildDemographics(ss.client_demographics ?? null, property, coordinate);

  const pinnedContext: Record<string, unknown> = {
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
        }
      : null,
    demographics,
  };
  // Computed from the demographics block, so the prompt can state the data gap or incomplete rings.
  pinnedContext.data_quality = dataQualityFor(pinnedContext);

  const template = await resolvePromptTemplate(service, clientId!);

  const { data: threadRow, error: threadErr } = await service
    .from('research_thread')
    .insert({
      site_submit_id: siteSubmitId,
      client_id: clientId,
      prompt_template_id: template.id,
      pinned_context: pinnedContext,
      created_by: userId,
      state: 'queued',
    })
    .select('id')
    .single();
  if (threadErr) throw new Error(`thread insert failed: ${threadErr.message}`);
  const threadId = (threadRow as { id: string }).id;

  const { data: runId, error: runErr } = await service.rpc('enqueue_thread_run', {
    p_thread_id: threadId,
    p_kind: 'archetype',
    p_target_seq: 0,
    p_prompt_template_id: template.id,
    p_convo: [{ role: 'user', content: OPENING_USER_MESSAGE }],
    p_search_budget: STEP1_SEARCH_BUDGET,
    p_created_by: userId,
  });
  if (runErr) {
    // No run means nothing will ever write this thread's report: mark it failed now
    // rather than leave a queued thread nobody owns.
    await service.from('research_thread').update({ state: 'failed' }).eq('id', threadId);
    throw new Error(`run enqueue failed: ${runErr.message}`);
  }

  const kicked = await kick(service, runId as string);
  return jsonResponse(
    { thread_id: threadId, run_id: runId, state: 'queued', kicked, coordinate_source: coordinate.coordinate_source },
    202,
  );
}

// ---------------------------------------------------------------------------
// Thread lookup shared by send_turn / retry_run
// ---------------------------------------------------------------------------
interface ThreadRecord {
  id: string;
  site_submit_id: string;
  client_id: string;
  prompt_template_id: string | null;
  state: string;
}

async function loadThread(service: SupabaseClient, threadId: unknown): Promise<ThreadRecord | Response> {
  if (typeof threadId !== 'string' || !threadId) return jsonResponse({ error: 'thread_id is required' }, 400);
  const { data, error } = await service
    .from('research_thread')
    .select('id, site_submit_id, client_id, prompt_template_id, state')
    .eq('id', threadId)
    .maybeSingle();
  if (error) throw new Error(`thread lookup failed: ${error.message}`);
  if (!data) return jsonResponse({ error: 'thread_not_found' }, 404);
  const thread = data as ThreadRecord;
  if (thread.state === 'archived') return jsonResponse({ error: 'thread_archived' }, 409);
  // Re-check the gate per call: the site's client could have changed since creation.
  await assertStarbucksFamily(service, thread.client_id);
  return thread;
}

/**
 * The thread replays against the template it was CREATED with, not whatever is active
 * now — otherwise activating a new version silently rewrites the reasoning behind every
 * open thread mid-conversation.
 */
async function threadTemplateId(service: SupabaseClient, thread: ThreadRecord): Promise<string> {
  return thread.prompt_template_id ?? (await resolvePromptTemplate(service, thread.client_id)).id;
}

async function loadMessages(service: SupabaseClient, threadId: string) {
  const { data, error } = await service
    .from('research_thread_message')
    .select('seq, role, content')
    .eq('thread_id', threadId)
    .order('seq', { ascending: true });
  if (error) throw new Error(`message history lookup failed: ${error.message}`);
  return (data ?? []) as Array<{ seq: number; role: 'user' | 'assistant'; content: string }>;
}

// ---------------------------------------------------------------------------
// Action: send_turn
// ---------------------------------------------------------------------------
async function sendTurn(service: SupabaseClient, body: Record<string, unknown>, userId: string): Promise<Response> {
  const message = body.message;
  if (typeof message !== 'string' || !message.trim()) return jsonResponse({ error: 'message is required' }, 400);

  const loaded = await loadThread(service, body.thread_id);
  if (loaded instanceof Response) return loaded;
  const thread = loaded;

  const prior = await loadMessages(service, thread.id);
  const nextSeq = prior.length === 0 ? 0 : prior[prior.length - 1].seq + 1;
  const userText = message.trim();
  const convo = [...replayMessages(prior), { role: 'user', content: userText }];

  const { data: runId, error } = await service.rpc('enqueue_thread_turn', {
    p_thread_id: thread.id,
    p_expected_seq: nextSeq,
    p_user_content: userText,
    p_prompt_template_id: await threadTemplateId(service, thread),
    p_convo: convo,
    p_search_budget: STEP1_SEARCH_BUDGET,
    p_created_by: userId,
  });
  if (error) {
    if (pgCode(error) === '23505') {
      return jsonResponse({ error: 'run_in_progress', detail: 'A run is already in progress on this thread. Wait for it to finish.' }, 409);
    }
    if (pgCode(error) === '40001') {
      return jsonResponse({ error: 'concurrent_turn', detail: 'This thread changed while you were typing. Reload and resend.' }, 409);
    }
    throw new Error(`turn enqueue failed: ${error.message}`);
  }

  const kicked = await kick(service, runId as string);
  return jsonResponse({ thread_id: thread.id, run_id: runId, seq: nextSeq, state: 'queued', kicked }, 202);
}

// ---------------------------------------------------------------------------
// Action: retry_run
// ---------------------------------------------------------------------------
async function retryRun(service: SupabaseClient, body: Record<string, unknown>, userId: string): Promise<Response> {
  const loaded = await loadThread(service, body.thread_id);
  if (loaded instanceof Response) return loaded;
  const thread = loaded;

  const { data: last, error: lastErr } = await service
    .from('research_thread_run')
    .select('id, kind, target_seq, state, prompt_template_id')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastErr) throw new Error(`run lookup failed: ${lastErr.message}`);
  const run = last as { id: string; kind: 'archetype' | 'turn' | 'deep_pass'; target_seq: number; state: string; prompt_template_id: string | null } | null;
  if (!run) return jsonResponse({ error: 'no_run_to_retry' }, 409);
  if (run.state !== 'failed' && run.state !== 'cancelled') {
    return jsonResponse({ error: 'not_retryable', detail: `The latest run is ${run.state}.` }, 409);
  }

  const messages = await loadMessages(service, thread.id);
  if (run.kind === 'deep_pass') {
    if (messages.some((m) => m.seq === run.target_seq)) {
      return jsonResponse({ error: 'already_written', detail: 'That message already exists.' }, 409);
    }
    const { data: runId, error } = await service.rpc('enqueue_deep_pass', {
      p_thread_id: thread.id, p_expected_seq: run.target_seq, p_user_content: null,
      p_prompt_template_id: await deepPassTemplateId(service), p_created_by: userId,
    });
    if (error) {
      if (pgCode(error) === '23505') return jsonResponse({ error: 'run_in_progress' }, 409);
      if (pgCode(error) === '40001') return jsonResponse({ error: 'concurrent_turn', detail: 'This thread changed. Reload and try again.' }, 409);
      throw new Error(`deep pass retry enqueue failed: ${error.message}`);
    }
    const kicked = await kick(service, runId as string);
    return jsonResponse({ thread_id: thread.id, run_id: runId, state: 'queued', kicked }, 202);
  }

  if (messages.some((m) => m.seq === run.target_seq)) {
    return jsonResponse({ error: 'already_written', detail: 'That message already exists.' }, 409);
  }
  // Replay exactly what the failed run was answering: everything before its target.
  const convo = run.kind === 'archetype'
    ? [{ role: 'user', content: OPENING_USER_MESSAGE }]
    : replayMessages(messages.filter((m) => m.seq < run.target_seq));

  const { data: runId, error } = await service.rpc('enqueue_thread_run', {
    p_thread_id: thread.id,
    p_kind: run.kind,
    p_target_seq: run.target_seq,
    p_prompt_template_id: run.prompt_template_id ?? (await threadTemplateId(service, thread)),
    p_convo: convo,
    p_search_budget: STEP1_SEARCH_BUDGET,
    p_created_by: userId,
  });
  if (error) {
    if (pgCode(error) === '23505') return jsonResponse({ error: 'run_in_progress' }, 409);
    throw new Error(`retry enqueue failed: ${error.message}`);
  }
  const kicked = await kick(service, runId as string);
  return jsonResponse({ thread_id: thread.id, run_id: runId, state: 'queued', kicked }, 202);
}

// ---------------------------------------------------------------------------
// Action: start_deep_pass (Step 2)
// ---------------------------------------------------------------------------
async function deepPassTemplateId(service: SupabaseClient): Promise<string> {
  const { data, error } = await service
    .from('prompt_template').select('id')
    .eq('key', DEEP_PASS_PROMPT_KEY).eq('is_active', true).is('client_id', null)
    .order('version', { ascending: false }).limit(1);
  if (error) throw new Error(`prompt_template lookup failed: ${error.message}`);
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) throw new Error(`no active prompt_template for key '${DEEP_PASS_PROMPT_KEY}'`);
  return id;
}

async function startDeepPass(service: SupabaseClient, body: Record<string, unknown>, userId: string): Promise<Response> {
  const loaded = await loadThread(service, body.thread_id);
  if (loaded instanceof Response) return loaded;
  const thread = loaded;

  const { data: t, error: tErr } = await service
    .from('research_thread').select('archetype_primary').eq('id', thread.id).maybeSingle();
  if (tErr) throw new Error(`thread lookup failed: ${tErr.message}`);
  if (!(t as { archetype_primary: string | null } | null)?.archetype_primary) {
    return jsonResponse({ error: 'no_archetype', detail: 'The first pass has not made an archetype call on this thread yet.' }, 409);
  }

  // The deep pass reads Step 1's persisted school results; threads from before background runs have none.
  const { data: step1, error: s1Err } = await service
    .from('research_thread_run').select('id')
    .eq('thread_id', thread.id).eq('kind', 'archetype').eq('state', 'complete').limit(1);
  if (s1Err) throw new Error(`step 1 run lookup failed: ${s1Err.message}`);
  if (!step1?.length) {
    return jsonResponse({
      error: 'no_step1_results',
      detail: 'This site story was created before tool results were saved, so the deep pass has no school data to read. Start a new site story, then run the deep pass on it.',
    }, 409);
  }

  const prior = await loadMessages(service, thread.id);
  const nextSeq = prior.length === 0 ? 0 : prior[prior.length - 1].seq + 1;
  const { data: runId, error } = await service.rpc('enqueue_deep_pass', {
    p_thread_id: thread.id, p_expected_seq: nextSeq, p_user_content: DEEP_PASS_USER_MESSAGE,
    p_prompt_template_id: await deepPassTemplateId(service), p_created_by: userId,
  });
  if (error) {
    if (pgCode(error) === '23505') {
      return jsonResponse({ error: 'run_in_progress', detail: 'A run is already in progress on this thread. Wait for it to finish.' }, 409);
    }
    if (pgCode(error) === '40001') {
      return jsonResponse({ error: 'concurrent_turn', detail: 'This thread changed. Reload and try again.' }, 409);
    }
    throw new Error(`deep pass enqueue failed: ${error.message}`);
  }
  const kicked = await kick(service, runId as string);
  return jsonResponse({ thread_id: thread.id, run_id: runId, seq: nextSeq, state: 'queued', kicked }, 202);
}
