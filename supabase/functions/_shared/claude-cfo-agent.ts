/**
 * Claude CFO Agent
 *
 * Claude API integration with tools for financial analysis.
 * This agent answers financial questions using data tools and can generate charts.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.32.1';
import {
  CFO_TOOL_DEFINITIONS,
  getPaymentsForecast,
  getBudgetData,
  getExpensesByPeriod,
  getInvoiceAging,
  getCashFlowProjection,
  getFinancialContext,
  saveFinancialContext,
  deleteFinancialContext,
} from './cfo-tools.ts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ChartSpecification {
  chart_type: 'bar' | 'line' | 'area' | 'composed' | 'stacked_bar';
  title: string;
  data: Array<Record<string, unknown>>;
  x_axis: string;
  series: Array<{
    dataKey: string;
    name: string;
    color: string;
    type?: 'bar' | 'line' | 'area';
  }>;
  y_axis_format: 'currency' | 'number' | 'percent';
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CFOAgentResult {
  answer: string;
  chart_spec?: ChartSpecification;
  tool_calls_made: string[];
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(savedContext: string): string {
  const basePrompt = `You are the CFO Agent for OVIS, a commercial real estate brokerage. You have access to financial data tools to analyze the company's finances.

AVAILABLE DATA SOURCES:
- Payments: Expected revenue from deals (with payment_date_estimated)
- Budgets: Monthly budget amounts by expense account
- Expenses: Actual expenses synced from QuickBooks
- Invoice Aging: Accounts receivable status
- Saved Context: Business rules, corrections, and notes you've been asked to remember

HOUSE NET INCOME CALCULATION (Critical - this is what the company actually keeps):
- Payment Amount = Check from client (gross amount)
- Referral Fee = Payment × referral_fee_percent (COGS - paid to referral partners)
- GCI = Payment - Referral Fee (Gross Commission Income)
- AGCI = GCI × (house_percent / 100) (Amount Going to Commissions/Individuals - broker splits)
- House Net = GCI - AGCI (what the brokerage keeps after all commissions)

The "house balance" or "house account" refers to the House Net income minus operating expenses.

DEAL CATEGORIES:
- Invoiced: Deals in "booked", "executed/payable", or "closed/paid" stages - these are highly likely to close
- Pipeline: Deals in "negotiating LOI" or "at lease/PSA" stages - moderate likelihood (~50%)
- UC/Contingent: Deals "under contract/contingent" - lower likelihood (~25%)

WHEN ANSWERING:
1. Use tools to gather the specific data needed for the question
2. Perform calculations and analysis
3. If a chart would help illustrate the answer, use generate_chart
4. Provide clear, actionable insights with specific numbers
5. Explain your methodology so the user understands how you arrived at the answer

CONTEXT MANAGEMENT:
- When the user asks you to "remember" something, use the save_financial_context tool
- When the user corrects you, acknowledge the correction and save it using save_financial_context with context_type "correction"
- When the user asks you to "forget" something, use the delete_financial_context tool
- Always refer to saved context when it's relevant to the question

CHART GUIDELINES:
- Use bar charts for comparing categories (e.g., budget by account)
- Use line charts for trends over time (e.g., monthly balance)
- Use composed charts when showing both amounts and cumulative totals (bars for income/expenses, line for running balance)
- Use stacked bars for component breakdowns (e.g., income sources)
- Always use appropriate colors: green for income/positive, red for expenses/negative, purple/blue for balance
- Format currency values appropriately

EXAMPLE QUERIES YOU CAN ANSWER:
- "What will the balance of the house account be by month for the next 6 months?"
- "How are we tracking against budget this month?"
- "Which invoices are overdue and what's the collection risk?"
- "Show me expense trends over the past quarter"
- "What's our projected cash flow for Q2?"
- "Remember that Q4 is our busiest quarter"
- "That's wrong - the house split is 30%, not 25%"

Today's date is ${new Date().toISOString().split('T')[0]}.`;

  if (savedContext) {
    return basePrompt + `\n\nSAVED CONTEXT (Business rules, corrections, and notes you've been asked to remember):\n${savedContext}`;
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
  console.log(`[CFO Agent] Executing tool: ${toolName}`, toolInput);

  switch (toolName) {
    case 'get_payments_forecast': {
      const { monthlyForecasts, payments } = await getPaymentsForecast(
        supabase,
        toolInput.year as number,
        (toolInput.include_pipeline as boolean) || false,
        (toolInput.include_contingent as boolean) || false
      );
      return {
        monthly_forecasts: monthlyForecasts,
        total_payments: payments.length,
        summary: {
          total_invoiced: monthlyForecasts.reduce((sum, m) => sum + m.invoiced, 0),
          total_pipeline: monthlyForecasts.reduce((sum, m) => sum + m.pipeline, 0),
          total_contingent: monthlyForecasts.reduce((sum, m) => sum + m.contingent, 0),
        },
      };
    }

    case 'get_budget_data': {
      const budgets = await getBudgetData(
        supabase,
        toolInput.year as number,
        toolInput.account_types as string[] | undefined
      );
      const totalAnnual = budgets.reduce((sum, b) => sum + b.annual_total, 0);
      return {
        accounts: budgets,
        total_annual_budget: totalAnnual,
        account_count: budgets.length,
      };
    }

    case 'get_expenses_by_period': {
      const expenses = await getExpensesByPeriod(
        supabase,
        toolInput.start_date as string,
        toolInput.end_date as string,
        toolInput.account_type as string | undefined
      );
      const total = expenses.reduce((sum, e) => sum + e.total, 0);
      return {
        expenses_by_account: expenses,
        total_expenses: total,
        account_count: expenses.length,
      };
    }

    case 'get_invoice_aging': {
      const aging = await getInvoiceAging(
        supabase,
        (toolInput.include_details as boolean) || false
      );
      return aging;
    }

    case 'get_cash_flow_projection': {
      const projections = await getCashFlowProjection(
        supabase,
        toolInput.year as number,
        (toolInput.starting_balance as number) || 0,
        (toolInput.include_pipeline as boolean) || false,
        (toolInput.include_contingent as boolean) || false,
        toolInput.months_to_project as number | undefined
      );
      return {
        projections,
        final_balance: projections.length > 0 ? projections[projections.length - 1].runningBalance : 0,
        total_income: projections.reduce((sum, p) => sum + p.income, 0),
        total_expenses: projections.reduce((sum, p) => sum + p.expenses, 0),
      };
    }

    case 'generate_chart': {
      // Return the chart specification directly
      return {
        chart_type: toolInput.chart_type,
        title: toolInput.title,
        data: toolInput.data,
        x_axis: toolInput.x_axis,
        series: toolInput.series,
        y_axis_format: toolInput.y_axis_format,
      };
    }

    case 'get_financial_context': {
      const context = await getFinancialContext(
        supabase,
        toolInput.context_type as string | undefined
      );
      return {
        context_notes: context.map((c) => ({
          id: c.id,
          type: c.context_type,
          text: c.context_text,
          entity_type: c.entity_type,
          entity_id: c.entity_id,
          created_at: c.created_at,
        })),
        count: context.length,
      };
    }

    case 'save_financial_context': {
      const result = await saveFinancialContext(
        supabase,
        toolInput.context_type as string,
        toolInput.context_text as string,
        toolInput.entity_type as string | undefined,
        toolInput.entity_id as string | undefined,
        toolInput.metadata as Record<string, unknown> | undefined
      );
      return {
        success: true,
        id: result.id,
        message: 'Context saved successfully. I will remember this.',
      };
    }

    case 'delete_financial_context': {
      const result = await deleteFinancialContext(
        supabase,
        toolInput.context_id as string | undefined,
        toolInput.search_text as string | undefined
      );
      return {
        success: true,
        deleted_count: result.deleted_count,
        message: result.deleted_count > 0
          ? `Deleted ${result.deleted_count} context note(s).`
          : 'No matching context notes found to delete.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// MAIN AGENT FUNCTION
// ============================================================================

export async function runCFOAgent(
  supabase: SupabaseClient,
  query: string,
  conversationHistory: ConversationMessage[] = []
): Promise<CFOAgentResult> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const client = new Anthropic({ apiKey: anthropicKey });

  // Fetch saved context to include in system prompt
  let savedContextText = '';
  try {
    const savedContext = await getFinancialContext(supabase);
    if (savedContext.length > 0) {
      savedContextText = savedContext
        .map((c) => `- [${c.context_type}] ${c.context_text}`)
        .join('\n');
      console.log(`[CFO Agent] Loaded ${savedContext.length} context notes`);
    }
  } catch (err) {
    console.warn('[CFO Agent] Failed to load saved context:', err);
  }

  const systemPrompt = buildSystemPrompt(savedContextText);

  // Build messages from conversation history
  const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add the current query
  messages.push({ role: 'user', content: query });

  const toolCallsMade: string[] = [];
  let chartSpec: ChartSpecification | undefined;

  // Agent loop - continue until we get a final text response
  let maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[CFO Agent] Iteration ${iteration}`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: CFO_TOOL_DEFINITIONS as Anthropic.Tool[],
      messages,
    });

    console.log(`[CFO Agent] Stop reason: ${response.stop_reason}`);

    // Check if we're done (no more tool calls)
    if (response.stop_reason === 'end_turn') {
      // Extract text response
      const textContent = response.content.find((c) => c.type === 'text');
      const answer = textContent ? (textContent as Anthropic.TextBlock).text : 'No response generated.';

      return {
        answer,
        chart_spec: chartSpec,
        tool_calls_made: toolCallsMade,
      };
    }

    // Process tool calls
    if (response.stop_reason === 'tool_use') {
      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content });

      // Process each tool call
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

            // If this is a chart generation, capture the spec
            if (toolUse.name === 'generate_chart') {
              chartSpec = result as ChartSpecification;
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            console.error(`[CFO Agent] Tool error:`, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${(error as Error).message}`,
              is_error: true,
            });
          }
        }
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });
    }
  }

  // If we hit max iterations, return what we have
  console.warn(`[CFO Agent] Hit max iterations (${maxIterations})`);
  return {
    answer: 'I was unable to complete the analysis within the allowed iterations. Please try a simpler question.',
    chart_spec: chartSpec,
    tool_calls_made: toolCallsMade,
  };
}
