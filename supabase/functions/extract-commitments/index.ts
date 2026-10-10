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
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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

  let dryRun = false, maxUsd = 10.0, threadLimit = 0;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    if (typeof body?.max_usd === 'number') maxUsd = body.max_usd;
    if (typeof body?.thread_limit === 'number') threadLimit = body.thread_limit;
  } catch { /* defaults */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const anthropic = new Anthropic({ apiKey });

  const stats = {
    threads_considered: 0,
    excluded: { label_personal: 0, label_junk: 0, label_reading: 0, label_events: 0, tier1_stub: 0, no_usable_body: 0 },
    model_calls: 0, model_errors: 0, parse_errors: 0,
    input_tokens: 0, output_tokens: 0, usd: 0,
    created: { them: 0, me: 0, neither: 0 },
    threads_zero: 0,
    stopped_on_budget: false,
    zero_samples: [] as Record<string, unknown>[],
  };

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();

    const { data: conns } = await supabase.from('gmail_connection').select('id, google_email');
    const mine = new Set((conns ?? []).map((c) => String(c.google_email).toLowerCase()));

    // Pull the window's messages, newest first, and group by thread.
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('emails')
        .select('id, gmail_id, message_id, thread_id, subject, sender_email, sender_name, body_text, received_at')
        .gte('received_at', since)
        .not('thread_id', 'is', null)
        .order('received_at', { ascending: false })
        .range(offset, offset + 999);
      if (error) throw new Error(`emails page ${offset}: ${error.message}`);
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }

    const byThread = new Map<string, any[]>();
    for (const r of rows) {
      const k = String(r.thread_id);
      if (!byThread.has(k)) byThread.set(k, []);
      byThread.get(k)!.push(r);
    }
    stats.threads_considered = byThread.size;

    let threads = [...byThread.entries()];
    if (threadLimit > 0) threads = threads.slice(0, threadLimit);

    for (const [threadId, msgsDesc] of threads) {
      if (stats.usd >= maxUsd) { stats.stopped_on_budget = true; break; }

      const msgs = [...msgsDesc].reverse();                 // oldest -> newest
      const ids = msgs.map((m) => m.id);
      const messageIds = msgs.map((m) => m.message_id).filter(Boolean);

      // ---- EXCLUSIONS, all before any model call ----
      const { data: labels } = await supabase
        .from('email_label').select('label')
        .in('email_id', ids)
        .not('applied_at', 'is', null).is('removed_at', null);
      const held = new Set((labels ?? []).map((l) => String(l.label)));
      const hit = EXCLUDED_LABELS.find((l) => held.has(l));
      if (hit) {
        if (hit === 'OVIS/Personal') stats.excluded.label_personal++;
        else if (hit === 'OVIS/Junk') stats.excluded.label_junk++;
        else if (hit === 'OVIS/Reading') stats.excluded.label_reading++;
        else stats.excluded.label_events++;
        continue;
      }

      if (messageIds.length) {
        const { data: stubs } = await supabase
          .from('email_tier1_stub').select('message_id').in('message_id', messageIds).limit(1);
        if ((stubs ?? []).length) { stats.excluded.tier1_stub++; continue; }
      }

      const recent = msgs.slice(-MESSAGES_PER_THREAD);
      const transcript = recent.map((m) => {
        const who = mine.has(String(m.sender_email).toLowerCase()) ? '(OWNER)' : '';
        const body = String(m.body_text ?? '').replace(/\s+/g, ' ').trim().slice(0, BODY_CHARS);
        return `--- ${m.received_at} from ${m.sender_name ?? ''} <${m.sender_email}> ${who}\nSubject: ${m.subject ?? ''}\n${body}`;
      }).join('\n');
      if (!transcript.replace(/\s/g, '')) { stats.excluded.no_usable_body++; continue; }

      if (dryRun) continue;

      // ---- model ----
      let parsed: { commitments?: Extracted[] } | null = null;
      try {
        const resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM,
          messages: [{ role: 'user', content: `Thread ${threadId}, last ${recent.length} messages:\n\n${transcript}` }],
        });
        stats.model_calls++;
        stats.input_tokens += resp.usage.input_tokens;
        stats.output_tokens += resp.usage.output_tokens;
        stats.usd = stats.input_tokens * USD_PER_INPUT_TOKEN + stats.output_tokens * USD_PER_OUTPUT_TOKEN;

        const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        const start = text.indexOf('{'), end = text.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('no JSON object in response');
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch (e: any) {
        if (String(e?.message ?? e).includes('JSON')) stats.parse_errors++;
        else { stats.model_errors++; console.error(`[extract-commitments] ${threadId}: ${e?.message ?? e}`); }
        continue;
      }

      const found = (parsed?.commitments ?? []).filter((c) => c && c.ball && c.what && c.speakable_reason);
      if (!found.length) {
        stats.threads_zero++;
        if (stats.zero_samples.length < 40) {
          const last = recent[recent.length - 1];
          stats.zero_samples.push({
            thread_id: threadId,
            subject: last?.subject ?? null,
            last_sender: last?.sender_email ?? null,
            last_is_owner: mine.has(String(last?.sender_email).toLowerCase()),
          });
        }
        continue;
      }

      // deal_id from EXISTING links only; no new matching (step-1 scope).
      const { data: links } = await supabase
        .from('email_object_link').select('object_id')
        .eq('object_type', 'deal').in('email_id', ids).limit(1);
      const dealId = links?.[0]?.object_id ?? null;

      const { data: vis } = await supabase
        .from('email_visibility').select('gmail_connection_id').in('email_id', ids).limit(1);
      const connId = vis?.[0]?.gmail_connection_id ?? null;

      for (const c of found) {
        const ball = (['them', 'me', 'neither'] as const).includes(c.ball) ? c.ball : 'neither';
        const { error: upErr } = await supabase.from('commitment').upsert({
          source: 'email',
          gmail_thread_id: threadId,
          gmail_connection_id: connId,
          ball,
          counterparty_name: c.counterparty_name ?? null,
          counterparty_email: c.counterparty_email ?? null,
          what: String(c.what).slice(0, 400),
          speakable_reason: String(c.speakable_reason).slice(0, 600),
          promised_date: c.promised_date && /^\d{4}-\d{2}-\d{2}$/.test(c.promised_date) ? c.promised_date : null,
          deal_id: dealId,
          // Shadow only: what it WOULD set, never acted on.
          would_set_ball_in_court: ball === 'them' ? 'counterparty' : ball === 'me' ? 'us' : null,
          model: MODEL,
          confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : null,
        }, { onConflict: 'gmail_thread_id,ball' });
        if (upErr) { console.error(`[extract-commitments] upsert ${threadId}: ${upErr.message}`); continue; }
        stats.created[ball]++;
      }
    }

    return new Response(JSON.stringify({ success: true, model: MODEL, window_days: WINDOW_DAYS, max_usd: maxUsd, ...stats }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[extract-commitments]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), ...stats }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
