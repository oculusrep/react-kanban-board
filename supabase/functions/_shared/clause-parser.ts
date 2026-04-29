/**
 * Clause Boundary Parser — Legal Orchestration
 *
 * Given a parsed .docx (from docx-parser.ts), groups paragraphs into clauses
 * by detecting heading paragraphs (ALL-CAPS-then-colon) and treating each
 * subsequent paragraph as the body until the next heading appears.
 *
 * Used by the inbound LOI processing pipeline before clause-matcher.ts maps
 * each ClauseBoundary to a canonical clause_type via the playbook taxonomy.
 *
 * The detection is intentionally simple: an LOI built from the Starbucks
 * master template uses ALL-CAPS-COLON headings (PREMISES:, TERM:, RENT:, …).
 * If a counterparty's reformatted version uses different casing or structure,
 * the clause-matcher's fuzzy/semantic fallback handles it.
 */

import type { ParsedDocx, ParsedParagraph } from './docx-parser.ts';

// ============================================================================
// TYPES
// ============================================================================

/** One clause-shaped section identified in the document. */
export interface ClauseBoundary {
  /** Heading text without the trailing colon, normalized whitespace. */
  heading: string;
  /** The paragraph containing the heading. */
  heading_paragraph: ParsedParagraph;
  /** All paragraphs from this heading up to (but not including) the next heading. */
  body_paragraphs: ParsedParagraph[];
  /** Concatenated visible text of the body paragraphs, normalized whitespace. */
  body_text: string;
  /** Concatenated original text (pre-tracked-changes view). */
  body_original_text: string;
  /** True if any paragraph in this clause has tracked changes (insertion or deletion). */
  has_tracked_changes: boolean;
  /** Extracted insertion fragments across the clause. */
  insertions: string[];
  /** Extracted deletion fragments across the clause. */
  deletions: string[];
}

/** A paragraph that did not fall under any heading (preamble or post-conclusion). */
export interface OrphanParagraph {
  paragraph: ParsedParagraph;
  position: 'preamble' | 'post-conclusion';
}

export interface ClauseParseResult {
  clauses: ClauseBoundary[];
  orphans: OrphanParagraph[];
}

// ============================================================================
// CONFIG
// ============================================================================

/**
 * Default heading detection regex.
 *
 * Matches paragraphs that start with at least 2 uppercase letters/spaces/
 * dashes followed by a colon. Allows whitespace, ampersands, parentheses,
 * single quotes, and forward slashes inside the heading (e.g., "CAM, TAXES
 * AND INSURANCE", "BROKER'S COMMISSION", "TRASH & RECYCLING").
 *
 * Captures the heading text in group 1 (without the colon).
 *
 * NOTE: also tolerates a few common typographic substitutions (e.g., en-dash
 * vs hyphen, smart-quote apostrophes).
 */
export const DEFAULT_HEADING_PATTERN =
  /^\s*([A-Z][A-Z0-9 &/'’()—–\-]{1,}?)\s*:/;

// ============================================================================
// PUBLIC API
// ============================================================================

export function identifyClauseBoundaries(
  doc: ParsedDocx,
  options: { headingPattern?: RegExp } = {},
): ClauseParseResult {
  const headingRegex = options.headingPattern ?? DEFAULT_HEADING_PATTERN;
  const clauses: ClauseBoundary[] = [];
  const orphans: OrphanParagraph[] = [];

  let current: ClauseBoundary | null = null;
  let seenAnyHeading = false;

  for (const p of doc.paragraphs) {
    const text = (p.visible_text || '').trim();
    if (!text) {
      // Empty paragraph — keep it in the current clause's body if any, otherwise skip.
      if (current) current.body_paragraphs.push(p);
      continue;
    }

    const match = text.match(headingRegex);
    if (match) {
      seenAnyHeading = true;
      // Close the current clause and start a new one.
      if (current) {
        finalizeClauseBody(current);
        clauses.push(current);
      }

      const heading = normalizeHeading(match[1]);
      current = {
        heading,
        heading_paragraph: p,
        body_paragraphs: [],
        body_text: '',
        body_original_text: '',
        has_tracked_changes: p.has_insertions || p.has_deletions,
        insertions: [...p.insertions],
        deletions: [...p.deletions],
      };

      // If the heading paragraph contains text after the colon, treat the
      // remainder as part of the body (some templates put the first sentence
      // on the same line as the heading).
      const colonIdx = text.indexOf(':');
      const remainder = colonIdx >= 0 ? text.slice(colonIdx + 1).trim() : '';
      if (remainder) {
        // Add a synthetic body row that points back to the same paragraph but
        // captures only the post-colon text. We don't synthesize a fake
        // ParsedParagraph; instead we just include the heading paragraph in
        // body_paragraphs so its text contributes once.
        current.body_paragraphs.push(p);
      }
    } else if (current) {
      current.body_paragraphs.push(p);
      if (p.has_insertions || p.has_deletions) current.has_tracked_changes = true;
      current.insertions.push(...p.insertions);
      current.deletions.push(...p.deletions);
    } else {
      orphans.push({
        paragraph: p,
        position: seenAnyHeading ? 'post-conclusion' : 'preamble',
      });
    }
  }

  if (current) {
    finalizeClauseBody(current);
    clauses.push(current);
  }

  return { clauses, orphans };
}

// ============================================================================
// INTERNAL
// ============================================================================

function finalizeClauseBody(clause: ClauseBoundary): void {
  const bodyParts: string[] = [];
  const originalParts: string[] = [];

  for (const p of clause.body_paragraphs) {
    if (p === clause.heading_paragraph) {
      // Strip the heading prefix from this paragraph's contribution.
      const colonIdx = (p.visible_text ?? '').indexOf(':');
      if (colonIdx >= 0) {
        bodyParts.push(p.visible_text.slice(colonIdx + 1).trim());
        const origColon = (p.original_text ?? '').indexOf(':');
        originalParts.push(
          origColon >= 0 ? p.original_text.slice(origColon + 1).trim() : (p.original_text ?? ''),
        );
      } else {
        bodyParts.push(p.visible_text ?? '');
        originalParts.push(p.original_text ?? '');
      }
    } else {
      bodyParts.push(p.visible_text ?? '');
      originalParts.push(p.original_text ?? '');
    }
  }

  clause.body_text = bodyParts.filter((s) => s.length > 0).join('\n').trim();
  clause.body_original_text = originalParts.filter((s) => s.length > 0).join('\n').trim();
}

function normalizeHeading(raw: string): string {
  return raw
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}
