/**
 * Friday CFO Email
 *
 * Scheduled Edge Function that sends a weekly CFO summary email
 * every Friday at 9:00 AM Eastern Time.
 *
 * TIMEZONE HANDLING:
 * This function checks if it's Friday morning (8-10 AM) in Eastern Time
 * before sending. Schedule cron jobs at both 13:00 and 14:00 UTC on Fridays
 * to handle EST/EDT transitions:
 *   - 0 13 * * 5  (covers 9am EDT in summer)
 *   - 0 14 * * 5  (covers 9am EST in winter)
 *
 * Sections:
 * 1. Personal & Company Financials (Mike, Arty take-home + House profit)
 * 2. Critical Dates Audit (Deals missing critical dates in contract+ stages)
 * 3. Pipeline Health (Behind schedule deals, payments pushed to next year)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Check if current time is Friday morning in Eastern Time (8-10 AM window)
 * Returns true if we should send the email, false to skip
 */
function isFridayMorningEastern(): { shouldSend: boolean; reason: string } {
  const now = new Date();

  // Convert to Eastern Time
  // Using Intl to get the actual offset accounting for DST
  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    weekday: 'long',
    hour: 'numeric',
    hour12: false
  };

  const formatter = new Intl.DateTimeFormat('en-US', etOptions);
  const parts = formatter.formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);

  // Check if it's Friday
  if (weekday !== 'Friday') {
    return { shouldSend: false, reason: `Not Friday (it's ${weekday} in Eastern Time)` };
  }

  // Check if it's in the 8-10 AM window (to catch the 9 AM target with some buffer)
  if (hour < 8 || hour >= 11) {
    return { shouldSend: false, reason: `Outside 8-10 AM window (it's ${hour}:00 ET)` };
  }

  return { shouldSend: true, reason: `Friday ${hour}:00 AM Eastern Time` };
}

// Broker IDs
const MIKE_BROKER_ID = '38d4b67c-841d-4590-9a09-523d3a4c6e4b';
const ARTY_BROKER_ID = '2d97b4e0-3f26-4f7e-b52b-4d8e2c9f3a1e'; // Update with actual ID

// Stage IDs
const STAGE_IDS = {
  underContractContingent: '583507f5-1c53-474b-b7e6-deb81d1b89d2',
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
  lost: '0e318cd6-a738-400a-98af-741479585057',
};

// Format currency
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format date
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Starting Friday CFO email job...')

    // Check if it's actually Friday morning in Eastern Time
    // This allows scheduling cron at both 13:00 and 14:00 UTC to handle EST/EDT
    const timezoneCheck = isFridayMorningEastern();
    console.log(`Timezone check: ${timezoneCheck.reason}`);

    // Allow bypass with ?force=true query param for testing
    const url = new URL(req.url);
    const forceRun = url.searchParams.get('force') === 'true';

    if (!timezoneCheck.shouldSend && !forceRun) {
      console.log('Skipping - not the right time to send');
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: timezoneCheck.reason,
          message: 'Email not sent - wrong time. Use ?force=true to bypass.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (forceRun) {
      console.log('Force run enabled - bypassing timezone check');
    }

    // Create Supabase client with service role key for admin access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // =========================================================================
    // SECTION 1: Personal & Company Financials
    // =========================================================================

    // Get broker commissions for current month and YTD
    const getBrokerCommissions = async (brokerId: string) => {
      const { data: splits, error } = await supabaseClient
        .from('payment_split')
        .select(`
          split_broker_total,
          paid,
          payment:payment_id (
            payment_date_estimated,
            payment_received,
            payment_received_date,
            deal:deal_id (stage_id)
          )
        `)
        .eq('broker_id', brokerId);

      if (error) throw error;

      let thisMonth = 0;
      let ytd = 0;

      for (const split of splits || []) {
        const payment = split.payment as any;
        if (!payment) continue;
        if (payment.deal?.stage_id === STAGE_IDS.lost) continue;

        const dateStr = payment.payment_received
          ? payment.payment_received_date
          : payment.payment_date_estimated;

        if (!dateStr) continue;

        const date = new Date(dateStr);
        if (date.getFullYear() !== currentYear) continue;

        const amount = split.split_broker_total || 0;
        ytd += amount;

        if (date.getMonth() === currentMonth) {
          thisMonth += amount;
        }
      }

      return { thisMonth, ytd };
    };

    const mikeCommissions = await getBrokerCommissions(MIKE_BROKER_ID);
    // const artyCommissions = await getBrokerCommissions(ARTY_BROKER_ID);

    // Get house profit (simplified calculation)
    const { data: payments, error: paymentError } = await supabaseClient
      .from('payment')
      .select(`
        payment_amount,
        referral_fee_usd,
        agci,
        payment_date_estimated,
        payment_received,
        payment_received_date,
        deal:deal_id (stage_id)
      `)
      .eq('is_active', true);

    if (paymentError) throw paymentError;

    let houseYtdActual = 0;
    let houseYtdEstimated = 0;

    for (const payment of payments || []) {
      const deal = payment.deal as any;
      if (deal?.stage_id === STAGE_IDS.lost) continue;

      const dateStr = payment.payment_received
        ? payment.payment_received_date
        : payment.payment_date_estimated;

      if (!dateStr) continue;

      const date = new Date(dateStr);
      if (date.getFullYear() !== currentYear) continue;

      const amount = payment.payment_amount || 0;
      const referralFee = payment.referral_fee_usd || 0;
      const agci = payment.agci || 0;
      const houseNet = amount - referralFee - agci;

      if (payment.payment_received) {
        houseYtdActual += houseNet;
      }
      houseYtdEstimated += houseNet;
    }

    // =========================================================================
    // SECTION 2: Critical Dates Audit
    // =========================================================================

    const contractStages = [
      STAGE_IDS.underContractContingent,
      STAGE_IDS.booked,
      STAGE_IDS.executedPayable,
    ];

    // Find deals in contract+ stages without critical dates
    const { data: dealsMissingDates, error: criticalError } = await supabaseClient
      .from('deal')
      .select(`
        id,
        deal_name,
        stage:stage_id (label),
        client:client_id (client_name),
        owner:owner_id (name),
        last_stage_change_at,
        created_at
      `)
      .in('stage_id', contractStages)
      .is('contract_signed_date', null)
      .limit(20);

    if (criticalError) throw criticalError;

    // Get payment amounts for these deals
    const dealIds = (dealsMissingDates || []).map(d => d.id);
    let paymentTotals = new Map<string, number>();

    if (dealIds.length > 0) {
      const { data: dealPayments } = await supabaseClient
        .from('payment')
        .select('deal_id, payment_amount')
        .in('deal_id', dealIds)
        .eq('is_active', true);

      for (const p of dealPayments || []) {
        paymentTotals.set(p.deal_id, (paymentTotals.get(p.deal_id) || 0) + (p.payment_amount || 0));
      }
    }

    // Sort by payment amount (biggest impact first)
    const criticalDateAudit = (dealsMissingDates || [])
      .map(deal => {
        const stage = deal.stage as any;
        const client = deal.client as any;
        const owner = deal.owner as any;
        const stageStart = deal.last_stage_change_at || deal.created_at;
        const daysInStage = Math.floor((Date.now() - new Date(stageStart).getTime()) / (1000 * 60 * 60 * 24));

        return {
          deal_name: deal.deal_name || 'Unknown',
          client_name: client?.client_name || 'N/A',
          broker: owner?.name || 'N/A',
          stage: stage?.label || 'Unknown',
          days_in_stage: daysInStage,
          payment_amount: paymentTotals.get(deal.id) || 0,
        };
      })
      .sort((a, b) => b.payment_amount - a.payment_amount);

    // =========================================================================
    // SECTION 3: Pipeline Health
    // =========================================================================

    // Get deals behind schedule
    const { data: behindScheduleDeals, error: behindError } = await supabaseClient
      .from('deal')
      .select(`
        id,
        deal_name,
        weeks_behind,
        stage:stage_id (label)
      `)
      .eq('is_behind_schedule', true)
      .gt('weeks_behind', 0)
      .not('stage_id', 'eq', STAGE_IDS.lost)
      .not('stage_id', 'eq', STAGE_IDS.closedPaid);

    if (behindError) throw behindError;

    // Get payment impact for behind schedule deals
    const behindDealIds = (behindScheduleDeals || []).map(d => d.id);
    let behindPaymentTotals = new Map<string, number>();

    if (behindDealIds.length > 0) {
      const { data: behindPayments } = await supabaseClient
        .from('payment')
        .select('deal_id, payment_amount')
        .in('deal_id', behindDealIds)
        .eq('is_active', true)
        .or('payment_received.eq.false,payment_received.is.null');

      for (const p of behindPayments || []) {
        behindPaymentTotals.set(p.deal_id, (behindPaymentTotals.get(p.deal_id) || 0) + (p.payment_amount || 0));
      }
    }

    const behindScheduleCount = (behindScheduleDeals || []).length;
    const behindScheduleImpact = Array.from(behindPaymentTotals.values()).reduce((sum, v) => sum + v, 0);

    // Payments pushed to next year (rough estimate - deals behind schedule with dates in next year)
    const nextYear = currentYear + 1;
    const { data: pushedPayments, error: pushedError } = await supabaseClient
      .from('payment')
      .select(`
        payment_amount,
        deal:deal_id (is_behind_schedule, weeks_behind)
      `)
      .eq('is_active', true)
      .or('payment_received.eq.false,payment_received.is.null')
      .gte('payment_date_estimated', `${nextYear}-01-01`);

    if (pushedError) throw pushedError;

    let pushedCount = 0;
    let pushedTotal = 0;

    for (const p of pushedPayments || []) {
      const deal = p.deal as any;
      if (deal?.is_behind_schedule && deal?.weeks_behind > 0) {
        pushedCount++;
        pushedTotal += p.payment_amount || 0;
      }
    }

    // =========================================================================
    // BUILD EMAIL
    // =========================================================================

    const emailHtml = generateCFOEmailTemplate({
      mikeThisMonth: mikeCommissions.thisMonth,
      mikeYtd: mikeCommissions.ytd,
      // artyThisMonth: artyCommissions.thisMonth,
      // artyYtd: artyCommissions.ytd,
      houseYtdActual,
      houseYtdEstimated,
      criticalDateAudit,
      behindScheduleCount,
      behindScheduleImpact,
      pushedCount,
      pushedTotal,
      currentYear,
    });

    // Get recipients from app_settings
    const { data: settingsData } = await supabaseClient
      .from('app_settings')
      .select('value')
      .eq('key', 'friday_email_recipients')
      .single();

    let recipients = ['mike@oculusrep.com']; // Default
    if (settingsData?.value) {
      try {
        const parsed = JSON.parse(settingsData.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          recipients = parsed;
        }
      } catch {
        // Use default
      }
    }

    // Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject: `Weekly CFO Summary - ${formatDate(now.toISOString())}`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    console.log(`CFO email sent to ${recipients.join(', ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Friday CFO email sent successfully',
        recipients,
        summary: {
          criticalDateAuditCount: criticalDateAudit.length,
          behindScheduleCount,
          behindScheduleImpact,
          pushedCount,
          pushedTotal,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Friday CFO email job:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

interface CFOEmailData {
  mikeThisMonth: number;
  mikeYtd: number;
  // artyThisMonth: number;
  // artyYtd: number;
  houseYtdActual: number;
  houseYtdEstimated: number;
  criticalDateAudit: Array<{
    deal_name: string;
    client_name: string;
    broker: string;
    stage: string;
    days_in_stage: number;
    payment_amount: number;
  }>;
  behindScheduleCount: number;
  behindScheduleImpact: number;
  pushedCount: number;
  pushedTotal: number;
  currentYear: number;
}

function generateCFOEmailTemplate(data: CFOEmailData): string {
  const criticalDateRows = data.criticalDateAudit
    .slice(0, 10) // Top 10
    .map(d => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${d.deal_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${d.client_name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${d.broker}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${d.days_in_stage}d</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(d.payment_amount)}</td>
      </tr>
    `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            font-size: 14px;
            background-color: #f3f4f6;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 {
            color: #1f2937;
            font-size: 24px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #3b82f6;
          }
          h2 {
            color: #374151;
            font-size: 18px;
            margin-top: 30px;
            margin-bottom: 15px;
          }
          .section {
            margin-bottom: 30px;
            padding: 20px;
            background-color: #f9fafb;
            border-radius: 6px;
          }
          .metric-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          .metric {
            padding: 15px;
            background-color: #ffffff;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
          }
          .metric-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .metric-value {
            font-size: 24px;
            font-weight: 600;
            color: #1f2937;
          }
          .metric-value.positive {
            color: #059669;
          }
          .metric-value.warning {
            color: #d97706;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          th {
            text-align: left;
            padding: 10px 8px;
            background-color: #f3f4f6;
            font-weight: 600;
            color: #374151;
            border-bottom: 2px solid #e5e7eb;
          }
          th:last-child {
            text-align: right;
          }
          .alert-box {
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 15px;
          }
          .alert-warning {
            background-color: #fef3c7;
            border: 1px solid #f59e0b;
          }
          .alert-danger {
            background-color: #fee2e2;
            border: 1px solid #ef4444;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
          }
          .link-btn {
            display: inline-block;
            padding: 8px 16px;
            background-color: #3b82f6;
            color: #ffffff;
            text-decoration: none;
            border-radius: 6px;
            font-size: 13px;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Weekly CFO Summary</h1>
          <p style="color: #6b7280;">Week ending ${formatDate(new Date().toISOString())}</p>

          <!-- Section 1: Personal & Company Financials -->
          <div class="section">
            <h2>Personal & Company Financials</h2>
            <div class="metric-grid">
              <div class="metric">
                <div class="metric-label">Mike's Take-Home (This Month)</div>
                <div class="metric-value">${formatCurrency(data.mikeThisMonth)}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Mike's Take-Home (YTD)</div>
                <div class="metric-value">${formatCurrency(data.mikeYtd)}</div>
              </div>
              <div class="metric">
                <div class="metric-label">House Profit (YTD Actual)</div>
                <div class="metric-value positive">${formatCurrency(data.houseYtdActual)}</div>
              </div>
              <div class="metric">
                <div class="metric-label">House Profit (YTD Estimated)</div>
                <div class="metric-value">${formatCurrency(data.houseYtdEstimated)}</div>
              </div>
            </div>
          </div>

          <!-- Section 2: Critical Dates Audit -->
          <div class="section">
            <h2>Critical Dates Audit</h2>
            ${data.criticalDateAudit.length > 0 ? `
              <div class="alert-box alert-warning">
                <strong>${data.criticalDateAudit.length} deal(s)</strong> in contract stages are missing critical dates
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Deal Name</th>
                    <th>Client</th>
                    <th>Broker</th>
                    <th>Days in Stage</th>
                    <th>Payment Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${criticalDateRows}
                </tbody>
              </table>
            ` : `
              <p style="color: #059669;">All deals in contract stages have critical dates entered.</p>
            `}
          </div>

          <!-- Section 3: Pipeline Health -->
          <div class="section">
            <h2>Pipeline Health</h2>
            <div class="metric-grid">
              <div class="metric">
                <div class="metric-label">Deals Behind Schedule</div>
                <div class="metric-value ${data.behindScheduleCount > 0 ? 'warning' : ''}">${data.behindScheduleCount}</div>
              </div>
              <div class="metric">
                <div class="metric-label">$ Impact (Behind Schedule)</div>
                <div class="metric-value ${data.behindScheduleImpact > 0 ? 'warning' : ''}">${formatCurrency(data.behindScheduleImpact)}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Payments Pushed to ${data.currentYear + 1}</div>
                <div class="metric-value ${data.pushedCount > 0 ? 'warning' : ''}">${data.pushedCount}</div>
              </div>
              <div class="metric">
                <div class="metric-label">$ Pushed to Next Year</div>
                <div class="metric-value ${data.pushedTotal > 0 ? 'warning' : ''}">${formatCurrency(data.pushedTotal)}</div>
              </div>
            </div>
            ${data.behindScheduleCount > 0 ? `
              <div class="alert-box alert-danger" style="margin-top: 15px;">
                <strong>${data.behindScheduleCount} deal(s)</strong> are behind schedule, impacting ${formatCurrency(data.behindScheduleImpact)} in pipeline revenue.
              </div>
            ` : ''}
          </div>

          <!-- Footer -->
          <div class="footer">
            <p>This report was automatically generated by OVIS CFO Agent.</p>
            <a href="https://app.ovis.dev/admin/cfo" class="link-btn">View Full CFO Dashboard</a>
          </div>
        </div>
      </body>
    </html>
  `;
}
