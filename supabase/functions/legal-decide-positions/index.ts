/**
 * Legal: Decide Positions Edge Function (reasoning layer)
 *
 * For a given legal_loi_round (typically inbound), walks each pending
 * legal_loi_decision row, queries the playbook for that clause type, and
 * asks Claude to pick which position rank (P1, P2, P3, ...) to apply for
 * Mike's counter-redline.
 *
 * This is the AI brain of the redliner — Sonnet 4.6 by default with Opus 4.7
 * escalation when:
 *   - The clause's confidence_tier is HIGH (high stakes), OR
 *   - Sonnet's confidence on this decision is below threshold
 *
 * Per Q8, recent override history for this client+clause is included as
 * context so the AI is aware of prior judgment calls without changing the
 * playbook directly.
 *
 * The function does not modify the .docx — it only writes back to the
 * legal_loi_decision row so the Week 3 tracked-changes generator can
 * consume the decisions to produce the counter-redline.
 *
 * Required Supabase Secrets:
 * - ANTHROPIC_API_KEY
 *
 * POST body:
 *   {
 *     round_id: uuid,         // legal_loi_round to process
 *     dry_run?: boolean,      // if true, return decisions without writing back
 *     opus_for_all?: boolean, // force Opus for every decision (more expensive, debug only)
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createClaudeClient,
  sendStructured,
  buildSystem,
  pickModel,
  SONNET_MODEL,
  OPUS_MODEL,
  type ClaudeModel,
} from '../_shared/claude.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DecideRequest {
  round_id: string;
  dry_run?: boolean;
  opus_for_all?: boolean;
}

interface PlaybookPosition {
  id: string;
  position_rank: number;
  position_label: string | null;
  clause_text: string;
  default_comment_text: string | null;
  requires_approval: string | null;
  is_floor: boolean;
}

interface PlaybookEntry {
  id: string;
  display_heading: string;
  rationale: string | null;
  guidelines: string | null;
  confidence_tier: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  positions: PlaybookPosition[];
}

interface AIDecision {
  position_rank: number | null;
  confidence: number;
  rationale: string;
  proposed_comment_text: string;
  is_custom: boolean;
  custom_text: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Auth ----------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Missing authorization header' });

    const supabase: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse(401, { error: 'Unauthorized' });

    // Parse + validate ----------------------------------------------------
    const body = (await req.json()) as DecideRequest;
    if (!body.round_id) return jsonResponse(400, { error: 'Missing round_id' });

    // Resolve session + client (needed to scope playbook + override history)
    const { data: round, error: roundError } = await supabase
      .from('legal_loi_round')
      .select('id, session_id, round_num, direction, legal_loi_session:session_id(client_id, deal_id)')
      .eq('id', body.round_id)
      .single();
    if (roundError || !round) return jsonResponse(404, { error: 'Round not found' });

    // deno-lint-ignore no-explicit-any
    const session = (round as any).legal_loi_session;
    const clientId = session?.client_id as string | undefined;
    if (!clientId) return jsonResponse(500, { error: 'Round has no client_id via session' });

    // Pull pending decisions for this round
    const { data: pending, error: pendingError } = await supabase
      .from('legal_loi_decision')
      .select('id, clause_type_id, doc_anchor, landlord_text_excerpt, status, ai_confidence')
      .eq('round_id', body.round_id)
      .in('status', ['pending', 'escalated'])
      .order('created_at');
    if (pendingError) throw pendingError;

    if (!pending || pending.length === 0) {
      return jsonResponse(200, {
        round_id: body.round_id,
        message: 'No pending decisions on this round',
        decisions_processed: 0,
      });
    }

    // Pull playbook for this client (cached system context)
    const playbookByClauseTypeId = await loadPlaybook(supabase, clientId);

    // Process each decision -----------------------------------------------
    const claude = createClaudeClient();
    const summary = {
      total: pending.length,
      processed: 0,
      escalated: 0,
      auto_applied: 0,
      no_playbook_entry: 0,
      sonnet_calls: 0,
      opus_calls: 0,
    };

    const out: Array<{
      decision_id: string;
      clause_type_id: string | null;
      ai_position_rank: number | null;
      ai_confidence: number;
      ai_model: ClaudeModel;
      ai_rationale: string;
      final_text: string | null;
      final_comment_text: string;
      status: string;
      severity: string | null;
      requires_approval: string | null;
    }> = [];

    for (const dec of pending) {
      if (!dec.clause_type_id) {
        summary.no_playbook_entry++;
        continue;
      }

      const playbook = playbookByClauseTypeId[dec.clause_type_id];
      if (!playbook) {
        // No playbook entry for this client + clause type — auto-escalate.
        out.push({
          decision_id: dec.id,
          clause_type_id: dec.clause_type_id,
          ai_position_rank: null,
          ai_confidence: 0,
          ai_model: SONNET_MODEL,
          ai_rationale: `No playbook entry for client ${clientId} and clause_type ${dec.clause_type_id}. Escalated for manual handling.`,
          final_text: null,
          final_comment_text: '',
          status: 'escalated',
          severity: 'medium',
          requires_approval: null,
        });
        summary.no_playbook_entry++;
        summary.escalated++;
        continue;
      }

      // Override history (Q8 context-injection)
      const overrideHistory = await loadRecentOverrideHistory(
        supabase,
        clientId,
        dec.clause_type_id,
        10,
      );

      // Pick model: Opus on HIGH stakes or low prior confidence; otherwise Sonnet.
      const tier = playbook.confidence_tier ?? 'MEDIUM';
      const model: ClaudeModel = body.opus_for_all
        ? OPUS_MODEL
        : pickModel({
            highStakes: tier === 'HIGH',
            priorConfidence: dec.ai_confidence ?? undefined,
            confidenceThreshold: 0.7,
          });

      const aiDecision = await askAI(claude, model, {
        clientId,
        clauseTypeId: dec.clause_type_id,
        playbook,
        landlordText: dec.landlord_text_excerpt ?? '',
        overrideHistory,
      });

      if (model === SONNET_MODEL) summary.sonnet_calls++;
      else summary.opus_calls++;

      // Resolve final text + comment + status from AI decision
      let finalText: string | null = null;
      let finalComment = aiDecision.proposed_comment_text;
      let status = 'auto_applied';
      let severity: string | null = null;
      let requiresApproval: string | null = null;

      if (aiDecision.is_custom && aiDecision.custom_text) {
        finalText = aiDecision.custom_text;
        status = 'pending'; // Custom edits always need user review
        severity = tier === 'HIGH' ? 'high' : 'medium';
      } else if (aiDecision.position_rank) {
        const pos = playbook.positions.find((p) => p.position_rank === aiDecision.position_rank);
        if (pos) {
          finalText = pos.clause_text;
          requiresApproval = pos.requires_approval;
          if (!finalComment) finalComment = pos.default_comment_text ?? '';
          if (pos.is_floor || pos.requires_approval) {
            status = 'escalated';
            severity = 'critical';
          } else if (aiDecision.confidence < 0.7) {
            status = 'pending';
            severity = tier === 'HIGH' ? 'high' : 'medium';
          }
        } else {
          status = 'escalated';
          severity = 'high';
          finalComment = `AI returned position_rank=${aiDecision.position_rank} but no matching playbook position exists. Escalated for manual review.`;
        }
      } else {
        status = 'escalated';
        severity = 'high';
      }

      if (status === 'escalated') summary.escalated++;
      if (status === 'auto_applied') summary.auto_applied++;
      summary.processed++;

      out.push({
        decision_id: dec.id,
        clause_type_id: dec.clause_type_id,
        ai_position_rank: aiDecision.position_rank,
        ai_confidence: aiDecision.confidence,
        ai_model: model,
        ai_rationale: aiDecision.rationale,
        final_text: finalText,
        final_comment_text: finalComment,
        status,
        severity,
        requires_approval: requiresApproval,
      });
    }

    if (body.dry_run) {
      return jsonResponse(200, {
        dry_run: true,
        round_id: body.round_id,
        summary,
        decisions: out,
      });
    }

    // Write back -----------------------------------------------------------
    for (const r of out) {
      const { error: upErr } = await supabase
        .from('legal_loi_decision')
        .update({
          ai_position_rank: r.ai_position_rank,
          ai_confidence: r.ai_confidence,
          ai_model: r.ai_model,
          ai_rationale: r.ai_rationale,
          final_position_rank: r.ai_position_rank,
          final_text: r.final_text,
          final_comment_text: r.final_comment_text,
          status: r.status,
          severity: r.severity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.decision_id);
      if (upErr) throw upErr;
    }

    return jsonResponse(200, {
      round_id: body.round_id,
      summary,
    });
  } catch (err) {
    console.error('[legal-decide-positions] Error:', err);
    return jsonResponse(500, {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
  }
});

// ============================================================================
// Playbook + history loaders
// ============================================================================

async function loadPlaybook(
  supabase: SupabaseClient,
  clientId: string,
): Promise<Record<string, PlaybookEntry>> {
  const { data, error } = await supabase
    .from('legal_playbook')
    .select(`
      id,
      clause_type_id,
      display_heading,
      rationale,
      guidelines,
      confidence_tier,
      legal_playbook_position(id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
    `)
    .eq('client_id', clientId)
    .eq('is_active', true);

  if (error) throw error;

  const out: Record<string, PlaybookEntry> = {};
  for (const row of data ?? []) {
    // deno-lint-ignore no-explicit-any
    const r = row as any;
    out[r.clause_type_id] = {
      id: r.id,
      display_heading: r.display_heading,
      rationale: r.rationale,
      guidelines: r.guidelines,
      confidence_tier: r.confidence_tier,
      positions: (r.legal_playbook_position ?? [])
        // deno-lint-ignore no-explicit-any
        .map((p: any) => ({
          id: p.id,
          position_rank: p.position_rank,
          position_label: p.position_label,
          clause_text: p.clause_text,
          default_comment_text: p.default_comment_text,
          requires_approval: p.requires_approval,
          is_floor: p.is_floor,
        }))
        .sort((a: PlaybookPosition, b: PlaybookPosition) => a.position_rank - b.position_rank),
    };
  }
  return out;
}

interface OverrideRow {
  position_used: number | null;
  was_override: boolean;
  override_source: string | null;
  notes: string | null;
  created_at: string;
}

async function loadRecentOverrideHistory(
  supabase: SupabaseClient,
  clientId: string,
  clauseTypeId: string,
  limit: number,
): Promise<OverrideRow[]> {
  const { data, error } = await supabase
    .from('negotiation_logs')
    .select('position_used, was_override, override_source, notes, created_at')
    .eq('client_id', clientId)
    .eq('clause_type_id', clauseTypeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[legal-decide-positions] override history load failed:', error.message);
    return [];
  }
  return (data ?? []) as OverrideRow[];
}

// ============================================================================
// Claude prompt
// ============================================================================

interface AskInput {
  clientId: string;
  clauseTypeId: string;
  playbook: PlaybookEntry;
  landlordText: string;
  overrideHistory: OverrideRow[];
}

async function askAI(
  // deno-lint-ignore no-explicit-any
  claude: any,
  model: ClaudeModel,
  input: AskInput,
): Promise<AIDecision> {
  const positionsText = input.playbook.positions
    .map(
      (p) =>
        `## Position ${p.position_rank}${p.position_label ? ` — ${p.position_label}` : ''}${p.is_floor ? ' (FLOOR)' : ''}${p.requires_approval ? ` (requires ${p.requires_approval} approval)` : ''}\n\nClause text:\n${p.clause_text}\n\nDefault comment text:\n${p.default_comment_text ?? '(none)'}\n`,
    )
    .join('\n\n');

  const historyText =
    input.overrideHistory.length > 0
      ? input.overrideHistory
          .map(
            (h) =>
              `  - ${new Date(h.created_at).toISOString().slice(0, 10)}: ${h.was_override ? 'OVERRIDE' : 'auto'} position ${h.position_used ?? '?'}${h.override_source ? ` (${h.override_source})` : ''}${h.notes ? ` — ${h.notes}` : ''}`,
          )
          .join('\n')
      : '  (no prior history for this clause/client)';

  const system = buildSystem([
    {
      text: `You are a commercial real estate lease negotiator. You analyze landlord redlines on a Letter of Intent (LOI) and pick which position from the client's playbook to apply for the counter-redline.

# Heading: ${input.playbook.display_heading}

# Client's rationale for this clause
${input.playbook.rationale ?? '(none)'}

# Negotiation guidelines
${input.playbook.guidelines ?? '(none)'}

# Available positions (Position 1 is the client's preferred starting position)
${positionsText}

# Recent override history for this clause + client
${historyText}

# Output schema (return JSON only — no prose, no fences)
{
  "position_rank": <integer rank from playbook above, or null if no playbook position fits>,
  "confidence": <0.0 to 1.0; how confident are you in this pick>,
  "rationale": "<2-4 sentences explaining your decision, citing landlord text, playbook guidance, and (if relevant) override history>",
  "proposed_comment_text": "<text to insert as a Word comment on the redline; defaults to the position's default_comment_text but you may tighten or customize>",
  "is_custom": <true if the right answer is custom text not in the playbook; false otherwise>,
  "custom_text": <if is_custom=true, the contract language to use; else null>
}

# Decision rules
- Hold Position 1 (highest rank) when the landlord's redline doesn't justify falling back.
- Drop to a fallback position when the landlord's edits are reasonable, the rationale is sound, or repeated overrides for this clause suggest the fallback is now standard.
- Mark is_floor=true positions as the lowest acceptable; never pick a rank below it without setting is_custom=true with custom escalation language.
- If the landlord's text is materially better than the playbook (rare), set is_custom=true and propose accepting their language.
- Confidence < 0.7 will trigger escalation to senior review; reserve high confidence for clear-cut decisions.`,
      cached: true,
    },
  ]);

  const user = `Landlord's text for this clause (current state of the redline):
---
${input.landlordText.slice(0, 6000)}
---

Pick a position. Return only the JSON object.`;

  const result = await sendStructured<AIDecision>(claude, {
    model,
    system,
    user,
    maxTokens: 2048,
  });

  // Validate basics
  const data = result.data;
  if (typeof data.confidence !== 'number') data.confidence = 0;
  if (data.confidence < 0) data.confidence = 0;
  if (data.confidence > 1) data.confidence = 1;
  if (typeof data.rationale !== 'string') data.rationale = '';
  if (typeof data.proposed_comment_text !== 'string') data.proposed_comment_text = '';
  if (typeof data.is_custom !== 'boolean') data.is_custom = false;
  if (data.is_custom && typeof data.custom_text !== 'string') data.is_custom = false;

  return data;
}

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
