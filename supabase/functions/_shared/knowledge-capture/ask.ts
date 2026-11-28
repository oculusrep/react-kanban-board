/**
 * Ask mode: a question in, an answer built ONLY from Intel notes and file text,
 * with citations.
 *
 *   1. intel_search() (as the caller, so RLS applies) — meaning, keyword, tag
 *      and linked-record matches over notes and file chunks.
 *   2. Relevance floor: a candidate found ONLY by meaning must clear
 *      MIN_SIMILARITY. If nothing survives, "nothing found" — and no model call.
 *   3. The model answers from the numbered sources: every statement carries
 *      citations, each with a short quote copied from the source.
 *   4. verifyAnswer(): every cited source must be one we sent, every quote must
 *      appear word for word in it, and every number in a statement must appear
 *      in a source it cites. Anything that fails is dropped. If no statement
 *      survives, the answer is "nothing found" — never an uncited answer.
 *
 * The prompt asks for no outside knowledge; step 4 is what enforces it.
 * Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md
 */

export const MAX_QUESTION_CHARS = 1000;
export const SEARCH_LIMIT = 12;
/**
 * text-embedding-3-small cosine similarity. Related passages score ~0.35–0.7,
 * unrelated ones ~0.05–0.25. Applies only to candidates nothing else matched.
 */
export const MIN_SIMILARITY = 0.3;
const MAX_STATEMENTS = 12;
const MAX_CITATIONS_PER_STATEMENT = 4;
const MIN_QUOTE_CHARS = 8;
/** What each source carries into the prompt (~1,500 tokens). */
const SOURCE_CHARS = 6000;

export interface SearchRow {
  source_kind: 'note' | 'file';
  entry_id: string;
  file_id: string | null;
  chunk_id: string | null;
  content: string;
  locator: string | null;
  filename: string | null;
  entry_created_at: string;
  author_name: string | null;
  similarity: number | null;
  matched: string[];
  score: number;
}

export interface Source extends SearchRow {
  key: string; // "S1"
}

export interface AskDeps {
  /** The question's embedding, or null if the embedding call failed (keyword search still runs). */
  embed: (text: string) => Promise<number[] | null>;
  search: (question: string, embedding: number[] | null, limit: number) => Promise<SearchRow[]>;
  /** One model call; returns the parsed JSON. */
  answer: (prompt: string) => Promise<unknown>;
}

export interface Citation {
  n: number;
  quote: string;
}

export interface AnswerStatement {
  text: string;
  citations: Citation[];
}

export interface CitedSource {
  n: number;
  kind: 'note' | 'file';
  entry_id: string;
  file_id: string | null;
  filename: string | null;
  locator: string | null;
  entry_created_at: string;
  author_name: string | null;
  excerpt: string;
}

export type AskBody =
  | { result: 'answered'; statements: AnswerStatement[]; sources: CitedSource[]; searched: number }
  | { result: 'nothing_found'; searched: number };

export interface AskResponse {
  status: number;
  body: AskBody | { error: string; detail?: string };
}

/** Lowercase, straight quotes and dashes, de-hyphenated line breaks, single spaces. */
export function normalizeForQuote(s: string): string {
  return s
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every number in the text, commas and currency stripped: "$1,500.00" → "1500.00". */
export function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.0+$/, ''));
}

export function relevantRows(rows: SearchRow[]): SearchRow[] {
  return rows.filter((r) =>
    (r.matched ?? []).some((m) => m !== 'meaning') || (typeof r.similarity === 'number' && r.similarity >= MIN_SIMILARITY)
  );
}

function sourceHeader(s: Source): string {
  const date = String(s.entry_created_at).slice(0, 10);
  const by = s.author_name ? ` by ${s.author_name}` : '';
  return s.source_kind === 'file'
    ? `[${s.key}] File "${s.filename ?? 'file'}"${s.locator ? `, ${s.locator}` : ''} — attached to a note filed ${date}${by}`
    : `[${s.key}] Note filed ${date}${by}`;
}

export const ASK_SYSTEM_PROMPT = `You answer questions for a commercial real estate brokerage using ONLY the sources provided: notes the team filed in Intel and text from files attached to them.

THE ABSOLUTE RULE: every statement you make must come from the sources. Never use general knowledge, never fill a gap with what is typical or likely, never infer a number. If the sources do not answer the question, set answered to false and return no statements. A partial answer is fine: state only what the sources say, and nothing about the rest.

For each statement:
  - text: one short sentence answering part of the question, in your own words but with every number, date and name exactly as the source has it.
  - citations: one or more {"source": "S3", "quote": "..."}. The quote is copied WORD FOR WORD from that source — at least a few words, enough to show the statement is true. Do not paraphrase, fix typos or join text from different places in a quote.

Every quote is checked against its source, and every number in a statement against the sources it cites. A statement that fails either check is deleted, so an unsupported statement gains nothing.

Return JSON: {"answered": true, "statements": [{"text": "...", "citations": [{"source": "S1", "quote": "..."}]}]}`;

export const ASK_OUTPUT_FORMAT: Record<string, unknown> = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      answered: { type: 'boolean' },
      statements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                properties: { source: { type: 'string' }, quote: { type: 'string' } },
                required: ['source', 'quote'],
                additionalProperties: false,
              },
            },
          },
          required: ['text', 'citations'],
          additionalProperties: false,
        },
      },
    },
    required: ['answered', 'statements'],
    additionalProperties: false,
  },
};

export function askUserMessage(question: string, sources: Source[]): string {
  const blocks = sources.map((s) => `${sourceHeader(s)}\n"""\n${s.content.slice(0, SOURCE_CHARS)}\n"""`);
  return `Sources:\n\n${blocks.join('\n\n')}\n\nQuestion: ${question}`;
}

/**
 * Keep only what the sources prove. Returns statements with citations renumbered
 * 1..n in order of first use, and the cited sources in that order.
 */
export function verifyAnswer(raw: unknown, sources: Source[]): { statements: AnswerStatement[]; cited: Source[] } {
  const byKey = new Map(sources.map((s) => [s.key.toUpperCase(), s]));
  const normContent = new Map(sources.map((s) => [s.key.toUpperCase(), normalizeForQuote(s.content.slice(0, SOURCE_CHARS))]));
  const order: string[] = [];
  const statements: AnswerStatement[] = [];

  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.answered === false) return { statements: [], cited: [] };
  const list = Array.isArray(r.statements) ? r.statements.slice(0, MAX_STATEMENTS) : [];

  for (const item of list) {
    const st = (item ?? {}) as Record<string, unknown>;
    const text = typeof st.text === 'string' ? st.text.trim().replace(/\s+/g, ' ').slice(0, 600) : '';
    if (!text) continue;
    const valid: Array<{ key: string; quote: string }> = [];
    for (const c of (Array.isArray(st.citations) ? st.citations : []).slice(0, MAX_CITATIONS_PER_STATEMENT)) {
      const cit = (c ?? {}) as Record<string, unknown>;
      const key = typeof cit.source === 'string' ? cit.source.trim().replace(/^\[|\]$/g, '').toUpperCase() : '';
      const quote = typeof cit.quote === 'string' ? cit.quote.trim() : '';
      const content = normContent.get(key);
      const q = normalizeForQuote(quote);
      if (!content || q.length < MIN_QUOTE_CHARS || !content.includes(q)) continue;
      if (!valid.some((v) => v.key === key && v.quote === quote)) valid.push({ key, quote });
    }
    if (valid.length === 0) continue;

    // Numbers in the statement must come from what it cites.
    const citedNumbers = new Set(valid.flatMap((v) => numbersIn(byKey.get(v.key)!.content.slice(0, SOURCE_CHARS))));
    if (numbersIn(text).some((n) => !citedNumbers.has(n))) continue;

    for (const v of valid) if (!order.includes(v.key)) order.push(v.key);
    statements.push({ text, citations: valid.map((v) => ({ n: order.indexOf(v.key) + 1, quote: v.quote })) });
  }
  return { statements, cited: order.map((k) => byKey.get(k)!) };
}

export async function askIntel(deps: AskDeps, body: Record<string, unknown>): Promise<AskResponse> {
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return { status: 400, body: { error: 'question is required' } };
  if (question.length > MAX_QUESTION_CHARS) {
    return { status: 400, body: { error: 'too_long', detail: `Keep the question under ${MAX_QUESTION_CHARS} characters.` } };
  }

  const embedding = await deps.embed(question).catch(() => null);
  const rows = await deps.search(question, embedding, SEARCH_LIMIT);
  const relevant = relevantRows(rows);
  if (relevant.length === 0) return { status: 200, body: { result: 'nothing_found', searched: rows.length } };

  const sources: Source[] = relevant.map((r, i) => ({ ...r, key: `S${i + 1}` }));
  const proposed = await deps.answer(askUserMessage(question, sources));
  const { statements, cited } = verifyAnswer(proposed, sources);
  if (statements.length === 0) return { status: 200, body: { result: 'nothing_found', searched: relevant.length } };

  return {
    status: 200,
    body: {
      result: 'answered',
      statements,
      searched: relevant.length,
      sources: cited.map((s, i) => ({
        n: i + 1,
        kind: s.source_kind,
        entry_id: s.entry_id,
        file_id: s.file_id,
        filename: s.filename,
        locator: s.locator,
        entry_created_at: s.entry_created_at,
        author_name: s.author_name,
        excerpt: s.content.slice(0, 1200),
      })),
    },
  };
}
