import { Payment, PaymentSplit, Broker, Deal, Client } from '../lib/types';

/**
 * Extended payment row for dashboard display
 * Includes all payment details plus calculated broker splits and referral info
 */
export interface PaymentDashboardRow {
  // Core payment data
  payment: Payment;
  deal: Deal;

  // Broker splits for this payment
  brokerSplits: BrokerPaymentSplit[];

  // Referral fee info (if applicable)
  referralFee?: ReferralFeeInfo;

  // Calculated totals
  totalBrokerCommission: number;
  totalPaidOut: number;
  totalUnpaid: number;

  // Payment status flags
  allBrokersPaid: boolean;
  referralPaid: boolean;
  fullyDisbursed: boolean;
}

/**
 * Individual broker commission split for a payment
 */
export interface BrokerPaymentSplit {
  splitId: string;
  brokerId: string;
  brokerName: string;

  // Commission amounts
  originationAmount: number;
  siteAmount: number;
  dealAmount: number;
  totalAmount: number;

  // Split percentages
  originationPercent: number;
  sitePercent: number;
  dealPercent: number;

  // Payment status
  paid: boolean;
  paidDate: string | null;

  // Reference to payment_split record
  paymentSplit: PaymentSplit;
}

/**
 * Referral fee information for a payment
 */
export interface ReferralFeeInfo {
  payeeClientId: string;
  payeeName: string;
  amount: number;
  percent: number | null;
  paid: boolean;
  paidDate: string | null;
}

/**
 * Filter state for payment dashboard
 */
export interface PaymentDashboardFilters {
  // Date range
  dateFrom: string | null;
  dateTo: string | null;

  // Status filters
  showPaidOnly: boolean;
  showUnpaidOnly: boolean;
  showPartiallyPaid: boolean;

  // Entity filters
  brokerId: string | null;
  dealId: string | null;
  clientId: string | null;

  // Search
  searchTerm: string;
}

/**
 * Summary statistics for payment dashboard
 */
export interface PaymentSummaryStats {
  // Counts
  totalPayments: number;
  fullyPaidPayments: number;
  partiallyPaidPayments: number;
  unpaidPayments: number;

  // Amounts
  totalCommissionReceived: number;
  totalDisbursed: number;
  totalPendingDisbursement: number;

  // Broker-specific
  totalBrokersAwaitingPayment: number;
  totalReferralFeesUnpaid: number;
}

/**
 * Comparison row between Salesforce and OVIS (Supabase) data
 */
export interface PaymentComparison {
  dealId: string;
  dealName: string;

  // Salesforce data
  salesforcePaymentCount: number;
  salesforceTotalCommission: number;

  // OVIS data
  ovisPaymentCount: number;
  ovisTotalCommission: number;

  // Comparison flags
  paymentCountMatch: boolean;
  commissionAmountMatch: boolean;
  hasDiscrepancy: boolean;

  // Discrepancy details
  paymentCountDifference: number;
  commissionDifference: number;
}

/**
 * Commission split comparison between Salesforce and OVIS
 */
export interface CommissionComparison {
  dealId: string;
  dealName: string;
  brokerId: string;
  brokerName: string;

  // Salesforce commission splits
  salesforceOrigination: number;
  salesforceSite: number;
  salesforceDeal: number;
  salesforceTotal: number;

  // OVIS commission splits
  ovisOrigination: number;
  ovisSite: number;
  ovisDeal: number;
  ovisTotal: number;

  // Comparison flags
  originationMatch: boolean;
  siteMatch: boolean;
  dealMatch: boolean;
  totalMatch: boolean;
  hasDiscrepancy: boolean;
}

/**
 * Comparison report data structure
 */
export interface ComparisonReport {
  payments: PaymentComparison[];
  commissions: CommissionComparison[];

  summary: {
    totalDealsCompared: number;
    dealsWithDiscrepancies: number;
    totalCommissionDifference: number;
    totalPaymentCountDifference: number;
  };
}
