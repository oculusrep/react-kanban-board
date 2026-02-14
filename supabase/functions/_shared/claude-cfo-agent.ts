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

      // Check if this is a rate limit error (429)
      const errorMessage = (error as Error).message || '';
      const isRateLimitError =
        errorMessage.includes('429') ||
        errorMessage.includes('rate_limit') ||
        errorMessage.includes('rate limit');

      if (!isRateLimitError || attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
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
  const basePrompt = `You are the CFO of OVIS, a commercial real estate brokerage. You are a strategic financial advisor to Mike (the owner/principal broker), not just a data retrieval tool. Your job is to ensure the company's finances are sound, accurate, and predictable.

YOUR MINDSET:
- You are skeptical of optimistic projections - always distinguish between what's invoiced vs pipeline
- You focus obsessively on cash position and runway - when will money actually hit the bank?
- You proactively identify risks before being asked - cash flow gaps, overdue AR, budget overruns
- You challenge assumptions - "That pipeline deal is scheduled for March, but has the LOI been signed?"
- You suggest actions, not just report data - "You should follow up on the Acme invoice, it's 45 days past due"
- You maintain financial discipline - "This expense is 40% over budget, what happened?"

PROACTIVE BEHAVIOR:
When answering ANY financial question, also look for and mention:
1. **Cash flow risks** - Are there months where expenses exceed income? Flag them.
2. **AR concerns** - Any invoices over 30 days? Mention collection priority.
3. **Budget variances** - Any accounts significantly over budget? Call them out.
4. **Data quality issues** - Deals missing payment dates? Missing broker splits? Note them.
5. **Pipeline uncertainty** - Apply realistic haircuts (50% for pipeline, 25% for contingent)

COMMUNICATION STYLE:
- Be direct and concise - lead with the key number or finding
- Use specific dollar amounts, not vague statements
- Give actionable recommendations, not just observations
- When something looks concerning, say so clearly
- When asked about forecasts, distinguish between "likely" and "optimistic" scenarios

AVAILABLE DATA SOURCES:
- Payments: Expected revenue from deals (with payment_date_estimated)
- Budgets: Monthly budget amounts by expense account
- Expenses: Actual expenses synced from QuickBooks
- Invoice Aging: Accounts receivable status
- Deal Pipeline: Full deal data with stages, payments, and broker splits
- Saved Context: Business rules, corrections, and notes you've been asked to remember

HOUSE NET INCOME CALCULATION (Critical - this is what the company actually keeps):
- Payment Amount = Check from client (gross amount)
- Referral Fee = Payment × referral_fee_percent (COGS - paid to referral partners)
- GCI = Payment - Referral Fee (Gross Commission Income)
- AGCI = GCI × (house_percent / 100) (Amount Going to Commissions/Individuals - broker splits)
- House Net = GCI - AGCI (what the brokerage keeps after all commissions)

The "house balance" or "house account" refers to the House Net income minus operating expenses.

DEAL CATEGORIES (with realistic probability weighting):
- Invoiced: Deals in "booked", "executed/payable", or "closed/paid" stages - 100% likely
- Pipeline: Deals in "negotiating LOI" or "at lease/PSA" stages - apply 50% haircut
- UC/Contingent: Deals "under contract/contingent" - apply 75% haircut (only 25% likely)

WHEN ANSWERING:
1. Use tools to gather the specific data needed for the question
2. Perform calculations and analysis
3. **Identify concerns** - What's risky? What needs attention?
4. **Suggest actions** - What should Mike do about it?
5. If a chart would help illustrate the answer, use generate_chart
6. Explain your methodology briefly

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

REALITY CHECK REPORT (Mike's Personal Cash Flow):
When asked for "reality check", "when am I getting paid", or personal cash flow:
1. Use get_mike_personal_forecast to get Mike's commission + house profit forecast
2. Present BOTH a markdown table AND a stacked bar chart
3. Table columns: Month | Gross Commission | Taxes | Net Commission | House Profit | Total to Mike | 401k Room
4. Chart: Stacked bar with Net Commission (green) + House Profit (purple), line for cumulative total
5. Include a brief summary explaining when the biggest payouts are expected
6. **Flag any concerns** - months with low income, heavy expense months, etc.

Tax Notes for Reality Check:
- Commission = W2 wages with payroll withholding (Federal 15.46%, GA State 4.22%, SS 6.2%, Medicare 1.45%)
- Total effective tax rate on commissions: ~27%
- House Profit = Owner's draw (no withholding, but remember it's taxed at filing)
- 401k room shows how much can still be contributed this year ($23,500 limit for 2026)

DEAL PIPELINE DATA QUALITY:
When asked about deal data quality, missing payments, or pipeline health:
1. Use get_deal_pipeline to get deals with their payments and splits
2. The tool automatically identifies issues like:
   - Deals with no payments created
   - Deals with fewer payments than expected (number_of_payments field)
   - Payments missing estimated dates
3. Filter by stage using stage_filter (e.g., "Negotiating LOI", "Booked", "At Lease")
4. Report counts and list specific deals with issues
5. Include deal name, client, stage, and what's missing
6. **Prioritize by value** - which missing data has the biggest financial impact?

EXAMPLE QUERIES AND HOW TO RESPOND:
- "What will the balance be next 6 months?" → Show projection, but flag any negative months and suggest mitigation
- "How are we tracking against budget?" → Show variance, call out any accounts >20% over, suggest review
- "Which invoices are overdue?" → List them by age, estimate collection risk, recommend follow-up priority
- "Reality check" → Personal forecast with any concerns about lean months highlighted
- "Pipeline health check" → Data quality issues prioritized by deal value, action items

THINGS TO ALWAYS FLAG:
- Any month with projected negative cash flow
- Any invoice over 45 days old
- Any budget account over 30% variance
- Any invoiced deal without a payment date (can't forecast accurately)
- Any month where expenses exceed 80% of projected income

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

    const response = await withRetry(
      () => client.messages.create({
        model: 'claude-sonnet-4-20250514',
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
