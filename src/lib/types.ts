// Central type definitions for the entire CRM project
// This file serves as the single source of truth for all data types

// ===== DEAL TYPES =====

export interface Deal {
  // Core identifiers
  id: string;
  deal_name: string | null;
  
  // Financial fields
  deal_value: number | null;
  fee: number | null;
  flat_fee_override?: number | null;
  
  // Commission breakdown fields
  commission_percent: number | null;
  referral_fee_percent: number | null;
  referral_fee_usd: number | null;
  referral_payee: string | null;
  gci: number | null;
  agci: number | null;
  
  // Broker commission percentages
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
  
  // Workflow fields
  stage_id: string | null;
  closed_date: string | null;
  created_at?: string | null;
  
  // Relationships
  client_id: string | null;
  property_id: string | null;
  
  // Kanban fields
  kanban_position: number | null;
}

// Simplified version for Kanban cards (subset of Deal)
export interface DealCard {
  id: string;
  deal_name: string | null;
  fee: number | null;
  deal_value: number | null;
  closed_date: string | null;
  stage_id: string | null;
  kanban_position: number | null;
  client_name: string | null;
  created_at?: string | null;
}

// ===== COMMISSION SYSTEM TYPES =====

export interface Broker {
  id: string;
  name: string;
  active: boolean;
}

export interface CommissionSplit {
  id: string;
  deal_id: string;
  broker_id: string;
  split_name: string;
  broker_name?: string; // Joined from broker table
  
  // Commission breakdown by type
  split_origination_percent: number;
  split_origination_usd: number;
  split_site_percent: number;
  split_site_usd: number;
  split_deal_percent: number;
  split_deal_usd: number;
  split_broker_total: number;
}

export interface Payment {
  id: string;
  deal_id: string;
  payment_number: number;
  payment_amount: number;
  payment_date: string | null;
  payment_received: boolean;
  payment_received_date: string | null;
  
  // QuickBooks integration fields
  qb_invoice_id: string | null;
  qb_payment_id: string | null;
  qb_sync_status: string | null;
  qb_sync_date: string | null;
  
  // Audit fields
  created_at: string;
  updated_at: string;
}

export interface PaymentSplit {
  id: string;
  payment_id: string;
  broker_id: string;
  commission_split_id: string;
  
  // Split amounts (can override commission template)
  split_origination_percent: number;
  split_origination_usd: number;
  split_site_percent: number;
  split_site_usd: number;
  split_deal_percent: number;
  split_deal_usd: number;
  split_total_usd: number;
  
  // Payment status
  paid: boolean;
  paid_date: string | null;
}

// ===== CLIENT & CONTACT TYPES =====

export interface Client {
  id: string;
  client_name: string;
  client_type: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  client_id: string | null;
  active: boolean;
}

export interface DealContact {
  id: string;
  deal_id: string;
  contact_id: string;
  contact_role_id: string;
  primary_contact: boolean;
}

export interface ContactRole {
  id: string;
  role_name: string;
  description: string | null;
  active: boolean;
}

// ===== PROPERTY TYPES =====

export interface Property {
  id: string;
  property_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  property_type: string | null;
  total_square_feet: number | null;
  active: boolean;
}

export interface PropertyUnit {
  id: string;
  property_id: string;
  unit_number: string | null;
  square_feet: number | null;
  floor: number | null;
  unit_type: string | null;
  active: boolean;
}

// ===== WORKFLOW TYPES =====

export interface DealStage {
  id: string;
  label: string;
  description: string | null;
  sort_order: number | null;
  active: boolean | null;
}

// Alias for Kanban usage
export interface KanbanColumn extends DealStage {}

export interface SiteSubmit {
  id: string;
  deal_id: string;
  property_id: string;
  submitted_date: string | null;
  status: string | null;
  notes: string | null;
}

export interface Assignment {
  id: string;
  deal_id: string;
  property_id: string;
  assignment_date: string | null;
  status: string | null;
  notes: string | null;
}

// ===== UTILITY TYPES =====

// For form handling and API responses
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

// For component props that handle deal updates
export type DealUpdateHandler = (updatedDeal: Deal) => void;

// For validation and error handling
export type ValidationWarning = {
  field: string;
  message: string;
  severity: 'warning' | 'error';
};

// ===== TYPE GUARDS =====

export function isDeal(obj: any): obj is Deal {
  return obj && typeof obj.id === 'string';
}

export function isDealCard(obj: any): obj is DealCard {
  return obj && typeof obj.id === 'string' && obj.hasOwnProperty('client_name');
}

// ===== CONSTANTS =====

export const COMMISSION_VALIDATION = {
  MAX_COMMISSION_RATE: 50,
  MAX_REFERRAL_FEE: 100,
  BROKER_SPLIT_TARGET: 100,
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  RECEIVED: 'received',
  OVERDUE: 'overdue',
} as const;

export const QB_SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  ERROR: 'error',
  MANUAL: 'manual',
} as const;