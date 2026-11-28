/**
 * portal-invite-precheck — clear orphaned auth identities before portal signup.
 *
 * WHY THIS EXISTS
 * `auth.identities` can hold a row whose `user_id` points at a deleted
 * `auth.users` row. Supabase's signUp then rejects the email with 422: an
 * identity already claims it, while no account exists to sign into. The fix is
 * to delete those orphans — and only those: the cleanup is a no-op whenever a
 * live `auth.users` row holds the email.
 *
 * That cleanup used to run inside `validate_portal_invite_token`, which `anon`
 * must be able to call (it is the pre-login invite page). So a public read
 * endpoint carried a delete against `auth.identities`, reachable by anyone,
 * taking an arbitrary email argument. Moving it here takes the delete off the
 * public surface entirely:
 *
 *   * the caller presents the INVITE TOKEN, not an email
 *   * the token is resolved to a contact server-side, with the service key
 *   * the email comes from that contact row — the caller cannot choose it, so
 *     identities for arbitrary addresses can no longer be probed or deleted
 *
 * WHY NOT ON THE ACCEPT PATH, which was the first proposal: `accept_portal_invite`
 * takes an auth user id, so by the time it runs the account already exists. Its
 * first check is `EXISTS (SELECT 1 FROM auth.users WHERE email = …)`, which
 * would then be true, so the cleanup would return "User exists, no cleanup
 * needed" and delete nothing — and signUp would already have failed with the
 * 422 this is meant to prevent. The cleanup has to happen BEFORE signUp.
 * PortalInviteAcceptPage calls this immediately before it.
 *
 * Authorization is the token itself, which is what the invite page already has
 * and what the rest of that flow is gated on. verify_jwt is off because the
 * caller is logged out by definition.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let token: string | null = null;
  try {
    const body = await req.json();
    token = typeof body?.token === 'string' ? body.token.trim() : null;
  } catch {
    return json({ success: false, error: 'invalid_body' }, 400);
  }
  if (!token) return json({ success: false, error: 'token_required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // The token is the credential. Resolve the email from it; never accept one.
  const { data: contacts, error: lookupError } = await supabase
    .from('contact')
    .select('id, email, portal_invite_expires_at, portal_auth_user_id')
    .eq('portal_invite_token', token)
    .limit(1);

  if (lookupError) {
    console.error('[portal-invite-precheck] contact lookup:', lookupError.message);
    return json({ success: false, error: 'lookup_failed' }, 500);
  }

  const contact = contacts?.[0];
  // Deliberately the same answer for "no such token" and "token no longer
  // usable": this endpoint should not be a better oracle than the validate
  // function already is.
  if (!contact || !contact.email) return json({ success: true, cleaned: false });
  if (contact.portal_auth_user_id) return json({ success: true, cleaned: false });
  if (contact.portal_invite_expires_at &&
      new Date(contact.portal_invite_expires_at).getTime() < Date.now()) {
    return json({ success: true, cleaned: false });
  }

  // Same guarded cleanup as before, with the email supplied by the server.
  const { data: result, error: cleanupError } = await supabase
    .rpc('cleanup_orphaned_auth_identity', { p_email: contact.email });

  if (cleanupError) {
    console.error('[portal-invite-precheck] cleanup:', cleanupError.message);
    // Signup may still succeed; never block the flow on this.
    return json({ success: false, error: 'cleanup_failed' }, 200);
  }

  return json({ success: true, cleaned: (result as { cleaned?: boolean } | null)?.cleaned ?? false });
});
