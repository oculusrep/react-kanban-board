// Drains the pending_client_comment_email queue:
//   - Finds rows where last_comment_at < NOW() - 20 minutes
//   - For each, gathers the client-visible portal-user comments since first_comment_at
//   - Looks up brokers from client_broker
//   - Sends one Resend email per row, then deletes the queue row
//
// Designed to be triggered every ~5 min by Supabase cron.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderCommentAlertEmail, CommentAlertItem } from '../_shared/portalEmailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEBOUNCE_MINUTES = 20;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const cutoff = new Date(Date.now() - DEBOUNCE_MINUTES * 60 * 1000).toISOString();

    const { data: pending, error: pendingError } = await supabase
      .from('pending_client_comment_email')
      .select('*')
      .lt('last_comment_at', cutoff);

    if (pendingError) throw pendingError;

    if (!pending || pending.length === 0) {
      return jsonResponse({ success: true, message: 'No pending alerts to send', sent: 0 });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('RESEND_API_KEY not configured');

    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'notifications@oculusrep.com';
    const portalBaseUrl = Deno.env.get('FRONTEND_URL') ?? 'https://ovis.oculusrep.com';

    const results: Array<{ pendingId: string; ok: boolean; error?: string }> = [];

    for (const row of pending) {
      try {
        const result = await processQueueRow(supabase, row, resendApiKey, fromEmail, portalBaseUrl);
        results.push({ pendingId: row.id, ok: result.ok, error: result.error });
      } catch (err: any) {
        console.error(`[Portal Comment Alert] Error processing ${row.id}:`, err);
        results.push({ pendingId: row.id, ok: false, error: err?.message || String(err) });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    return jsonResponse({
      success: true,
      message: `Processed ${pending.length} pending row(s); ${successCount} succeeded`,
      sent: successCount,
      results,
    });
  } catch (error: any) {
    console.error('[Portal Comment Alert] Top-level error:', error);
    return jsonResponse({ success: false, error: error?.message || String(error) }, 500);
  }
});

async function processQueueRow(
  supabase: any,
  row: any,
  resendApiKey: string,
  fromEmail: string,
  portalBaseUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const { client_id, site_submit_id, first_comment_at } = row;

  // Look up client + site submit metadata
  const [{ data: client }, { data: siteSubmit }] = await Promise.all([
    supabase.from('client').select('id, client_name').eq('id', client_id).single(),
    supabase.from('site_submit').select('id, site_submit_name').eq('id', site_submit_id).single(),
  ]);

  if (!client || !siteSubmit) {
    await supabase.from('pending_client_comment_email').delete().eq('id', row.id);
    return { ok: false, error: 'Client or site_submit no longer exists' };
  }

  // Fetch the comments included in this debounce window
  const { data: comments, error: commentsError } = await supabase
    .from('site_submit_comment')
    .select('id, content, created_at, author_id')
    .eq('site_submit_id', site_submit_id)
    .eq('visibility', 'client')
    .gte('created_at', first_comment_at)
    .order('created_at', { ascending: true });

  if (commentsError) throw commentsError;

  if (!comments || comments.length === 0) {
    // Nothing to send (probably deleted) — clear the queue row
    await supabase.from('pending_client_comment_email').delete().eq('id', row.id);
    return { ok: false, error: 'No comments matched the debounce window' };
  }

  // Resolve author display names (from contact via portal_auth_user_id)
  const authorIds = Array.from(new Set(comments.map((c: any) => c.author_id).filter(Boolean)));
  const { data: authorContacts } = await supabase
    .from('contact')
    .select('first_name, last_name, portal_auth_user_id')
    .in('portal_auth_user_id', authorIds);

  const nameByAuthId = new Map<string, string>();
  for (const c of authorContacts || []) {
    const full = [c.first_name, c.last_name].filter(Boolean).join(' ');
    if (full && c.portal_auth_user_id) nameByAuthId.set(c.portal_auth_user_id, full);
  }

  const items: CommentAlertItem[] = comments.map((c: any) => ({
    text: c.content,
    created_at: c.created_at,
    author_name: nameByAuthId.get(c.author_id) || null,
  }));

  // Look up brokers + their emails
  const { data: brokerLinks, error: brokerError } = await supabase
    .from('client_broker')
    .select('user_id, user:user_id (id, email, first_name, last_name)')
    .eq('client_id', client_id)
    .eq('is_active', true);

  if (brokerError) throw brokerError;

  const recipients: string[] = (brokerLinks || [])
    .map((row: any) => row.user?.email)
    .filter((e: any) => typeof e === 'string' && e.length > 0);

  if (recipients.length === 0) {
    await supabase.from('pending_client_comment_email').delete().eq('id', row.id);
    return { ok: false, error: 'No active brokers on this client' };
  }

  // Determine reply-to: the actual portal user (so broker replies bypass OVIS).
  // Use the most recent commenter's email. If multiple authors, prefer that.
  const lastCommenterAuthId = comments[comments.length - 1].author_id;
  let replyToEmail: string | undefined;
  if (lastCommenterAuthId) {
    const { data: authContact } = await supabase
      .from('contact')
      .select('email')
      .eq('portal_auth_user_id', lastCommenterAuthId)
      .single();
    if (authContact?.email) replyToEmail = authContact.email;
  }

  // Broker-facing link: opens the OVIS site submit edit page (not a portal route).
  const portalLink = `${portalBaseUrl}/site-submit/${site_submit_id}`;

  const { subject, html, text } = renderCommentAlertEmail({
    clientName: client.client_name || 'Client',
    siteSubmitName: siteSubmit.site_submit_name || 'site submit',
    comments: items,
    portalLink,
  });

  const fromHeader = `${client.client_name || 'Client'} via OVIS <${fromEmail}>`;

  const sendBody: Record<string, unknown> = {
    from: fromHeader,
    to: recipients,
    subject,
    html,
    text,
  };
  if (replyToEmail) sendBody.reply_to = [replyToEmail];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify(sendBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Log to portal_email_send as failed; keep queue row for retry on next cron tick
    await supabase.from('portal_email_send').insert({
      client_id,
      triggered_by_id: null,
      direction: 'client_to_broker',
      scope: null,
      site_submit_id,
      recipients,
      cc: [],
      subject,
      body_html: html,
      activity_ids: [],
      provider: 'resend',
      status: 'failed',
      error: errText,
    });
    return { ok: false, error: `Resend HTTP ${res.status}: ${errText}` };
  }

  const sendResult = await res.json();

  // Insert audit row
  const { data: sendRow, error: insertError } = await supabase
    .from('portal_email_send')
    .insert({
      client_id,
      triggered_by_id: null,
      direction: 'client_to_broker',
      scope: null,
      site_submit_id,
      recipients,
      cc: [],
      subject,
      body_html: html,
      activity_ids: [],
      provider: 'resend',
      provider_message_id: sendResult.id || null,
      status: 'sent',
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[Portal Comment Alert] portal_email_send insert error:', insertError);
  }

  // Mark related activity rows as sent
  if (sendRow?.id) {
    const commentIds = comments.map((c: any) => c.id);
    if (commentIds.length > 0) {
      await supabase
        .from('site_submit_activity')
        .update({ included_in_send_id: sendRow.id })
        .eq('site_submit_id', site_submit_id)
        .eq('activity_type', 'comment')
        .in('payload->>comment_id', commentIds)
        .is('included_in_send_id', null);
    }
  }

  // Clear the queue
  await supabase.from('pending_client_comment_email').delete().eq('id', row.id);

  return { ok: true };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
