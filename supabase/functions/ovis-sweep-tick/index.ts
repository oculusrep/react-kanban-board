/**
 * OVIS Deep-Sweep Tick — Engine
 *
 * Invoked once/minute by a pg_cron job. Two jobs per tick:
 *
 *   1. Reap orphaned research_runs — runs whose agent was killed (a gateway
 *      restart drains in-flight runs) and which would otherwise sit at
 *      state='running' forever with nobody left to terminalize them. Runs owned
 *      by a live sweep are skipped; advance_sweep owns those.
 *   2. Drive every running research_sweep one step: fire the next pending chunk
 *      (only when the current chunk is terminal — strictly sequential), detect a
 *      stalled chunk, and Telegram failures.
 *
 * All sequencing/idempotency lives in the transactional advance_sweep RPC
 * (per-sweep advisory lock); this function only performs the side-effects a DB
 * transaction cannot: the internal OpenClaw-trigger call and Telegram.
 *
 * STALL HANDLING. A chunk that goes idle past the sweep's timeout is NOT
 * terminalized on the spot — that is what let a still-alive agent overlap with
 * the next chunk (sweep f4b86098, Aug 10). advance_sweep quarantines it and the
 * sweep HOLDS. We get 'stalled' once when that happens, and 'orphan' later only
 * if the run stayed silent through the cooldown, which is the point at which it
 * is safe to mark the run failed and let the sweep move on.
 *
 * Auth: internal-only. verify_jwt is OFF; we compare the caller's bearer against
 * SUPABASE_SERVICE_ROLE_KEY ourselves. The cron sends that key.
 *
 * Firing reuses ovis-research-trigger via its additive internal path (so the
 * per-chunk mode+window contract is byte-identical to a manual Deep trigger).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { notifyResearchTelegram, oneLine, chunkLabel, getSweepInfo, sendSweepReadyIfDone } from '../_shared/research-telegram.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Telegram: only started / failed / ready-for-approval go out from here (see
// _shared/research-telegram.ts for the full list and the 2026-11-14 decision).

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const triggerUrl = `${supabaseUrl}/functions/v1/ovis-research-trigger`;

  // Auth: the cron sends the shared secret in X-Sweep-Secret; we fetch the
  // expected value from the DB (service role) so no edge env var is required.
  const provided = req.headers.get('X-Sweep-Secret') ?? '';
  const { data: expectedSecret } = await service.rpc('get_sweep_tick_secret');
  if (!expectedSecret || !safeEqual(provided, expectedSecret as string)) {
    return json({ error: 'unauthorized' }, 401);
  }

  // ---- 1) Reap orphaned runs. Independent of any sweep: a standalone run
  // killed mid-flight is the common case (gateway restart). Never fatal to the
  // tick — a reaper failure must not stop sweeps from advancing.
  const { data: reaped, error: reapErr } = await service.rpc('reap_orphaned_research_runs');
  if (reapErr) {
    console.warn('reap_orphaned_research_runs failed:', reapErr.message);
  } else {
    const r = reaped as { reaped_count?: number; chunks_closed?: number } | null;
    // No Telegram: reaped runs are not sweep chunks (advance_sweep owns those).
    if ((r?.reaped_count ?? 0) > 0) console.log('reaped orphaned research runs:', r!.reaped_count);
  }

  // ---- 2) Advance every running sweep by one step.
  const { data: sweeps, error: sweepErr } = await service
    .from('research_sweep').select('id').eq('state', 'running');
  if (sweepErr) return json({ error: 'sweep_query_failed', detail: sweepErr.message }, 500);

  const processed: Array<{ sweep_id: string; action: string }> = [];

  for (const sweep of (sweeps ?? []) as Array<{ id: string }>) {
    const { data: act, error: advErr } = await service.rpc('advance_sweep', { p_sweep_id: sweep.id });
    if (advErr) { console.warn('advance_sweep failed', sweep.id, advErr.message); continue; }
    const action = (act as { action?: string })?.action ?? 'none';
    processed.push({ sweep_id: sweep.id, action });
    if (action === 'none') continue;
    const info = await getSweepInfo(service, sweep.id);

    if (action === 'fire') {
      const a = act as {
        chunk_id: string; chunk_index: number; window_start: string | null; window_end: string | null;
        site_submit_id: string; radius_miles: number; boundary_municipality_ids: string[]; triggered_by: string | null;
        kind?: 'window' | 'evergreen'; research_scope?: 'full' | 'window' | 'evergreen';
        sweep_window_start?: string | null; sweep_window_end?: string | null;
      };
      // Evergreen (undated) chunk: no window of its own. It carries the sweep's
      // whole span so the run row and the agent message keep their shape; the
      // research_scope line tells the agent the span is NOT a filter.
      const ws = a.kind === 'evergreen' ? a.sweep_window_start : a.window_start;
      const we = a.kind === 'evergreen' ? a.sweep_window_end : a.window_end;
      try {
        const resp = await fetch(triggerUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'commit',
            internal: true,
            triggered_by: a.triggered_by,
            site_submit_id: a.site_submit_id,
            radius_miles: a.radius_miles,
            municipality_ids: a.boundary_municipality_ids,
            research_mode: 'deep',
            research_scope: a.research_scope ?? 'full',
            // (a'): the single 6-month slice IS both windows. Explicit, never a 2yr default.
            pz_window_start: ws,
            pz_window_end: we,
            permit_window_start: ws,
            permit_window_end: we,
          }),
        });
        let b: { research_run_id?: string; detail?: string; error?: string } = {};
        try { b = await resp.json(); } catch { /* leave empty */ }

        if (resp.ok && b.research_run_id) {
          await service.rpc('mark_chunk_fired', { p_chunk_id: a.chunk_id, p_run_id: b.research_run_id });
          await notifyResearchTelegram(`${chunkLabel(a.chunk_index, info.total)} started — ${info.site}`);
        } else if (resp.status === 409) {
          // Blocked by the one-live-run-per-site guard. Transient by nature —
          // something is still live on this site and will terminalize (the
          // reaper is the 90-min backstop). Leave the chunk in 'firing' with no
          // run: advance_sweep re-fires it after 3 minutes. Marking it failed
          // here would turn a wait into a spurious coverage gap. No Telegram —
          // it would repeat every 3 min for as long as the block lasts.
          console.warn('sweep chunk blocked by live-run guard, will retry:', a.chunk_index, b.detail);
        } else {
          // Trigger errored, or created a run but OpenClaw rejected (run already
          // marked failed inside the trigger). Isolate: mark chunk failed, alert,
          // let the next tick advance past it.
          await service.rpc('mark_chunk_failed', { p_chunk_id: a.chunk_id, p_run_id: b.research_run_id ?? null });
          await notifyResearchTelegram(
            `${chunkLabel(a.chunk_index, info.total)} failed — ${oneLine(`could not start: ${b.detail ?? b.error ?? ('HTTP ' + resp.status)}`)}`,
          );
        }
      } catch (e) {
        await service.rpc('mark_chunk_failed', { p_chunk_id: a.chunk_id });
        await notifyResearchTelegram(`${chunkLabel(a.chunk_index, info.total)} failed — ${oneLine(`could not start: ${String(e)}`)}`);
      }
    } else if (action === 'stalled') {
      const a = act as {
        chunk_index: number; window_start: string; window_end: string;
        idle_minutes: number; cooldown_minutes: number;
      };
      // Quarantined, NOT terminalized. Deliberately no write to research_run:
      // the agent may still be alive, and marking it failed here would be us
      // manufacturing the very "confirmation of death" the cooldown exists to
      // wait for. The sweep is held until it resurrects or the cooldown expires.
      // No Telegram: a stall is not a failure yet. If it never resurrects it
      // becomes 'orphan' below, which is reported as a failure.
      console.log('sweep chunk stalled', sweep.id, a.chunk_index, a.idle_minutes, a.cooldown_minutes);
    } else if (action === 'orphan') {
      const a = act as { chunk_index: number; window_start: string; window_end: string; research_run_id: string | null };
      // Silent through the whole cooldown: as dead as we can establish from this
      // side. Mark the run failed (so the window reads as a coverage gap, not a
      // phantom-covered one) and alert; the next tick fires the next chunk.
      if (a.research_run_id) {
        await service.from('research_run')
          .update({ state: 'failed', completed_at: new Date().toISOString() })
          .eq('id', a.research_run_id);
      }
      await notifyResearchTelegram(
        `${chunkLabel(a.chunk_index, info.total)} failed — agent went silent (no activity through the cooldown); marked as a gap, re-run it from the sweep view`,
      );
    } else if (action === 'aborted') {
      const a = act as {
        sweep_state: string; skipped_count: number;
        dead_chunks: Array<{ chunk_index: number; window_start: string; window_end: string }>;
      };
      // Circuit breaker: two consecutive chunks finished with no activity and no
      // records, so the agent side is down and the rest would fail identically.
      const last = (a.dead_chunks ?? []).reduce((m, d) => Math.max(m, d.chunk_index), 0);
      await notifyResearchTelegram(
        `${chunkLabel(last, info.total)} failed — ${oneLine(`agent side down (2 chunks in a row with no activity and no records); sweep stopped, ${a.skipped_count} chunk(s) not run — fix the cause, then Re-run gaps`, 220)}`,
      );
    } else if (action === 'terminal') {
      // Failed chunks were already reported one by one; this is the hand-off.
      // Sent only once every chunk's post-run steps are done; if they aren't
      // yet, the MCP (or the sweeper below) sends it when they are.
      await sendSweepReadyIfDone(service, sweep.id);
    }
  }

  // ---- 3) Sweeper: finished sweeps whose "Sweep ready" hasn't gone out yet
  // (post-run steps were still running at the terminal tick). Last 3 days only.
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data: unsent } = await service.from('research_sweep').select('id')
    .is('ready_notified_at', null).neq('state', 'running').gte('created_at', since);
  for (const u of (unsent ?? []) as Array<{ id: string }>) {
    try { await sendSweepReadyIfDone(service, u.id); } catch (e) { console.warn('sweep-ready sweeper failed', u.id, e); }
  }

  return json({ ok: true, processed });
});
