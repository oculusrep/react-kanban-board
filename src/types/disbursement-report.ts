// Types for Disbursement Report
// src/types/disbursement-report.ts

export interface DisbursementRow {
  // Unique identifier for this row
  id: string;

  // Type of disbursement
  type: 'broker' | 'referral';

  // Payee information
  payee_name: string;
  payee_id: string; // broker_id or client_id

  // Deal information
  deal_id: string;
  deal_name: string;

  // Invoice information
  ovis_invoice: string | null;
  qbo_invoice_number: string | null;

  // Payment information
  payment_id: string;
  payment_sequence: number;
  total_payments: number;
  payment_name: string; // e.g., "Payment 1 of 3"

  // Amount
  amount: number;

  // Dates
  paid_date: string | null;
  estimated_payment_date: string | null;

  // Status
  payment_received: boolean; // Payment received from customer
  disbursement_paid: boolean; // Paid to broker/referral partner
}

export interface DisbursementFilters {
  searchQuery: string;
  payeeFilter: string | null; // Filter by specific payee name
  disbursementStatus: 'all' | 'paid' | 'unpaid';
  receivedStatus: 'all' | 'received' | 'pending';
  dateRange: {
    start: string | null;
    end: string | null;
  };
  type: 'all' | 'broker' | 'referral';
}

export interface DisbursementSummary {
  total_disbursements: number;
  total_amount: number;
  paid_disbursements: number;
  paid_amount: number;
  unpaid_disbursements: number;
  unpaid_amount: number;
}
