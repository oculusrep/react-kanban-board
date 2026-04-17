/**
 * ESRI GeoEnrichment Edge Function
 *
 * Enriches property locations with demographic and psychographic data using
 * ESRI's GeoEnrichment API. Returns Tapestry segmentation, population, household,
 * income, employee, and median age data for 1, 3, 5 mile radii and 15-minute drive time.
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
  custom_radii?: number[];
  custom_drive_times?: number[];
}

/**
 * ESRI Analysis Variables
 *
 * These use the correct ESRI GeoEnrichment variable format.
 * Variables are from the "USA" data collection with current year (_CY) suffix.
 *
 * Reference: https://doc.arcgis.com/en/esri-demographics/latest/regional-data/united-states-702.htm
 *
 * Variable naming convention for USA data: VariableName (e.g., TOTPOP_CY)
 *
 * IMPORTANT: Demographic and Tapestry variables MUST be requested separately.
 * ESRI returns error "Multi-hierarchy calculations are not supported for country 'US'"
 * when mixing variables from different data collections in the same request.
 */

// Demographic variables - can be combined in one request
const DEMOGRAPHIC_VARIABLES = [
  // Population - Current Year
  'TOTPOP_CY',

  // Households - Current Year
  'TOTHH_CY',

  // Median Age - Current Year
  'MEDAGE_CY',

  // Average Household Income - Current Year
  'AVGHINC_CY',

  // Median Household Income - Current Year
  'MEDHINC_CY',

  // Daytime Population - Workers (people who work in the area)
  'DPOPWRK_CY',

  // Total Daytime Population (workers + residents at home)
  // More useful for retail as it captures everyone present during business hours
  'DPOP_CY',
];

// Tapestry variables - MUST be requested separately from demographics for US data
const TAPESTRY_VARIABLES = [
  'TSEGNAME',
  'TSEGCODE',
  'TLIFENAME',
];

interface EsriEnrichmentResult {
  tapestry: {
    code: string | null;
    name: string | null;
    description: string | null;
    lifemodes: string | null;
  };
  demographics: {
    // Ring buffer demographics
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
    employees_1_mile: number | null;
    employees_3_mile: number | null;
    employees_5_mile: number | null;
    median_age_1_mile: number | null;
    median_age_3_mile: number | null;
    median_age_5_mile: number | null;
    daytime_pop_1_mile: number | null;
    daytime_pop_3_mile: number | null;
    daytime_pop_5_mile: number | null;
    // 10-minute drive time demographics
    pop_10min_drive: number | null;
    households_10min_drive: number | null;
    hh_income_median_10min_drive: number | null;
    hh_income_avg_10min_drive: number | null;
    employees_10min_drive: number | null;
    median_age_10min_drive: number | null;
    daytime_pop_10min_drive: number | null;
  };
  raw_response: unknown;
}

// Tapestry segment descriptions (top segments)
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
  '13A': { name: 'International Marketplace', description: 'Diverse, urban renters in gateway cities.', lifemode: 'Next Wave' },
  '13B': { name: 'Las Casas', description: 'Hispanic homeowners in urban enclaves.', lifemode: 'Next Wave' },
  '13C': { name: 'NeWest Residents', description: 'Recent immigrants in diverse urban neighborhoods.', lifemode: 'Next Wave' },
  '13D': { name: 'Fresh Ambitions', description: 'Young, diverse families pursuing the American dream.', lifemode: 'Next Wave' },
  '13E': { name: 'High Rise Renters', description: 'Young, diverse renters in high-rise apartments.', lifemode: 'Next Wave' },
  '14A': { name: 'Military Proximity', description: 'Young families near military bases.', lifemode: 'Scholars and Patriots' },
  '14B': { name: 'College Towns', description: 'Students and young residents in college communities.', lifemode: 'Scholars and Patriots' },
  '14C': { name: 'Dorms to Diplomas', description: 'College students living on or near campus.', lifemode: 'Scholars and Patriots' },
};

/**
 * Call ESRI GeoEnrichment API for ring buffers (1, 3, 5 miles) - Demographics only
 */
async function enrichRingBuffersDemographics(
  apiKey: string,
  latitude: number,
  longitude: number,
  radii: number[] = [1, 3, 5]
): Promise<{ results: unknown; raw: unknown }> {
  // Study areas with ring buffers at specified radii
  const studyAreas = [
    {
      geometry: {
        x: longitude,
        y: latitude,
      },
      areaType: 'RingBuffer',
      bufferUnits: 'esriMiles',
      bufferRadii: radii,
    },
  ];

  const params = new URLSearchParams({
    f: 'json',
    token: apiKey,
    studyAreas: JSON.stringify(studyAreas),
    analysisVariables: JSON.stringify(DEMOGRAPHIC_VARIABLES),
    returnGeometry: 'false',
  });

  console.log('[ESRI] Calling GeoEnrichment API for ring buffers (demographics):', { latitude, longitude });
  console.log('[ESRI] Demographic variables:', DEMOGRAPHIC_VARIABLES);

  const response = await fetch(`${ESRI_ENRICH_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ESRI] Ring buffer demographics API error:', response.status, errorText);
    throw new Error(`ESRI GeoEnrichment failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error('[ESRI] Ring buffer demographics error:', data.error);
    throw new Error(`ESRI GeoEnrichment error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return { results: data, raw: data };
}

/**
 * Call ESRI GeoEnrichment API for Tapestry segmentation (1-mile only for dominant segment)
 */
async function enrichTapestry(
  apiKey: string,
  latitude: number,
  longitude: number
): Promise<{ results: unknown; raw: unknown }> {
  // Study area with 1-mile buffer for Tapestry (dominant segment)
  const studyAreas = [
    {
      geometry: {
        x: longitude,
        y: latitude,
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
    analysisVariables: JSON.stringify(TAPESTRY_VARIABLES),
    returnGeometry: 'false',
  });

  console.log('[ESRI] Calling GeoEnrichment API for Tapestry:', { latitude, longitude });
  console.log('[ESRI] Tapestry variables:', TAPESTRY_VARIABLES);

  const response = await fetch(`${ESRI_ENRICH_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ESRI] Tapestry API error:', response.status, errorText);
    throw new Error(`ESRI GeoEnrichment Tapestry failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error('[ESRI] Tapestry error:', data.error);
    throw new Error(`ESRI GeoEnrichment Tapestry error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return { results: data, raw: data };
}

/**
 * Call ESRI GeoEnrichment API for drive time (10 minutes) - Demographics only
 *
 * ESRI GeoEnrichment requires drive time parameters inside the studyAreas object.
 * Reference: https://developers.arcgis.com/rest/geoenrichment/enrich/
 *
 * NOTE: Drive time enrichment requires the "Network Analysis" privilege on the API key
 * in addition to the GeoEnrichment privilege. If this returns empty, check API key permissions.
 */
async function enrichDriveTime(
  apiKey: string,
  latitude: number,
  longitude: number,
  driveTimes: number[] = [10]
): Promise<{ results: unknown; raw: unknown }> {
  // Study area with NetworkServiceArea for drive time
  // All drive time parameters must be inside the studyAreas object, not in studyAreasOptions
  // Using both travelMode (camelCase) and travel_mode (snake_case) for compatibility
  const studyAreas = [
    {
      geometry: {
        x: longitude,
        y: latitude,
      },
      areaType: 'NetworkServiceArea',
      bufferUnits: 'Minutes',
      bufferRadii: driveTimes,
      travelMode: 'Driving',
    },
  ];

  const params = new URLSearchParams({
    f: 'json',
    token: apiKey,
    studyAreas: JSON.stringify(studyAreas),
    analysisVariables: JSON.stringify(DEMOGRAPHIC_VARIABLES),
    returnGeometry: 'true', // Required for NetworkServiceArea to work properly
  });

  console.log('[ESRI] Calling GeoEnrichment API for 10-min drive time:', { latitude, longitude });
  console.log('[ESRI] Drive time studyAreas:', JSON.stringify(studyAreas));

  const response = await fetch(`${ESRI_ENRICH_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ESRI] Drive time API error:', response.status, errorText);
    throw new Error(`ESRI GeoEnrichment drive time failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    console.error('[ESRI] Drive time error:', data.error);
    throw new Error(`ESRI GeoEnrichment error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return { results: data, raw: data };
}

/**
 * Extract numeric value from attributes, trying multiple possible field names
 */
function extractValue(attrs: Record<string, unknown>, ...fieldNames: string[]): number | null {
  for (const field of fieldNames) {
    const value = attrs[field];
    if (value !== undefined && value !== null) {
      const num = Number(value);
      if (!isNaN(num)) {
        return num;
      }
    }
  }
  return null;
}

/**
 * Extract string value from attributes, trying multiple possible field names
 */
function extractString(attrs: Record<string, unknown>, ...fieldNames: string[]): string | null {
  for (const field of fieldNames) {
    const value = attrs[field];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
  }
  return null;
}

/**
 * Helper to parse and store demographic attributes for a given radius
 */
function parseAndStoreDemographics(
  attrs: Record<string, unknown>,
  radius: string,
  result: EsriEnrichmentResult
): void {
  // Log available attributes and key values
  console.log(`[ESRI] Ring ${radius} available attributes:`, Object.keys(attrs));
  console.log(`[ESRI] Ring ${radius} values:`, {
    TOTPOP_CY: attrs.TOTPOP_CY,
    TOTHH_CY: attrs.TOTHH_CY,
    MEDAGE_CY: attrs.MEDAGE_CY,
    AVGHINC_CY: attrs.AVGHINC_CY,
    MEDHINC_CY: attrs.MEDHINC_CY,
    DPOPWRK_CY: attrs.DPOPWRK_CY,
    DPOP_CY: attrs.DPOP_CY,
  });

  // Population - Current Year
  const pop = extractValue(attrs, 'TOTPOP_CY', 'TOTPOP');
  if (pop !== null) {
    (result.demographics as Record<string, number | null>)[`pop_${radius}`] = pop;
  }

  // Households - Current Year
  const hh = extractValue(attrs, 'TOTHH_CY', 'TOTHH');
  if (hh !== null) {
    (result.demographics as Record<string, number | null>)[`households_${radius}`] = hh;
  }

  // Median Household Income - Current Year
  const medIncome = extractValue(attrs, 'MEDHINC_CY', 'MEDHINC');
  if (medIncome !== null) {
    (result.demographics as Record<string, number | null>)[`hh_income_median_${radius}`] = medIncome;
  }

  // Average Household Income - Current Year
  const avgIncome = extractValue(attrs, 'AVGHINC_CY', 'AVGHINC');
  if (avgIncome !== null) {
    (result.demographics as Record<string, number | null>)[`hh_income_avg_${radius}`] = avgIncome;
  }

  // Total Employees - Daytime Workers Current Year
  const emp = extractValue(attrs, 'DPOPWRK_CY', 'TOTALEMP', 'EMP_CY');
  if (emp !== null) {
    (result.demographics as Record<string, number | null>)[`employees_${radius}`] = emp;
  }

  // Median Age - Current Year
  const medAge = extractValue(attrs, 'MEDAGE_CY', 'MEDAGE');
  if (medAge !== null) {
    (result.demographics as Record<string, number | null>)[`median_age_${radius}`] = medAge;
  }

  // Total Daytime Population - Workers + Residents at home
  const daytimePop = extractValue(attrs, 'DPOP_CY', 'DPOP');
  if (daytimePop !== null) {
    (result.demographics as Record<string, number | null>)[`daytime_pop_${radius}`] = daytimePop;
  }
}

/**
 * Parse ESRI GeoEnrichment API response for ring buffer demographics
 *
 * ESRI GeoEnrichment API returns attributes with names based on the variable requested.
 * Note: Demographics and Tapestry are now parsed separately due to multi-hierarchy restriction.
 */
function parseRingBufferDemographicsResponse(data: unknown, result: EsriEnrichmentResult, radii: number[] = [1, 3, 5]): void {
  try {
    const response = data as { results?: Array<{ value?: { FeatureSet?: Array<{ features?: Array<{ attributes?: Record<string, unknown> }> }> } }> };
    const results = response.results;

    // Log the full response structure for debugging
    console.log('[ESRI] Ring buffer raw response keys:', Object.keys(data as object));
    console.log('[ESRI] Ring buffer results length:', results?.length);

    if (!results || results.length === 0) {
      console.log('[ESRI] No ring buffer demographics results');
      return;
    }

    // Log first result structure
    console.log('[ESRI] First result keys:', Object.keys(results[0] || {}));
    console.log('[ESRI] First result value keys:', Object.keys(results[0]?.value || {}));

    const featureSets = results[0]?.value?.FeatureSet;
    if (!featureSets || featureSets.length === 0) {
      console.log('[ESRI] No feature sets in ring buffer demographics response');
      console.log('[ESRI] Response structure:', JSON.stringify(results[0], null, 2).substring(0, 2000));
      return;
    }

    console.log(`[ESRI] Found ${featureSets.length} feature sets for ring buffer demographics`);

    // Log each feature set structure
    featureSets.forEach((fs, i) => {
      console.log(`[ESRI] FeatureSet[${i}] features count:`, fs.features?.length);
      if (fs.features?.[0]) {
        console.log(`[ESRI] FeatureSet[${i}] first feature attributes:`, JSON.stringify(fs.features[0].attributes).substring(0, 500));
      }
    });

    // ESRI can return data in two ways:
    // 1. Multiple FeatureSets (one per radius) - each with 1 feature
    // 2. Single FeatureSet with multiple features (one per radius)
    // We need to handle both cases

    const radiusMap = radii.map(r => `${r}_mile`);
    const radiusValues = radii;

    // Check if we have multiple feature sets (one per radius) or single feature set with multiple features
    if (featureSets.length >= 3) {
      // Multiple FeatureSets - one per radius
      console.log('[ESRI] Parsing multiple FeatureSets (one per radius)');
      featureSets.forEach((featureSet, index) => {
        if (index >= radiusMap.length) return; // Skip if more than 3
        const radius = radiusMap[index];
        const features = featureSet.features;

        if (!features || features.length === 0) {
          console.log(`[ESRI] Ring ${radius}: No features found`);
          return;
        }

        const attrs = features[0].attributes || {};
        parseAndStoreDemographics(attrs, radius, result);
      });
    } else if (featureSets.length === 1 && featureSets[0].features) {
      // Single FeatureSet - check if it has multiple features (one per radius)
      const features = featureSets[0].features;
      console.log(`[ESRI] Single FeatureSet with ${features.length} features`);

      if (features.length >= 3) {
        // Multiple features - one per radius
        features.forEach((feature, index) => {
          if (index >= radiusMap.length) return;
          const attrs = feature.attributes || {};

          // Try to detect radius from bufferRadii attribute
          const bufferRadii = attrs.bufferRadii;
          let radius: string;
          if (bufferRadii !== undefined) {
            const radiusVal = Number(bufferRadii);
            const radiusIndex = radiusValues.indexOf(radiusVal);
            radius = radiusIndex >= 0 ? radiusMap[radiusIndex] : radiusMap[index];
            console.log(`[ESRI] Feature ${index} bufferRadii=${bufferRadii}, using radius=${radius}`);
          } else {
            radius = radiusMap[index];
            console.log(`[ESRI] Feature ${index} no bufferRadii, assuming radius=${radius}`);
          }

          parseAndStoreDemographics(attrs, radius, result);
        });
      } else {
        // Just one feature - assume it's 1 mile
        const attrs = features[0].attributes || {};
        console.log('[ESRI] Single feature, assuming 1_mile');
        parseAndStoreDemographics(attrs, '1_mile', result);
      }
    }

  } catch (err) {
    console.error('[ESRI] Error parsing ring buffer demographics response:', err);
  }
}

/**
 * Parse ESRI GeoEnrichment API response for Tapestry segmentation
 */
function parseTapestryResponse(data: unknown, result: EsriEnrichmentResult): void {
  try {
    const response = data as { results?: Array<{ value?: { FeatureSet?: Array<{ features?: Array<{ attributes?: Record<string, unknown> }> }> } }> };
    const results = response.results;

    if (!results || results.length === 0) {
      console.log('[ESRI] No Tapestry results');
      return;
    }

    const featureSets = results[0]?.value?.FeatureSet;
    if (!featureSets || featureSets.length === 0) {
      console.log('[ESRI] No feature sets in Tapestry response');
      console.log('[ESRI] Tapestry response structure:', JSON.stringify(results[0], null, 2).substring(0, 1000));
      return;
    }

    const features = featureSets[0]?.features;
    if (!features || features.length === 0) {
      console.log('[ESRI] No features in Tapestry response');
      return;
    }

    const attrs = features[0].attributes || {};
    console.log('[ESRI] Tapestry available attributes:', Object.keys(attrs));
    console.log('[ESRI] Tapestry values:', {
      TSEGCODE: attrs.TSEGCODE,
      TSEGNAME: attrs.TSEGNAME,
      TLIFENAME: attrs.TLIFENAME,
    });

    // ESRI Tapestry variables: TSEGCODE, TSEGNAME, TLIFENAME
    const tapestryCode = extractString(attrs, 'TSEGCODE', 'TOP1CODE', 'DOMTAP');
    if (tapestryCode) {
      result.tapestry.code = tapestryCode;

      // Get Tapestry details from response
      const tapestryName = extractString(attrs, 'TSEGNAME', 'TOP1NAME');
      const tapestryLifemode = extractString(attrs, 'TLIFENAME', 'TOP1LIFEGROUP');
      const tapestryDesc = extractString(attrs, 'TDESCR', 'TOP1SUMMARY', 'TOP1SHORTSUMMARY');

      if (tapestryName) {
        result.tapestry.name = tapestryName;
      }
      if (tapestryLifemode) {
        result.tapestry.lifemodes = tapestryLifemode;
      }
      if (tapestryDesc) {
        result.tapestry.description = tapestryDesc;
      }

      // Fall back to our lookup table if response didn't have details
      const segment = TAPESTRY_SEGMENTS[tapestryCode];
      if (segment) {
        if (!result.tapestry.name) result.tapestry.name = segment.name;
        if (!result.tapestry.description) result.tapestry.description = segment.description;
        if (!result.tapestry.lifemodes) result.tapestry.lifemodes = segment.lifemode;
      }
    }

    console.log('[ESRI] Tapestry parsed:', result.tapestry);

  } catch (err) {
    console.error('[ESRI] Error parsing Tapestry response:', err);
  }
}

/**
 * Parse ESRI GeoEnrichment API response for drive time
 */
function parseDriveTimeResponse(data: unknown, result: EsriEnrichmentResult, driveTimes: number[] = [10]): void {
  try {
    const response = data as { results?: Array<{ value?: { FeatureSet?: Array<{ features?: Array<{ attributes?: Record<string, unknown> }> }> } }> };
    const results = response.results;

    if (!results || results.length === 0) {
      console.log('[ESRI] No drive time results');
      return;
    }

    const featureSets = results[0]?.value?.FeatureSet;
    if (!featureSets || featureSets.length === 0) {
      console.log('[ESRI] No feature sets in drive time response');
      console.log('[ESRI] Drive time response structure:', JSON.stringify(results[0], null, 2).substring(0, 1000));
      return;
    }

    // Handle multiple drive times - each may be a separate feature or feature set
    const allFeatures: Array<{ attributes: Record<string, unknown> }> = [];
    for (const fs of featureSets) {
      if (fs.features) {
        allFeatures.push(...fs.features.map(f => ({ attributes: f.attributes || {} })));
      }
    }

    if (allFeatures.length === 0) {
      console.log('[ESRI] No features in drive time response');
      return;
    }

    // Parse each drive time feature
    for (let i = 0; i < Math.min(allFeatures.length, driveTimes.length); i++) {
      const attrs = allFeatures[i].attributes;
      const driveTimeKey = `${driveTimes[i]}min_drive`;

      console.log(`[ESRI] Drive time ${driveTimes[i]}min available attributes:`, Object.keys(attrs));

      const demographics = result.demographics as Record<string, number | null>;
      const pop = extractValue(attrs, 'TOTPOP_CY', 'TOTPOP');
      if (pop !== null) demographics[`pop_${driveTimeKey}`] = pop;

      const hh = extractValue(attrs, 'TOTHH_CY', 'TOTHH');
      if (hh !== null) demographics[`households_${driveTimeKey}`] = hh;

      const medIncome = extractValue(attrs, 'MEDHINC_CY', 'MEDHINC');
      if (medIncome !== null) demographics[`hh_income_median_${driveTimeKey}`] = medIncome;

      const avgIncome = extractValue(attrs, 'AVGHINC_CY', 'AVGHINC');
      if (avgIncome !== null) demographics[`hh_income_avg_${driveTimeKey}`] = avgIncome;

      const emp = extractValue(attrs, 'DPOPWRK_CY', 'TOTALEMP', 'EMP_CY');
      if (emp !== null) demographics[`employees_${driveTimeKey}`] = emp;

      const medAge = extractValue(attrs, 'MEDAGE_CY', 'MEDAGE');
      if (medAge !== null) demographics[`median_age_${driveTimeKey}`] = medAge;

      const daytimePop = extractValue(attrs, 'DPOP_CY', 'DPOP');
      if (daytimePop !== null) demographics[`daytime_pop_${driveTimeKey}`] = daytimePop;
    }

  } catch (err) {
    console.error('[ESRI] Error parsing drive time response:', err);
  }
}

/**
 * Main enrichment function - calls demographics, Tapestry, and drive time APIs separately
 *
 * Note: ESRI requires separate API calls for Tapestry vs demographic variables in US data
 * due to "Multi-hierarchy calculations are not supported for country 'US'" error.
 */
async function enrichLocation(
  apiKey: string,
  latitude: number,
  longitude: number,
  customRadii?: number[],
  customDriveTimes?: number[]
): Promise<EsriEnrichmentResult> {
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
      employees_1_mile: null,
      employees_3_mile: null,
      employees_5_mile: null,
      median_age_1_mile: null,
      median_age_3_mile: null,
      median_age_5_mile: null,
      daytime_pop_1_mile: null,
      daytime_pop_3_mile: null,
      daytime_pop_5_mile: null,
      pop_10min_drive: null,
      households_10min_drive: null,
      hh_income_median_10min_drive: null,
      hh_income_avg_10min_drive: null,
      employees_10min_drive: null,
      median_age_10min_drive: null,
      daytime_pop_10min_drive: null,
    },
    raw_response: {},
  };

  const radii = customRadii || [1, 3, 5];
  const driveTimes = customDriveTimes || [10];

  // Call all three APIs in parallel for efficiency
  // - Demographics ring buffers (custom or default radii)
  // - Tapestry (1 mile only, must be separate from demographics)
  // - Drive time (custom or default drive times)
  const [ringBufferDemoResult, tapestryResult, driveTimeResult] = await Promise.all([
    enrichRingBuffersDemographics(apiKey, latitude, longitude, radii),
    enrichTapestry(apiKey, latitude, longitude).catch(err => {
      // Tapestry may fail in some areas - don't fail the whole request
      console.warn('[ESRI] Tapestry enrichment failed (continuing without):', err.message);
      return null;
    }),
    enrichDriveTime(apiKey, latitude, longitude, driveTimes).catch(err => {
      // Drive time may fail in some areas - don't fail the whole request
      console.warn('[ESRI] Drive time enrichment failed (continuing without):', err.message);
      return null;
    }),
  ]);

  // Store raw responses
  result.raw_response = {
    ringBufferDemographics: ringBufferDemoResult.raw,
    tapestry: tapestryResult?.raw || null,
    driveTime: driveTimeResult?.raw || null,
  };

  // Parse ring buffer demographics response
  parseRingBufferDemographicsResponse(ringBufferDemoResult.results, result, radii);

  // Parse Tapestry response if available
  if (tapestryResult) {
    parseTapestryResponse(tapestryResult.results, result);
  }

  // Parse drive time response if available
  if (driveTimeResult) {
    parseDriveTimeResponse(driveTimeResult.results, result, driveTimes);
  }

  console.log('[ESRI] Final parsed result:', {
    tapestry: result.tapestry,
    pop_1_mile: result.demographics.pop_1_mile,
    pop_3_mile: result.demographics.pop_3_mile,
    pop_5_mile: result.demographics.pop_5_mile,
    pop_10min_drive: result.demographics.pop_10min_drive,
    employees_3_mile: result.demographics.employees_3_mile,
    median_age_3_mile: result.demographics.median_age_3_mile,
  });

  // Add debug info to raw_response so we can see it in browser console
  (result.raw_response as Record<string, unknown>).debug = {
    ringBufferDemoFeatureSetCount: (ringBufferDemoResult.raw as { results?: Array<{ value?: { FeatureSet?: unknown[] } }> })?.results?.[0]?.value?.FeatureSet?.length ?? 0,
    tapestryFeatureSetCount: (tapestryResult?.raw as { results?: Array<{ value?: { FeatureSet?: unknown[] } }> })?.results?.[0]?.value?.FeatureSet?.length ?? 0,
    driveTimeFeatureSetCount: (driveTimeResult?.raw as { results?: Array<{ value?: { FeatureSet?: unknown[] } }> })?.results?.[0]?.value?.FeatureSet?.length ?? 0,
    parsedDemographics: result.demographics,
  };

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

    // Call ESRI GeoEnrichment API (with optional custom radii/drive times)
    const enrichmentResult = await enrichLocation(
      apiKey,
      request.latitude,
      request.longitude,
      request.custom_radii,
      request.custom_drive_times
    );

    return new Response(
      JSON.stringify({
        success: true,
        property_id: request.property_id,
        radii: request.custom_radii || [1, 3, 5],
        drive_times: request.custom_drive_times || [10],
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
