import { supabase } from './supabaseClient';
import { CompReviewStatus, GuarantorType, ListingStatus } from './compTypes';

// NNN listing intake, phase 1 — offerings (operating_memorandum) and their price/status
// history (comp_listing_event). See docs/NNN_LISTING_INTAKE_SPEC_v2.md §8.

export type ListingEventType =
  | 'listed' | 'price_change' | 'cap_change' | 'under_contract'
  | 'back_on_market' | 'off_market' | 'closed' | 'relisted';

export const EVENT_LABEL: Record<ListingEventType, string> = {
  listed: 'Listed', relisted: 'Relisted', price_change: 'Price change', cap_change: 'Cap change',
  under_contract: 'Under contract', back_on_market: 'Back on market', off_market: 'Off market', closed: 'Closed',
};

export type VerificationMethod = 'pt61' | 'broker_confirm' | 'om_verified';
export const VERIFICATION_OPTIONS: { value: VerificationMethod; label: string }[] = [
  { value: 'pt61', label: 'PT-61' },
  { value: 'broker_confirm', label: 'Broker confirmed' },
  { value: 'om_verified', label: 'OM verified' },
];

/** One row of the comp_listing_facts view (one per offering). */
export interface ListingFacts {
  listing_id: string;
  comp_property_id: string;
  property_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  address_norm: string | null;
  lat: number | null;
  lng: number | null;
  review_status: CompReviewStatus;
  property_created_at: string;
  lease_comp_id: string | null;
  tenant: string | null;
  guarantor_type: GuarantorType | null;
  guarantor_name: string | null;
  listing_status: ListingStatus;
  first_seen_at: string;
  last_seen_at: string;
  list_date: string | null;
  original_ask: number | null;
  original_cap: number | null;
  current_ask: number | null;
  current_cap: number | null;
  total_reduction_pct: number | null;
  price_change_count: number;
  closed_price: number | null;
  closed_cap: number | null;
  close_date: string | null;
  days_on_market: number | null;
  ask_to_close_price_pct: number | null;
  ask_to_close_cap_spread_bps: number | null;
  tracked_by_sweep: boolean;
  possibly_off_market: boolean;
  listed_term_remaining: string | null;
  listed_lease_type: string | null;
  source_type: string | null;
  source_url: string | null;
  broker_name: string | null;
  brokerage: string | null;
  // Multi-source listings (2026-11-02): sources disagree on price/cap → flagged for review.
  price_conflict: boolean;
  price_conflict_note: string | null;
  source_count: number;
  broker_email: string | null;
  broker_phone: string | null;
}

/** One place a listing was seen (comp_listing_source). Every source is kept. */
export type SourceKind = 'manual' | 'om' | 'showcase' | 'crexi' | 'loopnet' | 'costar' | 'aggregator';
export interface ListingSource {
  id: string;
  source_kind: SourceKind;
  source_label: string | null;
  url: string | null;
  first_seen_at: string;
  last_seen_at: string;
}
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  manual: 'Manual', om: 'OM', showcase: 'Showcase', crexi: 'Crexi', loopnet: 'LoopNet', costar: 'CoStar', aggregator: 'Aggregator',
};
// Noree's OM-link order: CoStar → Crexi → LoopNet → others; Showcase last (data only).
const SOURCE_ORDER: Record<SourceKind, number> = { costar: 1, crexi: 2, loopnet: 3, om: 4, aggregator: 5, manual: 6, showcase: 9 };

export async function fetchListingSources(listingId: string): Promise<ListingSource[]> {
  const { data, error } = await supabase.from('comp_listing_source')
    .select('id, source_kind, source_label, url, first_seen_at, last_seen_at')
    .eq('operating_memorandum_id', listingId);
  if (error) throw error;
  return ((data ?? []) as ListingSource[]).sort((a, b) =>
    SOURCE_ORDER[a.source_kind] - SOURCE_ORDER[b.source_kind] || a.first_seen_at.localeCompare(b.first_seen_at));
}

/** Clear the price/cap conflict flag once someone has looked (both events stay in the history). */
export async function resolvePriceConflict(listingId: string): Promise<void> {
  const { error } = await supabase.from('operating_memorandum')
    .update({ price_conflict: false }).eq('id', listingId);
  if (error) throw error;
}

export interface ListingEvent {
  id: string;
  operating_memorandum_id: string;
  event_date: string;
  event_type: ListingEventType;
  price: number | null;
  cap_rate: number | null;
  noi: number | null;
  /** Figures computed from the other two (price × cap = NOI), e.g. { noi: 'derived' }. Missing key = stated. */
  field_basis?: Record<string, 'derived'>;
  source_kind?: SourceKind | null;
  conflict?: boolean;   // a different source's figure while another was live
  outranked?: boolean;  // conflicting figure from a lower-ranked source: kept, never the current ask
  sale_comp_id: string | null;
  source_type: string | null;
  source_url: string | null;
  verification_method: VerificationMethod | null;
  recorded_by_kind: 'sweep' | 'user';
  recorded_by_id: string | null;
  note: string | null;
  created_at: string;
}

export async function fetchListingFacts(): Promise<ListingFacts[]> {
  const PAGE_SIZE = 1000;
  const all: ListingFacts[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('comp_listing_facts')
      .select('*')
      .order('first_seen_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as ListingFacts[]));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchListingFact(listingId: string): Promise<ListingFacts | null> {
  const { data, error } = await supabase.from('comp_listing_facts').select('*').eq('listing_id', listingId).maybeSingle();
  if (error) throw error;
  return data as ListingFacts | null;
}

export async function fetchListingEvents(listingId: string): Promise<ListingEvent[]> {
  const { data, error } = await supabase
    .from('comp_listing_event')
    .select('*')
    .eq('operating_memorandum_id', listingId)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ListingEvent[];
}

export async function setReviewStatus(compPropertyId: string, status: CompReviewStatus): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('comp_property')
    .update({ review_status: status, updated_by_id: user?.id ?? null }) // comp audit = auth id
    .eq('id', compPropertyId);
  if (error) throw error;
}

/** Status or ask event recorded by a person. Closes go through recordClose instead. */
export async function recordEvent(input: {
  listingId: string;
  type: Exclude<ListingEventType, 'closed'>;
  eventDate?: string;
  price?: number | null;
  capRate?: number | null;
  noi?: number | null;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('comp_listing_event').insert({
    operating_memorandum_id: input.listingId,
    event_type: input.type,
    ...(input.eventDate ? { event_date: input.eventDate } : {}),
    price: input.price ?? null,
    cap_rate: input.capRate ?? null,
    noi: input.noi ?? null,
    note: input.note ?? null,
    recorded_by_kind: 'user',
  });
  if (error) throw error;
}

/** "Still listed" on a possibly-off-market listing: reset the clock, no event. */
export async function markStillListed(listingId: string): Promise<void> {
  const { error } = await supabase
    .from('operating_memorandum')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', listingId);
  if (error) throw error;
}

/** The only path to closed figures: verified, creates the sale_comp + closed event. */
export async function recordClose(input: {
  listingId: string;
  closeDate: string;
  price: number;
  capRate: number | null;
  noi: number | null;
  verification: VerificationMethod;
  buyer?: string | null;
  seller?: string | null;
  note?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_listing_close', {
    p_listing_id: input.listingId,
    p_close_date: input.closeDate,
    p_price: input.price,
    p_cap_rate: input.capRate,
    p_noi: input.noi,
    p_verification_method: input.verification,
    p_source_type: input.verification === 'pt61' ? 'pt61' : input.verification === 'broker_confirm' ? 'broker' : 'om',
    p_source_url: null,
    p_buyer: input.buyer ?? null,
    p_seller: input.seller ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as string;
}

export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
export const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? '—' : `${Number(n).toFixed(d)}%`);

/** Eastern-time date for a timestamptz or a YYYY-MM-DD date. */
export const fmtDateET = (v: string | null | undefined) => {
  if (!v) return '—';
  // A bare date is a calendar day already — don't shift it through UTC.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
};

/** Today's Eastern-time date as YYYY-MM-DD. */
export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
