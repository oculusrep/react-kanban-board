/**
 * One-shot diagnostic function. Tests whether the Supabase Edge Function
 * runtime can reach a Cloudflare quick-tunnel URL — isolates whether the
 * TLS-handshake failure we saw with Tailscale Funnel is Tailscale-specific
 * or a broader Supabase-egress issue.
 *
 * Hits a fixed Cloudflare URL (no env, no flexibility). Returns full
 * diagnostic JSON so we can tell at a glance whether it worked.
 *
 * Throwaway — delete the folder after we have the answer.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TARGET_URL = 'https://travels-applicant-vote-contributor.trycloudflare.com/hooks/ovis-research';
const TEST_BODY = {
  message:
    'SUPABASE-TO-CLOUDFLARE TEST — do not research, do not call tools. Reply with exactly: SUPA-CF-OK',
};

serve(async () => {
  const token = Deno.env.get('OPENCLAW_TRIGGER_TOKEN');
  if (!token) {
    return jsonResponse({ ok: false, error: 'OPENCLAW_TRIGGER_TOKEN not set' }, 500);
  }

  const start = Date.now();
  try {
    const resp = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(TEST_BODY),
    });
    const text = await resp.text();
    return jsonResponse({
      ok: resp.ok,
      tls_handshake: 'completed',
      http_status: resp.status,
      duration_ms: Date.now() - start,
      response_headers: Object.fromEntries(resp.headers.entries()),
      response_body: text.slice(0, 1000),
      target_url: TARGET_URL,
    });
  } catch (e) {
    return jsonResponse({
      ok: false,
      tls_handshake: 'failed_or_unreachable',
      error: 'fetch_threw',
      detail: e instanceof Error ? e.message : String(e),
      duration_ms: Date.now() - start,
      target_url: TARGET_URL,
    });
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
