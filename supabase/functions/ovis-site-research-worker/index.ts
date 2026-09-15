/**
 * OVIS Site Research — background worker.
 *
 * Runs research_thread_run rows one model iteration per invocation, on the Deep-Sweep
 * engine's shape. Design: docs/SITE_RESEARCH_BACKGROUND_RUNS_DESIGN.md.
 *
 * Actions (POST JSON):
 *   { action: 'advance_run', run_id }  claim → one iteration → persist → self-chain or finalize.
 *                                      deep_pass runs dispatch on pass_phase (deep-pass-worker.ts).
 *                                      Responds 202 at once; the iteration runs in
 *                                      EdgeRuntime.waitUntil, so no caller waits on the model.
 *   { action: 'tick' }                 every minute from pg_cron: kick runs whose chain broke,
 *                                      reap runs silent for 20+ minutes.
 *
 * Auth: internal-only. verify_jwt is OFF for this function; callers send X-Worker-Secret,
 * compared against the vault secret via get_site_research_worker_secret() — the
 * ovis-sweep-tick pattern. Callers: the cron tick, ovis-site-research (enqueue kick), and
 * this function (self-chain).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { LEASE_SECONDS, runModelIteration, supabaseWorkerDb } from '../_shared/site-research/iteration.ts';
import { anthropicCreate } from '../_shared/site-research/model.ts';
import { executeTool, TOOL_DEFINITIONS, WEB_SEARCH_TOOL } from '../_shared/site-research/tools.ts';
import { kickWorker } from '../_shared/site-research/kick.ts';
import { runDeepPassIteration, supabaseDeepPassDb } from '../_shared/site-research/deep-pass-worker.ts';
import { edgePrivateLocations } from '../_shared/site-research/deep-pass.ts';
import { resolveSiteSubmitFolder, uploadFile } from '../_shared/dropbox.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

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
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error('[site-research] background task threw:', e));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(guarded);
}

async function advance(service: SupabaseClient, runId: string, secret: string): Promise<void> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY_RESEARCH');
  const db = supabaseWorkerDb(service);
  if (!apiKey) {
    await db.fail(runId, 'ANTHROPIC_API_KEY_RESEARCH not configured');
    return;
  }
  const owner = crypto.randomUUID();
  const run = await db.claim(runId, owner, LEASE_SECONDS);
  if (!run) {
    console.log(`[site-research] run=${runId} not claimed (terminal, leased elsewhere, or out of attempts)`);
    return;
  }

  const site = (r: typeof run) => {
    const s = (r.pinned_context as { site?: { latitude?: unknown; longitude?: unknown } } | null)?.site;
    const lat = Number(s?.latitude), lng = Number(s?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null;
  };
  const common = {
    db,
    create: anthropicCreate(apiKey),
    execute: (name: string, input: Record<string, unknown>, r: typeof run) =>
      executeTool(service, name, input, { siteSubmitId: r.site_submit_id, site: site(r) }),
    chain: async (id: string) => {
      // Self-chain the next iteration. If this call fails, the tick picks the run up
      // within a minute or two (its heartbeat ages past the kick threshold).
      try { await kickWorker(id, secret); } catch (e) { console.warn(`[site-research] run=${id} self-chain failed, tick will resume:`, e); }
    },
    onFailed: (id: string, error: string) => notifyTelegram(`❌ Site research run ${id} failed: ${error.slice(0, 300)}`),
  };

  const outcome = run.kind === 'deep_pass'
    ? await runDeepPassIteration(run, owner, {
        ...common,
        dp: supabaseDeepPassDb(service),
        webSearchTool: WEB_SEARCH_TOOL,
        edgePrivate: edgePrivateLocations,
        exportFiles: async (siteSubmitId, files) => {
          const folder = await resolveSiteSubmitFolder(service, siteSubmitId);
          const out = [];
          for (const f of files) {
            // overwrite: stable names for import; Dropbox revision history keeps the previous run.
            const u = await uploadFile(`${folder}/${f.name}`, f.bytes, { mode: 'overwrite' });
            out.push({ name: f.name, path: u.path, size: u.size });
          }
          return out;
        },
      })
    : await runModelIteration(run, owner, {
        ...common,
        clientTools: [...TOOL_DEFINITIONS] as unknown as Array<Record<string, unknown>>,
        webSearchTool: WEB_SEARCH_TOOL,
      });
  console.log(`[site-research] run=${runId} invocation outcome=${outcome}`);
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: expected } = await service.rpc('get_site_research_worker_secret');
  const provided = req.headers.get('X-Worker-Secret') ?? '';
  if (!expected || !safeEqual(provided, expected as string)) return json({ error: 'unauthorized' }, 401);
  const secret = expected as string;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  if (body.action === 'advance_run') {
    const runId = body.run_id;
    if (typeof runId !== 'string' || !runId) return json({ error: 'run_id is required' }, 400);
    background(advance(service, runId, secret));
    return json({ accepted: true, run_id: runId }, 202);
  }

  if (body.action === 'tick') {
    // Reaper first: never fatal to the tick.
    const { data: reaped, error: reapErr } = await service.rpc('reap_stalled_thread_runs', { p_idle_minutes: 20 });
    if (reapErr) console.warn('reap_stalled_thread_runs failed:', reapErr.message);
    const r = reaped as { reaped_count?: number; run_ids?: string[] } | null;
    if ((r?.reaped_count ?? 0) > 0) {
      await notifyTelegram(`🧹 Reaped ${r!.reaped_count} site research run(s) with no activity for 20+ min — marked failed: ${(r!.run_ids ?? []).join(', ')}`);
    }

    const { data: due, error: dueErr } = await service.rpc('advance_thread_runs', { p_kick_after_seconds: 60 });
    if (dueErr) return json({ error: 'advance_thread_runs_failed', detail: dueErr.message }, 500);
    const ids = (due ?? []) as string[];
    for (const id of ids) {
      try { await kickWorker(id, secret); } catch (e) { console.warn(`[site-research] tick kick failed run=${id}:`, e); }
    }
    if (ids.length) console.log(`[site-research] tick kicked ${ids.length} run(s): ${ids.join(', ')}`);
    return json({ ok: true, kicked: ids, reaped: r?.reaped_count ?? 0 });
  }

  return json({ error: 'unknown_action' }, 400);
});
