/**
 * label-watcher — record Gmail label changes, and who made them.
 *
 * When the owner relabels a message by hand, that is a correction made in the
 * client they actually live in. Gmail cannot ask why, and OVIS has no surface
 * to ask on yet, so this accumulates the disagreements and nothing more:
 * no prompting, no rules, no behaviour change anywhere downstream.
 *
 * TELLING THE OWNER'S CHANGES FROM OVIS'S OWN
 * OVIS applying a label is also a label change, so every event has to be
 * attributed. Two mechanisms, both needed:
 *
 *   1. email_label is the ownership record, and the labeller writes its intent
 *      row BEFORE calling Gmail. So by the time an event can be observed, the
 *      row explaining it already exists.
 *   2. Attribution lags observation by LAG_SECONDS. Gmail's history records
 *      carry no timestamp, so an event can only be aged by when we saw it;
 *      attributing on sight would race a labeller mid-batch and credit the
 *      owner with OVIS's writes.
 *
 * Events therefore land as 'pending' and are attributed on a later pass.
 * Anything that cannot be attributed becomes 'ambiguous' rather than being
 * dropped: a miscredited correction is the failure being guarded against, so it
 * has to stay visible.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  GmailConnection,
  refreshAccessToken,
  isTokenExpired,
  listLabelHistory,
  listLabels,
  getGmailProfile,
} from '../_shared/gmail.ts';
import { authorizeCaller } from '../_shared/caller-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

/** How long an event must sit before it is attributed. */
const LAG_SECONDS = 60;

/** How far apart OVIS's own write and the observation may be and still count as
 *  the same act. Generous: a batch run can take minutes, and the cost of being
 *  too tight (crediting the owner with OVIS's write) is worse than being loose. */
const OVIS_MATCH_WINDOW_MINUTES = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const results: Record<string, unknown>[] = [];

  try {
    const { data: connections, error } = await supabase
      .from('gmail_connection').select('*').eq('is_active', true);
    if (error) throw new Error(`connections: ${error.message}`);

    for (const connection of (connections ?? []) as (GmailConnection & { last_label_history_id?: string | null })[]) {
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

      // First run: start from now. Backfilling history would produce events
      // whose OVIS counterpart predates email_label, i.e. unattributable noise.
      if (!connection.last_label_history_id) {
        const profile = await getGmailProfile(accessToken);
        await supabase.from('gmail_connection')
          .update({ last_label_history_id: profile.historyId })
          .eq('id', connection.id);
        results.push({
          mailbox: connection.google_email,
          initialised_at_history_id: profile.historyId,
          events_recorded: 0,
        });
        continue;
      }

      const { events, historyId, truncated } = await listLabelHistory(
        accessToken, connection.last_label_history_id,
      );

      // Gmail reports label ids; the table records names, which is what a human
      // reviewing this later needs to read.
      const labels = await listLabels(accessToken);
      const nameById = new Map(labels.map((l) => [l.id, l.name]));

      let recorded = 0;
      for (const ev of events) {
        for (const labelId of ev.labelIds) {
          const name = nameById.get(labelId) ?? labelId;
          // System labels churn constantly (UNREAD, CATEGORY_*, IMPORTANT) and
          // say nothing about classification. INBOX is kept: it is the archive
          // signal, and this system will eventually remove it itself.
          if (/^(UNREAD|STARRED|IMPORTANT|CATEGORY_|SENT|DRAFT|SPAM|TRASH|CHAT)/.test(labelId) && labelId !== 'INBOX') {
            continue;
          }

          const { data: known } = await supabase
            .from('emails').select('id, message_id').eq('gmail_id', ev.gmailId).limit(1);

          const { error: insErr } = await supabase.from('gmail_label_event').upsert({
            gmail_connection_id: connection.id,
            gmail_id: ev.gmailId,
            message_id: known?.[0]?.message_id ?? null,
            email_id: known?.[0]?.id ?? null,
            event_type: ev.type,
            label: name,
            history_id: ev.historyId,
            attribution: 'pending',
          }, { onConflict: 'gmail_id,label,event_type,history_id', ignoreDuplicates: true });
          if (!insErr) recorded++;
        }
      }

      // Only advance past what was read, same rule as the message watermark.
      if (!truncated) {
        await supabase.from('gmail_connection')
          .update({ last_label_history_id: historyId })
          .eq('id', connection.id);
      }

      results.push({
        mailbox: connection.google_email,
        events_seen: events.length,
        events_recorded: recorded,
        truncated,
        watermark: truncated ? connection.last_label_history_id : historyId,
      });
    }

    // ------------------------------------------------------------------
    // ATTRIBUTION PASS — anything observed more than LAG_SECONDS ago.
    // ------------------------------------------------------------------
    const cutoff = new Date(Date.now() - LAG_SECONDS * 1000).toISOString();
    const { data: pending } = await supabase
      .from('gmail_label_event')
      .select('id, gmail_id, label, event_type, observed_at, gmail_connection_id')
      .eq('attribution', 'pending')
      .lt('observed_at', cutoff)
      .limit(500);

    const counts = { owner: 0, ovis: 0, ambiguous: 0 };
    for (const ev of pending ?? []) {
      let attribution: 'owner' | 'ovis' | 'ambiguous' = 'owner';
      let note = 'no OVIS record of this label on this message';
      let ovisLabel: string | null = null;
      let ovisVerdict: string | null = null;

      // Outside the OVIS namespace, OVIS has never written it. Unambiguous.
      if (!ev.label.startsWith('OVIS/')) {
        note = 'label outside the OVIS namespace';
      } else {
        const { data: own } = await supabase
          .from('email_label')
          .select('label, source_verdict, applied_at, removed_at')
          .eq('gmail_id', ev.gmail_id)
          .eq('gmail_connection_id', ev.gmail_connection_id)
          .eq('label', ev.label)
          .limit(1);
        const row = own?.[0];
        if (row) {
          ovisLabel = row.label;
          ovisVerdict = row.source_verdict;
          const stamp = ev.event_type === 'added' ? row.applied_at : row.removed_at;
          if (stamp) {
            const deltaMin = Math.abs(
              (new Date(ev.observed_at).getTime() - new Date(stamp).getTime()) / 60000,
            );
            if (deltaMin <= OVIS_MATCH_WINDOW_MINUTES) {
              attribution = 'ovis';
              note = `matched OVIS ${ev.event_type} within ${deltaMin.toFixed(1)} min`;
            } else {
              attribution = 'ambiguous';
              note = `OVIS row exists but ${deltaMin.toFixed(0)} min away from the event`;
            }
          } else {
            // OVIS intended this label but never confirmed the call. Cannot say
            // whose action the event was.
            attribution = 'ambiguous';
            note = `OVIS row exists with no ${ev.event_type === 'added' ? 'applied_at' : 'removed_at'}`;
          }
        }
      }

      // Whatever OVIS currently thinks this message is, for later review.
      if (!ovisLabel) {
        const { data: live } = await supabase
          .from('email_label')
          .select('label, source_verdict')
          .eq('gmail_id', ev.gmail_id)
          .is('removed_at', null)
          .not('applied_at', 'is', null)
          .limit(1);
        ovisLabel = live?.[0]?.label ?? null;
        ovisVerdict = live?.[0]?.source_verdict ?? null;
      }

      await supabase.from('gmail_label_event').update({
        attribution,
        attributed_at: new Date().toISOString(),
        attribution_note: note,
        ovis_label: ovisLabel,
        ovis_verdict: ovisVerdict,
      }).eq('id', ev.id);
      counts[attribution]++;
    }

    return new Response(JSON.stringify({
      success: true, mailboxes: results, attributed: counts,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[label-watcher]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), mailboxes: results }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
