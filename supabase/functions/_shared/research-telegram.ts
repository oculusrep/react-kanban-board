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
