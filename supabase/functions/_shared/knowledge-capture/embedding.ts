/**
 * The single embedding call for Knowledge Capture.
 *
 * EVERY caller goes through createEmbedding(). Swapping providers means editing
 * this file (and the model/dimension constants in config.ts) — nothing else.
 * That is why the return value carries `model` and `dimensions` rather than a
 * bare vector: callers persist them to knowledge_entry.embedding_model /
 * embedding_dims, so a future re-embed can find exactly which rows to redo.
 *
 * Currently OpenAI: https://platform.openai.com/docs/api-reference/embeddings
 * (POST /v1/embeddings; `dimensions` is supported by text-embedding-3-*).
 */
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './config.ts';

export interface Embedding {
  vector: number[];
  model: string;
  dimensions: number;
}

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const REQUEST_TIMEOUT_MS = 20_000;

/** pgvector's text input format: '[0.1,-0.2,…]'. */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Embed one piece of text. Throws on any failure — callers decide whether that
 * is fatal (it isn't, at filing time: the entry is saved with a null embedding
 * and backfilled later).
 */
export async function createEmbedding(text: string): Promise<Embedding> {
  const input = text.trim();
  if (!input) throw new Error('createEmbedding: empty text');

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`embedding request failed (${res.status}): ${detail}`);
  }

  const body = await res.json() as {
    model?: string;
    data?: Array<{ embedding?: number[] }>;
  };
  const vector = body.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('embedding response carried no vector');
  }
  // The column is a fixed-width vector(1536). A provider that ignores the
  // requested `dimensions` would otherwise fail at INSERT with a type error
  // that says nothing about why; fail here, where the cause is obvious.
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding width mismatch: asked for ${EMBEDDING_DIMENSIONS}, got ${vector.length}. ` +
        'knowledge_entry.embedding is vector(1536) — a different width needs a migration first.',
    );
  }

  return {
    vector,
    // What the provider says it used, not what we asked for: they can differ
    // (an alias resolving to a dated snapshot), and the row should record the
    // former.
    model: body.model?.trim() || EMBEDDING_MODEL,
    dimensions: vector.length,
  };
}
