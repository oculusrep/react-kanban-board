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
 *   4. submit_research_report(research_run_id, candidate_records[], needs_review?, alt_avenues?, final?)
 *      Cumulative checkpoint after each municipality (replaces the staged set);
 *      only final: true moves the run to awaiting_review. Quick runs also carry
 *      signal_strength / signal_rationale / density_estimate / permit_volume /
 *      leads_not_pursued (same overwrite-every-call semantics).
 *
 * Auth: bearer token in Authorization header, validated against env OVIS_MCP_BEARER_TOKEN.
 * Writes go through SECURITY DEFINER RPCs (see 20260607120000_market_research_mcp_rpcs.sql)
 * or direct supabase-js with the service role key.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { estimateMissingUnits } from '../_shared/research-unit-estimator.ts';
import { triageLeads } from '../_shared/research-lead-triage.ts';
import { fetchBoundariesForRuns } from '../_shared/research-parcel-fetch.ts';
import { locateRun } from '../_shared/research-locate.ts';
import { notifyResearchTelegram, chunkLabel, getSweepInfo, sendSweepReadyIfDone } from '../_shared/research-telegram.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

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
      'Stage candidate development records for a research_run, with server-side duplicate detection against existing municipal_project rows. Call it after EACH municipality with EVERY record found so far in this run — each call REPLACES the run\'s staged set, so a call that leaves a record out deletes it. Carry needs_review and alt_avenues cumulatively on every call too; each call overwrites them, and omitting them clears them. Set final: true ONLY on the last call, after every municipality is done: that is the only call that closes the run and sends it to review. Calls without final: true are checkpoints — the run stays open, and if you stop early, the last checkpoint is what survives. Quick runs: also send the Deep-run recommendation (signal_strength, signal_rationale, density_estimate, permit_volume, leads_not_pursued) on EVERY call, cumulatively — like needs_review, each call overwrites them and a call that omits them ERASES them. A malformed recommendation field (e.g. signal_strength "moderate-to-strong") rejects the WHOLE call and nothing from it is staged; fix the field and resend. Deep runs omit all five. Returns { staged_count, final, state }.',
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
              location_description: {
                type: ['string', 'null'],
                description: 'Human-readable precise location descriptor for manual pin placement — e.g. "NWC of Hwy 92 & Dallas-Acworth Rd, behind the Publix". Distinct from address (which drives geocoding). Does NOT feed geocoding; the reviewer reads this when manually adjusting the pin. Omit / null if no source stated the precise location.',
              },
              parcel_boundary_notes: {
                type: ['string', 'null'],
                description: 'Any boundary/parcel detail STATED IN A SOURCE — prioritize tax parcel ID(s), then acreage, then bounding roads/features/frontage (e.g. "Parcel 045-123; ~42 acres; bounded by Cole Lake Rd (N) and creek (E)"). Used by the reviewer to manually draw the project polygon. Capture only what sources state; do NOT derive geometry.',
              },
              phase_label: { type: 'string', description: 'e.g. "Phase I" / "Phase 2" / "" — extract from notes if present.' },
              total_housing_units: {
                type: ['integer', 'null'],
                minimum: 1,
                description: 'Total units ONLY when a source states the count. If no source gives one, send null — never 0, and never 25 or any other placeholder or density estimate (put an estimate in notes, labelled as one). A null-count record is kept and flagged for the reviewer, not dropped, so there is no need to invent a number to get it staged.',
              },
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
              source: { type: 'string', description: 'REQUIRED. Where this record came from (Citizens Portal permit #, news article, builder website, econ-dev email attachment, etc.). Free text; may cite several sources at once.' },
              discovery_source: {
                type: ['string', 'null'],
                enum: ['pz_agenda', 'news', 'permit_portal', 'activity_pdf', 'builder_site', 'econ_dev', 'other', null],
                description: 'OPTIONAL. Which research phase actually FOUND this record — a single value, unlike the free-text `source` citation which often lists several. Used to measure which phases are worth keeping. pz_agenda = P&Z/planning commission/BOC/council agendas or minutes; news = news articles or press; permit_portal = Citizens Portal / Accela / EnerGov permit lookups; activity_pdf = monthly permit-activity report PDFs; builder_site = builder or developer websites and listings; econ_dev = econ-dev pages or open-records attachments; other = none of these. Omit or null if unsure — do NOT guess. Unrecognized values are coerced to "other".',
              },
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
        final: {
          type: 'boolean',
          default: false,
          description: 'true ONLY on the last call of the run, once every municipality is done. Closes the run and opens it for review. Omitted or false = checkpoint: records are saved, the run stays open.',
        },
        needs_review: {
          type: 'string',
          description: 'Free-text "needs review" section — anything that didn\'t fit the schema or is incomplete. Mike sees + edits this in the approval UI. Cumulative: send the full text so far on every call (each call overwrites it).',
        },
        alt_avenues: {
          type: 'string',
          description: 'Free-text notes about alternative research avenues taken (developer association, county news outlet, builder forum, etc.). Cumulative: send the full text so far on every call (each call overwrites it).',
        },
        // Quick-mode Deep-run recommendation. Deep runs omit all five.
        signal_strength: {
          type: ['string', 'null'],
          enum: ['strong', 'moderate', 'weak', null],
          description: 'QUICK RUNS. Is a Deep run worth it here? Exactly one of "strong", "moderate", "weak" (lowercase). No in-between values: "moderate-to-strong" rejects the whole call — pick one and explain in signal_rationale. Cumulative: resend on every call; omitting it erases it.',
        },
        signal_rationale: {
          type: ['string', 'null'],
          description: 'QUICK RUNS. Which signals drove signal_strength. Cumulative: resend on every call; omitting it erases it.',
        },
        density_estimate: {
          type: ['array', 'null'],
          description: 'QUICK RUNS. One entry per municipality. Either the sample figures, or not_sampled_reason when no meetings could be sampled. Cumulative: resend on every call; omitting it erases it.',
          items: {
            type: 'object',
            properties: {
              municipality: { type: 'string', description: 'REQUIRED. Municipality name as on the checklist.' },
              meetings_in_window: { type: ['integer', 'null'], minimum: 0, description: 'Total P&Z/council meetings in the run window.' },
              meetings_sampled: { type: ['integer', 'null'], minimum: 0, description: 'How many of those you actually read.' },
              meetings_with_residential: { type: ['integer', 'null'], minimum: 0, description: 'How many sampled meetings had residential items.' },
              extrapolated_count: { type: ['integer', 'null'], minimum: 0, description: 'Estimated residential items across the whole window.' },
              not_sampled_reason: { type: ['string', 'null'], description: 'Why none could be sampled (no agendas online, portal down, ...). Set this instead of the counts.' },
            },
            required: ['municipality'],
          },
        },
        permit_volume: {
          type: ['array', 'null'],
          description: 'QUICK RUNS. One entry per municipality: the permit search result count, or no_count_reason. Cumulative: resend on every call; omitting it erases it.',
          items: {
            type: 'object',
            properties: {
              municipality: { type: 'string', description: 'REQUIRED. Municipality name as on the checklist.' },
              result_count: { type: ['integer', 'null'], minimum: 0, description: 'Residential permit results in the window.' },
              no_count_reason: { type: ['string', 'null'], description: 'Why there is no count: login required, no public search, portal not drivable, ...' },
            },
            required: ['municipality'],
          },
        },
        leads_not_pursued: {
          type: ['array', 'null'],
          description: 'QUICK RUNS. Names (projects, developers, subdivisions) that surfaced but you did not chase — where a Deep run should start. Cumulative: resend on every call; omitting it erases it.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'REQUIRED. The project / developer / subdivision name as it appeared.' },
              seen_in: { type: 'string', description: 'REQUIRED. Where you saw it — document and date, e.g. "Senoia P&Z agenda 2026-03-12, item 4".' },
              municipality: { type: ['string', 'null'], description: 'Municipality name, if known.' },
              note: { type: ['string', 'null'], description: 'Anything else worth knowing (acreage, applicant, why not pursued).' },
            },
            required: ['name', 'seen_in'],
          },
        },
        // Usage accounting. OVIS cannot derive these — the token counts live in
        // the agent's own LLM responses. Omitting them leaves the run's cost
        // columns NULL ("not measured"), which is safe.
        estimated_cost_cents: {
          type: ['integer', 'null'],
          minimum: 0,
          description: 'OPTIONAL. Estimated total cost of this run in INTEGER CENTS (e.g. 1843 = $18.43), not dollars. Omit if unknown.',
        },
        input_tokens: {
          type: ['integer', 'null'],
          minimum: 0,
          description: 'OPTIONAL. Total input/prompt tokens consumed across this run.',
        },
        output_tokens: {
          type: ['integer', 'null'],
          minimum: 0,
          description: 'OPTIONAL. Total output/completion tokens produced across this run.',
        },
        cost_usd: {
          type: ['number', 'null'],
          minimum: 0,
          description: 'OPTIONAL. Total model cost of this run in US DOLLARS (e.g. 18.43). Stored as estimated_cost_cents; if both are sent, cost_usd wins. Send cumulative totals on every call — a call that omits them keeps the last values.',
        },
      },
      required: ['research_run_id', 'candidate_records'],
    },
  },
  {
    name: 'get_sweep_known_projects',
    description:
      'Deep sweeps only. List every project the OTHER chunks of your sweep have already staged (rejected ones excluded): name, phase, municipality, address, unit count, case numbers, which chunk found it and its research_scope. Call it at the start of a chunk and before staging: do not re-stage a listed project unless your window adds something new to it (an approval, plat, permit or a sourced unit count), and then use the SAME name and phase so dedupe can match it. Returns { sweep_id: null, projects: [] } for a run that is not part of a sweep.',
    inputSchema: {
      type: 'object',
      properties: {
        research_run_id: { type: 'string', format: 'uuid', description: 'Your current research_run_id.' },
      },
      required: ['research_run_id'],
    },
  },
  {
    name: 'get_municipality_sources',
    description:
      'Before researching a municipality, read what earlier runs learned about its sources: permit portal, minutes, agendas, plat records — each with URL, status (works / blocked / none_exists), how to use it, and when it was last verified. effective_status is "unverified" for a blocked / none_exists entry older than 90 days: check that source ONCE more before skipping it, then record the result with set_municipality_source. A fresh blocked / none_exists entry can be skipped without re-checking. A "works" entry tells you the URL and the technique that worked (e.g. needs a browser, use firecrawl).',
    inputSchema: {
      type: 'object',
      properties: {
        municipality_ids: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          minItems: 1,
          description: 'boundary_municipality.id values (as returned by get_municipalities_in_radius).',
        },
      },
      required: ['municipality_ids'],
    },
  },
  {
    name: 'set_municipality_source',
    description:
      'Record what you found about ONE source for a municipality, so later runs (and later chunks of this sweep) do not rediscover it. Call it whenever a source works, is blocked, or turns out not to exist — and when you re-check an unverified entry. Upserts on (municipality, source_type, url) and stamps last_verified = now. Keep notes short and practical: what worked, what failed, how to get in.',
    inputSchema: {
      type: 'object',
      properties: {
        boundary_municipality_id: { type: 'string', format: 'uuid' },
        source_type: { type: 'string', enum: ['permit_portal', 'minutes', 'agendas', 'plat_records'] },
        url: { type: ['string', 'null'], description: 'The source URL. Omit/null only for status none_exists.' },
        status: { type: 'string', enum: ['works', 'blocked', 'none_exists'] },
        notes: { type: ['string', 'null'], description: 'How to use it / why it failed (e.g. "403 to plain fetch, firecrawl works", "archive stops Apr 2023").' },
        research_run_id: { type: ['string', 'null'], format: 'uuid', description: 'The run that verified this (your current research_run_id).' },
      },
      required: ['boundary_municipality_id', 'source_type', 'status'],
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
  const {
    research_run_id, candidate_records, needs_review, alt_avenues,
    estimated_cost_cents, input_tokens, output_tokens, final, cost_usd,
    signal_strength, signal_rationale, density_estimate, permit_volume, leads_not_pursued,
  } = args ?? {};
  if (typeof research_run_id !== 'string') throw new ToolError('research_run_id is required');
  if (!Array.isArray(candidate_records)) throw new ToolError('candidate_records must be an array');
  // Strictly true closes the run. Anything else (omitted, false, "true", 1) is a
  // checkpoint: a malformed flag must leave the run open, never close it early.
  const isFinal = final === true;

  // Usage figures are optional and advisory. Coerce to a non-negative integer or
  // null — a malformed value must never cost us the whole staged batch, which is
  // the one write of the run.
  const usageInt = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  // Quick-mode recommendation. Validated here so the agent gets a specific
  // message; research_run's CHECKs are the backstop. Unlike usage figures these
  // are rejected, not coerced — "Moderate-to-Strong" must not quietly become
  // something. The rejection fails the whole call; the previous checkpoint stands.
  const signal = validateSignal({ signal_strength, signal_rationale, density_estimate, permit_volume, leads_not_pursued });

  // cost_usd (dollars) wins over estimated_cost_cents when both are sent.
  // Malformed values are dropped, never fatal (same rule as the token counts).
  const usd = cost_usd === null || cost_usd === undefined || cost_usd === '' ? NaN : Number(cost_usd);
  const costCents = Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 100) : usageInt(estimated_cost_cents);

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('submit_research_report', {
    p_run_id: research_run_id,
    p_candidates: candidate_records,
    p_needs_review: needs_review ?? null,
    p_alt_avenues: alt_avenues ?? null,
    p_estimated_cost_cents: costCents,
    p_input_tokens: usageInt(input_tokens),
    p_output_tokens: usageInt(output_tokens),
    p_final: isFinal,
    p_signal_strength: signal.signal_strength,
    p_signal_rationale: signal.signal_rationale,
    p_density_estimate: signal.density_estimate,
    p_permit_volume: signal.permit_volume,
    p_leads_not_pursued: signal.leads_not_pursued,
  });
  if (error) throw new ToolError(`submit_research_report failed: ${error.message}`);

  // Final submit closed the run for review: backfill missing unit counts in
  // the background (Gemini grounded search, then acreage × zoning density).
  // Checkpoints REPLACE the staged set, so estimating before final would be
  // thrown away. Never blocks or fails the agent's submit.
  if (isFinal) {
    // Telegram: "Chunk i/N finished — N records staged" (sweep chunks only).
    try {
      const { data: rr } = await supabase.from('research_run')
        .select('sweep_id, sweep_chunk_index').eq('id', research_run_id).maybeSingle();
      if (rr?.sweep_id != null && rr.sweep_chunk_index != null) {
        const info = await getSweepInfo(supabase, rr.sweep_id);
        const staged = (data as { staged_count?: number } | null)?.staged_count ?? candidate_records.length;
        await notifyResearchTelegram(`${chunkLabel(rr.sweep_chunk_index, info.total)} finished — ${staged} records staged`);
      }
    } catch (e) { console.warn('chunk-finished telegram failed', e); }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (geminiKey) {
      // Name dedupe FIRST, so Gemini isn't paid to estimate a duplicate; then
      // again after, since estimates can make two copies' counts comparable.
      const dedupe = async (label: string) => {
        const { data: d, error: dErr } = await supabase.rpc('research_auto_dedupe_by_name', {
          p_run_ids: [research_run_id], p_dry_run: false,
        });
        if (dErr) console.error(`[name-dedupe ${label}] failed`, research_run_id, dErr.message);
        else console.log(`[name-dedupe ${label}]`, JSON.stringify({
          rejected_no_count: (d as any)?.rejected_no_count?.length ?? 0,
          rejected_equal_count: (d as any)?.rejected_equal_count?.length ?? 0,
          count_conflicts: (d as any)?.count_conflicts?.length ?? 0,
          rejected_same_address: (d as any)?.rejected_same_address?.length ?? 0,
        }));
      };
      const job = (async () => {
        try {
          await dedupe('pre');
          const s = await estimateMissingUnits(supabase, research_run_id, geminiKey);
          console.log('[unit-estimate]', JSON.stringify(s));
          // Locate: pins / pin hints / parcel IDs for records with no precise pin.
          const geocodeKey = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
          if (geocodeKey) {
            try {
              const l = await locateRun(supabase, research_run_id, { gemini: geminiKey, geocode: geocodeKey });
              const { details: _d, ...rest } = l;
              console.log('[locate]', JSON.stringify(rest));
            } catch (e) {
              console.error('[locate] failed', research_run_id, e);
            }
          } else console.error('[locate] GOOGLE_GEOCODING_API_KEY not set; skipped', research_run_id);
          await dedupe('post');
        } catch (e) {
          console.error('[unit-estimate] failed', research_run_id, e);
        }
        // Last post-run step: parcel boundaries for the surviving records.
        try {
          const pf = await fetchBoundariesForRuns(supabase, [research_run_id]);
          console.log('[parcel-fetch]', JSON.stringify(pf));
        } catch (e) {
          console.error('[parcel-fetch] failed', research_run_id, e);
        }
        // Distance check: boundary / located pin / precise address outside the radius → lead.
        try {
          const { data: dc, error: dcErr } = await supabase.rpc('research_distance_check', { p_run_ids: [research_run_id] });
          if (dcErr) throw new Error(dcErr.message);
          console.log('[distance-check]', JSON.stringify({ moved_to_leads: (dc as unknown[] | null)?.length ?? 0 }));
        } catch (e) {
          console.error('[distance-check] failed', research_run_id, e);
        }
        // Last: reject leads that every count step tried and that can't be
        // records anyway (out of radius, recently built, listing-only sources).
        try {
          const t = await triageLeads(supabase, [research_run_id]);
          console.log('[lead-triage]', JSON.stringify({ rejected: t.rejected.length }));
        } catch (e) {
          console.error('[lead-triage] failed', research_run_id, e);
        }
        // Post-run steps done (or failed): mark it, then send "Sweep ready" if
        // this was the last piece of a finished sweep.
        await supabase.from('research_run').update({ post_run_done_at: new Date().toISOString() }).eq('id', research_run_id);
        const { data: rr } = await supabase.from('research_run').select('sweep_id').eq('id', research_run_id).maybeSingle();
        if (rr?.sweep_id) await sendSweepReadyIfDone(supabase, rr.sweep_id);
      })().catch((e) => console.error('[post-run] failed', research_run_id, e));
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job);
    } else {
      console.error('[unit-estimate] GEMINI_API_KEY not set; skipped', research_run_id);
      await supabase.from('research_run').update({ post_run_done_at: new Date().toISOString() }).eq('id', research_run_id);
    }
  }

  // data = { staged_count, final, state } — echo it so the agent can confirm
  // whether the run is still open (state 'running') or closed for review.
  return { ...(data as Record<string, unknown>), research_run_id };
}

async function toolGetSweepKnownProjects(args: any) {
  const runId = args?.research_run_id;
  if (typeof runId !== 'string') throw new ToolError('research_run_id is required');
  const { data, error } = await getSupabase().rpc('get_sweep_known_projects', { p_research_run_id: runId });
  if (error) throw new ToolError(`get_sweep_known_projects failed: ${error.message}`);
  return data ?? { sweep_id: null, projects: [] };
}

// ---- Municipality source memory (table municipality_source) ----

const SOURCE_TYPES = ['permit_portal', 'minutes', 'agendas', 'plat_records'];
const SOURCE_STATUSES = ['works', 'blocked', 'none_exists'];
const DEAD_END_TTL_DAYS = 90;

async function toolGetMunicipalitySources(args: any) {
  const ids = args?.municipality_ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x: unknown) => typeof x === 'string')) {
    throw new ToolError('municipality_ids must be a non-empty array of uuids');
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('municipality_source')
    .select('boundary_municipality_id, source_type, url, status, notes, last_verified, verified_by_run_id, boundary_municipality(name)')
    .in('boundary_municipality_id', ids)
    .order('source_type');
  if (error) throw new ToolError(`get_municipality_sources failed: ${error.message}`);
  const cutoff = Date.now() - DEAD_END_TTL_DAYS * 86_400_000;
  const sources = (data ?? []).map((r: any) => {
    const stale = r.status !== 'works' && new Date(r.last_verified).getTime() < cutoff;
    return {
      municipality: r.boundary_municipality?.name ?? null,
      boundary_municipality_id: r.boundary_municipality_id,
      source_type: r.source_type,
      url: r.url,
      status: r.status,
      effective_status: stale ? 'unverified' : r.status,
      recheck_before_skipping: stale,
      notes: r.notes,
      last_verified: r.last_verified,
      verified_by_run_id: r.verified_by_run_id,
    };
  });
  const known = new Set(sources.map((s: any) => s.boundary_municipality_id));
  return {
    sources,
    municipalities_with_no_entries: ids.filter((id: string) => !known.has(id)),
    rule: `blocked / none_exists older than ${DEAD_END_TTL_DAYS} days = unverified: check once more before skipping, then call set_municipality_source.`,
  };
}

async function toolSetMunicipalitySource(args: any) {
  const { boundary_municipality_id, source_type, url, status, notes, research_run_id } = args ?? {};
  if (typeof boundary_municipality_id !== 'string') throw new ToolError('boundary_municipality_id is required');
  if (!SOURCE_TYPES.includes(source_type)) throw new ToolError(`source_type must be one of ${SOURCE_TYPES.join(', ')}`);
  if (!SOURCE_STATUSES.includes(status)) throw new ToolError(`status must be one of ${SOURCE_STATUSES.join(', ')}`);
  const cleanUrl = typeof url === 'string' && url.trim() ? url.trim() : null;
  if (!cleanUrl && status !== 'none_exists') throw new ToolError('url is required unless status is none_exists');

  const supabase = getSupabase();
  const row = {
    boundary_municipality_id, source_type, url: cleanUrl, status,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    last_verified: new Date().toISOString(),
    verified_by_run_id: typeof research_run_id === 'string' ? research_run_id : null,
  };
  // The unique key is (municipality, source_type, coalesce(url,'')) — an
  // expression index, which PostgREST upsert can't target. Find, then write.
  let q = supabase.from('municipality_source').select('id')
    .eq('boundary_municipality_id', boundary_municipality_id).eq('source_type', source_type);
  q = cleanUrl ? q.eq('url', cleanUrl) : q.is('url', null);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) throw new ToolError(`set_municipality_source lookup failed: ${findErr.message}`);
  const { data, error } = existing
    ? await supabase.from('municipality_source').update(row).eq('id', existing.id).select().single()
    : await supabase.from('municipality_source').insert(row).select().single();
  if (error) throw new ToolError(`set_municipality_source failed: ${error.message}`);
  return { ok: true, source: data, action: existing ? 'updated' : 'inserted' };
}

const SIGNAL_STRENGTHS = ['strong', 'moderate', 'weak'];

function validateSignal(a: Record<string, unknown>) {
  const nil = (v: unknown) => v === null || v === undefined;
  const reject = (msg: string): never => {
    throw new ToolError(`${msg} — nothing from this call was staged; fix it and resend the whole call.`);
  };

  if (!nil(a.signal_strength) && !SIGNAL_STRENGTHS.includes(a.signal_strength as string)) {
    reject(`signal_strength must be exactly one of "strong", "moderate", "weak" (got ${JSON.stringify(a.signal_strength)})`);
  }
  if (!nil(a.signal_rationale) && typeof a.signal_rationale !== 'string') {
    reject('signal_rationale must be a string');
  }

  const isInt = (v: unknown) => nil(v) || (Number.isInteger(v) && (v as number) >= 0);
  const isStr = (v: unknown) => nil(v) || typeof v === 'string';
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim() !== '';

  const checkArray = (
    field: string, v: unknown, required: string[], ints: string[], strs: string[],
  ) => {
    if (nil(v)) return null;
    if (!Array.isArray(v)) reject(`${field} must be an array of objects`);
    (v as unknown[]).forEach((e, i) => {
      if (typeof e !== 'object' || e === null || Array.isArray(e)) reject(`${field}[${i}] must be an object`);
      const o = e as Record<string, unknown>;
      for (const k of required) if (!nonEmpty(o[k])) reject(`${field}[${i}].${k} is required (non-empty string)`);
      for (const k of ints) if (!isInt(o[k])) reject(`${field}[${i}].${k} must be a non-negative integer or null`);
      for (const k of strs) if (!isStr(o[k])) reject(`${field}[${i}].${k} must be a string or null`);
    });
    return v;
  };

  return {
    signal_strength: (a.signal_strength ?? null) as string | null,
    signal_rationale: (a.signal_rationale ?? null) as string | null,
    density_estimate: checkArray('density_estimate', a.density_estimate, ['municipality'],
      ['meetings_in_window', 'meetings_sampled', 'meetings_with_residential', 'extrapolated_count'],
      ['not_sampled_reason']),
    permit_volume: checkArray('permit_volume', a.permit_volume, ['municipality'],
      ['result_count'], ['no_count_reason']),
    leads_not_pursued: checkArray('leads_not_pursued', a.leads_not_pursued, ['name', 'seen_in'],
      [], ['municipality', 'note']),
  };
}

class ToolError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ToolError'; }
}

const TOOL_IMPLS: Record<string, (args: unknown) => Promise<unknown>> = {
  get_municipalities_in_radius: toolGetMunicipalitiesInRadius,
  create_research_checklist:    toolCreateResearchChecklist,
  update_checklist_status:      toolUpdateChecklistStatus,
  submit_research_report:       toolSubmitResearchReport,
  get_municipality_sources:     toolGetMunicipalitySources,
  get_sweep_known_projects:     toolGetSweepKnownProjects,
  set_municipality_source:      toolSetMunicipalitySource,
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
