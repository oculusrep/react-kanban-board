/**
 * CFO Agent Tools
 *
 * Financial data retrieval tools for the CFO Agent.
 * These tools are called by Claude to gather data for analysis.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MonthlyPaymentForecast {
  month: string;
  monthIndex: number;
  invoiced: number;
  pipeline: number;
  contingent: number;
  total: number;
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
  count: number;
}

export interface InvoiceAgingSummary {
  total_receivables: number;
  current: number;
  overdue_1_30: number;
  overdue_31_60: number;
  overdue_61_90: number;
  overdue_90_plus: number;
  invoices?: Array<{
    invoice_number: string | null;
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

export interface MikePersonalForecast {
  month: string;
  monthIndex: number;
  // Gross amounts
  grossCommission: number;
  houseProfit: number;
  totalGross: number;
  // Tax withholdings (from commission only - W2 wages)
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  totalTaxes: number;
  // Net amounts
  netCommission: number;
  // Combined take-home
  totalToMike: number;
  // YTD tracking
  ytdGrossWages: number;
  ytdSocialSecurityPaid: number;
  // 401k opportunity
  available401kRoom: number;
}

// Mike Minihan's broker ID
const MIKE_BROKER_ID = '38d4b67c-841d-4590-a909-523d3a4c6e4b';

// 2026 Tax Constants
// Blended average from actual pay stubs (02/10/2026 and 02/12/2026)
// Check 1: $7,730.45 gross → Federal 12.48%, GA 3.85%
// Check 2: $13,680.00 gross → Federal 17.14%, GA 4.43%
// Combined: $21,410.45 gross → Federal 15.46%, GA 4.22%
const TAX_CONFIG_2026 = {
  // Social Security
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 184500,

  // Medicare
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: 200000,

  // Georgia State Tax - blended effective rate from actual payroll
  // ($903.60 withheld on $21,410.45 = 4.22%)
  georgiaEffectiveWithholdingRate: 0.0422,

  // Federal Tax - blended effective rate from actual payroll
  // ($3,309.24 withheld on $21,410.45 = 15.46%)
  federalEffectiveWithholdingRate: 0.1546,

  // 401k
  max401k: 23500, // 2026 limit
};

// Stage IDs for deal classification (from CashFlowForecastPage)
const STAGE_IDS = {
  negotiatingLOI: '89b7ce02-d325-434a-8340-fab04fa57b8c',
  atLeasePSA: 'bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd',
  underContractContingent: '583507f5-1c53-474b-b7e6-deb81d1b89d2',
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
  lost: '0e318cd6-a738-400a-98af-741479585057',
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

// ============================================================================
// TOOL: GET PAYMENTS FORECAST
// ============================================================================

/**
 * Get expected payments by month with income categories.
 * Returns house net income after broker splits and referral fees.
 */
export async function getPaymentsForecast(
  supabase: SupabaseClient,
  year: number,
  includePipeline: boolean = false,
  includeContingent: boolean = false
): Promise<{ monthlyForecasts: MonthlyPaymentForecast[]; payments: PaymentDetail[] }> {
  // Fetch payments with deal info including house_percent
  const { data: paymentData, error } = await supabase
    .from('payment')
    .select(`
      id,
      deal_id,
      payment_name,
      payment_amount,
      referral_fee_usd,
      agci,
      payment_date_estimated,
      orep_invoice,
      deal:deal_id (
        id,
        deal_name,
        stage_id,
        house_percent,
        stage:stage_id (label)
      )
    `)
    .eq('is_active', true)
    .or('payment_received.eq.false,payment_received.is.null');

  if (error) throw new Error(`Failed to fetch payments: ${error.message}`);

  // Process payments - calculate house net income
  // GCI = Payment Amount - Referral Fee
  // AGCI = what goes to brokers (calculated by DB trigger)
  // House Net = GCI - AGCI (what house keeps)
  const processedPayments: PaymentDetail[] = (paymentData || [])
    .filter(p => {
      const deal = p.deal as Record<string, unknown>;
      if (deal?.stage_id === STAGE_IDS.lost) return false;
      if (!p.payment_date_estimated) return false;
      return true;
    })
    .map(p => {
      const deal = p.deal as Record<string, unknown>;
      const stageId = deal?.stage_id as string;

      let category: 'invoiced' | 'pipeline' | 'ucContingent' = 'invoiced';
      if ([STAGE_IDS.negotiatingLOI, STAGE_IDS.atLeasePSA].includes(stageId)) {
        category = 'pipeline';
      } else if (stageId === STAGE_IDS.underContractContingent) {
        category = 'ucContingent';
      }

      const paymentAmount = (p.payment_amount as number) || 0;
      const referralFee = (p.referral_fee_usd as number) || 0;
      const gci = paymentAmount - referralFee;
      const agci = (p.agci as number) || 0;
      const houseNet = gci - agci;
      const brokerSplits = agci;

      return {
        id: p.id,
        dealId: p.deal_id,
        dealName: (deal?.deal_name as string) || 'Unknown Deal',
        paymentName: p.payment_name || 'Payment',
        invoiceNumber: p.orep_invoice,
        paymentAmount,
        referralFee,
        brokerSplits,
        gci,
        houseNet,
        estimatedDate: p.payment_date_estimated,
        category,
        stageLabel: ((deal?.stage as Record<string, unknown>)?.label as string) || '',
      };
    });

  // Aggregate by month
  const monthlyForecasts: MonthlyPaymentForecast[] = [];

  for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
    const monthPayments = processedPayments.filter(p => {
      if (!p.estimatedDate) return false;
      const date = new Date(p.estimatedDate);
      return date.getFullYear() === year && date.getMonth() === monthIdx;
    });

    const invoiced = monthPayments
      .filter(p => p.category === 'invoiced')
      .reduce((sum, p) => sum + p.houseNet, 0);

    const pipeline = includePipeline
      ? monthPayments.filter(p => p.category === 'pipeline').reduce((sum, p) => sum + p.houseNet, 0)
      : 0;

    const contingent = includeContingent
      ? monthPayments.filter(p => p.category === 'ucContingent').reduce((sum, p) => sum + p.houseNet, 0)
      : 0;

    monthlyForecasts.push({
      month: MONTH_NAMES[monthIdx],
      monthIndex: monthIdx,
      invoiced,
      pipeline,
      contingent,
      total: invoiced + pipeline + contingent,
    });
  }

  return { monthlyForecasts, payments: processedPayments };
}

// ============================================================================
// TOOL: GET BUDGET DATA
// ============================================================================

/**
 * Get budgeted expenses by account for a specific year.
 */
export async function getBudgetData(
  supabase: SupabaseClient,
  year: number,
  accountTypes?: string[]
): Promise<AccountBudgetData[]> {
  // Fetch account budgets
  const { data: budgetData, error: budgetError } = await supabase
    .from('account_budget')
    .select('*')
    .eq('year', year);

  if (budgetError) throw new Error(`Failed to fetch budgets: ${budgetError.message}`);

  // Fetch accounts for names and types
  let accountQuery = supabase
    .from('qb_account')
    .select('id, qb_account_id, name, account_type, fully_qualified_name')
    .eq('active', true);

  if (accountTypes && accountTypes.length > 0) {
    accountQuery = accountQuery.in('account_type', accountTypes);
  }

  const { data: accountData, error: accountError } = await accountQuery;
  if (accountError) throw new Error(`Failed to fetch accounts: ${accountError.message}`);

  const accountMap = new Map<string, { name: string; account_type: string }>();
  for (const acc of accountData || []) {
    accountMap.set(acc.qb_account_id, { name: acc.name, account_type: acc.account_type });
  }

  // Combine budget data with account info
  const result: AccountBudgetData[] = [];
  for (const budget of budgetData || []) {
    const account = accountMap.get(budget.qb_account_id);
    if (!account) continue; // Skip if account not found or filtered out

    const annualTotal = MONTH_KEYS.reduce((sum, key) => sum + (budget[key] || 0), 0);

    result.push({
      qb_account_id: budget.qb_account_id,
      account_name: account.name,
      account_type: account.account_type,
      year: budget.year,
      jan: budget.jan || 0,
      feb: budget.feb || 0,
      mar: budget.mar || 0,
      apr: budget.apr || 0,
      may: budget.may || 0,
      jun: budget.jun || 0,
      jul: budget.jul || 0,
      aug: budget.aug || 0,
      sep: budget.sep || 0,
      oct: budget.oct || 0,
      nov: budget.nov || 0,
      dec: budget.dec || 0,
      annual_total: annualTotal,
    });
  }

  return result;
}

// ============================================================================
// TOOL: GET EXPENSES BY PERIOD
// ============================================================================

/**
 * Get actual expenses from QuickBooks for a date range, grouped by account.
 */
export async function getExpensesByPeriod(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  accountType?: string
): Promise<ExpenseByPeriod[]> {
  let query = supabase
    .from('qb_expense')
    .select('id, account_id, account_name, amount, transaction_date')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate)
    .in('transaction_type', ['Purchase', 'Bill', 'Expense', 'Check', 'Credit Card Credit']);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch expenses: ${error.message}`);

  // Get account types
  const { data: accountData } = await supabase
    .from('qb_account')
    .select('qb_account_id, account_type')
    .eq('active', true);

  const accountTypeMap = new Map<string, string>();
  for (const acc of accountData || []) {
    accountTypeMap.set(acc.qb_account_id, acc.account_type);
  }

  // Group by account
  const grouped = new Map<string, { name: string; type: string; total: number; count: number }>();
  for (const expense of data || []) {
    const accType = accountTypeMap.get(expense.account_id) || 'Unknown';

    // Filter by account type if specified
    if (accountType && accType !== accountType) continue;

    const key = expense.account_id;
    const existing = grouped.get(key);
    if (existing) {
      existing.total += Math.abs(expense.amount || 0);
      existing.count += 1;
    } else {
      grouped.set(key, {
        name: expense.account_name || 'Unknown',
        type: accType,
        total: Math.abs(expense.amount || 0),
        count: 1,
      });
    }
  }

  return Array.from(grouped.entries()).map(([id, data]) => ({
    account_id: id,
    account_name: data.name,
    account_type: data.type,
    total: data.total,
    count: data.count,
  }));
}

// ============================================================================
// TOOL: GET INVOICE AGING
// ============================================================================

/**
 * Get accounts receivable aging summary.
 */
export async function getInvoiceAging(
  supabase: SupabaseClient,
  includeDetails: boolean = false
): Promise<InvoiceAgingSummary> {
  // Query the invoice_aging view
  const { data, error } = await supabase
    .from('invoice_aging')
    .select('*');

  if (error) throw new Error(`Failed to fetch invoice aging: ${error.message}`);

  // Aggregate by bucket
  const summary: InvoiceAgingSummary = {
    total_receivables: 0,
    current: 0,
    overdue_1_30: 0,
    overdue_31_60: 0,
    overdue_61_90: 0,
    overdue_90_plus: 0,
    invoices: includeDetails ? [] : undefined,
  };

  for (const invoice of data || []) {
    const amount = invoice.payment_amount || 0;
    summary.total_receivables += amount;

    switch (invoice.aging_bucket) {
      case 'current':
        summary.current += amount;
        break;
      case '1-30 days':
        summary.overdue_1_30 += amount;
        break;
      case '31-60 days':
        summary.overdue_31_60 += amount;
        break;
      case '61-90 days':
        summary.overdue_61_90 += amount;
        break;
      case '90+ days':
        summary.overdue_90_plus += amount;
        break;
    }

    if (includeDetails) {
      summary.invoices!.push({
        invoice_number: invoice.orep_invoice,
        client_name: invoice.client_name,
        deal_name: invoice.deal_name,
        amount: amount,
        due_date: invoice.due_date,
        days_overdue: invoice.days_overdue,
        aging_bucket: invoice.aging_bucket,
      });
    }
  }

  return summary;
}

// ============================================================================
// TOOL: GET CASH FLOW PROJECTION
// ============================================================================

/**
 * Calculate projected cash flow: income minus expenses by month.
 * Returns running balance.
 */
export async function getCashFlowProjection(
  supabase: SupabaseClient,
  year: number,
  startingBalance: number = 0,
  includePipeline: boolean = false,
  includeContingent: boolean = false,
  monthsToProject?: number
): Promise<CashFlowProjection[]> {
  // Get income from payments
  const { monthlyForecasts: incomeForecasts } = await getPaymentsForecast(
    supabase,
    year,
    includePipeline,
    includeContingent
  );

  // Get expense budgets
  const budgets = await getBudgetData(supabase, year, ['Expense', 'Other Expense', 'Cost of Goods Sold']);

  // Calculate expense budgets by month and type
  const expensesByMonth: { cogs: number; operating: number }[] = Array.from({ length: 12 }, () => ({
    cogs: 0,
    operating: 0,
  }));

  for (const budget of budgets) {
    const isCogs = budget.account_type === 'Cost of Goods Sold';
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const monthKey = MONTH_KEYS[monthIdx];
      const budgetAmount = budget[monthKey] || 0;
      if (isCogs) {
        expensesByMonth[monthIdx].cogs += budgetAmount;
      } else {
        expensesByMonth[monthIdx].operating += budgetAmount;
      }
    }
  }

  // Build cash flow projections
  const projections: CashFlowProjection[] = [];
  let runningBalance = startingBalance;

  // Determine how many months to include
  const currentMonth = new Date().getMonth();
  const numMonths = monthsToProject || 12;
  const startMonth = monthsToProject ? currentMonth : 0;

  for (let i = 0; i < numMonths && startMonth + i < 12; i++) {
    const monthIdx = startMonth + i;
    const income = incomeForecasts[monthIdx];
    const expenses = expensesByMonth[monthIdx];

    const totalExpenses = expenses.cogs + expenses.operating;
    const net = income.total - totalExpenses;
    runningBalance += net;

    projections.push({
      month: MONTH_NAMES[monthIdx],
      monthIndex: monthIdx,
      income: income.total,
      expenses: totalExpenses,
      net,
      runningBalance,
      incomeDetails: {
        invoiced: income.invoiced,
        pipeline: income.pipeline,
        contingent: income.contingent,
      },
      expenseDetails: {
        operating: expenses.operating,
        cogs: expenses.cogs,
      },
    });
  }

  return projections;
}

// ============================================================================
// TOOL: GET MIKE PERSONAL FORECAST (Reality Check)
// ============================================================================

/**
 * Calculate federal income tax withholding.
 * Uses effective rate calibrated from actual payroll (12.48%).
 */
function calculateFederalWithholding(monthlyGrossWages: number): number {
  const federalTax = monthlyGrossWages * TAX_CONFIG_2026.federalEffectiveWithholdingRate;
  return Math.round(federalTax * 100) / 100;
}

/**
 * Calculate Georgia state tax withholding.
 * Uses effective rate calibrated from actual payroll (3.85%).
 */
function calculateGeorgiaWithholding(monthlyGrossWages: number): number {
  const stateTax = monthlyGrossWages * TAX_CONFIG_2026.georgiaEffectiveWithholdingRate;
  return Math.round(stateTax * 100) / 100;
}

/**
 * Calculate Social Security withholding with wage base tracking.
 */
function calculateSocialSecurity(
  monthlyGrossWages: number,
  ytdSocialSecurityWages: number
): number {
  const wageBase = TAX_CONFIG_2026.socialSecurityWageBase;

  // Check if we've already hit the cap
  if (ytdSocialSecurityWages >= wageBase) {
    return 0;
  }

  // Calculate how much of this month's wages are subject to SS
  const remainingWageBase = wageBase - ytdSocialSecurityWages;
  const taxableWages = Math.min(monthlyGrossWages, remainingWageBase);

  const ssTax = taxableWages * TAX_CONFIG_2026.socialSecurityRate;
  return Math.round(ssTax * 100) / 100;
}

/**
 * Calculate Medicare withholding including additional Medicare tax.
 */
function calculateMedicare(
  monthlyGrossWages: number,
  ytdGrossWages: number
): number {
  const threshold = TAX_CONFIG_2026.additionalMedicareThreshold;

  // Base Medicare
  let medicareTax = monthlyGrossWages * TAX_CONFIG_2026.medicareRate;

  // Additional Medicare on wages over $200k
  if (ytdGrossWages + monthlyGrossWages > threshold) {
    const wagesOverThreshold = Math.max(0,
      Math.min(monthlyGrossWages, ytdGrossWages + monthlyGrossWages - threshold)
    );
    medicareTax += wagesOverThreshold * TAX_CONFIG_2026.additionalMedicareRate;
  }

  return Math.round(medicareTax * 100) / 100;
}

/**
 * Get Mike Minihan's personal forecast: commission + house profit.
 * This is the "Reality Check" report.
 */
export async function getMikePersonalForecast(
  supabase: SupabaseClient,
  year: number,
  monthsToProject?: number
): Promise<MikePersonalForecast[]> {
  const currentMonth = new Date().getMonth();

  // Get Mike's broker splits from payment_split table
  const { data: paymentSplits, error: splitError } = await supabase
    .from('payment_split')
    .select(`
      id,
      payment_id,
      broker_id,
      split_broker_total,
      payment:payment_id (
        id,
        payment_amount,
        payment_date_estimated,
        payment_received,
        deal_id,
        deal:deal_id (
          id,
          deal_name,
          stage_id
        )
      )
    `)
    .eq('broker_id', MIKE_BROKER_ID);

  if (splitError) throw new Error(`Failed to fetch payment splits: ${splitError.message}`);

  // Get house net income (for house profit calculation)
  const { monthlyForecasts: houseForecasts } = await getPaymentsForecast(
    supabase,
    year,
    false, // Don't include pipeline for conservative estimate
    false  // Don't include contingent
  );

  // Get budgeted expenses for house profit calculation
  const budgets = await getBudgetData(supabase, year, ['Expense', 'Other Expense']);

  // Calculate monthly operating expenses (excluding COGS)
  const monthlyExpenses: number[] = Array(12).fill(0);
  for (const budget of budgets) {
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const monthKey = MONTH_KEYS[monthIdx];
      monthlyExpenses[monthIdx] += budget[monthKey] || 0;
    }
  }

  // Aggregate Mike's commissions by month
  const mikeCommissionsByMonth: number[] = Array(12).fill(0);

  for (const split of paymentSplits || []) {
    const payment = split.payment as Record<string, unknown>;
    if (!payment) continue;

    const deal = payment.deal as Record<string, unknown>;
    if (!deal) continue;

    // Skip lost deals
    if (deal.stage_id === STAGE_IDS.lost) continue;

    // Skip already received payments for future forecast
    if (payment.payment_received === true) continue;

    const estimatedDate = payment.payment_date_estimated as string;
    if (!estimatedDate) continue;

    const date = new Date(estimatedDate);
    if (date.getFullYear() !== year) continue;

    const monthIdx = date.getMonth();
    mikeCommissionsByMonth[monthIdx] += (split.split_broker_total as number) || 0;
  }

  // Build the forecast with tax calculations
  const forecasts: MikePersonalForecast[] = [];
  let ytdGrossWages = 0;
  let ytdSocialSecurityPaid = 0;
  let ytd401kContributed = 0; // Would need to track actual contributions

  const numMonths = monthsToProject || 12;
  const startMonth = monthsToProject ? currentMonth : 0;

  for (let i = 0; i < numMonths && startMonth + i < 12; i++) {
    const monthIdx = startMonth + i;

    const grossCommission = Math.round(mikeCommissionsByMonth[monthIdx] * 100) / 100;

    // House profit = House Net Income - Operating Expenses
    const houseNetIncome = houseForecasts[monthIdx]?.total || 0;
    const houseOperatingExpenses = monthlyExpenses[monthIdx];
    const houseProfit = Math.max(0, Math.round((houseNetIncome - houseOperatingExpenses) * 100) / 100);

    const totalGross = grossCommission + houseProfit;

    // Calculate taxes (only on W2 commission wages)
    const federalTax = calculateFederalWithholding(grossCommission);
    const stateTax = calculateGeorgiaWithholding(grossCommission);
    const socialSecurity = calculateSocialSecurity(grossCommission, ytdGrossWages);
    const medicare = calculateMedicare(grossCommission, ytdGrossWages);

    const totalTaxes = federalTax + stateTax + socialSecurity + medicare;
    const netCommission = grossCommission - totalTaxes;

    // Total to Mike = Net Commission + House Profit (house profit is owner's draw, no withholding)
    const totalToMike = netCommission + houseProfit;

    // Update YTD trackers
    ytdGrossWages += grossCommission;
    ytdSocialSecurityPaid += socialSecurity;

    // 401k room remaining
    const available401kRoom = Math.max(0, TAX_CONFIG_2026.max401k - ytd401kContributed);

    forecasts.push({
      month: MONTH_NAMES[monthIdx],
      monthIndex: monthIdx,
      grossCommission,
      houseProfit,
      totalGross,
      federalTax,
      stateTax,
      socialSecurity,
      medicare,
      totalTaxes,
      netCommission,
      totalToMike,
      ytdGrossWages,
      ytdSocialSecurityPaid,
      available401kRoom,
    });
  }

  return forecasts;
}

// ============================================================================
// TOOL: GET DEAL PIPELINE (Deal Data Visibility)
// ============================================================================

export interface DealPipelineItem {
  deal_id: string;
  deal_name: string;
  stage_label: string;
  stage_id: string;
  deal_value: number | null;
  fee: number | null;
  house_percent: number | null;
  house_usd: number | null;
  number_of_payments: number | null;
  client_name: string | null;
  booked_date: string | null;
  closed_date: string | null;
  payments: Array<{
    payment_id: string;
    payment_name: string | null;
    payment_amount: number | null;
    payment_date_estimated: string | null;
    payment_received: boolean;
    payment_received_date: string | null;
    invoice_sent: boolean;
    orep_invoice: string | null;
    splits: Array<{
      broker_name: string;
      broker_total: number | null;
      paid: boolean;
    }>;
  }>;
  issues: string[];
}

export interface DealPipelineResult {
  deals: DealPipelineItem[];
  summary: {
    total_deals: number;
    by_stage: Record<string, number>;
    deals_missing_payments: number;
    deals_missing_payment_dates: number;
    total_pipeline_value: number;
  };
}

/**
 * Get deal pipeline data with payment and split information.
 * Identifies deals missing payments or payment dates.
 */
export async function getDealPipeline(
  supabase: SupabaseClient,
  stageFilter?: string,
  includeClosedPaid?: boolean
): Promise<DealPipelineResult> {
  // Get all stages for labeling
  const { data: stages, error: stageError } = await supabase
    .from('deal_stage')
    .select('id, label');

  if (stageError) throw new Error(`Failed to fetch stages: ${stageError.message}`);

  const stageMap = new Map<string, string>();
  for (const s of stages || []) {
    stageMap.set(s.id, s.label);
  }

  // Build deal query
  let dealQuery = supabase
    .from('deal')
    .select(`
      id,
      deal_name,
      stage_id,
      deal_value,
      fee,
      house_percent,
      house_usd,
      number_of_payments,
      booked_date,
      closed_date,
      client:client_id (
        id,
        client_name
      )
    `);

  // Filter by stage if specified
  if (stageFilter) {
    // Find stage ID by label (case-insensitive partial match)
    const matchingStageId = Array.from(stageMap.entries())
      .find(([_, label]) => label.toLowerCase().includes(stageFilter.toLowerCase()))?.[0];

    if (matchingStageId) {
      dealQuery = dealQuery.eq('stage_id', matchingStageId);
    }
  }

  // Exclude closed/paid and lost unless specifically requested
  if (!includeClosedPaid) {
    dealQuery = dealQuery
      .not('stage_id', 'eq', STAGE_IDS.closedPaid)
      .not('stage_id', 'eq', STAGE_IDS.lost);
  }

  const { data: deals, error: dealError } = await dealQuery;
  if (dealError) throw new Error(`Failed to fetch deals: ${dealError.message}`);

  // Get all payments for these deals
  const dealIds = (deals || []).map(d => d.id);

  // Handle empty dealIds array - Supabase .in() fails with empty array
  let payments: Array<{
    id: string;
    deal_id: string;
    payment_name: string | null;
    payment_amount: number | null;
    payment_date_estimated: string | null;
    payment_received: boolean | null;
    payment_received_date: string | null;
    invoice_sent: boolean | null;
    orep_invoice: string | null;
  }> = [];

  if (dealIds.length > 0) {
    const { data: paymentData, error: paymentError } = await supabase
      .from('payment')
      .select(`
        id,
        deal_id,
        payment_name,
        payment_amount,
        payment_date_estimated,
        payment_received,
        payment_received_date,
        invoice_sent,
        orep_invoice
      `)
      .in('deal_id', dealIds);

    if (paymentError) throw new Error(`Failed to fetch payments: ${paymentError.message}`);
    payments = (paymentData || []) as typeof payments;
  }

  // Get payment splits
  const paymentIds = payments.map(p => p.id);

  let splits: Array<{
    id: string;
    payment_id: string;
    split_broker_total: number | null;
    paid: boolean | null;
    broker: { id: string; name: string } | null;
  }> = [];

  if (paymentIds.length > 0) {
    const { data: splitData, error: splitError } = await supabase
      .from('payment_split')
      .select(`
        id,
        payment_id,
        split_broker_total,
        paid,
        broker:broker_id (
          id,
          name
        )
      `)
      .in('payment_id', paymentIds);

    if (splitError) throw new Error(`Failed to fetch splits: ${splitError.message}`);
    splits = (splitData || []) as typeof splits;
  }

  // Group payments by deal
  const paymentsByDeal = new Map<string, typeof payments>();
  for (const p of payments) {
    const existing = paymentsByDeal.get(p.deal_id) || [];
    existing.push(p);
    paymentsByDeal.set(p.deal_id, existing);
  }

  // Group splits by payment
  const splitsByPayment = new Map<string, typeof splits>();
  for (const s of splits) {
    const existing = splitsByPayment.get(s.payment_id) || [];
    existing.push(s);
    splitsByPayment.set(s.payment_id, existing);
  }

  // Build result with issues detection
  const result: DealPipelineItem[] = [];
  let dealsMissingPayments = 0;
  let dealsMissingPaymentDates = 0;
  const byStage: Record<string, number> = {};
  let totalPipelineValue = 0;

  for (const deal of deals || []) {
    const stageLabel = stageMap.get(deal.stage_id) || 'Unknown';
    byStage[stageLabel] = (byStage[stageLabel] || 0) + 1;

    const dealPayments = paymentsByDeal.get(deal.id) || [];
    const issues: string[] = [];

    // Check for missing payments
    const expectedPayments = deal.number_of_payments || 1;
    if (dealPayments.length === 0) {
      issues.push('No payments created');
      dealsMissingPayments++;
    } else if (dealPayments.length < expectedPayments) {
      issues.push(`Only ${dealPayments.length} of ${expectedPayments} payments created`);
    }

    // Check for missing payment dates
    let hasMissingDates = false;
    for (const p of dealPayments) {
      if (!p.payment_date_estimated && !p.payment_received) {
        hasMissingDates = true;
        issues.push(`Payment "${p.payment_name || 'unnamed'}" missing estimated date`);
      }
    }
    if (hasMissingDates) {
      dealsMissingPaymentDates++;
    }

    // Calculate pipeline value
    if (deal.fee) {
      totalPipelineValue += deal.fee;
    }

    // Build payment details with splits
    const paymentDetails = dealPayments.map(p => {
      const paymentSplits = splitsByPayment.get(p.id) || [];
      return {
        payment_id: p.id,
        payment_name: p.payment_name,
        payment_amount: p.payment_amount,
        payment_date_estimated: p.payment_date_estimated,
        payment_received: p.payment_received || false,
        payment_received_date: p.payment_received_date,
        invoice_sent: p.invoice_sent || false,
        orep_invoice: p.orep_invoice,
        splits: paymentSplits.map(s => ({
          broker_name: (s.broker as { name: string })?.name || 'Unknown',
          broker_total: s.split_broker_total,
          paid: s.paid || false,
        })),
      };
    });

    result.push({
      deal_id: deal.id,
      deal_name: deal.deal_name || 'Unnamed Deal',
      stage_label: stageLabel,
      stage_id: deal.stage_id,
      deal_value: deal.deal_value,
      fee: deal.fee,
      house_percent: deal.house_percent,
      house_usd: deal.house_usd,
      number_of_payments: deal.number_of_payments,
      client_name: (deal.client as { client_name: string })?.client_name || null,
      booked_date: deal.booked_date,
      closed_date: deal.closed_date,
      payments: paymentDetails,
      issues,
    });
  }

  return {
    deals: result,
    summary: {
      total_deals: result.length,
      by_stage: byStage,
      deals_missing_payments: dealsMissingPayments,
      deals_missing_payment_dates: dealsMissingPaymentDates,
      total_pipeline_value: totalPipelineValue,
    },
  };
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface FinancialContext {
  id: string;
  context_type: string;
  entity_type: string | null;
  entity_id: string | null;
  context_text: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// TOOL: GET FINANCIAL CONTEXT
// ============================================================================

/**
 * Retrieve saved context notes for the CFO agent.
 */
export async function getFinancialContext(
  supabase: SupabaseClient,
  contextType?: string
): Promise<FinancialContext[]> {
  let query = supabase
    .from('ai_financial_context')
    .select('*')
    .order('created_at', { ascending: false });

  if (contextType) {
    query = query.eq('context_type', contextType);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch context: ${error.message}`);

  return (data || []) as FinancialContext[];
}

// ============================================================================
// TOOL: SAVE FINANCIAL CONTEXT
// ============================================================================

/**
 * Save a new context note for the CFO agent to remember.
 */
export async function saveFinancialContext(
  supabase: SupabaseClient,
  contextType: string,
  contextText: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<{ id: string; success: boolean }> {
  const { data, error } = await supabase
    .from('ai_financial_context')
    .insert({
      context_type: contextType,
      context_text: contextText,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: metadata || {},
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save context: ${error.message}`);

  return { id: data.id, success: true };
}

// ============================================================================
// TOOL: DELETE FINANCIAL CONTEXT
// ============================================================================

/**
 * Delete a context note by ID or by matching text.
 */
export async function deleteFinancialContext(
  supabase: SupabaseClient,
  contextId?: string,
  searchText?: string
): Promise<{ deleted_count: number; success: boolean }> {
  let query = supabase.from('ai_financial_context').delete();

  if (contextId) {
    query = query.eq('id', contextId);
  } else if (searchText) {
    query = query.ilike('context_text', `%${searchText}%`);
  } else {
    throw new Error('Either contextId or searchText must be provided');
  }

  const { data, error } = await query.select('id');
  if (error) throw new Error(`Failed to delete context: ${error.message}`);

  return { deleted_count: data?.length || 0, success: true };
}

// ============================================================================
// TOOL DEFINITIONS FOR CLAUDE
// ============================================================================

export const CFO_TOOL_DEFINITIONS = [
  {
    name: 'get_payments_forecast',
    description:
      'Get expected payments by month with income categories (invoiced, pipeline, contingent). Returns house net income after broker splits and referral fees. Use this to understand expected revenue.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' as const, description: 'Year to forecast (e.g., 2026)' },
        include_pipeline: {
          type: 'boolean' as const,
          description: 'Include pipeline deals (negotiating LOI, at lease/PSA). Default false.',
        },
        include_contingent: {
          type: 'boolean' as const,
          description: 'Include under contract/contingent deals. Default false.',
        },
      },
      required: ['year'],
    },
  },
  {
    name: 'get_budget_data',
    description:
      'Get budgeted expenses by account for a specific year. Returns monthly budget amounts for each account.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' as const, description: 'Budget year (e.g., 2026)' },
        account_types: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description:
            'Filter by account types: "Expense", "Other Expense", "Cost of Goods Sold". If not specified, returns all.',
        },
      },
      required: ['year'],
    },
  },
  {
    name: 'get_expenses_by_period',
    description:
      'Get actual expenses from QuickBooks for a date range, grouped by account. Use this to compare actual vs budget.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: { type: 'string' as const, description: 'Start date in ISO format YYYY-MM-DD' },
        end_date: { type: 'string' as const, description: 'End date in ISO format YYYY-MM-DD' },
        account_type: {
          type: 'string' as const,
          description: 'Optional filter by account type (e.g., "Expense")',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_invoice_aging',
    description:
      'Get accounts receivable aging summary. Shows overdue invoices by aging bucket (current, 1-30, 31-60, 61-90, 90+ days).',
    input_schema: {
      type: 'object' as const,
      properties: {
        include_details: {
          type: 'boolean' as const,
          description: 'Include individual invoice details. Default false.',
        },
      },
    },
  },
  {
    name: 'get_cash_flow_projection',
    description:
      'Calculate projected cash flow: income minus expenses by month. Returns running balance. This is the key tool for "what will the balance be" type questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' as const, description: 'Year for projection (e.g., 2026)' },
        starting_balance: {
          type: 'number' as const,
          description: 'Starting cash balance. Default 0.',
        },
        include_pipeline: {
          type: 'boolean' as const,
          description: 'Include pipeline deal revenue. Default false.',
        },
        include_contingent: {
          type: 'boolean' as const,
          description: 'Include contingent deal revenue. Default false.',
        },
        months_to_project: {
          type: 'number' as const,
          description: 'Number of months to project from current month. If not specified, returns full year.',
        },
      },
      required: ['year'],
    },
  },
  {
    name: 'generate_chart',
    description:
      'Generate a chart specification for the frontend to render. Use this after gathering data to visualize results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chart_type: {
          type: 'string' as const,
          enum: ['bar', 'line', 'area', 'composed', 'stacked_bar'],
          description: 'Type of chart to generate',
        },
        title: { type: 'string' as const, description: 'Chart title' },
        data: {
          type: 'array' as const,
          items: { type: 'object' as const },
          description: 'Array of data points with named properties',
        },
        x_axis: { type: 'string' as const, description: 'Property name for X axis' },
        series: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              dataKey: { type: 'string' as const, description: 'Data property to plot' },
              name: { type: 'string' as const, description: 'Display name for legend' },
              color: { type: 'string' as const, description: 'Hex color (e.g., "#22c55e")' },
              type: {
                type: 'string' as const,
                enum: ['bar', 'line', 'area'],
                description: 'Series type (for composed charts)',
              },
            },
            required: ['dataKey', 'name', 'color'],
          },
          description: 'Data series to plot',
        },
        y_axis_format: {
          type: 'string' as const,
          enum: ['currency', 'number', 'percent'],
          description: 'Format for Y axis values',
        },
      },
      required: ['chart_type', 'title', 'data', 'x_axis', 'series', 'y_axis_format'],
    },
  },
  {
    name: 'get_financial_context',
    description:
      'Retrieve saved context notes that contain business knowledge, corrections, and rules. Always call this at the start of a conversation to get relevant context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_type: {
          type: 'string' as const,
          enum: ['business_rule', 'correction', 'seasonal_pattern', 'client_note', 'vendor_note', 'budget_note'],
          description: 'Optional filter by context type. If not specified, returns all context.',
        },
      },
    },
  },
  {
    name: 'save_financial_context',
    description:
      'Save a new context note for the CFO agent to remember. Use this when the user tells you to remember something or when you learn a correction.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_type: {
          type: 'string' as const,
          enum: ['business_rule', 'correction', 'seasonal_pattern', 'client_note', 'vendor_note', 'budget_note'],
          description: 'Type of context being saved',
        },
        context_text: {
          type: 'string' as const,
          description: 'The context note to save (natural language)',
        },
        entity_type: {
          type: 'string' as const,
          description: 'Optional entity type this context relates to (e.g., "client", "account", "vendor")',
        },
        entity_id: {
          type: 'string' as const,
          description: 'Optional entity ID this context relates to',
        },
      },
      required: ['context_type', 'context_text'],
    },
  },
  {
    name: 'delete_financial_context',
    description:
      'Delete a saved context note. Use this when the user asks you to forget something.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_id: {
          type: 'string' as const,
          description: 'The ID of the context note to delete',
        },
        search_text: {
          type: 'string' as const,
          description: 'Alternative: search for context notes containing this text and delete them',
        },
      },
    },
  },
  {
    name: 'get_mike_personal_forecast',
    description:
      'Get Mike Minihan\'s personal cash flow forecast - the "Reality Check" report. Shows commission (W2 wages) with payroll tax withholdings, plus house profit (owner\'s draw). Use this when asked about "reality check", "when am I getting paid", "Mike\'s income", or personal cash flow. Returns monthly breakdown with gross commission, taxes withheld (federal, GA state, SS, Medicare), net commission, house profit, and total take-home.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: {
          type: 'number' as const,
          description: 'Year for forecast (e.g., 2026)',
        },
        months_to_project: {
          type: 'number' as const,
          description: 'Number of months from current month. If not specified, returns full year.',
        },
      },
      required: ['year'],
    },
  },
  {
    name: 'get_deal_pipeline',
    description:
      'Get deal pipeline data with payment and split information. Shows all active deals with their stages, payments, and broker splits. Identifies issues like deals missing payments or payment dates. Use this when asked about deal status, pipeline health, missing payments, or deal data quality. Supports filtering by stage name (e.g., "Negotiating LOI", "Booked", "At Lease").',
    input_schema: {
      type: 'object' as const,
      properties: {
        stage_filter: {
          type: 'string' as const,
          description: 'Filter by stage name (partial match, case-insensitive). Examples: "Negotiating LOI", "Booked", "At Lease", "Executed"',
        },
        include_closed_paid: {
          type: 'boolean' as const,
          description: 'Include closed/paid deals in results. Default false (excludes closed/paid and lost deals).',
        },
      },
    },
  },
];
