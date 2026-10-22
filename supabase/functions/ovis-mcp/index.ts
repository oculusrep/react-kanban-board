/**
 * OVIS MCP — Edge Function (general-purpose OVIS MCP server; first tools: NNN listing intake)
 *
 * MCP over HTTP (JSON-RPC 2.0, JSON responses). Built to be added as a claude.ai custom
 * connector. See docs/NNN_LISTING_INTAKE.md.
 *
 * Tools (narrow — no raw SQL; every write is a SECURITY DEFINER RPC granted to service_role):
 *   1. upsert_listing(tenant, address, city, price, cap_rate, lease_type, term_left, source, source_url, …)
 *   2. create_va_task(listing_id, assignee='Noree', due=today, title?, checklist?)
 *   3. list_recent_listings(days=30)
 *
 * Auth — two accepted credentials, both as `Authorization: Bearer …`:
 *   a) OAuth 2.1 access token issued by Supabase Auth's OAuth server (what claude.ai uses; it
 *      discovers the server via the WWW-Authenticate → protected-resource metadata below and
 *      registers itself with Dynamic Client Registration). The token's user must pass
 *      public.is_internal_user(), checked AS that user.
 *      Docs: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
 *   b) Static token = env OVIS_MCP_INTAKE_TOKEN, for Claude Code / scripts (claude.ai web
 *      connectors cannot send a static header). Acts as no OVIS user (created_by NULL).
 * verify_jwt is off for this function (config.toml); the checks above are the gate.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { censusGeocode } from '../_shared/site-research/geocode.ts';

const SERVER_INFO = { name: 'ovis-mcp', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26'];

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const RESOURCE_URL = `${SUPABASE_URL}/functions/v1/ovis-mcp`;
const RESOURCE_METADATA_URL = `${RESOURCE_URL}/.well-known/oauth-protected-resource`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
};

const DEFAULT_VA_CHECKLIST = [
  'Get OM',
  'Confirm guarantor (corporate vs franchisee)',
  'Base rent / NOI',
  'Rent increases',
  'Options',
  'Lease start / expiry',
  'APN',
  'Attach OM PDF',
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
      'Record an NNN investment listing (single-tenant net-lease property for sale) in OVIS listing staging. The address is normalized server-side (with city + state) and de-duplicated: a listing already seen just gets last_seen bumped and any newly supplied fields refreshed. New listings are geocoded and appear on the OVIS map. Returns {id, is_new}. Call create_va_task afterwards for new listings that need diligence.',
    inputSchema: {
      type: 'object',
      properties: {
        tenant: { type: 'string', description: 'Tenant / brand, e.g. "Taco Bell".' },
        address: { type: 'string', description: 'Street address, e.g. "1234 Peachtree Industrial Blvd".' },
        city: { type: 'string' },
        state: { type: 'string', default: 'GA', description: 'Two-letter state. Default GA.' },
        price: { type: ['number', 'null'], description: 'Asking price in dollars.' },
        cap_rate: { type: ['number', 'null'], description: 'Cap rate as a PERCENT, e.g. 6.25 for 6.25%.' },
        lease_type: { type: ['string', 'null'], description: 'As listed, e.g. "Absolute NNN", "NN", "Ground lease".' },
        term_left: { type: ['string', 'null'], description: 'Remaining lease term as listed, e.g. "14 years".' },
        guarantor_type: { type: ['string', 'null'], description: 'Only if the listing states it: "corporate" or "franchisee".' },
        source: { type: ['string', 'null'], description: 'Where it was found, e.g. "Crexi", "LoopNet", "broker email".' },
        source_url: { type: ['string', 'null'] },
      },
      required: ['tenant', 'address', 'city'],
    },
  },
  {
    name: 'create_va_task',
    description:
      "Create a diligence task for a staged listing in a VA's OVIS task Inbox (default: Noree), with a checklist. The default checklist is: get OM, confirm guarantor (corp vs franchisee), base rent/NOI, increases, options, lease start/expiry, APN, attach OM PDF. Returns the task id.",
    inputSchema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string', format: 'uuid', description: 'id returned by upsert_listing.' },
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
      'List staged NNN listings first seen in the last N days (default 30), newest first. Use it to avoid re-reporting listings already captured.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
      },
    },
  },
] as const;

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------

type Caller = { kind: 'static' } | { kind: 'user'; ovisUserId: string | null };

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
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return unauthorized('missing_token');

  if (safeEqual(bearer, Deno.env.get('OVIS_MCP_INTAKE_TOKEN') ?? '')) return { kind: 'static' };

  const service = getService();
  const { data: authData, error: authErr } = await service.auth.getUser(bearer);
  if (authErr || !authData?.user) return unauthorized('invalid_token');

  // "Internal" is whatever the database says it is — checked as the user.
  const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false },
  });
  const { data: internal, error: rpcErr } = await asUser.rpc('is_internal_user');
  if (rpcErr || internal !== true) {
    console.warn(`[ovis-mcp] denied ${authData.user.id}: ${rpcErr?.message ?? 'not internal'}`);
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { data: u } = await service.from('user').select('id').eq('auth_user_id', authData.user.id).maybeSingle();
  return { kind: 'user', ovisUserId: u?.id ?? null };
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

function etToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Google Geocoding when a server-side key is configured (GOOGLE_GEOCODING_API_KEY — the
 * browser VITE_ key is referrer-restricted and can't be used here), otherwise the free US
 * Census geocoder. Only an unambiguous match is accepted; anything else is recorded as
 * geocode_status='failed' so the review screen says so instead of dropping a wrong pin.
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
  const { data, error } = await supabase.rpc('upsert_listing_staging', {
    p_tenant: str(args?.tenant),
    p_address: address,
    p_city: city,
    p_state: state,
    p_price: num(args?.price, 'price'),
    p_cap_rate: capRate,
    p_lease_type: str(args?.lease_type),
    p_term_left: str(args?.term_left),
    p_source: str(args?.source),
    p_source_url: str(args?.source_url),
    p_guarantor_type: str(args?.guarantor_type),
    p_acting_user_id: caller.kind === 'user' ? caller.ovisUserId : null,
  });
  if (error) throw new ToolError(`upsert_listing failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;

  let geocoded: string | null = null;
  if (row?.needs_geocode) {
    try {
      const g = await geocode(`${address}, ${city}, ${state}`);
      const patch = 'error' in g
        ? { geocode_status: 'failed' }
        : { lat: g.lat, lng: g.lng, geocode_status: 'ok' };
      await supabase.from('listing_staging').update(patch).eq('id', row.id);
      geocoded = 'error' in g ? `not placed on map (${g.error})` : `placed on map via ${g.via}`;
    } catch (e) {
      // Leave geocode_status NULL so the next sighting retries.
      geocoded = `geocoding error, will retry on next sighting: ${e instanceof Error ? e.message : e}`;
    }
  }

  return { id: row.id, is_new: row.is_new, address_norm: row.address_norm, ...(geocoded ? { geocode: geocoded } : {}) };
}

async function toolCreateVaTask(args: any, caller: Caller) {
  const listingId = str(args?.listing_id);
  if (!listingId) throw new ToolError('listing_id is required');
  const due = str(args?.due) ?? etToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new ToolError('due must be YYYY-MM-DD');
  const checklist = Array.isArray(args?.checklist) && args.checklist.length
    ? args.checklist.filter((x: unknown) => typeof x === 'string')
    : DEFAULT_VA_CHECKLIST;

  const { data, error } = await getService().rpc('create_listing_va_task', {
    p_listing_id: listingId,
    p_assignee_first_name: str(args?.assignee) ?? 'Noree',
    p_due: due,
    p_title: str(args?.title),
    p_checklist: checklist,
    p_acting_user_id: caller.kind === 'user' ? caller.ovisUserId : null,
  });
  if (error) throw new ToolError(`create_va_task failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { task_id: row.task_id, assignee_id: row.assignee_id, due: row.due_date, checklist_items: row.checklist_count };
}

async function toolListRecentListings(args: any) {
  const days = args?.days === undefined ? 30 : Number(args.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ToolError('days must be an integer 1..365');
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const PAGE = 1000;
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await getService()
      .from('listing_staging')
      .select('id, address_norm, tenant, first_seen, last_seen, status')
      .gte('first_seen', since)
      .order('first_seen', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new ToolError(`list_recent_listings failed: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return { days, count: rows.length, listings: rows };
}

const TOOL_IMPLS: Record<string, (args: unknown, caller: Caller) => Promise<unknown>> = {
  upsert_listing: toolUpsertListing,
  create_va_task: toolCreateVaTask,
  list_recent_listings: toolListRecentListings,
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
