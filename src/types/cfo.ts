/**
 * CFO Agent Types
 *
 * TypeScript interfaces for the CFO Dashboard chat interface
 * and Claude API integration.
 */

// ============================================================================
// CHART TYPES
// ============================================================================

export type ChartType = 'bar' | 'line' | 'area' | 'composed' | 'stacked_bar';
export type YAxisFormat = 'currency' | 'number' | 'percent';

export interface ChartSeries {
  dataKey: string;
  name: string;
  color: string;
  type?: 'bar' | 'line' | 'area';
}

export interface ChartSpecification {
  chart_type: ChartType;
  title: string;
  data: Array<Record<string, unknown>>;
  x_axis: string;
  series: ChartSeries[];
  y_axis_format: YAxisFormat;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface CFOMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chart_spec?: ChartSpecification;
  timestamp: Date;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface CFOQueryRequest {
  query: string;
  conversation_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  context?: {
    period?: string; // YYYY-MM or YYYY
    focus_area?: 'expenses' | 'revenue' | 'cash_flow' | 'ar' | 'general';
  };
}

export interface CFOQueryResponse {
  success: boolean;
  answer: string;
  chart_spec?: ChartSpecification;
  supporting_data?: Record<string, unknown>;
  query_id: string;
  error?: string;
}

// ============================================================================
// FINANCIAL DATA TYPES (for tool responses)
// ============================================================================

export interface MonthlyPaymentForecast {
  month: string;
  monthIndex: number;
  invoiced: number;
  pipeline: number;
  contingent: number;
  total: number;
  payments: PaymentDetail[];
}

export interface PaymentDetail {
  id: string;
  dealId: string;
  dealName: string;
  paymentName: string;
  invoiceNumber: string | null;
  paymentAmount: number;
  referralFee: number;
  brokerSplits: number;
  houseNet: number;
  gci: number;
  estimatedDate: string | null;
  category: 'invoiced' | 'pipeline' | 'ucContingent';
  stageLabel: string;
}

export interface AccountBudgetData {
  qb_account_id: string;
  account_name: string;
  account_type: string;
  year: number;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
  annual_total: number;
}

export interface ExpenseByPeriod {
  account_id: string;
  account_name: string;
  account_type: string;
  total: number;
  transactions: Array<{
    id: string;
    date: string;
    vendor: string;
    amount: number;
    description: string;
  }>;
}

export interface InvoiceAgingSummary {
  total_receivables: number;
  current: number;
  overdue_1_30: number;
  overdue_31_60: number;
  overdue_61_90: number;
  overdue_90_plus: number;
  invoices?: Array<{
    invoice_number: string;
    client_name: string;
    deal_name: string;
    amount: number;
    due_date: string;
    days_overdue: number;
    aging_bucket: string;
  }>;
}

export interface CashFlowProjection {
  month: string;
  monthIndex: number;
  income: number;
  expenses: number;
  net: number;
  runningBalance: number;
  incomeDetails: {
    invoiced: number;
    pipeline: number;
    contingent: number;
  };
  expenseDetails: {
    operating: number;
    cogs: number;
  };
}
