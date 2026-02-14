/**
 * Bookkeeper Agent Tools
 *
 * Tool implementations for the AI Bookkeeper assistant.
 * Provides access to QBO chart of accounts, transaction search,
 * and journal entry drafting capabilities.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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
];
