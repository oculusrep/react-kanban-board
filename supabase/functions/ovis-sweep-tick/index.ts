/**
 * OVIS Deep-Sweep Tick — Engine
 *
 * Invoked once/minute by a pg_cron job. Drives every running research_sweep one
 * step: fires the next pending chunk (only when the current chunk is terminal —
 * strictly sequential), detects the per-chunk orphan timeout, and Telegrams
 * failures. All sequencing/idempotency lives in the transactional advance_sweep
 * RPC (per-sweep advisory lock); this function only performs the side-effects a
 * DB transaction cannot: the internal OpenClaw-trigger call and Telegram.
 *
 * Auth: internal-only. verify_jwt is OFF; we compare the caller's bearer against
 * SUPABASE_SERVICE_ROLE_KEY ourselves. The cron sends that key.
 *
 * Firing reuses ovis-research-trigger via its additive internal path (so the
 * per-chunk mode+window contract is byte-identical to a manual Deep trigger).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TELEGRAM_CHAT_ID = '8371575998';
async function notifyTelegram(text: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) { console.warn('TELEGRAM_BOT_TOKEN not set — skipping:', text); return; }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!resp.ok) console.warn('Telegram non-2xx:', resp.status, await resp.text());
  } catch (e) { console.warn('Telegram threw:', e); }
}

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

  const { data: sweeps, error: sweepErr } = await service
    .from('research_sweep').select('id').eq('state', 'running');
  if (sweepErr) return json({ error: 'sweep_query_failed', detail: sweepErr.message }, 500);

  const processed: Array<{ sweep_id: string; action: string }> = [];

  for (const sweep of (sweeps ?? []) as Array<{ id: string }>) {
    const { data: act, error: advErr } = await service.rpc('advance_sweep', { p_sweep_id: sweep.id });
    if (advErr) { console.warn('advance_sweep failed', sweep.id, advErr.message); continue; }
    const action = (act as { action?: string })?.action ?? 'none';
    processed.push({ sweep_id: sweep.id, action });

    if (action === 'fire') {
      const a = act as {
        chunk_id: string; chunk_index: number; window_start: string; window_end: string;
        site_submit_id: string; radius_miles: number; boundary_municipality_ids: string[]; triggered_by: string | null;
      };
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
            // (a'): the single 6-month slice IS both windows. Explicit, never a 2yr default.
            pz_window_start: a.window_start,
            pz_window_end: a.window_end,
            permit_window_start: a.window_start,
            permit_window_end: a.window_end,
          }),
        });
        let b: { research_run_id?: string; detail?: string; error?: string } = {};
        try { b = await resp.json(); } catch { /* leave empty */ }

        if (resp.ok && b.research_run_id) {
          await service.rpc('mark_chunk_fired', { p_chunk_id: a.chunk_id, p_run_id: b.research_run_id });
        } else {
          // Trigger errored, or created a run but OpenClaw rejected (run already
          // marked failed inside the trigger). Isolate: mark chunk failed, alert,
          // let the next tick advance past it.
          await service.rpc('mark_chunk_failed', { p_chunk_id: a.chunk_id, p_run_id: b.research_run_id ?? null });
          await notifyTelegram(
            `⚠️ Deep-Sweep chunk ${a.chunk_index} (${a.window_start}→${a.window_end}) failed to fire: ${b.detail ?? b.error ?? ('HTTP ' + resp.status)}`,
          );
        }
      } catch (e) {
        await service.rpc('mark_chunk_failed', { p_chunk_id: a.chunk_id });
        await notifyTelegram(`⚠️ Deep-Sweep chunk ${a.chunk_index} (${a.window_start}→${a.window_end}) fire threw: ${String(e).slice(0, 150)}`);
      }
    } else if (action === 'orphan') {
      const a = act as { chunk_index: number; window_start: string; window_end: string; research_run_id: string | null };
      // The chunk's agent died without submitting. Mark the orphaned run failed
      // (so it's a coverage gap, not a phantom-covered window) and alert.
      if (a.research_run_id) {
        await service.from('research_run')
          .update({ state: 'failed', completed_at: new Date().toISOString() })
          .eq('id', a.research_run_id);
      }
      await notifyTelegram(
        `⚠️ Deep-Sweep chunk ${a.chunk_index} (${a.window_start}→${a.window_end}) TIMED OUT — no submit_research_report. Marked failed; sweep advancing.`,
      );
    } else if (action === 'terminal') {
      const a = act as { sweep_state: string };
      const emoji = a.sweep_state === 'complete' ? '✅' : a.sweep_state === 'failed' ? '❌' : '⚠️';
      await notifyTelegram(`${emoji} Deep-Sweep finished: ${a.sweep_state}. Review in the sweep approval view.`);
    }
  }

  return json({ ok: true, processed });
});
