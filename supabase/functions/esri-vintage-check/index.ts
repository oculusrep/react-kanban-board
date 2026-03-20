/**
 * ESRI Data Vintage Check Edge Function
 *
 * Checks if ESRI GeoEnrichment data has been refreshed by comparing
 * the data vintage and sample population values from a test location.
 * Sends email notification when new data is detected.
 *
 * This function should be called monthly via a cron job (pg_cron or external scheduler).
 *
 * Required Supabase Secrets:
 * - ESRI_API_KEY: Your ESRI/ArcGIS API key
 * - RESEND_API_KEY: API key for sending email notifications
 * - ADMIN_EMAIL: Email address to receive notifications
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ESRI_ENRICH_URL = 'https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich';

// Sample location: Atlanta, GA (consistent location for vintage checks)
const SAMPLE_LATITUDE = 33.749;
const SAMPLE_LONGITUDE = -84.388;

interface VintageCheckResult {
  data_vintage: string | null;
  sample_population: number | null;
  is_new_data: boolean;
  previous_vintage: string | null;
  previous_population: number | null;
}

/**
 * Call ESRI API to get current data vintage and sample population
 */
async function checkEsriVintage(apiKey: string): Promise<{
  vintage: string | null;
  population: number | null;
  raw: unknown;
}> {
  const studyAreas = [
    {
      geometry: {
        x: SAMPLE_LONGITUDE,
        y: SAMPLE_LATITUDE,
      },
      areaType: 'RingBuffer',
      bufferUnits: 'esriMiles',
      bufferRadii: [1],
    },
  ];

  const params = new URLSearchParams({
    f: 'json',
    token: apiKey,
    studyAreas: JSON.stringify(studyAreas),
    analysisVariables: JSON.stringify(['TOTPOP_CY']),
    returnGeometry: 'false',
  });

  console.log('[VintageCheck] Calling ESRI API for sample location');

  const response = await fetch(`${ESRI_ENRICH_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[VintageCheck] API error:', response.status, errorText);
    throw new Error(`ESRI API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error('[VintageCheck] ESRI error response:', data.error);
    throw new Error(`ESRI error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  // Extract data vintage from response
  // ESRI returns vintage info in the response metadata
  let vintage: string | null = null;
  let population: number | null = null;

  try {
    // Look for vintage in various places ESRI might put it
    if (data.results?.[0]?.value?.FeatureSet?.[0]?.features?.[0]?.attributes) {
      const attrs = data.results[0].value.FeatureSet[0].features[0].attributes;
      population = attrs.TOTPOP_CY ?? null;

      // Check for data vintage field - ESRI sometimes includes this
      vintage = attrs.DataVintage ?? attrs.DATAVINTAGE ?? attrs.sourceCountry ?? null;
    }

    // Also check the response-level metadata
    if (!vintage && data.results?.[0]?.value?.FeatureSet?.[0]?.fieldAliases) {
      // Sometimes vintage is in field metadata
      const fields = data.results[0].value.FeatureSet[0].fields;
      if (fields) {
        for (const field of fields) {
          if (field.name?.includes('vintage') || field.alias?.includes('Vintage')) {
            vintage = field.alias || field.name;
            break;
          }
        }
      }
    }

    // If still no vintage, derive from the current year suffix
    // ESRI's _CY suffix means "Current Year" - we can infer the vintage
    if (!vintage) {
      // The data vintage is typically the year the data represents
      // Since ESRI updates in spring with current year estimates,
      // we'll use the population value changes as the indicator
      vintage = new Date().getFullYear().toString();
    }
  } catch (err) {
    console.error('[VintageCheck] Error parsing response:', err);
  }

  console.log('[VintageCheck] Extracted vintage:', vintage, 'population:', population);

  return { vintage, population, raw: data };
}

/**
 * Send email notification about new data availability
 */
async function sendNotification(
  resendApiKey: string,
  adminEmail: string,
  result: VintageCheckResult
): Promise<boolean> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OVIS <noreply@resend.dev>',
        to: [adminEmail],
        subject: 'ESRI GeoEnrichment Data Has Been Updated',
        html: `
          <h2>ESRI Data Refresh Detected</h2>
          <p>The ESRI GeoEnrichment API data has been updated. You may want to refresh your property demographics.</p>

          <h3>Details</h3>
          <ul>
            <li><strong>Previous Data Vintage:</strong> ${result.previous_vintage || 'Unknown'}</li>
            <li><strong>New Data Vintage:</strong> ${result.data_vintage || 'Unknown'}</li>
            <li><strong>Previous Sample Population:</strong> ${result.previous_population?.toLocaleString() || 'N/A'}</li>
            <li><strong>New Sample Population:</strong> ${result.sample_population?.toLocaleString() || 'N/A'}</li>
          </ul>

          <h3>Recommended Action</h3>
          <p>Consider running a bulk re-enrichment of your properties to get the latest demographic data.</p>
          <p>Estimated cost: ~$131 for 4,228 properties (31 attributes × $0.001 per attribute)</p>

          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated notification from OVIS.
          </p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[VintageCheck] Email send error:', error);
      return false;
    }

    console.log('[VintageCheck] Notification email sent successfully');
    return true;
  } catch (err) {
    console.error('[VintageCheck] Failed to send notification:', err);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ESRI_API_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey) {
      throw new Error('ESRI_API_KEY not configured');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current ESRI data vintage
    const { vintage, population, raw } = await checkEsriVintage(apiKey);

    // Get the most recent previous check
    const { data: previousCheck } = await supabase
      .from('esri_data_vintage')
      .select('data_vintage, sample_population')
      .order('checked_at', { ascending: false })
      .limit(1)
      .single();

    // Determine if data has changed
    const isNewData = previousCheck
      ? (vintage !== previousCheck.data_vintage ||
         (population !== null && previousCheck.sample_population !== null &&
          Math.abs(population - previousCheck.sample_population) > 100))
      : false;

    const result: VintageCheckResult = {
      data_vintage: vintage,
      sample_population: population,
      is_new_data: isNewData,
      previous_vintage: previousCheck?.data_vintage || null,
      previous_population: previousCheck?.sample_population || null,
    };

    // Store the check result
    let notificationSent = false;
    if (isNewData && resendApiKey && adminEmail) {
      notificationSent = await sendNotification(resendApiKey, adminEmail, result);
    }

    const { error: insertError } = await supabase
      .from('esri_data_vintage')
      .insert({
        data_vintage: vintage,
        sample_population: population,
        sample_latitude: SAMPLE_LATITUDE,
        sample_longitude: SAMPLE_LONGITUDE,
        raw_response: raw,
        notification_sent: notificationSent,
        notification_sent_at: notificationSent ? new Date().toISOString() : null,
      });

    if (insertError) {
      console.error('[VintageCheck] Failed to store check result:', insertError);
    }

    console.log('[VintageCheck] Check complete:', {
      isNewData,
      vintage,
      population,
      previousVintage: previousCheck?.data_vintage,
      previousPopulation: previousCheck?.sample_population,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        notification_sent: notificationSent,
        message: isNewData
          ? 'New ESRI data detected! Notification sent.'
          : 'No data changes detected.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[VintageCheck] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
