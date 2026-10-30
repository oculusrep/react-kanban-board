/**
 * OVIS MCP — Edge Function (general-purpose OVIS MCP server; first tools: NNN listing intake)
 *
 * MCP over HTTP (JSON-RPC 2.0, JSON responses). Built to be added as a claude.ai custom
 * connector. See docs/NNN_LISTING_INTAKE.md.
 *
 * Listings feed the EXISTING comp database (docs/NNN_LISTING_INTAKE_SPEC_v2.md, phase 1):
 * comp_property (review_status) + lease_comp + operating_memorandum (the offering) +
 * comp_listing_event (price/status history).
 *
 * Tools (narrow — no raw SQL; writes are SECURITY DEFINER RPCs granted to service_role):
 *   1. upsert_listing(tenant, address, city, price, cap_rate, …) → upsert_comp_listing;
 *      a NEW offering also gets Noree's VA task server-side (same RPC as create_va_task)
 *   2. create_va_task(listing_id, assignee='Noree', due=today, title?, checklist?) → create_comp_va_task
 *   3. list_recent_listings(days=30) → comp_listing_facts
 *   4. listing_activity(date? | since?) → listing_activity (daily summary feed)
 *
 * Auth — two accepted credentials, both as `Authorization: Bearer …`:
 *   a) OAuth 2.1 access token issued by Supabase Auth's OAuth server (what claude.ai uses; it
 *      discovers the server via the WWW-Authenticate → protected-resource metadata below and
 *      registers itself with Dynamic Client Registration). The token's user must pass
 *      public.is_internal_user(), checked AS that user.
 *      Docs: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
 *   b) Static token = env OVIS_MCP_INTAKE_TOKEN, for Claude Code / scripts (claude.ai web
 *      connectors cannot send a static header). Acts as no user (audit columns NULL).
 * Comp audit columns reference auth.users, so the OAuth caller's AUTH id is what's passed.
 * verify_jwt is off for this function (config.toml); the checks above are the gate.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { censusGeocode } from '../_shared/site-research/geocode.ts';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'https://esm.sh/jose@5.9.6';

const SERVER_INFO = { name: 'ovis-mcp', version: '0.3.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const RESOURCE_URL = `${SUPABASE_URL}/functions/v1/ovis-mcp`;
const RESOURCE_METADATA_URL = `${RESOURCE_URL}/.well-known/oauth-protected-resource`;
const AUTH_ISSUER = `${SUPABASE_URL}/auth/v1`;
// Don't advertise scopes_supported: with it, the claude.ai connector abandons sign-in before
// registering (tested 2026-10-30, with and without a WWW-Authenticate scope). Without it,
// claude.ai requests the AS's full list incl. `openid`, and Supabase's /oauth/token 500s
// "HS256 is not supported for ID token signing" until the project signing key is ES256.
// Project signing keys (ES256). Cached by jose across requests in a warm instance.
const JWKS = createRemoteJWKSet(new URL(`${AUTH_ISSUER}/.well-known/jwks.json`));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
};

const DEFAULT_VA_ASSIGNEE = 'Noree';

// Each line says where on the comp (CompDetailSlideout) the answer goes.
const DEFAULT_VA_CHECKLIST = [
  'Get OM → OM tab (broker, list date)',
  'Confirm guarantor: corporate vs franchisee, and guarantor name → Leases tab',
  'Base rent / NOI → Leases tab (annual base rent)',
  'Rent increases (amount + frequency) → Leases tab',
  'Options (count + length) → Leases tab',
  'Lease start / expiry → Leases tab',
  'APN → Overview › More Details (parcel ID)',
  'Attach OM PDF → Files tab',
];

type JsonRpcId = string | number | null;
interface JsonRpcRequest { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: any }

const E_PARSE = -32700;
const E_INVALID_REQUEST = -32600;
const E_METHOD_NOT_FOUND = -32601;
const E_INVALID_PARAMS = -32602;
const E_INTERNAL = -32603;

// ----------------------------------------------------------------------------
// Tool registry
// ----------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'upsert_listing',
    description:
      'Record an NNN investment listing (single-tenant net-lease property for sale) in the OVIS comp database. Matches an existing comp by APN, else by normalized address + city + state. New property → created as pending review and geocoded onto the map. Existing offering → last_seen bumped; a different price or cap is recorded as a price_change / cap_change event (returned as changed/old/new). A comp Mike rejected is never re-proposed (skipped: "rejected"); a comp closed in the last 90 days is not relisted off a stale post (skipped: "recently_closed"). A NEW offering (is_new = true) automatically gets a diligence task in Noree\'s Inbox (returned as va_task_id) — do NOT also call create_va_task for it. Updates never create tasks. If va_task_error is returned, the listing was saved but the task was not; call create_va_task to retry.',
    inputSchema: {
      type: 'object',
      properties: {
        tenant: { type: 'string', description: 'Tenant / brand, e.g. "Taco Bell".' },
        address: { type: 'string', description: 'Street address, e.g. "1234 Peachtree Industrial Blvd".' },
        city: { type: 'string' },
        state: { type: 'string', default: 'GA', description: 'Two-letter state. Default GA.' },
        zip: { type: ['string', 'null'] },
        apn: { type: ['string', 'null'], description: 'Parcel number, only if the listing states it. Matched before address.' },
        price: { type: ['number', 'null'], description: 'Asking price in dollars.' },
        cap_rate: { type: ['number', 'null'], description: 'Asking cap rate as a PERCENT, e.g. 6.25 for 6.25%.' },
        noi: { type: ['number', 'null'], description: 'NOI only if the listing states it.' },
        lease_type: { type: ['string', 'null'], description: 'As listed, e.g. "Absolute NNN", "NN", "Ground lease".' },
        term_left: { type: ['string', 'null'], description: 'Remaining lease term as listed, e.g. "14 years". Do not convert to a date.' },
        guarantor_type: { type: ['string', 'null'], enum: ['corporate', 'franchisee', 'personal', 'other', null], description: 'Only if the listing states it.' },
        guarantor_name: { type: ['string', 'null'], description: 'Guarantor entity, only if stated.' },
        list_date: { type: ['string', 'null'], format: 'date', description: 'YYYY-MM-DD the listing went up, only if stated.' },
        broker_name: { type: ['string', 'null'] },
        brokerage: { type: ['string', 'null'] },
        source: { type: ['string', 'null'], description: 'Where it was found, e.g. "Crexi", "LoopNet", "broker email".' },
        source_url: { type: ['string', 'null'] },
      },
      required: ['tenant', 'address', 'city'],
    },
  },
  {
    name: 'create_va_task',
    description:
      "Create a diligence task for a listing in a VA's OVIS task Inbox (default: Noree). The task links to the listing in OVIS and carries a checklist saying where each answer goes on the comp: OM, guarantor (corp vs franchisee + name), base rent/NOI, increases, options, lease start/expiry, APN, OM PDF. Returns the task id. upsert_listing already creates this task for new listings — use this tool only for an extra or reassigned task, or to retry after va_task_error.",
    inputSchema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string', format: 'uuid', description: 'listing_id (or comp_property_id) returned by upsert_listing.' },
        assignee: { type: 'string', default: 'Noree', description: 'First name of an OVIS user.' },
        due: { type: 'string', format: 'date', description: 'YYYY-MM-DD. Default: today (Eastern).' },
        title: { type: 'string', description: 'Optional task title. Default "NNN listing — <tenant> — <address>".' },
        checklist: { type: 'array', items: { type: 'string' }, description: 'Optional; replaces the default checklist.' },
      },
      required: ['listing_id'],
    },
  },
  {
    name: 'list_recent_listings',
    description:
      'List listings (offerings) first seen in the last N days (default 30), newest first, with review and listing status. Includes rejected ones so you do not re-report them.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
      },
    },
  },
  {
    name: 'listing_activity',
    description:
      'Daily-summary feed. For one Eastern-time day (date, default today) or since a timestamp: new listings, price/cap changes (old → new), status changes (under contract, back on market, off market, closed), and listings possibly off market (active but unseen 21+ days — for VA review, never auto-closed). Report the groups separately.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date', description: 'YYYY-MM-DD, an Eastern-time calendar day. Default today.' },
        since: { type: 'string', format: 'date-time', description: 'Alternative to date: everything since this ISO timestamp.' },
      },
    },
  },
] as const;

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------

type Caller = { kind: 'static' } | { kind: 'user'; authUserId: string };
const actingAuthId = (c: Caller) => (c.kind === 'user' ? c.authUserId : null);

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function unauthorized(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 401,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      // RFC 9728: points the MCP client at our protected-resource metadata, which names
      // Supabase Auth as the authorization server.
      'WWW-Authenticate': `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`,
    },
  });
}

async function authorize(req: Request): Promise<Caller | Response> {
  // Tolerate hand-typed connector headers (claude.ai "Request headers"): a doubled "Bearer",
  // wrapping quotes or <angle brackets>, stray whitespace.
  const bearer = (req.headers.get('Authorization') ?? '').trim()
    .replace(/^(Bearer\s+)+/i, '').trim()
    .replace(/^["'<]+|[">']+$/g, '').trim();
  if (!bearer) return unauthorized('missing_token');

  if (safeEqual(bearer, Deno.env.get('OVIS_MCP_INTAKE_TOKEN') ?? '')) return { kind: 'static' };

  // Verify the access token locally against the project's published signing keys (ES256 JWKS),
  // as a resource server should. GoTrue's /user endpoint rejected OAuth-server tokens from the
  // claude.ai connector (401 right after a successful token exchange, 2026-10-30), so it is
  // only a fallback. PostgREST re-verifies the token on the is_internal_user call below.
  let authUserId: string | null = null;
  let jwksErr = '';
  try {
    const { payload } = await jwtVerify(bearer, JWKS, { issuer: AUTH_ISSUER });
    if (payload.role === 'authenticated' && typeof payload.sub === 'string') authUserId = payload.sub;
    else jwksErr = `role=${payload.role}`;
  } catch (e) {
    jwksErr = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  if (!authUserId) {
    const { data: authData, error: authErr } = await getService().auth.getUser(bearer);
    if (authData?.user) authUserId = authData.user.id;
    else {
      // Log why, with the token's non-secret claims (never the token), so a failing connector is diagnosable.
      let claims: Record<string, unknown> = {};
      try {
        const p = decodeJwt(bearer);
        claims = { iss: p.iss, aud: p.aud, role: p.role, client_id: p.client_id, exp: p.exp, sub: p.sub };
      } catch {
        // Not a JWT: probably a mistyped static token. Log its shape only — never the value.
        const raw = req.headers.get('Authorization') ?? '';
        claims = {
          not_a_jwt: true, raw_len: raw.length, token_len: bearer.length,
          hex64: /^[0-9a-f]{64}$/i.test(bearer), has_space: /\s/.test(bearer),
          static_len: (Deno.env.get('OVIS_MCP_INTAKE_TOKEN') ?? '').length,
        };
      }
      console.warn(`[ovis-mcp] invalid_token: jwks=${jwksErr}; getUser=${authErr?.message ?? 'no user'} ${JSON.stringify(claims)}`);
      return unauthorized('invalid_token');
    }
  }

  // "Internal" is whatever the database says it is — checked as the user.
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false },
  });
  const { data: internal, error: rpcErr } = await asUser.rpc('is_internal_user');
  if (rpcErr || internal !== true) {
    console.warn(`[ovis-mcp] denied ${authUserId}: ${rpcErr?.message ?? 'not internal'}`);
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  return { kind: 'user', authUserId };
}

// ----------------------------------------------------------------------------
// Tools
// ----------------------------------------------------------------------------

class ToolError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ToolError'; }
}

let _service: SupabaseClient | null = null;
function getService(): SupabaseClient {
  _service ??= createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  return _service;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const num = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new ToolError(`${field} must be a non-negative number`);
  return n;
};
const isoDate = (v: unknown, field: string): string | null => {
  const d = str(v);
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ToolError(`${field} must be YYYY-MM-DD`);
  return d;
};

function etToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** UTC instant of midnight America/New_York on a YYYY-MM-DD date (DST-aware). */
function etMidnight(date: string): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(utcMidnight.getTime() + 5 * 3_600_000)) // 00:00–01:00 local: before any 2am DST switch
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const m = tz.match(/GMT([+-]\d+)(?::(\d+))?/);
  const offsetMin = m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : -300;
  return new Date(utcMidnight.getTime() - offsetMin * 60_000);
}

/**
 * Google Geocoding when a server-side key is configured (GOOGLE_GEOCODING_API_KEY — the
 * browser VITE_ key is referrer-restricted and can't be used here), otherwise the free US
 * Census geocoder. Only an unambiguous match is accepted; anything else leaves the comp
 * without coordinates, which the review screen reports as "not on map".
 * Google API: https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 */
async function geocode(oneLine: string): Promise<{ lat: number; lng: number; via: string } | { error: string }> {
  const key = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
  if (key) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address: oneLine, key, region: 'us' })}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = await res.json();
    if (body.status !== 'OK' || !body.results?.length) return { error: `google: ${body.status}` };
    const r = body.results[0];
    if (r.partial_match) return { error: 'google: partial match only' };
    return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, via: 'google' };
  }
  // Census matches street addresses only; drop a trailing suite/unit, which it doesn't index.
  const cleaned = oneLine.replace(/\s*,?\s*(suite|ste|unit|#)\s*[\w-]+/i, '');
  const m = await censusGeocode(cleaned);
  if (!m) return { error: 'census: no match' };
  if (m.match_quality !== 'exact') return { error: `census: ${m.match_quality}` };
  return { lat: m.latitude, lng: m.longitude, via: 'census' };
}

async function toolUpsertListing(args: any, caller: Caller) {
  const address = str(args?.address);
  const city = str(args?.city);
  if (!address) throw new ToolError('address is required');
  if (!city) throw new ToolError('city is required');
  let capRate = num(args?.cap_rate, 'cap_rate');
  // A fraction (0.0625) was meant as a percent (6.25).
  if (capRate !== null && capRate > 0 && capRate < 1) capRate = Math.round(capRate * 10000) / 100;
  const state = (str(args?.state) ?? 'GA').toUpperCase();

  const supabase = getService();
  const { data, error } = await supabase.rpc('upsert_comp_listing', {
    p_tenant: str(args?.tenant),
    p_address: address,
    p_city: city,
    p_state: state,
    p_zip: str(args?.zip),
    p_apn: str(args?.apn),
    p_price: num(args?.price, 'price'),
    p_cap_rate: capRate,
    p_noi: num(args?.noi, 'noi'),
    p_lease_type: str(args?.lease_type),
    p_term_left: str(args?.term_left),
    p_guarantor_type: str(args?.guarantor_type),
    p_guarantor_name: str(args?.guarantor_name),
    p_source: str(args?.source),
    p_source_url: str(args?.source_url),
    p_list_date: isoDate(args?.list_date, 'list_date'),
    p_broker_name: str(args?.broker_name),
    p_brokerage: str(args?.brokerage),
    p_acting_auth_id: actingAuthId(caller),
  });
  if (error) throw new ToolError(`upsert_listing failed: ${error.message}`);
  const result = data as Record<string, unknown>;

  // Geocode a comp with no coordinates (new, or an earlier attempt failed — retried each
  // daily sighting). Raw latitude/longitude only; verified_* stay human-set.
  if (result.needs_geocode && !result.skipped) {
    try {
      const g = await geocode(`${address}, ${city}, ${state}`);
      if ('error' in g) {
        result.geocode = `not placed on map (${g.error})`;
      } else {
        await supabase.from('comp_property').update({ latitude: g.lat, longitude: g.lng }).eq('id', result.comp_property_id);
        result.geocode = `placed on map via ${g.via}`;
      }
    } catch (e) {
      result.geocode = `geocoding error, will retry on next sighting: ${e instanceof Error ? e.message : e}`;
    }
  }
  delete result.needs_geocode;

  // A NEW offering (new comp, or a relist of an existing comp) gets its diligence task
  // server-side, same RPC as create_va_task. Re-sightings and price/cap changes never do.
  // A task failure doesn't fail the upsert: the listing is saved, and a retry would be an
  // update (no task), so the error is returned for the caller to fix with create_va_task.
  if (result.is_new === true && !result.skipped) {
    try {
      const task = await createVaTask({ listing_id: result.listing_id }, caller) as Record<string, unknown>;
      result.va_task_id = task?.task_id ?? null;
      result.va_task_assignee = DEFAULT_VA_ASSIGNEE;
    } catch (e) {
      result.va_task_error = `${e instanceof Error ? e.message : e} — listing saved; call create_va_task to retry`;
    }
  }
  return { id: result.listing_id, ...result }; // `id` kept for v1 callers
}

/** Shared by create_va_task and upsert_listing's automatic task for new listings. */
async function createVaTask(args: any, caller: Caller) {
  const listingId = str(args?.listing_id);
  if (!listingId) throw new ToolError('listing_id is required');
  const due = isoDate(args?.due, 'due') ?? etToday();
  const checklist = Array.isArray(args?.checklist) && args.checklist.length
    ? args.checklist.filter((x: unknown) => typeof x === 'string')
    : DEFAULT_VA_CHECKLIST;

  const { data, error } = await getService().rpc('create_comp_va_task', {
    p_listing_id: listingId,
    p_assignee_first_name: str(args?.assignee) ?? DEFAULT_VA_ASSIGNEE,
    p_due: due,
    p_title: str(args?.title),
    p_checklist: checklist,
    p_acting_auth_id: actingAuthId(caller),
  });
  if (error) throw new ToolError(`create_va_task failed: ${error.message}`);
  return data;
}

async function toolListRecentListings(args: any) {
  const days = args?.days === undefined ? 30 : Number(args.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ToolError('days must be an integer 1..365');
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const PAGE = 1000;
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await getService()
      .from('comp_listing_facts')
      .select('listing_id, comp_property_id, address_norm, tenant, first_seen_at, last_seen_at, listing_status, review_status, current_ask, current_cap')
      .gte('first_seen_at', since)
      .order('first_seen_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new ToolError(`list_recent_listings failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return { days, count: rows.length, listings: rows };
}

async function toolListingActivity(args: any) {
  let since: Date;
  let until: Date;
  const sinceArg = str(args?.since);
  if (sinceArg) {
    since = new Date(sinceArg);
    if (Number.isNaN(since.getTime())) throw new ToolError('since must be an ISO timestamp');
    until = new Date();
  } else {
    const date = isoDate(args?.date, 'date') ?? etToday();
    since = etMidnight(date);
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    until = etMidnight(next.toISOString().slice(0, 10));
  }
  const { data, error } = await getService().rpc('listing_activity', {
    p_since: since.toISOString(),
    p_until: until.toISOString(),
  });
  if (error) throw new ToolError(`listing_activity failed: ${error.message}`);
  return data;
}

const TOOL_IMPLS: Record<string, (args: unknown, caller: Caller) => Promise<unknown>> = {
  upsert_listing: toolUpsertListing,
  create_va_task: createVaTask,
  list_recent_listings: toolListRecentListings,
  listing_activity: toolListingActivity,
};

// ----------------------------------------------------------------------------
// JSON-RPC
// ----------------------------------------------------------------------------

const ok = (id: JsonRpcId, result: unknown) => ({ jsonrpc: '2.0', id, result });
const err = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleJsonRpc(msg: JsonRpcRequest, caller: Caller) {
  const isNotification = msg.id === undefined || msg.id === null;
  const id = msg.id ?? null;
  try {
    if (msg.method === 'initialize') {
      const requested = msg.params?.protocolVersion;
      return ok(id, {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    if (msg.method.startsWith('notifications/')) return null;
    if (msg.method === 'ping') return ok(id, {});
    if (msg.method === 'tools/list') return ok(id, { tools: TOOLS });
    if (msg.method === 'tools/call') {
      const name = msg.params?.name;
      if (!name || !(name in TOOL_IMPLS)) return err(id, E_INVALID_PARAMS, `Unknown tool: ${name}`);
      try {
        const result = await TOOL_IMPLS[name](msg.params?.arguments ?? {}, caller);
        return ok(id, { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
      } catch (e) {
        // Tool failures go back as isError results so the model can read and react.
        return ok(id, { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    if (isNotification) return null;
    return err(id, E_METHOD_NOT_FOUND, `Unknown method: ${msg.method}`);
  } catch (e) {
    if (isNotification) return null;
    return err(id, E_INTERNAL, e instanceof Error ? e.message : String(e));
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
}

// ----------------------------------------------------------------------------
// HTTP
// ----------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const path = new URL(req.url).pathname;
  if (req.method === 'GET' && path.endsWith('/.well-known/oauth-protected-resource')) {
    // RFC 9728 protected-resource metadata. Supabase Auth publishes the authorization-server
    // metadata itself at /.well-known/oauth-authorization-server/auth/v1.
    return json({
      resource: RESOURCE_URL,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'OVIS',
    });
  }
  if (req.method === 'GET') {
    // No SSE stream offered; JSON responses only.
    return new Response('Method Not Allowed', { status: 405, headers: { ...CORS_HEADERS, Allow: 'POST, OPTIONS' } });
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });

  const caller = await authorize(req);
  if (caller instanceof Response) return caller;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(err(null, E_PARSE, 'Parse error: body is not valid JSON'), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleJsonRpc(m as JsonRpcRequest, caller)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  if (!body || typeof body !== 'object' || typeof (body as any).method !== 'string') {
    return json(err(null, E_INVALID_REQUEST, 'Invalid request'), 400);
  }
  const res = await handleJsonRpc(body as JsonRpcRequest, caller);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS_HEADERS });
});
