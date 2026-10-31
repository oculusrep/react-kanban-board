import { supabase } from '../lib/supabaseClient';

/**
 * Google Geocoding through the `geocode` edge function — the browser never holds a
 * Google geocoding key (anything VITE_ is public, and Google refuses website-
 * restricted keys on this API). See docs/GEOCODE_PROXY_PLAN.md.
 *
 * Returns Google's JSON body unchanged, so callers keep their existing parsing.
 * A proxy-level failure (signed out, forbidden, rate limited, network) comes back
 * as a REQUEST_DENIED-shaped body rather than a throw, which every caller already
 * handles as "Google didn't answer".
 */
export interface GoogleGeocodeRequest {
  address?: string;
  latlng?: string; // "lat,lng"
  region?: string;
  components?: string;
}

// Dev only: point at a locally running copy of the function (`deno run … geocode/index.ts`,
// port 8000) to test it before it is deployed. Ignored in production builds.
const DEV_URL = import.meta.env.DEV ? (import.meta.env.VITE_GEOCODE_FUNCTION_URL as string | undefined) : undefined;

export async function googleGeocode(req: GoogleGeocodeRequest): Promise<any> {
  if (DEV_URL) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(DEV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify(req),
    });
    const body = await res.json().catch(() => ({}));
    return body?.status ? body : { status: 'REQUEST_DENIED', error_message: `geocode proxy (dev): ${body?.error ?? res.status}`, results: [] };
  }
  const { data, error } = await supabase.functions.invoke('geocode', { body: req });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.status) return body; // Google's own error body (502 path)
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    return { status: 'REQUEST_DENIED', error_message: `geocode proxy: ${message}`, results: [] };
  }
  return data;
}
