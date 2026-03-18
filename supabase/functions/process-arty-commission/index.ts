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

interface ProcessCommissionRequest {
  payment_split_id: string;
  skip_email?: boolean;
  preview_only?: boolean;  // If true, just return the breakdown without creating anything
}

interface ProcessCommissionResult {
  success: boolean;
  broker_name: string;
  deal_name: string;
  gross_commission: number;
  draw_balance: number;
  net_payment: number;
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
    const netPayment = Math.max(0, grossCommission - drawBalance);

    console.log(`[ProcessArtyCommission] Draw balance: $${drawBalance}, Net payment: $${netPayment}`);

    // If preview_only, return the breakdown without creating anything
    if (request.preview_only) {
      const previewResult: ProcessCommissionResult = {
        success: true,
        broker_name: broker.name,
        deal_name: dealName,
        gross_commission: grossCommission,
        draw_balance: drawBalance,
        net_payment: netPayment,
      };

      return new Response(
        JSON.stringify(previewResult),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // STEP 3: Create Journal Entry (Commission Expense → Draw Account)
    // ========================================================================
    // Get Commission Expense account (usually ID 100 or search for it)
    const { data: commissionAccount } = await supabase
      .from('qb_account')
      .select('qb_account_id, name')
      .ilike('name', '%commission%expense%')
      .eq('active', true)
      .limit(1)
      .single();

    const commissionExpenseAccountId = commissionAccount?.qb_account_id || '100';
    const commissionExpenseAccountName = commissionAccount?.name || 'Commission Expense';

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

    const journalEntry: QBJournalEntry = {
      DocNumber: docNumber,
      TxnDate: transactionDate,
      Line: [
        {
          Amount: grossCommission,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Debit',
            AccountRef: { value: commissionExpenseAccountId, name: commissionExpenseAccountName },
          },
          Description: `Commission - ${dealName} - ${paymentName}`,
        },
        {
          Amount: grossCommission,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Credit',
            AccountRef: { value: mapping.qb_credit_account_id, name: mapping.qb_credit_account_name || '' },
          },
          Description: `Commission - ${dealName} - ${paymentName}`,
        },
      ],
      PrivateNote: `OVIS Commission: ${dealName} - ${paymentName} for ${broker.name}`,
    };

    const jeResult = await createJournalEntry(connection, journalEntry);
    console.log(`[ProcessArtyCommission] Created JE: ${jeResult.DocNumber}`);

    // ========================================================================
    // STEP 4: Create Bill for net payment (if > 0)
    // ========================================================================
    let billResult: { Id: string; DocNumber?: string } | null = null;

    if (netPayment > 0) {
      // Find or create Santos Real Estate Partners vendor
      const vendor = await findOrCreateVendor(connection, 'Santos Real Estate Partners');

      const bill: QBBill = {
        VendorRef: { value: vendor.Id, name: vendor.DisplayName },
        Line: [{
          Amount: netPayment,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: mapping.qb_credit_account_id, name: mapping.qb_credit_account_name || '' },
          },
          Description: `Net commission payment - ${dealName} - ${paymentName}`,
        }],
        TxnDate: transactionDate,
        PrivateNote: `OVIS: Net payment after applying draw balance. Gross: $${grossCommission.toFixed(2)}, Draw: $${drawBalance.toFixed(2)}`,
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

            const formatCurrency = (amount: number) =>
              new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

            const subject = `Commission Payment - ${dealName}`;
            const bodyText = `Hi ${broker.name.split(' ')[0]},

A commission payment for ${dealName} has been processed.

COMMISSION BREAKDOWN:
-----------------------------------------
Gross Commission:        ${formatCurrency(grossCommission)}
Less Draw Balance:       (${formatCurrency(drawBalance)})
-----------------------------------------
Net Payment:             ${formatCurrency(netPayment)}

${netPayment > 0
  ? 'This amount will be deposited via direct deposit.'
  : 'This commission has been applied to your outstanding draw balance.'}

Best,
${senderName}
OVIS Commercial Real Estate`;

            await sendEmail(
              accessToken,
              gmailConn.google_email,
              {
                to: [brokerEmail],
                subject,
                bodyText,
                fromName: senderName,
              }
            );

            emailSent = true;
            console.log(`[ProcessArtyCommission] Email sent to ${brokerEmail}`);
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
      gross_commission: grossCommission,
      draw_balance: drawBalance,
      net_payment: netPayment,
      journal_entry: {
        id: jeResult.Id,
        doc_number: jeResult.DocNumber || docNumber,
      },
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
