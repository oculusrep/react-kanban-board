// Central type definitions for the CRM system
// src/lib/types.ts

// Core Business Entities
export interface Deal {
  id: string;
  dealId?: string; // For compatibility with existing code
  deal_name: string | null;
  deal_value: number | null;
  stage: string | null;
  close_date: string | null;
  probability: number | null;
  
  // Commission fields
  commission_percent?: number | null;
  flat_fee_override?: number | null;
  fee?: number | null;
  
  // Deal-level commission breakdown
  referral_fee_percent?: number | null;
  referral_fee_usd?: number | null;
  referral_payee_client_id?: string | null;
  gci?: number | null;
  agci?: number | null;
  house_percent?: number | null;
  house_usd?: number | null;
  origination_percent?: number | null;
  origination_usd?: number | null;
  site_percent?: number | null;
  site_usd?: number | null;
  deal_percent?: number | null;
  deal_usd?: number | null;
  
  // Payment configuration
  number_of_payments?: number | null;
  sf_multiple_payments?: boolean | null;
  
  // Related entities
  client_id?: string | null;
  property_id?: string | null;
  property_unit_id?: string | null;
  site_submit_id?: string | null;
  
  // Additional missing properties from error messages
  assignment_id?: string | null;
  source?: string | null;
  transaction_type_id?: string | null;
  property_type_id?: string | null;
  size_sqft?: number | null;
  size_acres?: number | null;
  representation_id?: string | null;
  owner_id?: string | null;
  
  // Latest missing properties from error
  deal_team_id?: string | null;
  stage_id?: string | null;
  target_close_date?: string | null;
  loi_signed_date?: string | null;
  booked_date?: string | null;
  closed_date?: string | null;
  booked?: boolean | null;
  loss_reason?: string | null;
  last_stage_change_at?: string | null;

  // Metadata
  created_at?: string;
  updated_at?: string;
}

export interface DealCard {
  id: string;
  deal_name: string | null;
  deal_value: number | null;
  stage: string | null;
  close_date: string | null;
  probability: number | null;
  client_name?: string | null;
  property_name?: string | null;
}

export interface Client {
  id: string;
  client_name: string | null;
  type: string | null;
  phone: string | null;
  email: string | null;
  is_active_client: boolean;
  created_at?: string;
  updated_at?: string;
  sf_id?: string | null;
}

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  client_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Property {
  id: string;
  property_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  property_type: string | null;
  total_square_feet: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface PropertyUnit {
  id: string;
  property_id: string | null;
  unit_number: string | null;
  square_feet: number | null;
  unit_type: string | null;
  lease_rate: number | null;
  availability_date: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SiteSubmit {
  id: string;
  property_id: string | null;
  client_id: string | null;
  submission_date: string | null;
  status: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Assignment {
  id: string;
  assignment_name: string | null;
  assignment_value: number | null;
  client_id: string | null;
  deal_id: string | null;
  owner_id: string | null;
  priority_id: string | null;
  transaction_type_id: string | null;
  due_date: string | null;
  progress: string | null;
  commission: number | null;
  fee: number | null;
  referral_fee: number | null;
  referral_payee_id: string | null;
  scoped: boolean | null;
  site_criteria: string | null;
  
  // Salesforce fields
  sf_id: string | null;
  sf_account_id: string | null;
  sf_opportunity_id: string | null;
  sf_owner_id: string | null;
  sf_priority: string | null;
  sf_referral_payee: string | null;
  sf_scoped_formula: string | null;
  sf_transaction_type: string | null;
  sf_num_of_pursuing_ownership: string | null;
  sf_num_of_site_submits: string | null;
  sf_number_of_pursuing_ownership: number | null;
  sf_number_of_site_submits: number | null;
  
  // Audit fields
  created_at: string | null;
  updated_at: string | null;
  created_by_id: string | null;
  updated_by_id: string | null;
  sf_created_by_id: string | null;
  updated_by_sf_id: string | null;
}

export interface AssignmentPriority {
  id: string;
  label: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
}

// Commission System Types
export interface Broker {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionSplit {
  id: string;
  deal_id: string;
  broker_id: string;
  split_origination_percent: number | null;
  split_origination_usd: number | null;
  split_site_percent: number | null;
  split_site_usd: number | null;
  split_deal_percent: number | null;
  split_deal_usd: number | null;
  split_broker_total: number | null;
  created_at?: string;
  updated_at?: string;
}

// Payment System Types - Updated to match actual database schema
export interface Payment {
  id: string;
  sf_id?: string | null;
  deal_id: string;
  payment_name?: string | null;
  
  // Payment details
  payment_sequence: number | null;        // Was: payment_number
  payment_amount: number | null;
  
  // Payment dates (multiple date fields in DB)
  payment_date_estimated: string | null;  // User-editable estimated date
  payment_received_date: string | null;   // When payment was received
  payment_invoice_date: string | null;    // Invoice date
  
  // Salesforce date fields (read-only)
  sf_received_date?: string | null;
  sf_payment_date_est?: string | null;
  sf_payment_date_received?: string | null;
  sf_payment_date_actual?: string | null;
  sf_payment_invoice_date?: string | null;
  
  // Payment status and tracking
  payment_received: boolean | null;
  sf_payment_status?: string | null;     // Salesforce payment status
  sf_invoice_sent_date?: string | null;
  
  // QuickBooks integration
  qb_invoice_id: string | null;
  qb_payment_id: string | null;
  qb_sync_status?: string | null;
  qb_last_sync?: string | null;
  
  // OREP invoice tracking
  orep_invoice?: string | null;
  
  // Disbursement tracking
  referral_fee_paid?: boolean | null;
  referral_fee_paid_date?: string | null;

  // Legacy compatibility fields
  status?: string;                    // Temporary for component compatibility
  payment_date?: string;              // Temporary for component compatibility
  invoice_sent?: boolean | null;      // Temporary for component compatibility

  // Soft delete fields (for payment lifecycle management)
  is_active?: boolean;                // False when payment is archived (deal moved to Lost)
  deleted_at?: string | null;         // Timestamp when payment was archived

  // Audit fields
  sf_created_by_id?: string | null;
  created_by_id?: string | null;
  created_at?: string;
  sf_updated_by_id?: string | null;
  updated_by_id?: string | null;
  updated_at?: string;
}

export interface PaymentSplit {
  id: string;
  payment_id: string;
  commission_split_id: string | null;
  broker_id: string;
  split_broker_total: number | null;  // This exists in DB

  split_origination_percent: number | null;
  split_site_percent: number | null;
  split_deal_percent: number | null;
  split_origination_usd: number | null;
  split_site_usd: number | null;
  split_deal_usd: number | null;

  // Disbursement tracking
  paid?: boolean | null;
  paid_date?: string | null;

  created_at?: string;
  updated_at?: string;
}

// Contact Roles and Relationships
export interface ContactRole {
  id: string;
  role_name: string;
}

export interface DealContact {
  id: string;
  deal_id: string;
  contact_id: string;
  contact_role_id: string;
  is_primary: boolean | null;
  created_at?: string;
  updated_at?: string;
}

// Utility Types
export type DealUpdateHandler = (updates: Partial<Deal>) => Promise<void>;

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

// Kanban Board Types
export interface KanbanColumn {
  id: string;
  title: string;
  deals: DealCard[];
  color: string;
}

// Form Input Types
export interface SelectOption {
  value: string;
  label: string;
}

// Constants
export const DEAL_STAGES = [
  'Prospecting',
  'Qualification',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost'
] as const;

export const PROPERTY_TYPES = [
  'Office',
  'Retail',
  'Industrial',
  'Warehouse',
  'Mixed Use',
  'Land'
] as const;

export const CLIENT_TYPES = [
  'Tenant',
  'Landlord',
  'Investor',
  'Developer'
] as const;

export const PAYMENT_STATUSES = [
  'pending',
  'sent', 
  'received'
] as const;

export const COMMISSION_SPLIT_TYPES = [
  'origination',
  'site',
  'deal'
] as const;

// Type Guards
export const isDeal = (obj: any): obj is Deal => {
  return obj && typeof obj.id === 'string';
};

export const isClient = (obj: any): obj is Client => {
  return obj && typeof obj.id === 'string' && obj.name !== undefined;
};

export const isPayment = (obj: any): obj is Payment => {
  return obj && typeof obj.payment_id === 'string';
};

export const isPaymentSplit = (obj: any): obj is PaymentSplit => {
  return obj && typeof obj.payment_split_id === 'string';
};

// Validation Rules
export const VALIDATION_RULES = {
  commission: {
    maxPercent: 15, // 15% commission rate warning threshold
    minPercent: 0.1, // 0.1% minimum commission rate
  },
  splits: {
    totalPercentage: 100, // Total splits should equal 100%
    tolerance: 0.01, // Allow 0.01% tolerance for rounding
  },
  payments: {
    minAmount: 0.01, // Minimum payment amount
    maxPayments: 12, // Maximum number of payments
  }
} as const;

// Dropbox Integration Types
export interface DropboxFolderMapping {
  id: string;
  entity_type: 'client' | 'property' | 'deal';
  entity_id: string;
  sf_id: string;
  dropbox_folder_path: string;
  sfdb_file_found: boolean;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
}

export interface DropboxFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size: number | null;
  modified: string | null;
  shared_link: string | null;
  icon?: string; // Optional: for file type icons
}