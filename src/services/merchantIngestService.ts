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
// Each brand ingest fires at most 3 pages = 6¢. Typical brand hits 1-2 pages.
const AVG_PAGES_PER_BRAND = 2;
export const COST_PER_REQUEST_CENTS = 2;

export function estimateIngestCostCents(brandCount: number): number {
  return brandCount * AVG_PAGES_PER_BRAND * COST_PER_REQUEST_CENTS;
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
 * Run a text search for one brand and upsert results into merchant_location.
 *
 * The result object reflects new/updated counts, status changes, and an
 * estimated cost based on how many pages were fetched.
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

    // Admin can override the search text per-brand; default includes the
    // state for geographic scoping. Status filter 'all' includes OPERATIONAL,
    // CLOSED_TEMPORARILY, and CLOSED_PERMANENTLY — we want closures too so
    // closure alerts can be raised on status changes.
    const query = brand.places_search_query?.trim() || `${brand.name} in Georgia`;
    const places = await googlePlacesSearchService.textSearch(query, 'all');
    result.locationsFound = places.length;

    // Brandfetch's places service returns up to 60 results across 3 pages.
    // Estimate cost based on pages actually fetched.
    const pagesUsed = Math.min(3, Math.ceil(places.length / 20)) || 1;
    result.costCents = pagesUsed * COST_PER_REQUEST_CENTS;

    // Places' textSearch sometimes returns out-of-state results. Filter to GA.
    const gaPlaces = places.filter((p) => {
      const addr = p.formatted_address ?? '';
      return addr.includes(', GA') || /\bGeorgia\b/.test(addr);
    });

    for (const place of gaPlaces) {
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
