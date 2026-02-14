/**
 * Bookkeeper Agent Types
 *
 * TypeScript interfaces for the Bookkeeper chat interface
 * and journal entry functionality.
 */

// ============================================================================
// JOURNAL ENTRY TYPES
// ============================================================================

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

// ============================================================================
// ACCOUNT TYPES
// ============================================================================

export interface AccountSuggestion {
  account_id: string;
  account_name: string;
  account_type: string;
  reason: string;
}

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

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export interface BookkeeperMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  journal_entry_draft?: JournalEntryDraft;
  account_suggestions?: AccountSuggestion[];
  timestamp: Date;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface BookkeeperQueryRequest {
  query: string;
  conversation_history?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface BookkeeperQueryResponse {
  success: boolean;
  answer: string;
  journal_entry_draft?: JournalEntryDraft;
  account_suggestions?: AccountSuggestion[];
  tools_used?: string[];
  error?: string;
}
