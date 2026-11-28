/**
 * decide() — the label OVIS gives one message, shared by label-inbox and
 * property-email-filter (which re-routes not_listing mail older than
 * label-inbox's 30-day window). Moved here unchanged from label-inbox except
 * for the property_filter input; see docs/PROPERTY_EMAIL_INTAKE_SPEC.md 1.9.
 */
import { PERSONAL_SENDER_ADDRESSES, matchesPersonalDomain } from './tier1.ts';

export type PropertyFilterDecision =
  'not_listing' | 'out_of_state' | 'in_state' | 'unknown' | 'owner_restored';

export const LABEL = {
  personal: 'OVIS/Personal',
  junk: 'OVIS/Junk',
  property: 'OVIS/Property',
  events: 'OVIS/Events',
  business: 'OVIS/Business',
  /**
   * Trade press worth reading. NOTHING CLASSIFIES INTO THIS YET, by instruction:
   * the sender list is being built by hand in Gmail and learned from the
   * watcher's corrections. decide() must never return it -- the label exists so
   * the owner can tag with it, and so the watcher sees an OVIS/ label (a
   * correction) rather than a foreign one it would ignore.
   *
   * Precedence when a rule eventually exists:
   *   personal > business > property > events > reading > junk > unsorted
   */
  reading: 'OVIS/Reading',
  unsorted: 'OVIS/Unsorted',
  /** Out-of-state listings, moved here and archived by property-email-filter. */
  propertyOOS: 'OVIS/Property-OOS',
} as const;

export type LabelName = typeof LABEL[keyof typeof LABEL];

/** Listing vocabulary. Deliberately narrow: a false "property" costs more than
 *  an unsorted message, because unsorted is reviewable and mislabelled is not. */
/**
 * Event vocabulary. Broad on purpose: the owner's instruction is to
 * over-collect, because an industry invitation lost inside a 381-message Junk
 * folder is never seen, whereas a false positive in a small Events folder costs
 * one glance. Ranked below property, so a listing blast that also plugs an
 * event still routes as property.
 */
const EVENT_RE =
  /(save the date|you'?re invited|invitation|\brsvp\b|register (now|today|here)|registration|webinar|conference|summit|symposium|golf (tournament|outing)|networking|reception|happy hour|luncheon|\bgala\b|seminar|\bexpo\b|trade show|deal ?making|annual meeting|sponsorship|\btickets?\b|join us|workshop|\bmixer\b|open house|groundbreaking|ribbon cutting)/i;

const LISTING_RE =
  /(\bsf\b|square feet|for lease|for sale|ground lease|end ?cap|pad site|outparcel|\bacres?\b|drive.?thru|shopping cent|sublease|\bnnn\b|cap rate|just listed|just sold|available)/i;

/** An approved sender rule. Matching is exact for an address, and anchored
 *  (domain or subdomain) for a domain -- never substring. */
export interface LabelRule { scope: 'address' | 'domain'; pattern: string; label: string }

export function ruleFor(rules: LabelRule[], senderEmail: string | null): LabelRule | null {
  const sender = (senderEmail ?? '').toLowerCase().trim();
  if (!sender) return null;
  const dom = sender.split('@')[1] ?? '';
  for (const r of rules) {
    if (r.scope === 'address' && sender === r.pattern) return r;
    if (r.scope === 'domain' && (dom === r.pattern || dom.endsWith(`.${r.pattern}`))) return r;
  }
  return null;
}

/**
 * One message's label, from what OVIS already stored.
 *
 * Precedence is the whole design, so it is stated in one place:
 *   personal > business > property > junk > unsorted
 *
 * Personal outranks everything (it must never be stored or inspected further).
 *
 * Business outranks property by the owner's decision 2026-09-25, and the reason
 * is worth keeping: the brokers who send listing blasts ALSO send live deal
 * mail. Ranking property first would route a real deal email from a CRM-linked
 * sender as Property, and a missed response is the exact failure this project
 * exists to prevent. Ranking business first can only bury a blast among real
 * correspondence. Clutter is the cheaper mistake.
 *
 * Property outranks junk, and that ordering is load-bearing: the model demotes
 * marketing blasts as "not business related", which is the old requirement.
 * Under the new one a property blast is wanted, so a listing subject rescues it
 * from Junk. It does NOT require a tier-1 bulk stub — blasts sent without a
 * List-Unsubscribe header (verified: acadiarealty, excessspace, lee-associates)
 * carry no stub and would otherwise be labelled Junk.
 */
export function decide(row: {
  tier1_action: string | null;
  tier1_reason: string | null;
  classification_status: string | null;
  classification_outcome: string | null;
  is_relevant: boolean | null;
  subject: string | null;
  sender_email: string | null;
  has_link: boolean;
  personal_thread: boolean;
  rule: LabelRule | null;
  /** property_email_filter.decision for this message, or null. */
  property_filter?: PropertyFilterDecision | null;
}): { label: LabelName; sourceVerdict: string } | null {
  // NOT YET TRIAGED -> no label at all. This is what makes the three states
  // distinguishable in Gmail:
  //   bare           triage has not run yet
  //   OVIS/Unsorted  triage ran and found no signal
  //   any other      triage ran and categorised
  // Labelling a pending email Unsorted would assert "we looked and found
  // nothing" about mail nobody has looked at. 'abandoned' DOES get a label:
  // triage ran, gave up, and that is a finished state. 'failed' is still on
  // its retry backoff, so it stays bare.
  if (row.classification_status !== 'classified' && row.classification_status !== 'abandoned') {
    return null;
  }

  // Ladder B by sender identity, plus thread membership. The thread test is
  // what catches a reply IN a personal thread that is not itself from the
  // personal domain -- including the owner's own sent mail, whose sender is
  // oculusrep.com and which no sender-domain rule can ever match.
  const sender = (row.sender_email ?? '').toLowerCase().trim();
  const senderDomain = sender.split('@')[1] ?? '';
  if (PERSONAL_SENDER_ADDRESSES.has(sender) || matchesPersonalDomain(senderDomain)) {
    return { label: LABEL.personal, sourceVerdict: 'personal:sender_domain' };
  }
  if (row.personal_thread) {
    return { label: LABEL.personal, sourceVerdict: 'personal:thread' };
  }

  if (row.tier1_action === 'tier1_personal') {
    // No sender, no reason: the tier-1 stub carries none by CHECK constraint.
    return { label: LABEL.personal, sourceVerdict: 'tier1:personal' };
  }

  // PROPERTY STATE FILTER (docs/PROPERTY_EMAIL_INTAKE_SPEC.md 1.9.1). Directly
  // after the personal ladder. Out-of-state must be decided here, not left to
  // the filter: the 30-day archived-window pass re-decides archived mail and
  // would otherwise strip OOS and put Property back.
  const pf = row.property_filter ?? null;
  if (pf === 'out_of_state') {
    return { label: LABEL.propertyOOS, sourceVerdict: 'property_filter:out_of_state' };
  }
  if (pf === 'owner_restored') {
    // The owner undid the filter. Property, and nothing below fights them.
    return { label: LABEL.property, sourceVerdict: 'property_filter:owner_restored' };
  }
  const notListing = pf === 'not_listing';

  // AN APPROVED RULE OUTRANKS EVERY HEURISTIC BELOW IT. The owner said this
  // explicitly, repeatedly, and approved it -- that beats any inference we
  // draw from headers, subjects or links. It sits below ladder B only because
  // privacy is not negotiable by rule.
  // not_listing skips a Property rule (else the sender rule re-labels it);
  // rules for any other label still apply.
  if (row.rule && !(notListing && row.rule.label === LABEL.property)) {
    return {
      label: row.rule.label as LabelName,
      sourceVerdict: `rule:${row.rule.scope}:${row.rule.pattern}`,
    };
  }

  const isBulk = row.tier1_action === 'tier1_bulk';

  if (row.has_link) {
    return { label: LABEL.business, sourceVerdict: 'link:crm' };
  }

  if (!notListing && LISTING_RE.test(row.subject ?? '')) {
    return {
      label: LABEL.property,
      sourceVerdict: isBulk
        ? `tier1:${row.tier1_reason ?? 'bulk'}+listing_subject`
        : 'listing_subject',
    };
  }

  // LinkedIn's "invitation" is a connection request, never an event, and it is
  // 22% of what the event vocabulary catches. Carved out by sender, measured.
  const isLinkedIn = /(^|\.)linkedin\.com$/.test(senderDomain);
  if (!isLinkedIn && EVENT_RE.test(row.subject ?? '')) {
    return { label: LABEL.events, sourceVerdict: 'event_subject' };
  }

  if (row.classification_outcome === 'rule_exclusion') {
    return { label: LABEL.junk, sourceVerdict: 'classification:rule_exclusion' };
  }

  if (row.is_relevant === false) {
    return { label: LABEL.junk, sourceVerdict: 'classification:model_demoted' };
  }

  if (isBulk) {
    // Bulk by header, but nothing distinguishes a blast from a newsletter
    // without reading the body. Unsorted is the honest answer, not a guess.
    return { label: LABEL.unsorted, sourceVerdict: `tier1:${row.tier1_reason ?? 'bulk'}+undecidable` };
  }

  return { label: LABEL.unsorted, sourceVerdict: 'none' };
}
