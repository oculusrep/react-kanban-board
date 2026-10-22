/**
 * "Look up in my email" — prefill Intel's Create contact form from the person's
 * signature in the CALLER'S OWN stored Gmail.
 *
 * Pure orchestration with its dependencies injected (database RPCs, the model
 * call), so the gate and the scan are covered by `deno test` without the npm
 * SDK. Docs: docs/INTEL_EMAIL_SIGNATURE_PREFILL_PLAN.md
 *
 * Access is enforced in the database, not here:
 *   - intel_email_lookup_allowed(): internal user AND listed in
 *     app_settings.intel_email_lookup_user_ids. False → 403.
 *   - intel_mailbox_senders / intel_mailbox_emails_from: re-check that gate
 *     (42501 → 403) and only ever read mail in the caller's own mailbox
 *     (email_visibility joined on auth.uid()). The emails RLS policy alone is
 *     NOT enough — it also exposes any CRM-linked email from another mailbox.
 */
import { verifyDetails } from './proposal.ts';
import type { UnresolvedDetails } from './types.ts';
import { hasSignature, ownText, signatureSource } from './emailText.ts';

export interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface LookupDeps {
  /** A database function called AS THE USER (auth.uid() must be the caller). */
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
  /** One model call: proposed contact details from the sender's own text. */
  extract: (text: string, sender: { name: string | null; email: string }) => Promise<unknown>;
}

export interface SenderCandidate {
  sender_email: string;
  sender_name: string | null;
  last_received_at: string;
  email_count: number;
}

interface StoredEmail {
  id: string;
  received_at: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  body_text: string | null;
}

export type LookupBody =
  | { result: 'found'; details: UnresolvedDetails; source: Omit<StoredEmail, 'body_text' | 'id'> & { email_id: string } }
  | { result: 'choose'; candidates: SenderCandidate[] }
  | { result: 'no_signature'; sender_email?: string }
  | { result: 'need_full_name' };

export interface LookupResponse {
  status: number;
  body: LookupBody | { error: string; detail?: string };
}

/** Emails fetched per page while looking for one whose own text has a signature. */
export const PAGE_SIZE = 25;
/** Most emails inspected per lookup. Older mail than this stays unread. */
export const MAX_SCANNED = 200;

const forbidden = (detail: string): LookupResponse => ({ status: 403, body: { error: 'forbidden', detail } });

function rpcFailure(err: { message: string; code?: string }): LookupResponse {
  // The mailbox functions raise 42501 when the gate says no — same answer as the
  // up-front check, in case they're ever called without it.
  if (err.code === '42501') return forbidden(err.message);
  return { status: 500, body: { error: 'lookup_failed', detail: err.message } };
}

/** An internal user's email or phone digits, from intel_internal_contact_points(). */
export interface ContactPoint {
  kind: 'email' | 'phone';
  value: string;
}

const OUR_DOMAIN = /@oculusrep\.com$/i;
const OUR_COMPANY = /\boculus\b/i;

export function dropOurOwnDetails(details: UnresolvedDetails, ours: ContactPoint[]): UnresolvedDetails {
  const emails = new Set(ours.filter((p) => p.kind === 'email').map((p) => p.value.toLowerCase()));
  const phones = ours.filter((p) => p.kind === 'phone').map((p) => p.value.replace(/\D/g, '')).filter((d) => d.length >= 7);
  const isOurPhone = (v: string) => {
    const d = v.replace(/\D/g, '');
    return phones.some((p) => d.endsWith(p) || p.endsWith(d));
  };

  const out: UnresolvedDetails = { ...details };
  if (out.email && (OUR_DOMAIN.test(out.email) || emails.has(out.email.toLowerCase()))) delete out.email;
  if (out.phone && isOurPhone(out.phone)) delete out.phone;
  if (out.mobile_phone && isOurPhone(out.mobile_phone)) delete out.mobile_phone;
  if (out.company && OUR_COMPANY.test(out.company)) delete out.company;
  return out;
}

/** Two tokens minimum: a first name alone matches half the inbox. */
export function hasFullName(name: string): boolean {
  return name.trim().split(/\s+/).filter((t) => /[a-z0-9]/i.test(t)).length >= 2;
}

export async function lookupEmailSignature(
  deps: LookupDeps,
  body: Record<string, unknown>,
): Promise<LookupResponse> {
  const allowed = await deps.rpc('intel_email_lookup_allowed');
  if (allowed.error) return rpcFailure(allowed.error);
  if (allowed.data !== true) return forbidden('email lookup is not enabled for this user');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const noteEmail = typeof body.email === 'string' ? body.email.trim() : '';
  let senderEmail = typeof body.sender_email === 'string' ? body.sender_email.trim().toLowerCase() : '';

  // Step 1 — which sender. Skipped when the user already picked one; the pick is
  // still only searched within their own mailbox, so a forged address finds nothing.
  if (!senderEmail) {
    if (!noteEmail && !hasFullName(name)) return { status: 200, body: { result: 'need_full_name' } };
    const res = await deps.rpc('intel_mailbox_senders', { p_name: name, p_email: noteEmail || null });
    if (res.error) return rpcFailure(res.error);
    const candidates = (Array.isArray(res.data) ? res.data : []) as SenderCandidate[];
    if (candidates.length === 0) return { status: 200, body: { result: 'no_signature' } };
    // Never auto-pick between two addresses: same-name strangers and one person's
    // work + personal address both land here.
    if (candidates.length > 1) return { status: 200, body: { result: 'choose', candidates } };
    senderEmail = candidates[0].sender_email.toLowerCase();
  }

  // Step 2 — newest email from that sender whose OWN text ends in a signature,
  // within the database's 12-month window.
  for (let offset = 0; offset < MAX_SCANNED; offset += PAGE_SIZE) {
    const res = await deps.rpc('intel_mailbox_emails_from', {
      p_sender_email: senderEmail,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (res.error) return rpcFailure(res.error);
    const emails = (Array.isArray(res.data) ? res.data : []) as StoredEmail[];

    for (const email of emails) {
      const own = ownText(email.body_text);
      if (!hasSignature(own)) continue;

      // The model proposes; the sender's own text decides — the same
      // verifyDetails() the paste flow uses, against the same text it was shown.
      const text = signatureSource(own);
      const proposed = await deps.extract(text, { name: email.sender_name, email: email.sender_email });
      const verified = verifyDetails(proposed, text) ?? {};

      // Last line of defence: automated mail (invoices, bookings, helpdesk
      // threads) prints OUR details as the customer's, with no quote marker to
      // strip. Never prefill an Oculus email, company, or an internal user's phone.
      const ours = await deps.rpc('intel_internal_contact_points');
      if (ours.error) return rpcFailure(ours.error);
      const details = dropOurOwnDetails(verified, (Array.isArray(ours.data) ? ours.data : []) as ContactPoint[]);
      return {
        status: 200,
        body: {
          result: 'found',
          details,
          source: {
            email_id: email.id,
            received_at: email.received_at,
            sender_email: email.sender_email,
            sender_name: email.sender_name,
            subject: email.subject,
          },
        },
      };
    }
    if (emails.length < PAGE_SIZE) break;
  }

  return { status: 200, body: { result: 'no_signature', sender_email: senderEmail } };
}
