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
];
