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
} from '../_shared/gmail.ts';
import { authorizeCaller } from '../_shared/caller-auth.ts';
import { PERSONAL_SENDER_DOMAINS, PERSONAL_SENDER_ADDRESSES } from '../_shared/tier1.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

/** Fresh namespace. OVIS-Linked is left alone as history — see the design note. */
const LABEL = {
  personal: 'OVIS/Personal',
  junk: 'OVIS/Junk',
  property: 'OVIS/Property',
  events: 'OVIS/Events',
  business: 'OVIS/Business',
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
  classification_outcome: string | null;
  is_relevant: boolean | null;
  subject: string | null;
  sender_email: string | null;
  has_link: boolean;
  personal_thread: boolean;
}): { label: LabelName; sourceVerdict: string } {
  // Ladder B by sender identity, plus thread membership. The thread test is
  // what catches a reply IN a personal thread that is not itself from the
  // personal domain -- including the owner's own sent mail, whose sender is
  // oculusrep.com and which no sender-domain rule can ever match.
  const sender = (row.sender_email ?? '').toLowerCase().trim();
  const senderDomain = sender.split('@')[1] ?? '';
  if (PERSONAL_SENDER_ADDRESSES.has(sender) || PERSONAL_SENDER_DOMAINS.has(senderDomain)) {
    return { label: LABEL.personal, sourceVerdict: 'personal:sender_domain' };
  }
  if (row.personal_thread) {
    return { label: LABEL.personal, sourceVerdict: 'personal:thread' };
  }

  if (row.tier1_action === 'tier1_personal') {
    // No sender, no reason: the tier-1 stub carries none by CHECK constraint.
    return { label: LABEL.personal, sourceVerdict: 'tier1:personal' };
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

  if (EVENT_RE.test(row.subject ?? '')) {
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
  } catch {
    // no body — dry run
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const perMailbox: Record<string, unknown>[] = [];

  try {
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

      const inboxIds = await listInboxIds(accessToken);

      // Threads that contain at least one message from a personal sender. Built
      // once per run: any message in such a thread is Personal, which is the
      // only way a reply from outside the personal domain -- the owner's own
      // sent mail included -- can be caught.
      const personalThreads = new Set<string>();
      const personalSenders = [...PERSONAL_SENDER_DOMAINS].map((d) => `%@${d}`);
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
      for (let i = 0; i < inboxIds.length; i += 200) {
        const chunk = inboxIds.slice(i, i + 200);
        const { data: rows, error: rowErr } = await supabase
          .from('emails')
          .select('id, gmail_id, message_id, subject, sender_email, thread_id, is_relevant, classification_outcome')
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
          const { label, sourceVerdict } = decide({
            tier1_action: stub?.action ?? null,
            tier1_reason: stub?.tier1_reason ?? null,
            classification_outcome: r.classification_outcome,
            is_relevant: r.is_relevant,
            subject: r.subject,
            sender_email: r.sender_email,
            has_link: linked.has(r.id),
            personal_thread: r.thread_id ? personalThreads.has(r.thread_id) : false,
          });
          known.set(r.gmail_id, {
            gmailId: r.gmail_id,
            messageId: r.message_id,
            emailId: r.id,
            label,
            sourceVerdict,
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
            .select('id, gmail_id, message_id, subject, sender_email, thread_id, is_relevant, classification_outcome')
            .eq('message_id', mid)
            .limit(1);
          const r = rows?.[0];
          if (!r) continue;

          const [{ data: links }, { data: stubs }] = await Promise.all([
            supabase.from('email_object_link').select('email_id').eq('email_id', r.id).limit(1),
            supabase.from('email_tier1_stub').select('action, tier1_reason').eq('message_id', r.message_id).limit(1),
          ]);
          const { label, sourceVerdict } = decide({
            tier1_action: stubs?.[0]?.action ?? null,
            tier1_reason: stubs?.[0]?.tier1_reason ?? null,
            classification_outcome: r.classification_outcome,
            is_relevant: r.is_relevant,
            subject: r.subject,
            sender_email: r.sender_email,
            has_link: (links ?? []).length > 0,
            personal_thread: r.thread_id ? personalThreads.has(r.thread_id) : false,
          });
          // NB: keyed by THIS mailbox's gmail_id, which is the id a label must
          // be applied to here -- not r.gmail_id, which belongs to the mailbox
          // that ingested it first.
          known.set(gid, { gmailId: gid, messageId: r.message_id, emailId: r.id, label, sourceVerdict });
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
          unknownToOvis++;
          decisions.push({
            gmailId: gid,
            messageId: null,
            emailId: null,
            label: LABEL.unsorted,
            sourceVerdict: 'not_in_ovis',
          });
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
          // Unsorted is a bookkeeping state, not something to write to Gmail.
          if (d.label === LABEL.unsorted) continue;
          if (onlyLabels && !onlyLabels.has(d.label)) continue;
          if (done.has(`${d.gmailId}|${d.label}`)) { alreadyApplied++; continue; }
          if (applied + failed >= maxApplies) { remaining++; continue; }
          const res = await applyLabelToMessage(accessToken, d.gmailId, d.label);
          if (res.success) applied++; else failed++;
          await supabase.from('email_label').upsert({
            email_id: d.emailId,
            gmail_id: d.gmailId,
            message_id: d.messageId,
            gmail_connection_id: connection.id,
            label: d.label,
            source_verdict: d.sourceVerdict,
            applied_at: res.success ? new Date().toISOString() : null,
            apply_error: res.success ? null : (res.error ?? 'unknown'),
            dry_run: false,
          }, { onConflict: 'gmail_id,gmail_connection_id,label' });
        }
      }

      perMailbox.push({
        mailbox: connection.google_email,
        inbox_total: inboxIds.length,
        known_to_ovis: inboxIds.length - unknownToOvis,
        not_in_ovis: unknownToOvis,
        recovered_by_message_id: recoveredByMessageId,
        labels: counts,
        source_verdicts: verdicts,
        applied,
        apply_failed: failed,
        already_applied: alreadyApplied,
        remaining_to_apply: remaining,
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
