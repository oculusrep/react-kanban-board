/**
 * Clause Matcher — Legal Orchestration
 *
 * Maps each ClauseBoundary identified by the clause-parser to a canonical
 * clause_type from the taxonomy. Uses a three-tier pipeline:
 *
 *   1. Exact heading match  (legal_playbook.display_heading == parsed heading)
 *   2. Fuzzy heading match  (token overlap / substring)
 *   3. Claude semantic match (LLM classifies the body content into a
 *      canonical clause_type when heuristics fail)
 *
 * Per spec Q11, most landlord redlines are Type 1+2 with minimal restructuring,
 * so tiers 1-2 will handle the bulk. Tier 3 catches renames and new content.
 */

import type Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import type { ClauseBoundary } from './clause-parser.ts';
import { sendStructured, SONNET_MODEL } from './claude.ts';

// ============================================================================
// TYPES
// ============================================================================

export type MatcherTier = 'exact' | 'fuzzy' | 'semantic' | 'unmatched';

export interface ClauseMatch {
  boundary: ClauseBoundary;
  /** Canonical clause_type name (e.g., "use", "exclusive_use"), or null if unmatched. */
  clause_type_name: string | null;
  /** legal_playbook.id if there's a matching playbook entry for this client, else null. */
  legal_playbook_id: string | null;
  /** Which tier produced the match. */
  matcher_used: MatcherTier;
  /** 0.0–1.0. Exact = 1.0; fuzzy varies; semantic comes from Claude. */
  confidence: number;
  /** Optional rationale, used for debugging and review-UI display. */
  rationale?: string;
}

interface PlaybookHeading {
  legal_playbook_id: string;
  clause_type_id: string;
  clause_type_name: string;
  clause_type_display_name: string;
  display_heading: string;
  display_heading_normalized: string;
}

interface CanonicalClauseType {
  name: string;
  display_name: string;
  description: string | null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface MatchOptions {
  /** Skip Claude calls entirely (heuristics only). Useful for unit tests / dry runs. */
  skipSemantic?: boolean;
  /** Override the model used for semantic fallback. Defaults to Sonnet 4.6. */
  semanticModel?: string;
  /** Minimum fuzzy-match score to accept without falling through to semantic. Default 0.6. */
  fuzzyThreshold?: number;
}

export async function matchClausesToPlaybook(
  boundaries: ClauseBoundary[],
  clientId: string,
  supabase: SupabaseClient,
  claude: Anthropic,
  options: MatchOptions = {},
): Promise<ClauseMatch[]> {
  // ------------------------------------------------------------------------
  // 1. Pull this client's playbook headings + the canonical taxonomy
  // ------------------------------------------------------------------------
  const { data: playbookRows, error: pbError } = await supabase
    .from('legal_playbook')
    .select('id, clause_type_id, display_heading, clause_type:clause_type_id(name, display_name)')
    .eq('client_id', clientId)
    .eq('is_active', true);
  if (pbError) {
    throw new Error(`Failed to load legal_playbook for client ${clientId}: ${pbError.message}`);
  }

  const headings: PlaybookHeading[] = (playbookRows ?? []).map((r) => {
    // deno-lint-ignore no-explicit-any
    const ct = (r as any).clause_type;
    return {
      legal_playbook_id: r.id as string,
      clause_type_id: r.clause_type_id as string,
      clause_type_name: ct?.name ?? '',
      clause_type_display_name: ct?.display_name ?? '',
      display_heading: r.display_heading as string,
      display_heading_normalized: normalize(r.display_heading as string),
    };
  });

  // For semantic fallback we need the full canonical taxonomy (some clauses
  // may have no playbook entry yet — we still want to tag them with the
  // canonical clause_type_name even if legal_playbook_id is null).
  const { data: taxonomyRows, error: ctError } = await supabase
    .from('clause_type')
    .select('name, display_name, description')
    .eq('is_active', true)
    .order('sort_order');
  if (ctError) {
    throw new Error(`Failed to load clause_type taxonomy: ${ctError.message}`);
  }
  const taxonomy: CanonicalClauseType[] = taxonomyRows ?? [];

  // ------------------------------------------------------------------------
  // 2. Match each boundary
  // ------------------------------------------------------------------------
  const matches: ClauseMatch[] = [];
  for (const b of boundaries) {
    const match = await matchSingleBoundary(b, headings, taxonomy, claude, options);
    matches.push(match);
  }
  return matches;
}

// ============================================================================
// INTERNAL — Per-boundary matching
// ============================================================================

async function matchSingleBoundary(
  boundary: ClauseBoundary,
  headings: PlaybookHeading[],
  taxonomy: CanonicalClauseType[],
  claude: Anthropic,
  options: MatchOptions,
): Promise<ClauseMatch> {
  const headingNormalized = normalize(boundary.heading);

  // ------------------------------------------------------------------------
  // Tier 1: exact heading match against this client's playbook
  // ------------------------------------------------------------------------
  const exact = headings.find((h) => h.display_heading_normalized === headingNormalized);
  if (exact) {
    return {
      boundary,
      clause_type_name: exact.clause_type_name,
      legal_playbook_id: exact.legal_playbook_id,
      matcher_used: 'exact',
      confidence: 1.0,
      rationale: `Exact heading match: "${boundary.heading}" -> "${exact.display_heading}"`,
    };
  }

  // ------------------------------------------------------------------------
  // Tier 2: fuzzy heading match (token overlap)
  // ------------------------------------------------------------------------
  const fuzzy = bestFuzzyMatch(headingNormalized, headings, options.fuzzyThreshold ?? 0.6);
  if (fuzzy) {
    return {
      boundary,
      clause_type_name: fuzzy.heading.clause_type_name,
      legal_playbook_id: fuzzy.heading.legal_playbook_id,
      matcher_used: 'fuzzy',
      confidence: fuzzy.score,
      rationale: `Fuzzy heading match (${fuzzy.score.toFixed(2)}): "${boundary.heading}" -> "${fuzzy.heading.display_heading}"`,
    };
  }

  // ------------------------------------------------------------------------
  // Tier 3: Claude semantic classification
  // ------------------------------------------------------------------------
  if (options.skipSemantic) {
    return unmatchedResult(boundary, 'Heuristics failed and semantic fallback was disabled');
  }

  try {
    const semantic = await semanticClassify(boundary, taxonomy, claude, options.semanticModel);
    if (semantic.clause_type_name) {
      const playbookForType = headings.find((h) => h.clause_type_name === semantic.clause_type_name);
      return {
        boundary,
        clause_type_name: semantic.clause_type_name,
        legal_playbook_id: playbookForType?.legal_playbook_id ?? null,
        matcher_used: 'semantic',
        confidence: semantic.confidence,
        rationale: semantic.rationale,
      };
    }
    return unmatchedResult(boundary, semantic.rationale || 'Claude could not classify');
  } catch (err) {
    return unmatchedResult(boundary, `Semantic classification error: ${(err as Error).message}`);
  }
}

function unmatchedResult(boundary: ClauseBoundary, rationale: string): ClauseMatch {
  return {
    boundary,
    clause_type_name: null,
    legal_playbook_id: null,
    matcher_used: 'unmatched',
    confidence: 0,
    rationale,
  };
}

// ============================================================================
// INTERNAL — Fuzzy matching
// ============================================================================

function bestFuzzyMatch(
  headingNormalized: string,
  headings: PlaybookHeading[],
  threshold: number,
): { heading: PlaybookHeading; score: number } | null {
  const headingTokens = tokenize(headingNormalized);
  if (headingTokens.length === 0) return null;

  let best: { heading: PlaybookHeading; score: number } | null = null;
  for (const h of headings) {
    const candidateTokens = tokenize(h.display_heading_normalized);
    if (candidateTokens.length === 0) continue;

    const score = jaccardSimilarity(headingTokens, candidateTokens);
    if (!best || score > best.score) {
      best = { heading: h, score };
    }
  }

  if (best && best.score >= threshold) return best;
  return null;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// ============================================================================
// INTERNAL — Semantic classification
// ============================================================================

async function semanticClassify(
  boundary: ClauseBoundary,
  taxonomy: CanonicalClauseType[],
  claude: Anthropic,
  modelOverride?: string,
): Promise<{ clause_type_name: string | null; confidence: number; rationale: string }> {
  const taxonomyText = taxonomy
    .map(
      (t) =>
        `  - ${t.name} ("${t.display_name}")${t.description ? `: ${t.description}` : ''}`,
    )
    .join('\n');

  const system = `You classify commercial real estate Letter-of-Intent clauses into a canonical taxonomy.

# Canonical clause types
${taxonomyText}

# Output schema
{
  "clause_type_name": "<canonical name from list above, or null if no good match>",
  "confidence": <0.0 to 1.0>,
  "rationale": "<one sentence explaining the match>"
}

Return ONLY the JSON object. Be strict — if the clause does not clearly map to one canonical type, return clause_type_name=null with low confidence.`;

  const user = `Heading: "${boundary.heading}"

Body excerpt (first 800 chars):
${boundary.body_text.slice(0, 800)}

Classify this clause.`;

  const result = await sendStructured<{
    clause_type_name: string | null;
    confidence: number;
    rationale: string;
  }>(claude, {
    model: (modelOverride as 'claude-sonnet-4-6' | 'claude-opus-4-7' | undefined) ?? SONNET_MODEL,
    system,
    user,
    maxTokens: 512,
  });

  // Validate the model returned a real canonical name.
  if (
    result.data.clause_type_name &&
    !taxonomy.find((t) => t.name === result.data.clause_type_name)
  ) {
    return {
      clause_type_name: null,
      confidence: 0,
      rationale: `Claude returned an out-of-taxonomy name: "${result.data.clause_type_name}"`,
    };
  }

  return result.data;
}

// ============================================================================
// INTERNAL — Normalization
// ============================================================================

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
}

/**
 * Stopwords for fuzzy heading matching. Kept narrow on purpose — domain words
 * like "use", "rent", "exclusive" carry the signal we need to disambiguate
 * clauses, so we only filter generic English connectors.
 */
const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'or', 'of', 'to', 'a', 'an']);
