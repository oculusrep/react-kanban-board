/**
 * Silent Acceptance Detector — Legal Orchestration
 *
 * Compares the prior outbound .docx (what Mike last sent) against the current
 * inbound .docx (landlord's response) and flags places where the landlord's
 * baseline text differs from Mike's outgoing visible text WITHOUT a tracked
 * change marker — i.e., the landlord either accepted Mike's prior changes
 * silently (no tracked-change record left behind) or made an untracked edit.
 *
 * Per Q3, Mike runs this check manually today via Word's Compare feature on
 * every round to avoid being surprised by silently-accepted changes. This
 * module automates it.
 *
 * Algorithm (paragraph-by-paragraph by index — assumes minimal restructuring,
 * which Mike confirmed in Q11). For each paragraph in the inbound doc:
 *
 *   - PRIOR.visible_text  = what Mike's last-sent doc looked like AFTER his
 *                           own tracked changes were applied
 *   - PRIOR.original_text = what Mike's last-sent doc looked like BEFORE
 *                           his own tracked changes
 *   - CURRENT.original_text = the inbound doc's baseline (with landlord's
 *                              tracked changes rejected)
 *
 *   Cases:
 *     a) CURRENT.original_text == PRIOR.original_text — landlord left Mike's
 *        prior tracked changes pending. Nothing silent.
 *     b) CURRENT.original_text == PRIOR.visible_text — landlord ACCEPTED ALL
 *        of Mike's prior tracked changes for this paragraph. Silent accept.
 *     c) Neither — partial acceptance or an untracked edit. Most suspicious.
 *
 * Output is a list of suspect paragraphs for the review-UI silent-acceptance
 * panel (per Q4).
 */

import type { ParsedDocx, ParsedParagraph } from './docx-parser.ts';

// ============================================================================
// TYPES
// ============================================================================

export type SilentAcceptanceKind =
  | 'fully_accepted'    // CURRENT.original == PRIOR.visible — landlord accepted all of Mike's tracked changes
  | 'partial_or_edited'; // Neither match — landlord made an untracked edit or partial accept

export interface SilentAcceptance {
  /** Paragraph index in the inbound document. */
  paragraph_index: number;
  kind: SilentAcceptanceKind;
  /** Mike's outgoing baseline text (pre-his-changes). */
  prior_original_text: string;
  /** Mike's outgoing visible text (post-his-changes). */
  prior_visible_text: string;
  /** Landlord's baseline text (pre-their-changes). */
  current_original_text: string;
  /** Optional human-readable diff snippet for the review UI. */
  summary: string;
}

export interface SilentAcceptanceReport {
  total_paragraphs_compared: number;
  total_silent: number;
  paragraph_count_mismatch: boolean;
  silent_acceptances: SilentAcceptance[];
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function detectSilentAcceptances(
  prior: ParsedDocx,
  current: ParsedDocx,
): SilentAcceptanceReport {
  const result: SilentAcceptance[] = [];
  const minLen = Math.min(prior.paragraphs.length, current.paragraphs.length);

  for (let i = 0; i < minLen; i++) {
    const p = prior.paragraphs[i];
    const c = current.paragraphs[i];

    // Skip empty paragraphs (whitespace-only) — they generate noise without
    // signal.
    if (!c.original_text.trim() && !p.visible_text.trim()) continue;

    const priorOriginal = normalize(p.original_text);
    const priorVisible = normalize(p.visible_text);
    const currentOriginal = normalize(c.original_text);

    // Case a — landlord left Mike's prior tracked changes pending. No silent
    // acceptance.
    if (currentOriginal === priorOriginal) continue;

    // Case b — landlord accepted ALL of Mike's prior tracked changes.
    if (currentOriginal === priorVisible) {
      result.push({
        paragraph_index: i,
        kind: 'fully_accepted',
        prior_original_text: p.original_text,
        prior_visible_text: p.visible_text,
        current_original_text: c.original_text,
        summary: `Landlord accepted all of your prior tracked changes for paragraph ${i + 1}.`,
      });
      continue;
    }

    // Case c — most suspicious. Either a partial accept or an untracked edit.
    // We can't fully disambiguate without word-level diffing (Week 3 polish);
    // for now we just flag and let the reviewer decide.
    result.push({
      paragraph_index: i,
      kind: 'partial_or_edited',
      prior_original_text: p.original_text,
      prior_visible_text: p.visible_text,
      current_original_text: c.original_text,
      summary: `Paragraph ${i + 1}: landlord baseline differs from both your prior baseline and your prior visible text. Possible untracked edit or partial acceptance.`,
    });
  }

  return {
    total_paragraphs_compared: minLen,
    total_silent: result.length,
    paragraph_count_mismatch: prior.paragraphs.length !== current.paragraphs.length,
    silent_acceptances: result,
  };
}

// ============================================================================
// INTERNAL
// ============================================================================

/**
 * Normalize for comparison: collapse whitespace, normalize smart quotes /
 * dashes. We deliberately preserve case because casing can be meaningful in
 * legal text (e.g., "AS-IS" vs "as is").
 */
function normalize(s: string): string {
  return s
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * NOTE: This algorithm does not yet handle paragraph-count mismatches
 * (landlord adds or removes a paragraph). For V1 we report a flag; Week 3
 * polish will pair paragraphs by content similarity rather than by index.
 */
export const _ALGORITHM_NOTES = 'paragraph-by-index v1; word-diff in Week 3';
