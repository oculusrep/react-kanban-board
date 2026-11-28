/**
 * Employer headcount enrichment — a Gemini pass over the employers the deep pass recorded.
 *
 * Why this exists: site-level headcount is the one employer figure that is routinely unpublished.
 * The Macon run of 2026-09-28 recorded three employers and left all three blank, correctly — the
 * hospital publishes beds, the insurer publishes a metro ranking, the college publishes enrolment.
 * None of those is a site headcount and the deep pass refused to pretend otherwise.
 *
 * What this pass may and may not do:
 *
 *   - It asks Gemini for the number of people who work AT THIS LOCATION, never company-wide.
 *   - **The reply is prose first, then a JSON block.** This is not a style choice. Asked for bare
 *     JSON, this model does not search at all — webSearchQueries comes back empty and it answers
 *     from its weights — so every answer failed the grounding check and the pass returned nothing
 *     but nulls. Writing an ordinary sourced answer keeps Google Search in the loop; the JSON block
 *     at the end is what the program reads.
 *   - **A number is accepted only with a source that Google Search actually retrieved.** Search
 *     grounding is switched on and the source is taken from groundingMetadata, not from whatever
 *     URL the model typed into its answer — an ungrounded model will invent a plausible citation
 *     as readily as it invents a plausible number, and then the guard checks nothing.
 *   - No source means no headcount. The row stays blank and says it was asked, so a reader can
 *     tell "nobody publishes this" from "nobody looked".
 *   - It never overwrites a headcount the deep pass already sourced.
 *
 * The prompt body lives in prompt_template under key 'employer_headcount', like every other
 * Site Story prompt, so it can be re-tuned without a deploy.
 */

/** Gemini model. gemini-2.0-flash is retired ("no longer available" from the API, 2026-09-29). */
export const HEADCOUNT_MODEL = 'gemini-3.8-flash';
export const HEADCOUNT_PROMPT_KEY = 'employer_headcount';

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

export interface HeadcountTarget {
  name: string;
  employer_type: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface HeadcountAnswer {
  /** Site-level employees, or null when nothing usable came back. */
  headcount: number | null;
  /** A URI Google Search actually retrieved. Null whenever headcount is null. */
  headcount_source: string | null;
  /** One line for the row's notes, always set, so a blank is never silent. */
  note: string;
}

const NOT_FOUND = (why: string): HeadcountAnswer => ({ headcount: null, headcount_source: null, note: why });

/** The one place the answer shape is parsed. Anything unexpected is "not found", never a guess. */
export function parseHeadcountReply(text: string, chunks: GroundingChunk[]): HeadcountAnswer {
  // LAST fence wins. The reply is prose then JSON — see the prompt — and prose that quotes an
  // example block earlier would otherwise be parsed as the answer.
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const raw = (fences.length ? fences[fences.length - 1][1] : text).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NOT_FOUND('Gemini queried; reply was not parseable as JSON, so no headcount was taken.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NOT_FOUND('Gemini queried; reply was not an object, so no headcount was taken.');
  }
  const o = parsed as Record<string, unknown>;
  const n = typeof o.headcount === 'number' ? o.headcount : null;
  if (n === null || !Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return NOT_FOUND('Gemini queried; no site-level headcount found.');
  }

  // The citation must be one Google Search actually retrieved. A URL the model merely wrote down is
  // not a source: it came out of the same weights as the number it is supposed to vouch for, and on
  // 2026-09-30 this model answered "500 employees, https://www.gfb.org/about-us/history.cms" for an
  // employer where the search returned nothing at all. Both were invented, and they read as a
  // sourced fact.
  if (chunks.length === 0) {
    return NOT_FOUND(
      `Gemini returned a site headcount of ${n} but Google Search retrieved nothing to support it, so it was not used.`,
    );
  }

  // Prefer the model's own URL when a retrieved chunk comes from the same site — it is the readable
  // one, and the chunk's redirect URI proves a page from that domain was really fetched. Otherwise
  // fall back to the chunk itself, naming the publisher so the cell is not an opaque redirect.
  const stated = typeof o.source === 'string' ? o.source.trim() : '';
  const statedHost = stated ? hostOf(stated) : null;
  const domains = chunks.map((c) => (c.title ?? '').toLowerCase()).filter(Boolean);
  const corroborated = statedHost !== null &&
    domains.some((d) => statedHost === d || statedHost.endsWith(`.${d}`) || d.endsWith(`.${statedHost}`));

  const source = corroborated ? stated : `${chunks[0].title ?? 'retrieved source'} (${chunks[0].uri})`;
  return {
    headcount: n,
    headcount_source: source,
    note: corroborated
      ? `Site headcount ${n} via Gemini (${HEADCOUNT_MODEL}), Google Search grounded; source ${source}.`
      : `Site headcount ${n} via Gemini (${HEADCOUNT_MODEL}), Google Search grounded, but the URL it named (${stated || 'none'}) was not among the pages retrieved; the retrieved source is cited instead.`,
  };
}

export interface GroundingChunk {
  /** The publisher's domain, e.g. "sec.gov". The only human-readable part of a chunk. */
  title: string | null;
  /** A vertexaisearch redirect, never the publisher's own URL. */
  uri: string;
}

/** Sources Google Search actually retrieved, in the order the API returned them. */
export function groundingChunksOf(body: unknown): GroundingChunk[] {
  const cand = (body as { candidates?: Array<Record<string, unknown>> } | null)?.candidates?.[0];
  const meta = cand?.groundingMetadata as
    { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } | undefined;
  return (meta?.groundingChunks ?? [])
    .map((c) => ({ title: c.web?.title ?? null, uri: c.web?.uri ?? '' }))
    .filter((c) => c.uri.length > 0);
}

/** The host of a URL, lowercased and without "www.", or null if it will not parse. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function textOf(body: unknown): string {
  const cand = (body as { candidates?: Array<Record<string, unknown>> } | null)?.candidates?.[0];
  const parts = (cand?.content as { parts?: Array<{ text?: string }> } | undefined)?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('').trim();
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** One employer, one Gemini call. Never throws: a failed lookup is a blank headcount with a reason. */
export async function headcountFor(
  target: HeadcountTarget,
  promptBody: string,
  apiKey: string,
  fetcher: Fetcher = fetch,
  model: string = HEADCOUNT_MODEL,
): Promise<HeadcountAnswer> {
  const where = [target.street, target.city, [target.state, target.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const question = [
    `Employer: ${target.name}`,
    target.employer_type ? `Kind of site: ${target.employer_type}` : null,
    where ? `Address: ${where}` : null,
  ].filter(Boolean).join('\n');

  let res: Response;
  try {
    res = await fetcher(ENDPOINT(model, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: promptBody }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
        // thinkingBudget is not a tuning knob here, it is load-bearing. Uncapped, this model spent
        // every output token on thinking and returned a response with no content parts at all
        // (3,955 thought tokens, zero text) — which looks exactly like "no headcount found".
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingBudget: 2048 },
        },
      }),
    });
  } catch (e) {
    return NOT_FOUND(`Gemini unavailable (${e instanceof Error ? e.message : String(e)}); headcount not attempted.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NOT_FOUND(`Gemini returned HTTP ${res.status}; headcount not taken. ${detail.slice(0, 200)}`.trim());
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return NOT_FOUND('Gemini returned a body that was not JSON; headcount not taken.');
  }
  const text = textOf(body);
  if (!text) {
    // No content parts at all: the model spent its whole output allowance on thinking. The
    // thinkingBudget below is what keeps this rare; the branch stays because a silent empty
    // reply must not read as "no headcount published".
    return NOT_FOUND('Gemini returned an empty reply (no content parts); headcount not taken.');
  }
  return parseHeadcountReply(text, groundingChunksOf(body));
}

export interface EnrichableEmployer {
  name: string;
  employer_type: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  headcount: number | null;
  headcount_source?: string | null;
  notes: string | null;
}

/**
 * Fill the blanks, in place of nothing. Employers that already carry a sourced headcount are left
 * exactly as the deep pass recorded them — this pass adds, it never overwrites.
 */
export async function enrichHeadcounts<T extends EnrichableEmployer>(
  employers: T[],
  promptBody: string,
  apiKey: string | null,
  fetcher: Fetcher = fetch,
  model: string = HEADCOUNT_MODEL,
): Promise<{ employers: T[]; asked: number; filled: number }> {
  if (!apiKey) return { employers, asked: 0, filled: 0 };
  let asked = 0, filled = 0;
  for (const e of employers) {
    if (e.headcount !== null) continue;
    asked++;
    const a = await headcountFor(e, promptBody, apiKey, fetcher, model);
    if (a.headcount !== null) {
      e.headcount = a.headcount;
      e.headcount_source = a.headcount_source;
      filled++;
    }
    e.notes = [e.notes, a.note].filter(Boolean).join('; ');
  }
  return { employers, asked, filled };
}
