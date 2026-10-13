/**
 * commitment-action — the four answers the desk panel can give a commitment.
 *
 * ALL MUTATIONS LIVE HERE, not in the browser. `commitment` grants the
 * `authenticated` role SELECT and nothing else on purpose: the panel can read
 * its own rows but cannot write them, so an UPDATE grant plus a policy would be
 * two more things to get wrong. The caller is checked with caller-auth, which
 * resolves the JWT's OVIS user and runs is_internal_user() AS that user.
 *
 * HANDLED IS NOT DONE UNTIL GMAIL SAYS SO. status flips to 'handled' with
 * sync_state 'pending', the conversation's INBOX messages are archived, and
 * only Gmail's success response moves sync_state to 'synced'. A failure leaves
 * 'failed' plus sync_error, which the row shows in red. The panel never
 * presents an unsynced row as handled -- "I archived it" is a claim about
 * someone else's mailbox and has to be true.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { authorizeCaller } from '../_shared/caller-auth.ts';
import { refreshAccessToken, isTokenExpired, modifyMessageLabels } from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const ET = 'America/New_York';
/** CLAUDE.md: Eastern Time for every date operation. */
const etDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

type Action = 'handled' | 'flag' | 'skip' | 'reject';

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

  if (!commitmentId || !['handled', 'flag', 'skip', 'reject'].includes(action)) {
    return json({ success: false, error: 'commitment_id and action (handled|flag|skip|reject) are required' }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: row, error: readErr } = await supabase
    .from('commitment')
    .select('id, gmail_thread_id, conversation_thread_ids, gmail_connection_id, ball, what, reason_core, skip_count, status')
    .eq('id', commitmentId)
    .maybeSingle();
  if (readErr) return json({ success: false, error: `read: ${readErr.message}` }, 500);
  if (!row) return json({ success: false, error: 'commitment not found' }, 404);

  // ---- FLAG: stays in the inbox, stays on the panel, marked. ----
  if (action === 'flag') {
    const { error } = await supabase.from('commitment')
      .update({ status: 'flagged', missed_runs: 0 }).eq('id', commitmentId);
    if (error) return json({ success: false, error: `flag: ${error.message}` }, 500);
    return json({ success: true, action, status: 'flagged' });
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

  const fail = async (msg: string) => {
    await supabase.from('commitment')
      .update({ sync_state: 'failed', sync_error: msg.slice(0, 500) }).eq('id', commitmentId);
    return json({ success: false, action, status: 'handled', sync_state: 'failed', error: msg }, 502);
  };

  const { data: conn } = await supabase
    .from('gmail_connection')
    .select('id, google_email, access_token, refresh_token, token_expires_at')
    .eq('id', row.gmail_connection_id)
    .maybeSingle();
  if (!conn) return await fail('no gmail_connection on this commitment');

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  let accessToken = String(conn.access_token ?? '');
  try {
    if (isTokenExpired(conn.token_expires_at)) {
      const t = await refreshAccessToken(String(conn.refresh_token), clientId, clientSecret);
      accessToken = t.access_token;
      await supabase.from('gmail_connection').update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
      }).eq('id', conn.id);
    }
  } catch (e: any) {
    return await fail(`token refresh: ${e?.message ?? e}`);
  }

  // Every thread_id in the conversation, because a conversation can span more
  // than one: 23% of replies are stored under a different thread_id.
  const threadIds = [...new Set([
    String(row.gmail_thread_id),
    ...((row.conversation_thread_ids ?? []) as string[]),
  ].filter(Boolean))];

  const archived: string[] = [];
  const problems: string[] = [];
  for (const tid of threadIds) {
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}?format=minimal`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.status === 404) continue;                 // thread not in this mailbox
      if (!res.ok) { problems.push(`thread ${tid}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
      const thread = await res.json();
      const inInbox = (thread.messages ?? []).filter((m: any) => (m.labelIds ?? []).includes('INBOX'));
      for (const m of inInbox) {
        // Remove INBOX by its system id. No label lookup: INBOX is not a
        // user label and findLabelByName would be an extra round trip that
        // can fail open.
        await modifyMessageLabels(accessToken, String(m.id), [], ['INBOX']);
        archived.push(String(m.id));
      }
    } catch (e: any) {
      problems.push(`thread ${tid}: ${e?.message ?? e}`);
    }
  }

  if (problems.length) return await fail(problems.join(' | '));

  const { error: syncErr } = await supabase.from('commitment')
    .update({ sync_state: 'synced', sync_error: null }).eq('id', commitmentId);
  if (syncErr) return await fail(`sync flag: ${syncErr.message}`);

  return json({
    success: true, action, status: 'handled', sync_state: 'synced',
    threads: threadIds.length, archived_messages: archived.length,
  });
});
