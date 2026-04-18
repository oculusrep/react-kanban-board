# ESRI GeoEnrichment Integration

## Overview

OVIS integrates with ESRI's GeoEnrichment API to enrich property records with demographic and psychographic data. This provides valuable market analysis information for site submits.

## Current Status

**Status:** Complete and Working ✓

The integration is complete and tested. All three API calls (ring buffers, Tapestry, drive time) are working correctly.

## What Was Built

### 1. Database Schema

**Migration files:**
- `supabase/migrations/20260320_esri_geoenrichment.sql` - Original columns
- `supabase/migrations/20260320_esri_geoenrichment_v2.sql` - Added employees, median age, 10-min drive time
- `supabase/migrations/20260320_esri_geoenrichment_v3.sql` - Added daytime population (DPOP_CY)
- `supabase/migrations/20260320_esri_geoenrichment_v4.sql` - Added enriched coordinates tracking

**New columns on `property` table:**

| Column | Type | Description |
|--------|------|-------------|
| `esri_enriched_at` | TIMESTAMPTZ | When property was last enriched |
| `esri_enrichment_data` | JSONB | Full raw API response for debugging |
| `tapestry_segment_code` | TEXT | Tapestry segment code (e.g., "1A") |
| `tapestry_segment_name` | TEXT | Tapestry segment name (e.g., "Top Tier") |
| `tapestry_segment_description` | TEXT | Full description of segment |
| `tapestry_lifemodes` | TEXT | LifeMode category (e.g., "Affluent Estates") |
| `pop_1_mile` | INTEGER | Population within 1 mile |
| `pop_3_mile` | INTEGER | Population within 3 miles |
| `pop_5_mile` | INTEGER | Population within 5 miles |
| `pop_10min_drive` | INTEGER | Population within 10-min drive time |
| `households_1_mile` | INTEGER | Households within 1 mile |
| `households_3_mile` | INTEGER | Households within 3 miles |
| `households_5_mile` | INTEGER | Households within 5 miles |
| `households_10min_drive` | INTEGER | Households within 10-min drive time |
| `hh_income_median_1_mile` | NUMERIC | Median household income (1 mi) |
| `hh_income_median_3_mile` | NUMERIC | Median household income (3 mi) |
| `hh_income_median_5_mile` | NUMERIC | Median household income (5 mi) |
| `hh_income_median_10min_drive` | NUMERIC | Median household income (10-min drive) |
| `hh_income_avg_1_mile` | NUMERIC | Average household income (1 mi) |
| `hh_income_avg_3_mile` | NUMERIC | Average household income (3 mi) |
| `hh_income_avg_5_mile` | NUMERIC | Average household income (5 mi) |
| `hh_income_avg_10min_drive` | NUMERIC | Average household income (10-min drive) |
| `employees_1_mile` | INTEGER | Daytime workers only (1 mi) - DPOPWRK_CY |
| `employees_3_mile` | INTEGER | Daytime workers only (3 mi) - DPOPWRK_CY |
| `employees_5_mile` | INTEGER | Daytime workers only (5 mi) - DPOPWRK_CY |
| `employees_10min_drive` | INTEGER | Daytime workers only (10-min drive) - DPOPWRK_CY |
| `daytime_pop_1_mile` | INTEGER | Total daytime population (1 mi) - DPOP_CY |
| `daytime_pop_3_mile` | INTEGER | Total daytime population (3 mi) - DPOP_CY |
| `daytime_pop_5_mile` | INTEGER | Total daytime population (5 mi) - DPOP_CY |
| `daytime_pop_10min_drive` | INTEGER | Total daytime population (10-min drive) - DPOP_CY |
| `median_age_1_mile` | NUMERIC | Median age (1 mi) |
| `median_age_3_mile` | NUMERIC | Median age (3 mi) |
| `median_age_5_mile` | NUMERIC | Median age (5 mi) |
| `median_age_10min_drive` | NUMERIC | Median age (10-min drive) |
| `esri_enriched_latitude` | NUMERIC | Latitude used when property was last enriched |
| `esri_enriched_longitude` | NUMERIC | Longitude used when property was last enriched |

**Note on Coordinate Tracking:**
- `esri_enriched_latitude` and `esri_enriched_longitude` store the coordinates that were used when the property was last enriched
- When creating a site submit, if the current property coordinates differ from the enriched coordinates by more than ~50 meters, the user is prompted to re-enrich
- This ensures demographics remain accurate when a property is re-geocoded

**Note on Daytime Population vs Employees:**
- `employees_*` (DPOPWRK_CY) = Workers only - people who work in the area, including commuters
- `daytime_pop_*` (DPOP_CY) = Total daytime population = workers + residents at home (retirees, stay-at-home parents, unemployed, students, children)
- **For retail site selection, `daytime_pop_*` is more useful** as it captures everyone present during business hours

### 2. Edge Function

**File:** `supabase/functions/esri-geoenrich/index.ts`

**Required Supabase Secret:**
- `ESRI_API_KEY` - Your ESRI/ArcGIS API key (see API Key Privileges below)

**Endpoints:**
- POST `/functions/v1/esri-geoenrich`

**Request body:**
```json
{
  "property_id": "uuid",
  "latitude": 33.9535432,
  "longitude": -84.4114461,
  "force_refresh": false,
  "custom_radii": [1, 2, 3],
  "custom_drive_times": [5, 7, 10]
}
```

*Note: `custom_radii` and `custom_drive_times` are optional. When omitted, defaults to `[1, 3, 5]` miles and `[10]` minutes.*

**Response:**
```json
{
  "success": true,
  "property_id": "uuid",
  "tapestry": {
    "code": "1A",
    "name": "Top Tier",
    "description": "Most affluent consumers...",
    "lifemodes": "Affluent Estates"
  },
  "demographics": {
    "pop_1_mile": 6080,
    "pop_3_mile": 45000,
    "pop_5_mile": 120000,
    "pop_10min_drive": 85000,
    "households_1_mile": 2500,
    ...
  },
  "raw_response": { ... }
}
```

### 3. React Hook

**File:** `src/hooks/usePropertyGeoenrichment.ts`

```typescript
const {
  isEnriching,
  enrichError,
  enrichProperty,
  saveEnrichmentToProperty,
  enrichForClient,
  saveClientDemographicsToSiteSubmit,
  clearError
} = usePropertyGeoenrichment();

// Enrich a property (default radii)
const result = await enrichProperty(propertyId, latitude, longitude, forceRefresh);
await saveEnrichmentToProperty(propertyId, result, latitude, longitude);

// Enrich with client-specific radii/drive times
const clientResult = await enrichForClient(propertyId, latitude, longitude, [1, 2, 3], [5, 7, 10]);
await saveClientDemographicsToSiteSubmit(siteSubmitId, clientResult, [1, 2, 3], [5, 7, 10], sidebarRadius);
```

### 4. UI Components

**DemographicsModal (Shared)** (`src/components/shared/DemographicsModal.tsx`)
- Shared modal component used by all demographics views
- Uses React Portal (`createPortal`) to render over entire viewport with z-index 100
- Displays Tapestry Segment card with code, name, lifemode, and description
- **Two display modes:**
  - Fixed columns (property-level): 1 Mile, 3 Mile, 5 Mile, 10-Min Drive
  - Dynamic columns (client-specific): built from `clientDemographics.radii` and `drive_times`
- Shows: Population, Households, Daytime Pop, Employees, Avg HH Income, Median HH Income, Median Age
- "Data as of" timestamp footer
- Used by: SiteSubmitDataTab, PropertyDetailsSlideoutContent, PinDetailsSlideout

**MarketAnalysisSection** (`src/components/property/MarketAnalysisSection.tsx`)
- Displays demographics grid with 4 summary cards
- "View All Demographics" expandable table
- TapestrySegmentCard for psychographic data
- "Enrich with Demographics" / "Re-enrich" button
- Last updated timestamp with stale warning (>1 year)

**SiteSubmitCreateForm** (`src/components/shared/SiteSubmitCreateForm.tsx`)
- Auto-enriches property when site submit is created (if no existing data)
- Prompts user if data is stale (>1 year old)
- Silent fail - enrichment errors don't block site submit creation

**ClientDemographicsSection** (`src/components/clients/ClientDemographicsSection.tsx`)
- Collapsible section on client detail page for configuring custom demographics
- Set custom radii (comma-separated), drive times, and sidebar display radius
- Shows "Custom" badge when client has non-default configuration
- "Reset to Defaults" button to clear custom config

**SiteSubmitDataTab** (`src/components/shared/SiteSubmitDataTab.tsx`)
- Demographics summary in Site Submit sidebar (Property tab)
- Dynamic display: uses `client_demographics` JSONB when available, falls back to property data
- Sidebar radius configurable per client (e.g., show 2-mile instead of 3-mile)
- "Enrich with Client Demographics" / "Re-enrich Client Demographics" button
- "Enrich with Demographics" button when no data exists
- "View All" button to open DemographicsModal
- Uses `verified_latitude ?? latitude` for coordinate priority

**PropertyDetailsSlideoutContent** (`src/components/PropertyDetailsSlideoutContent.tsx`)
- Demographics section in Property Details slideout (Property tab)
- Same functionality as SiteSubmitDataTab
- Uses shared DemographicsModal component

**PinDetailsSlideout** (`src/components/mapping/slideouts/PinDetailsSlideout.tsx`)
- Demographics section in Map Pin Details sidebar
- "Enrich with Demographics" / "Re-enrich" button
- Summary metrics: Tapestry, Population, Households, Daytime Pop, Median HH Income, Avg HH Income, Median Age
- "View All" button opens DemographicsModal
- Uses `verified_latitude ?? latitude` for coordinate priority

## ESRI API Details

### API Endpoint
```
https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich
```

### Authentication
Uses API key authentication via `token` query parameter.

### API Key Privileges (IMPORTANT)

Your ESRI API key must have **both** of these privileges enabled:

| Privilege | Purpose | Location in ESRI Dashboard |
|-----------|---------|---------------------------|
| **GeoEnrichment** | Required for all demographic/Tapestry data | Under "Location services" |
| **Service area** | Required for drive time analysis | Under "Location services" → "Routing" section |

**Common Errors:**
- If you get `403 "User does not have permissions"` on ALL API calls → GeoEnrichment privilege is missing
- If ring buffers work but drive time returns empty `FeatureSet` → Service area privilege is missing

**To enable privileges:**
1. Go to https://developers.arcgis.com/api-keys/
2. Edit your API key
3. Expand "Location services"
4. Enable "GeoEnrichment" checkbox
5. Expand "Routing" section
6. Enable "Service area" checkbox
7. Save the key

Note: "Simple routing" is NOT required - that's for point-to-point directions, not service areas.

### Study Areas

**Ring Buffers:**
```json
{
  "geometry": { "x": longitude, "y": latitude },
  "areaType": "RingBuffer",
  "bufferUnits": "esriMiles",
  "bufferRadii": [1, 3, 5]
}
```

**Drive Time (NetworkServiceArea):**

Drive time requires `NetworkServiceArea` area type with all parameters inside the studyAreas object:

```json
{
  "geometry": { "x": longitude, "y": latitude },
  "areaType": "NetworkServiceArea",
  "bufferUnits": "Minutes",
  "bufferRadii": [10],
  "travelMode": "Driving"
}
```

**Key differences from ring buffers:**
- `areaType`: Must be `"NetworkServiceArea"` (not `"DriveTimeBuffer"`)
- `bufferUnits`: Must be `"Minutes"` (not `"esriDriveTimeUnitsMinutes"`)
- `travelMode`: Use camelCase `"travelMode"` (not snake_case `"travel_mode"`)
- `returnGeometry`: Should be `"true"` in the request params for NetworkServiceArea to work

### Analysis Variables (Current)

**IMPORTANT:** ESRI requires separate API calls for demographics vs Tapestry in US data. Mixing them causes error: "Multi-hierarchy calculations are not supported for country 'US'."

```javascript
// Demographic variables - requested together in one API call
const DEMOGRAPHIC_VARIABLES = [
  'TOTPOP_CY',    // Population - Current Year
  'TOTHH_CY',     // Households - Current Year
  'MEDAGE_CY',    // Median Age - Current Year
  'AVGHINC_CY',   // Average Household Income - Current Year
  'MEDHINC_CY',   // Median Household Income - Current Year
  'DPOPWRK_CY',   // Daytime Population: Workers only
  'DPOP_CY',      // Total Daytime Population (workers + residents at home)
];

// Tapestry variables - MUST be requested separately from demographics
const TAPESTRY_VARIABLES = [
  'TSEGNAME',     // Tapestry Segment Name
  'TSEGCODE',     // Tapestry Segment Code
  'TLIFENAME',    // Tapestry LifeMode Name
];
```

The edge function makes 3 parallel API calls:
1. **Demographics ring buffers** (1, 3, 5 mile) - DEMOGRAPHIC_VARIABLES
2. **Tapestry** (1 mile only) - TAPESTRY_VARIABLES
3. **Drive time** (10 min) - DEMOGRAPHIC_VARIABLES

### API Documentation Reference
- GeoEnrichment API: https://developers.arcgis.com/rest/geoenrichment/api-reference/enrich.htm
- Data Browser: https://doc.arcgis.com/en/esri-demographics/latest/regional-data/data-browser.htm
- US Variables: https://doc.arcgis.com/en/esri-demographics/latest/regional-data/united-states-702.htm

## Known Issues & Debugging

### Issue 1: API Variable Names (RESOLVED)
Initially used wrong variable format (e.g., `KeyUSFacts.TOTPOP` instead of `TOTPOP_CY`). Fixed by using the `_CY` suffix format for current year data.

### Issue 2: Multi-Hierarchy Error (RESOLVED)
**Error:** `Multi-hierarchy calculations are not supported for country 'US'.` (code 10020078)

**Cause:** ESRI does not allow mixing Tapestry variables (TSEGNAME, TSEGCODE, TLIFENAME) with demographic variables (TOTPOP_CY, etc.) in the same API request for US data.

**Solution:** Split into separate API calls:
- Demographics call: TOTPOP_CY, TOTHH_CY, MEDAGE_CY, AVGHINC_CY, MEDHINC_CY, DPOPWRK_CY
- Tapestry call: TSEGNAME, TSEGCODE, TLIFENAME

### Issue 3: Only 1-Mile Data Parsing (RESOLVED)
The response had data for all radii but only 1-mile was being parsed. This was due to incorrect attribute name lookups. Updated to use `_CY` suffix.

### Issue 4: Drive Time Returns Empty FeatureSet (RESOLVED)
**Symptom:** Ring buffers and Tapestry work, but drive time returns `"FeatureSet": []`.

**Cause:** Missing "Service area" privilege on the API key.

**Solution:** Enable "Service area" under Location services → Routing in the ESRI API key settings.

**Also Important:**
- Use `areaType: "NetworkServiceArea"` (not `"DriveTimeBuffer"`)
- Use `bufferUnits: "Minutes"` (not `"esriDriveTimeUnitsMinutes"`)
- Use `travelMode: "Driving"` (camelCase, not snake_case)
- Include `returnGeometry: "true"` in request params

### Issue 5: 403 Permission Error on All API Calls (RESOLVED)
**Error:** `"User does not have permissions to access this resource."` (403)

**Cause:** API key is missing the GeoEnrichment privilege. This happens when creating a new API key and forgetting to enable GeoEnrichment.

**Solution:** Enable "GeoEnrichment" under Location services in the ESRI API key settings. Both GeoEnrichment AND Service area must be enabled for full functionality.

## Cost Estimate

ESRI GeoEnrichment pricing: ~$1 per 1000 attributes

**Current implementation:** 7 demographic variables × 4 areas + 3 Tapestry variables = **31 attributes per property**

**Cost per property:** ~$0.031 (about 3 cents)

**Bulk enrichment (4,228 properties):** ~$131

**Monthly estimate (assuming 60-70 unique properties from 100 site submits):** ~$2.80/month

## Tapestry Segmentation

ESRI's Tapestry system categorizes neighborhoods into 67 distinct segments across 14 LifeMode groups. The edge function includes a lookup table for common segments with descriptions.

Example segments:
- **1A - Top Tier**: Most affluent consumers in exclusive neighborhoods
- **3A - Laptops and Lattes**: Educated singles/couples in trendy urban neighborhoods
- **6A - Green Acres**: Educated, higher-income families in rural areas

## Files Modified

| File | Purpose |
|------|---------|
| `supabase/migrations/20260320_esri_geoenrichment.sql` | Initial schema |
| `supabase/migrations/20260320_esri_geoenrichment_v2.sql` | Extended schema (employees, median age, drive time) |
| `supabase/migrations/20260320_esri_geoenrichment_v3.sql` | Daytime population (DPOP_CY) |
| `supabase/migrations/20260320_esri_geoenrichment_v4.sql` | Enriched coordinates tracking |
| `supabase/migrations/20260320_esri_data_vintage.sql` | Data vintage tracking table |
| `supabase/migrations/20260415_client_demographics_config.sql` | Per-client demographics config + site_submit JSONB |
| `supabase/functions/esri-geoenrich/index.ts` | Main enrichment edge function (supports custom radii/drive times) |
| `supabase/functions/esri-vintage-check/index.ts` | Annual data refresh detection |
| `src/hooks/usePropertyGeoenrichment.ts` | React hook (includes client enrichment functions) |
| `src/components/shared/DemographicsModal.tsx` | Shared demographics modal (supports dynamic columns) |
| `src/components/clients/ClientDemographicsSection.tsx` | Client demographics settings UI |
| `src/components/property/MarketAnalysisSection.tsx` | UI display |
| `src/components/property/TapestrySegmentCard.tsx` | Tapestry card |
| `src/components/shared/SiteSubmitCreateForm.tsx` | Auto-enrich on submit + client-specific enrichment |
| `src/components/shared/SiteSubmitDataTab.tsx` | Site Submit sidebar (dynamic display + re-enrich button) |
| `src/components/PropertyDetailsSlideoutContent.tsx` | Property slideout demographics section |
| `src/components/mapping/slideouts/PinDetailsSlideout.tsx` | Map pin sidebar demographics section |
| `src/utils/siteSubmitEmailTemplate.ts` | Email template (dynamic columns from client demographics) |

## Deployment

To redeploy the edge function after changes:

```bash
npx supabase functions deploy esri-geoenrich --no-verify-jwt
```

To update the ESRI API key secret:

```bash
npx supabase secrets set ESRI_API_KEY=your_new_api_key
```

## Testing Checklist

1. **Test ring buffers** - Verify population, households, income for 1, 3, 5 mile radii
2. **Test Tapestry** - Verify segment code, name, and LifeMode populate
3. **Test drive time** - Verify 10-min drive time demographics populate
4. **Test auto-enrich** - Create a site submit for a property without enrichment data
5. **Test stale data prompt** - Should appear if data is >1 year old
6. **Test client demographics config** - Set custom radii on a client, create a site submit, verify custom columns appear
7. **Test re-enrich button** - Click "Re-enrich Client Demographics" on existing site submit, verify JSONB populates
8. **Test sidebar display** - Set sidebar radius on client (e.g., 2), verify sidebar shows "Population (2 mi)" etc.
9. **Test email template** - Send site submit email, verify dynamic column headers match client config
10. **Test default fallback** - Site submit for client with no custom config should show standard 1/3/5 + 10-min columns

## Manual Testing

To test the ESRI API directly:

```bash
curl "https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/Enrich?f=json&token=YOUR_API_KEY&studyAreas=[{\"geometry\":{\"x\":-84.4114461,\"y\":33.9535432},\"areaType\":\"RingBuffer\",\"bufferUnits\":\"esriMiles\",\"bufferRadii\":[1]}]&analysisVariables=[\"TOTPOP_CY\",\"TOTHH_CY\"]&returnGeometry=false"
```

Replace `YOUR_API_KEY` with the actual ESRI API key.

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| 403 on all API calls | Missing GeoEnrichment privilege | Enable GeoEnrichment in API key settings |
| Empty FeatureSet for drive time | Missing Service area privilege | Enable Service area under Routing in API key settings |
| Multi-hierarchy error (10020078) | Mixing Tapestry + demographics | Use separate API calls (already implemented) |
| Only 1-mile data populates | Wrong variable names | Use `_CY` suffix (e.g., `TOTPOP_CY`) |
| 500 error from edge function | Check Supabase logs | Run `npx supabase functions logs esri-geoenrich` |

## Annual Data Refresh Detection

ESRI updates their demographic data annually, typically in spring (March-April). The system includes automated detection for when new data becomes available.

### How It Works

The `esri-vintage-check` edge function:
1. Calls the ESRI API with a sample location (Atlanta, GA)
2. Compares the population value to the previous check
3. If data has changed significantly, sends an email notification
4. Stores check results in the `esri_data_vintage` table

### Setup

**Required Supabase Secrets:**
```bash
npx supabase secrets set RESEND_API_KEY=your_resend_api_key
npx supabase secrets set ADMIN_EMAIL=your_email@example.com
```

**Deploy the function:**
```bash
npx supabase functions deploy esri-vintage-check --no-verify-jwt
```

### Scheduling

Set up a monthly cron job to call the function. Options:

1. **Supabase pg_cron** (if enabled):
```sql
SELECT cron.schedule(
  'esri-vintage-check',
  '0 9 1 * *', -- 9 AM on the 1st of each month
  $$SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/esri-vintage-check',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  )$$
);
```

2. **External scheduler** (e.g., GitHub Actions, cron job):
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/esri-vintage-check" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Manual Check

To manually check for new data:
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/esri-vintage-check" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

Response:
```json
{
  "success": true,
  "data_vintage": "2026",
  "sample_population": 12345,
  "is_new_data": false,
  "message": "No data changes detected."
}
```

## Per-Client Demographics Configuration

### Overview

Different clients may require different demographic radii and drive times. For example, Starbucks might want 1, 2, 3 mile radii with 5, 7, 10-minute drive times instead of the system defaults (1, 3, 5 miles + 10-min drive). This feature allows per-client configuration of these parameters, with results stored on individual site submit records.

### Database Schema

**Migration:** `supabase/migrations/20260415_client_demographics_config.sql`

**New columns on `client` table:**

| Column | Type | Description |
|--------|------|-------------|
| `demographics_radii` | `numeric[]` | Custom ring buffer radii in miles (e.g., `{1, 2, 3}`). NULL = use defaults `{1, 3, 5}` |
| `demographics_drive_times` | `numeric[]` | Custom drive times in minutes (e.g., `{5, 7, 10}`). NULL = use defaults `{10}` |
| `demographics_sidebar_radius` | `numeric` | Which radius to display in the site submit sidebar summary (e.g., `2`). NULL = default `3` |

**New column on `site_submit` table:**

| Column | Type | Description |
|--------|------|-------------|
| `client_demographics` | `jsonb` | Client-specific enrichment results. Self-describing structure containing radii, drive times, data, and tapestry |

### JSONB Structure (`site_submit.client_demographics`)

```json
{
  "radii": [1, 2, 3],
  "drive_times": [5, 7, 10],
  "sidebar_radius": 2,
  "enriched_at": "2026-04-17T14:30:00.000Z",
  "data": {
    "pop_1_mile": 9013,
    "pop_2_mile": 35000,
    "pop_3_mile": 66585,
    "households_1_mile": 3156,
    "households_2_mile": 14000,
    "households_3_mile": 22578,
    "pop_5min_drive": 25000,
    "pop_7min_drive": 55000,
    "pop_10min_drive": 88845,
    ...
  },
  "tapestry": {
    "code": "1D",
    "name": "Savvy Suburbanites",
    "description": "Well-educated, well-read couples in established suburbs.",
    "lifemodes": "Affluent Estates"
  }
}
```

Key design decisions:
- The JSONB is **self-describing** — it stores `radii` and `drive_times` so display components know which columns to render without looking up the client config
- Dynamic keys follow the pattern `{metric}_{radius}_mile` and `{metric}_{minutes}min_drive`
- Each site submit stores its own demographics, so the same property can have different demographics for different clients

### How It Works

**Configuration (Client Screen):**
1. Open a client record → expand "Demographics Settings" section
2. Set custom Ring Buffer Radii (comma-separated, max 5 values, max 25 miles)
3. Set custom Drive Times (comma-separated, max 3 values, max 60 minutes)
4. Set Sidebar Display Radius (which radius to show in the sidebar summary)
5. Save — settings are stored on the `client` table
6. Leave fields empty to use system defaults

**Enrichment (Site Submit Creation):**
1. User creates a site submit and selects a client
2. After insert, the system fetches the client's demographics config
3. If custom config exists: calls ESRI edge function with custom radii/drive times, saves results to `site_submit.client_demographics`
4. If no custom config: copies property's default demographics into the JSONB for consistent display
5. Property-level enrichment (default radii) continues unchanged in parallel

**Re-enrichment (Existing Site Submits):**
- The site submit sidebar shows an "Enrich with Client Demographics" button (or "Re-enrich Client Demographics" if data already exists)
- Clicking it fetches the client's current config and re-enriches with those parameters

**Display:**
- **Sidebar summary**: Uses `sidebar_radius` to determine which radius to display (e.g., "Population (2 mi)" instead of always "Population (3 mi)")
- **View All modal**: Renders dynamic columns based on the JSONB's `radii` and `drive_times` arrays
- **Email template**: Builds table headers dynamically from the JSONB
- **Fallback**: When `client_demographics` is null (no enrichment yet), all displays fall back to property-level data with default columns

### Edge Function Changes

The `esri-geoenrich` edge function now accepts optional `custom_radii` and `custom_drive_times` parameters:

**Request body (with custom params):**
```json
{
  "property_id": "uuid",
  "latitude": 33.9535432,
  "longitude": -84.4114461,
  "custom_radii": [1, 2, 3],
  "custom_drive_times": [5, 7, 10]
}
```

**Response (includes params used):**
```json
{
  "success": true,
  "property_id": "uuid",
  "radii": [1, 2, 3],
  "drive_times": [5, 7, 10],
  "tapestry": { ... },
  "demographics": {
    "pop_1_mile": 9013,
    "pop_2_mile": 35000,
    "pop_3_mile": 66585,
    "pop_5min_drive": 25000,
    ...
  }
}
```

When `custom_radii` and `custom_drive_times` are omitted, the function uses defaults `[1, 3, 5]` and `[10]` — fully backward compatible.

### Files Added/Modified

| File | Change |
|------|--------|
| `supabase/migrations/20260415_client_demographics_config.sql` | New migration for client config and site_submit JSONB columns |
| `supabase/functions/esri-geoenrich/index.ts` | Accept custom radii/drive times, dynamic parsing |
| `src/components/clients/ClientDemographicsSection.tsx` | **New** — Client settings UI (collapsible section) |
| `src/components/ClientOverviewTab.tsx` | Added ClientDemographicsSection |
| `src/hooks/usePropertyGeoenrichment.ts` | Added `enrichForClient()`, `saveClientDemographicsToSiteSubmit()`, `ClientDemographicsData` interface |
| `src/components/shared/SiteSubmitCreateForm.tsx` | Fetch client config and trigger client-specific enrichment on create |
| `src/components/shared/DemographicsModal.tsx` | Support dynamic columns via `clientDemographics` prop |
| `src/components/shared/SiteSubmitDataTab.tsx` | Dynamic sidebar display, re-enrich button |
| `src/components/shared/SiteSubmitSidebar.tsx` | Added `client_demographics` to interface and query |
| `src/utils/siteSubmitEmailTemplate.ts` | Dynamic column headers/rows from client demographics |
| `src/hooks/useSiteSubmitEmail.ts` | Pass `clientDemographics` to email template |
| `src/components/EmailComposerModal.tsx` | Pass `clientDemographics` through on regeneration |
| `src/components/SiteSubmitFormModal.tsx` | Pass `clientDemographics` to email template |
| `src/pages/SiteSubmitDetailsPage.tsx` | Pass `clientDemographics` to email template |
| `database-schema.ts` | Added new fields to client and site_submit types |

## Future Features

### PDF Reports

ESRI's GeoEnrichment API also supports generating pre-designed PDF reports (infographics, market profiles, traffic counts, etc.) at approximately $1 per report. This could be implemented via a separate `createReport` endpoint:

```
https://geoenrich.arcgis.com/arcgis/rest/services/World/geoenrichmentserver/Geoenrichment/createReport
```

This feature is not currently implemented but could be added as a separate edge function if needed for generating client-ready market analysis documents.
