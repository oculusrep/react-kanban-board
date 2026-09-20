/**
 * Proposal parsing, normalisation and the correction diff. Pure functions, no
 * network and no Supabase client, so they're unit-tested in
 * knowledge_capture_test.ts.
 */
import { type CleanLink, isObjectType, type ProposedLink, type UnresolvedName, type VerifiedLink } from './types.ts';

export interface Proposal {
  clean_text: string;
  links: VerifiedLink[];
  tags: string[];
  is_general: boolean;
}

export interface ModelAnswer extends Proposal {
  reply: string;
  ready_to_file: boolean;
  /** Links the model proposed that don't exist; surfaced, never filed. */
  dropped_links: ProposedLink[];
  /** Names it couldn't find, which the panel offers to create. */
  unresolved: UnresolvedName[];
}

/**
 * Tags that describe the KIND of statement rather than its subject. The prompt
 * forbids these; this is the safety net for when the model slips. Matched only as
 * a whole tag (with a naive plural), so "construction costs" survives and a bare
 * "costs"-style type word doesn't — a compound tag is doing real work even when it
 * contains one of these words ("vendor quotes" stays, "quote" goes).
 */
const STATEMENT_TYPE_TAGS = new Set([
  'estimate', 'quote', 'note', 'update', 'info', 'information', 'detail', 'details',
  'data point', 'fyi', 'general', 'general info', 'misc', 'miscellaneous', 'comment',
  'remark', 'fact',
]);

/** Guard rails on what we'll store, independent of what the model or client sends. */
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 80;
const MAX_LINKS = 25;
const MAX_UNRESOLVED = 5;
const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 4000;

/**
 * Structured output means the body is JSON — but a refusal, a proxy error page or
 * a future model that wraps it in a code fence would all land here too, so the
 * fenced/embedded form is handled rather than throwing on it.
 */
export function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const candidates = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try the next shape
    }
  }
  throw new Error(`unparseable_model_response: ${trimmed.slice(0, 200)}`);
}

export function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    // Collapse whitespace and lowercase: tags are a retrieval key, and
    // "Construction Costs" and "construction costs" must not become two tags.
    const tag = item.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    // Describes the kind of statement, not its subject — see STATEMENT_TYPE_TAGS.
    if (STATEMENT_TYPE_TAGS.has(tag) || STATEMENT_TYPE_TAGS.has(tag.replace(/s$/, ''))) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Shape-checks links without touching the database (verifyLinks does that). */
export function cleanProposedLinks(raw: unknown): CleanLink[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CleanLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const link = item as Record<string, unknown>;
    const objectType = link.object_type;
    const objectId = typeof link.object_id === 'string' ? link.object_id.trim() : '';
    if (!isObjectType(objectType) || !objectId) continue;
    const key = `${objectType}:${objectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      object_type: objectType,
      object_id: objectId,
      object_name: typeof link.object_name === 'string' ? link.object_name : undefined,
    });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/**
 * Shape-check the names the model couldn't find. Anything already linked is
 * dropped: a name can't be both resolved and unresolved, and the model
 * occasionally reports both.
 */
export function cleanUnresolved(raw: unknown, linked: VerifiedLink[] = []): UnresolvedName[] {
  if (!Array.isArray(raw)) return [];
  const linkedNames = new Set(linked.map((l) => l.object_name.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: UnresolvedName[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const u = item as Record<string, unknown>;
    const name = typeof u.name === 'string' ? u.name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH) : '';
    if (!isObjectType(u.object_type) || !name) continue;
    const key = `${u.object_type}:${name.toLowerCase()}`;
    if (seen.has(key) || linkedNames.has(name.toLowerCase())) continue;
    seen.add(key);
    out.push({ object_type: u.object_type, name });
    if (out.length >= MAX_UNRESOLVED) break;
  }
  return out;
}

export function cleanText(raw: unknown, fallback = ''): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return (text || fallback).slice(0, MAX_TEXT_LENGTH);
}

/**
 * Canonical form for comparison: trimmed text, links and tags order-independent.
 * Reordering chips in the panel is not a correction.
 */
export function normalizeProposal(p: Proposal): string {
  return JSON.stringify({
    clean_text: p.clean_text.trim().replace(/\s+/g, ' '),
    is_general: !!p.is_general,
    // Link identity is (type, id). object_name is a display value that can change
    // in OVIS between the proposal and the file, which is not a correction.
    links: p.links
      .map((l) => `${l.object_type}:${l.object_id}`)
      .sort(),
    tags: [...p.tags].sort(),
  });
}

/**
 * Did the user change the model's proposal? Compared against the model's FIRST
 * proposal for this note, so a fix the user made by talking to it ("no, that's
 * the Hoschton deal") counts as a correction, not just chip edits. That's the
 * signal worth training on: the model's unaided first answer versus the truth.
 */
export function proposalsDiffer(proposed: Proposal, accepted: Proposal): boolean {
  return normalizeProposal(proposed) !== normalizeProposal(accepted);
}
