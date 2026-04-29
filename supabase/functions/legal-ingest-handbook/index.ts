/**
 * Legal: Ingest Handbook Edge Function
 *
 * Reads a client's LOI handbook (as plain text) and extracts a structured
 * playbook into legal_playbook + legal_playbook_position rows.
 *
 * Used to onboard new clients (V2) and to backfill the long tail of clauses
 * for Starbucks (V1 — the 10 highest-stakes clauses are already seeded via
 * migration; this fills in the remaining ~25).
 *
 * Required Supabase Secrets:
 * - ANTHROPIC_API_KEY
 *
 * POST body:
 *   {
 *     client_id: uuid,         // OVIS client.id
 *     source_label: string,    // e.g., "LOI Handbook.pdf (Revised October 8, 2024)"
 *     handbook_text: string,   // pdftotext-extracted plain text of the handbook
 *     dry_run?: boolean,       // if true, return the extraction without writing
 *     model?: 'opus' | 'sonnet' // defaults to opus for one-time extraction
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  createClaudeClient,
  streamMessage,
  OPUS_MODEL,
  SONNET_MODEL,
  buildSystem,
  type ClaudeModel,
} from '../_shared/claude.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Shape of one clause as extracted by Claude. Mirrors the database row shape
// so a successful extraction can be upserted directly.
interface ExtractedPosition {
  position_rank: number;
  position_label: string;
  clause_text: string;
  default_comment_text: string;
  requires_approval: string | null;
  is_floor: boolean;
}

interface ExtractedClause {
  clause_type_name: string; // canonical key from clause_type.name
  display_heading: string;  // how this client labels it in their LOI
  rationale: string;
  guidelines: string;
  source_section: string;   // e.g., "pp. 22-23" or "Section 9"
  positions: ExtractedPosition[];
}

interface IngestRequest {
  client_id: string;
  source_label: string;
  handbook_text: string;
  dry_run?: boolean;
  model?: 'opus' | 'sonnet';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ------------------------------------------------------------------
    // Auth — same pattern as other OVIS Edge Functions
    // ------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse(401, { error: 'Missing authorization header' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    // ------------------------------------------------------------------
    // Parse + validate request
    // ------------------------------------------------------------------
    const body = (await req.json()) as IngestRequest;
    if (!body.client_id || !body.source_label || !body.handbook_text) {
      return jsonResponse(400, {
        error: 'Missing required fields: client_id, source_label, handbook_text',
      });
    }

    // Confirm the client exists.
    const { data: clientRow, error: clientError } = await supabase
      .from('client')
      .select('id, client_name')
      .eq('id', body.client_id)
      .single();
    if (clientError || !clientRow) {
      return jsonResponse(404, { error: `Client not found: ${body.client_id}` });
    }

    // ------------------------------------------------------------------
    // Pull the canonical clause taxonomy — Claude needs to know the
    // valid clause_type_name values to choose from.
    // ------------------------------------------------------------------
    const { data: clauseTypes, error: ctError } = await supabase
      .from('clause_type')
      .select('name, display_name, sort_order, default_confidence_tier')
      .eq('is_active', true)
      .order('sort_order');
    if (ctError) {
      return jsonResponse(500, { error: `Failed to load clause_type taxonomy: ${ctError.message}` });
    }

    const taxonomyText = (clauseTypes ?? [])
      .map((ct) => `  - ${ct.name} ("${ct.display_name}", ${ct.default_confidence_tier})`)
      .join('\n');

    // ------------------------------------------------------------------
    // Build Claude prompt and call
    // ------------------------------------------------------------------
    const model: ClaudeModel = body.model === 'sonnet' ? SONNET_MODEL : OPUS_MODEL;

    const systemPrompt = buildSystem([
      {
        text: `You extract structured playbook data from commercial real estate Letter-of-Intent (LOI) handbooks.

Your output is a JSON array of clauses. Each clause maps a section of the handbook to one canonical clause_type, captures the client's rationale and standards, and lists their ranked fallback positions.

# Canonical clause_type taxonomy (use the "name" key in your output)
${taxonomyText}

# Output schema
[
  {
    "clause_type_name": "<canonical name from list above>",
    "display_heading": "<how this client labels the section in their LOI, ALL CAPS as in the handbook>",
    "rationale": "<1-3 sentences: why the client cares about this clause>",
    "guidelines": "<1-3 sentences: client standards and negotiation tips>",
    "source_section": "<page or section reference, e.g. 'pp. 22-23'>",
    "positions": [
      {
        "position_rank": 1,
        "position_label": "<short label, e.g. 'Preferred', 'Fallback (U1)', 'Floor'>",
        "clause_text": "<the actual contract language>",
        "default_comment_text": "<1-2 sentences explaining WHY this position is being applied; from rationale>",
        "requires_approval": "<null OR named approver(s), e.g. 'Director', 'VP', 'Real Estate Committee'>",
        "is_floor": <true if this is the lowest acceptable position; AI must escalate before going lower>
      }
    ]
  }
]

# Rules
- Map each handbook section to ONE clause_type_name from the canonical list. If no match, omit it.
- Position 1 is always the client's preferred starting position.
- If the handbook explicitly numbers fallbacks (e.g., {R0}/{R1}, "Preferred / Fallback 1 / Fallback 2"), preserve that ordering.
- If the handbook says a position "requires Director / VP / RE Committee approval", populate requires_approval and set is_floor=true.
- Return ONLY the JSON array. No prose, no markdown fences.
- If a clause has no fallbacks documented, return only position_rank=1.
- clause_text should be the actual contract language someone would put in an LOI, NOT a summary. Preserve placeholders like [INSERT NAME].`,
        cached: true,
      },
    ]);

    const userPrompt = `Handbook source: ${body.source_label}
Client: ${clientRow.client_name}

Extract the structured playbook from the following handbook text. Return ONLY the JSON array — no other text.

<handbook>
${body.handbook_text}
</handbook>`;

    const claude = createClaudeClient();
    console.log(`[legal-ingest-handbook] Calling ${model}; handbook length: ${body.handbook_text.length} chars`);

    const result = await streamMessage(claude, {
      model,
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 64000,
      thinking: true, // adaptive thinking
      effort: 'high',
    });

    console.log(
      `[legal-ingest-handbook] Claude usage: input=${result.usage.inputTokens} output=${result.usage.outputTokens} cache_read=${result.usage.cacheReadTokens} cache_create=${result.usage.cacheCreationTokens}`,
    );

    // ------------------------------------------------------------------
    // Parse Claude's response. We expect a top-level JSON array.
    // ------------------------------------------------------------------
    let extracted: ExtractedClause[];
    try {
      extracted = JSON.parse(stripJsonFences(result.text));
    } catch (err) {
      return jsonResponse(500, {
        error: `Claude returned invalid JSON: ${(err as Error).message}`,
        raw_text_preview: result.text.slice(0, 500),
      });
    }

    if (!Array.isArray(extracted)) {
      return jsonResponse(500, {
        error: 'Claude response was not a JSON array',
        raw_text_preview: result.text.slice(0, 500),
      });
    }

    console.log(`[legal-ingest-handbook] Extracted ${extracted.length} clauses`);

    if (body.dry_run) {
      return jsonResponse(200, {
        dry_run: true,
        client: clientRow.client_name,
        extracted_clause_count: extracted.length,
        extracted,
        usage: result.usage,
        model: result.model,
      });
    }

    // ------------------------------------------------------------------
    // Upsert into legal_playbook + legal_playbook_position
    // ------------------------------------------------------------------
    const summary = {
      playbook_inserts: 0,
      playbook_updates: 0,
      position_inserts: 0,
      position_updates: 0,
      skipped_unknown_clause_types: [] as string[],
    };

    const validClauseTypeNames = new Set((clauseTypes ?? []).map((ct) => ct.name));

    for (const clause of extracted) {
      if (!validClauseTypeNames.has(clause.clause_type_name)) {
        summary.skipped_unknown_clause_types.push(clause.clause_type_name);
        continue;
      }

      // Look up clause_type id
      const { data: ct } = await supabase
        .from('clause_type')
        .select('id')
        .eq('name', clause.clause_type_name)
        .single();
      if (!ct) {
        summary.skipped_unknown_clause_types.push(clause.clause_type_name);
        continue;
      }

      // Upsert legal_playbook
      const { data: existingPb } = await supabase
        .from('legal_playbook')
        .select('id')
        .eq('client_id', body.client_id)
        .eq('clause_type_id', ct.id)
        .maybeSingle();

      let pbId: string;
      if (existingPb) {
        const { data: updated, error: upErr } = await supabase
          .from('legal_playbook')
          .update({
            display_heading: clause.display_heading,
            rationale: clause.rationale,
            guidelines: clause.guidelines,
            source_document: `${body.source_label} ${clause.source_section}`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPb.id)
          .select('id')
          .single();
        if (upErr) throw upErr;
        pbId = updated.id;
        summary.playbook_updates++;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('legal_playbook')
          .insert({
            client_id: body.client_id,
            clause_type_id: ct.id,
            display_heading: clause.display_heading,
            rationale: clause.rationale,
            guidelines: clause.guidelines,
            source_document: `${body.source_label} ${clause.source_section}`.trim(),
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        pbId = inserted.id;
        summary.playbook_inserts++;
      }

      // Upsert positions
      for (const pos of clause.positions) {
        const { data: existingPos } = await supabase
          .from('legal_playbook_position')
          .select('id')
          .eq('legal_playbook_id', pbId)
          .eq('position_rank', pos.position_rank)
          .maybeSingle();

        if (existingPos) {
          const { error: posUpErr } = await supabase
            .from('legal_playbook_position')
            .update({
              position_label: pos.position_label,
              clause_text: pos.clause_text,
              default_comment_text: pos.default_comment_text,
              requires_approval: pos.requires_approval,
              is_floor: pos.is_floor,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingPos.id);
          if (posUpErr) throw posUpErr;
          summary.position_updates++;
        } else {
          const { error: posInsErr } = await supabase.from('legal_playbook_position').insert({
            legal_playbook_id: pbId,
            position_rank: pos.position_rank,
            position_label: pos.position_label,
            clause_text: pos.clause_text,
            default_comment_text: pos.default_comment_text,
            requires_approval: pos.requires_approval,
            is_floor: pos.is_floor,
          });
          if (posInsErr) throw posInsErr;
          summary.position_inserts++;
        }
      }
    }

    return jsonResponse(200, {
      client: clientRow.client_name,
      extracted_clause_count: extracted.length,
      summary,
      usage: result.usage,
      model: result.model,
    });
  } catch (err) {
    console.error('[legal-ingest-handbook] Error:', err);
    return jsonResponse(500, {
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}
