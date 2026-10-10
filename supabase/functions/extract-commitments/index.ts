/**
 * extract-commitments — step 1 of the commitment layer: extraction only.
 *
 * THE UNIT OF WORK IS THE THREAD, not the email. A commitment's state depends
 * on the LATEST messages, including the owner's own replies: "I'll send the
 * redline Thursday" flips the ball, and a per-email pass would keep
 * resurrecting obligations the next message already discharged.
 *
 * ONE MAILBOX PER INVOCATION. The first run put BOTH connections in the owner
 * set, so an asantos@ message was marked (OWNER) inside mike@'s thread and
 * `ball` inverted on "they promised" threads. The owner is now named in the
 * prompt and "mine" means THIS connection's google_email and nothing else.
 *
 * THE MODEL IS NOT ALLOWED TO TALK ABOUT TIME. It has no reliable "now", and
 * its relative phrasing was wrong on 21 of 209 rows in the first run ("asked
 * you three days ago" on a 12-day-old thread). It returns a time-free `reason`;
 * speakable_reason is COMPOSED IN CODE from that plus an age computed from the
 * thread's last message and a promised date rendered from promised_date.
 * Timestamps still go INTO the prompt, so promised_date can be extracted.
 *
 * NO UI, NO GMAIL WRITES, NO DEAL-BOARD WIRING. deal_id comes from existing
 * email_object_link rows; no new matching is attempted. would_set_ball_in_court
 * is written and never acted on -- though see the migration's note on what
 * "shadow" does not cover.
 *
 * SHAPED BY THE WORKER LIMIT, not by taste: v1 selected body_text for every
 * message in the window and ran two queries per thread, and the worker was
 * killed with WORKER_RESOURCE_LIMIT. The window pass reads METADATA ONLY,
 * exclusions resolve in BULK, and bodies are fetched one eligible thread at a
 * time. Runs are resumable (`offset` -> `next_offset`).
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
const MESSAGES_PER_THREAD = 6;
const BODY_CHARS = 1200;
const CHUNK = 200;                 // id-list size for bulk lookups
const CONCURRENCY = 4;
const DEADLINE_MS = 110_000;

/** Labels that take a thread out of scope BEFORE any model call. */
const EXCLUDED_LABELS = ['OVIS/Personal', 'OVIS/Junk', 'OVIS/Reading', 'OVIS/Events'];
/** OVIS's own alert mail. It is machinery talking to itself, not an obligation. */
const EXCLUDED_SENDERS = ['onboarding@resend.dev'];
/** Calendar notices: Google's own disposition mail, not a commitment. */
const CALENDAR_SUBJECT = /^\s*(accepted|declined|tentative|invitation|updated invitation)\s*:/i;

/** What counts as time language. The reported metric uses the owner's four. */
const TIME_WORDS_REPORTED = /\b(today|yesterday|ago|last week)\b/i;
/** Wider net, used only to decide whether to ask the model again. */
const TIME_WORDS_RETRY = /\b(today|yesterday|tomorrow|ago|recently|this (week|morning|afternoon)|last (week|month|night)|next week|just now)\b/i;

const ET = 'America/New_York';
/** CLAUDE.md: Eastern Time for every date operation. YYYY-MM-DD, ET. */
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

function systemPrompt(ownerName: string, ownerEmail: string, todayEt: string): string {
  return `You read one email thread and report the OBLIGATIONS it contains.

THE OWNER is ${ownerName} <${ownerEmail}>. Their messages are marked (OWNER).
"me" means ${ownerName} and no one else. Other people at the same company are
NOT the owner — if someone else writes, or if "${ownerName.split(' ')[0]}" is
mentioned in a message body by a third party, that is not an owner message.

An obligation is something a specific person now owes someone else: a reply, a
document, a decision, a signature, a date. Pleasantries, newsletters,
notifications and FYI copies contain none.

ball:
  "them"    — someone owes ${ownerName} something. ${ownerName} is waiting.
  "me"      — ${ownerName} owes someone something. They are waiting on ${ownerName}.
  "neither" — no one owes anything (FYI, closed out, pleasantry).

Read the direction carefully. "X said he'd send the plan" means X owes it:
ball is "them". "I'll get you the plan" from (OWNER) means ball is "me".

Judge from the LAST messages. If the owner already answered what was asked, the
obligation is discharged — do not report it.

NEVER MENTION TIME, DATES, OR HOW LONG AGO. No "today", "yesterday", "ago",
"last week", "recently", no weekday or month names, no durations. The age is
added afterwards by the system, which knows it exactly and you do not. A time
word in your output is an error. Today's date is ${todayEt} and each message
below is timestamped — use that ONLY to fill promised_date.

Return STRICT JSON, no prose, no markdown fence:
{"commitments":[{"ball":"them|me|neither","what":"<8 words max, concrete>",
"reason":"<ONE sentence to be read ALOUD to ${ownerName}, naming who and what,
with NO time language>","counterparty_name":"<name or null>",
"counterparty_email":"<email or null>","promised_date":"<YYYY-MM-DD or null>",
"confidence":<0.0-1.0>}]}

Return {"commitments":[]} when the thread holds no obligation. That is a common
and correct answer — most threads hold none. Do not invent one.

reason examples (note: no time words anywhere):
  "The landlord on Dunwoody replied and you haven't answered."
  "You told Sarah you'd send the LOI redline and it hasn't gone out."
Never write "This email is about..." — speak about the obligation, not the mail.`;
}

interface Extracted {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  // DEDICATED KEY ONLY. Never fall back to ANTHROPIC_API_KEY: triage spend has
  // to be attributable, and a silent fallback would bill the wrong key while
  // looking like it worked.
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY_TRIAGE');
  if (!apiKey) {
    return new Response(JSON.stringify({
      success: false,
      error: 'ANTHROPIC_API_KEY_TRIAGE is not set',
      detail: 'extract-commitments reads ANTHROPIC_API_KEY_TRIAGE only and will not fall back to ANTHROPIC_API_KEY. Set it with: supabase secrets set ANTHROPIC_API_KEY_TRIAGE=<value> --project-ref rqbvcvwbziilnycqtmnc',
    }, null, 2), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let dryRun = false, maxUsd = 10.0, offset = 0, maxThreads = 60, usdSpent = 0;
  let connectionEmail = '', connectionId = '';
  try {
    const b = await req.json();
    dryRun = b?.dry_run === true;
    if (typeof b?.max_usd === 'number') maxUsd = b.max_usd;
    if (typeof b?.offset === 'number') offset = b.offset;
    if (typeof b?.max_threads === 'number') maxThreads = b.max_threads;
    if (typeof b?.usd_spent === 'number') usdSpent = b.usd_spent;       // run-wide cap
    if (typeof b?.connection_email === 'string') connectionEmail = b.connection_email.toLowerCase();
    if (typeof b?.connection_id === 'string') connectionId = b.connection_id;
  } catch { /* defaults */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anthropic = new Anthropic({ apiKey });

  const stats = {
    owner: null as string | null,
    excluded: {
      label_personal: 0, label_junk: 0, label_reading: 0, label_events: 0,
      tier1_stub: 0, ovis_alert: 0, calendar_notice: 0, no_usable_body: 0,
    },
    threads_for_mailbox: 0,
    eligible_threads: 0,
    threads_attempted: 0,
    model_calls: 0, model_errors: 0, parse_errors: 0,
    time_word_retries: 0, time_words_remaining: 0,
    input_tokens: 0, output_tokens: 0, usd_this_batch: 0, usd_run_total: usdSpent,
    written: { them: 0, me: 0, neither: 0 },
    replaced_rows_deleted: 0,
    upsert_errors: 0,
    threads_zero: 0,
    stopped_on_budget: false,
    stopped_on_deadline: false,
    offset,
    next_offset: null as number | null,
    zero_samples: [] as Record<string, unknown>[],
  };

  try {
    // ---- one mailbox per invocation ----
    const { data: conns } = await supabase
      .from('gmail_connection')
      .select('id, google_email, user:user_id (first_name, last_name, name)');
    const chosen = (conns ?? []).find((c: any) =>
      (connectionId && c.id === connectionId) ||
      (connectionEmail && String(c.google_email).toLowerCase() === connectionEmail));
    if (!chosen) {
      return new Response(JSON.stringify({
        success: false,
        error: 'connection_id or connection_email is required — extraction runs ONE mailbox per invocation so the owner can be named in the prompt',
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

    // ---- window pass: METADATA ONLY (no body_text; that is what killed v1) ----
    type Meta = { id: string; thread_id: string; message_id: string | null; subject: string | null; sender_email: string | null; received_at: string };
    const meta: Meta[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('emails')
        .select('id, thread_id, message_id, subject, sender_email, received_at')
        .gte('received_at', since)
        .not('thread_id', 'is', null)
        .order('received_at', { ascending: false })
        .range(off, off + 999);
      if (error) throw new Error(`emails page ${off}: ${error.message}`);
      meta.push(...(data ?? []) as any);
      if ((data ?? []).length < 1000) break;
    }

    // ---- restrict to THIS mailbox. 171 threads in the window are visible to
    // both connections, so this is not cosmetic: without it the two mailboxes
    // would extract each other's threads under the wrong owner. ----
    const visible = new Set<string>();
    for (const part of chunks(meta.map((m) => m.id), CHUNK)) {
      const { data, error } = await supabase
        .from('email_visibility').select('email_id')
        .eq('gmail_connection_id', cid).in('email_id', part);
      if (error) throw new Error(`email_visibility chunk: ${error.message}`);
      for (const r of data ?? []) visible.add(String(r.email_id));
    }
    const mineRows = meta.filter((m) => visible.has(m.id));

    const threadIds: string[] = [];
    const rowsByThread = new Map<string, Meta[]>();
    for (const r of mineRows) {
      const t = String(r.thread_id);
      if (!rowsByThread.has(t)) { rowsByThread.set(t, []); threadIds.push(t); }
      rowsByThread.get(t)!.push(r);
    }
    stats.threads_for_mailbox = threadIds.length;

    // ---- EXCLUSIONS IN BULK, before any thread is read or any model call ----
    const excludedBy = new Map<string, string>();
    const mark = (t: string, reason: string) => { if (!excludedBy.has(t)) excludedBy.set(t, reason); };

    // Cheap local tests first: no query needed at all.
    for (const [t, rows] of rowsByThread) {
      if (rows.some((r) => EXCLUDED_SENDERS.includes(String(r.sender_email ?? '').toLowerCase()))) mark(t, 'ovis_alert');
      else if (rows.some((r) => CALENDAR_SUBJECT.test(String(r.subject ?? '')))) mark(t, 'calendar_notice');
    }

    const threadOfEmail = new Map<string, string>();
    for (const [t, rows] of rowsByThread) for (const r of rows) threadOfEmail.set(r.id, t);

    for (const part of chunks([...threadOfEmail.keys()], CHUNK)) {
      const { data, error } = await supabase
        .from('email_label').select('email_id, label')
        .in('email_id', part).in('label', EXCLUDED_LABELS)
        .not('applied_at', 'is', null).is('removed_at', null);
      if (error) throw new Error(`email_label chunk: ${error.message}`);
      for (const r of data ?? []) {
        const t = threadOfEmail.get(String(r.email_id));
        if (t) mark(t, String(r.label));
      }
    }

    // A text/calendar part is the other half of the calendar test: 45 threads
    // in the window carry one, against 37 caught by the subject alone.
    for (const part of chunks([...threadOfEmail.keys()], CHUNK)) {
      const { data, error } = await supabase
        .from('email_attachments').select('email_id, mime_type')
        .in('email_id', part).ilike('mime_type', '%calendar%');
      if (error) throw new Error(`email_attachments chunk: ${error.message}`);
      for (const r of data ?? []) {
        const t = threadOfEmail.get(String(r.email_id));
        if (t) mark(t, 'calendar_notice');
      }
    }

    // NOT chunked in.(message_id,...): Message-IDs are long, and 200 of them
    // made a URL big enough that the HTTP/2 request failed outright.
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
    for (const [t, rows] of rowsByThread) {
      if (rows.some((r) => r.message_id && stubIds.has(String(r.message_id)))) mark(t, 'tier1_stub');
    }

    for (const reason of excludedBy.values()) {
      if (reason === 'OVIS/Personal') stats.excluded.label_personal++;
      else if (reason === 'OVIS/Junk') stats.excluded.label_junk++;
      else if (reason === 'OVIS/Reading') stats.excluded.label_reading++;
      else if (reason === 'OVIS/Events') stats.excluded.label_events++;
      else if (reason === 'ovis_alert') stats.excluded.ovis_alert++;
      else if (reason === 'calendar_notice') stats.excluded.calendar_notice++;
      else stats.excluded.tier1_stub++;
    }

    const eligible = threadIds.filter((t) => !excludedBy.has(t));
    stats.eligible_threads = eligible.length;

    const batch = eligible.slice(offset, offset + maxThreads);
    if (dryRun) {
      stats.next_offset = offset + batch.length < eligible.length ? offset + batch.length : null;
      return new Response(JSON.stringify({ success: true, dry_run: true, model: MODEL, ...stats }, null, 2),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- existing rows for THIS mailbox, preloaded so replacement costs no
    // per-thread query. Only `open` rows are ever replaceable. ----
    const existing = new Map<string, { id: string; ball: string; status: string }[]>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('commitment').select('id, gmail_thread_id, ball, status')
        .eq('gmail_connection_id', cid).range(off, off + 999);
      if (error) throw new Error(`commitment page ${off}: ${error.message}`);
      for (const r of data ?? []) {
        const t = String(r.gmail_thread_id);
        if (!existing.has(t)) existing.set(t, []);
        existing.get(t)!.push({ id: String(r.id), ball: String(r.ball), status: String(r.status) });
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

    const runOne = async (threadId: string) => {
      if (stop) return;
      if (stats.usd_run_total >= maxUsd) { stats.stopped_on_budget = true; stop = true; return; }
      if (Date.now() - startedAt > DEADLINE_MS) { stats.stopped_on_deadline = true; stop = true; return; }

      const threadRows = rowsByThread.get(threadId) ?? [];
      const ids = threadRows.map((r) => r.id);

      // Bodies for THIS thread only, and only messages visible to THIS mailbox.
      const { data: msgsDesc, error } = await supabase
        .from('emails')
        .select('id, subject, sender_email, sender_name, body_text, received_at')
        .in('id', ids)
        .order('received_at', { ascending: false })
        .limit(MESSAGES_PER_THREAD);
      if (error) { stats.model_errors++; return; }

      const msgs = [...(msgsDesc ?? [])].reverse();              // oldest -> newest
      if (!msgs.length) return;

      // The age the system states aloud comes from THIS mailbox's last message
      // in the thread, not from whatever the model infers.
      const lastAt = new Date(threadRows.reduce((a, r) => (r.received_at > a ? r.received_at : a), threadRows[0].received_at));
      const threadAgeDays = dayDiff(etDay(lastAt), todayEt);

      const transcript = msgs.map((m) => {
        const who = String(m.sender_email ?? '').toLowerCase() === ownerEmail ? ' (OWNER)' : '';
        const body = String(m.body_text ?? '').replace(/\s+/g, ' ').trim().slice(0, BODY_CHARS);
        const sentDay = etDay(new Date(m.received_at));
        return `--- sent ${sentDay} from ${m.sender_name ?? ''} <${m.sender_email}>${who}\nSubject: ${m.subject ?? ''}\n${body}`;
      }).join('\n');
      if (!transcript.replace(/\s/g, '')) { stats.excluded.no_usable_body++; return; }

      stats.threads_attempted++;
      const userMsg = `Thread ${threadId}, last ${msgs.length} messages (today is ${todayEt}):\n\n${transcript}`;

      let found: Extracted[] = [];
      try {
        let parsed = await askModel(userMsg);
        let list = (parsed?.commitments ?? []).filter((c) => c && c.ball && c.what && c.reason);
        // One repair attempt if the model talked about time anyway.
        if (list.some((c) => TIME_WORDS_RETRY.test(c.reason))) {
          stats.time_word_retries++;
          parsed = await askModel(userMsg,
            'YOUR PREVIOUS ANSWER CONTAINED TIME LANGUAGE AND WAS REJECTED. Rewrite each "reason" with no time word of any kind — no today, yesterday, ago, recently, weekday, month or duration. State only who owes what.');
          const retried = (parsed?.commitments ?? []).filter((c) => c && c.ball && c.what && c.reason);
          if (retried.length) list = retried;
        }
        found = list;
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.startsWith('JSON')) stats.parse_errors++;
        else { stats.model_errors++; console.error(`[extract-commitments] ${threadId}: ${msg}`); }
        return;
      }

      const prior = existing.get(threadId) ?? [];

      if (!found.length) {
        stats.threads_zero++;
        if (stats.zero_samples.length < 40) {
          const last = msgs[msgs.length - 1];
          stats.zero_samples.push({
            thread_id: threadId, subject: last?.subject ?? null,
            last_sender: last?.sender_email ?? null,
            last_is_owner: String(last?.sender_email ?? '').toLowerCase() === ownerEmail,
          });
        }
      }

      if (found.length) {
        // deal_id from EXISTING links only; no new matching (step-1 scope).
        const { data: links } = await supabase
          .from('email_object_link').select('object_id')
          .eq('object_type', 'deal').in('email_id', ids).limit(1);

        for (const c of found) {
          const ball = (['them', 'me', 'neither'] as const).includes(c.ball as any) ? c.ball : 'neither';
          const core = String(c.reason).trim().replace(/[.\s]+$/, '');
          if (TIME_WORDS_REPORTED.test(core)) stats.time_words_remaining++;

          // SPEAKABLE REASON IS COMPOSED HERE, not by the model.
          const promised = c.promised_date && /^\d{4}-\d{2}-\d{2}$/.test(c.promised_date) ? c.promised_date : null;
          let speakable = `${core}, ${ageText(threadAgeDays)}.`;
          if (promised) {
            speakable += ball === 'me'
              ? ` You promised it by ${prettyDay(promised)}.`
              : ` They promised it by ${prettyDay(promised)}.`;
          }

          const { error: upErr } = await supabase.from('commitment').upsert({
            source: 'email',
            gmail_thread_id: threadId,
            gmail_connection_id: cid,          // = owner_connection_id, by construction
            ball,
            counterparty_name: c.counterparty_name ?? null,
            counterparty_email: c.counterparty_email ?? null,
            what: String(c.what).slice(0, 400),
            reason_core: core.slice(0, 600),
            speakable_reason: speakable.slice(0, 600),
            promised_date: promised,
            deal_id: links?.[0]?.object_id ?? null,
            // Shadow only: what it WOULD set, never acted on.
            would_set_ball_in_court: ball === 'them' ? 'counterparty' : ball === 'me' ? 'us' : null,
            model: MODEL,
            confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : null,
          }, { onConflict: 'gmail_thread_id,gmail_connection_id,ball' });
          if (upErr) { stats.upsert_errors++; console.error(`[extract-commitments] upsert ${threadId}: ${upErr.message}`); continue; }
          stats.written[ball]++;
        }
      }

      // ---- RERUN REPLACEMENT. An OPEN row this extraction no longer claims is
      // stale and goes. A row the owner has dispositioned (handled / flagged /
      // skipped) is NEVER deleted — no dispositions exist yet, but the rule has
      // to be in the code before they do, not after. ----
      const keep = new Set(found.map((c) => c.ball));
      const doomed = prior.filter((p) => p.status === 'open' && !keep.has(p.ball as any)).map((p) => p.id);
      if (doomed.length) {
        const { error: delErr } = await supabase
          .from('commitment').delete().in('id', doomed).eq('status', 'open');
        if (delErr) console.error(`[extract-commitments] replace ${threadId}: ${delErr.message}`);
        else stats.replaced_rows_deleted += doomed.length;
      }
    };

    for (const part of chunks(batch, CONCURRENCY)) {
      if (stop) break;
      await Promise.all(part.map(runOne));
      consumed += part.length;
    }

    const reached = offset + consumed;
    stats.next_offset = reached < eligible.length && !stats.stopped_on_budget ? reached : null;

    return new Response(JSON.stringify({ success: true, model: MODEL, window_days: WINDOW_DAYS, max_usd: maxUsd, ...stats }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[extract-commitments]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), ...stats }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
