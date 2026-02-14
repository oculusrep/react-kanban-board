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
  getMikePersonalForecast,
  getDealPipeline,
  generateInteractiveDealReport,
  updateDealPaymentDate,
  bulkUpdatePaymentDates,
  PaymentDateUpdate,
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

interface InteractiveDealReportData {
  deals: Array<{
    deal_id: string;
    deal_name: string;
    stage_label: string;
    house_net: number;
    client_name: string | null;
    payments: Array<{
      payment_id: string;
      payment_name: string | null;
      payment_amount: number | null;
      payment_date_estimated: string | null;
      editable: boolean;
    }>;
    issues: string[];
  }>;
  summary: {
    total_deals: number;
    total_payments_missing_dates: number;
    total_house_net_at_risk: number;
  };
  filter_applied: string;
  sort_by: string;
}

interface CFOAgentResult {
  answer: string;
  chart_spec?: ChartSpecification;
  interactive_deal_report?: InteractiveDealReportData;
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
  // Longer delays to handle per-minute rate limits (10k tokens/min on Sonnet 4)
  const { maxRetries = 4, baseDelayMs = 15000, maxDelayMs = 90000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;

      // Check if this is a rate limit error (429)
      const errorMessage = (error as Error).message || '';
      const isRateLimitError =
        errorMessage.includes('429') ||
        errorMessage.includes('rate_limit') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('would exceed');

      if (!isRateLimitError || attempt === maxRetries) {
        throw error;
      }

      // For "would exceed" errors, wait longer (full minute reset)
      const isPreemptiveLimit = errorMessage.includes('would exceed');
      const baseForAttempt = isPreemptiveLimit ? 60000 : baseDelayMs;

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseForAttempt * Math.pow(1.5, attempt);
      const jitter = Math.random() * 5000;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      console.log(`[CFO Agent] Rate limited, waiting ${Math.round(delay)}ms before retry ${attempt + 1}/${maxRetries}`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

function buildSystemPrompt(savedContext: string): string {
  const basePrompt = `You are OVIS's CFO - a strategic financial advisor to Mike (owner/principal broker). Be skeptical, cash-focused, and proactive about risks.

CORE BEHAVIORS:
- Distinguish invoiced (certain) vs pipeline (50% haircut) vs contingent (25% likely)
- Flag: negative cash flow months, invoices >45 days, budget variance >30%, missing payment dates
- Suggest actions, not just report data. Be direct with specific dollar amounts.

HOUSE NET CALCULATION:
Payment → minus Referral Fee → GCI → minus Broker Splits (AGCI) → House Net
"House balance" = House Net minus operating expenses

TOOLS: Use get_payments_forecast, get_budget_data, get_expenses_by_period, get_invoice_aging, get_cash_flow_projection, get_deal_pipeline, get_mike_personal_forecast. Generate charts when helpful.

CONTEXT: Use save_financial_context when asked to "remember", delete_financial_context when asked to "forget".

REALITY CHECK: When asked, use get_mike_personal_forecast. Show table (Month|Gross Commission|Taxes|Net|House Profit|Total|401k Room) and stacked bar chart. Tax rates: Federal 15.46%, GA 4.22%, SS 6.2%, Medicare 1.45% (~27% total on W2 wages).

Today: ${new Date().toISOString().split('T')[0]}.`;

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

    case 'get_mike_personal_forecast': {
      const forecasts = await getMikePersonalForecast(
        supabase,
        toolInput.year as number,
        toolInput.months_to_project as number | undefined
      );

      // Calculate totals for the period
      const totals = forecasts.reduce(
        (acc, f) => ({
          grossCommission: acc.grossCommission + f.grossCommission,
          houseProfit: acc.houseProfit + f.houseProfit,
          totalGross: acc.totalGross + f.totalGross,
          federalTax: acc.federalTax + f.federalTax,
          stateTax: acc.stateTax + f.stateTax,
          socialSecurity: acc.socialSecurity + f.socialSecurity,
          medicare: acc.medicare + f.medicare,
          totalTaxes: acc.totalTaxes + f.totalTaxes,
          totalToMike: acc.totalToMike + f.totalToMike,
        }),
        {
          grossCommission: 0,
          houseProfit: 0,
          totalGross: 0,
          federalTax: 0,
          stateTax: 0,
          socialSecurity: 0,
          medicare: 0,
          totalTaxes: 0,
          totalToMike: 0,
        }
      );

      return {
        monthly_forecasts: forecasts,
        period_totals: totals,
        tax_rates_used: {
          federal: 'Progressive brackets (MFJ 2026)',
          state: 'Georgia flat 5.39%',
          social_security: '6.2% up to $184,500',
          medicare: '1.45% + 0.9% over $200k',
        },
        notes: [
          'Commission is treated as W2 wages with full payroll tax withholding',
          'House profit is owner\'s draw (no withholding, taxed at filing)',
          '401k room shows remaining contribution capacity for the year',
        ],
      };
    }

    case 'get_deal_pipeline': {
      const result = await getDealPipeline(
        supabase,
        toolInput.stage_filter as string | undefined,
        (toolInput.include_closed_paid as boolean) || false
      );

      return {
        deals: result.deals,
        summary: result.summary,
        stage_filter_applied: toolInput.stage_filter || 'none (all active stages)',
      };
    }

    case 'generate_interactive_deal_report': {
      const result = await generateInteractiveDealReport(
        supabase,
        toolInput.filter_type as 'missing_payment_dates' | 'no_payments_created' | 'all_payment_issues' | 'specific_stage',
        toolInput.stage_filter as string | undefined,
        (toolInput.sort_by as 'house_net_desc' | 'deal_name' | 'stage' | 'payment_amount') || 'house_net_desc'
      );

      return {
        deals: result.deals,
        summary: result.summary,
        filter_applied: toolInput.filter_type,
        sort_by: toolInput.sort_by || 'house_net_desc',
        note: 'Payments with editable: true can have their dates updated using update_deal_payment_date.',
      };
    }

    case 'update_deal_payment_date': {
      const result = await updateDealPaymentDate(
        supabase,
        toolInput.deal_id as string,
        toolInput.payment_id as string,
        toolInput.new_payment_date as string
      );

      return {
        success: result.success,
        message: `Updated payment date for "${result.deal_name}" to ${result.new_date}`,
        payment_id: result.payment_id,
        new_date: result.new_date,
      };
    }

    case 'bulk_update_payment_dates': {
      const updates = toolInput.updates as PaymentDateUpdate[];
      const result = await bulkUpdatePaymentDates(supabase, updates);

      return {
        success: result.success,
        total_updates: result.total_updates,
        successful_updates: result.successful_updates,
        failed_updates: result.failed_updates,
        message: result.success
          ? `Successfully updated ${result.successful_updates} payment date(s).`
          : `Updated ${result.successful_updates} of ${result.total_updates} payment dates. ${result.failed_updates.length} failed.`,
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
  let interactiveDealReport: InteractiveDealReportData | undefined;

  // Agent loop - continue until we get a final text response
  let maxIterations = 10;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[CFO Agent] Iteration ${iteration}`);

    const response = await withRetry(
      () => client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        system: systemPrompt,
        tools: CFO_TOOL_DEFINITIONS as Anthropic.Tool[],
        messages,
      }),
      { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 }
    );

    console.log(`[CFO Agent] Stop reason: ${response.stop_reason}`);

    // Check if we're done (no more tool calls)
    if (response.stop_reason === 'end_turn') {
      // Extract text response
      const textContent = response.content.find((c) => c.type === 'text');
      const answer = textContent ? (textContent as Anthropic.TextBlock).text : 'No response generated.';

      return {
        answer,
        chart_spec: chartSpec,
        interactive_deal_report: interactiveDealReport,
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

            // If this is an interactive deal report, capture it
            if (toolUse.name === 'generate_interactive_deal_report') {
              interactiveDealReport = result as InteractiveDealReportData;
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
    interactive_deal_report: interactiveDealReport,
    tool_calls_made: toolCallsMade,
  };
}
