// Sends a broker→client digest from the broker's Gmail.
//
// Request body:
//   {
//     clientId: string,
//     brokerUserId: string,            // broker's `user.id` (auth_user_id used to look up gmail_connection)
//     scope: 'site_submit' | 'client_all',
//     siteSubmitId?: string,           // required when scope = 'site_submit'
//     timeRange: 'today' | 'since_last_send',
//     customNote?: string | null
//   }
//
// Response includes the activity ids included so the client UI can refresh.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, refreshAccessToken, isTokenExpired } from '../_shared/gmail.ts';
import { renderDigestEmail, DigestActivityItem } from '../_shared/portalEmailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DigestRequest {
  clientId: string;
  brokerUserId: string;
  scope: 'site_submit' | 'client_all';
  siteSubmitId?: string;
  timeRange: 'today' | 'since_last_send';
  customNote?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as DigestRequest;
    const { clientId, brokerUserId, scope, siteSubmitId, timeRange, customNote } = body;

    if (!clientId || !brokerUserId || !scope || !timeRange) {
      return jsonResponse({ success: false, error: 'Missing required fields' }, 400);
    }
    if (scope === 'site_submit' && !siteSubmitId) {
      return jsonResponse({ success: false, error: 'siteSubmitId required when scope = site_submit' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Look up broker info + auth_user_id for gmail_connection lookup
    const { data: brokerRow, error: brokerError } = await supabase
      .from('user')
      .select('id, auth_user_id, name, first_name, last_name, email')
      .eq('id', brokerUserId)
      .single();

    if (brokerError || !brokerRow) {
      return jsonResponse({ success: false, error: 'Broker user not found' }, 404);
    }
    if (!brokerRow.auth_user_id) {
      return jsonResponse({ success: false, error: 'Broker has no auth_user_id; cannot resolve Gmail connection' }, 400);
    }

    // 2. Look up Gmail connection
    const { data: gmail, error: gmailError } = await supabase
      .from('gmail_connection')
      .select('*')
      .eq('user_id', brokerRow.auth_user_id)
      .eq('is_active', true)
      .single();

    if (gmailError || !gmail) {
      return jsonResponse(
        { success: false, error: 'No active Gmail connection for this broker. Connect Gmail first.', code: 'GMAIL_NOT_CONNECTED' },
        400
      );
    }

    // 3. Look up client + (optionally) site submit
    const { data: client, error: clientError } = await supabase
      .from('client')
      .select('id, client_name')
      .eq('id', clientId)
      .single();
    if (clientError || !client) {
      return jsonResponse({ success: false, error: 'Client not found' }, 404);
    }

    let siteSubmit: any = null;
    if (siteSubmitId) {
      const { data, error } = await supabase
        .from('site_submit')
        .select('id, site_submit_name')
        .eq('id', siteSubmitId)
        .single();
      if (error || !data) return jsonResponse({ success: false, error: 'Site submit not found' }, 404);
      siteSubmit = data;
    }

    // 4. Determine time range cutoff
    let sinceIso: string;
    if (timeRange === 'today') {
      // Eastern-time midnight per CLAUDE.md
      sinceIso = startOfTodayEasternIso();
    } else {
      // since_last_send: find the most recent broker→client send for this scope
      let lastSendQuery = supabase
        .from('portal_email_send')
        .select('sent_at')
        .eq('client_id', clientId)
        .eq('direction', 'broker_to_client')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1);
      if (scope === 'site_submit') lastSendQuery = lastSendQuery.eq('site_submit_id', siteSubmitId);
      const { data: lastSend } = await lastSendQuery.single();
      sinceIso = lastSend?.sent_at || startOfTodayEasternIso();
    }

    // 5. Pull activity rows in scope + time window
    let activityQuery = supabase
      .from('site_submit_activity')
      .select('id, site_submit_id, activity_type, actor_user_id, actor_kind, payload, created_at')
      .eq('client_id', clientId)
      .eq('client_visible', true)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true });

    if (scope === 'site_submit') activityQuery = activityQuery.eq('site_submit_id', siteSubmitId);

    const { data: activities, error: activityError } = await activityQuery;
    if (activityError) throw activityError;

    if (!activities || activities.length === 0) {
      return jsonResponse({ success: false, error: 'No new activity in selected window' }, 200);
    }

    // 6. Hydrate site_submit names for grouping
    const ssIds = Array.from(new Set(activities.map((a: any) => a.site_submit_id)));
    const { data: ssNames } = await supabase
      .from('site_submit')
      .select('id, site_submit_name')
      .in('id', ssIds);
    const nameById = new Map<string, string>();
    for (const r of ssNames || []) nameById.set(r.id, r.site_submit_name || 'Site submit');

    const activityItems: DigestActivityItem[] = activities.map((a: any) => ({
      type: a.activity_type,
      created_at: a.created_at,
      payload: a.payload || {},
      actor_name: null,
      site_submit_id: a.site_submit_id,
      site_submit_name: nameById.get(a.site_submit_id) || 'Site submit',
    }));

    // 7. Resolve recipients = portal users with access to this client AND opted in
    const { data: accessRows, error: accessError } = await supabase
      .from('portal_user_client_access')
      .select(`
        contact_id,
        contact:contact_id (id, first_name, last_name, email, email_alerts_opt_in, portal_access_enabled)
      `)
      .eq('client_id', clientId)
      .eq('is_active', true);
    if (accessError) throw accessError;

    const recipients = (accessRows || [])
      .map((row: any) => row.contact)
      .filter((c: any) => c?.email && c?.portal_access_enabled !== false && c?.email_alerts_opt_in !== false)
      .map((c: any) => c.email);

    if (recipients.length === 0) {
      return jsonResponse(
        { success: false, error: 'No opted-in portal users with email on this client' },
        400
      );
    }

    // 8. CC = other brokers on the deal team for this client (excluding sender)
    const { data: brokerLinks } = await supabase
      .from('client_broker')
      .select('user:user_id (id, email)')
      .eq('client_id', clientId)
      .eq('is_active', true);
    const ccList: string[] = (brokerLinks || [])
      .map((row: any) => row.user?.email)
      .filter((e: any) => typeof e === 'string' && e.length > 0 && e !== gmail.google_email);
    // BCC the broker's own address — matches existing pattern
    const bccList: string[] = [gmail.google_email];

    // 9. Refresh Gmail token if expired
    let accessToken = gmail.access_token;
    if (isTokenExpired(gmail.token_expires_at)) {
      const refreshResult = await refreshAccessToken(
        gmail.refresh_token,
        Deno.env.get('GOOGLE_CLIENT_ID')!,
        Deno.env.get('GOOGLE_CLIENT_SECRET')!
      );
      accessToken = refreshResult.access_token;
      const newExpiresAt = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString();
      await supabase
        .from('gmail_connection')
        .update({ access_token: accessToken, token_expires_at: newExpiresAt })
        .eq('id', gmail.id);
    }

    // 10. Build the email
    const portalBaseUrl = Deno.env.get('FRONTEND_URL') ?? 'https://ovis.oculusrep.com';
    const portalLink =
      scope === 'site_submit'
        ? `${portalBaseUrl}/portal/pipeline?stage=recent_changes&selected=${siteSubmitId}`
        : `${portalBaseUrl}/portal/pipeline?stage=recent_changes`;

    const brokerName =
      brokerRow.name ||
      [brokerRow.first_name, brokerRow.last_name].filter(Boolean).join(' ') ||
      gmail.google_email;

    const { subject, html, text } = renderDigestEmail({
      brokerName,
      clientName: client.client_name || 'Client',
      scope,
      scopeLabel: siteSubmit?.site_submit_name || client.client_name || 'your projects',
      customNote: customNote || null,
      activities: activityItems,
      portalLink,
    });

    // 11. Send via Gmail
    const sendResult = await sendEmail(accessToken, gmail.google_email, {
      to: recipients,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList,
      subject,
      bodyHtml: html,
      bodyText: text,
      fromName: brokerName,
    });

    // 12. Audit log (sent or failed)
    const activityIds = activities.map((a: any) => a.id);
    const { data: sendRow, error: insertError } = await supabase
      .from('portal_email_send')
      .insert({
        client_id: clientId,
        triggered_by_id: brokerRow.auth_user_id,
        direction: 'broker_to_client',
        scope,
        site_submit_id: siteSubmitId || null,
        recipients,
        cc: ccList,
        subject,
        body_html: html,
        activity_ids: activityIds,
        provider: 'gmail',
        provider_message_id: sendResult.messageId || null,
        status: sendResult.success ? 'sent' : 'failed',
        error: sendResult.success ? null : sendResult.error || 'Unknown send error',
      })
      .select('id')
      .single();

    if (insertError) console.error('[Portal Digest] Insert audit error:', insertError);

    if (!sendResult.success) {
      return jsonResponse({ success: false, error: sendResult.error || 'Gmail send failed' }, 500);
    }

    // 13. Mark activities as included in this send
    if (sendRow?.id && activityIds.length > 0) {
      await supabase
        .from('site_submit_activity')
        .update({ included_in_send_id: sendRow.id })
        .in('id', activityIds)
        .is('included_in_send_id', null);
    }

    return jsonResponse({
      success: true,
      messageId: sendResult.messageId,
      recipients,
      cc: ccList,
      activityIdsIncluded: activityIds,
    });
  } catch (error: any) {
    console.error('[Portal Digest] Error:', error);
    return jsonResponse({ success: false, error: error?.message || String(error) }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function startOfTodayEasternIso(): string {
  // Compute "today midnight" in America/New_York and return as ISO UTC.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  // Build a Date for midnight ET, then re-emit as UTC ISO
  // We construct via a string with a known TZ offset by relying on Intl-derived
  // local components and current Eastern offset.
  // Simpler approach: compute current ET offset by subtracting NY-formatted now from UTC now.
  const nyNow = new Date(`${y}-${m}-${d}T${get('hour')}:${get('minute')}:${get('second')}`);
  const offsetMs = now.getTime() - nyNow.getTime();
  const midnightEtAsUtc = new Date(`${y}-${m}-${d}T00:00:00.000Z`).getTime() - offsetMs;
  return new Date(midnightEtAsUtc).toISOString();
}
