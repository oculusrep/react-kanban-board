// Comp Database types (Phase 1)
// Mirror supabase/migrations/20260725180000_comp_database_phase1.sql. Kept hand-written for
// ergonomic imports (the generated Database types in database-schema.ts also cover these tables).

export type CompSourceType = 'manual' | 'costar' | 'crexi' | 'om' | 'ai_agent';
export type CompConfidence = 'unverified' | 'reported' | 'verified';
export type LeaseType = 'ground_lease' | 'bts_nnn' | 'bts_nn' | 'multi_tenant';
export type OccupancyStatus = 'occupied' | 'vacant' | 'dark';
export type SaleCondition = 'arms_length' | 'distressed' | 'portfolio' | 'related_party' | 'other';

export const SOURCE_TYPES: CompSourceType[] = ['manual', 'costar', 'crexi', 'om', 'ai_agent'];
export const CONFIDENCE_LEVELS: CompConfidence[] = ['unverified', 'reported', 'verified'];
export const LEASE_TYPES: LeaseType[] = ['ground_lease', 'bts_nnn', 'bts_nn', 'multi_tenant'];

// Display labels + which lease-comp fields are relevant per type (drives conditional entry fields).
export const LEASE_TYPE_OPTIONS: { value: LeaseType; label: string }[] = [
  { value: 'ground_lease', label: 'Ground Lease' },
  { value: 'bts_nnn', label: 'BTS (NNN)' },
  { value: 'bts_nn', label: 'BTS (NN)' },
  { value: 'multi_tenant', label: 'Multi-Tenant' },
];

export const LEASE_TYPE_LABEL: Record<LeaseType, string> = {
  ground_lease: 'Ground Lease',
  bts_nnn: 'BTS (NNN)',
  bts_nn: 'BTS (NN)',
  multi_tenant: 'Multi-Tenant',
};

// Physical/rent fields gated per lease type (from Mike's field matrix). Everything else is always
// shown: tenant, brand, occupancy, lease term (years), escalation, rent bumps, option periods,
// commencement/expiration, reported sales, source, confidence.
export type LeaseField = 'suite' | 'tenant_sqft' | 'annual_base_rent' | 'nnn_psf' | 'ti_annual';

export const LEASE_TYPE_FIELDS: Record<LeaseType, LeaseField[]> = {
  // Ground lease = land only: annual ground rent + TI. No suite / building SF / NNN.
  ground_lease: ['annual_base_rent', 'ti_annual'],
  // Build-to-suit triple net: building SF + annual base rent + TI. (NNN paid directly, not captured.)
  bts_nnn: ['tenant_sqft', 'annual_base_rent', 'ti_annual'],
  // Build-to-suit double net: adds NNN reimbursements.
  bts_nn: ['tenant_sqft', 'annual_base_rent', 'nnn_psf', 'ti_annual'],
  // Tenant within a multi-tenant center: adds Suite + NNN.
  multi_tenant: ['suite', 'tenant_sqft', 'annual_base_rent', 'nnn_psf', 'ti_annual'],
};

export type RentBumpFrequency = 'annual' | 'every_5_years' | 'other';
export const RENT_BUMP_OPTIONS: { value: RentBumpFrequency; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'every_5_years', label: 'Every 5 Years' },
  { value: 'other', label: 'Other' },
];
export const OCCUPANCY_STATUSES: OccupancyStatus[] = ['occupied', 'vacant', 'dark'];
export const SALE_CONDITIONS: SaleCondition[] = ['arms_length', 'distressed', 'portfolio', 'related_party', 'other'];

// Shared provenance columns present on every comp-bearing table.
export interface CompProvenance {
  source_type: CompSourceType;
  source_url: string | null;
  source_reference: string | null;
  source_captured_at: string | null;
  confidence: CompConfidence;
  verified_by_id: string | null;
  verified_at: string | null;
}

export interface CompProperty extends CompProvenance {
  id: string;
  property_id: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  property_type_id: string | null;
  building_sqft: number | null;
  land_acres: number | null;
  year_built: number | null;
  anchor_tenant: string | null;
  trade_area: string | null;
  parcel_id: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaseComp extends CompProvenance {
  id: string;
  comp_property_id: string;
  tenant_name: string | null;
  merchant_brand_id: string | null;
  suite: string | null;
  tenant_sqft: number | null;
  lease_type: LeaseType | null;
  base_rent_psf: number | null;
  annual_base_rent: number | null;
  nnn_psf: number | null;
  all_in_rent_psf: number | null;
  lease_commencement_date: string | null;
  lease_expiration_date: string | null;
  lease_term_months: number | null;
  lease_term_years: number | null;
  escalation_pct: number | null;
  rent_bump_frequency: RentBumpFrequency | null;
  rent_steps: unknown | null;
  free_rent_months: number | null;
  ti_psf: number | null;
  ti_annual: number | null;
  option_periods: string | null;
  reported_tenant_sales: number | null;
  sales_psf: number | null;
  occupancy_status: OccupancyStatus | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleComp extends CompProvenance {
  id: string;
  comp_property_id: string;
  sale_date: string | null;
  sale_price: number | null;
  price_psf: number | null;
  cap_rate: number | null;
  noi: number | null;
  grm: number | null;
  buyer_name: string | null;
  seller_name: string | null;
  broker: string | null;
  financing: string | null;
  sale_condition: SaleCondition | null;
  occupancy_at_sale: number | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperatingMemorandum extends CompProvenance {
  id: string;
  comp_property_id: string;
  sale_comp_id: string | null;
  title: string | null;
  broker_name: string | null;
  brokerage: string | null;
  list_date: string | null;
  asking_price: number | null;
  asking_cap_rate: number | null;
  guidance: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompNote {
  id: string;
  comp_property_id: string;
  body: string;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

// A comp_property enriched with related-row counts (used to color/badge map pins).
export interface CompPropertyWithCounts extends CompProperty {
  lease_count: number;
  sale_count: number;
  om_count: number;
}

/** Resolve the display coordinates for a comp: verified wins over raw (OVIS coord rule). */
export function compCoords(
  c: Pick<CompProperty, 'latitude' | 'longitude' | 'verified_latitude' | 'verified_longitude'>
): { lat: number; lng: number; verified: boolean } | null {
  if (typeof c.verified_latitude === 'number' && typeof c.verified_longitude === 'number') {
    return { lat: c.verified_latitude, lng: c.verified_longitude, verified: true };
  }
  if (typeof c.latitude === 'number' && typeof c.longitude === 'number') {
    return { lat: c.latitude, lng: c.longitude, verified: false };
  }
  return null;
}
