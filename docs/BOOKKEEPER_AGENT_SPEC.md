# Bookkeeper Agent Specification

## Overview

AI-powered bookkeeping assistant for OVIS that helps with QuickBooks accounting questions, journal entry construction, and proper transaction recording. The agent understands QBO account structure and can draft journal entries for review before creating them.

**Primary Use Cases:**
- "How do I record a line of credit payment with interest and principal?"
- "Where should I categorize this expense?"
- "How do I fix this transaction that was posted to the wrong account?"
- "Help me with Arty's commission draw journal entry"
- "Should this hit the P&L or balance sheet?"

## Architecture

```
BookkeeperPage (React)
    ↓
bookkeeper-query Edge Function
    ↓
Claude API (with tools)
    ├── get_chart_of_accounts     (read QBO COA from qb_account)
    ├── search_recent_transactions (read recent expenses/transactions)
    ├── explain_journal_entry      (educational - how to record something)
    ├── draft_journal_entry        (generate JE for review)
    └── get_accounting_context     (retrieve saved accounting rules)
    ↓
Response: { answer, journal_entry_draft?, account_suggestions? }
    ↓
Optional: "Create in QBO" button → quickbooks-create-journal-entry
```

## Key Differences from CFO Agent

| Aspect | CFO Agent | Bookkeeper Agent |
|--------|-----------|------------------|
| **Mindset** | Strategic, skeptical, forward-looking | Accurate, methodical, GAAP-aware |
| **Focus** | Cash flow, forecasts, risks | Debits/credits, account mapping, compliance |
| **Data Access** | Reads financial summaries | Reads/writes transactions |
| **Output** | Charts, recommendations | Journal entries, account suggestions |
| **Risk Level** | Read-only | Can create QBO transactions (with approval) |

## Bookkeeper Agent Persona

```
You are the Bookkeeper for OVIS, a commercial real estate brokerage. You help Mike
(the owner) with QuickBooks accounting tasks - categorizing transactions, building
journal entries, and ensuring proper accounting treatment.

YOUR MINDSET:
- Every transaction must balance - debits equal credits
- Proper account classification matters for tax reporting
- When unsure between P&L and Balance Sheet, explain the implications of each
- Always explain your reasoning so Mike learns the accounting logic
- Be precise with amounts and account names

YOUR APPROACH:
1. Understand what happened (the business event)
2. Identify which accounts are affected
3. Determine if it's P&L (revenue/expense) or Balance Sheet (asset/liability/equity)
4. Build the journal entry with clear debit/credit lines
5. Explain why this is the correct treatment

COMMON SCENARIOS YOU HANDLE:
- Line of Credit: Interest → P&L (Interest Expense), Principal → Balance Sheet (LOC Liability)
- Commission Draws: Debit Commission Expense, Credit Due to Broker (liability) or Cash
- Client Deposits: Debit Cash, Credit Unearned Revenue (liability)
- Expense Reclassification: Debit correct account, Credit incorrect account
- Prepaid Expenses: Asset → Expense over time
```

## Tools

### 1. get_chart_of_accounts
Retrieves QBO chart of accounts from `qb_account` table.

```typescript
interface GetChartOfAccountsParams {
  account_type?: string;   // 'Expense', 'Income', 'Cost of Goods Sold', 'Asset', 'Liability'
  search?: string;         // Search by account name
  active_only?: boolean;   // Default true
}

// Returns accounts with: id, name, account_type, account_sub_type, fully_qualified_name
```

### 2. search_recent_transactions
Search recent transactions in QBO (via qb_expense or QBO API).

```typescript
interface SearchTransactionsParams {
  days_back?: number;      // Default 30
  account_id?: string;     // Filter by account
  search_text?: string;    // Search memo/description
  transaction_type?: string; // 'Expense', 'Bill', 'JournalEntry'
}
```

### 3. explain_accounting_treatment
Educational tool - explains how to record a type of transaction.

```typescript
interface ExplainAccountingParams {
  scenario: string;  // e.g., "line of credit payment", "commission draw", "prepaid expense"
}

// Returns: explanation of accounting treatment, typical accounts involved, example JE
```

### 4. draft_journal_entry
Generates a journal entry for review (NOT created in QBO yet).

```typescript
interface DraftJournalEntryParams {
  description: string;
  transaction_date: string;  // YYYY-MM-DD
  lines: Array<{
    account_id: string;
    account_name: string;
    debit?: number;
    credit?: number;
    description?: string;
    entity_name?: string;    // Vendor/Customer name for tracking
  }>;
  memo?: string;
}

// Returns: formatted JE preview with validation (debits = credits)
```

### 5. get_accounting_context
Retrieves saved accounting rules and preferences (shares `ai_financial_context` table with CFO Agent).

```typescript
interface GetAccountingContextParams {
  context_type?: 'accounting_rule' | 'account_mapping' | 'correction';
}
```

### 6. save_accounting_context
Saves accounting rules for future reference.

```typescript
interface SaveAccountingContextParams {
  context_type: 'accounting_rule' | 'account_mapping';
  context_text: string;
  entity_type?: string;  // 'broker', 'account', 'transaction_type'
  entity_id?: string;
}
```

## Journal Entry Draft Format

When the agent drafts a journal entry, it returns a structured format:

```typescript
interface JournalEntryDraft {
  transaction_date: string;
  description: string;
  lines: Array<{
    line_number: number;
    posting_type: 'Debit' | 'Credit';
    account_id: string;
    account_name: string;
    amount: number;
    description?: string;
    entity_type?: 'Vendor' | 'Customer';
    entity_name?: string;
  }>;
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
  memo?: string;
  warnings?: string[];  // e.g., "This will increase Interest Expense on P&L"
}
```

## Frontend Components

### BookkeeperPage (`/admin/bookkeeper`)
- Chat interface (similar to CFO Dashboard)
- Right panel shows journal entry preview when drafted
- "Create in QuickBooks" button when JE is ready
- Links to relevant QBO accounts

### BookkeeperChatPanel
- Message history with markdown support
- Shows JE previews inline
- Account name autocomplete in chat

### JournalEntryPreview
- T-account style display
- Debit/Credit columns
- Balance validation (green check or red X)
- "Create in QBO" action button

## Example Interactions

### Example 1: Line of Credit Payment
**User:** "I paid $5,000 on our line of credit. $200 was interest, $4,800 was principal. How do I record this?"

**Bookkeeper:**
```
Here's how to record this LOC payment:

The interest portion ($200) is an expense that hits your P&L.
The principal portion ($4,800) reduces your LOC liability on the Balance Sheet.
The total ($5,000) comes from your Cash account.

**Journal Entry:**
| Account                    | Debit    | Credit   |
|---------------------------|----------|----------|
| Interest Expense          | $200.00  |          |
| Line of Credit (Liability)|$4,800.00 |          |
| Cash - Operating          |          | $5,000.00|

**Totals:**                   $5,000.00  $5,000.00 ✓

This correctly:
- Recognizes the interest expense on your P&L
- Reduces your LOC balance (what you owe the bank)
- Reduces your cash by the total payment

Would you like me to create this in QuickBooks?
```

### Example 2: Expense Categorization
**User:** "I have a charge from Staples for $150. Where should this go?"

**Bookkeeper:**
```
For office supplies from Staples, you have a few options in your chart of accounts:

1. **Office Supplies** (5300) - General office supplies
2. **Supplies - Office** (5310) - Sub-account of supplies

Based on your past transactions, you typically use "Office Supplies" (5300)
for Staples purchases.

Should I draft a journal entry, or will you categorize this directly in the
expense when recording it?
```

### Example 3: Commission Draw (Arty)
**User:** "Arty is taking a $2,000 commission draw against future earnings. How do I record this?"

**Bookkeeper:**
```
For a commission draw against future earnings, this is an advance to the broker
that you'll recover when they earn commissions. Here's the proper treatment:

This is NOT an expense yet - it's an asset (money Arty owes back until earned).

**Journal Entry:**
| Account                         | Debit    | Credit   |
|---------------------------------|----------|----------|
| Due from Brokers - Arty (Asset) | $2,000.00|          |
| Cash - Operating                |          | $2,000.00|

When Arty earns a commission that covers this draw, you'll record:
| Account                         | Debit    | Credit   |
|---------------------------------|----------|----------|
| Commission Expense              | $2,000.00|          |
| Due from Brokers - Arty (Asset) |          | $2,000.00|

This way, the expense only hits your P&L when earned, and you track
the outstanding draw balance.

Would you like me to create the draw journal entry in QuickBooks?
```

## Implementation Files

| File | Purpose |
|------|---------|
| `src/pages/BookkeeperPage.tsx` | Main page with chat + JE preview |
| `src/components/bookkeeper/BookkeeperChatPanel.tsx` | Chat UI |
| `src/components/bookkeeper/JournalEntryPreview.tsx` | JE preview component |
| `src/types/bookkeeper.ts` | TypeScript interfaces |
| `supabase/functions/bookkeeper-query/index.ts` | Edge function handler |
| `supabase/functions/_shared/claude-bookkeeper-agent.ts` | Claude API integration |
| `supabase/functions/_shared/bookkeeper-tools.ts` | Tool implementations |

## Existing Infrastructure to Leverage

- `qb_account` table - Full QBO chart of accounts already synced
- `qb_expense` table - Recent transactions synced from QBO
- `ai_financial_context` table - Shared context storage
- `createJournalEntry()` in `_shared/quickbooks.ts` - QBO JE creation
- `qb_commission_mapping` - Broker-specific account mappings

## Context Sharing with CFO Agent

Both agents use `ai_financial_context` table but with different context types:
- CFO Agent: `business_rule`, `correction`, `note`
- Bookkeeper Agent: `accounting_rule`, `account_mapping`, `correction`

This allows:
- "Remember that we always use account 5200 for referral fees" (Bookkeeper saves as `account_mapping`)
- CFO Agent sees the correction if it affects financial calculations

## Security Considerations

1. **Draft First** - JE is always shown for review before creation
2. **Admin Only** - Same access control as CFO Dashboard
3. **Audit Trail** - All created JEs logged with user and timestamp
4. **QBO Sync** - Uses existing QBO connection with refresh token handling

## Route Registration

```typescript
// App.tsx
<Route path="admin/bookkeeper" element={<AdminRoute><BookkeeperPage /></AdminRoute>} />
```

## Future: Finance Hub

As more financial tools are built, consider a Finance Hub page (`/admin/finance`) that provides access to:
- CFO Dashboard (strategic analysis)
- Bookkeeper (transaction help)
- Budget Setup
- Cash Flow Forecast
- QuickBooks Settings

---

## Implementation Priority

**Phase 1: Core Functionality**
1. Edge function with Claude integration
2. `get_chart_of_accounts` tool (read from existing `qb_account`)
3. `explain_accounting_treatment` tool (educational)
4. `draft_journal_entry` tool (preview only)
5. Basic chat UI

**Phase 2: QBO Integration**
1. "Create in QuickBooks" action (uses existing `createJournalEntry`)
2. `search_recent_transactions` tool
3. Account autocomplete in chat

**Phase 3: Context & Learning**
1. Save/retrieve accounting rules
2. Integration with CFO Agent context
3. Transaction history for suggestions

---

## Resume Point

**Status:** Specification complete (February 14, 2026)

**Dependencies Ready:**
- ✅ `qb_account` table with COA
- ✅ `createJournalEntry()` in quickbooks.ts
- ✅ `ai_financial_context` table for shared context
- ✅ QBO connection infrastructure

**Next Steps:**
1. Create `bookkeeper-query` edge function
2. Create `claude-bookkeeper-agent.ts` with system prompt
3. Create `bookkeeper-tools.ts` with tool implementations
4. Create `BookkeeperPage.tsx` with chat UI
5. Create `JournalEntryPreview.tsx` component
6. Register route and add to navigation
