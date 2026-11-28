/**
 * Filing: entry + links + tags (+ a correction row) in one transaction, then the
 * embedding.
 *
 * Two clients are in play, deliberately:
 *   * `service` — read-only here, for verifying link ids.
 *   * `userClient` — carries the caller's JWT, so the RPC's inserts pass through
 *     RLS as them and knowledge_entry.user_id defaults to their auth.uid().
 *     Filing must never be able to write a row the user couldn't write himself.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createEmbedding, toVectorLiteral } from './embedding.ts';
import { cleanProposedLinks, cleanTags, cleanText, normalizeProposal, type Proposal, proposalsDiffer } from './proposal.ts';
import { verifyLinks } from './tools.ts';

export interface FileRequest {
  raw_text: string;
  clean_text: string;
  source?: string;
  is_general?: boolean;
  links?: unknown;
  tags?: unknown;
  /** The model's FIRST proposal for this note, for the correction signal. */
  proposed?: unknown;
  /** Which chat model produced `proposed`. */
  proposal_model?: string;
}

export interface FileResult {
  entry_id: string;
  proposal: Proposal;
  /** False when the embedding call failed; the entry is filed either way. */
  embedded: boolean;
  embedding_error: string | null;
  correction_written: boolean;
  dropped_links: Array<{ object_type?: string; object_id?: string }>;
}

const SOURCES = ['typed', 'voice'];

/** Shape the client's `proposed` blob into something comparable. */
function parseProposedBaseline(raw: unknown): Proposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const links = cleanProposedLinks(p.links).map((l) => ({
    object_type: l.object_type,
    object_id: l.object_id,
    object_name: l.object_name ?? '',
  }));
  return {
    clean_text: cleanText(p.clean_text),
    links,
    tags: cleanTags(p.tags),
    is_general: p.is_general === true,
  };
}

export async function fileEntry(opts: {
  service: SupabaseClient;
  userClient: SupabaseClient;
  body: FileRequest;
}): Promise<FileResult> {
  const { service, userClient, body } = opts;

  const rawText = cleanText(body.raw_text);
  if (!rawText) throw Object.assign(new Error('raw_text is required'), { status: 400 });
  // Falls back to raw_text: a filed entry always has retrievable text, even if
  // the user cleared the clean_text box.
  const clean = cleanText(body.clean_text, rawText);

  const source = typeof body.source === 'string' && SOURCES.includes(body.source)
    ? body.source
    : 'typed';

  // The conversation round-tripped through the browser, so these ids are user
  // input by now — verified again here, not trusted from the turn that proposed
  // them. This is also what stops a hand-edited request filing a link to a
  // record that doesn't exist.
  const { links, dropped } = await verifyLinks(service, cleanProposedLinks(body.links));
  const tags = cleanTags(body.tags);
  // Same rule as a turn: real links win over the flag, and the table's own
  // meaning of is_general (belongs to no object) stays true to the data.
  const isGeneral = links.length > 0 ? false : body.is_general !== false;

  const accepted: Proposal = { clean_text: clean, links, tags, is_general: isGeneral };

  // Embedding first: a failure here must not roll back the entry, and doing it
  // before the write keeps the transaction short.
  let vectorLiteral: string | null = null;
  let embeddingModel: string | null = null;
  let embeddingDims: number | null = null;
  let embeddingError: string | null = null;
  try {
    const embedding = await createEmbedding(clean);
    vectorLiteral = toVectorLiteral(embedding.vector);
    embeddingModel = embedding.model;
    embeddingDims = embedding.dimensions;
  } catch (e) {
    // Non-fatal by design: losing a captured fact because an embedding provider
    // is down would be the worse failure. knowledge_entry_embedding_missing_idx
    // is the backfill queue.
    embeddingError = e instanceof Error ? e.message : String(e);
    console.warn('[knowledge-capture] embedding failed; filing without one:', embeddingError);
  }

  const baseline = parseProposedBaseline(body.proposed);
  const writeCorrection = !!baseline && proposalsDiffer(baseline, accepted);

  const { data, error } = await userClient.rpc('file_knowledge_entry', {
    p_raw_text: rawText,
    p_clean_text: clean,
    p_source: source,
    p_is_general: isGeneral,
    p_links: links.map((l) => ({ object_type: l.object_type, object_id: l.object_id })),
    p_tags: tags,
    p_embedding: vectorLiteral,
    p_embedding_model: embeddingModel,
    p_embedding_dims: embeddingDims,
    p_proposed: writeCorrection ? baseline : null,
    p_accepted: writeCorrection ? accepted : null,
    p_proposal_model: writeCorrection ? (body.proposal_model ?? null) : null,
  });

  if (error) {
    // RLS rejects a caller who isn't internal, or a spoofed user_id.
    const status = error.code === '42501' ? 403 : 500;
    throw Object.assign(new Error(`file failed: ${error.message}`), { status });
  }

  return {
    entry_id: String(data),
    proposal: accepted,
    embedded: vectorLiteral !== null,
    embedding_error: embeddingError,
    correction_written: writeCorrection,
    dropped_links: dropped,
  };
}

/** Exposed for the test: the normalised form the diff compares. */
export const _normalizeProposal = normalizeProposal;
