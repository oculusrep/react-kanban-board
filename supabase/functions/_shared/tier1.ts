/**
 * Tier 1 — pre-insert classification.
 *
 * Runs inside gmail-sync AFTER parseGmailMessage and BEFORE the emails insert.
 * Content-blind by construction: it sees headers and the sender address, never
 * the body. Bulk and personal mail must never reach a model, and once enforcing
 * they never reach the database either.
 *
 * MODE
 * ----
 * Ships in LOG_ONLY. Every rule is evaluated and the verdict is recorded, but
 * nothing is filtered — the email inserts exactly as before. One week of that
 * produces per-rule counts against real traffic, which is the only honest way
 * to size rules whose evidence was destroyed by the previous delete-based
 * design (processed_message_ids kept no sender or headers, so the 2,534
 * deletions in the last 30 days cannot be analysed). Flip to ENFORCE after
 * reading the counts.
 *
 * WHY HEADERS BEFORE DOMAINS
 * --------------------------
 * The top unlinked sender domains split into two groups a domain rule cannot
 * separate: true bulk (connect.media, divenewsletter.com, linkedin.com) and
 * real counterparties who ALSO send blasts (srsrealestatepartners.com 59/30d,
 * goodmanrealestate.com 44, cbre.com 19, colliers.com 18). A domain rule on
 * cbre.com kills real deal correspondence. List-Unsubscribe separates them
 * correctly — the broker's own email lacks it, their marketing blast has it.
 * Domain rules (A5) are the fallback for senders who blast without the header.
 */

/**
 * 'log_only'  evaluate every rule, write the stub, INSERT ANYWAY. No mail is
 *             filtered. This is the shipping default -- one week of real
 *             traffic produces per-rule counts before anything stops being
 *             ingested.
 * 'enforce'   filtered mail is never inserted, never modelled, never fanned
 *             out to triage.
 *
 * Flip here, in one place, after reading the week's counts.
 */
export const TIER1_MODE: 'log_only' | 'enforce' = 'log_only';

export type Tier1Verdict = 'bulk' | 'personal' | 'pass';

export interface Tier1Result {
  verdict: Tier1Verdict;
  /** Rule id that fired, e.g. 'A1:list-unsubscribe'. null when verdict='pass'. */
  reason: string | null;
}

/** Headers tier 1 reads. All are already present in the Gmail payload —
 *  getMessage() requests format='full' — parseGmailMessage simply did not
 *  extract them. No extra API call, no extra quota. */
export interface Tier1Headers {
  listUnsubscribe?: string | null;
  listId?: string | null;
  precedence?: string | null;
  autoSubmitted?: string | null;
}

// ---------------------------------------------------------------------------
// A5 — bulk sender domains
//
// The 15 distinct domains from the existing agent_rules exclusion set. The
// table holds 24 rows but they are heavily duplicated: message.att-mail.com
// appears 9 times, icsc.com 3 times, hello.jll.com twice. All were priority
// 100, is_active true, and every one was a plain domain match_pattern, which
// is what makes them clean tier-1 candidates.
//
// Plus the newsletter/advertisement senders identified in the free-text
// corrections (spec section 2(b), the 50 feedback rows).
//
// NOT INCLUDED, deliberately — three free-text rules look tier-1 but are not:
//   "references to properties not in GA or SC should be ignored from this sender"
//   "This is advertising property in florida which should be ignored"
//   "This references properties in FL only which are not business related"
// Those are GEOGRAPHIC CONTENT filters — they require reading the body to know
// which state a property is in. Tier 1 is content-blind. They belong in the
// section 6 rule model. Killing lqcre.com here would drop 22 emails/30d
// including real ones.
// ---------------------------------------------------------------------------

const BULK_SENDER_DOMAINS = new Set<string>([
  // from agent_rules (deduped)
  'message.att-mail.com',
  'hello.jll.com',
  'shared1.ccsend.com',
  'campaigns.crexi.com',
  'highmeadows.org',
  'email.costar.com',
  'icsc.com',
  'massimo-group.com',
  'atlantaspeechschool.org',
  'hipescommercialbrokeragerealestate.ccsend.com',
  'mannpublications.ccsend.com',
  'connectedcommunity.org',
  'substack.com',
  // from the free-text corrections, tier-1 subset only
  'franchise.org',                 // "This is a newsletter and should be marked as not business related"
  'offmarket-deal-finder.com',     // "This is an advertisement. Ignore these"
]);

// ---------------------------------------------------------------------------
// B — personal senders and domains.
//
// Sender/header only. NEVER model-classified, never content-inspected. If an
// address is not on a list it is not classified personal — no inference.
//
// Seeded empty apart from an illustrative example: the real list comes from
// the section 7 harvest of the VA's `! [Personal]` Gmail label, which has
// months of decisions sitting in Gmail and nowhere in Supabase. Evidence this
// path is needed: on 2026-09-06 triage sent a TeamSnap youth-soccer
// notification to Gemini, which read it and judged it "not business relevant".
// Personal mail is being read by a model today.
//
// Applies to every connected account, not just Mike's.
// ---------------------------------------------------------------------------

const PERSONAL_SENDER_DOMAINS = new Set<string>([
  'email.teamsnap.com',
]);

const PERSONAL_SENDER_ADDRESSES = new Set<string>([]);

// ---------------------------------------------------------------------------

function domainOf(address: string): string {
  return (address.split('@')[1] || '').toLowerCase().trim();
}

/**
 * Classify a message from its headers and sender alone.
 *
 * Personal is evaluated FIRST: a personal message that also carries a
 * List-Unsubscribe header (a school newsletter, a sports-club digest) must be
 * recorded as personal, because the two verdicts write different stubs — the
 * personal stub deliberately carries no sender.
 */
export function classifyTier1(
  senderEmail: string,
  headers: Tier1Headers
): Tier1Result {
  const address = (senderEmail || '').toLowerCase().trim();
  const domain = domainOf(address);

  // --- Ladder B: personal -------------------------------------------------
  if (address && PERSONAL_SENDER_ADDRESSES.has(address)) {
    return { verdict: 'personal', reason: 'B2:personal-sender' };
  }
  if (domain && PERSONAL_SENDER_DOMAINS.has(domain)) {
    return { verdict: 'personal', reason: 'B1:personal-domain' };
  }

  // --- Ladder A: bulk -----------------------------------------------------
  if (headers.listUnsubscribe) {
    return { verdict: 'bulk', reason: 'A1:list-unsubscribe' };
  }
  if (headers.listId) {
    return { verdict: 'bulk', reason: 'A2:list-id' };
  }
  const precedence = (headers.precedence || '').toLowerCase().trim();
  if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') {
    return { verdict: 'bulk', reason: `A3:precedence-${precedence}` };
  }
  const autoSubmitted = (headers.autoSubmitted || '').toLowerCase().trim();
  if (autoSubmitted && autoSubmitted !== 'no') {
    return { verdict: 'bulk', reason: 'A4:auto-submitted' };
  }
  if (domain && BULK_SENDER_DOMAINS.has(domain)) {
    return { verdict: 'bulk', reason: 'A5:bulk-domain' };
  }

  return { verdict: 'pass', reason: null };
}

/**
 * Build the stub row for a tier-1 verdict.
 *
 * Personal carries message_id and action ONLY. The CHECK constraint
 * pmi_personal_stub_carries_no_sender enforces this at the database level too,
 * so a future bug here cannot quietly start logging personal correspondents.
 */
export function buildTier1Stub(args: {
  messageId: string;
  gmailConnectionId: string | null;
  senderEmail: string;
  result: Tier1Result;
}): Record<string, unknown> | null {
  if (args.result.verdict === 'pass') return null;

  const base = {
    message_id: args.messageId,
    gmail_connection_id: args.gmailConnectionId,
    processed_at: new Date().toISOString(),
  };

  if (args.result.verdict === 'personal') {
    return { ...base, action: 'tier1_personal' };
  }

  return {
    ...base,
    action: 'tier1_bulk',
    sender_email: args.senderEmail,
    tier1_reason: args.result.reason,
  };
}
