/**
 * Hunter ZoomInfo Enrich Edge Function
 *
 * Searches ZoomInfo Person Search API to enrich contact data.
 * Returns potential matches for user review before applying changes.
 *
 * Required Supabase Secrets:
 * - ZOOMINFO_CLIENT_ID: Your ZoomInfo client ID
 * - ZOOMINFO_PRIVATE_KEY: Your ZoomInfo private key (PEM format)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import * as jose from 'https://deno.land/x/jose@v5.2.0/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZOOMINFO_AUTH_URL = 'https://api.zoominfo.com/authenticate';
const ZOOMINFO_API_URL = 'https://api.zoominfo.com/search/person';

// Cache for ZoomInfo access token (valid for ~60 min)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Get ZoomInfo access token using PKI authentication
 */
async function getZoomInfoAccessToken(clientId: string, privateKeyPem: string): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedAccessToken;
  }

  console.log('[ZoomInfo] Generating new access token via PKI auth');

  try {
    // Import the private key using jose
    const privateKey = await jose.importPKCS8(privateKeyPem, 'RS256');

    // Create JWT
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new jose.SignJWT({
      aud: 'https://api.zoominfo.com',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(clientId)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);

    console.log('[ZoomInfo] JWT created, exchanging for access token');

    // Exchange JWT for access token
    const authResponse = await fetch(ZOOMINFO_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: clientId, id_token: jwt }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error('[ZoomInfo] Auth failed:', authResponse.status, errorText);
      throw new Error(`ZoomInfo authentication failed: ${authResponse.status} - ${errorText}`);
    }

    const authData = await authResponse.json();
    cachedAccessToken = authData.jwt;
    // Token is valid for 60 minutes, but we'll refresh at 55 min
    tokenExpiresAt = Date.now() + 55 * 60 * 1000;

    console.log('[ZoomInfo] Successfully obtained access token');
    return cachedAccessToken!;
  } catch (err) {
    console.error('[ZoomInfo] PKI auth error:', err);
    throw err;
  }
}

interface EnrichRequest {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
}

interface ZoomInfoPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  jobTitle: string;
  companyName: string;
  linkedinUrl: string;
  zoomInfoUrl: string;
  // Additional fields from API
  city?: string;
  state?: string;
  country?: string;
}

interface ZoomInfoSearchResponse {
  success: boolean;
  data: {
    result: ZoomInfoPerson[];
    totalResults: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get('ZOOMINFO_CLIENT_ID');
    const privateKey = Deno.env.get('ZOOMINFO_PRIVATE_KEY');

    if (!clientId || !privateKey) {
      return new Response(
        JSON.stringify({ error: 'ZoomInfo credentials not configured. Need ZOOMINFO_CLIENT_ID and ZOOMINFO_PRIVATE_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get access token via PKI auth
    const accessToken = await getZoomInfoAccessToken(clientId, privateKey);

    const request = await req.json() as EnrichRequest;

    // Validate request
    if (!request.contact_id) {
      return new Response(
        JSON.stringify({ error: 'contact_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Need at least name or email to search
    if (!request.first_name && !request.last_name && !request.email) {
      return new Response(
        JSON.stringify({ error: 'At least first_name, last_name, or email is required for search' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build ZoomInfo search query
    const searchParams: Record<string, unknown> = {
      outputFields: [
        'id',
        'firstName',
        'lastName',
        'email',
        'phone',
        'mobilePhone',
        'jobTitle',
        'companyName',
        'linkedinUrl',
        'city',
        'state',
        'country',
      ],
      rpp: 5, // Return top 5 matches
    };

    // Add search criteria
    if (request.first_name) {
      searchParams.firstName = [request.first_name];
    }
    if (request.last_name) {
      searchParams.lastName = [request.last_name];
    }
    if (request.email) {
      searchParams.emailAddress = [request.email];
    }
    if (request.company) {
      searchParams.companyName = [request.company];
    }

    console.log(`[ZoomInfo Enrich] Searching for contact ${request.contact_id}:`, {
      firstName: request.first_name,
      lastName: request.last_name,
      email: request.email,
      company: request.company,
    });

    // Call ZoomInfo API
    const zoomInfoResponse = await fetch(ZOOMINFO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchParams),
    });

    if (!zoomInfoResponse.ok) {
      const errorText = await zoomInfoResponse.text();
      console.error('[ZoomInfo Enrich] API error:', zoomInfoResponse.status, errorText);

      // Handle specific error cases
      if (zoomInfoResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'ZoomInfo API authentication failed. Check API key.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (zoomInfoResponse.status === 403) {
        return new Response(
          JSON.stringify({ error: 'ZoomInfo API access denied. Check API permissions.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (zoomInfoResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'ZoomInfo API rate limit exceeded. Try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `ZoomInfo API error: ${zoomInfoResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const zoomInfoData = await zoomInfoResponse.json() as ZoomInfoSearchResponse;

    console.log(`[ZoomInfo Enrich] Found ${zoomInfoData.data?.result?.length || 0} results`);

    // Transform results for frontend
    const matches = (zoomInfoData.data?.result || []).map((person) => ({
      zoominfo_person_id: person.id,
      first_name: person.firstName,
      last_name: person.lastName,
      email: person.email,
      phone: person.phone,
      mobile_phone: person.mobilePhone,
      title: person.jobTitle,
      company: person.companyName,
      linkedin_url: person.linkedinUrl,
      zoominfo_profile_url: `https://app.zoominfo.com/#/apps/person/${person.id}`,
      city: person.city,
      state: person.state,
      country: person.country,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: request.contact_id,
        matches,
        total_results: zoomInfoData.data?.totalResults || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ZoomInfo Enrich] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
