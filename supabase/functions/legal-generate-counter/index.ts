/**
 * Legal: Generate Counter-Redline Edge Function
 *
 * Given an inbound legal_loi_round whose decisions have been resolved by the
 * reasoning layer (legal-decide-positions), produces an outbound .docx with
 * Mike's counter as native Word tracked changes.
 *
 * V1 strategy: APPEND-ONLY tracked insertions (see _shared/docx-writer.ts).
 * For each decision with status='auto_applied' and final_text, we splice
 * a new tracked-insertion paragraph after the affected clause's body and
 * add a Word comment on the heading carrying the rationale. We do NOT yet
 * delete the landlord's existing text; Mike finalizes that manually in
 * Word, or V2 adds full counter-redline semantics.
 *
 * Required Supabase Secrets:
 * - ANTHROPIC_API_KEY (not used here, but the shared modules import it)
 *
 * POST body:
 *   {
 *     round_id: uuid,         // an inbound legal_loi_round whose decisions are resolved
 *     dry_run?: boolean,      // if true, skip storage write + DB insert
 *     author_name?: string    // override the tracked-change author shown in Word
 *   }
 *
 * Response:
 *   {
 *     outbound_round_id: uuid,
 *     attachment_id: uuid,
 *     storage_path: string,
 *     download_url: string,
 *     insertions_applied: number,
 *     comments_added: number,
 *     decisions_skipped: number
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { parseDocx } from '../_shared/docx-parser.ts';
import { identifyClauseBoundaries, type ClauseBoundary } from '../_shared/clause-parser.ts';
import { applyDecisionsToDocx, type DocxDecision } from '../_shared/docx-writer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  round_id: string;
  dry_run?: boolean;
  author_name?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ------------------------------------------------------------------
    // Auth
    // ------------------------------------------------------------------
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

    // ------------------------------------------------------------------
    // Parse + validate
    // ------------------------------------------------------------------
    const body = (await req.json()) as GenerateRequest;
    if (!body.round_id) return jsonResponse(400, { error: 'Missing round_id' });

    // Load the inbound round + its session/attachment
    const { data: inboundRound, error: roundErr } = await supabase
      .from('legal_loi_round')
      .select(`
        id, session_id, round_num, direction, attachment_id,
        legal_loi_session:session_id(id, client_id, deal_id, title)
      `)
      .eq('id', body.round_id)
      .single();
    if (roundErr || !inboundRound) return jsonResponse(404, { error: 'Round not found' });
    if (inboundRound.direction !== 'inbound') {
      return jsonResponse(400, { error: 'round_id must reference an inbound round' });
    }

    // deno-lint-ignore no-explicit-any
    const session = (inboundRound as any).legal_loi_session;
    const sessionId = session?.id as string | undefined;
    const dealId = session?.deal_id as string | null | undefined;
    if (!sessionId) return jsonResponse(500, { error: 'Round has no session' });

    if (!inboundRound.attachment_id) {
      return jsonResponse(400, { error: 'Inbound round has no attachment' });
    }

    // Download inbound .docx
    const { data: inboundAttachment, error: attErr } = await supabase
      .from('attachment')
      .select('id, file_url, file_name')
      .eq('id', inboundRound.attachment_id)
      .single();
    if (attErr || !inboundAttachment) return jsonResponse(404, { error: 'Inbound attachment not found' });

    const inboundBytes = await downloadAttachment(supabase, inboundAttachment.file_url);
    if (!inboundBytes) return jsonResponse(500, { error: 'Failed to download inbound .docx' });

    // ------------------------------------------------------------------
    // Re-parse + re-identify clauses (we need body_paragraph_indices per
    // clause; only heading paragraph index is stored on legal_loi_decision).
    // ------------------------------------------------------------------
    const inboundDoc = await parseDocx(inboundBytes);
    const { clauses } = identifyClauseBoundaries(inboundDoc);
    const clauseByHeadingParagraphIdx = new Map<number, ClauseBoundary>();
    for (const c of clauses) clauseByHeadingParagraphIdx.set(c.heading_paragraph.index, c);

    // ------------------------------------------------------------------
    // Load decisions for this round and build DocxDecisions
    // ------------------------------------------------------------------
    const { data: decisions, error: decErr } = await supabase
      .from('legal_loi_decision')
      .select(`
        id, doc_anchor, final_position_rank, final_text, final_comment_text, status, severity,
        clause_type:clause_type_id(name, display_name)
      `)
      .eq('round_id', body.round_id)
      .order('doc_anchor');
    if (decErr) throw decErr;

    let skipped = 0;
    const docxDecisions: DocxDecision[] = [];
    for (const d of decisions ?? []) {
      // Only auto_applied/pending/reviewed with final_text are applied.
      if (!d.final_text || !['auto_applied', 'pending', 'reviewed'].includes(d.status)) {
        skipped++;
        continue;
      }
      const headingIdx = parseHeadingIndex(d.doc_anchor);
      if (headingIdx === null) {
        skipped++;
        continue;
      }
      const clause = clauseByHeadingParagraphIdx.get(headingIdx);
      if (!clause) {
        skipped++;
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const ct = (d as any).clause_type;
      docxDecisions.push({
        heading_paragraph_index: clause.heading_paragraph.index,
        body_paragraph_indices: clause.body_paragraphs.map((p) => p.index),
        final_text: d.final_text,
        final_comment_text: d.final_comment_text ?? null,
        heading: clause.heading,
        position_label:
          d.final_position_rank !== null
            ? `Position ${d.final_position_rank}${ct?.display_name ? ` — ${ct.display_name}` : ''}`
            : ct?.display_name ?? clause.heading,
      });
    }

    if (docxDecisions.length === 0) {
      return jsonResponse(200, {
        message: 'No applicable decisions to apply (need status in [auto_applied, pending, reviewed] with final_text).',
        decisions_skipped: skipped,
      });
    }

    // ------------------------------------------------------------------
    // Apply mutations
    // ------------------------------------------------------------------
    const writeResult = await applyDecisionsToDocx(inboundBytes, docxDecisions, {
      author: body.author_name ?? 'OVIS Tenant Counter',
      date: new Date().toISOString(),
    });

    if (body.dry_run) {
      return jsonResponse(200, {
        dry_run: true,
        round_id: body.round_id,
        decisions_applied: docxDecisions.length,
        decisions_skipped: skipped,
        insertions_applied: writeResult.insertions_applied,
        comments_added: writeResult.comments_added,
        output_bytes: writeResult.bytes.byteLength,
      });
    }

    // ------------------------------------------------------------------
    // Upload outbound .docx to Storage
    // ------------------------------------------------------------------
    const nextRoundNum = inboundRound.round_num + 1;
    const ts = Date.now();
    const baseName = (inboundAttachment.file_name || 'loi.docx').replace(/\.docx$/i, '');
    const safeBase = baseName.replace(/[^A-Za-z0-9._-]/g, '_');
    const storagePath = `legal/${dealId ?? 'no-deal'}/${sessionId}/round-${nextRoundNum}-${ts}-${safeBase}-counter.docx`;

    const { error: uploadErr } = await supabase.storage.from('assets').upload(storagePath, writeResult.bytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(storagePath);
    const downloadUrl = urlData.publicUrl;

    // Create attachment row
    const { data: newAttachment, error: newAttErr } = await supabase
      .from('attachment')
      .insert({
        deal_id: dealId,
        file_url: downloadUrl,
        file_name: `Round ${nextRoundNum} — ${baseName} counter.docx`,
        uploaded_by: user.id,
      })
      .select('id')
      .single();
    if (newAttErr) throw newAttErr;

    // Create outbound legal_loi_round
    const { data: newRound, error: newRoundErr } = await supabase
      .from('legal_loi_round')
      .insert({
        session_id: sessionId,
        round_num: nextRoundNum,
        direction: 'outbound',
        attachment_id: newAttachment.id,
        source_round_id: inboundRound.id,
        notes: `Counter-redline. Insertions: ${writeResult.insertions_applied}, comments: ${writeResult.comments_added}, decisions skipped: ${skipped}.`,
        created_by: user.id,
        generated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (newRoundErr) throw newRoundErr;

    return jsonResponse(200, {
      outbound_round_id: newRound.id,
      attachment_id: newAttachment.id,
      storage_path: storagePath,
      download_url: downloadUrl,
      decisions_applied: docxDecisions.length,
      decisions_skipped: skipped,
      insertions_applied: writeResult.insertions_applied,
      comments_added: writeResult.comments_added,
    });
  } catch (err) {
    console.error('[legal-generate-counter] Error:', err);
    return jsonResponse(500, {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
  }
});

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function parseHeadingIndex(docAnchor: string | null): number | null {
  if (!docAnchor) return null;
  const m = docAnchor.match(/^paragraph:(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function downloadAttachment(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  fileUrl: string,
): Promise<Uint8Array | null> {
  try {
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
    const resp = await fetch(fileUrl);
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    return new Uint8Array(ab);
  } catch (err) {
    console.error('[legal-generate-counter] downloadAttachment error:', err);
    return null;
  }
}

function extractStoragePath(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (match) return { bucket: match[1], path: decodeURIComponent(match[2]) };
  return null;
}
