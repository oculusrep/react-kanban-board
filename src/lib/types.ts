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
  commission_percent: number | null;
  flat_fee_override: number | null;
  fee: number | null;
  
  // Deal-level commission breakdown
  referral_fee_percent: number | null;
  referral_fee_usd: number | null;
  referral_payee_client_id: string | null;
  gci: number | null;
  agci: number | null;
  house_percent: number | null;
  house_usd: number | null;
  origination_percent: number | null;
  origination_usd: number | null;
  site_percent: number | null;
  site_usd: number | null;
  deal_percent: number | null;
  deal_usd: number | null;
  
  // Payment configuration
  number_of_payments: number | null;
  sf_multiple_payments: boolean | null;
  
  // Related entities
  client_id: string | null;
  property_id: string | null;
  property_unit_id: string | null;
  site_submit_id: string | null;
  
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
  closed_date?: string | null;
  
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
  name: string | null;
  type: string | null;
  phone: string | null;
  email: string | null;
  created_at?: string;
  updated_at?: string;
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

// Payment System Types - Updated to match database schema
export interface Payment {
  id: string;
  deal_id: string;
  
  // Payment details
  payment_sequence: number | null;        // Was: payment_number
  payment_amount: number | null;
  
  // Payment dates (multiple date fields in DB)
  payment_date_estimated: string | null;  // Was: payment_date
  payment_date_actual: string | null;     // New: actual payment date
  payment_received_date: string | null;   // New: when payment was received
  
  // Payment status and tracking
  payment_received: boolean | null;       // Was: status (boolean instead of string)
  status?: string;                    // Temporary for component compatibility
  payment_date?: string;              // Temporary for component compatibility
  
  qb_invoice_id: string | null;
  qb_payment_id: string | null;
  
  // Additional fields from schema
  payment_invoice_date: string | null;
  invoice_sent: boolean | null;
  agci: number | null;
  
  // Notes and metadata
  notes: string | null;
  created_at?: string;
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