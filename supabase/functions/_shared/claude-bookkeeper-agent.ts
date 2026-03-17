/**
 * Claude Bookkeeper Agent
 *
 * AI-powered bookkeeping assistant for OVIS.
 * Helps with QuickBooks accounting questions, journal entry construction,
 * and proper transaction recording.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import {
  BOOKKEEPER_TOOL_DEFINITIONS,
  getChartOfAccounts,
  searchRecentTransactions,
  explainAccountingTreatment,
  draftJournalEntry,
  getAccountingContext,
  saveAccountingContext,
  getBrokerDrawBalance,
  calculateNetCommissionPayment,
  createJournalEntryInQBO,
  createBillInQBO,
  getBrokerPaymentSplitForDeal,
  JournalEntryDraft,
  AccountSuggestion,
  CreateQBOEntryResult,
} from './bookkeeper-tools.ts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BookkeeperAgentResult {
  answer: string;
  journal_entry_draft?: JournalEntryDraft;
  account_suggestions?: AccountSuggestion[];
  qbo_entry_created?: CreateQBOEntryResult;
  tool_calls_made: string[];
}

// ============================================================================
// RETRY HELPER FOR RATE LIMITS
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 2000, maxDelayMs = 30000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;

      const errorMessage = (error as Error).message || '';
      const isRateLimitError =
        errorMessage.includes('429') ||
        errorMessage.includes('rate_limit') ||
        errorMessage.includes('rate limit');

      if (!isRateLimitError || attempt === maxRetries) {
        throw error;
      }

      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      console.log(`[Bookkeeper] Rate limited, waiting ${Math.round(delay)}ms before retry ${attempt + 1}/${maxRetries}`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(savedContext: string): string {
  const basePrompt = `You are the Bookkeeper for OVIS, a commercial real estate brokerage. You help Mike (the owner) with QuickBooks accounting tasks.

CORE PRINCIPLES:
- Every transaction must balance - debits equal credits
- Proper account classification matters for tax reporting
- When unsure between P&L and Balance Sheet, explain implications of each
- Always explain your reasoning so Mike learns the accounting logic
- Be precise with amounts and account names

APPROACH:
1. Understand the business event
2. Identify affected accounts
3. Determine P&L (revenue/expense) vs Balance Sheet (asset/liability/equity)
4. Build journal entry with clear debit/credit lines
5. Explain the correct treatment

COMMON SCENARIOS:
- Line of Credit: Interest → P&L (Interest Expense), Principal → Balance Sheet (LOC Liability)
- Commission Draws: Debit Due from Broker (Asset), Credit Cash; later Debit Commission Expense, Credit Due from Broker
- Client Deposits: Debit Cash, Credit Unearned Revenue (liability)
- Expense Reclassification: Debit correct account, Credit incorrect account
- Prepaid Expenses: Asset → Expense over time

JOURNAL ENTRY FORMAT:
When drafting entries, use the draft_journal_entry tool. Present results as a table:
| Account | Debit | Credit |
Include totals and a checkmark if balanced.

TOOLS:
- get_chart_of_accounts: Search QBO accounts by type or name
- search_recent_transactions: Find recent transactions in QBO
- explain_accounting_treatment: Get educational explanations for common scenarios
- draft_journal_entry: Create a JE draft for review (does NOT post to QBO)
- get_accounting_context / save_accounting_context: Manage saved rules
- get_broker_draw_balance: Get a broker's current draw balance from QBO
- calculate_net_commission_payment: Calculate net payment after applying draw balance
- create_journal_entry_in_qbo: Create and post a journal entry to QBO (use with care!)
- create_bill_in_qbo: Create a bill in QBO for payment via check/direct deposit
- get_broker_payment_split_for_deal: Look up a broker's commission split from OVIS deals

COMMISSION FROM DEAL WORKFLOW:
When Mike says "we received payment for deal X", use get_broker_payment_split_for_deal to look up the broker's split amount, then use calculate_net_commission_payment with that amount.

ARTY'S DRAW WORKFLOW:
When Arty earns a commission but has a draw balance:
1. Use get_broker_draw_balance to check his current balance
2. Use calculate_net_commission_payment to determine net amount owed
3. If net payment > 0: Create a Bill for the net amount (so Mike can pay via direct deposit)
4. Record the commission via journal entry: Debit Commission Expense, Credit Draw Account

CONTEXT: Use save_accounting_context when asked to "remember" an accounting rule. Check get_accounting_context for relevant saved rules.

Today: ${new Date().toISOString().split('T')[0]}.`;

  if (savedContext) {
    return basePrompt + `\n\nSAVED ACCOUNTING RULES:\n${savedContext}`;
  }

  return basePrompt;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<unknown> {
  console.log(`[Bookkeeper] Executing tool: ${toolName}`);

  switch (toolName) {
    case 'get_chart_of_accounts': {
      const accounts = await getChartOfAccounts(
        supabase,
        toolInput.account_type as string | undefined,
        toolInput.search as string | undefined,
        toolInput.active_only as boolean | undefined
      );
      return {
        accounts,
        count: accounts.length,
      };
    }

    case 'search_recent_transactions': {
      const transactions = await searchRecentTransactions(
        supabase,
        toolInput.days_back as number | undefined,
        toolInput.account_id as string | undefined,
        toolInput.search_text as string | undefined
      );
      return {
        transactions,
        count: transactions.length,
      };
    }

    case 'explain_accounting_treatment': {
      return explainAccountingTreatment(toolInput.scenario as string);
    }

    case 'draft_journal_entry': {
      return draftJournalEntry(
        toolInput.description as string,
        toolInput.transaction_date as string,
        toolInput.lines as Array<{
          account_id: string;
          account_name: string;
          debit?: number;
          credit?: number;
          description?: string;
          entity_name?: string;
        }>,
        toolInput.memo as string | undefined
      );
    }

    case 'get_accounting_context': {
      const context = await getAccountingContext(
        supabase,
        toolInput.context_type as 'accounting_rule' | 'account_mapping' | 'correction' | undefined
      );
      return {
        context_notes: context,
        count: context.length,
      };
    }

    case 'save_accounting_context': {
      const result = await saveAccountingContext(
        supabase,
        toolInput.context_type as 'accounting_rule' | 'account_mapping',
        toolInput.context_text as string,
        toolInput.entity_type as string | undefined,
        toolInput.entity_id as string | undefined
      );
      return {
        success: true,
        id: result.id,
        message: 'Accounting rule saved.',
      };
    }

    case 'get_broker_draw_balance': {
      const balance = await getBrokerDrawBalance(
        supabase,
        toolInput.broker_name as string
      );
      return balance;
    }

    case 'calculate_net_commission_payment': {
      const result = await calculateNetCommissionPayment(
        supabase,
        toolInput.broker_name as string,
        toolInput.commission_amount as number
      );
      return result;
    }

    case 'create_journal_entry_in_qbo': {
      const result = await createJournalEntryInQBO(
        supabase,
        toolInput.description as string,
        toolInput.transaction_date as string,
        toolInput.lines as Array<{
          account_id: string;
          account_name: string;
          debit?: number;
          credit?: number;
          description?: string;
          vendor_id?: string;
          vendor_name?: string;
        }>,
        toolInput.memo as string | undefined
      );
      return result;
    }

    case 'create_bill_in_qbo': {
      const result = await createBillInQBO(
        supabase,
        toolInput.vendor_name as string,
        toolInput.amount as number,
        toolInput.expense_account_id as string,
        toolInput.expense_account_name as string,
        toolInput.transaction_date as string,
        toolInput.description as string,
        toolInput.memo as string | undefined
      );
      return result;
    }

    case 'get_broker_payment_split_for_deal': {
      const splits = await getBrokerPaymentSplitForDeal(
        supabase,
        toolInput.deal_search as string,
        toolInput.broker_name as string,
        toolInput.payment_identifier as string | undefined
      );
      return {
        splits,
        count: splits.length,
        message: splits.length === 1
          ? `Found ${splits[0].broker_name}'s split for ${splits[0].deal_name} - ${splits[0].payment_name}: $${splits[0].split_amount.toFixed(2)}`
          : `Found ${splits.length} payment splits for ${splits[0]?.broker_name || 'broker'}`,
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// MAIN AGENT FUNCTION
// ============================================================================

export async function runBookkeeperAgent(
  supabase: SupabaseClient,
  query: string,
  conversationHistory: ConversationMessage[] = []
): Promise<BookkeeperAgentResult> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  // Fetch saved context
  let savedContextText = '';
  try {
    const savedContext = await getAccountingContext(supabase);
    if (savedContext.length > 0) {
      savedContextText = savedContext
        .map((c) => `- [${c.context_type}] ${c.context_text}`)
        .join('\n');
      console.log(`[Bookkeeper] Loaded ${savedContext.length} context notes`);
    }
  } catch (err) {
    console.warn('[Bookkeeper] Failed to load saved context:', err);
  }

  const systemPrompt = buildSystemPrompt(savedContextText);

  // Build messages
  const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  messages.push({ role: 'user', content: query });

  const toolCallsMade: string[] = [];
  let journalEntryDraft: JournalEntryDraft | undefined;
  let accountSuggestions: AccountSuggestion[] | undefined;
  let qboEntryCreated: CreateQBOEntryResult | undefined;

  // Agent loop
  let maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[Bookkeeper] Iteration ${iteration}`);

    const response = await withRetry(
      () => client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: BOOKKEEPER_TOOL_DEFINITIONS as Anthropic.Tool[],
        messages,
      }),
      { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 }
    );

    console.log(`[Bookkeeper] Stop reason: ${response.stop_reason}`);

    // Check if done
    if (response.stop_reason === 'end_turn') {
      const textContent = response.content.find((c) => c.type === 'text');
      const answer = textContent ? (textContent as Anthropic.TextBlock).text : 'No response generated.';

      return {
        answer,
        journal_entry_draft: journalEntryDraft,
        account_suggestions: accountSuggestions,
        qbo_entry_created: qboEntryCreated,
        tool_calls_made: toolCallsMade,
      };
    }

    // Process tool calls
    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const content of response.content) {
        if (content.type === 'tool_use') {
          const toolUse = content as Anthropic.ToolUseBlock;
          toolCallsMade.push(toolUse.name);

          try {
            const result = await executeTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              supabase
            );

            // Capture journal entry drafts
            if (toolUse.name === 'draft_journal_entry') {
              journalEntryDraft = result as JournalEntryDraft;
            }

            // Capture account suggestions from COA queries
            if (toolUse.name === 'get_chart_of_accounts') {
              const accounts = (result as { accounts: Array<{ qb_account_id: string; name: string; account_type: string }> }).accounts;
              if (accounts.length > 0 && accounts.length <= 5) {
                accountSuggestions = accounts.map((a) => ({
                  account_id: a.qb_account_id,
                  account_name: a.name,
                  account_type: a.account_type,
                  reason: 'Matches search criteria',
                }));
              }
            }

            // Capture QBO entry creation results
            if (toolUse.name === 'create_journal_entry_in_qbo' || toolUse.name === 'create_bill_in_qbo') {
              qboEntryCreated = result as CreateQBOEntryResult;
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            console.error(`[Bookkeeper] Tool error:`, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${(error as Error).message}`,
              is_error: true,
            });
          }
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  // Max iterations reached
  console.warn(`[Bookkeeper] Hit max iterations (${maxIterations})`);
  return {
    answer: 'I was unable to complete the analysis within the allowed iterations. Please try a simpler question.',
    journal_entry_draft: journalEntryDraft,
    account_suggestions: accountSuggestions,
    qbo_entry_created: qboEntryCreated,
    tool_calls_made: toolCallsMade,
  };
}
