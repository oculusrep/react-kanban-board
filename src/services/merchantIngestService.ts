/**
 * Merchant Places Ingestion Service
 *
 * Wraps googlePlacesSearchService to populate the merchant_location table
 * from Google Places Text Search results. Called from the admin UI.
 *
 * Spec: docs/MERCHANTS_LAYER_SPEC.md §4
 */

import { Loader } from '@googlemaps/js-api-loader';
import { supabase } from '../lib/supabaseClient';
import { PlacesSearchResult } from './googlePlacesSearchService';

export interface MerchantBrandRow {
  id: string;
  name: string;
  places_search_query: string | null;
  places_type_filter: string | null;
}

export interface IngestBrandResult {
  brandId: string;
  brandName: string;
  locationsFound: number;
  newLocations: number;
  updatedLocations: number;
  statusChanges: number;
  error: string | null;
  costCents: number;
}

export interface IngestAllProgress {
  currentIndex: number;
  total: number;
  currentBrandName: string;
  results: IngestBrandResult[];
  totalNewLocations: number;
  totalUpdatedLocations: number;
  totalStatusChanges: number;
  totalCostCents: number;
  cancelled: boolean;
  finished: boolean;
}

export interface CancelToken {
  cancelled: boolean;
}

// Cost model: Places Text Search is 2¢/request (per google_places_api_log).
// A statewide search fires up to 3 pages (6¢). A brand that hits the 60-cap
// also runs per-metro searches (6 metros × up to 3 pages = 18 more requests)
// but in practice metros return 1-2 pages each. Budget at ~4¢ average (mix
// of sub-cap and at-cap brands).
const AVG_REQUESTS_PER_BRAND = 2;
export const COST_PER_REQUEST_CENTS = 2;

export function estimateIngestCostCents(brandCount: number): number {
  return brandCount * AVG_REQUESTS_PER_BRAND * COST_PER_REQUEST_CENTS;
}

// ---------- Geographic bounds for multi-phase search ----------

/**
 * GA metro bounding boxes. Used when a statewide textSearch hits the 60-
 * result cap — we re-run the search per metro to capture additional
 * locations. Bounds are generous (metro + inner suburbs + outer ring) so
 * density is well covered; post-filter by bbox keeps noise out.
 *
 * These are approximate — they're for locationBias, not strict restriction.
 */
interface MetroBounds {
  name: string;
  north: number;
  south: number;
  east: number;
  west: number;
}

// Georgia state bounding box — used as Phase 1 locationRestriction so
// Places can only return in-state results.
const GA_STATE_BOUNDS: MetroBounds = {
  name: 'Georgia',
  north: 35.01,
  south: 30.35,
  east: -80.75,
  west: -85.61,
};

const GA_METROS: MetroBounds[] = [
  { name: 'Atlanta',  north: 34.35, south: 33.25, east: -83.80, west: -85.05 },
  { name: 'Savannah', north: 32.30, south: 31.80, east: -80.95, west: -81.50 },
  { name: 'Augusta',  north: 33.75, south: 33.15, east: -81.70, west: -82.40 },
  { name: 'Columbus', north: 32.80, south: 32.30, east: -84.55, west: -85.20 },
  { name: 'Macon',    north: 33.05, south: 32.45, east: -83.35, west: -83.90 },
  { name: 'Athens',   north: 34.15, south: 33.70, east: -83.15, west: -83.60 },
];

// ---------- New Places API (Place.searchByText) ----------

/**
 * Wraps google.maps.places.Place.searchByText (the 2025 Places API).
 *
 * Why we use the new API instead of PlacesService.textSearch:
 *   - The legacy PlacesService.textSearch has a pagination bug (returns
 *     20 instead of 60) AND started returning INVALID_REQUEST under some
 *     conditions post-March-2025. Google has stated they won't fix it.
 *   - Place.searchByText is Promise-based, has strict locationRestriction
 *     (not just locationBias), and cleanly maps to our PlacesSearchResult.
 *
 * Trade-off: Place.searchByText caps at 20 results per call (vs legacy's
 * 60). We rely more on metro + grid partitioning for dense brands.
 */

type NewPlaceClass = {
  searchByText(request: {
    textQuery: string;
    fields: string[];
    maxResultCount?: number;
    locationRestriction?: { west: number; east: number; north: number; south: number };
    locationBias?: unknown;
    includedType?: string;
    region?: string;
  }): Promise<{
    places: Array<{
      id: string;
      displayName?: string;
      formattedAddress?: string;
      location?: { lat(): number; lng(): number };
      businessStatus?: string;
      nationalPhoneNumber?: string;
      websiteURI?: string;
      types?: string[];
    }>;
  }>;
};

let placeClass: NewPlaceClass | null = null;

async function ensurePlaceClass(): Promise<NewPlaceClass> {
  if (placeClass) return placeClass;
  await ensureGoogleMapsLoaded();
  const lib = (await google.maps.importLibrary('places')) as { Place: NewPlaceClass };
  placeClass = lib.Place;
  return placeClass;
}

const PLACE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'businessStatus',
  'nationalPhoneNumber',
  'websiteURI',
  'types',
];

async function searchPlaces(
  query: string,
  restriction?: MetroBounds,
): Promise<PlacesSearchResult[]> {
  const Place = await ensurePlaceClass();

  const request: Parameters<NewPlaceClass['searchByText']>[0] = {
    textQuery: query,
    fields: PLACE_FIELDS,
    maxResultCount: 20,
    region: 'us',
  };
  if (restriction) {
    request.locationRestriction = {
      north: restriction.north,
      south: restriction.south,
      east: restriction.east,
      west: restriction.west,
    };
  }

  let places: Awaited<ReturnType<NewPlaceClass['searchByText']>>['places'];
  try {
    const result = await Place.searchByText(request);
    places = result.places ?? [];
  } catch (e) {
    throw new Error(
      `Place.searchByText failed for "${query}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  await logPlaceSearch(places.length);

  const out: PlacesSearchResult[] = [];
  for (const p of places) {
    if (!p.id || !p.location) continue;
    out.push({
      place_id: p.id,
      name: p.displayName ?? '',
      formatted_address: p.formattedAddress ?? '',
      latitude: p.location.lat(),
      longitude: p.location.lng(),
      business_status:
        (p.businessStatus as PlacesSearchResult['business_status']) ?? 'OPERATIONAL',
      types: p.types ?? [],
      phone_number: p.nationalPhoneNumber,
      website: p.websiteURI,
    });
  }
  return dedupByPlaceId(out);
}

function dedupByPlaceId(results: PlacesSearchResult[]): PlacesSearchResult[] {
  const seen = new Set<string>();
  const out: PlacesSearchResult[] = [];
  for (const r of results) {
    if (seen.has(r.place_id)) continue;
    seen.add(r.place_id);
    out.push(r);
  }
  return out;
}

async function logPlaceSearch(resultsCount: number): Promise<void> {
  await supabase.from('google_places_api_log').insert({
    request_type: 'place_search_by_text',
    api_endpoint: 'Place.searchByText',
    request_count: 1,
    estimated_cost_cents: COST_PER_REQUEST_CENTS,
    results_count: resultsCount,
    response_status: 'OK',
  });
}

// ---------- SDK + service initialization ----------

let mapsLoadPromise: Promise<void> | null = null;

async function ensureGoogleMapsLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.places) {
    return;
  }
  if (mapsLoadPromise) return mapsLoadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error(
      'VITE_GOOGLE_MAPS_API_KEY is not set. Places ingestion requires the browser Maps API key.',
    );
  }

  const loader = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['places', 'geometry'],
  });
  mapsLoadPromise = loader.load().then(() => {
    /* google is now on window.google */
  });
  return mapsLoadPromise;
}

export async function initMerchantIngestService(): Promise<void> {
  await ensureGoogleMapsLoaded();
  await ensurePlaceClass();
}

// ---------- Ingestion ----------

/**
 * Run Places Text Search for one brand and upsert results into
 * merchant_location.
 *
 * Two-phase search to get past the 60-result cap Google imposes on
 * textSearch:
 *   1. Statewide: "{brand} in Georgia" (up to 60 results)
 *   2. If Phase 1 returned exactly 60 (cap hit → likely more exist),
 *      re-run per-metro with locationBias bounds, union by place_id.
 *
 * Each returned place is post-filtered to guarantee a GA address (Places
 * textSearch with bounds uses locationBias, not locationRestriction, so
 * results can leak across state lines).
 */
export async function ingestBrand(brand: MerchantBrandRow): Promise<IngestBrandResult> {
  const result: IngestBrandResult = {
    brandId: brand.id,
    brandName: brand.name,
    locationsFound: 0,
    newLocations: 0,
    updatedLocations: 0,
    statusChanges: 0,
    error: null,
    costCents: 0,
  };

  try {
    await initMerchantIngestService();

    const brandQuery = brand.places_search_query?.trim() || brand.name;

    // --- Phase 1: statewide search ---
    // Using Place.searchByText (2025 API) with a GA-wide locationRestriction.
    // Returns up to 20 results per call.
    const statewideResults = await searchPlaces(brandQuery, GA_STATE_BOUNDS);
    result.costCents += COST_PER_REQUEST_CENTS;

    const byId = new Map<string, PlacesSearchResult>();
    for (const p of statewideResults) byId.set(p.place_id, p);

    // --- Phase 2: metro partition, only if Phase 1 hit the 20-cap ---
    const hitCap = statewideResults.length >= 20;
    if (hitCap) {
      for (const metro of GA_METROS) {
        const metroResults = await searchPlaces(brandQuery, metro);
        result.costCents += COST_PER_REQUEST_CENTS;
        for (const p of metroResults) byId.set(p.place_id, p);

        // --- Phase 3: grid, only if this metro ALSO hit cap ---
        if (metroResults.length >= 20) {
          const cells = subdivideMetro(metro, 4); // 4×4 = 16 sub-cells
          for (const cell of cells) {
            const cellResults = await searchPlaces(brandQuery, cell);
            result.costCents += COST_PER_REQUEST_CENTS;
            for (const p of cellResults) byId.set(p.place_id, p);
          }
        }
      }
    }

    // Final dedup'd list, GA-only by address.
    const allPlaces = Array.from(byId.values()).filter((p) => {
      const addr = p.formatted_address ?? '';
      return addr.includes(', GA') || /\bGeorgia\b/.test(addr);
    });
    result.locationsFound = allPlaces.length;

    for (const place of allPlaces) {
      await upsertMerchantLocation(brand.id, place, result);
    }

    await supabase
      .from('merchant_brand')
      .update({
        last_ingested_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', brand.id);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

/** Split a metro's bbox into an N×N grid of smaller bboxes. */
function subdivideMetro(m: MetroBounds, n: number): MetroBounds[] {
  const latStep = (m.north - m.south) / n;
  const lngStep = (m.east - m.west) / n;
  const cells: MetroBounds[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells.push({
        name: `${m.name} ${i},${j}`,
        south: m.south + i * latStep,
        north: m.south + (i + 1) * latStep,
        west: m.west + j * lngStep,
        east: m.west + (j + 1) * lngStep,
      });
    }
  }
  return cells;
}

async function upsertMerchantLocation(
  brandId: string,
  place: PlacesSearchResult,
  result: IngestBrandResult,
): Promise<void> {
  const { data: existing, error: selErr } = await supabase
    .from('merchant_location')
    .select('id, business_status')
    .eq('google_place_id', place.place_id)
    .maybeSingle();
  if (selErr) throw selErr;

  const now = new Date().toISOString();
  const isOperational = place.business_status === 'OPERATIONAL';

  if (existing) {
    const statusChanged = existing.business_status !== place.business_status;
    const updates: Record<string, unknown> = {
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      formatted_address: place.formatted_address,
      phone: place.phone_number ?? null,
      website: place.website ?? null,
      business_status: place.business_status,
      last_fetched_at: now,
    };
    if (isOperational) updates.last_verified_at = now;
    if (statusChanged) {
      updates.previous_status = existing.business_status;
      updates.status_changed_at = now;
      result.statusChanges++;
    }
    const { error: updErr } = await supabase
      .from('merchant_location')
      .update(updates)
      .eq('id', existing.id);
    if (updErr) throw updErr;

    if (statusChanged) {
      await supabase.from('merchant_closure_alert').insert({
        location_id: existing.id,
        previous_status: existing.business_status,
        new_status: place.business_status,
      });
    }
    result.updatedLocations++;
  } else {
    const { error: insErr } = await supabase.from('merchant_location').insert({
      brand_id: brandId,
      google_place_id: place.place_id,
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      formatted_address: place.formatted_address,
      phone: place.phone_number ?? null,
      website: place.website ?? null,
      business_status: place.business_status,
      last_fetched_at: now,
      last_verified_at: now,
    });
    if (insErr) throw insErr;
    result.newLocations++;
  }
}

/**
 * Ingest a batch of brands. Calls onProgress after each brand so the UI can
 * show live progress. cancelToken.cancelled stops the loop cleanly; partial
 * progress stays saved in the DB.
 */
export async function ingestBrands(
  brands: MerchantBrandRow[],
  onProgress: (p: IngestAllProgress) => void,
  cancelToken: CancelToken,
): Promise<IngestAllProgress> {
  const progress: IngestAllProgress = {
    currentIndex: 0,
    total: brands.length,
    currentBrandName: '',
    results: [],
    totalNewLocations: 0,
    totalUpdatedLocations: 0,
    totalStatusChanges: 0,
    totalCostCents: 0,
    cancelled: false,
    finished: false,
  };
  onProgress(progress);

  for (let i = 0; i < brands.length; i++) {
    if (cancelToken.cancelled) {
      progress.cancelled = true;
      progress.finished = true;
      onProgress(progress);
      return progress;
    }

    const brand = brands[i];
    progress.currentIndex = i + 1;
    progress.currentBrandName = brand.name;
    onProgress(progress);

    const result = await ingestBrand(brand);
    progress.results.push(result);
    progress.totalNewLocations += result.newLocations;
    progress.totalUpdatedLocations += result.updatedLocations;
    progress.totalStatusChanges += result.statusChanges;
    progress.totalCostCents += result.costCents;
    onProgress(progress);
  }

  progress.finished = true;
  onProgress(progress);
  return progress;
}
