/**
 * extract-commitments — step 1 of the commitment layer: extraction only.
 *
 * THE UNIT OF WORK IS THE THREAD, not the email. A commitment's state depends
 * on the LATEST messages, including the owner's own replies: "I'll send the
 * redline Thursday" flips the ball, and a per-email pass would keep
 * resurrecting obligations the next message already discharged.
 *
 * WHOSE MESSAGE IS IT: sender_email ∈ gmail_connection.google_email, never
 * emails.direction. Spec §4 flags that column as unreliable and it measures
 * 542 vs 469 over 14 days here -- 13% mislabelled.
 *
 * NO UI, NO GMAIL WRITES, NO DEAL-BOARD WIRING. deal_id comes from existing
 * email_object_link rows; no new matching is attempted. would_set_ball_in_court
 * is written and never acted on -- though see the migration's note on what
 * "shadow" does not cover.
 *
 * SHAPED BY THE WORKER LIMIT, not by taste: the first version selected
 * body_text for every message in the window and then ran two queries per
 * thread, and the worker was killed with WORKER_RESOURCE_LIMIT. So the window
 * pass reads METADATA ONLY, exclusions are resolved in BULK before any thread
 * is touched, and bodies are fetched one eligible thread at a time. The run is
 * resumable (`offset` -> `next_offset`) because 500 model calls cannot finish
 * inside one invocation's wall clock.
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
const DEADLINE_MS = 110_000;       // stop cleanly and hand back next_offset

/** Labels that take a thread out of scope BEFORE any model call. */
const EXCLUDED_LABELS = ['OVIS/Personal', 'OVIS/Junk', 'OVIS/Reading', 'OVIS/Events'];

const SYSTEM = `You read one email thread and report the OBLIGATIONS it contains.

An obligation is something a specific person now owes someone else: a reply, a
document, a decision, a signature, a date. Pleasantries, newsletters,
notifications and FYI copies contain none.

"THE OWNER" is the mailbox holder, marked (OWNER) on their messages.

ball:
  "them"    — someone owes the owner something. The owner is waiting.
  "me"      — the owner owes someone something. They are waiting on the owner.
  "neither" — no one owes anything (FYI, closed out, pleasantry).

Judge from the LAST messages. If the owner already answered what was asked,
the obligation is discharged — do not report it. If the owner promised
something and has not sent it, ball is "me".

Return STRICT JSON, no prose, no markdown fence:
{"commitments":[{"ball":"them|me|neither","what":"<8 words max, concrete>",
"speakable_reason":"<ONE sentence, written to be read ALOUD to the owner, naming
who and how long>","counterparty_name":"<name or null>",
"counterparty_email":"<email or null>","promised_date":"<YYYY-MM-DD or null>",
"confidence":<0.0-1.0>}]}

Return {"commitments":[]} when the thread holds no obligation. That is a common
and correct answer — most threads hold none. Do not invent one.

speakable_reason examples:
  "The landlord on Dunwoody replied nine days ago and you haven't answered."
  "You told Sarah you'd send the LOI redline by Thursday and it's now Monday."
Never write "This email is about..." — speak about the obligation, not the mail.`;

interface Extracted {
  ball: 'them' | 'me' | 'neither';
  what: string;
  speakable_reason: string;
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

  let dryRun = false, maxUsd = 10.0, offset = 0, maxThreads = 80, usdSpent = 0;
  try {
    const b = await req.json();
    dryRun = b?.dry_run === true;
    if (typeof b?.max_usd === 'number') maxUsd = b.max_usd;
    if (typeof b?.offset === 'number') offset = b.offset;
    if (typeof b?.max_threads === 'number') maxThreads = b.max_threads;
    // Carried across invocations so the cap applies to the RUN, not the batch.
    if (typeof b?.usd_spent === 'number') usdSpent = b.usd_spent;
  } catch { /* defaults */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anthropic = new Anthropic({ apiKey });

  const stats = {
    threads_in_window: 0,
    excluded: { label_personal: 0, label_junk: 0, label_reading: 0, label_events: 0, tier1_stub: 0, no_usable_body: 0 },
    eligible_threads: 0,
    threads_attempted: 0,
    model_calls: 0, model_errors: 0, parse_errors: 0,
    input_tokens: 0, output_tokens: 0, usd_this_batch: 0, usd_run_total: usdSpent,
    created: { them: 0, me: 0, neither: 0 },
    upsert_errors: 0,
    threads_zero: 0,
    stopped_on_budget: false,
    stopped_on_deadline: false,
    offset,
    next_offset: null as number | null,
    zero_samples: [] as Record<string, unknown>[],
  };

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

    const { data: conns } = await supabase.from('gmail_connection').select('id, google_email');
    const mine = new Set((conns ?? []).map((c) => String(c.google_email).toLowerCase()));

    // ---- window pass: METADATA ONLY (no body_text; that is what killed v1) ----
    const meta: { id: string; thread_id: string; message_id: string | null }[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('emails')
        .select('id, thread_id, message_id, received_at')
        .gte('received_at', since)
        .not('thread_id', 'is', null)
        .order('received_at', { ascending: false })
        .range(off, off + 999);
      if (error) throw new Error(`emails page ${off}: ${error.message}`);
      meta.push(...(data ?? []) as any);
      if ((data ?? []).length < 1000) break;
    }

    // Thread order is newest-message-first, and stable, so `offset` means the
    // same thing on every invocation of the same window.
    const threadIds: string[] = [];
    const idsByThread = new Map<string, string[]>();
    const msgIdsByThread = new Map<string, string[]>();
    for (const r of meta) {
      const t = String(r.thread_id);
      if (!idsByThread.has(t)) { idsByThread.set(t, []); msgIdsByThread.set(t, []); threadIds.push(t); }
      idsByThread.get(t)!.push(r.id);
      if (r.message_id) msgIdsByThread.get(t)!.push(r.message_id);
    }
    stats.threads_in_window = threadIds.length;

    // ---- EXCLUSIONS IN BULK, before any thread is read or any model call ----
    const threadOfEmail = new Map<string, string>();
    for (const [t, ids] of idsByThread) for (const id of ids) threadOfEmail.set(id, t);
    const threadOfMsgId = new Map<string, string>();
    for (const [t, mids] of msgIdsByThread) for (const m of mids) threadOfMsgId.set(m, t);

    const excludedBy = new Map<string, string>();   // thread_id -> reason
    for (const part of chunks([...threadOfEmail.keys()], CHUNK)) {
      const { data, error } = await supabase
        .from('email_label').select('email_id, label')
        .in('email_id', part)
        .in('label', EXCLUDED_LABELS)
        .not('applied_at', 'is', null).is('removed_at', null);
      if (error) throw new Error(`email_label chunk: ${error.message}`);
      for (const row of data ?? []) {
        const t = threadOfEmail.get(String(row.email_id));
        if (t && !excludedBy.has(t)) excludedBy.set(t, String(row.label));
      }
    }
    // NOT chunked in.(message_id,...): Message-IDs are long, and 200 of them
    // made a URL big enough that the HTTP/2 request failed outright. Pull the
    // window's stubs instead -- one small paginated read, intersected locally.
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
    for (const [mid, t] of threadOfMsgId) {
      if (stubIds.has(mid) && !excludedBy.has(t)) excludedBy.set(t, 'tier1_stub');
    }

    for (const reason of excludedBy.values()) {
      if (reason === 'OVIS/Personal') stats.excluded.label_personal++;
      else if (reason === 'OVIS/Junk') stats.excluded.label_junk++;
      else if (reason === 'OVIS/Reading') stats.excluded.label_reading++;
      else if (reason === 'OVIS/Events') stats.excluded.label_events++;
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

    let stop = false;
    let consumed = 0;

    const runOne = async (threadId: string) => {
      if (stop) return;
      if (stats.usd_run_total >= maxUsd) { stats.stopped_on_budget = true; stop = true; return; }
      if (Date.now() - startedAt > DEADLINE_MS) { stats.stopped_on_deadline = true; stop = true; return; }

      // Bodies for THIS thread only, newest first, capped at MESSAGES_PER_THREAD.
      const { data: msgsDesc, error } = await supabase
        .from('emails')
        .select('id, subject, sender_email, sender_name, body_text, received_at')
        .eq('thread_id', threadId)
        .order('received_at', { ascending: false })
        .limit(MESSAGES_PER_THREAD);
      if (error) { stats.model_errors++; return; }

      const msgs = [...(msgsDesc ?? [])].reverse();          // oldest -> newest
      const transcript = msgs.map((m) => {
        const who = mine.has(String(m.sender_email).toLowerCase()) ? '(OWNER)' : '';
        const body = String(m.body_text ?? '').replace(/\s+/g, ' ').trim().slice(0, BODY_CHARS);
        return `--- ${m.received_at} from ${m.sender_name ?? ''} <${m.sender_email}> ${who}\nSubject: ${m.subject ?? ''}\n${body}`;
      }).join('\n');
      if (!transcript.replace(/\s/g, '')) { stats.excluded.no_usable_body++; return; }

      stats.threads_attempted++;

      let parsed: { commitments?: Extracted[] } | null = null;
      try {
        const resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM,
          messages: [{ role: 'user', content: `Thread ${threadId}, last ${msgs.length} messages:\n\n${transcript}` }],
        });
        stats.model_calls++;
        stats.input_tokens += resp.usage?.input_tokens ?? 0;
        stats.output_tokens += resp.usage?.output_tokens ?? 0;
        stats.usd_this_batch = stats.input_tokens * USD_PER_INPUT_TOKEN + stats.output_tokens * USD_PER_OUTPUT_TOKEN;
        stats.usd_run_total = usdSpent + stats.usd_this_batch;

        const text = (resp.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        const s = text.indexOf('{'), e = text.lastIndexOf('}');
        if (s < 0 || e <= s) throw new Error('JSON: no object in response');
        parsed = JSON.parse(text.slice(s, e + 1));
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.startsWith('JSON')) stats.parse_errors++;
        else { stats.model_errors++; console.error(`[extract-commitments] ${threadId}: ${msg}`); }
        return;
      }

      const found = (parsed?.commitments ?? []).filter((c) => c && c.ball && c.what && c.speakable_reason);
      if (!found.length) {
        stats.threads_zero++;
        if (stats.zero_samples.length < 40) {
          const last = msgs[msgs.length - 1];
          stats.zero_samples.push({
            thread_id: threadId,
            subject: last?.subject ?? null,
            last_sender: last?.sender_email ?? null,
            last_is_owner: mine.has(String(last?.sender_email).toLowerCase()),
          });
        }
        return;
      }

      const ids = idsByThread.get(threadId) ?? [];
      // deal_id from EXISTING links only; no new matching (step-1 scope).
      const { data: links } = await supabase
        .from('email_object_link').select('object_id')
        .eq('object_type', 'deal').in('email_id', ids).limit(1);
      const { data: vis } = await supabase
        .from('email_visibility').select('gmail_connection_id').in('email_id', ids).limit(1);

      for (const c of found) {
        const ball = (['them', 'me', 'neither'] as const).includes(c.ball as any) ? c.ball : 'neither';
        const { error: upErr } = await supabase.from('commitment').upsert({
          source: 'email',
          gmail_thread_id: threadId,
          gmail_connection_id: vis?.[0]?.gmail_connection_id ?? null,
          ball,
          counterparty_name: c.counterparty_name ?? null,
          counterparty_email: c.counterparty_email ?? null,
          what: String(c.what).slice(0, 400),
          speakable_reason: String(c.speakable_reason).slice(0, 600),
          promised_date: c.promised_date && /^\d{4}-\d{2}-\d{2}$/.test(c.promised_date) ? c.promised_date : null,
          deal_id: links?.[0]?.object_id ?? null,
          // Shadow only: what it WOULD set, never acted on.
          would_set_ball_in_court: ball === 'them' ? 'counterparty' : ball === 'me' ? 'us' : null,
          model: MODEL,
          confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : null,
        }, { onConflict: 'gmail_thread_id,ball' });
        if (upErr) { stats.upsert_errors++; console.error(`[extract-commitments] upsert ${threadId}: ${upErr.message}`); continue; }
        stats.created[ball]++;
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
