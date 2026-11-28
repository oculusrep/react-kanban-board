/**
 * label-canary — prove the label pipeline works, or say so loudly.
 *
 * Six times on this project a green status has meant nothing happened. Most
 * recently the watcher itself reported events_recorded: 0 for three days while
 * every insert failed. A longer measurement window does not fix that; a check
 * that can come back NEGATIVE does.
 *
 * WHAT IT ASSERTS (not "a row exists" -- specific expected values):
 *   applied       label put on the canary message WITHOUT an email_label row,
 *                 so the watcher must attribute it to the OWNER.
 *   verified_add  a gmail_label_event row exists for that add with
 *                 attribution = 'owner' AND gesture = 'correction'.
 *   removed       label taken off again.
 *   verified      a row exists for the removal with attribution = 'owner' AND
 *                 gesture = 'handled'. Cycle complete, clock reset.
 *
 * HOW IT FAILS, which is the part that matters:
 *   - nothing observed within OBSERVE_DEADLINE_MIN of a state change
 *   - a row observed with the WRONG attribution or the WRONG gesture
 *   - a cycle not completing within CYCLE_DEADLINE_MIN
 * Any of those opens an email_canary_alert row, which the existing
 * email-ingestion-alert-dispatch drains on the same path as the classifier
 * health alert. Recovery closes it and sends the all-clear.
 *
 * The canary's own events never pollute the correction set: label-watcher
 * stamps excluded = true on any event whose gmail_id matches an email_canary
 * row, so exclusion is structural rather than a filter someone must remember.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  GmailConnection,
  refreshAccessToken,
  isTokenExpired,
  applyLabelToMessage,
  removeLabelFromMessage,
  sendEmail,
  modifyMessageLabels,
} from '../_shared/gmail.ts';
import { authorizeCaller } from '../_shared/caller-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

/**
 * A state must produce its evidence within this.
 *
 * Set from the WORST case, not the happy path. The happy path is ~16 min
 * (5 min watcher + 60s attribution + 10 min pairing window). But both
 * classification passes process 500 rows per run, so after a busy day the
 * canary's own event can sit behind a queue -- which is exactly what produced
 * 110 false failures on 2026-09-29: the pipeline was fine, the backlog was
 * draining, and the canary called it broken. A real outage still trips the
 * 60-minute cycle deadline.
 */
const OBSERVE_DEADLINE_MIN = 35;

/** A whole add/remove cycle must complete within this, or the pipeline is stuck
 *  somewhere the per-state deadline did not catch. */
const CYCLE_DEADLINE_MIN = 90;

type CanaryRow = {
  id: string;
  gmail_connection_id: string;
  gmail_id: string;
  label: string;
  state: string;
  state_at: string;
  consecutive_failures: number;
  last_success_at: string | null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const report: Record<string, unknown>[] = [];

  let init = false;
  let initMailbox: string | null = null;
  try {
    const body = await req.json();
    init = body?.init === true;
    initMailbox = body?.mailbox ?? null;
  } catch { /* no body: normal tick */ }

  // ------------------------------------------------------------------
  // init: create the dedicated canary message once, and archive it so it never
  // sits in the inbox. Its own label churn is excluded from the correction set
  // by the watcher, which reads email_canary.
  // ------------------------------------------------------------------
  if (init) {
    const { data: conns } = await supabase.from('gmail_connection')
      .select('*').eq('is_active', true).eq('google_email', initMailbox ?? '').limit(1);
    const connection = conns?.[0] as GmailConnection | undefined;
    if (!connection) {
      return new Response(JSON.stringify({ success: false, error: 'mailbox not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let token = connection.access_token;
    if (isTokenExpired(connection.token_expires_at)) {
      const t = await refreshAccessToken(connection.refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      token = t.access_token;
      await supabase.from('gmail_connection').update({
        access_token: token,
        token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      }).eq('id', connection.id);
    }

    const sent = await sendEmail(token, connection.google_email, {
      to: [connection.google_email],
      subject: 'OVIS label pipeline canary — do not delete',
      bodyText:
        'This message exists so OVIS can prove, every cycle, that a label change in Gmail is ' +
        'actually recorded and classified correctly. It is archived and labelled automatically. ' +
        'Its label changes are excluded from the correction set. Deleting it disables the check.',
    });
    if (!sent.success || !sent.messageId) {
      return new Response(JSON.stringify({ success: false, error: sent.error ?? 'send failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Archive immediately: the canary must not occupy the owner's inbox.
    try { await modifyMessageLabels(token, sent.messageId, [], ['INBOX']); } catch { /* best effort */ }

    await supabase.from('email_canary').upsert({
      gmail_connection_id: connection.id,
      gmail_id: sent.messageId,
      label: 'OVIS/Canary',
      state: 'idle',
      state_at: new Date().toISOString(),
    }, { onConflict: 'gmail_connection_id' });

    return new Response(JSON.stringify({
      success: true, initialised: { mailbox: connection.google_email, gmail_id: sent.messageId },
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  /** Open an alert unless one is already open. One email per incident. */
  async function fail(canary: CanaryRow, reason: string, detail: string) {
    await supabase.from('email_canary')
      .update({
        state: 'failed',
        state_at: new Date().toISOString(),
        last_failure_at: new Date().toISOString(),
        last_failure_reason: `${reason}: ${detail}`.slice(0, 500),
        consecutive_failures: (canary.consecutive_failures ?? 0) + 1,
      })
      .eq('id', canary.id);

    const { data: open } = await supabase
      .from('email_canary_alert').select('id').is('resolved_at', null).limit(1);
    if (!open?.length) {
      await supabase.from('email_canary_alert').insert({
        reason,
        detail: detail.slice(0, 1000),
        stuck_state: canary.state,
        stuck_since: canary.state_at,
      });
    }
    report.push({ canary: canary.id, result: 'FAIL', reason, detail });
  }

  /** Close any open alert. Recovery is as reportable as failure. */
  async function clearAlerts() {
    await supabase.from('email_canary_alert')
      .update({ resolved_at: new Date().toISOString() })
      .is('resolved_at', null);
  }

  try {
    const { data: canaries, error } = await supabase
      .from('email_canary').select('*').eq('is_active', true);
    if (error) throw new Error(`canary read: ${error.message}`);

    for (const canary of (canaries ?? []) as CanaryRow[]) {
      const { data: connRows } = await supabase
        .from('gmail_connection').select('*').eq('id', canary.gmail_connection_id).limit(1);
      const connection = connRows?.[0] as GmailConnection | undefined;
      if (!connection) {
        await fail(canary, 'connection_missing', `gmail_connection ${canary.gmail_connection_id} not found`);
        continue;
      }

      let accessToken = connection.access_token;
      if (isTokenExpired(connection.token_expires_at)) {
        const t = await refreshAccessToken(connection.refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
        accessToken = t.access_token;
        await supabase.from('gmail_connection').update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', connection.id);
      }

      const ageMin = (Date.now() - new Date(canary.state_at).getTime()) / 60000;

      // A cycle that never finishes is its own failure, separate from any one
      // state's deadline: it catches a stall the per-state checks would sit in.
      if (canary.state !== 'idle' && canary.state !== 'failed' && ageMin > CYCLE_DEADLINE_MIN) {
        await fail(canary, 'cycle_timeout',
          `stuck in ${canary.state} for ${ageMin.toFixed(0)} min (limit ${CYCLE_DEADLINE_MIN})`);
        continue;
      }

      /** The event the watcher should have recorded for this half of the cycle. */
      async function expectEvent(type: 'added' | 'removed', wantGesture: 'correction' | 'handled') {
        const { data: rows } = await supabase
          .from('gmail_label_event')
          .select('id, attribution, gesture, observed_at, attribution_note, gesture_note')
          .eq('gmail_id', canary.gmail_id)
          .eq('label', canary.label)
          .eq('event_type', type)
          .gte('observed_at', canary.state_at)
          .order('observed_at', { ascending: false })
          .limit(1);
        const row = rows?.[0];

        if (!row) {
          if (ageMin > OBSERVE_DEADLINE_MIN) {
            await fail(canary, 'event_not_recorded',
              `no ${type} event for the canary ${ageMin.toFixed(0)} min after the label change ` +
              `(limit ${OBSERVE_DEADLINE_MIN}). The watcher is not recording.`);
            return 'failed';
          }
          report.push({ canary: canary.id, result: 'waiting', state: canary.state, age_min: +ageMin.toFixed(1) });
          return 'waiting';
        }

        if (row.gesture === 'pending' || row.attribution === 'pending') {
          if (ageMin > OBSERVE_DEADLINE_MIN) {
            await fail(canary, 'classification_stalled',
              `${type} event recorded but still attribution=${row.attribution} gesture=${row.gesture} ` +
              `after ${ageMin.toFixed(0)} min. A classification pass is not running.`);
            return 'failed';
          }
          return 'waiting';
        }

        // The assertions. A canary that accepted any value would be the same
        // self-confirming check that failed six times already.
        if (row.attribution !== 'owner') {
          await fail(canary, 'wrong_attribution',
            `${type} event attributed '${row.attribution}', expected 'owner'. ` +
            `The canary writes no email_label row, so anything else means attribution is broken. ` +
            `note=${row.attribution_note ?? ''}`);
          return 'failed';
        }
        if (row.gesture !== wantGesture) {
          await fail(canary, 'wrong_gesture',
            `${type} event classified '${row.gesture}', expected '${wantGesture}'. ` +
            `note=${row.gesture_note ?? ''}`);
          return 'failed';
        }
        return 'ok';
      }

      switch (canary.state) {
        case 'idle':
        case 'failed': {
          // REMOVE FIRST. Applying a label Gmail already has is a silent no-op:
          // no history record, so no event, so the canary reads "the watcher is
          // not recording" and fails forever. That is how a failed cycle wedged
          // itself into 110 identical failures on 2026-09-29 -- the probe could
          // not tell "nothing to observe" from "nothing observed". Clearing the
          // label first guarantees the apply produces a real change.
          await removeLabelFromMessage(accessToken, canary.gmail_id, canary.label);

          // No email_label row is written -- deliberate, and it is what makes
          // the watcher treat this as the owner's gesture.
          const res = await applyLabelToMessage(accessToken, canary.gmail_id, canary.label);
          if (!res.success) {
            await fail(canary, 'apply_failed', res.error ?? 'unknown');
            break;
          }
          await supabase.from('email_canary')
            .update({ state: 'applied', state_at: new Date().toISOString() })
            .eq('id', canary.id);
          report.push({ canary: canary.id, result: 'applied' });
          break;
        }

        case 'applied': {
          const verdict = await expectEvent('added', 'correction');
          if (verdict === 'ok') {
            const res = await removeLabelFromMessage(accessToken, canary.gmail_id, canary.label);
            if (!res.success) {
              await fail(canary, 'remove_failed', res.error ?? 'unknown');
              break;
            }
            await supabase.from('email_canary')
              .update({ state: 'removed', state_at: new Date().toISOString() })
              .eq('id', canary.id);
            report.push({ canary: canary.id, result: 'add_verified_then_removed' });
          }
          break;
        }

        case 'verified_add':
        case 'removed': {
          const verdict = await expectEvent('removed', 'handled');
          if (verdict === 'ok') {
            await supabase.from('email_canary')
              .update({
                state: 'idle',
                state_at: new Date().toISOString(),
                last_success_at: new Date().toISOString(),
                consecutive_failures: 0,
                last_failure_reason: null,
              })
              .eq('id', canary.id);
            await clearAlerts();
            report.push({ canary: canary.id, result: 'CYCLE_PASSED' });
          }
          break;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, report }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[label-canary]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), report }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
