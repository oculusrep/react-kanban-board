// Types for Payment Dashboard
// src/types/payment-dashboard.ts

export interface PaymentDashboardRow {
  // Payment info
  payment_id: string;
  payment_sf_id: string | null;
  deal_id: string;
  deal_name: string;
  deal_stage: string | null;
  payment_sequence: number;
  total_payments: number;
  payment_amount: number;
  locked: boolean;

  // Payment dates
  payment_date_estimated: string | null;
  payment_received_date: string | null;
  payment_received: boolean;

  // Invoice info
  invoice_sent: boolean;
  payment_invoice_date: string | null;
  orep_invoice: string | null;

  // Referral fee info
  referral_fee_usd: number | null;
  referral_payee_name: string | null;
  referral_payee_client_id: string | null;
  referral_fee_paid: boolean;
  referral_fee_paid_date: string | null;

  // Broker splits for this payment
  broker_splits: BrokerPaymentSplit[];

  // Status indicators
  all_brokers_paid: boolean;
  total_broker_amount: number;
}

export interface BrokerPaymentSplit {
  payment_split_id: string;
  broker_id: string;
  broker_name: string;

  // Split amounts
  split_origination_usd: number | null;
  split_site_usd: number | null;
  split_deal_usd: number | null;
  split_broker_total: number | null;

  // Split percentages
  split_origination_percent: number | null;
  split_site_percent: number | null;
  split_deal_percent: number | null;

  // Payment tracking
  paid: boolean;
  paid_date: string | null;
}

export interface PaymentDashboardFilters {
  searchQuery: string;
  paymentStatus: 'all' | 'received' | 'pending';
  payoutStatus: 'all' | 'paid' | 'unpaid' | 'partial';
  dateRange: {
    start: string | null;
    end: string | null;
  };
  dealStages: string[];
  dealId: string | null;
}

export interface PaymentSummaryStats {
  total_payments: number;
  total_payment_amount: number;
  payments_received: number;
  payments_received_amount: number;
  total_broker_payouts: number;
  broker_payouts_paid: number;
  broker_payouts_paid_amount: number;
  total_referral_fees: number;
  referral_fees_paid: number;
  referral_fees_paid_amount: number;
}

// Salesforce vs OVIS comparison types
export interface PaymentComparison {
  deal_id: string;
  deal_name: string;
  payment_sequence: number;

  // Salesforce data
  sf_payment_id: string | null;
  sf_payment_amount: number | null;
  sf_payment_date: string | null;
  sf_payment_status: string | null;

  // OVIS data
  ovis_payment_id: string | null;
  ovis_payment_amount: number | null;
  ovis_payment_received_date: string | null;
  ovis_payment_received: boolean | null;

  // Comparison results
  amount_matches: boolean;
  date_matches: boolean;
  status_matches: boolean;
  discrepancy_notes: string[];
}

export interface CommissionComparison {
  deal_id: string;
  deal_name: string;
  broker_name: string;

  // Salesforce data
  sf_commission_split_id: string | null;
  sf_origination_usd: number | null;
  sf_site_usd: number | null;
  sf_deal_usd: number | null;
  sf_total: number | null;

  // OVIS data
  ovis_commission_split_id: string | null;
  ovis_origination_usd: number | null;
  ovis_site_usd: number | null;
  ovis_deal_usd: number | null;
  ovis_total: number | null;

  // Comparison results
  amounts_match: boolean;
  discrepancy_amount: number;
  discrepancy_notes: string[];
}
