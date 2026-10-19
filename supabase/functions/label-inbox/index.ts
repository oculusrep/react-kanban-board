/**
 * label-inbox — put an OVIS label on the mail sitting in the Gmail inbox.
 *
 * Gmail stays the client. OVIS decides what each message is, writes a label,
 * and (later, only once the labels are trusted) removes INBOX so triaged mail
 * leaves the inbox. This function is the labelling half; it never archives.
 *
 * WHY IT ENUMERATES FROM GMAIL, NOT THE DATABASE
 * email_visibility.folder_label is written once at ingest and never refreshed,
 * so 26,382 rows claim INBOX while the real inbox holds ~865. The database
 * cannot answer "what is in the inbox now". Gmail can. Enumerating from Gmail
 * also sidesteps the per-mailbox id defect behind the ~25% 404 rate on
 * email-triage's label applies: emails.gmail_id stores one id for a message that
 * may live in two mailboxes, whereas ids from messages.list are correct for the
 * mailbox they came from, by construction.
 *
 * DRY RUN IS THE DEFAULT. Nothing touches Gmail unless dry_run:false is passed.
 *
 * Every decision is recorded in email_label, including the ones that failed to
 * apply — see that migration for why (twice already, an outcome has existed only
 * in an HTTP response body that pg_cron throws away).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  GmailConnection,
  refreshAccessToken,
  isTokenExpired,
  applyLabelToMessage,
  removeLabelFromMessage,
  getOrCreateLabel,
} from '../_shared/gmail.ts';
import { authorizeCaller } from '../_shared/caller-auth.ts';
import { PERSONAL_SENDER_DOMAINS, PERSONAL_SENDER_ADDRESSES, matchesPersonalDomain } from '../_shared/tier1.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

/** Fresh namespace. OVIS-Linked is left alone as history — see the design note. */
/** How long a triaged message may sit bare in the inbox before the labeler is
 *  considered to be failing. Two hours: far longer than the ~4 min arrival->
 *  classified lag plus the 5 min cron, so it cannot fire on normal latency. */
const BARE_GRACE_HOURS = 2;

/**
 * How far back to reconcile mail the owner has already archived.
 *
 * The labeler enumerates the INBOX, so without this an archived message's
 * labels freeze at whatever OVIS thought when it left the inbox. The owner tags
 * and archives constantly, so every approved rule would leave a tail of
 * archived mail carrying the old label, unreachable forever.
 *
 * 30 days covers anything still worth browsing by label and bounds the churn:
 * reconciling all archived mail would rewrite ~900 messages nobody will open.
 * This runs on the normal 5-minute schedule, not only when a rule changes --
 * a rule approved at any point reaches the window on the next tick.
 */
const ARCHIVED_WINDOW_DAYS = 30;

const LABEL = {
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
} as const;

type LabelName = typeof LABEL[keyof typeof LABEL];

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
interface LabelRule { scope: 'address' | 'domain'; pattern: string; label: string }

function ruleFor(rules: LabelRule[], senderEmail: string | null): LabelRule | null {
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
 * Every live label for a connection, paginated.
 *
 * PostgREST caps an unpaginated select at 1000 rows no matter what .limit()
 * says. There are already 1586 live labels, so the unpaginated version of this
 * read silently saw ~63% of them -- and reported stale_found: 0 while two
 * messages sat double-labelled, because they were on page 2. Exactly the trap
 * CLAUDE.md warns about, and the same shape as every other silent-zero on this
 * project: the query was not wrong, it was truncated.
 */
async function allLiveLabels(
  supabase: any,
  connectionId: string,
): Promise<Array<{ id: string; gmail_id: string; label: string; email_id: string | null }>> {
  const PAGE = 1000;
  const out: Array<{ id: string; gmail_id: string; label: string; email_id: string | null }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('email_label')
      .select('id, gmail_id, label, email_id')
      .eq('gmail_connection_id', connectionId)
      .not('applied_at', 'is', null)
      .is('removed_at', null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`email_label page at ${offset}: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<{ id: string; gmail_id: string; label: string; email_id: string | null }>;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface Decision {
  gmailId: string;
  messageId: string | null;
  emailId: string | null;
  label: LabelName;
  sourceVerdict: string;
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
function decide(row: {
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

  // AN APPROVED RULE OUTRANKS EVERY HEURISTIC BELOW IT. The owner said this
  // explicitly, repeatedly, and approved it -- that beats any inference we
  // draw from headers, subjects or links. It sits below ladder B only because
  // privacy is not negotiable by rule.
  if (row.rule) {
    return {
      label: row.rule.label as LabelName,
      sourceVerdict: `rule:${row.rule.scope}:${row.rule.pattern}`,
    };
  }

  const isBulk = row.tier1_action === 'tier1_bulk';

  if (row.has_link) {
    return { label: LABEL.business, sourceVerdict: 'link:crm' };
  }

  if (LISTING_RE.test(row.subject ?? '')) {
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

/** Every inbox message id for one mailbox, following pageToken to the end. */
async function listInboxIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: 'in:inbox', maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) throw new Error(`messages.list failed (${res.status}): ${await res.text()}`);
    const body = await res.json() as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };
    for (const m of body.messages ?? []) ids.push(m.id);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return ids;
}

/**
 * Message-ID header for one Gmail message (format=metadata, 5 quota units).
 *
 * Used only for inbox messages whose gmail_id matches nothing in OVIS. That
 * lookup is the known per-mailbox id defect: emails stores ONE gmail_id per
 * message, so a message delivered to both mailboxes is filed under whichever
 * mailbox synced first, and the other copy looks unknown though it is ingested.
 * Matching on the RFC 5322 Message-ID resolves it, because that is mailbox
 * independent. Without this the "not in OVIS" count is a guess.
 */
async function fetchMessageIdHeader(accessToken: string, gmailId: string): Promise<string | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailId}?format=metadata&metadataHeaders=Message-ID`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const body = await res.json() as { payload?: { headers?: Array<{ name: string; value: string }> } };
  const h = (body.payload?.headers ?? []).find((x) => x.name.toLowerCase() === 'message-id');
  return h?.value ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Service or internal user. The response counts mail but echoes no subjects.
  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  const started = Date.now();
  let dryRun = true;
  let onlyMailbox: string | null = null;
  let onlyLabels: Set<string> | null = null;
  let resolveUnknown = false;
  let maxApplies = 250;
  let reconcile = false;
  let ensureLabelsOnly = false;
  try {
    const body = await req.json();
    // Writes require saying so. Anything else, including an empty body, is a dry run.
    dryRun = body?.dry_run !== false;
    onlyMailbox = body?.mailbox ?? null;
    // Write only these labels. Lets a label be held back while its source
    // verdicts are still being audited (Junk, whose model demotions have never
    // been reviewed) without holding back the rest.
    if (Array.isArray(body?.only_labels)) onlyLabels = new Set(body.only_labels);
    resolveUnknown = body?.resolve_unknown === true;
    // The edge runtime kills a request after 150s idle, and a Gmail modify takes
    // ~300ms, so a full inbox does not fit in one request. Runs are therefore
    // resumable: already-applied rows are skipped and each run does at most this
    // many applies. Re-invoke until remaining_to_apply is 0.
    if (typeof body?.max_applies === 'number') maxApplies = body.max_applies;
    // Reconcile: remove OVIS labels that no longer match the current decision.
    // Only labels email_label records as applied-and-not-removed are eligible,
    // so a hand-made label -- which has no row -- can never be a candidate.
    reconcile = body?.reconcile === true;
    // Create the OVIS labels in the mailbox and stop. Touches no message.
    ensureLabelsOnly = body?.ensure_labels === true;
  } catch {
    // no body — dry run
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const perMailbox: Record<string, unknown>[] = [];

  try {
    // Approved sender rules, loaded once per run. An empty list is the normal
    // starting state, not an error.
    const { data: ruleRows, error: ruleErr } = await supabase
      .from('email_label_rule').select('scope, pattern, label').eq('status', 'active');
    if (ruleErr) throw new Error(`label rules: ${ruleErr.message}`);
    const rules: LabelRule[] = (ruleRows ?? []).map((r) => ({
      scope: r.scope as 'address' | 'domain',
      pattern: String(r.pattern).toLowerCase(),
      label: String(r.label),
    }));

    let q = supabase.from('gmail_connection').select('*').eq('is_active', true);
    if (onlyMailbox) q = q.eq('google_email', onlyMailbox);
    const { data: connections, error } = await q;
    if (error) throw new Error(`connections: ${error.message}`);

    for (const connection of (connections ?? []) as GmailConnection[]) {
      let accessToken = connection.access_token;
      if (isTokenExpired(connection.token_expires_at)) {
        const t = await refreshAccessToken(connection.refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
        accessToken = t.access_token;
        await supabase.from('gmail_connection').update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', connection.id);
      }

      // ensure_labels: make every OVIS label exist so the owner can tag with it
      // before anything classifies into it. getOrCreateLabel is idempotent.
      if (ensureLabelsOnly) {
        const ensured: Record<string, string> = {};
        for (const name of Object.values(LABEL)) {
          ensured[name] = await getOrCreateLabel(accessToken, name);
        }
        perMailbox.push({ mailbox: connection.google_email, ensured_labels: ensured });
        continue;
      }

      const inboxIds = await listInboxIds(accessToken);

      // Threads that contain at least one message from a personal sender. Built
      // once per run: any message in such a thread is Personal, which is the
      // only way a reply from outside the personal domain -- the owner's own
      // sent mail included -- can be caught.
      const personalThreads = new Set<string>();
      const personalSenders = [...PERSONAL_SENDER_DOMAINS].flatMap((d) => [`%@${d}`, `%.${d}`]);
      for (const pattern of personalSenders) {
        const { data: rows } = await supabase
          .from('emails')
          .select('thread_id')
          .ilike('sender_email', pattern)
          .not('thread_id', 'is', null);
        for (const r of rows ?? []) personalThreads.add(r.thread_id as string);
      }
      for (const addr of PERSONAL_SENDER_ADDRESSES) {
        const { data: rows } = await supabase
          .from('emails').select('thread_id').ilike('sender_email', addr).not('thread_id', 'is', null);
        for (const r of rows ?? []) personalThreads.add(r.thread_id as string);
      }

      // Resolve what OVIS knows, in chunks (one .in() per 200 ids).
      const known = new Map<string, Decision>();
      let unknownToOvis = 0;
      let awaitingTriage = 0;
      for (let i = 0; i < inboxIds.length; i += 200) {
        const chunk = inboxIds.slice(i, i + 200);
        const { data: rows, error: rowErr } = await supabase
          .from('emails')
          .select('id, gmail_id, message_id, subject, sender_email, thread_id, is_relevant, classification_outcome, classification_status')
          .in('gmail_id', chunk);
        if (rowErr) throw new Error(`emails lookup: ${rowErr.message}`);

        const ids = (rows ?? []).map((r) => r.id);
        const msgIds = (rows ?? []).map((r) => r.message_id);

        const [{ data: links }, { data: stubs }] = await Promise.all([
          supabase.from('email_object_link').select('email_id').in('email_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
          supabase.from('email_tier1_stub').select('message_id, action, tier1_reason').in('message_id', msgIds.length ? msgIds : ['-']),
        ]);
        const linked = new Set((links ?? []).map((l) => l.email_id));
        const stubBy = new Map((stubs ?? []).map((s) => [s.message_id, s]));

        for (const r of rows ?? []) {
          const stub = stubBy.get(r.message_id);
          const verdict = decide({
            tier1_action: stub?.action ?? null,
            tier1_reason: stub?.tier1_reason ?? null,
            classification_status: r.classification_status,
            classification_outcome: r.classification_outcome,
            is_relevant: r.is_relevant,
            subject: r.subject,
            sender_email: r.sender_email,
            has_link: linked.has(r.id),
            personal_thread: r.thread_id ? personalThreads.has(r.thread_id) : false,
            rule: ruleFor(rules, r.sender_email),
          });
          if (!verdict) { awaitingTriage++; continue; }
          known.set(r.gmail_id, {
            gmailId: r.gmail_id,
            messageId: r.message_id,
            emailId: r.id,
            label: verdict.label,
            sourceVerdict: verdict.sourceVerdict,
          });
        }
      }

      // Second pass over the unresolved ids: ask Gmail for the Message-ID and
      // match on that. Costs one metadata call each, so it is opt-in.
      let recoveredByMessageId = 0;
      if (resolveUnknown) {
        const unresolved = inboxIds.filter((id) => !known.has(id));
        for (const gid of unresolved) {
          const mid = await fetchMessageIdHeader(accessToken, gid);
          if (!mid) continue;
          const { data: rows } = await supabase
            .from('emails')
            .select('id, gmail_id, message_id, subject, sender_email, thread_id, is_relevant, classification_outcome, classification_status')
            .eq('message_id', mid)
            .limit(1);
          const r = rows?.[0];
          if (!r) continue;

          const [{ data: links }, { data: stubs }] = await Promise.all([
            supabase.from('email_object_link').select('email_id').eq('email_id', r.id).limit(1),
            supabase.from('email_tier1_stub').select('action, tier1_reason').eq('message_id', r.message_id).limit(1),
          ]);
          const verdict2 = decide({
            tier1_action: stubs?.[0]?.action ?? null,
            tier1_reason: stubs?.[0]?.tier1_reason ?? null,
            classification_status: r.classification_status,
            classification_outcome: r.classification_outcome,
            is_relevant: r.is_relevant,
            subject: r.subject,
            sender_email: r.sender_email,
            has_link: (links ?? []).length > 0,
            personal_thread: r.thread_id ? personalThreads.has(r.thread_id) : false,
            rule: ruleFor(rules, r.sender_email),
          });
          if (!verdict2) { awaitingTriage++; continue; }
          // NB: keyed by THIS mailbox's gmail_id, which is the id a label must
          // be applied to here -- not r.gmail_id, which belongs to the mailbox
          // that ingested it first.
          known.set(gid, { gmailId: gid, messageId: r.message_id, emailId: r.id, label: verdict2.label, sourceVerdict: verdict2.sourceVerdict });
          recoveredByMessageId++;
        }
      }

      // Inbox messages OVIS has never ingested. They still get counted, and in a
      // write run they still get a row — silence about them is how a gap hides.
      const decisions: Decision[] = [];
      for (const gid of inboxIds) {
        const d = known.get(gid);
        if (d) {
          decisions.push(d);
        } else {
          // Never ingested, so triage cannot have run on it. Bare, by the same
          // rule as pending: Unsorted would be a claim nobody made.
          unknownToOvis++;
        }
      }

      const counts: Record<string, number> = {};
      const verdicts: Record<string, number> = {};
      for (const d of decisions) {
        counts[d.label] = (counts[d.label] ?? 0) + 1;
        verdicts[d.sourceVerdict] = (verdicts[d.sourceVerdict] ?? 0) + 1;
      }

      let applied = 0;
      let failed = 0;
      let alreadyApplied = 0;
      let remaining = 0;
      if (!dryRun) {
        // What this mailbox already has, so a resumed run does not re-call Gmail
        // for labels that landed. email_label is the record of truth here --
        // which is the point of having it.
        const done = new Set<string>();
        for (let i = 0; i < decisions.length; i += 500) {
          const chunk = decisions.slice(i, i + 500).map((d) => d.gmailId);
          const { data: prior } = await supabase
            .from('email_label')
            .select('gmail_id, label')
            .eq('gmail_connection_id', connection.id)
            .not('applied_at', 'is', null)
            .in('gmail_id', chunk);
          for (const row of prior ?? []) done.add(`${row.gmail_id}|${row.label}`);
        }

        for (const d of decisions) {
          if (onlyLabels && !onlyLabels.has(d.label)) continue;
          if (done.has(`${d.gmailId}|${d.label}`)) { alreadyApplied++; continue; }
          if (applied + failed >= maxApplies) { remaining++; continue; }

          // INTENT ROW FIRST, then the Gmail call. The label watcher attributes
          // a label change by looking for OVIS's own row; writing the row after
          // the call leaves a window in which Gmail knows about a label the
          // database does not, and an event observed in that window would be
          // credited to the owner as a correction. Writing first inverts the
          // race into a harmless one: a row with applied_at null, which is
          // already the shape of a failed apply.
          await supabase.from('email_label').upsert({
            email_id: d.emailId,
            gmail_id: d.gmailId,
            message_id: d.messageId,
            gmail_connection_id: connection.id,
            label: d.label,
            source_verdict: d.sourceVerdict,
            applied_at: null,
            apply_error: null,
            dry_run: false,
          }, { onConflict: 'gmail_id,gmail_connection_id,label' });

          const res = await applyLabelToMessage(accessToken, d.gmailId, d.label);
          if (res.success) applied++; else failed++;

          await supabase.from('email_label').update({
            applied_at: res.success ? new Date().toISOString() : null,
            apply_error: res.success ? null : (res.error ?? 'unknown'),
          }).eq('gmail_id', d.gmailId)
            .eq('gmail_connection_id', connection.id)
            .eq('label', d.label);
        }
      }

      // ----------------------------------------------------------------
      // RECONCILE. For each message, any label OVIS applied that is not the
      // label OVIS would apply now is stale and comes off. Scoped twice over:
      // the candidate set is read from email_label (so only OVIS's own writes
      // are touchable), and each removal is matched to a decision for that
      // exact message.
      // ----------------------------------------------------------------
      let staleFound = 0;
      let removed = 0;
      let removeFailed = 0;
      const staleExamples: Array<Record<string, unknown>> = [];
      if (reconcile) {
        const current = new Map(decisions.map((d) => [d.gmailId, d.label as string]));
        const live = await allLiveLabels(supabase, connection.id);

        for (const row of live) {
          const want = current.get(row.gmail_id);
          // Not in this run's enumeration (e.g. archived since) -> leave alone.
          if (!want) continue;
          if (row.label === want) continue;
          staleFound++;
          if (staleExamples.length < 10) {
            staleExamples.push({ gmail_id: row.gmail_id, remove: row.label, keep: want });
          }
          if (dryRun) continue;
          if (removed + removeFailed >= maxApplies) continue;
          const res = await removeLabelFromMessage(accessToken, row.gmail_id, row.label);
          if (res.success) {
            removed++;
            await supabase.from('email_label')
              .update({ removed_at: new Date().toISOString(), remove_error: null })
              .eq('id', row.id);
          } else {
            removeFailed++;
            await supabase.from('email_label')
              .update({ remove_error: res.error ?? 'unknown' })
              .eq('id', row.id);
          }
        }
      }

      // ----------------------------------------------------------------
      // HEALTH. Asks of GMAIL's inbox, not of folder_label, which is a
      // write-once snapshot that would answer a different question.
      // ----------------------------------------------------------------
      {
        const graceCutoff = Date.now() - BARE_GRACE_HOURS * 3600_000;
        const labelable = decisions.length;              // triage finished with these
        let labelled = 0;
        let bareStale = 0;

        if (labelable > 0) {
          const liveByGmailId = new Set<string>();
          for (let i = 0; i < decisions.length; i += 500) {
            const chunk = decisions.slice(i, i + 500).map((d) => d.gmailId);
            const { data: live } = await supabase
              .from('email_label').select('gmail_id')
              .eq('gmail_connection_id', connection.id)
              .not('applied_at', 'is', null).is('removed_at', null)
              .in('gmail_id', chunk);
            for (const row of live ?? []) liveByGmailId.add(row.gmail_id as string);
          }

          const ages = new Map<string, number>();
          for (let i = 0; i < decisions.length; i += 300) {
            const chunk = decisions.slice(i, i + 300).map((d) => d.gmailId);
            const { data: rows } = await supabase
              .from('emails').select('gmail_id, received_at').in('gmail_id', chunk);
            for (const r of rows ?? []) ages.set(r.gmail_id as string, new Date(r.received_at as string).getTime());
          }

          for (const d of decisions) {
            if (liveByGmailId.has(d.gmailId)) { labelled++; continue; }
            const received = ages.get(d.gmailId);
            // Unknown age counts as stale: an unmeasurable case must not pass.
            if (received === undefined || received < graceCutoff) bareStale++;
          }
        }

        // INCONCLUSIVE is not a pass. With nothing labellable, the check had no
        // way to fail, so it says so rather than reporting health it did not
        // observe.
        const verdict = labelable === 0
          ? 'inconclusive'
          : (bareStale > 0 ? 'unhealthy' : 'healthy');

        const detail = labelable === 0
          ? `nothing labellable in the inbox this run (${inboxIds.length} messages, ${awaitingTriage} awaiting triage) -- the check could not fail, so it did not pass`
          : `${labelled}/${labelable} labelled; ${bareStale} triaged and bare for over ${BARE_GRACE_HOURS}h; ${awaitingTriage} awaiting triage`;

        await supabase.from('email_labeler_health').insert({
          mailbox: connection.google_email,
          verdict,
          inbox_total: inboxIds.length,
          labelable_total: labelable,
          labelled,
          bare_stale: bareStale,
          awaiting_triage: awaitingTriage,
          detail,
        });

        const { data: openAlert } = await supabase
          .from('email_labeler_alert').select('id')
          .eq('mailbox', connection.google_email).is('resolved_at', null).limit(1);

        if (verdict === 'unhealthy' && !openAlert?.length) {
          await supabase.from('email_labeler_alert').insert({
            mailbox: connection.google_email,
            bare_stale: bareStale,
            labelable_total: labelable,
            detail,
          });
        } else if (verdict === 'healthy' && openAlert?.length) {
          // Only a positive result clears it. 'inconclusive' leaves it open.
          await supabase.from('email_labeler_alert')
            .update({ resolved_at: new Date().toISOString() })
            .eq('id', openAlert[0].id);
        }

        perMailbox.push({
          mailbox: connection.google_email,
          health: { verdict, labelable, labelled, bare_stale: bareStale, awaiting_triage: awaitingTriage },
        });
      }

      // ----------------------------------------------------------------
      // ARCHIVED WINDOW. Everything above only sees the inbox. This brings
      // already-archived mail from the last ARCHIVED_WINDOW_DAYS into line too,
      // so an approved rule reaches the tail the owner has archived rather than
      // stopping at the inbox boundary. Decisions here come from the DATABASE
      // (the message is not in the enumeration), which is sound because every
      // input decide() needs is stored: stub, links, status, sender, subject.
      // ----------------------------------------------------------------
      let windowRemoved = 0;
      let windowApplied = 0;
      let windowFailed = 0;
      if (reconcile && !dryRun) {
        const since = new Date(Date.now() - ARCHIVED_WINDOW_DAYS * 86400_000).toISOString();
        const inboxSet = new Set(inboxIds);

        const liveRows = await allLiveLabels(supabase, connection.id);

        // Only archived mail: the inbox was already handled, with Gmail-fresh ids.
        const archived = liveRows.filter((r) => !inboxSet.has(r.gmail_id));
        const byGmailId = new Map<string, { label: string; id: string }[]>();
        for (const r of archived) {
          const k = r.gmail_id as string;
          if (!byGmailId.has(k)) byGmailId.set(k, []);
          byGmailId.get(k)!.push({ label: r.label as string, id: r.id as string });
        }

        const ids = [...byGmailId.keys()];
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { data: rows } = await supabase
            .from('emails')
            .select('id, gmail_id, message_id, subject, sender_email, thread_id, is_relevant, classification_outcome, classification_status, received_at')
            .in('gmail_id', chunk)
            .gte('received_at', since);
          if (!rows?.length) continue;

          const rowIds = rows.map((r) => r.id);
          const msgIds = rows.map((r) => r.message_id);
          const [{ data: links }, { data: stubs }] = await Promise.all([
            supabase.from('email_object_link').select('email_id').in('email_id', rowIds),
            supabase.from('email_tier1_stub').select('message_id, action, tier1_reason').in('message_id', msgIds),
          ]);
          const linked = new Set((links ?? []).map((l) => l.email_id));
          const stubBy = new Map((stubs ?? []).map((st) => [st.message_id, st]));

          for (const r of rows) {
            const stub = stubBy.get(r.message_id);
            const want = decide({
              tier1_action: stub?.action ?? null,
              tier1_reason: stub?.tier1_reason ?? null,
              classification_status: r.classification_status,
              classification_outcome: r.classification_outcome,
              is_relevant: r.is_relevant,
              subject: r.subject,
              sender_email: r.sender_email,
              has_link: linked.has(r.id),
              personal_thread: r.thread_id ? personalThreads.has(r.thread_id) : false,
              rule: ruleFor(rules, r.sender_email),
            });
            if (!want) continue;  // triage unfinished: leave it alone

            const held = byGmailId.get(r.gmail_id as string) ?? [];

            // Take off anything that is not the current decision.
            for (const h of held) {
              if (h.label === want.label) continue;
              if (windowRemoved + windowFailed >= maxApplies) continue;
              const res = await removeLabelFromMessage(accessToken, r.gmail_id as string, h.label);
              if (res.success) {
                windowRemoved++;
                await supabase.from('email_label')
                  .update({ removed_at: new Date().toISOString(), remove_error: null })
                  .eq('id', h.id);
              } else {
                windowFailed++;
                await supabase.from('email_label')
                  .update({ remove_error: res.error ?? 'unknown' }).eq('id', h.id);
              }
            }

            // Put on the label it should have, if it is missing.
            if (!held.some((h) => h.label === want.label)) {
              if (windowApplied + windowFailed >= maxApplies) continue;
              await supabase.from('email_label').upsert({
                email_id: r.id,
                gmail_id: r.gmail_id,
                message_id: r.message_id,
                gmail_connection_id: connection.id,
                label: want.label,
                source_verdict: want.sourceVerdict,
                applied_at: null,
                apply_error: null,
                dry_run: false,
              }, { onConflict: 'gmail_id,gmail_connection_id,label' });
              const res = await applyLabelToMessage(accessToken, r.gmail_id as string, want.label);
              if (res.success) windowApplied++; else windowFailed++;
              await supabase.from('email_label').update({
                applied_at: res.success ? new Date().toISOString() : null,
                apply_error: res.success ? null : (res.error ?? 'unknown'),
              }).eq('gmail_id', r.gmail_id as string)
                .eq('gmail_connection_id', connection.id)
                .eq('label', want.label);
            }
          }
        }
      }

      perMailbox.push({
        mailbox: connection.google_email,
        inbox_total: inboxIds.length,
        known_to_ovis: inboxIds.length - unknownToOvis,
        not_in_ovis: unknownToOvis,
        awaiting_triage: awaitingTriage,
        recovered_by_message_id: recoveredByMessageId,
        labels: counts,
        source_verdicts: verdicts,
        applied,
        apply_failed: failed,
        already_applied: alreadyApplied,
        remaining_to_apply: remaining,
        stale_found: staleFound,
        removed,
        remove_failed: removeFailed,
        archived_window_removed: windowRemoved,
        archived_window_applied: windowApplied,
        archived_window_failed: windowFailed,
        stale_examples: staleExamples,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      duration_ms: Date.now() - started,
      mailboxes: perMailbox,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[label-inbox]', e?.message ?? e);
    return new Response(JSON.stringify({
      success: false,
      error: String(e?.message ?? e),
      mailboxes: perMailbox,
    }, null, 2), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
