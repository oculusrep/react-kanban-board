/**
 * Process Arty Commission - Pre-baked workflow
 *
 * Fast, direct commission processing without AI agent overhead.
 * Does everything in one shot:
 * 1. Looks up payment split from OVIS
 * 2. Gets current draw balance from QBO
 * 3. Creates journal entry (Commission Expense → Draw Account)
 * 4. Creates bill for net payment (if > 0)
 * 5. Sends email notification
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  createJournalEntry,
  createBill,
  findOrCreateVendor,
  QBJournalEntry,
  QBJournalEntryLine,
  QBBill,
  QBBillLine,
} from '../_shared/quickbooks.ts';
import {
  sendEmail,
  refreshAccessToken,
  isTokenExpired,
  type GmailConnection,
} from '../_shared/gmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailOverrides {
  to?: string[];
  cc?: string[];
  subject?: string;
  body_text?: string;
}

interface ProcessCommissionRequest {
  payment_split_id: string;
  skip_email?: boolean;
  preview_only?: boolean;  // If true, just return the breakdown without creating anything
  email_overrides?: EmailOverrides;
}

interface ProcessCommissionResult {
  success: boolean;
  broker_name: string;
  deal_name: string;
  payment_name?: string;
  gross_commission: number;
  draw_balance: number;
  net_payment: number;
  // Draw math (preview): draw_before is the QB balance before applying this commission,
  // credit_applied is the portion of this commission that pays down the draw,
  // draw_after is the remaining draw after the credit is applied.
  draw_before?: number;
  credit_applied?: number;
  draw_after?: number;
  arty_email?: string;
  default_cc?: string[];
  email_subject?: string;
  email_body_text?: string;
  journal_entry?: {
    id: string;
    doc_number: string;
  };
  bill?: {
    id: string;
    doc_number: string;
  };
  email_sent?: boolean;
  error?: string;
}

const DEFAULT_CC = ['mike@oculusrep.com'];
const ARTY_DRAW_REPORT_URL = 'https://ovis.oculusrep.com/reports/arty-draw';

function formatCurrencyUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function renderArtyEmail(params: {
  brokerFirstName: string;
  dealName: string;
  paymentName: string;
  grossCommission: number;
  drawBefore: number;
  creditApplied: number;
  drawAfter: number;
  netPayment: number;
  senderName: string;
}): { subject: string; bodyText: string } {
  const { brokerFirstName, dealName, paymentName, grossCommission, drawBefore, creditApplied, drawAfter, netPayment, senderName } = params;

  const directDepositLine = netPayment > 0
    ? `\nAfter zeroing out your draw, you will receive a direct deposit in the amount of ${formatCurrencyUSD(netPayment)} once this payment clears the account.\n`
    : '';

  const subject = `Commission Payment Received — ${dealName} (${paymentName})`;
  const bodyText = `Hi ${brokerFirstName},

We've received payment for ${dealName} — ${paymentName}.

Your net commission on this payment is ${formatCurrencyUSD(grossCommission)}.

Draw balance before:    ${formatCurrencyUSD(drawBefore)}
Less credit applied:    (${formatCurrencyUSD(creditApplied)})
Draw balance after:     ${formatCurrencyUSD(drawAfter)}
${directDepositLine}
You can view your full draw report here:
${ARTY_DRAW_REPORT_URL}


Thank you for your hard work on this!

— ${senderName}
OVIS Commercial Real Estate`;

  return { subject, bodyText };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get internal user ID for Gmail
    const { data: userData } = await supabase
      .from('user')
      .select('id, ovis_role')
      .eq('auth_user_id', user.id)
      .single();

    if (!userData || userData.ovis_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const internalUserId = userData.id;

    // Parse request
    const request: ProcessCommissionRequest = await req.json();
    if (!request.payment_split_id) {
      return new Response(
        JSON.stringify({ error: 'payment_split_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ProcessArtyCommission] Starting for split: ${request.payment_split_id}`);

    // ========================================================================
    // STEP 1: Get the payment split details from OVIS
    // ========================================================================
    console.log(`[ProcessArtyCommission] Step 1: Fetching payment split...`);
    const { data: splitData, error: splitError } = await supabase
      .from('payment_split')
      .select(`
        id,
        broker_id,
        split_broker_total,
        paid,
        paid_date,
        payment:payment_id (
          id,
          payment_name,
          deal:deal_id (
            id,
            deal_name
          )
        ),
        broker:broker_id (
          id,
          name
        )
      `)
      .eq('id', request.payment_split_id)
      .single();

    if (splitError || !splitData) {
      console.error(`[ProcessArtyCommission] Step 1 FAILED:`, splitError);
      throw new Error(`Payment split not found: ${splitError?.message || 'Unknown error'}`);
    }

    const payment = splitData.payment as any;
    const broker = splitData.broker as any;
    const deal = payment?.deal as any;

    if (!broker || !broker.name.toLowerCase().includes('arty')) {
      throw new Error(`This function is only for Arty's commissions. Found broker: ${broker?.name || 'Unknown'}`);
    }

    const grossCommission = Number(splitData.split_broker_total) || 0;
    const dealName = deal?.deal_name || 'Unknown Deal';
    const paymentName = payment?.payment_name || 'Payment';

    console.log(`[ProcessArtyCommission] Step 1 SUCCESS: Deal: ${dealName}, Payment: ${paymentName}, Amount: $${grossCommission}`);

    // ========================================================================
    // STEP 2: Get Arty's commission mapping and draw balance
    // ========================================================================
    console.log(`[ProcessArtyCommission] Step 2: Fetching commission mapping for broker ${broker.id}...`);
    const { data: mapping, error: mappingError } = await supabase
      .from('qb_commission_mapping')
      .select('qb_credit_account_id, qb_credit_account_name, qb_vendor_id, qb_vendor_name')
      .eq('broker_id', broker.id)
      .eq('payment_method', 'journal_entry')
      .eq('is_active', true)
      .single();

    if (mappingError || !mapping?.qb_credit_account_id) {
      console.error(`[ProcessArtyCommission] Step 2 FAILED:`, mappingError);
      throw new Error('No QBO commission mapping configured for Arty. Configure in Settings > QuickBooks.');
    }
    console.log(`[ProcessArtyCommission] Step 2 SUCCESS: Account ${mapping.qb_credit_account_id}`);

    // Get QBO connection
    console.log(`[ProcessArtyCommission] Step 3: Getting QBO connection...`);
    let connection = await getQBConnection(supabase);
    if (!connection) {
      console.error(`[ProcessArtyCommission] Step 3 FAILED: No QBO connection`);
      throw new Error('QuickBooks is not connected');
    }
    console.log(`[ProcessArtyCommission] Step 3 SUCCESS: QBO connected, refreshing token...`);
    connection = await refreshTokenIfNeeded(supabase, connection);
    console.log(`[ProcessArtyCommission] Step 3 SUCCESS: Token refreshed`);

    // Get current balance directly from QBO account
    console.log(`[ProcessArtyCommission] Step 4: Fetching QBO account ${mapping.qb_credit_account_id}...`);
    const accountResult = await qbApiRequest<{ Account: { CurrentBalance?: number; CurrentBalanceWithSubAccounts?: number; Name: string } }>(
      connection,
      'GET',
      `account/${mapping.qb_credit_account_id}`
    );

    console.log(`[ProcessArtyCommission] Step 4 SUCCESS: QBO Account response:`, JSON.stringify(accountResult));

    // QBO may return CurrentBalance or CurrentBalanceWithSubAccounts depending on account type
    const drawBalance = accountResult.Account.CurrentBalance ?? accountResult.Account.CurrentBalanceWithSubAccounts ?? 0;
    const creditApplied = Math.min(grossCommission, drawBalance);
    const drawAfter = Math.max(0, drawBalance - grossCommission);
    const netPayment = Math.max(0, grossCommission - drawBalance);

    console.log(`[ProcessArtyCommission] Draw balance: $${drawBalance}, Credit applied: $${creditApplied}, Draw after: $${drawAfter}, Net payment: $${netPayment}`);

    // If preview_only, return the breakdown + rendered email template without creating anything
    if (request.preview_only) {
      // Look up Arty's email and sender name so the modal can show a real preview
      const { data: brokerUserData } = await supabase
        .from('user')
        .select('email')
        .ilike('name', `%${broker.name}%`)
        .single();
      const artyEmail = brokerUserData?.email || null;

      const { data: senderData } = await supabase
        .from('user')
        .select('name, first_name, last_name')
        .eq('id', internalUserId)
        .single();
      const senderName = senderData?.first_name && senderData?.last_name
        ? `${senderData.first_name} ${senderData.last_name}`
        : senderData?.name || 'OVIS';

      const { subject: previewSubject, bodyText: previewBody } = renderArtyEmail({
        brokerFirstName: broker.name.split(' ')[0],
        dealName,
        paymentName,
        grossCommission,
        drawBefore: drawBalance,
        creditApplied,
        drawAfter,
        netPayment,
        senderName,
      });

      const previewResult: ProcessCommissionResult = {
        success: true,
        broker_name: broker.name,
        deal_name: dealName,
        payment_name: paymentName,
        gross_commission: grossCommission,
        draw_balance: drawBalance,
        draw_before: drawBalance,
        credit_applied: creditApplied,
        draw_after: drawAfter,
        net_payment: netPayment,
        arty_email: artyEmail ?? undefined,
        default_cc: DEFAULT_CC,
        email_subject: previewSubject,
        email_body_text: previewBody,
      };

      return new Response(
        JSON.stringify(previewResult),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 3: Look up "Commissions Paid Out: Santos Real Estate Partners LLC" account
    // This account is used for BOTH the JE debit and the Bill
    // ========================================================================
    const commissionsPaidOutQuery = encodeURIComponent("SELECT * FROM Account WHERE FullyQualifiedName LIKE '%Commissions Paid Out%Santos Real Estate%' AND Active = true");
    const accountSearchResult = await qbApiRequest<{ QueryResponse: { Account?: Array<{ Id: string; Name: string; FullyQualifiedName: string }> } }>(
      connection,
      'GET',
      `query?query=${commissionsPaidOutQuery}`
    );

    let commissionsPaidOutAccountId: string;
    let commissionsPaidOutAccountName: string;

    if (accountSearchResult.QueryResponse.Account && accountSearchResult.QueryResponse.Account.length > 0) {
      const account = accountSearchResult.QueryResponse.Account[0];
      commissionsPaidOutAccountId = account.Id;
      commissionsPaidOutAccountName = account.FullyQualifiedName || account.Name;
      console.log(`[ProcessArtyCommission] Found Commissions Paid Out account: ${commissionsPaidOutAccountName} (${commissionsPaidOutAccountId})`);
    } else {
      // Fallback: try searching for just "Commissions Paid Out"
      const fallbackQuery = encodeURIComponent("SELECT * FROM Account WHERE Name LIKE '%Commissions Paid Out%' AND Active = true");
      const fallbackResult = await qbApiRequest<{ QueryResponse: { Account?: Array<{ Id: string; Name: string; FullyQualifiedName: string }> } }>(
        connection,
        'GET',
        `query?query=${fallbackQuery}`
      );

      if (fallbackResult.QueryResponse.Account && fallbackResult.QueryResponse.Account.length > 0) {
        // Look for one that has Santos in the name
        const santosAccount = fallbackResult.QueryResponse.Account.find(a =>
          a.FullyQualifiedName?.toLowerCase().includes('santos') || a.Name?.toLowerCase().includes('santos')
        );
        const account = santosAccount || fallbackResult.QueryResponse.Account[0];
        commissionsPaidOutAccountId = account.Id;
        commissionsPaidOutAccountName = account.FullyQualifiedName || account.Name;
        console.log(`[ProcessArtyCommission] Found Commissions Paid Out account (fallback): ${commissionsPaidOutAccountName} (${commissionsPaidOutAccountId})`);
      } else {
        throw new Error('Could not find "Commissions Paid Out: Santos Real Estate Partners LLC" account in QuickBooks. Please create this expense account first.');
      }
    }

    // Generate doc number
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
      if (match) nextNumber = parseInt(match[1], 10) + 1;
    }
    const docNumber = `OVIS-${nextNumber}`;

    const today = new Date();
    const transactionDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // OPTION A: JE only credits the draw balance amount to zero out the draw account
    // Journal Entry: Draw balance amount (Commissions Paid Out → Draw Account) - clears the draw
    // Bill: Net payment goes to Commissions Paid Out expense account
    // Both use the same "Commissions Paid Out: Santos Real Estate Partners LLC" account

    // Only create JE if there's a draw balance to clear
    let jeResult: { Id: string; DocNumber?: string } | null = null;

    if (drawBalance > 0) {
      const journalEntry: QBJournalEntry = {
        DocNumber: docNumber,
        TxnDate: transactionDate,
        Line: [
          {
            Amount: drawBalance,
            DetailType: 'JournalEntryLineDetail',
            JournalEntryLineDetail: {
              PostingType: 'Debit',
              AccountRef: { value: commissionsPaidOutAccountId, name: commissionsPaidOutAccountName },
            },
            Description: `Commission (draw offset) - ${dealName} - ${paymentName}`,
          },
          {
            Amount: drawBalance,
            DetailType: 'JournalEntryLineDetail',
            JournalEntryLineDetail: {
              PostingType: 'Credit',
              AccountRef: { value: mapping.qb_credit_account_id, name: mapping.qb_credit_account_name || '' },
            },
            Description: `Commission (draw offset) - ${dealName} - ${paymentName}`,
          },
        ],
        PrivateNote: `OVIS Commission: ${dealName} - ${paymentName} for ${broker.name}. This JE clears draw balance of $${drawBalance.toFixed(2)}. Gross commission: $${grossCommission.toFixed(2)}, Net payment: $${netPayment.toFixed(2)}`,
      };

      jeResult = await createJournalEntry(connection, journalEntry);
      console.log(`[ProcessArtyCommission] Created JE: ${jeResult.DocNumber} to clear draw balance of $${drawBalance}`);
    } else {
      console.log(`[ProcessArtyCommission] No draw balance to clear, skipping JE`);
    }

    // ========================================================================
    // STEP 4: Create Bill for net payment (if > 0)
    // Uses the same Commissions Paid Out account looked up in Step 3
    // ========================================================================
    let billResult: { Id: string; DocNumber?: string } | null = null;

    if (netPayment > 0) {
      // Find or create Santos Real Estate Partners vendor
      const vendor = await findOrCreateVendor(connection, 'Santos Real Estate Partners LLC');

      // Bill posts to "Commissions Paid Out: Santos Real Estate Partners LLC" expense account
      console.log(`[ProcessArtyCommission] Creating bill charged to: ${commissionsPaidOutAccountName} (${commissionsPaidOutAccountId})`);

      const bill: QBBill = {
        VendorRef: { value: vendor.Id, name: vendor.DisplayName },
        Line: [{
          Amount: netPayment,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: commissionsPaidOutAccountId, name: commissionsPaidOutAccountName },
          },
          Description: `Net commission payment - ${dealName} - ${paymentName}`,
        }],
        TxnDate: transactionDate,
        PrivateNote: `OVIS: Net payment after applying draw balance. Gross: $${grossCommission.toFixed(2)}, Draw balance was: $${drawBalance.toFixed(2)}`,
      };

      billResult = await createBill(connection, bill);
      console.log(`[ProcessArtyCommission] Created Bill: ${billResult.DocNumber || billResult.Id}`);
    }

    // ========================================================================
    // STEP 5: Mark payment split as paid
    // ========================================================================
    await supabase
      .from('payment_split')
      .update({ paid: true, paid_date: transactionDate })
      .eq('id', request.payment_split_id);

    // ========================================================================
    // STEP 6: Send email notification
    // ========================================================================
    let emailSent = false;

    if (!request.skip_email) {
      try {
        // Get broker email from user table (broker table doesn't have email)
        const { data: userData } = await supabase
          .from('user')
          .select('email')
          .ilike('name', `%${broker.name}%`)
          .single();
        const brokerEmail = userData?.email;

        if (brokerEmail) {
          // Get Gmail connection
          const { data: gmailConn } = await supabase
            .from('gmail_connection')
            .select('*')
            .eq('user_id', internalUserId)
            .eq('is_active', true)
            .single();

          if (gmailConn) {
            let accessToken = gmailConn.access_token;

            if (isTokenExpired(gmailConn.token_expires_at)) {
              const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
              const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
              const refreshResult = await refreshAccessToken(gmailConn.refresh_token, clientId, clientSecret);
              accessToken = refreshResult.access_token;

              await supabase
                .from('gmail_connection')
                .update({
                  access_token: accessToken,
                  token_expires_at: new Date(Date.now() + refreshResult.expires_in * 1000).toISOString(),
                })
                .eq('id', gmailConn.id);
            }

            // Get sender name
            const { data: senderData } = await supabase
              .from('user')
              .select('name, first_name, last_name')
              .eq('id', internalUserId)
              .single();

            const senderName = senderData?.first_name && senderData?.last_name
              ? `${senderData.first_name} ${senderData.last_name}`
              : senderData?.name || 'OVIS';

            // Render the default subject/body using the shared template; the caller can
            // override either by passing email_overrides (from the preview-and-send modal).
            const { subject: defaultSubject, bodyText: defaultBodyText } = renderArtyEmail({
              brokerFirstName: broker.name.split(' ')[0],
              dealName,
              paymentName,
              grossCommission,
              drawBefore: drawBalance,
              creditApplied,
              drawAfter,
              netPayment,
              senderName,
            });

            const overrides = request.email_overrides || {};
            const toList = overrides.to && overrides.to.length > 0 ? overrides.to : [brokerEmail];
            const ccList = overrides.cc !== undefined ? overrides.cc : DEFAULT_CC;
            const subject = overrides.subject ?? defaultSubject;
            const bodyText = overrides.body_text ?? defaultBodyText;

            await sendEmail(
              accessToken,
              gmailConn.google_email,
              {
                to: toList,
                cc: ccList && ccList.length > 0 ? ccList : undefined,
                subject,
                bodyText,
                fromName: senderName,
              }
            );

            emailSent = true;
            console.log(`[ProcessArtyCommission] Email sent to ${toList.join(', ')}${ccList && ccList.length > 0 ? ` (cc: ${ccList.join(', ')})` : ''}`);
          }
        }
      } catch (emailErr) {
        console.error('[ProcessArtyCommission] Email failed:', emailErr);
        // Don't fail the whole operation for email
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ProcessArtyCommission] Completed in ${duration}ms`);

    const result: ProcessCommissionResult = {
      success: true,
      broker_name: broker.name,
      deal_name: dealName,
      payment_name: paymentName,
      gross_commission: grossCommission,
      draw_balance: drawBalance,
      draw_before: drawBalance,
      credit_applied: creditApplied,
      draw_after: drawAfter,
      net_payment: netPayment,
      journal_entry: jeResult ? {
        id: jeResult.Id,
        doc_number: jeResult.DocNumber || docNumber,
      } : undefined,
      bill: billResult ? {
        id: billResult.Id,
        doc_number: billResult.DocNumber || billResult.Id,
      } : undefined,
      email_sent: emailSent,
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ProcessArtyCommission] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
