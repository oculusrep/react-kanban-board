import { supabase } from './supabaseClient';
import { geocodingService } from '../services/geocodingService';

// NNN listing intake — rows written by the ovis-mcp `upsert_listing` tool.
// See docs/NNN_LISTING_INTAKE.md.

export type ListingStatus = 'pending_review' | 'reviewed' | 'promoted' | 'rejected' | 'sold';

export const LISTING_STATUSES: { value: ListingStatus; label: string }[] = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'sold', label: 'Sold' },
];

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = Object.fromEntries(
  LISTING_STATUSES.map((s) => [s.value, s.label]),
) as Record<ListingStatus, string>;

export interface ListingStaging {
  id: string;
  tenant: string | null;
  guarantor_type: string | null;
  address: string;
  address_norm: string;
  city: string | null;
  state: string;
  price: number | null;
  cap_rate: number | null; // percent, 6.25 = 6.25%
  lease_type: string | null;
  term_left: string | null;
  source: string | null;
  source_url: string | null;
  first_seen: string;
  last_seen: string;
  status: ListingStatus;
  lat: number | null;
  lng: number | null;
  geocode_status: 'ok' | 'failed' | null;
  notes: string | null;
  comp_property_id: string | null;
  va_task_id: string | null;
  created_by_id: string | null;
  updated_at: string;
}

export async function fetchListings(): Promise<ListingStaging[]> {
  const PAGE_SIZE = 1000;
  const all: ListingStaging[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('listing_staging')
      .select('*')
      .order('first_seen', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as ListingStaging[]));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchListing(id: string): Promise<ListingStaging | null> {
  const { data, error } = await supabase.from('listing_staging').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ListingStaging | null;
}

export async function updateListing(
  id: string,
  patch: Partial<Pick<ListingStaging, 'status' | 'notes' | 'guarantor_type' | 'lat' | 'lng' | 'geocode_status'>>,
): Promise<void> {
  const { error } = await supabase.from('listing_staging').update(patch).eq('id', id);
  if (error) throw error;
}

/** Creates comp_property + lease_comp + comp_availability and links back. Idempotent. */
export async function promoteListingToComp(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('promote_listing_to_comp', { p_listing_id: id });
  if (error) throw error;
  return data as string;
}

/**
 * Retry placement with the browser geocoder (Google, OSM fallback) for a listing the
 * server-side geocoder couldn't place. Only address-level Google precision is accepted;
 * a street centroid would put the pin somewhere plausible but wrong.
 */
export async function regeocodeListing(l: ListingStaging): Promise<{ ok: boolean; message: string }> {
  const r = await geocodingService.geocodeAddress(`${l.address}, ${l.city ?? ''}, ${l.state}`);
  if ('error' in r) {
    await updateListing(l.id, { geocode_status: 'failed' });
    return { ok: false, message: r.error };
  }
  if (r.location_type && r.location_type !== 'ROOFTOP' && r.location_type !== 'RANGE_INTERPOLATED') {
    return { ok: false, message: `Only an approximate match (${r.location_type}); not placed` };
  }
  await updateListing(l.id, { lat: r.latitude, lng: r.longitude, geocode_status: 'ok' });
  return { ok: true, message: r.formatted_address };
}

export const fmtPrice = (n: number | null) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
export const fmtCap = (n: number | null) => (n == null ? '—' : `${Number(n).toFixed(2)}%`);

/** Eastern-time date for a timestamptz. */
export const fmtDateET = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
