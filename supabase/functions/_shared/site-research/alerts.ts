/**
 * Telegram alerts for site research (the in-app site story / deep pass).
 *
 * NOT the market research channel. TELEGRAM_BOT_TOKEN is OVISbot / @oculusrep_bot (verified via
 * getMe 2026-09-17; this comment previously misnamed it @orep_openclaw_bot, which is OpenClaw's
 * own bot and a different thread). That token carries market research / sweep notices, so a site
 * research failure sent through it on 2026-09-15 read as "OpenClaw fired". So:
 *  - SITE_RESEARCH_TELEGRAM_BOT_TOKEN, when set, sends from a separate bot.
 *  - Until then it falls back to TELEGRAM_BOT_TOKEN, and every message carries the prefix below
 *    either way, so it cannot be mistaken for market research.
 */

export const TELEGRAM_CHAT_ID = '8371575998';
export const SITE_RESEARCH_ALERT_PREFIX = '[SITE STORY — not market research / not OpenClaw]';

export function siteResearchAlertText(text: string): string {
  return `${SITE_RESEARCH_ALERT_PREFIX}\n${text}`;
}

export function siteResearchBotToken(env: { get(k: string): string | undefined }): { token: string | null; bot: 'site_research' | 'shared_openclaw' | null } {
  const own = env.get('SITE_RESEARCH_TELEGRAM_BOT_TOKEN');
  if (own) return { token: own, bot: 'site_research' };
  const shared = env.get('TELEGRAM_BOT_TOKEN');
  return shared ? { token: shared, bot: 'shared_openclaw' } : { token: null, bot: null };
}

export async function notifySiteResearch(text: string, fetchFn: typeof fetch = fetch, env = Deno.env): Promise<void> {
  const { token } = siteResearchBotToken(env);
  const body = siteResearchAlertText(text);
  if (!token) { console.warn('no Telegram bot token set — skipping:', body); return; }
  try {
    const resp = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: body, disable_web_page_preview: true }),
    });
    if (!resp.ok) console.warn('Telegram non-2xx:', resp.status, await resp.text());
  } catch (e) { console.warn('Telegram threw:', e); }
}
