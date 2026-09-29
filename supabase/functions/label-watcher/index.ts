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

/**
 * How far apart a removal and an addition may be and still be one gesture.
 *
 * A move in the Gmail UI is two history records milliseconds apart; a manual
 * remove-then-add is seconds. 10 minutes is far wider than either and far
 * narrower than the gap between work sessions. It must also exceed LAG_SECONDS,
 * or a removal would be classified before its partner addition was attributed.
 *
 * Biased wide deliberately: too narrow loses a correction silently (it reads as
 * 'handled'), too wide merges two gestures into one, which is visible in the
 * timestamps and recoverable.
 */
const PAIR_WINDOW_MINUTES = 10;

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
      let insertFailed = 0;
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
          if (insErr) {
            // NEVER swallow this again. A dropped insert used to be
            // indistinguishable from "no events": the counter simply did not
            // advance, the watermark moved on, and three days of the owner's
            // tagging were read from Gmail and discarded (2026-09-26..28).
            insertFailed++;
            console.error(
              `[label-watcher] INSERT FAILED gmail_id=${ev.gmailId} label=${name} ` +
              `type=${ev.type} history=${ev.historyId}: ${insErr.message}`,
            );
          } else {
            recorded++;
          }
        }
      }

      // Only advance past what was read AND recorded. The same rule as the
      // message watermark, and for the same reason: a cursor that outruns what
      // was persisted makes the loss permanent, because Gmail history is the
      // only copy and it expires.
      if (!truncated && insertFailed === 0) {
        await supabase.from('gmail_connection')
          .update({ last_label_history_id: historyId })
          .eq('id', connection.id);
      }

      if (insertFailed > 0) {
        console.error(
          `[label-watcher] ${insertFailed} insert(s) failed for ${connection.google_email}; ` +
          `holding watermark at ${connection.last_label_history_id}`,
        );
      }

      results.push({
        mailbox: connection.google_email,
        events_seen: events.length,
        events_recorded: recorded,
        insert_failed: insertFailed,
        truncated,
        watermark: (truncated || insertFailed > 0) ? connection.last_label_history_id : historyId,
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

      // OVIS-Linked predates the OVIS/ namespace and is applied by email-triage
      // on every linked email. It is OVIS's write, not the owner's.
      if (ev.label === 'OVIS-Linked') {
        attribution = 'ovis';
        note = 'legacy OVIS-Linked label, applied by email-triage';
      } else if (!ev.label.startsWith('OVIS/')) {
        // Outside the OVIS namespace, OVIS has never written it. Unambiguous.
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
          } else if (ev.event_type === 'removed') {
            // OVIS applied this label and has NO record of removing it, yet it
            // came off. That is the owner clearing their queue -- unambiguous,
            // and the single most common gesture in the workflow. Calling it
            // ambiguous (as this did until 2026-09-29) buried 122 real
            // dispositions in the bucket meant for genuine uncertainty.
            attribution = 'owner';
            note = 'OVIS applied this label and never removed it; removal is the owner\'s';
          } else {
            // An ADD with an intent row but no applied_at: OVIS may have made
            // the call and failed to record it. Genuinely unknown.
            attribution = 'ambiguous';
            note = 'OVIS intent row exists with no applied_at; cannot say whose add this was';
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

    // ------------------------------------------------------------------
    // GESTURE PASS — what the change MEANT. Runs only on events whose pairing
    // window has closed, so a bare removal is genuinely bare and not just a
    // removal whose partner addition has yet to be observed.
    // ------------------------------------------------------------------
    const pairCutoff = new Date(Date.now() - PAIR_WINDOW_MINUTES * 60_000).toISOString();
    const { data: unclassified } = await supabase
      .from('gmail_label_event')
      .select('id, gmail_id, label, event_type, attribution, observed_at, gmail_connection_id')
      .eq('gesture', 'pending')
      .not('attribution', 'eq', 'pending')
      .lt('observed_at', pairCutoff)
      .limit(500);

    const gestures = { handled: 0, correction: 0, superseded: 0, ovis_write: 0, noise: 0 };
    for (const ev of unclassified ?? []) {
      let gesture: 'handled' | 'correction' | 'superseded' | 'ovis_write' | 'noise' = 'handled';
      let note = '';
      let pairedId: string | null = null;
      let correctionKind: 'silent' | 'wrong' | null = null;

      const isOvisCategory = ev.label.startsWith('OVIS/');

      if (ev.attribution !== 'owner') {
        gesture = 'ovis_write';
        note = `attributed ${ev.attribution}`;
      } else if (ev.label === 'INBOX') {
        // Removing INBOX is archiving: a disposition, the same shape as clearing
        // a queue label. Adding INBOX is mail arriving, which decides nothing.
        gesture = ev.event_type === 'removed' ? 'handled' : 'noise';
        note = ev.event_type === 'removed' ? 'archived out of the inbox' : 'arrived in the inbox';
      } else if (!isOvisCategory) {
        // The owner's own filing (! [MIKE], _OM, stars). Says nothing about
        // whether OVIS's category was right, so it is not training signal.
        gesture = 'noise';
        note = `own filing label, outside the OVIS namespace: ${ev.label}`;
      } else if (ev.event_type === 'added') {
        // The owner put an OVIS label on. Either OVIS had it wrong, or OVIS had
        // nothing (Unsorted) and was just told. Both are training signal.
        const { data: live } = await supabase
          .from('email_label')
          .select('label')
          .eq('gmail_id', ev.gmail_id)
          .not('applied_at', 'is', null)
          .is('removed_at', null)
          .limit(1);
        note = live?.[0]?.label
          ? `owner added ${ev.label}; OVIS had ${live[0].label}`
          : `owner added ${ev.label}; OVIS had no label (Unsorted)`;
        gesture = 'correction';
        // 'silent' (OVIS had no opinion) and 'wrong' (OVIS had one and was
        // overridden) are different claims and must not feed a rule at the same
        // weight. Measured 142 vs 119 in the first real batch.
        correctionKind = live?.[0]?.label ? 'wrong' : 'silent';
      } else {
        // A removal. Bare = handled. Paired with the owner adding a DIFFERENT
        // OVIS label = the removal half of a correction, which the addition
        // already records, so this row is superseded rather than counted twice.
        const lo = new Date(new Date(ev.observed_at).getTime() - PAIR_WINDOW_MINUTES * 60_000).toISOString();
        const hi = new Date(new Date(ev.observed_at).getTime() + PAIR_WINDOW_MINUTES * 60_000).toISOString();
        const { data: partner } = await supabase
          .from('gmail_label_event')
          .select('id, label')
          .eq('gmail_id', ev.gmail_id)
          .eq('event_type', 'added')
          .eq('attribution', 'owner')
          .neq('label', ev.label)
          .like('label', 'OVIS/%')
          .gte('observed_at', lo)
          .lte('observed_at', hi)
          .limit(1);
        if (partner?.[0]) {
          gesture = 'superseded';
          pairedId = partner[0].id;
          note = `paired with owner adding ${partner[0].label} -- one correction, not two events`;
        } else {
          gesture = 'handled';
          note = `bare removal of ${ev.label}: queue cleared, no OVIS label added within ${PAIR_WINDOW_MINUTES} min`;
        }
      }

      await supabase.from('gmail_label_event').update({
        gesture,
        gesture_note: note,
        gesture_at: new Date().toISOString(),
        paired_event_id: pairedId,
        correction_kind: correctionKind,
      }).eq('id', ev.id);
      gestures[gesture]++;
    }

    return new Response(JSON.stringify({
      success: true, mailboxes: results, attributed: counts, gestures,
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[label-watcher]', e?.message ?? e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message ?? e), mailboxes: results }, null, 2),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
