/**
 * email-ingestion-alert-dispatch
 *
 * Sends the email-ingestion staleness alert, and its all-clear, via Resend.
 *
 * WHY RESEND AND NOT AN IN-APP ROW: the alert reports that OVIS has stopped
 * pulling from Gmail. Any channel downstream of that pull is invisible during
 * exactly the failure it reports. Resend is outbound-only and untouched by an
 * ingestion stall, so the alert lands in a working inbox. (merchant_closure_alert
 * was considered and rejected -- it has no dispatcher at all, only an admin tab,
 * which is the "row in a table nobody looks at" case.)
 *
 * THE RULE THIS FUNCTION HAS TO OBEY ABOUT ITSELF: a status signal reports that a
 * step RAN, never that it PRODUCED anything. `notified` therefore flips ONLY after
 * Resend returns a message id -- not because fetch() resolved, not because the
 * request was made. A dispatcher that marks "sent" on a request is the same bug as
 * gmail-sync returning HTTP 200 while delivering nothing, which is the incident
 * that caused this function to exist.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALERT_TO = (Deno.env.get('INGESTION_ALERT_TO') ?? 'mike@oculusrep.com')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** Returns the Resend message id, or throws. Never returns on an unconfirmed send. */
async function sendViaResend(subject: string, html: string): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: ALERT_TO, subject, html }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${text.slice(0, 300)}`);

  // Confirm the BODY, not just the status. Resend returns { id: "..." } on success.
  let body: { id?: string; message?: string };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Resend returned unparseable body: ${text.slice(0, 300)}`);
  }
  if (!body?.id) throw new Error(`Resend returned no message id: ${text.slice(0, 300)}`);
  return body.id;
}

function fmtGap(mins: number): string {
  const m = Number(mins);
  if (m < 90) return `${m.toFixed(0)} minutes`;
  return `${(m / 60).toFixed(1)} hours (${m.toFixed(0)} minutes)`;
}

const et = (ts: string | null) =>
  ts ? new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET' : 'never';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const sent: string[] = [];
  const failed: string[] = [];

  try {
    // ONE EMAIL PER STALL, not one per run: the alert row is already
    // one-open-per-stall, so the flags on that row are the throttle.
    const { data: rows, error } = await supabase
      .from('email_ingestion_alert')
      .select('*')
      .or('notified.eq.false,and(resolved_at.not.is.null,resolved_notified.eq.false)')
      .order('fired_at', { ascending: true });

    if (error) throw new Error(`query failed: ${error.message}`);

    for (const row of rows ?? []) {
      const needsStall = !row.notified;
      const needsClear = row.resolved_at && !row.resolved_notified;

      // A stall that resolved before we ever announced it: send the stall notice
      // anyway. An 8-hour outage that self-heals overnight still has to be seen.
      if (needsStall) {
        const subject = `[OVIS] Email ingestion stalled — ${fmtGap(row.gap_minutes)}`;
        const html = `
          <h2 style="color:#002147;font-family:system-ui,sans-serif">Email ingestion has stalled</h2>
          <p style="font-family:system-ui,sans-serif;color:#002147">
            OVIS has not ingested any email for <strong>${fmtGap(row.gap_minutes)}</strong>.
          </p>
          <table style="font-family:system-ui,sans-serif;color:#002147;border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0">Last email received</td>
                <td style="padding:4px 0"><strong>${et(row.last_received_at)}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0">Gap at detection</td>
                <td style="padding:4px 0"><strong>${fmtGap(row.gap_minutes)}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0">Detected</td>
                <td style="padding:4px 0">${et(row.fired_at)}</td></tr>
          </table>
          <p style="font-family:system-ui,sans-serif;color:#4A6B94">
            Normal weekday volume is roughly one email every 5 minutes.
            <strong>gmail-sync can return HTTP 200 while delivering nothing</strong> — on
            2026-09-07 the cron reported 432 successful runs through an 8-hour outage — so
            check the gmail-sync function logs, not the cron status.
          </p>`;
        try {
          const id = await sendViaResend(subject, html);
          await supabase.from('email_ingestion_alert')
            .update({ notified: true, notify_error: null,
                      notify_attempts: (row.notify_attempts ?? 0) + 1 })
            .eq('id', row.id);
          sent.push(`stall:${row.id}:${id}`);
        } catch (e) {
          // Leave notified=false so the next run retries.
          await supabase.from('email_ingestion_alert')
            .update({ notify_error: String(e).slice(0, 500),
                      notify_attempts: (row.notify_attempts ?? 0) + 1 })
            .eq('id', row.id);
          failed.push(`stall:${row.id}:${e}`);
        }
      }

      if (needsClear) {
        const downFor = row.resolved_at && row.fired_at
          ? fmtGap((new Date(row.resolved_at).getTime() - new Date(row.fired_at).getTime()) / 60000)
          : 'unknown';
        const subject = '[OVIS] Email ingestion recovered';
        const html = `
          <h2 style="color:#002147;font-family:system-ui,sans-serif">Email ingestion has recovered</h2>
          <p style="font-family:system-ui,sans-serif;color:#002147">
            Mail is arriving again. The alert opened at ${et(row.fired_at)} and stayed open for
            <strong>${downFor}</strong>.
          </p>
          <p style="font-family:system-ui,sans-serif;color:#4A6B94">
            Gap at detection was ${fmtGap(row.gap_minutes)}; last email before recovery was
            ${et(row.last_received_at)}.
          </p>`;
        try {
          const id = await sendViaResend(subject, html);
          await supabase.from('email_ingestion_alert')
            .update({ resolved_notified: true, notify_error: null })
            .eq('id', row.id);
          sent.push(`clear:${row.id}:${id}`);
        } catch (e) {
          await supabase.from('email_ingestion_alert')
            .update({ notify_error: String(e).slice(0, 500) })
            .eq('id', row.id);
          failed.push(`clear:${row.id}:${e}`);
        }
      }
    }

    // Report failures as a non-200 so a silently-failing alerter is itself visible.
    return new Response(
      JSON.stringify({ success: failed.length === 0, sent, failed, considered: rows?.length ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: failed.length ? 500 : 200 }
    );
  } catch (e) {
    console.error('[ingestion-alert-dispatch]', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
