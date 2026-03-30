/**
 * Types for Advanced Property Search feature
 */

// Field type determines available operators
export type FieldType = 'text' | 'numeric' | 'boolean' | 'date';

// Field definition for property and unit fields
export interface SearchableField {
  key: string;
  label: string;
  type: FieldType;
  table: 'property' | 'property_unit';
}

// Operators per field type
export type TextOperator = 'contains' | 'equals' | 'starts_with' | 'is_empty' | 'is_not_empty';
export type NumericOperator = 'equals' | 'greater_than' | 'less_than' | 'between' | 'is_empty';
export type BooleanOperator = 'is_true' | 'is_false';
export type DateOperator = 'equals' | 'before' | 'after' | 'between' | 'is_empty';

export type Operator = TextOperator | NumericOperator | BooleanOperator | DateOperator;

// Single filter condition
export interface FilterCondition {
  id: string;
  field: SearchableField | null;
  operator: Operator | null;
  value: string | number | boolean | null;
  value2?: string | number | null; // For 'between' operator
}

// Filter group (conditions within are AND'd)
export interface FilterGroup {
  id: string;
  conditions: FilterCondition[];
}

// Sort configuration
export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

// Full search configuration
export interface SearchConfig {
  filterGroups: FilterGroup[];
  columns: string[];
  sortConfig: SortConfig | null;
}

// Saved search record from database
export interface SavedSearch {
  id: string;
  name: string;
  description: string | null;
  created_by_id: string;
  is_public: boolean;
  filter_groups: FilterGroup[];
  column_config: string[] | null;
  sort_config: SortConfig | null;
  created_at: string;
  updated_at: string;
  // Joined data
  created_by_name?: string;
}

// Property unit match for expanded rows
export interface PropertyUnitMatch {
  id: string;
  property_unit_name: string | null;
  sqft: number | null;
  rent: number | null;
  nnn: number | null;
  patio: boolean | null;
  inline: boolean | null;
  end_cap: boolean | null;
  end_cap_drive_thru: boolean | null;
  second_gen_restaurant: boolean | null;
  lease_expiration_date: string | null;
  unit_notes: string | null;
}

// Search result with optional unit matches
export interface PropertySearchResult {
  id: string;
  // Basic info
  property_name: string | null;
  description: string | null;
  landlord: string | null;
  // Location
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  trade_area: string | null;
  parcel_id: string | null;
  // Physical
  building_sqft: number | null;
  available_sqft: number | null;
  acres: number | null;
  // Financial
  asking_purchase_price: number | null;
  asking_lease_price: number | null;
  rent_psf: number | null;
  all_in_rent: number | null;
  nnn_psf: number | null;
  lease_expiration_date: string | null;
  // Links
  costar_link: string | null;
  reonomy_link: string | null;
  map_link: string | null;
  marketing_materials: string | null;
  site_plan: string | null;
  tax_url: string | null;
  // Notes
  property_notes: string | null;
  layer_notes: string | null;
  // Record type (joined)
  property_record_type?: {
    id: string;
    label: string;
  } | null;
  // Matching units when unit filters applied
  matching_units?: PropertyUnitMatch[];
  has_unit_matches?: boolean;
  // Computed display values (unit values flow into these when applicable)
  display_sqft?: number | null;
  display_rent?: number | null;
  display_nnn?: number | null;
}

// Operators available for each field type
export const OPERATORS_BY_TYPE: Record<FieldType, { value: Operator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'is_empty', label: 'Is empty' },
    { value: 'is_not_empty', label: 'Is not empty' },
  ],
  numeric: [
    { value: 'equals', label: 'Equals' },
    { value: 'greater_than', label: 'Greater than' },
    { value: 'less_than', label: 'Less than' },
    { value: 'between', label: 'Between' },
    { value: 'is_empty', label: 'Is empty' },
  ],
  boolean: [
    { value: 'is_true', label: 'Is true' },
    { value: 'is_false', label: 'Is false' },
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
    { value: 'is_empty', label: 'Is empty' },
  ],
};

// All searchable property fields
export const PROPERTY_FIELDS: SearchableField[] = [
  { key: 'property_name', label: 'Property Name', type: 'text', table: 'property' },
  { key: 'description', label: 'Description', type: 'text', table: 'property' },
  { key: 'landlord', label: 'Landlord', type: 'text', table: 'property' },
  { key: 'address', label: 'Address', type: 'text', table: 'property' },
  { key: 'city', label: 'City', type: 'text', table: 'property' },
  { key: 'state', label: 'State', type: 'text', table: 'property' },
  { key: 'zip', label: 'ZIP', type: 'text', table: 'property' },
  { key: 'country', label: 'Country', type: 'text', table: 'property' },
  { key: 'county', label: 'County', type: 'text', table: 'property' },
  { key: 'latitude', label: 'Latitude', type: 'numeric', table: 'property' },
  { key: 'longitude', label: 'Longitude', type: 'numeric', table: 'property' },
  { key: 'verified_latitude', label: 'Verified Latitude', type: 'numeric', table: 'property' },
  { key: 'verified_longitude', label: 'Verified Longitude', type: 'numeric', table: 'property' },
  { key: 'trade_area', label: 'Trade Area', type: 'text', table: 'property' },
  { key: 'parcel_id', label: 'Parcel ID', type: 'text', table: 'property' },
  { key: 'building_sqft', label: 'Building Sqft', type: 'numeric', table: 'property' },
  { key: 'available_sqft', label: 'Available Sqft', type: 'numeric', table: 'property' },
  { key: 'acres', label: 'Acres', type: 'numeric', table: 'property' },
  { key: 'asking_purchase_price', label: 'Asking Purchase Price', type: 'numeric', table: 'property' },
  { key: 'asking_lease_price', label: 'Asking Lease Price', type: 'numeric', table: 'property' },
  { key: 'rent_psf', label: 'Rent PSF', type: 'numeric', table: 'property' },
  { key: 'all_in_rent', label: 'All-In Rent', type: 'numeric', table: 'property' },
  { key: 'nnn_psf', label: 'NNN PSF', type: 'numeric', table: 'property' },
  { key: 'lease_expiration_date', label: 'Lease Expiration Date', type: 'date', table: 'property' },
  { key: 'costar_link', label: 'CoStar Link', type: 'text', table: 'property' },
  { key: 'reonomy_link', label: 'Reonomy Link', type: 'text', table: 'property' },
  { key: 'map_link', label: 'Map Link', type: 'text', table: 'property' },
  { key: 'marketing_materials', label: 'Marketing Materials', type: 'text', table: 'property' },
  { key: 'site_plan', label: 'Site Plan', type: 'text', table: 'property' },
  { key: 'tax_url', label: 'Tax URL', type: 'text', table: 'property' },
  { key: 'property_notes', label: 'Property Notes', type: 'text', table: 'property' },
  { key: 'layer_notes', label: 'Layer Notes', type: 'text', table: 'property' },
];

// All searchable property unit fields
export const UNIT_FIELDS: SearchableField[] = [
  { key: 'property_unit_name', label: 'Unit Name', type: 'text', table: 'property_unit' },
  { key: 'sqft', label: 'Unit Sqft', type: 'numeric', table: 'property_unit' },
  { key: 'patio', label: 'Patio', type: 'boolean', table: 'property_unit' },
  { key: 'inline', label: 'Inline', type: 'boolean', table: 'property_unit' },
  { key: 'end_cap', label: 'End Cap', type: 'boolean', table: 'property_unit' },
  { key: 'end_cap_drive_thru', label: 'End Cap Drive-Thru', type: 'boolean', table: 'property_unit' },
  { key: 'second_gen_restaurant', label: '2nd Gen Restaurant', type: 'boolean', table: 'property_unit' },
  { key: 'rent', label: 'Unit Rent', type: 'numeric', table: 'property_unit' },
  { key: 'nnn', label: 'Unit NNN', type: 'numeric', table: 'property_unit' },
  { key: 'lease_expiration_date', label: 'Unit Lease Expiration', type: 'date', table: 'property_unit' },
  { key: 'unit_notes', label: 'Unit Notes', type: 'text', table: 'property_unit' },
];

// Combined fields for field selector
export const ALL_SEARCHABLE_FIELDS = [...PROPERTY_FIELDS, ...UNIT_FIELDS];

// Default columns to display in results table
export const DEFAULT_COLUMNS = [
  'property_name',
  'address',
  'city',
  'state',
  'property_record_type',
  'building_sqft',
  'available_sqft',
  'acres',
  'asking_purchase_price',
  'rent_psf',
  'nnn_psf',
];

// All available columns for customization
export const ALL_AVAILABLE_COLUMNS: { key: string; label: string }[] = [
  { key: 'property_name', label: 'Property Name' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'property_record_type', label: 'Record Type' },
  { key: 'building_sqft', label: 'Building Sqft' },
  { key: 'available_sqft', label: 'Available Sqft' },
  { key: 'acres', label: 'Acres' },
  { key: 'asking_purchase_price', label: 'Asking Purchase Price' },
  { key: 'asking_lease_price', label: 'Asking Lease Price' },
  { key: 'rent_psf', label: 'Rent PSF' },
  { key: 'all_in_rent', label: 'All-In Rent' },
  { key: 'nnn_psf', label: 'NNN PSF' },
  { key: 'lease_expiration_date', label: 'Lease Expiration' },
  { key: 'description', label: 'Description' },
  { key: 'landlord', label: 'Landlord' },
  { key: 'zip', label: 'ZIP' },
  { key: 'country', label: 'Country' },
  { key: 'county', label: 'County' },
  { key: 'trade_area', label: 'Trade Area' },
  { key: 'parcel_id', label: 'Parcel ID' },
  { key: 'costar_link', label: 'CoStar Link' },
  { key: 'reonomy_link', label: 'Reonomy Link' },
  { key: 'property_notes', label: 'Property Notes' },
];

// View mode options
export type ViewMode = 'table' | 'map';

// Helper to create empty condition
export function createEmptyCondition(): FilterCondition {
  return {
    id: crypto.randomUUID(),
    field: null,
    operator: null,
    value: null,
  };
}

// Helper to create empty group
export function createEmptyGroup(): FilterGroup {
  return {
    id: crypto.randomUUID(),
    conditions: [createEmptyCondition()],
  };
}

// Check if a condition has a valid value
export function hasValidValue(condition: FilterCondition): boolean {
  if (!condition.field || !condition.operator) return false;

  // Empty/not empty operators don't need a value
  if (condition.operator === 'is_empty' || condition.operator === 'is_not_empty') {
    return true;
  }

  // Boolean operators don't need a value input
  if (condition.operator === 'is_true' || condition.operator === 'is_false') {
    return true;
  }

  // Between requires two values
  if (condition.operator === 'between') {
    return condition.value !== null && condition.value !== '' &&
           condition.value2 !== null && condition.value2 !== '';
  }

  // Other operators need a value
  return condition.value !== null && condition.value !== '';
}

// Check if search can be executed (at least one valid condition)
export function canExecuteSearch(filterGroups: FilterGroup[]): boolean {
  return filterGroups.some(group =>
    group.conditions.some(condition => hasValidValue(condition))
  );
}
