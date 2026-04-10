/**
 * Hunter ZoomInfo Enrich Edge Function
 *
 * Two-step flow:
 *   1. SEARCH (/search/contact) — Find matching contacts (free, no credits)
 *      Returns basic info + availability flags (hasEmail, hasDirectPhone)
 *   2. ENRICH (/enrich/contact) — Get full data for a selected match (costs credits)
 *      Returns email, phone, mobilePhone, jobTitle, companyName, externalUrls
 *
 * Required Supabase Secrets:
 * - ZOOMINFO_USERNAME: Your ZoomInfo account username/email
 * - ZOOMINFO_CLIENT_ID: Your ZoomInfo client ID
 * - ZOOMINFO_PRIVATE_KEY: Your ZoomInfo private key (PEM format)
 *
 * API Reference:
 * - Search output fields: https://api.zoominfo.com/lookup/outputfields/contact/search
 * - Enrich output fields: https://api.zoominfo.com/lookup/outputfields/contact/enrich
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as jose from 'https://deno.land/x/jose@v5.2.0/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZOOMINFO_AUTH_URL = 'https://api.zoominfo.com/authenticate';
const ZOOMINFO_SEARCH_URL = 'https://api.zoominfo.com/search/contact';
const ZOOMINFO_ENRICH_URL = 'https://api.zoominfo.com/enrich/contact';

// Cache for ZoomInfo access token (valid for ~60 min)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Normalize PEM key - Supabase secrets may strip newlines
 */
function normalizePemKey(pem: string): string {
  if (pem.includes('\n')) {
    return pem;
  }

  const match = pem.match(/-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----/);
  if (!match) {
    throw new Error('Invalid PEM format - missing headers');
  }

  const base64Content = match[1].replace(/\s/g, '');
  const lines = base64Content.match(/.{1,64}/g) || [];

  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

/**
 * Get ZoomInfo access token using PKI authentication
 */
async function getZoomInfoAccessToken(username: string, clientId: string, privateKeyPem: string): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedAccessToken;
  }

  console.log('[ZoomInfo] Generating new access token via PKI auth');

  const normalizedPem = normalizePemKey(privateKeyPem);
  const privateKey = await jose.importPKCS8(normalizedPem, 'RS256');

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({
    aud: 'enterprise_api',
    client_id: clientId,
    username: username,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer('api-client@zoominfo.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  const authResponse = await fetch(ZOOMINFO_AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/json',
    },
  });

  if (!authResponse.ok) {
    const errorText = await authResponse.text();
    console.error('[ZoomInfo] Auth failed:', authResponse.status, errorText);
    throw new Error(`ZoomInfo authentication failed: ${authResponse.status} - ${errorText}`);
  }

  const authData = await authResponse.json();
  cachedAccessToken = authData.jwt;
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;

  console.log('[ZoomInfo] Successfully obtained access token');
  return cachedAccessToken!;
}

interface SearchRequest {
  action: 'search';
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
}

interface EnrichRequest {
  action: 'enrich';
  contact_id: string;
  person_id: string;
}

type RequestBody = SearchRequest | EnrichRequest;

/**
 * Extract LinkedIn URL from ZoomInfo externalUrls array
 */
function extractLinkedInUrl(externalUrls?: Array<{ type: string; url: string }>): string | null {
  if (!externalUrls || !Array.isArray(externalUrls)) return null;
  const linkedin = externalUrls.find(
    (u) => u.type?.toLowerCase() === 'linkedin' || u.url?.includes('linkedin.com')
  );
  return linkedin?.url || null;
}

/**
 * Handle ZoomInfo API errors with specific messages
 */
function handleApiError(status: number, errorText: string, context: Record<string, unknown> = {}): Response {
  const errorMap: Record<number, string> = {
    401: 'ZoomInfo API authentication failed. Check API key.',
    403: 'ZoomInfo API access denied. Check API permissions.',
    429: 'ZoomInfo API rate limit exceeded. Try again later.',
  };

  const message = errorMap[status] || `ZoomInfo API error: ${status}`;
  const responseStatus = errorMap[status] ? status : 500;

  return new Response(
    JSON.stringify({ error: message, details: errorText, ...context }),
    { status: responseStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const username = Deno.env.get('ZOOMINFO_USERNAME');
    const clientId = Deno.env.get('ZOOMINFO_CLIENT_ID');
    const privateKey = Deno.env.get('ZOOMINFO_PRIVATE_KEY');

    if (!username || !clientId || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'ZoomInfo credentials not configured. Need ZOOMINFO_USERNAME, ZOOMINFO_CLIENT_ID and ZOOMINFO_PRIVATE_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getZoomInfoAccessToken(username, clientId, privateKey);
    const request = await req.json() as RequestBody;

    if (!request.contact_id) {
      return new Response(
        JSON.stringify({ error: 'contact_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default to 'search' for backwards compatibility
    const action = request.action || 'search';

    // ─────────────────────────────────────────────
    // ACTION: SEARCH — find matches (free, no credits)
    // ─────────────────────────────────────────────
    if (action === 'search') {
      const searchReq = request as SearchRequest;

      if (!searchReq.first_name && !searchReq.last_name && !searchReq.email) {
        return new Response(
          JSON.stringify({ error: 'At least first_name, last_name, or email is required for search' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Search output fields — only fields confirmed accessible
      // city/state/country were also blocked (Issue 7)
      // TODO: Query https://api.zoominfo.com/lookup/outputfields/contact/search
      //       to discover all available fields for our account
      const searchParams: Record<string, unknown> = {
        outputFields: [
          'id',
          'firstName',
          'lastName',
          'jobTitle',
          'companyName',
        ],
        rpp: 5,
      };

      // Add search criteria — name-based search, company optional
      if (searchReq.first_name) searchParams.firstName = searchReq.first_name;
      if (searchReq.last_name) searchParams.lastName = searchReq.last_name;
      if (searchReq.email) searchParams.emailAddress = searchReq.email;
      // Note: companyName as a search param narrows results significantly
      // Only add it if we have it, but be aware it must match ZoomInfo's records
      if (searchReq.company) searchParams.companyName = searchReq.company;

      console.log(`[ZoomInfo Search] Searching for contact ${searchReq.contact_id}:`,
        JSON.stringify(searchParams));

      let response = await fetch(ZOOMINFO_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ZoomInfo Search] API error:', response.status, errorText);
        return handleApiError(response.status, errorText, { searchParams });
      }

      let data = await response.json();
      // ZoomInfo response format: { maxResults, totalResults, currentPage, data: [...] }
      // Note: results are in `data` array directly, NOT `data.result`
      const getResults = (d: Record<string, unknown>) => {
        const arr = d.data;
        return Array.isArray(arr) ? arr : [];
      };

      console.log(`[ZoomInfo Search] Found ${getResults(data).length} results (totalResults: ${data.totalResults})`,
        JSON.stringify(data));

      // If no results with company, retry without company filter
      if (getResults(data).length === 0 && searchReq.company) {
        console.log('[ZoomInfo Search] No results with company filter, retrying without it');
        const retryParams = { ...searchParams };
        delete retryParams.companyName;

        const retryResponse = await fetch(ZOOMINFO_SEARCH_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(retryParams),
        });

        if (retryResponse.ok) {
          data = await retryResponse.json();
          console.log(`[ZoomInfo Search] Retry found ${getResults(data).length} results`);
        }
      }

      // company is a nested object: { id, name }
      const matches = getResults(data).map((person: Record<string, unknown>) => {
        const company = person.company as Record<string, unknown> | undefined;
        return {
          zoominfo_person_id: person.id,
          first_name: person.firstName,
          last_name: person.lastName,
          title: person.jobTitle,
          company: company?.name || person.companyName || null,
          city: person.city || null,
          state: person.state || null,
          country: person.country || null,
          has_email: person.hasEmail ?? false,
          has_direct_phone: person.hasDirectPhone ?? false,
          zoominfo_profile_url: `https://app.zoominfo.com/#/apps/person/${person.id}`,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          contact_id: searchReq.contact_id,
          matches,
          total_results: data.totalResults || 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─────────────────────────────────────────────
    // ACTION: ENRICH — get full data (costs credits)
    // ─────────────────────────────────────────────
    if (action === 'enrich') {
      const enrichReq = request as EnrichRequest;

      if (!enrichReq.person_id) {
        return new Response(
          JSON.stringify({ error: 'person_id is required for enrichment' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enrich uses personId to look up the full record
      // externalUrls replaces linkedinUrl per ZoomInfo support
      const enrichParams = {
        matchPersonInput: [
          { personId: enrichReq.person_id },
        ],
        outputFields: [
          'id',
          'firstName',
          'lastName',
          'email',
          'phone',
          'mobilePhone',
          'jobTitle',
          'companyName',
          'externalUrls',
          'city',
          'state',
          'country',
        ],
      };

      console.log(`[ZoomInfo Enrich] Enriching person ${enrichReq.person_id} for contact ${enrichReq.contact_id}`);

      const response = await fetch(ZOOMINFO_ENRICH_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrichParams),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ZoomInfo Enrich] API error:', response.status, errorText);
        return handleApiError(response.status, errorText, { enrichParams });
      }

      const data = await response.json();
      console.log('[ZoomInfo Enrich] Raw response:', JSON.stringify(data));

      // ZoomInfo Enrich response structure varies — try multiple shapes:
      // Option A: { data: { result: [{ data: [{...person}], matchStatus }] } }
      // Option B: { data: [{...person}] }
      // Option C: { result: [{...person}] }
      let person: Record<string, unknown> | null = null;

      const tryExtract = (obj: unknown): Record<string, unknown> | null => {
        if (!obj || typeof obj !== 'object') return null;
        const o = obj as Record<string, unknown>;
        // If this object has firstName/id, it's a person
        if (o.id || o.firstName || o.lastName) return o;
        return null;
      };

      // Try the most common Enrich shape: data.result[0].data[0]
      if (data?.data?.result?.[0]?.data?.[0]) {
        person = data.data.result[0].data[0];
      } else if (Array.isArray(data?.data?.result) && data.data.result[0]) {
        person = tryExtract(data.data.result[0]);
      } else if (Array.isArray(data?.data) && data.data[0]) {
        const first = data.data[0] as Record<string, unknown>;
        // Could be { data: [{...person}] } nested
        if (Array.isArray(first.data) && first.data[0]) {
          person = first.data[0] as Record<string, unknown>;
        } else {
          person = tryExtract(first);
        }
      } else if (Array.isArray(data?.result) && data.result[0]) {
        person = tryExtract(data.result[0]);
      }

      console.log('[ZoomInfo Enrich] Extracted person:', JSON.stringify(person));

      if (!person || !person.id) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'No enrichment data returned for this person',
            contact_id: enrichReq.contact_id,
            raw_response: data,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const linkedinUrl = extractLinkedInUrl(person.externalUrls as Array<{ type: string; url: string }> | undefined);
      const company = person.company as Record<string, unknown> | undefined;

      const enrichedData = {
        zoominfo_person_id: person.id,
        first_name: person.firstName || null,
        last_name: person.lastName || null,
        email: person.email || null,
        phone: person.phone || null,
        mobile_phone: person.mobilePhone || null,
        title: person.jobTitle || null,
        company: company?.name || person.companyName || null,
        linkedin_url: linkedinUrl,
        external_urls: person.externalUrls || [],
        city: person.city || null,
        state: person.state || null,
        country: person.country || null,
        zoominfo_profile_url: `https://app.zoominfo.com/#/apps/person/${person.id}`,
      };

      return new Response(
        JSON.stringify({
          success: true,
          contact_id: enrichReq.contact_id,
          enriched: enrichedData,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Use 'search' or 'enrich'.` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ZoomInfo] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        errorType: error.name || 'Unknown',
        errorStack: error.stack?.substring(0, 500) || 'No stack trace',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
