/**
 * Caller authorization for edge functions that run with the service-role key.
 *
 * WHY THIS EXISTS: a function that creates its Supabase client with the
 * service-role key BYPASSES RLS entirely. Supabase's verify_jwt gate only proves
 * the caller holds *a* valid JWT — a client-portal login's JWT passes it. So
 * before 2026-09-22, deal-synopsis, email-triage, backfill-attachments,
 * backfill-gmail-labels and send-portal-digest would do anything for any logged-in
 * account: a portal user could read email subjects and snippets for any deal.
 *
 * Two kinds of caller are recognised, and a function opts into each:
 *
 *   service        — infrastructure, never a person:
 *                      * X-Cron-Secret header matching OVIS_CRON_SECRET (pg_cron;
 *                        the same shared-secret pattern gcal-sync, ovis-sweep-tick
 *                        and the site-research worker already use), or
 *                      * Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *                        (function-to-function, e.g. gmail-sync -> email-triage).
 *   internal_user  — a JWT whose OVIS user passes public.is_internal_user(),
 *                    checked AS that user, so the database's own definition of
 *                    "internal" is the only one (admin, broker_full, broker_lite,
 *                    va). Coach and portal logins fail it.
 *
 * Anything else gets 401 (no/invalid credential) or 403 (valid, not allowed).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

export type Caller =
  | { kind: 'service'; via: 'cron_secret' | 'service_role' }
  | { kind: 'internal_user'; authUserId: string };

export interface CallerPolicy {
  allowService: boolean;
  allowInternalUser: boolean;
}

/** Constant-time comparison, so a secret can't be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function deny(status: 401 | 403, error: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve and authorize the caller. Returns the Caller on success, or a ready
 * 401/403 Response the handler should return as-is.
 */
export async function authorizeCaller(
  req: Request,
  policy: CallerPolicy,
  cors: Record<string, string> = {},
): Promise<Caller | Response> {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();

  if (policy.allowService) {
    const cronSecret = Deno.env.get('OVIS_CRON_SECRET') ?? '';
    if (safeEqual(req.headers.get('X-Cron-Secret') ?? '', cronSecret)) {
      return { kind: 'service', via: 'cron_secret' };
    }
    if (safeEqual(bearer, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')) {
      return { kind: 'service', via: 'service_role' };
    }
  }

  if (!policy.allowInternalUser) {
    // Service-only function and no service credential presented.
    return deny(401, 'service_credential_required', cors);
  }
  if (!bearer) return deny(401, 'missing_jwt', cors);

  const url = Deno.env.get('SUPABASE_URL')!;
  // Validate the token with the service client (the pattern this project uses
  // since the legacy JWT keys were disabled), then ask the database as the user.
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: authData, error: authErr } = await service.auth.getUser(bearer);
  if (authErr || !authData?.user) return deny(401, 'invalid_jwt', cors);

  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false },
  });
  const { data: internal, error: rpcErr } = await asUser.rpc('is_internal_user');
  if (rpcErr) {
    console.error('[caller-auth] is_internal_user check failed:', rpcErr.message);
    return deny(403, 'permission_check_failed', cors);
  }
  if (internal !== true) {
    console.warn(`[caller-auth] denied non-internal caller ${authData.user.id}`);
    return deny(403, 'forbidden', cors);
  }
  return { kind: 'internal_user', authUserId: authData.user.id };
}
