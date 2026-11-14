/**
 * Market Research sweep notifications to Telegram — the ONLY messages sent:
 *
 *   Chunk 3/6 started — <site name>
 *   Chunk 3/6 finished — N records staged
 *   Sweep ready for approval — <site name>, N records pending
 *   Chunk 3/6 failed — <one-line reason>
 *
 * Chunk numbers are 1-based (chunk_index + 1). Senders: ovis-sweep-tick
 * (started, failed, ready), ovis-research-mcp (finished). Everything else that
 * used to go to Telegram (run started, stalled, reaped, trigger internals) was
 * dropped on 2026-11-14 at Mike's request.
 *
 * chat 8371575998 = Mike's private chat; TELEGRAM_BOT_TOKEN = OVISbot
 * (@oculusrep_bot). Failures are swallowed: a notification must never break
 * the sweep or a submit.
 */

const TELEGRAM_CHAT_ID = '8371575998';

export async function notifyResearchTelegram(text: string): Promise<void> {
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

/** One line, no newlines, capped — failure reasons come from arbitrary errors. */
export function oneLine(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export const chunkLabel = (chunkIndex: number, total: number | null | undefined) =>
  `Chunk ${chunkIndex + 1}/${total ?? '?'}`;

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Sweep facts the messages need: total chunks + the site's display name. */
export async function getSweepInfo(supabase: Supa, sweepId: string): Promise<{ total: number | null; site: string }> {
  const { data } = await supabase
    .from('research_sweep')
    .select('total_chunks, site_submit:site_submit_id(site_submit_name)')
    .eq('id', sweepId)
    .maybeSingle();
  return {
    total: data?.total_chunks ?? null,
    site: data?.site_submit?.site_submit_name ?? 'site',
  };
}

/**
 * "Sweep ready" — sent once per sweep, after the sweep is finished AND every
 * chunk run's post-submit steps (dedupe → Gemini → dedupe) are done, so the
 * numbers are final:
 *
 *   Sweep ready — <site>
 *   ✅ N ready to approve · X units (Y estimated)
 *   ⚠️ N need a decision · low–high units
 *   📋 N leads (no count)
 *   🗺 N of M ready records have boundaries
 *
 * Callers: ovis-research-mcp when a chunk's post-run steps finish, and the
 * ovis-sweep-tick sweeper (backstop). The ready_notified_at claim makes it
 * exactly-once. A run whose post-run flag never got set counts as done after
 * 10 minutes, so a crashed background job can't swallow the message.
 * Numbers come from get_sweep_summary, the same function as the approval header.
 */
export async function sendSweepReadyIfDone(supabase: Supa, sweepId: string): Promise<'sent' | 'not_ready' | 'already_sent'> {
  const { data: sweep } = await supabase.from('research_sweep')
    .select('state, ready_notified_at').eq('id', sweepId).maybeSingle();
  if (!sweep || sweep.state === 'running' || sweep.state === 'pending') return 'not_ready';
  if (sweep.ready_notified_at) return 'already_sent';

  const { data: runs } = await supabase.from('research_run')
    .select('state, post_run_done_at, updated_at').eq('sweep_id', sweepId);
  const staleBefore = Date.now() - 10 * 60_000;
  const pendingPostRun = (runs ?? []).some((r: { state: string; post_run_done_at: string | null; updated_at: string }) =>
    ['awaiting_review', 'approved', 'archived'].includes(r.state)
    && !r.post_run_done_at && new Date(r.updated_at).getTime() > staleBefore);
  if (pendingPostRun) return 'not_ready';

  // Claim first: exactly one sender wins.
  const { data: claimed } = await supabase.from('research_sweep')
    .update({ ready_notified_at: new Date().toISOString() })
    .eq('id', sweepId).is('ready_notified_at', null).select('id');
  if (!claimed || claimed.length === 0) return 'already_sent';

  const info = await getSweepInfo(supabase, sweepId);
  const { data: s, error } = await supabase.rpc('get_sweep_summary', { p_sweep_id: sweepId });
  if (error || !s) {
    await notifyResearchTelegram(`Sweep ready — ${info.site} (summary unavailable: ${oneLine(error?.message ?? 'no data', 80)})`);
    return 'sent';
  }
  const n = (x: number) => Number(x ?? 0).toLocaleString('en-US');
  const est = Number(s.ready?.estimated_units ?? 0);
  const lo = Number(s.decision?.units_low ?? 0);
  const hi = Number(s.decision?.units_high ?? 0);
  await notifyResearchTelegram([
    `Sweep ready — ${info.site}`,
    `✅ ${n(s.ready?.records)} ready to approve · ${n(s.ready?.units)} units${est > 0 ? ` (${n(est)} estimated)` : ''}`,
    `⚠️ ${n(s.decision?.records)} need a decision · ${lo === hi ? n(lo) : `${n(lo)}–${n(hi)}`} units`,
    `📋 ${n(s.leads?.records)} leads (no count)`,
    `🗺 ${n(s.ready?.with_boundary)} of ${n(s.ready?.records)} ready records have boundaries`,
  ].join('\n'));
  return 'sent';
}
