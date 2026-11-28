/**
 * "Paste signature" in ContactFormModal: a pasted signature block in, verified
 * contact fields out. Nothing is written — the form fills, the user saves.
 *
 * Same rules as Intel: the model proposes, verifyDetails() keeps only what is
 * literally in the pasted text, and dropOurOwnDetails() removes any Oculus
 * email/company or internal user's phone. The name gets the same literal test.
 *
 * Internal users only — enforced by the edge function's is_internal_user() gate
 * before this runs; intel_internal_contact_points() re-checks it in the database.
 * Docs: docs/CONTACT_PASTE_SIGNATURE_PLAN.md
 */
import { verifyDetails } from './proposal.ts';
import type { UnresolvedDetails } from './types.ts';
import { normalizeBody, ownText } from './emailText.ts';
import { type ContactPoint, dropOurOwnDetails, type RpcResult } from './emailLookup.ts';

export interface PasteDeps {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
  /** One model call: { signature_count, name, details } proposed from the text. */
  extract: (text: string) => Promise<unknown>;
}

export type PasteBody =
  | { result: 'parsed'; name?: string; details: UnresolvedDetails }
  | { result: 'multiple' }
  | { result: 'nothing_found' };

export interface PasteResponse {
  status: number;
  body: PasteBody | { error: string; detail?: string };
}

export const MAX_PASTE_CHARS = 8000;

/** Lowercased, whitespace-collapsed — how verifyDetails() compares text too. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The proposed name, only if it's literally in the paste (and looks like a name). */
export function verifyName(raw: unknown, text: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!name || /[@\d]/.test(name)) return undefined;
  return norm(text).includes(norm(name)) ? name : undefined;
}

/**
 * A paste that contains a reply header or forward marker is a thread, not one
 * signature — the same markers ownText() cuts at.
 */
export function looksLikeThread(text: string): boolean {
  return ownText(text).length < normalizeBody(text).trim().length;
}

export async function parsePastedSignature(deps: PasteDeps, body: Record<string, unknown>): Promise<PasteResponse> {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return { status: 400, body: { error: 'text is required' } };
  if (text.length > MAX_PASTE_CHARS) {
    return { status: 400, body: { error: 'too_long', detail: `Paste one signature (under ${MAX_PASTE_CHARS} characters).` } };
  }
  if (looksLikeThread(text)) return { status: 200, body: { result: 'multiple' } };

  const proposed = (await deps.extract(text)) as Record<string, unknown> | null;
  if (proposed && typeof proposed.signature_count === 'number' && proposed.signature_count > 1) {
    return { status: 200, body: { result: 'multiple' } };
  }

  const ours = await deps.rpc('intel_internal_contact_points');
  if (ours.error) {
    const status = ours.error.code === '42501' ? 403 : 500;
    return { status, body: { error: status === 403 ? 'forbidden' : 'parse_failed', detail: ours.error.message } };
  }

  const verified = verifyDetails(proposed?.details, text) ?? {};
  const details = dropOurOwnDetails(verified, (Array.isArray(ours.data) ? ours.data : []) as ContactPoint[]);
  const name = verifyName(proposed?.name, text);

  if (!name && Object.keys(details).length === 0) return { status: 200, body: { result: 'nothing_found' } };
  return { status: 200, body: { result: 'parsed', ...(name ? { name } : {}), details } };
}
