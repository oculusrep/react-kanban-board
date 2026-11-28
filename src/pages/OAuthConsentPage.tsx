import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

// OAuth 2.1 consent screen for Supabase Auth's OAuth server — the page an MCP client
// (e.g. the claude.ai "OVIS" custom connector) sends the user to. Supabase Auth
// redirects here with ?authorization_id=…; the route sits inside ProtectedLayout, so a
// signed-out user gets the login form at this same URL and lands back here after.
//
// Calls the Auth REST endpoints directly: the auth.oauth.* helpers aren't in the
// @supabase/auth-js this app ships (2.71); they wrap these same two endpoints.
// Docs: https://supabase.com/docs/guides/auth/oauth-server/getting-started

const AUTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1`;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface AuthorizationDetails {
  authorization_id?: string;
  redirect_url?: string;
  redirect_uri?: string;
  scope?: string;
  client?: { client_id?: string; name?: string; client_name?: string; uri?: string; logo_uri?: string };
}

async function authFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.msg ?? body?.error_description ?? body?.message ?? `HTTP ${res.status}`);
  return body;
}

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id');
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authorizationId) { setError('Missing authorization_id.'); return; }
    authFetch(`/oauth/authorizations/${encodeURIComponent(authorizationId)}`)
      .then((d: AuthorizationDetails) => {
        // Only a redirect_url back means consent was already given.
        if (!d.authorization_id && d.redirect_url) { window.location.assign(d.redirect_url); return; }
        setDetails(d);
      })
      .catch((e) => setError(e.message));
  }, [authorizationId]);

  const decide = async (action: 'approve' | 'deny') => {
    if (!authorizationId) return;
    setBusy(true);
    try {
      const r = await authFetch(`/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (r?.redirect_url) window.location.assign(r.redirect_url);
      else setError('No redirect returned.');
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const clientName = details?.client?.name ?? details?.client?.client_name ?? 'An application';
  const scopes = (details?.scope ?? '').split(' ').filter(Boolean);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F8FAFC] flex items-start justify-center p-4 pt-16">
      <div className="bg-white border border-[#8FA9C8] rounded-lg shadow-sm max-w-md w-full p-6">
        <h1 className="text-xl font-semibold text-[#002147] mb-1">Connect to OVIS</h1>
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
        {!error && !details && <p className="text-sm text-gray-500 mt-3">Loading…</p>}
        {details && (
          <>
            <p className="text-sm text-[#4A6B94] mt-2">
              <b className="text-[#002147]">{clientName}</b> wants to act as you in OVIS through the OVIS MCP
              server: record NNN listings, list recent ones, and create VA tasks.
            </p>
            {details.redirect_uri && (
              <p className="text-xs text-gray-500 mt-3 break-all">Returns to: {details.redirect_uri}</p>
            )}
            {scopes.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">Scopes: {scopes.join(', ')}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                disabled={busy}
                onClick={() => decide('approve')}
                className="px-4 py-2 rounded text-sm bg-[#002147] text-white disabled:opacity-50"
              >
                Allow
              </button>
              <button
                disabled={busy}
                onClick={() => decide('deny')}
                className="px-4 py-2 rounded text-sm border border-[#8FA9C8] text-[#4A6B94] disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
