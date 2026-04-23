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
import {
  googlePlacesSearchService,
  PlacesSearchResult,
} from './googlePlacesSearchService';

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

const GA_METROS: MetroBounds[] = [
  { name: 'Atlanta',  north: 34.35, south: 33.25, east: -83.80, west: -85.05 },
  { name: 'Savannah', north: 32.30, south: 31.80, east: -80.95, west: -81.50 },
  { name: 'Augusta',  north: 33.75, south: 33.15, east: -81.70, west: -82.40 },
  { name: 'Columbus', north: 32.80, south: 32.30, east: -84.55, west: -85.20 },
  { name: 'Macon',    north: 33.05, south: 32.45, east: -83.35, west: -83.90 },
  { name: 'Athens',   north: 34.15, south: 33.70, east: -83.15, west: -83.60 },
];

function googleBoundsFor(m: MetroBounds): google.maps.LatLngBounds {
  return new google.maps.LatLngBounds(
    new google.maps.LatLng(m.south, m.west),
    new google.maps.LatLng(m.north, m.east),
  );
}

function inBbox(lat: number, lng: number, m: MetroBounds): boolean {
  return lat >= m.south && lat <= m.north && lng >= m.west && lng <= m.east;
}

// ---------- Pagination-correct textSearch ----------

/**
 * The shared googlePlacesSearchService.textSearch has a latent pagination
 * bug: it resolves its Promise on page 1, so pages 2 and 3 are discarded
 * by the time the callback fires for them. That limits every text search
 * to 20 results (one page) instead of Google's 60-cap.
 *
 * We bypass that here by calling PlacesService.textSearch directly with
 * a single Promise that doesn't resolve until pagination completes.
 * Also writes one google_places_api_log row per page so cost tracking
 * stays consistent with the shared infra.
 */
async function textSearchFullPagination(
  query: string,
  bounds?: google.maps.LatLngBounds,
): Promise<PlacesSearchResult[]> {
  await initMerchantIngestService();

  // Use a detached div to back the PlacesService. This is safe to do per
  // call; PlacesService instances are lightweight and Google doesn't bill
  // by instance.
  const service = new google.maps.places.PlacesService(document.createElement('div'));

  const rawResults: google.maps.places.PlaceResult[] = [];
  let pageCount = 0;

  await new Promise<void>((resolve, reject) => {
    const request: google.maps.places.TextSearchRequest = { query };
    if (bounds) request.bounds = bounds;

    service.textSearch(request, function handle(results, status, pagination) {
      if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve();
        return;
      }
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
        reject(new Error(`Places textSearch error: ${status}`));
        return;
      }

      pageCount++;
      rawResults.push(...results);

      if (pagination?.hasNextPage && pageCount < 3) {
        // Google requires a short delay before calling nextPage — their
        // example uses ~2s. This invokes the same callback with the next
        // page's results; resolve() fires when pagination is exhausted.
        setTimeout(() => pagination.nextPage(), 2100);
      } else {
        resolve();
      }
    });
  });

  // Log each page as one API request, matching the shared log conventions.
  await logTextSearchPages(pageCount, rawResults.length);

  // Convert Places API results to our internal type.
  const out: PlacesSearchResult[] = [];
  for (const p of rawResults) {
    if (!p.place_id || !p.geometry?.location) continue;
    out.push({
      place_id: p.place_id,
      name: p.name ?? '',
      formatted_address: p.formatted_address ?? '',
      latitude: p.geometry.location.lat(),
      longitude: p.geometry.location.lng(),
      business_status:
        (p.business_status as PlacesSearchResult['business_status']) ?? 'OPERATIONAL',
      types: p.types ?? [],
      rating: p.rating,
      user_ratings_total: p.user_ratings_total,
      phone_number: p.formatted_phone_number,
      website: p.website,
      raw_data: p,
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

async function logTextSearchPages(pageCount: number, resultsCount: number): Promise<void> {
  if (pageCount === 0) return;
  await supabase.from('google_places_api_log').insert({
    request_type: 'text_search',
    api_endpoint: 'textSearch',
    request_count: pageCount,
    estimated_cost_cents: pageCount * COST_PER_REQUEST_CENTS,
    results_count: resultsCount,
    response_status: 'OK',
  });
}

// ---------- SDK + service initialization ----------

let mapsLoadPromise: Promise<void> | null = null;
let placesInitialized = false;

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
  if (!placesInitialized) {
    const offscreen = document.createElement('div');
    googlePlacesSearchService.initPlacesService(offscreen);
    placesInitialized = true;
  }
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
    const statewideResults = await textSearchFullPagination(`${brandQuery} in Georgia`);
    const statewidePages = Math.min(3, Math.ceil(statewideResults.length / 20)) || 1;
    result.costCents += statewidePages * COST_PER_REQUEST_CENTS;

    // Map by place_id for dedup across phases
    const byId = new Map<string, PlacesSearchResult>();
    for (const p of statewideResults) byId.set(p.place_id, p);

    // --- Phase 2: metro partition, only if Phase 1 hit the cap ---
    // Google's cap is 60 (3 pages × 20). If we got 60 back, there are
    // probably more; re-run per metro with location bias to discover them.
    const hitCap = statewideResults.length >= 60;
    if (hitCap) {
      for (const metro of GA_METROS) {
        const bounds = googleBoundsFor(metro);
        const metroResults = await textSearchFullPagination(brandQuery, bounds);
        const metroPages = Math.min(3, Math.ceil(metroResults.length / 20)) || 1;
        result.costCents += metroPages * COST_PER_REQUEST_CENTS;

        // Post-filter: with locationBias (not locationRestriction) Places may
        // return nearby out-of-metro / out-of-state results. Keep only those
        // whose coords fall inside the metro bbox. Union into main bag.
        for (const p of metroResults) {
          if (inBbox(p.latitude, p.longitude, metro)) {
            byId.set(p.place_id, p);
          }
        }

        // --- Phase 3: grid nearbySearch, only if this metro ALSO hit cap ---
        // Triggers for super-dense metro+brand combinations (e.g., Starbucks
        // in Atlanta has 300+ stores). 15km cells across metro Atlanta =
        // ~40 grid cells. Each is one nearbySearch request.
        if (metroResults.length >= 60) {
          const gridResults = await googlePlacesSearchService.nearbySearchWithGrid(
            brandQuery,
            bounds,
            15000, // 15km grid cells — small enough that cells rarely cap
            'all',
          );
          const gridCellCount = Math.max(1, Math.ceil(gridResults.length / 20));
          // Best-effort cost estimate — the service logs its own actual cost,
          // but we want the UI to show a progress-time figure.
          result.costCents += gridCellCount * COST_PER_REQUEST_CENTS;
          for (const p of gridResults) {
            if (inBbox(p.latitude, p.longitude, metro)) {
              byId.set(p.place_id, p);
            }
          }
        }
      }
    }

    // Final dedup'd list, GA-only by address (belt-and-suspenders vs bbox).
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
