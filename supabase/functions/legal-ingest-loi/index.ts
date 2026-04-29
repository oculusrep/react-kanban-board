/**
 * Legal: Ingest LOI Edge Function
 *
 * Processes an inbound landlord-redlined LOI: parses the .docx, identifies
 * clause boundaries, matches each clause to a canonical clause_type via the
 * playbook, optionally compares against the prior outbound to flag silent
 * acceptances, and persists results as legal_loi_round + legal_loi_decision
 * rows.
 *
 * This is the heart of the Week 2 inbound pipeline. The Week 3 redline
 * generator will read these decision rows and emit the counter-redline .docx.
 *
 * Required Supabase Secrets:
 * - ANTHROPIC_API_KEY
 *
 * POST body:
 *   {
 *     session_id: uuid,            // existing legal_loi_session
 *     attachment_id: uuid,         // attachment row pointing to inbound .docx in Storage
 *     prior_round_id?: uuid,       // optional — if set, run silent-acceptance check
 *     dry_run?: boolean            // if true, return the parsed/matched output without writing decision rows
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { parseDocx, type ParsedDocx } from '../_shared/docx-parser.ts';
import { identifyClauseBoundaries } from '../_shared/clause-parser.ts';
import { matchClausesToPlaybook, type ClauseMatch } from '../_shared/clause-matcher.ts';
import { detectSilentAcceptances } from '../_shared/silent-acceptance.ts';
import { createClaudeClient, SONNET_MODEL } from '../_shared/claude.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngestRequest {
  session_id: string;
  attachment_id: string;
  prior_round_id?: string;
  dry_run?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse(401, { error: 'Missing authorization header' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonResponse(401, { error: 'Unauthorized' });

    // ------------------------------------------------------------------
    // Parse + validate request
    // ------------------------------------------------------------------
    const body = (await req.json()) as IngestRequest;
    if (!body.session_id || !body.attachment_id) {
      return jsonResponse(400, {
        error: 'Missing required fields: session_id, attachment_id',
      });
    }

    // Look up the session to get client_id (for the playbook scope)
    const { data: session, error: sessionError } = await supabase
      .from('legal_loi_session')
      .select('id, client_id, deal_id, status')
      .eq('id', body.session_id)
      .single();
    if (sessionError || !session) {
      return jsonResponse(404, { error: `Session not found: ${body.session_id}` });
    }

    // Look up the inbound attachment + download bytes from Storage
    const { data: attachment, error: attachError } = await supabase
      .from('attachment')
      .select('id, file_url, file_name')
      .eq('id', body.attachment_id)
      .single();
    if (attachError || !attachment) {
      return jsonResponse(404, { error: `Attachment not found: ${body.attachment_id}` });
    }

    const inboundBytes = await downloadAttachment(supabase, attachment.file_url);
    if (!inboundBytes) {
      return jsonResponse(500, { error: 'Failed to download inbound attachment from Storage' });
    }

    // ------------------------------------------------------------------
    // Parse + identify + match
    // ------------------------------------------------------------------
    console.log(`[legal-ingest-loi] Parsing inbound .docx (${inboundBytes.byteLength} bytes)`);
    const inboundDoc = await parseDocx(inboundBytes);
    const { clauses, orphans } = identifyClauseBoundaries(inboundDoc);
    console.log(`[legal-ingest-loi] Identified ${clauses.length} clauses + ${orphans.length} orphans`);

    const claude = createClaudeClient();
    const matches = await matchClausesToPlaybook(clauses, session.client_id, supabase, claude, {
      semanticModel: SONNET_MODEL,
    });
    console.log(`[legal-ingest-loi] Matched: ${matches.filter((m) => m.clause_type_name).length}/${matches.length}`);

    // ------------------------------------------------------------------
    // Optional silent-acceptance detection against the prior outbound
    // ------------------------------------------------------------------
    let silentReport: ReturnType<typeof detectSilentAcceptances> | null = null;
    let priorRoundInfo: { id: string; round_num: number; attachment_id: string | null } | null = null;
    if (body.prior_round_id) {
      const { data: priorRound } = await supabase
        .from('legal_loi_round')
        .select('id, round_num, attachment_id')
        .eq('id', body.prior_round_id)
        .single();

      if (priorRound?.attachment_id) {
        priorRoundInfo = priorRound;
        const { data: priorAttach } = await supabase
          .from('attachment')
          .select('file_url')
          .eq('id', priorRound.attachment_id)
          .single();
        if (priorAttach?.file_url) {
          const priorBytes = await downloadAttachment(supabase, priorAttach.file_url);
          if (priorBytes) {
            const priorDoc = await parseDocx(priorBytes);
            silentReport = detectSilentAcceptances(priorDoc, inboundDoc);
            console.log(
              `[legal-ingest-loi] Silent-acceptance check: ${silentReport.total_silent} flagged of ${silentReport.total_paragraphs_compared}`,
            );
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // dry_run — return analysis without writing
    // ------------------------------------------------------------------
    if (body.dry_run) {
      return jsonResponse(200, {
        dry_run: true,
        session_id: session.id,
        client_id: session.client_id,
        inbound_doc: {
          paragraphs: inboundDoc.paragraphs.length,
          authors: inboundDoc.authors,
          comments: Object.keys(inboundDoc.comments).length,
        },
        clauses_identified: clauses.length,
        orphans: orphans.length,
        matches: matches.map((m) => ({
          heading: m.boundary.heading,
          clause_type_name: m.clause_type_name,
          matcher_used: m.matcher_used,
          confidence: m.confidence,
          rationale: m.rationale,
          has_tracked_changes: m.boundary.has_tracked_changes,
          insertion_count: m.boundary.insertions.length,
          deletion_count: m.boundary.deletions.length,
        })),
        silent_acceptance: silentReport,
      });
    }

    // ------------------------------------------------------------------
    // Persist: legal_loi_round (inbound) + legal_loi_decision rows
    // ------------------------------------------------------------------
    const { data: nextRoundData, error: nextRoundError } = await supabase
      .from('legal_loi_round')
      .select('round_num')
      .eq('session_id', session.id)
      .order('round_num', { ascending: false })
      .limit(1);
    if (nextRoundError) throw nextRoundError;
    const nextRoundNum = (nextRoundData?.[0]?.round_num ?? -1) + 1;

    const { data: round, error: roundError } = await supabase
      .from('legal_loi_round')
      .insert({
        session_id: session.id,
        round_num: nextRoundNum,
        direction: 'inbound',
        attachment_id: body.attachment_id,
        source_round_id: priorRoundInfo?.id ?? null,
        notes: `Ingested ${clauses.length} clauses, ${matches.filter((m) => m.clause_type_name).length} matched.`,
        created_by: user.id,
      })
      .select('id')
      .single();
    if (roundError) throw roundError;

    // Resolve clause_type_name -> clause_type_id for the matched clauses, so
    // the decision rows can FK directly into the canonical taxonomy.
    const matchedNames = [
      ...new Set(matches.map((m) => m.clause_type_name).filter((n): n is string => !!n)),
    ];
    const clauseTypeIdByName: Record<string, string> = {};
    if (matchedNames.length > 0) {
      const { data: ctRows } = await supabase
        .from('clause_type')
        .select('id, name')
        .in('name', matchedNames);
      for (const r of ctRows ?? []) clauseTypeIdByName[r.name as string] = r.id as string;
    }

    // Build legal_loi_decision rows from each match.
    const decisionRows = buildDecisionRows(round.id, matches, silentReport, inboundDoc, clauseTypeIdByName);
    if (decisionRows.length > 0) {
      const { error: decErr } = await supabase.from('legal_loi_decision').insert(decisionRows);
      if (decErr) throw decErr;
    }

    return jsonResponse(200, {
      session_id: session.id,
      round_id: round.id,
      round_num: nextRoundNum,
      direction: 'inbound',
      clauses_identified: clauses.length,
      matched_count: matches.filter((m) => m.clause_type_name).length,
      decisions_created: decisionRows.length,
      silent_acceptance: silentReport
        ? {
            total_silent: silentReport.total_silent,
            paragraph_count_mismatch: silentReport.paragraph_count_mismatch,
          }
        : null,
    });
  } catch (err) {
    console.error('[legal-ingest-loi] Error:', err);
    return jsonResponse(500, {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

interface DecisionRow {
  round_id: string;
  clause_type_id: string | null;
  doc_anchor: string;
  landlord_text_excerpt: string;
  ai_position_rank: number | null;
  ai_rationale: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  status: string;
  severity: string | null;
}

function buildDecisionRows(
  roundId: string,
  matches: ClauseMatch[],
  silentReport: ReturnType<typeof detectSilentAcceptances> | null,
  inboundDoc: ParsedDocx,
  clauseTypeIdByName: Record<string, string>,
): DecisionRow[] {
  const rows: DecisionRow[] = [];

  // One decision row per matched clause boundary. Status starts as 'pending';
  // the Week 4 reasoning layer will populate ai_position_rank + ai_rationale
  // when it makes the position pick.
  for (const m of matches) {
    const clauseTypeId = m.clause_type_name ? clauseTypeIdByName[m.clause_type_name] ?? null : null;
    rows.push({
      round_id: roundId,
      clause_type_id: clauseTypeId,
      doc_anchor: `paragraph:${m.boundary.heading_paragraph.index}`,
      landlord_text_excerpt: m.boundary.body_text.slice(0, 4000),
      ai_position_rank: null,
      ai_rationale: m.rationale ?? null,
      ai_confidence: m.confidence,
      ai_model: m.matcher_used === 'semantic' ? SONNET_MODEL : null,
      status: m.clause_type_name ? 'pending' : 'escalated',
      severity: m.clause_type_name ? null : 'medium',
    });
  }

  // One decision row per silent acceptance (status = 'silent_acceptance').
  if (silentReport) {
    for (const sa of silentReport.silent_acceptances) {
      const para = inboundDoc.paragraphs[sa.paragraph_index];
      rows.push({
        round_id: roundId,
        clause_type_id: null,
        doc_anchor: `paragraph:${sa.paragraph_index}`,
        landlord_text_excerpt: (para?.visible_text ?? '').slice(0, 4000),
        ai_position_rank: null,
        ai_rationale: sa.summary,
        ai_confidence: sa.kind === 'fully_accepted' ? 0.95 : 0.5,
        ai_model: null,
        status: 'silent_acceptance',
        severity: sa.kind === 'partial_or_edited' ? 'high' : 'medium',
      });
    }
  }

  return rows;
}

async function downloadAttachment(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  fileUrl: string,
): Promise<Uint8Array | null> {
  try {
    // file_url may be a full https://… URL or a relative storage path. Try
    // both: first as a Storage path, falling back to fetch().
    const storagePath = extractStoragePath(fileUrl);
    if (storagePath) {
      const { data, error } = await supabase.storage
        .from(storagePath.bucket)
        .download(storagePath.path);
      if (!error && data) {
        const ab = await data.arrayBuffer();
        return new Uint8Array(ab);
      }
    }

    // Fallback: direct fetch (works for signed URLs / public URLs).
    const resp = await fetch(fileUrl);
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    return new Uint8Array(ab);
  } catch (err) {
    console.error('[legal-ingest-loi] downloadAttachment error:', err);
    return null;
  }
}

function extractStoragePath(url: string): { bucket: string; path: string } | null {
  // Match Supabase Storage URL shapes like:
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  //   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=…
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
  return null;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
