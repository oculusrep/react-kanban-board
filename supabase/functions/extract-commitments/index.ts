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
const BODY_CHARS = 1200;
const CHUNK = 200;
const CONCURRENCY = 4;
const DEADLINE_MS = 110_000;

const EXCLUDED_LABELS = ['OVIS/Personal', 'OVIS/Junk', 'OVIS/Reading', 'OVIS/Events'];
const EXCLUDED_SENDERS = ['onboarding@resend.dev'];
const CALENDAR_SUBJECT = /^\s*(accepted|declined|tentative|invitation|updated invitation)\s*:/i;

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

Return STRICT JSON, no prose, no markdown fence:
{"commitments":[{"existing_id":"<id or null>","ball":"them|me|neither",
"what":"<8 words max, concrete>","reason":"<ONE sentence to be read ALOUD to
${ownerName}, naming who and what, with NO time language>",
"counterparty_name":"<name or null>","counterparty_email":"<email or null>",
"promised_date":"<YYYY-MM-DD or null>","confidence":<0.0-1.0>}]}

Return {"commitments":[]} when nothing is owed. That is a common and correct
answer — most conversations hold nothing. Do not invent one.

reason examples (no time words anywhere):
  "The landlord on Dunwoody replied and you haven't answered."
  "You told Sarah you'd send the LOI redline and it hasn't gone out."
Never write "This email is about..." — speak about the obligation, not the mail.`;
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
  } catch { /* defaults */ }

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
    upsert_errors: 0,
    convos_zero: 0,
    stopped_on_budget: false,
    stopped_on_deadline: false,
    offset,
    next_offset: null as number | null,
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
    const SYSTEM = systemPrompt(ownerName, ownerEmail, todayEt);
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

    // ---- window pass: metadata only, plus the headers conversations need ----
    type Meta = {
      id: string; thread_id: string; message_id: string | null; in_reply_to: string | null;
      references_header: string | null; subject: string | null; sender_email: string | null; received_at: string;
    };
    const meta: Meta[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('emails')
        .select('id, thread_id, message_id, in_reply_to, references_header, subject, sender_email, received_at')
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
      const counterparties = [...new Set(list
        .map((r) => String(r.sender_email ?? '').toLowerCase())
        .filter((e) => e && e !== ownerEmail))];
      // "has this counterparty ever received mail from the owner, before this
      // conversation started?"
      const priorContact = counterparties.some((e) => {
        const t = firstSentTo.get(e);
        return t !== undefined && t < firstAt;
      });
      live.push({
        key: k, rows: list, threadIds, primaryTid: threadIds[0],
        lastAt: Math.max(...times), firstAt, hasOwnerSent, priorContact,
      });
    }

    const gated = live.filter((c) => {
      if (!c.hasOwnerSent && !c.priorContact) { stats.excluded.no_prior_contact_skipped++; return false; }
      return true;
    });
    gated.sort((a, b) => b.lastAt - a.lastAt);
    stats.eligible_conversations = gated.length;

    const batch = gated.slice(offset, offset + maxConvos);
    if (dryRun) {
      stats.next_offset = offset + batch.length < gated.length ? offset + batch.length : null;
      return new Response(JSON.stringify({ success: true, dry_run: true, model: MODEL, ...stats }, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- existing rows for THIS mailbox, keyed by thread_id for conversation lookup ----
    const existingByTid = new Map<string, { id: string; ball: string; status: string; what: string }[]>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('commitment').select('id, gmail_thread_id, ball, status, what')
        .eq('gmail_connection_id', cid).range(off, off + 999);
      if (error) throw new Error(`commitment page ${off}: ${error.message}`);
      for (const r of data ?? []) {
        const t = String(r.gmail_thread_id);
        if (!existingByTid.has(t)) existingByTid.set(t, []);
        existingByTid.get(t)!.push({ id: String(r.id), ball: String(r.ball), status: String(r.status), what: String(r.what ?? '') });
      }
      if ((data ?? []).length < 1000) break;
    }

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
        if (isCal && isOwner) {
          stats.owner_invites_kept++;
          const attendees = ((m.recipient_list ?? []) as any[])
            .map((x) => String(x?.email ?? '')).filter(Boolean).join(', ');
          return `--- sent ${sentDay} INVITATION SENT BY OWNER\nSubject: ${m.subject ?? ''}\nAttendees: ${attendees}`;
        }
        const body = String(m.body_text ?? '').replace(/\s+/g, ' ').trim().slice(0, BODY_CHARS);
        return `--- sent ${sentDay} from ${m.sender_name ?? ''} <${m.sender_email}>${who}\nSubject: ${m.subject ?? ''}\n${body}`;
      }).join('\n');

      // existing OPEN rows across every thread_id in this conversation
      const prior = c.threadIds.flatMap((t) => existingByTid.get(t) ?? []);
      const openPrior = prior.filter((p) => p.status === 'open');
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
      const doomed = openPrior.filter((p) => !claimed.has(p.id)).map((p) => p.id);
      if (doomed.length) {
        const { error: delErr } = await supabase
          .from('commitment').delete().in('id', doomed).eq('status', 'open');
        if (delErr) console.error(`[extract-commitments] replace ${c.primaryTid}: ${delErr.message}`);
        else stats.replaced_rows_deleted += doomed.length;
      }
    };

    for (const part of chunks(batch, CONCURRENCY)) {
      if (stop) break;
      await Promise.all(part.map(runOne));
      consumed += part.length;
    }

    const reached = offset + consumed;
    stats.next_offset = reached < gated.length && !stats.stopped_on_budget ? reached : null;

    return new Response(JSON.stringify({ success: true, model: MODEL, window_days: WINDOW_DAYS, max_usd: maxUsd, ...stats }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[extract-commitments]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), ...stats }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
