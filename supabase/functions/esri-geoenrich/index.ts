/**
 * ESRI GeoEnrichment Edge Function
 *
 * Enriches property locations with demographic and psychographic data using
 * ESRI's GeoEnrichment API. Returns Tapestry segmentation, population, household,
 * and income data for 1, 3, and 5 mile radii.
 *
 * Required Supabase Secrets:
 * - ESRI_API_KEY: Your ESRI/ArcGIS API key with GeoEnrichment service privilege
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ESRI_ENRICH_URL = 'https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich';

interface GeoenrichRequest {
  property_id: string;
  latitude: number;
  longitude: number;
  force_refresh?: boolean;
}

interface StudyAreaOptions {
  areaType: string;
  bufferUnits: string;
  bufferRadii: number[];
}

/**
 * Call ESRI GeoEnrichment API
 */
async function enrichLocation(
  apiKey: string,
  latitude: number,
  longitude: number
): Promise<EsriEnrichmentResult> {
  // Define study areas with ring buffers at 1, 3, 5 miles
  const studyAreas = [
    {
      geometry: {
        x: longitude,
        y: latitude,
      },
      areaType: 'RingBuffer',
      bufferUnits: 'esriMiles',
      bufferRadii: [1, 3, 5],
    },
  ];

  // Request key demographic data collections
  // - KeyUSFacts: Population, households, basic demographics
  // - tapestry: Tapestry segmentation (psychographics)
  // - income: Household income data
  const dataCollections = [
    'KeyUSFacts',
    'tapestry',
    'income',
  ];

  const params = new URLSearchParams({
    f: 'json',
    token: apiKey,
    studyAreas: JSON.stringify(studyAreas),
    dataCollections: JSON.stringify(dataCollections),
    returnGeometry: 'false',
  });

  console.log('[ESRI] Calling GeoEnrichment API for:', { latitude, longitude });

  const response = await fetch(`${ESRI_ENRICH_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ESRI] Enrich API error:', response.status, errorText);
    throw new Error(`ESRI GeoEnrichment failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error('[ESRI] Enrich error:', data.error);
    throw new Error(`ESRI GeoEnrichment error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return parseEsriResponse(data);
}

interface EsriEnrichmentResult {
  tapestry: {
    code: string | null;
    name: string | null;
    description: string | null;
    lifemodes: string | null;
  };
  demographics: {
    pop_1_mile: number | null;
    pop_3_mile: number | null;
    pop_5_mile: number | null;
    households_1_mile: number | null;
    households_3_mile: number | null;
    households_5_mile: number | null;
    hh_income_median_1_mile: number | null;
    hh_income_median_3_mile: number | null;
    hh_income_median_5_mile: number | null;
    hh_income_avg_1_mile: number | null;
    hh_income_avg_3_mile: number | null;
    hh_income_avg_5_mile: number | null;
  };
  raw_response: unknown;
}

// Tapestry segment descriptions (top segments)
// Full list at: https://www.esri.com/en-us/arcgis/products/data/data-portfolio/tapestry-segmentation
const TAPESTRY_SEGMENTS: Record<string, { name: string; description: string; lifemode: string }> = {
  '1A': { name: 'Top Tier', description: 'Most affluent consumers living in exclusive neighborhoods.', lifemode: 'Affluent Estates' },
  '1B': { name: 'Professional Pride', description: 'Successful professionals in upscale suburban homes.', lifemode: 'Affluent Estates' },
  '1C': { name: 'Boomburbs', description: 'Prosperous families in large homes in newer suburban neighborhoods.', lifemode: 'Affluent Estates' },
  '1D': { name: 'Savvy Suburbanites', description: 'Well-educated, well-read couples in established suburbs.', lifemode: 'Affluent Estates' },
  '1E': { name: 'Exurbanites', description: 'Educated, active professionals living on the fringe of metro areas.', lifemode: 'Affluent Estates' },
  '2A': { name: 'Urban Chic', description: 'Professionals who prefer an urban, cosmopolitan lifestyle.', lifemode: 'Upscale Avenues' },
  '2B': { name: 'Pleasantville', description: 'Successful young families in newer suburban developments.', lifemode: 'Upscale Avenues' },
  '2C': { name: 'Pacific Heights', description: 'Prosperous older couples in high-value coastal housing.', lifemode: 'Upscale Avenues' },
  '2D': { name: 'Enterprising Professionals', description: 'Young, educated working professionals in upscale apartments.', lifemode: 'Upscale Avenues' },
  '3A': { name: 'Laptops and Lattes', description: 'Educated singles and couples in trendy urban neighborhoods.', lifemode: 'Uptown Individuals' },
  '3B': { name: 'Metro Renters', description: 'Young, educated singles in metro areas renting apartments.', lifemode: 'Uptown Individuals' },
  '3C': { name: 'Trendsetters', description: 'Young, diverse, mobile consumers in metro areas.', lifemode: 'Uptown Individuals' },
  '4A': { name: 'Soccer Moms', description: 'Affluent families living in the suburbs with focus on children.', lifemode: 'Family Landscapes' },
  '4B': { name: 'Home Improvement', description: 'Upper middle-class families in older suburban homes.', lifemode: 'Family Landscapes' },
  '4C': { name: 'Middleburg', description: 'Midscale, middle-aged couples in suburban or small-town homes.', lifemode: 'Family Landscapes' },
  '5A': { name: 'Comfortable Empty Nesters', description: 'Older, established couples in single-family homes.', lifemode: 'GenXurban' },
  '5B': { name: 'In Style', description: 'Professional couples in affluent suburban neighborhoods.', lifemode: 'GenXurban' },
  '5C': { name: 'Parks and Rec', description: 'Active, middle-aged couples in suburban neighborhoods.', lifemode: 'GenXurban' },
  '5D': { name: 'Rustbelt Traditions', description: 'Middle-income, middle-aged families in older industrial areas.', lifemode: 'GenXurban' },
  '5E': { name: 'Midlife Constants', description: 'Mature couples in older suburban homes.', lifemode: 'GenXurban' },
  '6A': { name: 'Green Acres', description: 'Educated, higher-income families in rural areas.', lifemode: 'Cozy Country Living' },
  '6B': { name: 'Salt of the Earth', description: 'Hardworking, older households in rural communities.', lifemode: 'Cozy Country Living' },
  '6C': { name: 'The Great Outdoors', description: 'Empty nesters in rural areas who love outdoor activities.', lifemode: 'Cozy Country Living' },
  '6D': { name: 'Prairie Living', description: 'Middle-income families and couples in rural Midwest areas.', lifemode: 'Cozy Country Living' },
  '6E': { name: 'Rural Resort Dwellers', description: 'Older residents in seasonal or recreational areas.', lifemode: 'Cozy Country Living' },
  '6F': { name: 'Heartland Communities', description: 'Older, settled residents in small towns.', lifemode: 'Cozy Country Living' },
  '7A': { name: 'Up and Coming Families', description: 'Young families with children in suburban areas.', lifemode: 'Ethnic Enclaves' },
  '7B': { name: 'Urban Villages', description: 'Diverse, multigenerational families in urban neighborhoods.', lifemode: 'Ethnic Enclaves' },
  '7C': { name: 'American Dreamers', description: 'Young, diverse families in urban areas pursuing success.', lifemode: 'Ethnic Enclaves' },
  '7D': { name: 'Barrios Urbanos', description: 'Young Hispanic families in urban neighborhoods.', lifemode: 'Ethnic Enclaves' },
  '7E': { name: 'Valley Growers', description: 'Hispanic families in agricultural communities.', lifemode: 'Ethnic Enclaves' },
  '7F': { name: 'Southwestern Families', description: 'Young Hispanic families in Southwest metro areas.', lifemode: 'Ethnic Enclaves' },
  '8A': { name: 'City Lights', description: 'Diverse, young city dwellers in older urban areas.', lifemode: 'Middle Ground' },
  '8B': { name: 'Emerald City', description: 'Diverse, educated young singles and couples in cities.', lifemode: 'Middle Ground' },
  '8C': { name: 'Bright Young Professionals', description: 'Young, educated, single, urban professionals.', lifemode: 'Middle Ground' },
  '8D': { name: 'Downtown Melting Pot', description: 'Diverse, young urban renters in downtown areas.', lifemode: 'Middle Ground' },
  '8E': { name: 'Front Porches', description: 'Young families in older urban neighborhoods.', lifemode: 'Middle Ground' },
  '8F': { name: 'Old and Newcomers', description: 'Mix of long-time residents and newcomers in transitional areas.', lifemode: 'Middle Ground' },
  '8G': { name: 'Hardscrabble Road', description: 'Older, less affluent households in urban areas.', lifemode: 'Middle Ground' },
  '9A': { name: 'Silver and Gold', description: 'Wealthy, retired couples in planned communities.', lifemode: 'Senior Styles' },
  '9B': { name: 'Golden Years', description: 'Retirees living in retirement communities.', lifemode: 'Senior Styles' },
  '9C': { name: 'The Elders', description: 'Older, lower-income residents in older urban areas.', lifemode: 'Senior Styles' },
  '9D': { name: 'Senior Escapes', description: 'Retirees in seasonal and vacation areas.', lifemode: 'Senior Styles' },
  '9E': { name: 'Retirement Communities', description: 'Seniors in age-restricted communities.', lifemode: 'Senior Styles' },
  '9F': { name: 'Social Security Set', description: 'Older, lower-income singles and couples.', lifemode: 'Senior Styles' },
  '10A': { name: 'Southern Satellites', description: 'Lower-income families in rural Southern areas.', lifemode: 'Rustic Outposts' },
  '10B': { name: 'Rooted Rural', description: 'Established, lower-income rural households.', lifemode: 'Rustic Outposts' },
  '10C': { name: 'Diners & Miners', description: 'Lower-income households in small mining towns.', lifemode: 'Rustic Outposts' },
  '10D': { name: 'Down the Road', description: 'Lower-income households in rural areas.', lifemode: 'Rustic Outposts' },
  '10E': { name: 'Rural Bypasses', description: 'Lower-income, older households in isolated rural areas.', lifemode: 'Rustic Outposts' },
  '11A': { name: 'City Strivers', description: 'Young, diverse, lower-income urban singles.', lifemode: 'Midtown Singles' },
  '11B': { name: 'Young and Restless', description: 'Young, mobile, urban singles with modest incomes.', lifemode: 'Midtown Singles' },
  '11C': { name: 'Metro Fusion', description: 'Diverse, young singles in densely populated metro areas.', lifemode: 'Midtown Singles' },
  '11D': { name: 'Set to Impress', description: 'Young singles in urban areas seeking success.', lifemode: 'Midtown Singles' },
  '11E': { name: 'City Commons', description: 'Lower-income, diverse urban singles and families.', lifemode: 'Midtown Singles' },
  '12A': { name: 'Family Foundations', description: 'Lower-income families with children in older suburban areas.', lifemode: 'Hometown' },
  '12B': { name: 'Traditional Living', description: 'Lower-middle-income families in older suburban areas.', lifemode: 'Hometown' },
  '12C': { name: 'Small Town Simplicity', description: 'Lower-income families and retirees in small towns.', lifemode: 'Hometown' },
  '12D': { name: 'Modest Income Homes', description: 'Lower-income, older households in modest homes.', lifemode: 'Hometown' },
};

/**
 * Parse ESRI GeoEnrichment API response
 */
function parseEsriResponse(data: unknown): EsriEnrichmentResult {
  const result: EsriEnrichmentResult = {
    tapestry: {
      code: null,
      name: null,
      description: null,
      lifemodes: null,
    },
    demographics: {
      pop_1_mile: null,
      pop_3_mile: null,
      pop_5_mile: null,
      households_1_mile: null,
      households_3_mile: null,
      households_5_mile: null,
      hh_income_median_1_mile: null,
      hh_income_median_3_mile: null,
      hh_income_median_5_mile: null,
      hh_income_avg_1_mile: null,
      hh_income_avg_3_mile: null,
      hh_income_avg_5_mile: null,
    },
    raw_response: data,
  };

  try {
    const response = data as { results?: Array<{ value?: { FeatureSet?: Array<{ features?: Array<{ attributes?: Record<string, unknown> }> }> } }> };
    const results = response.results;

    if (!results || results.length === 0) {
      console.log('[ESRI] No results in response');
      return result;
    }

    // Results come back in order of buffer radii: 1 mile, 3 mile, 5 mile
    const featureSets = results[0]?.value?.FeatureSet;

    if (!featureSets || featureSets.length === 0) {
      console.log('[ESRI] No feature sets in response');
      return result;
    }

    // Process each ring buffer result
    const radiusMap = ['1_mile', '3_mile', '5_mile'];

    featureSets.forEach((featureSet, index) => {
      const radius = radiusMap[index];
      const features = featureSet.features;

      if (!features || features.length === 0) return;

      const attrs = features[0].attributes || {};

      // Log available attributes for debugging
      if (index === 0) {
        console.log('[ESRI] Available attributes (1-mile):', Object.keys(attrs).slice(0, 30));
      }

      // Population - try common variable names
      const pop = attrs.TOTPOP || attrs.TOTPOP_CY || attrs.TSPOP_CY || attrs.POP_CY;
      if (pop !== undefined) {
        (result.demographics as Record<string, number | null>)[`pop_${radius}`] = Number(pop);
      }

      // Households - try common variable names
      const hh = attrs.TOTHH || attrs.TOTHH_CY || attrs.TSHH_CY || attrs.HH_CY;
      if (hh !== undefined) {
        (result.demographics as Record<string, number | null>)[`households_${radius}`] = Number(hh);
      }

      // Median household income
      const medianIncome = attrs.MEDHINC_CY || attrs.MEDHHINC || attrs.HINC_MEDIAN;
      if (medianIncome !== undefined) {
        (result.demographics as Record<string, number | null>)[`hh_income_median_${radius}`] = Number(medianIncome);
      }

      // Average household income
      const avgIncome = attrs.AVGHINC_CY || attrs.AVGHHINC || attrs.HINC_AVG;
      if (avgIncome !== undefined) {
        (result.demographics as Record<string, number | null>)[`hh_income_avg_${radius}`] = Number(avgIncome);
      }

      // Tapestry - only get from first (1-mile) result for dominant segment
      if (index === 0) {
        // TSEGCODE or DOMTAP contains the segment code like "1A", "3B"
        const tapestryCode = attrs.TSEGCODE || attrs.DOMTAP || attrs.TAPSEGCODE;
        if (tapestryCode) {
          const code = String(tapestryCode);
          result.tapestry.code = code;

          // Look up segment details
          const segment = TAPESTRY_SEGMENTS[code];
          if (segment) {
            result.tapestry.name = segment.name;
            result.tapestry.description = segment.description;
            result.tapestry.lifemodes = segment.lifemode;
          } else {
            // Try to get name from response if available
            result.tapestry.name = attrs.TSEGNAME ? String(attrs.TSEGNAME) : null;
            result.tapestry.lifemodes = attrs.TLIFENAME ? String(attrs.TLIFENAME) : null;
          }
        }
      }
    });

    console.log('[ESRI] Parsed result:', {
      tapestry: result.tapestry,
      pop_1_mile: result.demographics.pop_1_mile,
      pop_3_mile: result.demographics.pop_3_mile,
    });

  } catch (err) {
    console.error('[ESRI] Error parsing response:', err);
  }

  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ESRI_API_KEY');

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ESRI credentials not configured. Need ESRI_API_KEY secret.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const request = await req.json() as GeoenrichRequest;

    // Validate request
    if (!request.property_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'property_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!request.latitude || !request.longitude) {
      return new Response(
        JSON.stringify({ success: false, error: 'latitude and longitude are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate coordinates are reasonable (within US continental + Alaska/Hawaii)
    if (request.latitude < 18 || request.latitude > 72 || request.longitude < -180 || request.longitude > -65) {
      return new Response(
        JSON.stringify({ success: false, error: 'Coordinates appear to be outside the US coverage area' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ESRI Geoenrich] Enriching property ${request.property_id}:`, {
      latitude: request.latitude,
      longitude: request.longitude,
      force_refresh: request.force_refresh,
    });

    // Call ESRI GeoEnrichment API
    const enrichmentResult = await enrichLocation(apiKey, request.latitude, request.longitude);

    return new Response(
      JSON.stringify({
        success: true,
        property_id: request.property_id,
        ...enrichmentResult,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ESRI Geoenrich] Error:', error);

    // Handle specific error cases
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('authentication failed') || errorMessage.includes('401')) {
      return new Response(
        JSON.stringify({ success: false, error: 'ESRI API authentication failed. Check API credentials.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (errorMessage.includes('403')) {
      return new Response(
        JSON.stringify({ success: false, error: 'ESRI API access denied. Check API permissions.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (errorMessage.includes('429')) {
      return new Response(
        JSON.stringify({ success: false, error: 'ESRI API rate limit exceeded. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        errorType: error instanceof Error ? error.name : 'Unknown',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
