/**
 * commitment-action — the four answers the desk panel can give a commitment.
 *
 * ALL MUTATIONS LIVE HERE, not in the browser. `commitment` grants the
 * `authenticated` role SELECT and nothing else on purpose: the panel can read
 * its own rows but cannot write them, so an UPDATE grant plus a policy would be
 * two more things to get wrong. The caller is checked with caller-auth, which
 * resolves the JWT's OVIS user and runs is_internal_user() AS that user.
 *
 * FLAG AND HANDLED BOTH TOUCH GMAIL, so both carry the same contract:
 * HANDLED IS NOT DONE UNTIL GMAIL SAYS SO. status flips to 'handled' with
 * sync_state 'pending', the conversation's INBOX messages are archived, and
 * only Gmail's success response moves sync_state to 'synced'. A failure leaves
 * 'failed' plus sync_error, which the row shows in red. The panel never
 * presents an unsynced row as handled -- "I archived it" is a claim about
 * someone else's mailbox and has to be true. Flag works the same way against
 * the OVIS/Flagged label: it is applied, not assumed.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { authorizeCaller } from '../_shared/caller-auth.ts';
import { refreshAccessToken, isTokenExpired, modifyMessageLabels, getOrCreateLabel } from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

/** The one Gmail label this panel writes. Nested name, so it groups under OVIS/. */
const FLAG_LABEL = 'OVIS/Flagged';

const ET = 'America/New_York';
/** CLAUDE.md: Eastern Time for every date operation. */
const etDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

type Action = 'handled' | 'flag' | 'skip' | 'reject' | 'not_a_person';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  let commitmentId = '', action: Action | '' = '';
  try {
    const b = await req.json();
    commitmentId = String(b?.commitment_id ?? '');
    action = String(b?.action ?? '') as Action;
  } catch { /* validated below */ }

  if (!commitmentId || !['handled', 'flag', 'skip', 'reject', 'not_a_person'].includes(action)) {
    return json({
      success: false,
      error: 'commitment_id and action (handled|flag|skip|reject|not_a_person) are required',
    }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: row, error: readErr } = await supabase
    .from('commitment')
    .select('id, gmail_thread_id, conversation_thread_ids, gmail_connection_id, ball, what, reason_core, skip_count, status, counterparty_email')
    .eq('id', commitmentId)
    .maybeSingle();
  if (readErr) return json({ success: false, error: `read: ${readErr.message}` }, 500);
  if (!row) return json({ success: false, error: 'commitment not found' }, 404);

  // ---- NOT A PERSON: stop offering "Add contact" for this address. The
  // address is taken FROM THE ROW, never from the request body, so a caller
  // cannot blacklist an address it was never shown. Nothing about the
  // commitment itself changes -- the obligation is still real, it just has no
  // contact behind it. ----
  if (action === 'not_a_person') {
    const email = String(row.counterparty_email ?? '').trim();
    if (!email) return json({ success: false, error: 'this commitment has no counterparty_email' }, 400);
    // A plain INSERT, not an upsert: the unique index is on lower(email), an
    // expression, which PostgREST's onConflict cannot name. The index is the
    // thing that actually guarantees one row per address whoever writes it, so
    // it stays, and a duplicate is read off the error instead.
    const lower = email.toLowerCase();
    const { error } = await supabase.from('commitment_not_a_person')
      .insert({ email: lower, commitment_id: row.id });
    if (error && error.code !== '23505') {
      return json({ success: false, error: `not_a_person: ${error.message}` }, 500);
    }
    return json({ success: true, action, email: lower, already: error?.code === '23505' });
  }

  /** Record that the Gmail half of an action did not happen, and say what went wrong. */
  const fail = async (msg: string, status: string) => {
    await supabase.from('commitment')
      .update({ sync_state: 'failed', sync_error: msg.slice(0, 500) }).eq('id', commitmentId);
    return json({ success: false, action, status, sync_state: 'failed', error: msg }, 502);
  };

  /**
   * A usable access token plus every thread_id in the conversation. Both
   * Gmail-touching actions need exactly this, and a conversation routinely
   * spans more than one thread_id -- 23% of replies are stored under a
   * different one -- so neither action may assume gmail_thread_id is the whole
   * conversation. Returns a message instead of throwing when it can't.
   */
  const resolveGmail = async (): Promise<{ accessToken: string; threadIds: string[] } | string> => {
    const { data: conn } = await supabase
      .from('gmail_connection')
      .select('id, google_email, access_token, refresh_token, token_expires_at')
      .eq('id', row.gmail_connection_id)
      .maybeSingle();
    if (!conn) return 'no gmail_connection on this commitment';

    let accessToken = String(conn.access_token ?? '');
    try {
      if (isTokenExpired(conn.token_expires_at)) {
        const t = await refreshAccessToken(
          String(conn.refresh_token),
          Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
          Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
        );
        accessToken = t.access_token;
        await supabase.from('gmail_connection').update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        }).eq('id', conn.id);
      }
    } catch (e: any) {
      return `token refresh: ${e?.message ?? e}`;
    }

    const threadIds = [...new Set([
      String(row.gmail_thread_id),
      ...((row.conversation_thread_ids ?? []) as string[]),
    ].filter(Boolean))];
    return { accessToken, threadIds };
  };

  /** One thread's messages, or a problem string. 404 means "not in this mailbox". */
  const readThread = async (accessToken: string, tid: string): Promise<any[] | null | string> => {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}?format=minimal`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.status === 404) return null;
    if (!res.ok) return `thread ${tid}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`;
    const thread = await res.json();
    return (thread.messages ?? []) as any[];
  };

  // ---- FLAG: stays in the inbox, stays on the panel, and takes the
  // OVIS/Flagged label in Gmail. The label is the point of the button: a flag
  // only OVIS can see would mean opening OVIS to find out what to do in Gmail.
  // So the label is not best-effort -- a failure leaves sync_state 'failed'
  // and the row says so, the same contract Handled has. ----
  if (action === 'flag') {
    const { error } = await supabase.from('commitment')
      .update({ status: 'flagged', sync_state: 'pending', sync_error: null, missed_runs: 0 })
      .eq('id', commitmentId);
    if (error) return json({ success: false, error: `flag: ${error.message}` }, 500);

    const g = await resolveGmail();
    if (typeof g === 'string') return await fail(g, 'flagged');

    let labelId: string;
    try {
      labelId = await getOrCreateLabel(g.accessToken, FLAG_LABEL);
    } catch (e: any) {
      return await fail(`label ${FLAG_LABEL}: ${e?.message ?? e}`, 'flagged');
    }

    const labelled: string[] = [];
    const problems: string[] = [];
    for (const tid of g.threadIds) {
      try {
        const msgs = await readThread(g.accessToken, tid);
        if (msgs === null) continue;
        if (typeof msgs === 'string') { problems.push(msgs); continue; }
        // The messages actually sitting in the inbox. If the thread has already
        // been archived, label its newest message instead, so the thread still
        // surfaces under the label rather than quietly getting none.
        const inInbox = msgs.filter((m) => (m.labelIds ?? []).includes('INBOX'));
        const targets = inInbox.length ? inInbox : msgs.slice(-1);
        for (const m of targets) {
          if ((m.labelIds ?? []).includes(labelId)) continue;  // already flagged, re-flag is a no-op
          await modifyMessageLabels(g.accessToken, String(m.id), [labelId], []);
          labelled.push(String(m.id));
        }
      } catch (e: any) {
        problems.push(`thread ${tid}: ${e?.message ?? e}`);
      }
    }

    if (problems.length) return await fail(problems.join(' | '), 'flagged');

    const { error: syncErr } = await supabase.from('commitment')
      .update({ sync_state: 'synced', sync_error: null }).eq('id', commitmentId);
    if (syncErr) return await fail(`sync flag: ${syncErr.message}`, 'flagged');

    return json({
      success: true, action, status: 'flagged', sync_state: 'synced',
      label: FLAG_LABEL, threads: g.threadIds.length, labelled_messages: labelled.length,
    });
  }

  // ---- SKIP: defer to tomorrow and count it. Decay is a later step; the
  // count is recorded now so it exists when decay arrives. ----
  if (action === 'skip') {
    const tomorrow = etDay(new Date(Date.now() + 86_400_000));
    const { error } = await supabase.from('commitment').update({
      status: 'skipped',
      skip_count: Number(row.skip_count ?? 0) + 1,
      next_surface_date: tomorrow,
      missed_runs: 0,
    }).eq('id', commitmentId);
    if (error) return json({ success: false, error: `skip: ${error.message}` }, 500);
    return json({ success: true, action, status: 'skipped', next_surface_date: tomorrow });
  }

  // ---- REJECT: the extractor was wrong. Write the correction FIRST, so the
  // training signal cannot be lost to a failure on the second write. ----
  if (action === 'reject') {
    const { error: corrErr } = await supabase.from('commitment_correction').insert({
      commitment_id: row.id,
      gmail_connection_id: row.gmail_connection_id,
      gmail_thread_id: row.gmail_thread_id,
      conversation_thread_ids: row.conversation_thread_ids,
      correction: 'not_a_commitment',
      ball: row.ball,
      reason_core: row.reason_core,
      what: row.what,
    });
    if (corrErr) return json({ success: false, error: `correction: ${corrErr.message}` }, 500);
    const { error } = await supabase.from('commitment')
      .update({ status: 'rejected', missed_runs: 0 }).eq('id', commitmentId);
    if (error) return json({ success: false, error: `reject: ${error.message}` }, 500);
    return json({ success: true, action, status: 'rejected', correction_written: true });
  }

  // ---- HANDLED: flip, then archive, then record what Gmail actually said. ----
  const { error: markErr } = await supabase.from('commitment')
    .update({ status: 'handled', sync_state: 'pending', sync_error: null, missed_runs: 0 })
    .eq('id', commitmentId);
  if (markErr) return json({ success: false, error: `mark handled: ${markErr.message}` }, 500);

  const g = await resolveGmail();
  if (typeof g === 'string') return await fail(g, 'handled');

  const archived: string[] = [];
  const problems: string[] = [];
  for (const tid of g.threadIds) {
    try {
      const msgs = await readThread(g.accessToken, tid);
      if (msgs === null) continue;                      // thread not in this mailbox
      if (typeof msgs === 'string') { problems.push(msgs); continue; }
      const inInbox = msgs.filter((m) => (m.labelIds ?? []).includes('INBOX'));
      for (const m of inInbox) {
        // Remove INBOX by its system id. No label lookup: INBOX is not a
        // user label and findLabelByName would be an extra round trip that
        // can fail open.
        await modifyMessageLabels(g.accessToken, String(m.id), [], ['INBOX']);
        archived.push(String(m.id));
      }
    } catch (e: any) {
      problems.push(`thread ${tid}: ${e?.message ?? e}`);
    }
  }

  if (problems.length) return await fail(problems.join(' | '), 'handled');

  const { error: syncErr } = await supabase.from('commitment')
    .update({ sync_state: 'synced', sync_error: null }).eq('id', commitmentId);
  if (syncErr) return await fail(`sync flag: ${syncErr.message}`, 'handled');

  return json({
    success: true, action, status: 'handled', sync_state: 'synced',
    threads: g.threadIds.length, archived_messages: archived.length,
  });
});
