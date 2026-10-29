/**
 * extract-commitments — step 1 of the commitment layer: extraction only.
 *
 * THE UNIT OF WORK IS THE CONVERSATION, not emails.thread_id. 23% of the
 * owner's replies are stored under a different thread_id than the message they
 * reply to, which hid the completion on 3 of 12 rated rows. Conversations are
 * built at extraction time by union-find over Message-ID / In-Reply-To /
 * References, merged with thread_id. emails.thread_id is NEVER mutated.
 *
 * IDENTITY IS A ROW ID, NOT A DIRECTION. Each conversation's existing OPEN rows
 * go into the prompt with their ids; the model returns `existing_id` on any
 * commitment that continues one. Matched rows are updated by id, the rest are
 * inserted. The old unique key (thread, mailbox, ball) collapsed 46 of 300
 * extracted obligations into rows that already existed.
 *
 * ONE MAILBOX PER INVOCATION. The owner is named in the prompt and "mine" means
 * THIS connection's google_email alone -- with both connections in the owner
 * set, `ball` inverted on "they promised" threads.
 *
 * THE MODEL MAY NOT MENTION TIME. It has no reliable "now" and was wrong about
 * it on 21 of 209 rows. It returns a time-free `reason`; speakable_reason is
 * composed in code from that plus an age computed in Eastern Time.
 *
 * PRIOR CONTACT GATES 'me'. A conversation whose inbound counterparty has never
 * received mail from the owner is a pitch, not an obligation: 10 of 11 rated
 * cold-outreach rows had zero prior sends, and all 14 real rows had at least
 * two. No owner message AND no prior contact means no model call at all.
 *
 * CALENDAR: inbound notices ("Accepted:", "Declined:") are dropped per MESSAGE.
 * Owner-SENT invitations stay in as evidence -- subject, date and attendees, no
 * body -- because on 2 of 12 rated rows the sent invite IS the completion, and
 * the old blanket exclusion threw it away.
 *
 * NO UI, NO GMAIL WRITES, NO DEAL-BOARD WIRING. would_set_ball_in_court is
 * written and never acted on.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';
import { authorizeCaller } from '../_shared/caller-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const MODEL = 'claude-haiku-4-5';
/** Haiku 4.5: $1.00 per MTok input, $5.00 per MTok output. */
const USD_PER_INPUT_TOKEN = 1.00 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 5.00 / 1_000_000;

const WINDOW_DAYS = 14;
const MESSAGES_PER_CONVO = 6;
const BODY_CHARS = 1300;          // quoted context
const NEW_TEXT_CHARS = 700;       // this message's own new text, shown first
const CHUNK = 200;
const CONCURRENCY = 4;
const DEADLINE_MS = 110_000;

const EXCLUDED_LABELS = ['OVIS/Personal', 'OVIS/Junk', 'OVIS/Reading', 'OVIS/Events'];
const EXCLUDED_SENDERS = ['onboarding@resend.dev'];
const CALENDAR_SUBJECT = /^\s*(accepted|declined|tentative|invitation|updated invitation)\s*:/i;

/**
 * Notification relays. The sender address is a robot; the human is in the
 * display name as "Noree Corias (via Google Chat)". Gating on the relay address
 * retired a real commitment, because nobody has ever emailed chat-noreply.
 */
const RELAY_SENDER = /(^|[.-])(no-?reply|notifications?-noreply|messages-noreply|updates-noreply)@/i;
const VIA_SUFFIX = /\s*\((?:via|through)\s+[^)]*\)\s*$/i;
const INTERNAL_DOMAIN = '@oculusrep.com';

const TIME_WORDS_REPORTED = /\b(today|yesterday|ago|last week)\b/i;
const TIME_WORDS_RETRY = /\b(today|yesterday|tomorrow|ago|recently|this (week|morning|afternoon)|last (week|month|night)|next week|just now)\b/i;

const ET = 'America/New_York';
const etDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayDiff = (fromDay: string, toDay: string) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
const prettyDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const sameYear = String(y) === etDay(new Date()).slice(0, 4);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  }).format(dt);
};
const ageText = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
/**
 * These bodies are 10-20KB forwarded chains where the new text is a single line
 * and everything after it is quoted history. A flat 1200-char slice gave the
 * model a wall of quotes, so each message is rendered as its OWN new text first
 * and the quoted context second. The context is kept, not stripped: on the
 * Oakwood thread the fact that matters (the Tejal guaranty) is inside the quotes.
 */
const newTextOf = (raw: string): string => {
  let t = String(raw ?? '').replace(/\r/g, '');
  const cuts = [
    t.search(/^\s*On .{0,160}\bwrote:/m),
    t.search(/^\s*-{2,}\s*Original Message/mi),
    t.search(/^\s*\*?From:\*?\s/m),
    t.search(/^\s*>/m),
  ].filter((i) => i > 0);
  if (cuts.length) t = t.slice(0, Math.min(...cuts));
  return t.replace(/\s+/g, ' ').trim();
};

const msgIdTokens = (s: string | null) => (s ? (s.match(/<[^<>\s]+>/g) ?? []) : []);

function systemPrompt(ownerName: string, ownerEmail: string, todayEt: string): string {
  return `You read one email CONVERSATION and report the OBLIGATIONS it contains.

THE OWNER is ${ownerName} <${ownerEmail}>. Their messages are marked (OWNER).
"me" means ${ownerName} and no one else. Other people at the same company are
NOT the owner — if someone else writes, or if "${ownerName.split(' ')[0]}" is
mentioned in a body by a third party, that is not an owner message.

An obligation is something a specific person now owes someone else: a reply, a
document, a decision, a signature, a date. Pleasantries, newsletters,
notifications and FYI copies contain none.

ball:
  "them"    — someone owes ${ownerName} something. ${ownerName} is waiting.
  "me"      — ${ownerName} owes someone something. They are waiting on ${ownerName}.
  "neither" — no one owes anything (FYI, closed out, pleasantry).

Read the direction carefully. "X said he'd send the plan" means X owes it: ball
is "them". "I'll get you the plan" from (OWNER) means ball is "me". A question
PUT TO someone by (OWNER) is owed BY them, not by the owner.

WHO WAS ADDRESSED DECIDES WHOSE REQUEST IT IS. Every message lists To: and Cc:.
When a colleague (an @oculusrep.com address) addresses the owner directly in
To:, requests in that message belong to the owner. When the owner is only in
Cc:, requests belong to the To: recipients — a colleague running a thread the
owner is copied on owes it, not the owner.

LIST EVERY OBLIGATION IN THIS CONVERSATION SEPARATELY. One conversation can
hold several obligations for the same person. ALWAYS REPORT THE OWNER'S OWN
OBLIGATIONS EVEN IF ANOTHER PERSON'S ARE MORE PROMINENT — if the thread is
mostly about what someone else owes, the owner's own outstanding item still gets
its own entry.

Judge from the LAST messages. If the owner already answered what was asked, or
sent what was promised, the obligation is DISCHARGED — do not report it. A line
marked INVITATION SENT BY OWNER is proof the owner sent that invite.

NEVER MENTION TIME, DATES, OR HOW LONG AGO. No "today", "yesterday", "ago",
"last week", "recently", no weekday or month names, no durations. The age is
added afterwards by the system, which knows it exactly and you do not. Today's
date is ${todayEt} and each message is timestamped — use that ONLY to fill
promised_date.

If the conversation lists EXISTING OPEN COMMITMENTS, each one is something this
system already recorded. When a commitment you report is the SAME obligation as
one of those, put its id in "existing_id". Use null when it is a new obligation.
Do not report an existing commitment that the latest messages have discharged —
leave it out and it will be retired.

ANSWER THE OWNER QUESTION FIRST. Before listing anything, decide: what, if
anything, does ${ownerName} owe anyone here? Put it in "owner_owes" ("none" if
genuinely nothing). If "owner_owes" is not "none", there MUST be a commitment
with ball="me" that says it. A conversation where someone asks ${ownerName} for
an opinion, a document, a time or a decision, and ${ownerName} has not yet given
it, is ball="me" — the asker is not the one who owes.

Return STRICT JSON, no prose, no markdown fence:
{"owner_owes":"<what the owner owes, or none>",
 "commitments":[{"existing_id":"<id or null>","ball":"them|me|neither",
"what":"<8 words max, concrete>","reason":"<ONE sentence to be read ALOUD to
${ownerName}, naming who and what, with NO time language>",
"counterparty_name":"<name or null>","counterparty_email":"<email or null>",
"promised_date":"<YYYY-MM-DD or null>","confidence":<0.0-1.0>}]}

Return {"owner_owes":"none","commitments":[]} when nothing is owed. That is a common and correct
answer — most conversations hold nothing. Do not invent one.

reason examples (no time words anywhere):
  "The landlord on Dunwoody replied and you haven't answered."
  "You told Sarah you'd send the LOI redline and it hasn't gone out."
Never write "This email is about..." — speak about the obligation, not the mail.`;
}

/**
 * How many of each kind of example the prompt carries. Small and equal on
 * purpose.
 *
 * These are not symmetric evidence. A rejection is the owner saying "you were
 * wrong, this was never a commitment" -- unambiguous. A Handled row only says
 * the obligation was worth surfacing and is now dealt with; the owner may have
 * archived it while the "what" was half right. So positives teach WHICH KINDS
 * OF THING matter to this owner, and negatives teach what to stop reporting.
 *
 * The cap is also a bias control. There are 116 Handled rows and 0 rejections
 * today, so an uncapped block would be all-positive and would push the model
 * towards reporting more, which is the opposite of what it needs. Equal caps
 * keep one side from drowning the other as the counts drift.
 */
const LEARN_LIMIT = 15;

type Example = { what: string; reason_core: string | null; ball: string };

/**
 * The owner's own verdicts, rendered as prompt text. Returns '' when there is
 * nothing to show, so a fresh install adds no instructions it cannot support.
 */
function learningBlock(negatives: Example[], positives: Example[], ownerName: string): string {
  if (!negatives.length && !positives.length) return '';
  const line = (e: Example) => `  - [${e.ball}] ${e.what}${e.reason_core ? ` — ${e.reason_core}` : ''}`;
  const parts: string[] = [
    `WHAT ${ownerName.toUpperCase()} HAS ALREADY JUDGED. These are real verdicts on`,
    `this system's own past output. They are illustrations, NOT a quota: most`,
    `conversations still hold nothing, and matching the shape of an example is`,
    `not a reason to report one.`,
  ];
  if (negatives.length) {
    parts.push('', `REPORTED AND REJECTED — ${ownerName} said each of these was NOT a commitment.`,
      `Something of the same kind should not be reported again:`,
      ...negatives.map(line));
  }
  if (positives.length) {
    parts.push('', `REPORTED AND CONFIRMED — ${ownerName} acted on each of these, so an`,
      `obligation of this kind is worth reporting. This says the item mattered; it`,
      `does not mean the wording was right:`,
      ...positives.map(line));
  }
  return parts.join('\n');
}

interface Extracted {
  existing_id?: string | null;
  ball: 'them' | 'me' | 'neither';
  what: string;
  reason: string;
  counterparty_name?: string | null;
  counterparty_email?: string | null;
  promised_date?: string | null;
  confidence?: number;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Union-find over message rows, so a conversation survives a split thread_id. */
class DSU {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) { this.p.set(x, x); return x; }
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = x;
    while (this.p.get(c) !== c) { const n = this.p.get(c)!; this.p.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY_TRIAGE');
  if (!apiKey) {
    return new Response(JSON.stringify({
      success: false,
      error: 'ANTHROPIC_API_KEY_TRIAGE is not set',
      detail: 'extract-commitments reads ANTHROPIC_API_KEY_TRIAGE only and will not fall back to ANTHROPIC_API_KEY.',
    }, null, 2), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let dryRun = false, maxUsd = 10.0, offset = 0, maxConvos = 60, usdSpent = 0;
  let connectionEmail = '', connectionId = '';
  let mode: 'incremental' | 'full' = 'incremental';
  let runId = '', drain = true, dailyCap = 5.0;
  try {
    const b = await req.json();
    dryRun = b?.dry_run === true;
    if (typeof b?.max_usd === 'number') maxUsd = b.max_usd;
    if (typeof b?.offset === 'number') offset = b.offset;
    if (typeof b?.max_threads === 'number') maxConvos = b.max_threads;
    if (typeof b?.max_conversations === 'number') maxConvos = b.max_conversations;
    if (typeof b?.usd_spent === 'number') usdSpent = b.usd_spent;
    if (typeof b?.connection_email === 'string') connectionEmail = b.connection_email.toLowerCase();
    if (typeof b?.connection_id === 'string') connectionId = b.connection_id;
    if (b?.mode === 'full' || b?.mode === 'incremental') mode = b.mode;
    if (typeof b?.run_id === 'string') runId = b.run_id;
    if (b?.drain === false) drain = false;
    if (typeof b?.daily_cap === 'number') dailyCap = b.daily_cap;
  } catch { /* defaults */ }

  // Drain means "keep going until the work is done or the clock runs out",
  // which is what a Refresh button and an MCP call both need. The 110s deadline
  // still ends the invocation and hands back next_offset.
  if (drain) maxConvos = Math.max(maxConvos, 5000);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anthropic = new Anthropic({ apiKey });

  const stats = {
    owner: null as string | null,
    messages_for_mailbox: 0,
    conversations: 0,
    conversations_merging_threads: 0,
    merged_thread_ids: 0,
    excluded: {
      label_personal: 0, label_junk: 0, label_reading: 0, label_events: 0,
      tier1_stub: 0, ovis_alert: 0, no_usable_body: 0,
      no_prior_contact_skipped: 0,
    },
    inbound_calendar_messages_dropped: 0,
    owner_invites_kept: 0,
    me_suppressed_no_prior_contact: 0,
    eligible_conversations: 0,
    attempted: 0,
    model_calls: 0, model_errors: 0, parse_errors: 0,
    time_word_retries: 0, time_words_remaining: 0,
    input_tokens: 0, output_tokens: 0, usd_this_batch: 0, usd_run_total: usdSpent,
    inserted: 0, updated_by_existing_id: 0, bad_existing_id: 0,
    written: { them: 0, me: 0, neither: 0 },
    replaced_rows_deleted: 0,
    gated_rows_retired: 0,
    relay_humans_resolved: 0,
    rows_missed_once: 0,
    suppressed_by_rejection: 0,
    mode,
    run_id: null as string | null,
    since_ts: null as string | null,
    conversations_with_new_mail: 0,
    done: false,
    spent_today_usd: 0,
    daily_cap_usd: dailyCap,
    stopped_on_daily_cap: false,
    owner_owes_without_me_row: 0,
    upsert_errors: 0,
    convos_zero: 0,
    stopped_on_budget: false,
    stopped_on_deadline: false,
    offset,
    next_offset: null as number | null,
    learned_negatives: 0,
    learned_positives: 0,
  };

  try {
    const { data: conns } = await supabase
      .from('gmail_connection')
      .select('id, google_email, user:user_id (first_name, last_name, name)');
    const chosen = (conns ?? []).find((c: any) =>
      (connectionId && c.id === connectionId) ||
      (connectionEmail && String(c.google_email).toLowerCase() === connectionEmail));
    if (!chosen) {
      return new Response(JSON.stringify({
        success: false,
        error: 'connection_id or connection_email is required — extraction runs ONE mailbox per invocation',
        connections: (conns ?? []).map((c: any) => ({ id: c.id, google_email: c.google_email })),
      }, null, 2), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const cid = String((chosen as any).id);
    const ownerEmail = String((chosen as any).google_email).toLowerCase();
    const u = (chosen as any).user;
    const ownerName = (u?.name || [u?.first_name, u?.last_name].filter(Boolean).join(' ') || ownerEmail).trim();
    stats.owner = `${ownerName} <${ownerEmail}>`;

    const todayEt = etDay(new Date());

    // ---- LEARNING FROM THE OWNER'S VERDICTS. Read once per invocation and
    // appended to the system prompt, so every conversation in the batch sees
    // the same text. Scoped to THIS mailbox: one person's judgement is not
    // evidence about another's inbox. Ordered newest-first and capped, which
    // also keeps the prompt byte-identical across the batches of one run. ----
    const [{ data: negRows }, { data: posRows }] = await Promise.all([
      supabase.from('commitment_correction')
        .select('what, reason_core, ball, created_at')
        .eq('gmail_connection_id', cid)
        .eq('correction', 'not_a_commitment')
        .order('created_at', { ascending: false })
        .limit(LEARN_LIMIT * 3),
      supabase.from('commitment')
        .select('what, reason_core, ball, updated_at')
        .eq('gmail_connection_id', cid)
        .eq('status', 'handled')
        .eq('sync_state', 'synced')     // Gmail confirmed it: the owner really did act
        .order('updated_at', { ascending: false })
        .limit(LEARN_LIMIT * 3),
    ]);

    /** Newest-first, one per distinct `what`, capped. */
    const pick = (rows: any[] | null): Example[] => {
      const seen = new Set<string>();
      const out: Example[] = [];
      for (const r of rows ?? []) {
        const what = String(r.what ?? '').trim();
        if (!what) continue;
        const key = what.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ what, reason_core: r.reason_core ?? null, ball: String(r.ball ?? '') });
        if (out.length >= LEARN_LIMIT) break;
      }
      return out;
    };
    const negatives = pick(negRows), positives = pick(posRows);
    stats.learned_negatives = negatives.length;
    stats.learned_positives = positives.length;

    const SYSTEM = [
      systemPrompt(ownerName, ownerEmail, todayEt),
      learningBlock(negatives, positives, ownerName),
    ].filter(Boolean).join('\n\n');

    // ---- DAILY CAP. Counted over runs STARTED today in Eastern Time, across
    // both mailboxes and every mode, so a Refresh button cannot be clicked into
    // a large bill. The cap is on the day, not on the run. ----
    const etMidnightUtc = new Date(`${todayEt}T00:00:00-04:00`).toISOString();
    const { data: todayRuns } = await supabase
      .from('commitment_extraction_run').select('usd').gte('started_at', etMidnightUtc);
    const spentToday = (todayRuns ?? []).reduce((a, r) => a + Number(r.usd ?? 0), 0);
    stats.spent_today_usd = Math.round(spentToday * 10000) / 10000;
    const remainingToday = dailyCap - spentToday;
    if (remainingToday <= 0) {
      stats.stopped_on_daily_cap = true;
      return new Response(JSON.stringify({
        success: true, model: MODEL, ...stats,
        note: `daily cap reached: $${spentToday.toFixed(4)} of $${dailyCap} spent today (ET). No model calls made.`,
      }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // The run-wide cap and the day cap are both ceilings; take the lower.
    maxUsd = Math.min(maxUsd, usdSpent + remainingToday);

    // ---- INCREMENTAL WATERMARK. Only a run that FINISHED counts: a run that
    // died halfway must not advance it, or everything it never reached is
    // skipped forever. ----
    let sinceTs: string | null = null;
    if (mode === 'incremental') {
      const { data: lastRun } = await supabase
        .from('commitment_extraction_run')
        .select('completed_at')
        .eq('gmail_connection_id', cid)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1);
      const last = lastRun?.[0]?.completed_at;
      // 10 minutes of overlap, because a message that arrived mid-run may have
      // been read before it was ingested. Re-reading a conversation is cheap;
      // missing one is not.
      if (last) sinceTs = new Date(Date.parse(String(last)) - 10 * 60_000).toISOString();
    }
    stats.since_ts = sinceTs;
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

    // ---- window pass: metadata only, plus the headers conversations need ----
    type Meta = {
      id: string; thread_id: string; message_id: string | null; in_reply_to: string | null;
      references_header: string | null; subject: string | null; sender_email: string | null;
      sender_name: string | null; received_at: string;
    };
    const meta: Meta[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('emails')
        .select('id, thread_id, message_id, in_reply_to, references_header, subject, sender_email, sender_name, received_at')
        .gte('received_at', since)
        .not('thread_id', 'is', null)
        .order('received_at', { ascending: false })
        .range(off, off + 999);
      if (error) throw new Error(`emails page ${off}: ${error.message}`);
      meta.push(...(data ?? []) as any);
      if ((data ?? []).length < 1000) break;
    }

    const visible = new Set<string>();
    for (const part of chunks(meta.map((m) => m.id), CHUNK)) {
      const { data, error } = await supabase
        .from('email_visibility').select('email_id')
        .eq('gmail_connection_id', cid).in('email_id', part);
      if (error) throw new Error(`email_visibility chunk: ${error.message}`);
      for (const r of data ?? []) visible.add(String(r.email_id));
    }
    const rows = meta.filter((m) => visible.has(m.id));
    stats.messages_for_mailbox = rows.length;

    // ---- CONVERSATIONS: thread_id OR a Message-ID reference links two rows ----
    const dsu = new DSU();
    const firstOfThread = new Map<string, string>();
    const byMessageId = new Map<string, string>();
    for (const r of rows) {
      dsu.find(r.id);
      const t = String(r.thread_id);
      if (firstOfThread.has(t)) dsu.union(r.id, firstOfThread.get(t)!);
      else firstOfThread.set(t, r.id);
      if (r.message_id) byMessageId.set(r.message_id, r.id);
    }
    for (const r of rows) {
      for (const tok of [...msgIdTokens(r.in_reply_to), ...msgIdTokens(r.references_header)]) {
        const other = byMessageId.get(tok);
        if (other) dsu.union(r.id, other);
      }
      // in_reply_to is sometimes stored without angle brackets
      if (r.in_reply_to && byMessageId.has(r.in_reply_to)) dsu.union(r.id, byMessageId.get(r.in_reply_to)!);
    }

    const convos = new Map<string, Meta[]>();
    for (const r of rows) {
      const k = dsu.find(r.id);
      if (!convos.has(k)) convos.set(k, []);
      convos.get(k)!.push(r);
    }
    stats.conversations = convos.size;
    for (const list of convos.values()) {
      const tids = new Set(list.map((r) => String(r.thread_id)));
      if (tids.size > 1) { stats.conversations_merging_threads++; stats.merged_thread_ids += tids.size; }
    }

    // ---- bulk signals ----
    const threadOfEmail = new Map<string, string>();      // email id -> convo key
    for (const [k, list] of convos) for (const r of list) threadOfEmail.set(r.id, k);

    const excludedBy = new Map<string, string>();
    const mark = (k: string, reason: string) => { if (!excludedBy.has(k)) excludedBy.set(k, reason); };

    for (const [k, list] of convos) {
      if (list.some((r) => EXCLUDED_SENDERS.includes(String(r.sender_email ?? '').toLowerCase()))) mark(k, 'ovis_alert');
    }

    for (const part of chunks([...threadOfEmail.keys()], CHUNK)) {
      const { data, error } = await supabase
        .from('email_label').select('email_id, label')
        .in('email_id', part).in('label', EXCLUDED_LABELS)
        .not('applied_at', 'is', null).is('removed_at', null);
      if (error) throw new Error(`email_label chunk: ${error.message}`);
      for (const r of data ?? []) {
        const k = threadOfEmail.get(String(r.email_id));
        if (k) mark(k, String(r.label));
      }
    }

    // text/calendar parts, used per MESSAGE now -- never to exclude a conversation.
    const calendarMsgIds = new Set<string>();
    for (const part of chunks([...threadOfEmail.keys()], CHUNK)) {
      const { data, error } = await supabase
        .from('email_attachments').select('email_id')
        .in('email_id', part).ilike('mime_type', '%calendar%');
      if (error) throw new Error(`email_attachments chunk: ${error.message}`);
      for (const r of data ?? []) calendarMsgIds.add(String(r.email_id));
    }

    const stubIds = new Set<string>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('email_tier1_stub').select('message_id')
        .gte('created_at', new Date(Date.now() - (WINDOW_DAYS + 7) * 86400_000).toISOString())
        .range(off, off + 999);
      if (error) throw new Error(`email_tier1_stub page ${off}: ${error.message}`);
      for (const r of data ?? []) if (r.message_id) stubIds.add(String(r.message_id));
      if ((data ?? []).length < 1000) break;
    }
    for (const [k, list] of convos) {
      if (list.some((r) => r.message_id && stubIds.has(String(r.message_id)))) mark(k, 'tier1_stub');
    }

    // ---- PRIOR CONTACT: earliest message the owner ever sent to each address ----
    const firstSentTo = new Map<string, number>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('emails').select('received_at, recipient_list')
        .eq('sender_email', ownerEmail).range(off, off + 999);
      if (error) throw new Error(`owner sent page ${off}: ${error.message}`);
      for (const r of data ?? []) {
        const at = Date.parse(String(r.received_at));
        for (const x of (r.recipient_list ?? []) as any[]) {
          const em = String(x?.email ?? '').toLowerCase();
          if (!em) continue;
          const prev = firstSentTo.get(em);
          if (prev === undefined || at < prev) firstSentTo.set(em, at);
        }
      }
      if ((data ?? []).length < 1000) break;
    }

    // ---- WHO COUNTS AS A STRANGER. The gate is for external strangers only.
    // Anyone in the CRM, anyone internal, and any relay whose human we can
    // resolve is exempt -- the gate exists to kill cold pitches, and it already
    // cost one real commitment by treating a Google Chat relay as a stranger.
    const contactEmails = new Set<string>();
    const contactNames = new Set<string>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('contact').select('email, personal_email, first_name, last_name').range(off, off + 999);
      if (error) throw new Error(`contact page ${off}: ${error.message}`);
      for (const c of data ?? []) {
        for (const e of [c.email, c.personal_email]) {
          if (e) contactEmails.add(String(e).toLowerCase().trim());
        }
        const nm = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase().trim();
        if (nm) contactNames.add(nm);
      }
      if ((data ?? []).length < 1000) break;
    }
    const { data: internalUsers } = await supabase.from('user').select('name, first_name, last_name, email');
    const internalNames = new Set<string>();
    for (const u2 of internalUsers ?? []) {
      for (const nm of [u2.name, [u2.first_name, u2.last_name].filter(Boolean).join(' ')]) {
        if (nm) internalNames.add(String(nm).toLowerCase().trim());
      }
      if (u2.email) contactEmails.add(String(u2.email).toLowerCase());
    }

    for (const reason of excludedBy.values()) {
      if (reason === 'OVIS/Personal') stats.excluded.label_personal++;
      else if (reason === 'OVIS/Junk') stats.excluded.label_junk++;
      else if (reason === 'OVIS/Reading') stats.excluded.label_reading++;
      else if (reason === 'OVIS/Events') stats.excluded.label_events++;
      else if (reason === 'ovis_alert') stats.excluded.ovis_alert++;
      else stats.excluded.tier1_stub++;
    }

    // ---- per-conversation facts, then the prior-contact gate ----
    type Convo = {
      key: string; rows: Meta[]; threadIds: string[]; primaryTid: string;
      lastAt: number; firstAt: number; hasOwnerSent: boolean; priorContact: boolean;
    };
    const live: Convo[] = [];
    for (const [k, list] of convos) {
      if (excludedBy.has(k)) continue;
      const threadIds = [...new Set(list.map((r) => String(r.thread_id)))].sort();
      const times = list.map((r) => Date.parse(r.received_at));
      const firstAt = Math.min(...times);
      const hasOwnerSent = list.some((r) => String(r.sender_email ?? '').toLowerCase() === ownerEmail);
      const inbound = list.filter((r) => String(r.sender_email ?? '').toLowerCase() !== ownerEmail);
      const counterparties = [...new Set(inbound.map((r) => String(r.sender_email ?? '').toLowerCase()).filter(Boolean))];

      // A counterparty is KNOWN if any of these hold, and the gate only ever
      // fires when every counterparty is an unknown stranger.
      const known = (r: Meta): boolean => {
        const em = String(r.sender_email ?? '').toLowerCase();
        if (!em) return false;
        if (em.endsWith(INTERNAL_DOMAIN)) return true;                    // internal
        if (contactEmails.has(em)) return true;                           // in the CRM
        const t = firstSentTo.get(em);
        if (t !== undefined && t < firstAt) return true;                  // prior contact
        if (RELAY_SENDER.test(em)) {
          // Resolve the human behind the relay. Display name first -- "Noree
          // Corias (via Google Chat)" -- then any address quoted in the
          // subject, which is how Google Chat names the real sender:
          // "Noree Corias <noree@oculusrep.com> messaged you on Google Chat".
          const human = String(r.sender_name ?? '').replace(VIA_SUFFIX, '').toLowerCase().trim();
          if (human && (internalNames.has(human) || contactNames.has(human))) {
            stats.relay_humans_resolved++;
            return true;
          }
          for (const addr of String(r.subject ?? '').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []) {
            const a = addr.toLowerCase();
            if (a.endsWith(INTERNAL_DOMAIN) || contactEmails.has(a) || firstSentTo.has(a)) {
              stats.relay_humans_resolved++;
              return true;
            }
          }
        }
        return false;
      };
      const priorContact = inbound.length === 0 || inbound.some(known);
      live.push({
        key: k, rows: list, threadIds, primaryTid: threadIds[0],
        lastAt: Math.max(...times), firstAt, hasOwnerSent, priorContact,
      });
    }

    const skippedConvos: Convo[] = [];
    // INCREMENTAL SCOPE. The conversation is still built from the full 14-day
    // window -- the model needs the history to judge direction -- but only
    // conversations carrying a message newer than the watermark are extracted.
    // PARSE, DON'T STRING-COMPARE. PostgREST renders a timestamptz with a
    // "+00:00" offset while this cutoff is built with a "Z" suffix, so a
    // lexicographic compare of the two is only accidentally right and silently
    // wrong near a shared prefix.
    const sinceMs = sinceTs ? Date.parse(sinceTs) : null;
    const hasNewMail = (c: Convo) =>
      sinceMs === null || c.rows.some((r) => Date.parse(r.received_at) > sinceMs);

    const gated = live.filter((c) => {
      if (!c.hasOwnerSent && !c.priorContact) {
        stats.excluded.no_prior_contact_skipped++; skippedConvos.push(c); return false;
      }
      return true;
    });
    gated.sort((a, b) => b.lastAt - a.lastAt);
    stats.eligible_conversations = gated.length;

    const scoped = gated.filter(hasNewMail);
    stats.conversations_with_new_mail = scoped.length;

    const batch = scoped.slice(offset, offset + maxConvos);
    if (dryRun) {
      stats.next_offset = offset + batch.length < scoped.length ? offset + batch.length : null;
      return new Response(JSON.stringify({ success: true, dry_run: true, model: MODEL, ...stats }, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- existing rows for THIS mailbox, keyed by thread_id for conversation lookup ----
    const existingByTid = new Map<string, { id: string; ball: string; status: string; what: string; missed: number }[]>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('commitment').select('id, gmail_thread_id, ball, status, what, missed_runs')
        .eq('gmail_connection_id', cid).range(off, off + 999);
      if (error) throw new Error(`commitment page ${off}: ${error.message}`);
      for (const r of data ?? []) {
        const t = String(r.gmail_thread_id);
        if (!existingByTid.has(t)) existingByTid.set(t, []);
        existingByTid.get(t)!.push({
          id: String(r.id), ball: String(r.ball), status: String(r.status),
          what: String(r.what ?? ''), missed: Number(r.missed_runs ?? 0),
        });
      }
      if ((data ?? []).length < 1000) break;
    }

    /**
     * DELETION HYSTERESIS. One run's silence is model noise, not evidence: ~5%
     * of rows churn per run on borderline conversations, and two rows the owner
     * had confirmed open were deleted on a single run's judgement. A row must be
     * missed TWICE. Any run that returns it resets missed_runs to 0.
     */
    const retireOrBump = async (cands: { id: string; missed: number }[], gate: boolean) => {
      const del = cands.filter((c) => c.missed >= 1).map((c) => c.id);
      const bump = cands.filter((c) => c.missed < 1).map((c) => c.id);
      for (const part of chunks(del, 100)) {
        const { error } = await supabase.from('commitment').delete().in('id', part).eq('status', 'open');
        if (error) console.error(`[extract-commitments] retire: ${error.message}`);
        else if (gate) stats.gated_rows_retired += part.length;
        else stats.replaced_rows_deleted += part.length;
      }
      for (const part of chunks(bump, 100)) {
        const { error } = await supabase.from('commitment')
          .update({ missed_runs: 1 }).in('id', part).eq('status', 'open');
        if (error) console.error(`[extract-commitments] bump: ${error.message}`);
        else stats.rows_missed_once += part.length;
      }
    };

    // ---- RETIRE WHAT THE GATE DISQUALIFIES.
    // A conversation skipped before the model call used to keep its old rows
    // forever: the replacement rule only runs on conversations that ARE
    // extracted, so every pitch row written before the gate existed survived
    // untouched. Skipping the model is not the same as having no opinion --
    // the gate's opinion is "this is a pitch", and that has to reach the data.
    // Also drops open 'me' rows on conversations with no prior contact, which
    // is the same rule applied to a conversation that still gets extracted.
    // ONLY on the first batch of a run. The gate's candidate set is
    // mailbox-wide, so running it in every invocation would bump a row to 1 in
    // batch 1 and delete it in batch 2 -- two strikes inside ONE run, which is
    // exactly the hysteresis this is supposed to provide. A resumed run
    // (offset > 0) therefore does not re-apply the gate.
    // FULL MODE ONLY. The gate's candidate set is mailbox-wide, so running it on
    // every incremental refresh would spend both hysteresis strikes within a
    // single day and delete rows a run never even looked at.
    if (offset === 0 && mode === 'full') {
      const rowsFor = (c: Convo) => c.threadIds.flatMap((t) => existingByTid.get(t) ?? []);
      const cands = new Map<string, { id: string; missed: number }>();
      for (const c of skippedConvos) {
        for (const p of rowsFor(c)) if (p.status === 'open') cands.set(p.id, p);
      }
      for (const c of live) {
        if (c.priorContact) continue;
        for (const p of rowsFor(c)) if (p.status === 'open' && p.ball === 'me') cands.set(p.id, p);
      }
      // Gated conversations follow the SAME two-strike rule as everything else.
      await retireOrBump([...cands.values()], true);
    }

    // ---- RUN ROW. Created on the first batch, carried by run_id, and
    // completed_at is written ONLY when the run genuinely finishes. ----
    if (!runId) {
      const { data: created, error: runErr } = await supabase
        .from('commitment_extraction_run')
        .insert({
          gmail_connection_id: cid, mode, since_ts: sinceTs,
          conversations_in_scope: scoped.length,
        })
        .select('id')
        .maybeSingle();
      if (runErr) console.error(`[extract-commitments] run row: ${runErr.message}`);
      runId = String(created?.id ?? '');
    }
    stats.run_id = runId || null;

    let stop = false, consumed = 0;

    const askModel = async (userMsg: string, extra?: string) => {
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: extra ? `${SYSTEM}\n\n${extra}` : SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      });
      stats.model_calls++;
      stats.input_tokens += resp.usage?.input_tokens ?? 0;
      stats.output_tokens += resp.usage?.output_tokens ?? 0;
      stats.usd_this_batch = stats.input_tokens * USD_PER_INPUT_TOKEN + stats.output_tokens * USD_PER_OUTPUT_TOKEN;
      stats.usd_run_total = usdSpent + stats.usd_this_batch;
      const text = (resp.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      const s = text.indexOf('{'), e = text.lastIndexOf('}');
      if (s < 0 || e <= s) throw new Error('JSON: no object in response');
      return JSON.parse(text.slice(s, e + 1)) as { commitments?: Extracted[] };
    };

    const runOne = async (c: Convo) => {
      if (stop) return;
      if (stats.usd_run_total >= maxUsd) { stats.stopped_on_budget = true; stop = true; return; }
      if (Date.now() - startedAt > DEADLINE_MS) { stats.stopped_on_deadline = true; stop = true; return; }

      const ids = c.rows.map((r) => r.id);
      const { data: fetched, error } = await supabase
        .from('emails')
        .select('id, subject, sender_email, sender_name, body_text, received_at, recipient_list')
        .in('id', ids)
        .order('received_at', { ascending: false })
        .limit(MESSAGES_PER_CONVO * 3);
      if (error) { stats.model_errors++; return; }

      // Message-level calendar handling: inbound notices out, owner-sent
      // invitations kept as evidence (subject + date + attendees, no body).
      const usable = (fetched ?? []).filter((m) => {
        const isCal = CALENDAR_SUBJECT.test(String(m.subject ?? '')) || calendarMsgIds.has(String(m.id));
        const isOwner = String(m.sender_email ?? '').toLowerCase() === ownerEmail;
        if (isCal && !isOwner) { stats.inbound_calendar_messages_dropped++; return false; }
        return true;
      }).slice(0, MESSAGES_PER_CONVO).reverse();                 // oldest -> newest
      if (!usable.length) { stats.excluded.no_usable_body++; return; }

      const convoAgeDays = dayDiff(etDay(new Date(c.lastAt)), todayEt);

      const transcript = usable.map((m) => {
        const isOwner = String(m.sender_email ?? '').toLowerCase() === ownerEmail;
        const who = isOwner ? ' (OWNER)' : '';
        const sentDay = etDay(new Date(m.received_at));
        const isCal = CALENDAR_SUBJECT.test(String(m.subject ?? '')) || calendarMsgIds.has(String(m.id));
        const rcpt = (m.recipient_list ?? []) as any[];
        const addrs = (kind: string) => rcpt
          .filter((x) => String(x?.type ?? '').toLowerCase() === kind)
          .map((x) => String(x?.email ?? '').toLowerCase()).filter(Boolean);
        const toList = addrs('to'), ccList = addrs('cc');
        const ownerIn = (l: string[]) => (l.includes(ownerEmail) ? ' <-- THE OWNER' : '');
        const header = `To: ${toList.join(', ') || '(none)'}${ownerIn(toList)}\nCc: ${ccList.join(', ') || '(none)'}${ownerIn(ccList)}`;

        if (isCal && isOwner) {
          stats.owner_invites_kept++;
          return `--- sent ${sentDay} INVITATION SENT BY OWNER\nSubject: ${m.subject ?? ''}\nAttendees: ${rcpt.map((x) => String(x?.email ?? '')).filter(Boolean).join(', ')}`;
        }
        const raw = String(m.body_text ?? '');
        const newText = newTextOf(raw).slice(0, NEW_TEXT_CHARS);
        const body = (newText ? `[this message says] ${newText}\n[quoted context] ` : '')
          + raw.replace(/\s+/g, ' ').trim().slice(0, BODY_CHARS);
        // A relay message is written BY a human; showing the robot address made
        // the model mis-assign the direction ("Noree asked you..." came back as
        // ball=them). Name the human the resolver found.
        let fromLine = `${m.sender_name ?? ''} <${m.sender_email}>`;
        if (RELAY_SENDER.test(String(m.sender_email ?? '').toLowerCase())) {
          const human = String(m.sender_name ?? '').replace(VIA_SUFFIX, '').trim();
          const addr = (String(m.subject ?? '').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i) ?? [])[0] ?? '';
          if (human || addr) fromLine = `${human} <${addr || m.sender_email}> (sent via a notification relay)`;
        }
        return `--- sent ${sentDay} from ${fromLine}${who}\n${header}\nSubject: ${m.subject ?? ''}\n${body}`;
      }).join('\n');

      // existing OPEN rows across every thread_id in this conversation
      const prior = c.threadIds.flatMap((t) => existingByTid.get(t) ?? []);
      const openPrior = prior.filter((p) => p.status === 'open');
      // A REJECTION IS PERMANENT. The owner said this conversation holds no
      // such obligation; re-extracting it and inserting a fresh open row would
      // hand back the exact thing they dismissed. Matched by direction, since
      // that is what they were shown.
      const rejectedBalls = new Set(prior.filter((p) => p.status === 'rejected').map((p) => p.ball));
      const validIds = new Set(openPrior.map((p) => p.id));
      const existingBlock = openPrior.length
        ? `\n\nEXISTING OPEN COMMITMENTS for this conversation:\n` +
          openPrior.map((p) => `  id=${p.id} ball=${p.ball} what="${p.what}"`).join('\n')
        : '';

      stats.attempted++;
      const userMsg = `Conversation ${c.primaryTid} (${c.threadIds.length} gmail thread id(s)), last ${usable.length} messages (today is ${todayEt}):\n\n${transcript}${existingBlock}`;

      let found: Extracted[] = [];
      try {
        let parsed = await askModel(userMsg);
        let list = (parsed?.commitments ?? []).filter((x) => x && x.ball && x.what && x.reason);
        if (list.some((x) => TIME_WORDS_RETRY.test(x.reason))) {
          stats.time_word_retries++;
          parsed = await askModel(userMsg,
            'YOUR PREVIOUS ANSWER CONTAINED TIME LANGUAGE AND WAS REJECTED. Rewrite each "reason" with no time word of any kind. State only who owes what.');
          const retried = (parsed?.commitments ?? []).filter((x) => x && x.ball && x.what && x.reason);
          if (retried.length) list = retried;
        }
        const ownerOwes = String((parsed as any)?.owner_owes ?? 'none').trim().toLowerCase();
        if (ownerOwes && ownerOwes !== 'none' && !list.some((x) => x.ball === 'me')) {
          // The model said the owner owes something and then did not list it.
          stats.owner_owes_without_me_row++;
        }
        found = list;
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.startsWith('JSON')) stats.parse_errors++;
        else { stats.model_errors++; console.error(`[extract-commitments] ${c.primaryTid}: ${msg}`); }
        return;
      }

      // PRIOR-CONTACT GATE on direction: an address the owner has never written
      // to cannot be owed anything by the owner. It is a pitch.
      if (!c.priorContact) {
        const before = found.length;
        found = found.filter((x) => x.ball !== 'me');
        stats.me_suppressed_no_prior_contact += before - found.length;
      }

      if (!found.length) stats.convos_zero++;

      const claimed = new Set<string>();
      if (found.length) {
        const { data: links } = await supabase
          .from('email_object_link').select('object_id')
          .eq('object_type', 'deal').in('email_id', ids).limit(1);

        for (const x of found) {
          const ball = (['them', 'me', 'neither'] as const).includes(x.ball as any) ? x.ball : 'neither';
          if (rejectedBalls.has(ball)) { stats.suppressed_by_rejection++; continue; }
          const core = String(x.reason).trim().replace(/[.\s]+$/, '');
          if (TIME_WORDS_REPORTED.test(core)) stats.time_words_remaining++;

          const promised = x.promised_date && /^\d{4}-\d{2}-\d{2}$/.test(x.promised_date) ? x.promised_date : null;
          let speakable = `${core}, ${ageText(convoAgeDays)}.`;
          if (promised) {
            speakable += ball === 'me'
              ? ` You promised it by ${prettyDay(promised)}.`
              : ` They promised it by ${prettyDay(promised)}.`;
          }

          const payload: Record<string, unknown> = {
            source: 'email',
            gmail_thread_id: c.primaryTid,
            conversation_thread_ids: c.threadIds,
            gmail_connection_id: cid,
            ball,
            counterparty_name: x.counterparty_name ?? null,
            counterparty_email: x.counterparty_email ?? null,
            what: String(x.what).slice(0, 400),
            reason_core: core.slice(0, 600),
            speakable_reason: speakable.slice(0, 600),
            promised_date: promised,
            deal_id: links?.[0]?.object_id ?? null,
            would_set_ball_in_court: ball === 'them' ? 'counterparty' : ball === 'me' ? 'us' : null,
            model: MODEL,
            missed_runs: 0,                    // returned this run -> counter resets
            confidence: typeof x.confidence === 'number' ? Math.max(0, Math.min(1, x.confidence)) : null,
          };

          // IDENTITY BY ID. An unrecognised existing_id is a hallucination and
          // is treated as a new row, never as a blind write.
          const wanted = x.existing_id ? String(x.existing_id) : '';
          if (wanted && !validIds.has(wanted)) stats.bad_existing_id++;
          if (wanted && validIds.has(wanted) && !claimed.has(wanted)) {
            const { error: upErr } = await supabase.from('commitment').update(payload).eq('id', wanted).eq('status', 'open');
            if (upErr) { stats.upsert_errors++; console.error(`[extract-commitments] update ${wanted}: ${upErr.message}`); continue; }
            claimed.add(wanted);
            stats.updated_by_existing_id++;
          } else {
            const { error: insErr } = await supabase.from('commitment').insert(payload);
            if (insErr) { stats.upsert_errors++; console.error(`[extract-commitments] insert ${c.primaryTid}: ${insErr.message}`); continue; }
            stats.inserted++;
          }
          stats.written[ball]++;
        }
      }

      // REPLACEMENT: an open row this extraction no longer claims is retired.
      // handled / flagged / skipped are never deleted.
      const doomed = openPrior.filter((p) => !claimed.has(p.id));
      if (doomed.length) await retireOrBump(doomed, false);
    };

    for (const part of chunks(batch, CONCURRENCY)) {
      if (stop) break;
      await Promise.all(part.map(runOne));
      consumed += part.length;
    }

    const reached = offset + consumed;
    stats.next_offset = reached < scoped.length && !stats.stopped_on_budget ? reached : null;
    stats.done = stats.next_offset === null;

    if (runId) {
      // ACCUMULATE, never overwrite: a run spans several invocations and each
      // one only knows its own batch. Writing usd_this_batch straight in would
      // make a 5-batch run report the cost of its last batch, and the daily cap
      // reads this column.
      const { data: prior } = await supabase
        .from('commitment_extraction_run')
        .select('attempted, model_calls, inserted, updated, deleted, usd')
        .eq('id', runId).maybeSingle();
      const add = (k: string, v: number) => Number((prior as any)?.[k] ?? 0) + v;
      const patch: Record<string, unknown> = {
        attempted: add('attempted', stats.attempted),
        model_calls: add('model_calls', stats.model_calls),
        inserted: add('inserted', stats.inserted),
        updated: add('updated', stats.updated_by_existing_id),
        deleted: add('deleted', stats.replaced_rows_deleted + stats.gated_rows_retired),
        usd: Math.round(add('usd', stats.usd_this_batch) * 10000) / 10000,
        conversations_in_scope: scoped.length,
      };
      // Only a finished run becomes a watermark.
      if (stats.done) patch.completed_at = new Date().toISOString();
      const { error: finErr } = await supabase
        .from('commitment_extraction_run').update(patch).eq('id', runId);
      if (finErr) console.error(`[extract-commitments] finalise: ${finErr.message}`);
    }

    return new Response(JSON.stringify({ success: true, model: MODEL, window_days: WINDOW_DAYS, max_usd: maxUsd, ...stats }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[extract-commitments]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), ...stats }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
