/**
 * OVIS Research MCP — Edge Function
 *
 * Speaks MCP (Model Context Protocol) over HTTP, JSON-RPC 2.0. Exposes four tools
 * to the OpenClaw market-research subagent. See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md
 * Phase C and docs/market-research-agent-spec.md §8 for the contract.
 *
 * Tools:
 *   1. get_municipalities_in_radius(site_id, radius_miles?)
 *   2. create_research_checklist(site_id, radius_miles, municipality_ids[], openclaw_run_id?)
 *   3. update_checklist_status(research_run_id, boundary_municipality_id, status, notes?)
 *   4. submit_research_report(research_run_id, candidate_records[], needs_review?, alt_avenues?)
 *
 * Auth: bearer token in Authorization header, validated against env OVIS_MCP_BEARER_TOKEN.
 * Writes go through SECURITY DEFINER RPCs (see 20260607120000_market_research_mcp_rpcs.sql)
 * or direct supabase-js with the service role key.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ----------------------------------------------------------------------------
// Constants & types
// ----------------------------------------------------------------------------

const SERVER_INFO = { name: 'ovis-research-mcp', version: '0.1.0' };
const MCP_PROTOCOL_VERSION = '2025-03-26';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}
interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}
interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

// JSON-RPC error codes (per spec + MCP convention)
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
    name: 'get_municipalities_in_radius',
    description:
      'Return all incorporated cities and counties within a radius of a Starbucks site_submit, ordered by distance (closest first). Use this as the FIRST step of any research run to build the per-municipality checklist. Both cities and counties are returned because city portals miss developments in unincorporated county land.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: {
          type: 'string',
          format: 'uuid',
          description: 'The site_submit.id to research.',
        },
        radius_miles: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Search radius in miles (1..50). Default 10. Use 5 for dense metro areas, 15 for rural.',
        },
      },
      required: ['site_id'],
    },
  },
  {
    name: 'create_research_checklist',
    description:
      'Create a new research_run + per-municipality checklist for a site_submit. Pass municipality_ids in priority order (closest-first), typically the order returned by get_municipalities_in_radius. Returns the research_run_id to use for subsequent update_checklist_status + submit_research_report calls.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', format: 'uuid' },
        radius_miles: { type: 'integer', minimum: 1, maximum: 50 },
        municipality_ids: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          minItems: 1,
          description: 'boundary_municipality.id values in priority order (priority 1 = first item).',
        },
        openclaw_run_id: {
          type: 'string',
          description: "Optional correlation ID from the agent's own run tracker.",
        },
      },
      required: ['site_id', 'radius_miles', 'municipality_ids'],
    },
  },
  {
    name: 'update_checklist_status',
    description:
      'Mark a municipality on a research_run as in_progress / complete / skipped / blocked. Status changes are idempotent. Optional notes capture per-municipality color (alt avenue used, dead-end reason, blocked-on questions).',
    inputSchema: {
      type: 'object',
      properties: {
        research_run_id: { type: 'string', format: 'uuid' },
        boundary_municipality_id: { type: 'string', format: 'uuid' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'complete', 'skipped', 'blocked'],
        },
        notes: { type: 'string', description: 'Optional per-municipality notes.' },
      },
      required: ['research_run_id', 'boundary_municipality_id', 'status'],
    },
  },
  {
    name: 'submit_research_report',
    description:
      'Single batched write at the end of a research_run. Inserts all candidate development records into the staging table with server-side duplicate detection against existing municipal_project rows. Updates the run state to awaiting_review. SEND ALL RECORDS IN ONE CALL — this tool is explicitly designed to be the only write at end-of-run, avoiding chatty per-record calls.',
    inputSchema: {
      type: 'object',
      properties: {
        research_run_id: { type: 'string', format: 'uuid' },
        candidate_records: {
          type: 'array',
          description: 'Array of agent-discovered development records. See spec §7 for field semantics.',
          items: {
            type: 'object',
            properties: {
              boundary_municipality_id: { type: 'string', format: 'uuid', description: 'Which muni this record was found in.' },
              project_name: { type: 'string' },
              address: { type: 'string' },
              phase_label: { type: 'string', description: 'e.g. "Phase I" / "Phase 2" / "" — extract from notes if present.' },
              total_housing_units: { type: 'integer', minimum: 0 },
              single_family_lots: { type: ['integer', 'null'] },
              townhouse_units: { type: ['integer', 'null'] },
              duplex_units: { type: ['integer', 'null'] },
              apt_units: { type: ['integer', 'null'] },
              cottage_units: { type: ['integer', 'null'] },
              zoning: { type: ['string', 'null'] },
              zoning_approval_date: { type: ['string', 'null'], format: 'date' },
              builder_developer: { type: ['string', 'null'] },
              permit_url: { type: ['string', 'null'] },
              permit_application_date: { type: ['string', 'null'], format: 'date' },
              source: { type: 'string', description: 'REQUIRED. Where this record came from (Citizens Portal permit #, news article, builder website, econ-dev email attachment, etc.).' },
              notes: { type: ['string', 'null'], description: 'Any extra detail not covered by the schema.' },
              status_name: {
                type: ['string', 'null'],
                description: 'Project status by NAME (case-insensitive). Canonical values: "Planning" (use this when the source calls it "Pending"), "Approved", "Under Construction", "Recently Completed". Use this rather than status_stage_id whenever possible; unknown names fall back to NULL silently.',
              },
              status_stage_id: {
                type: ['string', 'null'],
                format: 'uuid',
                description: 'Project status by UUID. Only set this if you somehow already know the UUID; otherwise prefer status_name. If both are provided, status_stage_id wins.',
              },
              raw_stages: { type: 'object', description: 'Per-muni stage column data, free-form jsonb.' },
            },
            required: ['boundary_municipality_id', 'project_name', 'address', 'source'],
          },
        },
        needs_review: {
          type: 'string',
          description: 'Free-text "needs review" section — anything that didn\'t fit the schema or is incomplete. Mike sees + edits this in the approval UI.',
        },
        alt_avenues: {
          type: 'string',
          description: 'Free-text notes about alternative research avenues taken (developer association, county news outlet, builder forum, etc.).',
        },
      },
      required: ['research_run_id', 'candidate_records'],
    },
  },
] as const;

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------

function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('OVIS_MCP_BEARER_TOKEN');
  if (!expected) return false; // server misconfigured → deny
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1].trim() === expected;
}

// ----------------------------------------------------------------------------
// Tool implementations
// ----------------------------------------------------------------------------

function getSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

async function toolGetMunicipalitiesInRadius(args: any) {
  const { site_id, radius_miles = 10 } = args ?? {};
  if (typeof site_id !== 'string') throw new ToolError('site_id is required');
  if (!Number.isInteger(radius_miles)) throw new ToolError('radius_miles must be an integer');

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('get_municipalities_in_radius_for_site', {
    p_site_id: site_id,
    p_radius_miles: radius_miles,
  });
  if (error) throw new ToolError(`get_municipalities_in_radius failed: ${error.message}`);
  return { radius_miles, count: data?.length ?? 0, municipalities: data ?? [] };
}

async function toolCreateResearchChecklist(args: any) {
  const { site_id, radius_miles, municipality_ids, openclaw_run_id } = args ?? {};
  if (typeof site_id !== 'string') throw new ToolError('site_id is required');
  if (!Number.isInteger(radius_miles)) throw new ToolError('radius_miles must be an integer');
  if (!Array.isArray(municipality_ids) || municipality_ids.length === 0) {
    throw new ToolError('municipality_ids must be a non-empty array');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_research_run_with_checklist', {
    p_site_id: site_id,
    p_radius_miles: radius_miles,
    p_boundary_muni_ids: municipality_ids,
    p_openclaw_run_id: openclaw_run_id ?? null,
    p_triggered_by: null,
  });
  if (error) throw new ToolError(`create_research_checklist failed: ${error.message}`);
  return { research_run_id: data, checklist_size: municipality_ids.length };
}

async function toolUpdateChecklistStatus(args: any) {
  const { research_run_id, boundary_municipality_id, status, notes } = args ?? {};
  if (typeof research_run_id !== 'string') throw new ToolError('research_run_id is required');
  if (typeof boundary_municipality_id !== 'string') throw new ToolError('boundary_municipality_id is required');
  const allowedStatuses = ['pending', 'in_progress', 'complete', 'skipped', 'blocked'];
  if (!allowedStatuses.includes(status)) throw new ToolError(`status must be one of ${allowedStatuses.join('/')}`);

  const supabase = getSupabase();
  const updates: Record<string, unknown> = { status };
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from('research_checklist_item')
    .update(updates)
    .eq('research_run_id', research_run_id)
    .eq('boundary_municipality_id', boundary_municipality_id)
    .select('id, status, updated_at')
    .single();

  if (error) throw new ToolError(`update_checklist_status failed: ${error.message}`);
  return data;
}

async function toolSubmitResearchReport(args: any) {
  const { research_run_id, candidate_records, needs_review, alt_avenues } = args ?? {};
  if (typeof research_run_id !== 'string') throw new ToolError('research_run_id is required');
  if (!Array.isArray(candidate_records)) throw new ToolError('candidate_records must be an array');

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('submit_research_report', {
    p_run_id: research_run_id,
    p_candidates: candidate_records,
    p_needs_review: needs_review ?? null,
    p_alt_avenues: alt_avenues ?? null,
  });
  if (error) throw new ToolError(`submit_research_report failed: ${error.message}`);
  return { staged_count: data, research_run_id };
}

class ToolError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ToolError'; }
}

const TOOL_IMPLS: Record<string, (args: unknown) => Promise<unknown>> = {
  get_municipalities_in_radius: toolGetMunicipalitiesInRadius,
  create_research_checklist:    toolCreateResearchChecklist,
  update_checklist_status:      toolUpdateChecklistStatus,
  submit_research_report:       toolSubmitResearchReport,
};

// ----------------------------------------------------------------------------
// JSON-RPC dispatcher
// ----------------------------------------------------------------------------

async function handleJsonRpc(msg: JsonRpcRequest): Promise<JsonRpcSuccess | JsonRpcError | null> {
  // Notifications (no id) get no response, only side effects.
  const isNotification = msg.id === undefined || msg.id === null;

  try {
    if (msg.method === 'initialize') {
      return ok(msg.id ?? null, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }
    if (msg.method === 'notifications/initialized') {
      return null; // notification — no response
    }
    if (msg.method === 'tools/list') {
      return ok(msg.id ?? null, { tools: TOOLS });
    }
    if (msg.method === 'tools/call') {
      const params = msg.params as { name?: string; arguments?: unknown } | undefined;
      const name = params?.name;
      const args = params?.arguments;
      if (!name || !(name in TOOL_IMPLS)) {
        return err(msg.id ?? null, E_INVALID_PARAMS, `Unknown tool: ${name}`);
      }
      try {
        const result = await TOOL_IMPLS[name](args);
        return ok(msg.id ?? null, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: false,
        });
      } catch (e) {
        // Tool errors come back as a successful MCP response with isError=true,
        // so the agent can see + reason about the failure rather than aborting.
        const message = e instanceof Error ? e.message : String(e);
        return ok(msg.id ?? null, {
          content: [{ type: 'text', text: message }],
          isError: true,
        });
      }
    }
    if (isNotification) return null;
    return err(msg.id ?? null, E_METHOD_NOT_FOUND, `Unknown method: ${msg.method}`);
  } catch (e) {
    if (isNotification) return null;
    const message = e instanceof Error ? e.message : String(e);
    return err(msg.id ?? null, E_INTERNAL, message);
  }
}

function ok(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result };
}
function err(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ----------------------------------------------------------------------------
// HTTP entrypoint
// ----------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method === 'GET') {
    // Health/landing — exposes server info, NOT tool list (auth-gated).
    return jsonResponse({ serverInfo: SERVER_INFO, protocolVersion: MCP_PROTOCOL_VERSION, transport: 'http' });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(err(null, E_PARSE, 'Parse error: body is not valid JSON'), 400);
  }

  // MCP allows batched requests (array). Handle both single + batch.
  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(m => handleJsonRpc(m as JsonRpcRequest)))).filter(Boolean);
    if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
    return jsonResponse(responses);
  }
  if (!body || typeof body !== 'object') {
    return jsonResponse(err(null, E_INVALID_REQUEST, 'Invalid request: not a JSON-RPC object or batch'), 400);
  }
  const response = await handleJsonRpc(body as JsonRpcRequest);
  if (response === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return jsonResponse(response);
});
