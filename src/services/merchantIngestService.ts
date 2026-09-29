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
import { GeoBounds, MerchantRegion, NamedBounds, subdivide } from './merchantRegions';
// The guards live in ONE place; ingest, map render and site research all import them.
import {
  isAncillarySubListing, nameMatchesBrand,
} from '../../supabase/functions/_shared/merchant-brand-guards';

// Re-exported so existing importers of this module keep working.
export { isAncillarySubListing, nameMatchesBrand };

export interface MerchantBrandRow {
  id: string;
  name: string;
  places_search_query: string | null;
  places_type_filter: string | null;
  /** Optional override for the ingest-time name check. See nameMatchesBrand. */
  places_display_name?: string | null;
  /** Comma-separated ancillary tokens (in addition to defaults) that mark a
   *  Places result as a sub-listing to filter out. See isAncillarySubListing. */
  places_name_exclude?: string | null;
}

export interface IngestBrandResult {
  brandId: string;
  brandName: string;
  /** Which MerchantRegion this run covered. */
  regionId: string;
  locationsFound: number;
  newLocations: number;
  updatedLocations: number;
  statusChanges: number;
  error: string | null;
  costCents: number;
  /** Places calls actually made for this brand. */
  requests: number;
  /**
   * True if the search stopped on region.maxRequestsPerBrand rather than on
   * exhausting the partition — coverage for this brand may be incomplete.
   */
  truncated: boolean;
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
  /** Brands that hit the per-brand call ceiling. */
  totalTruncated: number;
  cancelled: boolean;
  finished: boolean;
  /** True if the run stopped because it reached the run budget. */
  budgetExhausted: boolean;
}

export interface CancelToken {
  cancelled: boolean;
}

// Cost model: Places Text Search is 2¢/request (per google_places_api_log).
//
// The old flat "2 requests per brand" estimate undershot Georgia's actual
// full run by 8× ($16 predicted, $124.58 spent) because it ignored the
// Phase 2/3 partition entirely — and almost every chain trips it under the
// new API's 20-result cap. The multiplier now comes from the region, where
// it can be calibrated against a real run. See MerchantRegion.costBasis.
export const COST_PER_REQUEST_CENTS = 2;

/**
 * Place.searchByText returns at most 20 results per call. Coming back with
 * exactly this many means "there are probably more" and triggers the next
 * partition phase.
 */
const PLACES_RESULT_CAP = 20;

export function estimateIngestCostCents(
  brandCount: number,
  region: MerchantRegion,
): number {
  return Math.round(brandCount * region.avgRequestsPerBrand * COST_PER_REQUEST_CENTS);
}

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
  restriction?: GeoBounds,
): Promise<PlacesSearchResult[]> {
  const Place = await ensurePlaceClass();

  const request: Parameters<NewPlaceClass['searchByText']>[0] = {
    textQuery: query,
    fields: PLACE_FIELDS,
    maxResultCount: PLACES_RESULT_CAP,
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
 * Run Places Text Search for one brand within one region and upsert the
 * results into merchant_location.
 *
 * Three-phase search, because Place.searchByText caps at 20 results per call:
 *   1. One search over the whole region (region.bounds).
 *   2. If Phase 1 came back at the cap (→ more exist), re-run over each of
 *      region.subAreas, unioned by place_id.
 *   3. For any sub-area that ALSO capped, subdivide it region.phase3Grid ×
 *      region.phase3Grid and search each cell.
 *
 * Every surviving place is then put through region.accept(). locationRestriction
 * is only ever a rectangle, and no region is actually a rectangle, so that
 * predicate — not the bbox — is what keeps out-of-region rows out of the cache.
 */
export async function ingestBrand(
  brand: MerchantBrandRow,
  region: MerchantRegion,
): Promise<IngestBrandResult> {
  const result: IngestBrandResult = {
    brandId: brand.id,
    brandName: brand.name,
    regionId: region.id,
    locationsFound: 0,
    newLocations: 0,
    updatedLocations: 0,
    statusChanges: 0,
    error: null,
    costCents: 0,
    requests: 0,
    truncated: false,
  };

  try {
    await initMerchantIngestService();

    const brandQuery = brand.places_search_query?.trim() || brand.name;

    const byId = new Map<string, PlacesSearchResult>();

    // Every Places call for this brand goes through here, so the per-brand
    // ceiling is enforced in exactly one place. Returns null once the budget
    // is spent, which unwinds the traversal without another request.
    const search = async (bounds: GeoBounds): Promise<PlacesSearchResult[] | null> => {
      if (result.requests >= region.maxRequestsPerBrand) {
        result.truncated = true;
        return null;
      }
      const found = await searchPlaces(brandQuery, bounds);
      result.requests++;
      result.costCents += COST_PER_REQUEST_CENTS;
      for (const p of found) byId.set(p.place_id, p);
      return found;
    };

    // --- Phase 1: one search across the whole region ---
    const regionResults = await search(region.bounds);

    // --- Partition, only if Phase 1 saturated (→ more locations exist) ---
    if (regionResults && regionResults.length >= PLACES_RESULT_CAP) {
      const strategy = region.strategy;

      if (strategy.kind === 'named') {
        // Curated sub-areas, each subdivided once if it also saturates.
        for (const subArea of strategy.subAreas) {
          const subResults = await search(subArea);
          if (!subResults) break;
          if (subResults.length >= PLACES_RESULT_CAP) {
            for (const cell of subdivide(subArea, strategy.phase3Grid, subArea.name)) {
              if (!(await search(cell))) break;
            }
          }
        }
      } else {
        // Quadtree: recurse only into children that saturate. A brand that
        // merely matched 20 loose results region-wide pays for one split and
        // stops, instead of every cell of a fixed grid.
        const descend = async (bounds: NamedBounds, depth: number): Promise<void> => {
          if (depth >= strategy.maxDepth) return;
          for (const cell of subdivide(bounds, strategy.split, bounds.name)) {
            const cellResults = await search(cell);
            if (!cellResults) return;
            if (cellResults.length >= PLACES_RESULT_CAP) {
              await descend(cell, depth + 1);
            }
          }
        };
        await descend({ ...region.bounds, name: region.id }, 0);
      }
    }

    // Final dedup'd list: inside the region, name-matched against the brand,
    // and free of ancillary sub-listings.
    //   - region.accept: the true geographic boundary (state code for GA, a
    //     50-mile radius for Columbia). The search bbox is always looser.
    //   - Name-match: rejects Google's over-eager semantic matches (Anytime
    //     Fitness returned for a 24 Hour Fitness search). See nameMatchesBrand.
    //   - Ancillary filter: rejects sub-services at the same storefront
    //     (Kroger Pharmacy, Wells Fargo ATM, Lowe's Garden Center). See
    //     isAncillarySubListing.
    const allPlaces = Array.from(byId.values()).filter((p) => {
      if (!region.accept(p)) return false;
      if (!nameMatchesBrand(p.name, brand)) return false;
      if (isAncillarySubListing(p.name, brand)) return false;
      return true;
    });
    result.locationsFound = allPlaces.length;

    for (const place of allPlaces) {
      await upsertMerchantLocation(brand.id, place, result);
    }

    await recordRegionIngest(brand.id, region.id, allPlaces.length, result.truncated);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }

  return result;
}

/**
 * Mark this brand as ingested for this region.
 *
 * merchant_brand.last_ingested_at is region-blind, so once a second region
 * existed it stopped being usable as a "have we done this brand?" signal —
 * a Columbia run would otherwise make the next Georgia run skip all 401
 * brands. Per-region truth lives in merchant_brand_region_ingest; the
 * brand-level column is still bumped because the Brands tab reads it as a
 * plain "last touched by any ingest" timestamp.
 */
async function recordRegionIngest(
  brandId: string,
  regionId: string,
  locationsFound: number,
  truncated: boolean,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase.from('merchant_brand_region_ingest').upsert(
    {
      brand_id: brandId,
      region_id: regionId,
      last_ingested_at: now,
      locations_found: locationsFound,
      // Skip-recent must never skip a truncated brand — otherwise the run
      // that would fill the gap is the one that passes over it.
      truncated,
    },
    { onConflict: 'brand_id,region_id' },
  );
  if (error) throw error;

  await supabase
    .from('merchant_brand')
    .update({ last_ingested_at: now, last_verified_at: now })
    .eq('id', brandId);
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
/**
 * Ingest a list of brands into one region.
 *
 * `budgetCents` is a hard ceiling on the whole run. Per-brand ceilings
 * (region.maxRequestsPerBrand) bound the tail; this bounds the total, which
 * is the number anyone actually cares about. The run stops cleanly between
 * brands — a brand is never left half-ingested — and reports
 * budgetExhausted so the operator knows the sweep is incomplete rather than
 * finished. Pass Infinity to disable.
 */
export async function ingestBrands(
  brands: MerchantBrandRow[],
  region: MerchantRegion,
  budgetCents: number,
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
    totalTruncated: 0,
    cancelled: false,
    finished: false,
    budgetExhausted: false,
  };
  onProgress(progress);

  for (let i = 0; i < brands.length; i++) {
    if (cancelToken.cancelled) {
      progress.cancelled = true;
      progress.finished = true;
      onProgress(progress);
      return progress;
    }

    // Checked before starting a brand, not mid-brand, so no brand is left
    // with partial coverage silently recorded as a completed ingest.
    if (progress.totalCostCents >= budgetCents) {
      progress.budgetExhausted = true;
      progress.finished = true;
      onProgress(progress);
      return progress;
    }

    const brand = brands[i];
    progress.currentIndex = i + 1;
    progress.currentBrandName = brand.name;
    onProgress(progress);

    const result = await ingestBrand(brand, region);
    progress.results.push(result);
    progress.totalNewLocations += result.newLocations;
    progress.totalUpdatedLocations += result.updatedLocations;
    progress.totalStatusChanges += result.statusChanges;
    progress.totalCostCents += result.costCents;
    if (result.truncated) progress.totalTruncated++;
    onProgress(progress);
  }

  progress.finished = true;
  onProgress(progress);
  return progress;
}
