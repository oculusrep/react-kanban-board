/**
 * Bookkeeper Agent Tools
 *
 * Tool implementations for the AI Bookkeeper assistant.
 * Provides access to QBO chart of accounts, transaction search,
 * and journal entry drafting capabilities.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  getQBConnection,
  refreshTokenIfNeeded,
  createJournalEntry,
  createBill,
  findOrCreateVendor,
  qbApiRequest,
  QBConnection,
  QBJournalEntry,
  QBJournalEntryLine,
  QBBill,
  QBBillLine,
} from './quickbooks.ts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface QBAccount {
  id: string;
  qb_account_id: string;
  name: string;
  account_type: string;
  account_sub_type: string | null;
  fully_qualified_name: string;
  active: boolean;
  current_balance: number | null;
}

export interface JournalEntryLine {
  line_number: number;
  posting_type: 'Debit' | 'Credit';
  account_id: string;
  account_name: string;
  amount: number;
  description?: string;
  entity_type?: 'Vendor' | 'Customer';
  entity_name?: string;
}

export interface JournalEntryDraft {
  transaction_date: string;
  description: string;
  lines: JournalEntryLine[];
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
  memo?: string;
  warnings?: string[];
}

export interface AccountSuggestion {
  account_id: string;
  account_name: string;
  account_type: string;
  reason: string;
}

export interface AccountingContext {
  id: string;
  context_type: string;
  context_text: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export interface BrokerDrawBalance {
  broker_id: string;
  broker_name: string;
  qb_account_id: string;
  qb_account_name: string;
  current_balance: number;
  total_draws: number;
  total_commissions: number;
  as_of_date: string;
}

export interface CreateQBOEntryResult {
  success: boolean;
  qb_entity_id: string;
  qb_entity_type: 'JournalEntry' | 'Bill';
  qb_doc_number?: string;
  amount: number;
  message: string;
}

// ============================================================================
// TOOL: GET CHART OF ACCOUNTS
// ============================================================================

export async function getChartOfAccounts(
  supabase: SupabaseClient,
  accountType?: string,
  search?: string,
  activeOnly: boolean = true
): Promise<QBAccount[]> {
  let query = supabase
    .from('qb_account')
    .select('id, qb_account_id, name, account_type, account_sub_type, fully_qualified_name, active, current_balance')
    .order('fully_qualified_name');

  if (activeOnly) {
    query = query.eq('active', true);
  }

  if (accountType) {
    query = query.eq('account_type', accountType);
  }

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);

  return (data || []) as QBAccount[];
}

// ============================================================================
// TOOL: SEARCH RECENT TRANSACTIONS
// ============================================================================

export async function searchRecentTransactions(
  supabase: SupabaseClient,
  daysBack: number = 30,
  accountId?: string,
  searchText?: string
): Promise<Array<{
  id: string;
  transaction_date: string;
  vendor_name: string | null;
  amount: number;
  account_name: string;
  memo: string | null;
}>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  let query = supabase
    .from('qb_expense')
    .select('id, transaction_date, vendor_name, amount, account_name, memo')
    .gte('transaction_date', startDate.toISOString().split('T')[0])
    .order('transaction_date', { ascending: false })
    .limit(50);

  if (accountId) {
    query = query.eq('qb_account_id', accountId);
  }

  if (searchText) {
    query = query.or(`memo.ilike.%${searchText}%,vendor_name.ilike.%${searchText}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to search transactions: ${error.message}`);

  return data || [];
}

// ============================================================================
// TOOL: DRAFT JOURNAL ENTRY
// ============================================================================

export function draftJournalEntry(
  description: string,
  transactionDate: string,
  lines: Array<{
    account_id: string;
    account_name: string;
    debit?: number;
    credit?: number;
    description?: string;
    entity_name?: string;
  }>,
  memo?: string
): JournalEntryDraft {
  const journalLines: JournalEntryLine[] = [];
  let totalDebits = 0;
  let totalCredits = 0;
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    if (line.debit && line.debit > 0) {
      journalLines.push({
        line_number: index + 1,
        posting_type: 'Debit',
        account_id: line.account_id,
        account_name: line.account_name,
        amount: line.debit,
        description: line.description,
        entity_name: line.entity_name,
      });
      totalDebits += line.debit;
    }

    if (line.credit && line.credit > 0) {
      journalLines.push({
        line_number: index + 1,
        posting_type: 'Credit',
        account_id: line.account_id,
        account_name: line.account_name,
        amount: line.credit,
        description: line.description,
        entity_name: line.entity_name,
      });
      totalCredits += line.credit;
    }
  });

  // Round to avoid floating point issues
  totalDebits = Math.round(totalDebits * 100) / 100;
  totalCredits = Math.round(totalCredits * 100) / 100;

  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  if (!isBalanced) {
    warnings.push(`Entry is NOT balanced. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
  }

  // Check for common issues
  const expenseAccounts = journalLines.filter(l =>
    l.account_name.toLowerCase().includes('expense') && l.posting_type === 'Debit'
  );
  if (expenseAccounts.length > 0) {
    warnings.push('This entry includes expense account debits - this will increase expenses on the P&L.');
  }

  const liabilityCredits = journalLines.filter(l =>
    (l.account_name.toLowerCase().includes('payable') ||
     l.account_name.toLowerCase().includes('liability') ||
     l.account_name.toLowerCase().includes('due to')) &&
    l.posting_type === 'Credit'
  );
  if (liabilityCredits.length > 0) {
    warnings.push('This entry increases liabilities on the Balance Sheet.');
  }

  return {
    transaction_date: transactionDate,
    description,
    lines: journalLines,
    total_debits: totalDebits,
    total_credits: totalCredits,
    is_balanced: isBalanced,
    memo,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================================================
// TOOL: GET ACCOUNTING CONTEXT
// ============================================================================

export async function getAccountingContext(
  supabase: SupabaseClient,
  contextType?: 'accounting_rule' | 'account_mapping' | 'correction'
): Promise<AccountingContext[]> {
  let query = supabase
    .from('ai_financial_context')
    .select('id, context_type, context_text, entity_type, entity_id, created_at')
    .order('created_at', { ascending: false });

  if (contextType) {
    query = query.eq('context_type', contextType);
  } else {
    // Default to bookkeeper-relevant context types
    query = query.in('context_type', ['accounting_rule', 'account_mapping', 'correction']);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch context: ${error.message}`);

  return (data || []) as AccountingContext[];
}

// ============================================================================
// TOOL: SAVE ACCOUNTING CONTEXT
// ============================================================================

export async function saveAccountingContext(
  supabase: SupabaseClient,
  contextType: 'accounting_rule' | 'account_mapping',
  contextText: string,
  entityType?: string,
  entityId?: string
): Promise<{ id: string; success: boolean }> {
  const { data, error } = await supabase
    .from('ai_financial_context')
    .insert({
      context_type: contextType,
      context_text: contextText,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: {},
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to save context: ${error.message}`);

  return { id: data.id, success: true };
}

// ============================================================================
// TOOL: EXPLAIN ACCOUNTING TREATMENT
// ============================================================================

export function explainAccountingTreatment(scenario: string): {
  explanation: string;
  typical_accounts: Array<{ account_type: string; role: string }>;
  example_entry: JournalEntryDraft | null;
} {
  // Common scenarios with explanations
  const scenarios: Record<string, {
    explanation: string;
    typical_accounts: Array<{ account_type: string; role: string }>;
    example_entry: JournalEntryDraft | null;
  }> = {
    'line of credit payment': {
      explanation: `When paying on a line of credit, the payment typically has two components:
1. **Interest** - This is an expense (P&L impact) - debit Interest Expense
2. **Principal** - This reduces the liability (Balance Sheet only) - debit Line of Credit

The total payment amount comes from Cash (credit).`,
      typical_accounts: [
        { account_type: 'Expense', role: 'Interest Expense - P&L debit' },
        { account_type: 'Liability', role: 'Line of Credit - Balance Sheet debit (reduces liability)' },
        { account_type: 'Asset', role: 'Cash/Bank - Balance Sheet credit (reduces cash)' },
      ],
      example_entry: {
        transaction_date: new Date().toISOString().split('T')[0],
        description: 'Line of Credit Payment - Interest and Principal',
        lines: [
          { line_number: 1, posting_type: 'Debit', account_id: 'interest', account_name: 'Interest Expense', amount: 200 },
          { line_number: 2, posting_type: 'Debit', account_id: 'loc', account_name: 'Line of Credit', amount: 4800 },
          { line_number: 3, posting_type: 'Credit', account_id: 'cash', account_name: 'Cash - Operating', amount: 5000 },
        ],
        total_debits: 5000,
        total_credits: 5000,
        is_balanced: true,
      },
    },
    'commission draw': {
      explanation: `A commission draw is an advance to a broker against future earnings. Until earned:
1. It's an **Asset** to the company (money owed back) - debit "Due from Brokers"
2. Reduces Cash - credit Cash/Bank

When the broker earns commission that covers the draw:
1. Record the commission expense - debit Commission Expense
2. Clear the asset - credit "Due from Brokers"`,
      typical_accounts: [
        { account_type: 'Asset', role: 'Due from Brokers - Balance Sheet (receivable from broker)' },
        { account_type: 'Expense', role: 'Commission Expense - P&L (when earned)' },
        { account_type: 'Asset', role: 'Cash/Bank - Balance Sheet credit' },
      ],
      example_entry: {
        transaction_date: new Date().toISOString().split('T')[0],
        description: 'Commission Draw to Broker',
        lines: [
          { line_number: 1, posting_type: 'Debit', account_id: 'duefrom', account_name: 'Due from Brokers', amount: 2000 },
          { line_number: 2, posting_type: 'Credit', account_id: 'cash', account_name: 'Cash - Operating', amount: 2000 },
        ],
        total_debits: 2000,
        total_credits: 2000,
        is_balanced: true,
      },
    },
    'prepaid expense': {
      explanation: `Prepaid expenses are payments for future benefits (like annual insurance).
1. Initially record as **Asset** - debit Prepaid Expense
2. Reduce Cash - credit Cash/Bank

Then monthly, as you "use" the prepayment:
1. Recognize the expense - debit the Expense account
2. Reduce the prepaid asset - credit Prepaid Expense`,
      typical_accounts: [
        { account_type: 'Asset', role: 'Prepaid Expenses - Balance Sheet' },
        { account_type: 'Expense', role: 'Insurance Expense (or other) - P&L (amortized monthly)' },
        { account_type: 'Asset', role: 'Cash/Bank - Balance Sheet' },
      ],
      example_entry: null,
    },
    'expense reclassification': {
      explanation: `To move an expense from one account to another (fix a miscategorization):
1. **Debit** the correct account (where it should be)
2. **Credit** the incorrect account (where it was mistakenly posted)

This is a Balance Sheet-neutral entry that just moves the expense between P&L categories.`,
      typical_accounts: [
        { account_type: 'Expense', role: 'Correct Expense Account - debit' },
        { account_type: 'Expense', role: 'Incorrect Expense Account - credit' },
      ],
      example_entry: {
        transaction_date: new Date().toISOString().split('T')[0],
        description: 'Reclassify expense from Office Supplies to Marketing',
        lines: [
          { line_number: 1, posting_type: 'Debit', account_id: 'marketing', account_name: 'Marketing', amount: 500 },
          { line_number: 2, posting_type: 'Credit', account_id: 'office', account_name: 'Office Supplies', amount: 500 },
        ],
        total_debits: 500,
        total_credits: 500,
        is_balanced: true,
      },
    },
  };

  // Try to match the scenario
  const scenarioLower = scenario.toLowerCase();
  for (const [key, value] of Object.entries(scenarios)) {
    if (scenarioLower.includes(key) || key.includes(scenarioLower)) {
      return value;
    }
  }

  // Default generic response
  return {
    explanation: `For "${scenario}", consider:
- What accounts are affected?
- Is each account increasing or decreasing?
- Assets and Expenses increase with DEBITS
- Liabilities, Equity, and Revenue increase with CREDITS
- Total debits must equal total credits`,
    typical_accounts: [],
    example_entry: null,
  };
}

// ============================================================================
// TOOL: GET BROKER DRAW BALANCE
// ============================================================================

export async function getBrokerDrawBalance(
  supabase: SupabaseClient,
  brokerName: string
): Promise<BrokerDrawBalance> {
  // First, find the broker by name
  const { data: brokers, error: brokerError } = await supabase
    .from('broker')
    .select('id, name')
    .ilike('name', `%${brokerName}%`);

  if (brokerError) throw new Error(`Failed to find broker: ${brokerError.message}`);
  if (!brokers || brokers.length === 0) {
    throw new Error(`No broker found matching "${brokerName}"`);
  }

  const broker = brokers[0];

  // Get the commission mapping to find the draw account
  const { data: mapping, error: mappingError } = await supabase
    .from('qb_commission_mapping')
    .select(`
      id,
      broker_id,
      qb_credit_account_id,
      qb_credit_account_name,
      qb_vendor_id,
      qb_vendor_name
    `)
    .eq('broker_id', broker.id)
    .eq('payment_method', 'journal_entry')
    .eq('is_active', true)
    .single();

  if (mappingError || !mapping) {
    throw new Error(`No commission mapping found for ${broker.name}. Configure it in Settings > QuickBooks.`);
  }

  if (!mapping.qb_credit_account_id) {
    throw new Error(`${broker.name}'s commission mapping has no credit (draw) account configured.`);
  }

  // Get QBO connection
  let connection = await getQBConnection(supabase);
  if (!connection) {
    throw new Error('QuickBooks is not connected. Please connect in Settings.');
  }

  connection = await refreshTokenIfNeeded(supabase, connection);

  // Get account balance directly from QBO
  const accountResult = await qbApiRequest<{ Account: { CurrentBalance?: number; Name: string } }>(
    connection,
    'GET',
    `account/${mapping.qb_credit_account_id}`
  );

  const currentBalance = accountResult.Account.CurrentBalance || 0;

  // Get transaction summary from the GL report for the current year
  const today = new Date();
  const startDate = `${today.getFullYear()}-01-01`;
  const endDate = today.toISOString().split('T')[0];

  const reportQuery = new URLSearchParams({
    account: mapping.qb_credit_account_id,
    start_date: startDate,
    end_date: endDate,
    summarize_column_by: 'Total',
    columns: 'subt_nat_amount'
  });

  let totalDraws = 0;
  let totalCommissions = 0;

  try {
    const reportResult = await qbApiRequest<any>(
      connection,
      'GET',
      `reports/GeneralLedger?${reportQuery.toString()}`
    );

    // Parse the summary - look for totals
    if (reportResult?.Rows?.Row) {
      const rows = reportResult.Rows.Row;
      for (const row of rows) {
        if (row.Summary?.ColData) {
          for (const col of row.Summary.ColData) {
            if (col.value && typeof col.value === 'string') {
              const amount = parseFloat(col.value.replace(/[,$]/g, '')) || 0;
              // For draw accounts: negative = draws, positive = commissions
              if (amount > 0) {
                totalCommissions += amount;
              } else {
                totalDraws += Math.abs(amount);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not fetch GL summary:', err);
    // Continue with zeros - we still have the balance
  }

  return {
    broker_id: broker.id,
    broker_name: broker.name,
    qb_account_id: mapping.qb_credit_account_id,
    qb_account_name: mapping.qb_credit_account_name || accountResult.Account.Name,
    current_balance: currentBalance,
    total_draws: totalDraws,
    total_commissions: totalCommissions,
    as_of_date: endDate,
  };
}

// ============================================================================
// TOOL: CREATE JOURNAL ENTRY IN QBO
// ============================================================================

export async function createJournalEntryInQBO(
  supabase: SupabaseClient,
  description: string,
  transactionDate: string,
  lines: Array<{
    account_id: string;
    account_name: string;
    debit?: number;
    credit?: number;
    description?: string;
    vendor_id?: string;
    vendor_name?: string;
  }>,
  memo?: string
): Promise<CreateQBOEntryResult> {
  // Validate the entry balances
  let totalDebits = 0;
  let totalCredits = 0;

  for (const line of lines) {
    totalDebits += line.debit || 0;
    totalCredits += line.credit || 0;
  }

  totalDebits = Math.round(totalDebits * 100) / 100;
  totalCredits = Math.round(totalCredits * 100) / 100;

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry is not balanced. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
  }

  // Get QBO connection
  let connection = await getQBConnection(supabase);
  if (!connection) {
    throw new Error('QuickBooks is not connected. Please connect in Settings.');
  }

  connection = await refreshTokenIfNeeded(supabase, connection);

  // Build the journal entry lines
  const jeLines: QBJournalEntryLine[] = [];

  for (const line of lines) {
    if (line.debit && line.debit > 0) {
      const jeLine: QBJournalEntryLine = {
        Amount: line.debit,
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: 'Debit',
          AccountRef: { value: line.account_id, name: line.account_name },
        },
        Description: line.description || description,
      };

      // Add vendor entity reference if provided
      if (line.vendor_id) {
        jeLine.JournalEntryLineDetail.Entity = {
          Type: 'Vendor',
          EntityRef: { value: line.vendor_id, name: line.vendor_name },
        };
      }

      jeLines.push(jeLine);
    }

    if (line.credit && line.credit > 0) {
      const jeLine: QBJournalEntryLine = {
        Amount: line.credit,
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: 'Credit',
          AccountRef: { value: line.account_id, name: line.account_name },
        },
        Description: line.description || description,
      };

      // Add vendor entity reference if provided
      if (line.vendor_id) {
        jeLine.JournalEntryLineDetail.Entity = {
          Type: 'Vendor',
          EntityRef: { value: line.vendor_id, name: line.vendor_name },
        };
      }

      jeLines.push(jeLine);
    }
  }

  // Generate doc number (OVIS-XXX series)
  const { data: maxEntry } = await supabase
    .from('qb_commission_entry')
    .select('qb_doc_number')
    .like('qb_doc_number', 'OVIS-%')
    .order('qb_doc_number', { ascending: false })
    .limit(1)
    .single();

  let nextNumber = 100;
  if (maxEntry?.qb_doc_number) {
    const match = maxEntry.qb_doc_number.match(/OVIS-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  const docNumber = `OVIS-${nextNumber}`;

  // Create the journal entry
  const journalEntry: QBJournalEntry = {
    DocNumber: docNumber,
    TxnDate: transactionDate,
    Line: jeLines,
    PrivateNote: memo || `Created by OVIS Bookkeeper: ${description}`,
  };

  const result = await createJournalEntry(connection, journalEntry);

  return {
    success: true,
    qb_entity_id: result.Id,
    qb_entity_type: 'JournalEntry',
    qb_doc_number: result.DocNumber || docNumber,
    amount: totalDebits,
    message: `Created Journal Entry ${result.DocNumber || docNumber} for $${totalDebits.toFixed(2)}`,
  };
}

// ============================================================================
// TOOL: CREATE BILL IN QBO
// ============================================================================

export async function createBillInQBO(
  supabase: SupabaseClient,
  vendorName: string,
  amount: number,
  expenseAccountId: string,
  expenseAccountName: string,
  transactionDate: string,
  description: string,
  memo?: string
): Promise<CreateQBOEntryResult> {
  if (amount <= 0) {
    throw new Error('Bill amount must be greater than 0');
  }

  // Get QBO connection
  let connection = await getQBConnection(supabase);
  if (!connection) {
    throw new Error('QuickBooks is not connected. Please connect in Settings.');
  }

  connection = await refreshTokenIfNeeded(supabase, connection);

  // Find or create the vendor
  const vendor = await findOrCreateVendor(connection, vendorName);

  // Build the bill
  const billLine: QBBillLine = {
    Amount: amount,
    DetailType: 'AccountBasedExpenseLineDetail',
    AccountBasedExpenseLineDetail: {
      AccountRef: { value: expenseAccountId, name: expenseAccountName },
    },
    Description: description,
  };

  const bill: QBBill = {
    VendorRef: { value: vendor.Id, name: vendor.DisplayName },
    Line: [billLine],
    TxnDate: transactionDate,
    PrivateNote: memo || `Created by OVIS Bookkeeper: ${description}`,
  };

  const result = await createBill(connection, bill);

  return {
    success: true,
    qb_entity_id: result.Id,
    qb_entity_type: 'Bill',
    qb_doc_number: result.DocNumber,
    amount: amount,
    message: `Created Bill ${result.DocNumber || result.Id} for $${amount.toFixed(2)} to ${vendor.DisplayName}`,
  };
}

// ============================================================================
// TOOL: CALCULATE NET COMMISSION PAYMENT
// ============================================================================

export async function calculateNetCommissionPayment(
  supabase: SupabaseClient,
  brokerName: string,
  commissionAmount: number
): Promise<{
  broker_name: string;
  commission_amount: number;
  current_draw_balance: number;
  net_payment_amount: number;
  balance_after_payment: number;
  explanation: string;
}> {
  // Get the broker's current draw balance
  const balance = await getBrokerDrawBalance(supabase, brokerName);

  const currentDrawBalance = balance.current_balance;
  const netPaymentAmount = commissionAmount - currentDrawBalance;
  const balanceAfterPayment = netPaymentAmount < 0 ? Math.abs(netPaymentAmount) : 0;

  let explanation: string;
  if (currentDrawBalance <= 0) {
    explanation = `${balance.broker_name} has no outstanding draw balance. The full commission of $${commissionAmount.toFixed(2)} is payable.`;
  } else if (netPaymentAmount > 0) {
    explanation = `${balance.broker_name} has a draw balance of $${currentDrawBalance.toFixed(2)}. After applying the commission of $${commissionAmount.toFixed(2)}, the net payment is $${netPaymentAmount.toFixed(2)}.`;
  } else if (netPaymentAmount === 0) {
    explanation = `${balance.broker_name} has a draw balance of $${currentDrawBalance.toFixed(2)} which exactly equals the commission. No payment is needed, but the draw is cleared.`;
  } else {
    explanation = `${balance.broker_name} has a draw balance of $${currentDrawBalance.toFixed(2)} which exceeds the commission of $${commissionAmount.toFixed(2)}. No payment is owed; ${balance.broker_name} will still have a remaining draw balance of $${balanceAfterPayment.toFixed(2)}.`;
  }

  return {
    broker_name: balance.broker_name,
    commission_amount: commissionAmount,
    current_draw_balance: currentDrawBalance,
    net_payment_amount: Math.max(0, netPaymentAmount),
    balance_after_payment: balanceAfterPayment,
    explanation,
  };
}

// ============================================================================
// TOOL DEFINITIONS FOR CLAUDE
// ============================================================================

export const BOOKKEEPER_TOOL_DEFINITIONS = [
  {
    name: 'get_chart_of_accounts',
    description: 'Get QBO chart of accounts. Filter by account_type (Expense, Income, Asset, Liability, etc) or search by name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        account_type: { type: 'string' as const },
        search: { type: 'string' as const },
        active_only: { type: 'boolean' as const },
      },
    },
  },
  {
    name: 'search_recent_transactions',
    description: 'Search recent QBO transactions. Filter by account or search memo/vendor.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_back: { type: 'number' as const },
        account_id: { type: 'string' as const },
        search_text: { type: 'string' as const },
      },
    },
  },
  {
    name: 'explain_accounting_treatment',
    description: 'Explain how to record a type of transaction (e.g., "line of credit payment", "commission draw", "prepaid expense").',
    input_schema: {
      type: 'object' as const,
      properties: {
        scenario: { type: 'string' as const },
      },
      required: ['scenario'],
    },
  },
  {
    name: 'draft_journal_entry',
    description: 'Create a journal entry draft for review. Validates debits=credits.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string' as const },
        transaction_date: { type: 'string' as const },
        lines: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              account_id: { type: 'string' as const },
              account_name: { type: 'string' as const },
              debit: { type: 'number' as const },
              credit: { type: 'number' as const },
              description: { type: 'string' as const },
              entity_name: { type: 'string' as const },
            },
            required: ['account_id', 'account_name'],
          },
        },
        memo: { type: 'string' as const },
      },
      required: ['description', 'transaction_date', 'lines'],
    },
  },
  {
    name: 'get_accounting_context',
    description: 'Get saved accounting rules and preferences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_type: { type: 'string' as const, enum: ['accounting_rule', 'account_mapping', 'correction'] },
      },
    },
  },
  {
    name: 'save_accounting_context',
    description: 'Save an accounting rule for future reference (e.g., "always use account 5200 for referral fees").',
    input_schema: {
      type: 'object' as const,
      properties: {
        context_type: { type: 'string' as const, enum: ['accounting_rule', 'account_mapping'] },
        context_text: { type: 'string' as const },
        entity_type: { type: 'string' as const },
        entity_id: { type: 'string' as const },
      },
      required: ['context_type', 'context_text'],
    },
  },
  {
    name: 'get_broker_draw_balance',
    description: 'Get a broker\'s current draw balance from QuickBooks. Returns the balance on their draw account (positive = owes company, negative = company owes them).',
    input_schema: {
      type: 'object' as const,
      properties: {
        broker_name: {
          type: 'string' as const,
          description: 'The broker\'s name (partial match is OK, e.g., "Arty" for "Arty Santos")',
        },
      },
      required: ['broker_name'],
    },
  },
  {
    name: 'calculate_net_commission_payment',
    description: 'Calculate the net payment owed to a broker after applying their commission against any outstanding draw balance.',
    input_schema: {
      type: 'object' as const,
      properties: {
        broker_name: {
          type: 'string' as const,
          description: 'The broker\'s name',
        },
        commission_amount: {
          type: 'number' as const,
          description: 'The gross commission amount earned',
        },
      },
      required: ['broker_name', 'commission_amount'],
    },
  },
  {
    name: 'create_journal_entry_in_qbo',
    description: 'Create a journal entry directly in QuickBooks Online. Debits and credits must balance. Returns the created JE ID and doc number.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string' as const,
          description: 'Description for the journal entry (will appear on each line)',
        },
        transaction_date: {
          type: 'string' as const,
          description: 'Date in YYYY-MM-DD format',
        },
        lines: {
          type: 'array' as const,
          description: 'Array of line items. Each line should have account_id, account_name, and either debit or credit amount.',
          items: {
            type: 'object' as const,
            properties: {
              account_id: { type: 'string' as const, description: 'QBO account ID' },
              account_name: { type: 'string' as const, description: 'Account name for display' },
              debit: { type: 'number' as const, description: 'Debit amount (leave undefined if credit)' },
              credit: { type: 'number' as const, description: 'Credit amount (leave undefined if debit)' },
              description: { type: 'string' as const, description: 'Line-specific description (optional)' },
              vendor_id: { type: 'string' as const, description: 'Optional vendor ID for tracking' },
              vendor_name: { type: 'string' as const, description: 'Optional vendor name' },
            },
            required: ['account_id', 'account_name'],
          },
        },
        memo: {
          type: 'string' as const,
          description: 'Private note for the journal entry (optional)',
        },
      },
      required: ['description', 'transaction_date', 'lines'],
    },
  },
  {
    name: 'create_bill_in_qbo',
    description: 'Create a bill (Accounts Payable) in QuickBooks Online. Use this when you need to pay someone via check or direct deposit.',
    input_schema: {
      type: 'object' as const,
      properties: {
        vendor_name: {
          type: 'string' as const,
          description: 'Name of the vendor/payee. Will be found or created in QBO.',
        },
        amount: {
          type: 'number' as const,
          description: 'Bill amount',
        },
        expense_account_id: {
          type: 'string' as const,
          description: 'QBO account ID for the expense',
        },
        expense_account_name: {
          type: 'string' as const,
          description: 'Name of the expense account',
        },
        transaction_date: {
          type: 'string' as const,
          description: 'Date in YYYY-MM-DD format',
        },
        description: {
          type: 'string' as const,
          description: 'Description for the bill line item',
        },
        memo: {
          type: 'string' as const,
          description: 'Private note for the bill (optional)',
        },
      },
      required: ['vendor_name', 'amount', 'expense_account_id', 'expense_account_name', 'transaction_date', 'description'],
    },
  },
];
