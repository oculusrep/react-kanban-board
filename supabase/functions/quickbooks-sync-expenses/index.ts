// Supabase Edge Function: Sync Transactions from QuickBooks
// Pulls Purchase, Bill, Invoice, SalesReceipt, JournalEntry, CreditCardCredit, and VendorCredit transactions for P&L

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  logSync
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QBPurchaseLine {
  Id?: string  // Line item ID
  LineNum?: number
  Amount: number
  DetailType: string
  AccountBasedExpenseLineDetail?: {
    AccountRef: { value: string; name: string }
  }
  Description?: string
}

interface QBPurchase {
  Id: string
  SyncToken: string  // Required for updates
  TxnDate: string
  TotalAmt: number
  EntityRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
  PaymentType?: string
}

interface QBBill {
  Id: string
  SyncToken: string  // Required for updates
  TxnDate: string
  TotalAmt: number
  VendorRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
}

interface QBInvoiceLine {
  Id?: string
  LineNum?: number
  Amount: number
  DetailType: string
  SalesItemLineDetail?: {
    ItemRef: { value: string; name: string }
    Qty?: number
    UnitPrice?: number
  }
  Description?: string
}

interface QBInvoice {
  Id: string
  SyncToken: string
  TxnDate: string
  TotalAmt: number
  CustomerRef?: { name: string; value: string }
  Line: QBInvoiceLine[]
  PrivateNote?: string
  DocNumber?: string
}

interface QBSalesReceipt {
  Id: string
  SyncToken: string
  TxnDate: string
  TotalAmt: number
  CustomerRef?: { name: string; value: string }
  Line: QBInvoiceLine[]
  PrivateNote?: string
  DocNumber?: string
  DepositToAccountRef?: { value: string; name: string }
}

interface QBJournalEntryLine {
  Id?: string
  LineNum?: number
  Amount: number
  DetailType: string
  JournalEntryLineDetail?: {
    PostingType: 'Credit' | 'Debit'
    AccountRef: { value: string; name: string }
  }
  Description?: string
}

interface QBJournalEntry {
  Id: string
  SyncToken: string
  TxnDate: string
  TotalAmt: number
  Line: QBJournalEntryLine[]
  PrivateNote?: string
  DocNumber?: string
}

// Credit Card Credit (refund) - reduces expense
interface QBCreditCardCredit {
  Id: string
  SyncToken: string
  TxnDate: string
  TotalAmt: number
  EntityRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
}

// Vendor Credit - reduces expense (credit from vendor)
interface QBVendorCredit {
  Id: string
  SyncToken: string
  TxnDate: string
  TotalAmt: number
  VendorRef?: { name: string; value: string }
  Line: QBPurchaseLine[]
  PrivateNote?: string
}

interface QBQueryResponse<T> {
  QueryResponse: {
    Purchase?: T[]
    Bill?: T[]
    Invoice?: T[]
    SalesReceipt?: T[]
    JournalEntry?: T[]
    CreditCardCredit?: T[]
    VendorCredit?: T[]
    startPosition?: number
    maxResults?: number
    totalCount?: number
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Parse request body for options
    let startDate = '2024-01-01'  // Default to 2024 to capture all historical data
    let fullSync = false

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.startDate) startDate = body.startDate
        if (body.fullSync) fullSync = body.fullSync
      } catch {
        // Ignore JSON parse errors, use defaults
      }
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify user is authenticated and is admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Check admin role
    const { data: userData, error: roleError } = await supabaseClient
      .from('user')
      .select('ovis_role')
      .eq('auth_user_id', user.id)
      .single()

    if (roleError || userData?.ovis_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Get QB connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    console.log(`Syncing expenses from QuickBooks since ${startDate}...`)

    let totalExpenses = 0
    let errorCount = 0
    const now = new Date().toISOString()
    const PAGE_SIZE = 1000

    // Helper function to process purchase line items
    const processPurchase = async (purchase: QBPurchase) => {
      let lineIndex = 0
      for (const line of purchase.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail' && line.AccountBasedExpenseLineDetail) {
          const accountRef = line.AccountBasedExpenseLineDetail.AccountRef
          // Use LineNum (1-based, unique per transaction) for stable ID, fall back to Id or index
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `purchase_${purchase.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'Purchase',
              transaction_date: purchase.TxnDate,
              vendor_name: purchase.EntityRef?.name || null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || purchase.PrivateNote || null,
              amount: line.Amount,
              imported_at: now,
              sync_token: purchase.SyncToken,
              qb_entity_type: 'Purchase',
              qb_entity_id: purchase.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting purchase expense:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process bill line items
    const processBill = async (bill: QBBill) => {
      let lineIndex = 0
      for (const line of bill.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail' && line.AccountBasedExpenseLineDetail) {
          const accountRef = line.AccountBasedExpenseLineDetail.AccountRef
          // Use LineNum (1-based, unique per transaction) for stable ID, fall back to Id or index
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `bill_${bill.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'Bill',
              transaction_date: bill.TxnDate,
              vendor_name: bill.VendorRef?.name || null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || bill.PrivateNote || null,
              amount: line.Amount,
              imported_at: now,
              sync_token: bill.SyncToken,
              qb_entity_type: 'Bill',
              qb_entity_id: bill.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting bill expense:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process invoice line items (income)
    const processInvoice = async (invoice: QBInvoice) => {
      // For invoices, we need to find the income account
      // QBO invoices don't always have account info on line items
      // We'll store as income with the customer as the "vendor"
      let lineIndex = 0
      for (const line of invoice.Line) {
        if (line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail && line.Amount > 0) {
          const itemRef = line.SalesItemLineDetail.ItemRef
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `invoice_${invoice.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'Invoice',
              transaction_date: invoice.TxnDate,
              vendor_name: invoice.CustomerRef?.name || null,
              category: itemRef.name,
              account_id: itemRef.value,  // This is the Item ID, not account
              account_name: itemRef.name,
              description: line.Description || invoice.PrivateNote || `Invoice #${invoice.DocNumber || invoice.Id}`,
              amount: line.Amount,
              imported_at: now,
              sync_token: invoice.SyncToken,
              qb_entity_type: 'Invoice',
              qb_entity_id: invoice.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting invoice:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process sales receipt line items (income)
    const processSalesReceipt = async (receipt: QBSalesReceipt) => {
      let lineIndex = 0
      for (const line of receipt.Line) {
        if (line.DetailType === 'SalesItemLineDetail' && line.SalesItemLineDetail && line.Amount > 0) {
          const itemRef = line.SalesItemLineDetail.ItemRef
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `salesreceipt_${receipt.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'SalesReceipt',
              transaction_date: receipt.TxnDate,
              vendor_name: receipt.CustomerRef?.name || null,
              category: itemRef.name,
              account_id: itemRef.value,
              account_name: itemRef.name,
              description: line.Description || receipt.PrivateNote || `Receipt #${receipt.DocNumber || receipt.Id}`,
              amount: line.Amount,
              imported_at: now,
              sync_token: receipt.SyncToken,
              qb_entity_type: 'SalesReceipt',
              qb_entity_id: receipt.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting sales receipt:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process journal entry line items
    const processJournalEntry = async (je: QBJournalEntry) => {
      let lineIndex = 0
      for (const line of je.Line) {
        if (line.DetailType === 'JournalEntryLineDetail' && line.JournalEntryLineDetail) {
          const accountRef = line.JournalEntryLineDetail.AccountRef
          const postingType = line.JournalEntryLineDetail.PostingType
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `journalentry_${je.Id}_line${lineId}`

          // For journal entries, Credit to income = income, Debit to expense = expense
          // We store both and let the P&L sort it out by account type
          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: `JournalEntry-${postingType}`,
              transaction_date: je.TxnDate,
              vendor_name: null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || je.PrivateNote || `JE #${je.DocNumber || je.Id}`,
              amount: line.Amount,
              imported_at: now,
              sync_token: je.SyncToken,
              qb_entity_type: 'JournalEntry',
              qb_entity_id: je.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting journal entry:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process credit card credit (refund) line items
    // These REDUCE expenses, so we store with negative amount
    const processCreditCardCredit = async (credit: QBCreditCardCredit) => {
      let lineIndex = 0
      for (const line of credit.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail' && line.AccountBasedExpenseLineDetail) {
          const accountRef = line.AccountBasedExpenseLineDetail.AccountRef
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `creditcardcredit_${credit.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'CreditCardCredit',
              transaction_date: credit.TxnDate,
              vendor_name: credit.EntityRef?.name || null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || credit.PrivateNote || null,
              // Store as NEGATIVE to reduce the expense total
              amount: -line.Amount,
              imported_at: now,
              sync_token: credit.SyncToken,
              qb_entity_type: 'CreditCardCredit',
              qb_entity_id: credit.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting credit card credit:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // Helper function to process vendor credit line items
    // These REDUCE expenses, so we store with negative amount
    const processVendorCredit = async (credit: QBVendorCredit) => {
      let lineIndex = 0
      for (const line of credit.Line) {
        if (line.DetailType === 'AccountBasedExpenseLineDetail' && line.AccountBasedExpenseLineDetail) {
          const accountRef = line.AccountBasedExpenseLineDetail.AccountRef
          const lineId = line.LineNum?.toString() || line.Id || String(lineIndex)
          const transactionId = `vendorcredit_${credit.Id}_line${lineId}`

          const { error: upsertError } = await supabaseClient
            .from('qb_expense')
            .upsert({
              qb_transaction_id: transactionId,
              transaction_type: 'VendorCredit',
              transaction_date: credit.TxnDate,
              vendor_name: credit.VendorRef?.name || null,
              category: accountRef.name,
              account_id: accountRef.value,
              account_name: accountRef.name,
              description: line.Description || credit.PrivateNote || null,
              // Store as NEGATIVE to reduce the expense total
              amount: -line.Amount,
              imported_at: now,
              sync_token: credit.SyncToken,
              qb_entity_type: 'VendorCredit',
              qb_entity_id: credit.Id,
              qb_line_id: lineId
            }, {
              onConflict: 'qb_transaction_id'
            })

          if (upsertError) {
            console.error(`Error upserting vendor credit:`, upsertError)
            errorCount++
          } else {
            totalExpenses++
          }
          lineIndex++
        }
      }
    }

    // ============================================
    // Fetch Purchase transactions with pagination
    // ============================================
    console.log('Fetching Purchase transactions...')
    let purchaseStartPosition = 1
    let totalPurchases = 0

    try {
      while (true) {
        const purchaseQuery = `SELECT * FROM Purchase WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${purchaseStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const purchaseResult = await qbApiRequest<QBQueryResponse<QBPurchase>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(purchaseQuery)}`
        )

        const purchases = purchaseResult.QueryResponse.Purchase || []
        console.log(`Fetched ${purchases.length} Purchase transactions (starting at ${purchaseStartPosition})`)

        if (purchases.length === 0) break

        for (const purchase of purchases) {
          await processPurchase(purchase)
        }

        totalPurchases += purchases.length

        // If we got fewer than PAGE_SIZE, we've reached the end
        if (purchases.length < PAGE_SIZE) break

        purchaseStartPosition += PAGE_SIZE
      }
      console.log(`Total Purchase transactions fetched: ${totalPurchases}`)
    } catch (err: any) {
      console.error('Error fetching purchases:', err.message)
    }

    // ============================================
    // Fetch Bills with pagination
    // ============================================
    console.log('Fetching Bill transactions...')
    let billStartPosition = 1
    let totalBills = 0

    try {
      while (true) {
        const billQuery = `SELECT * FROM Bill WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${billStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const billResult = await qbApiRequest<QBQueryResponse<QBBill>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(billQuery)}`
        )

        const bills = billResult.QueryResponse.Bill || []
        console.log(`Fetched ${bills.length} Bill transactions (starting at ${billStartPosition})`)

        if (bills.length === 0) break

        for (const bill of bills) {
          await processBill(bill)
        }

        totalBills += bills.length

        // If we got fewer than PAGE_SIZE, we've reached the end
        if (bills.length < PAGE_SIZE) break

        billStartPosition += PAGE_SIZE
      }
      console.log(`Total Bill transactions fetched: ${totalBills}`)
    } catch (err: any) {
      console.error('Error fetching bills:', err.message)
    }

    // ============================================
    // Fetch Invoice transactions with pagination (Income)
    // ============================================
    console.log('Fetching Invoice transactions...')
    let invoiceStartPosition = 1
    let totalInvoices = 0

    try {
      while (true) {
        const invoiceQuery = `SELECT * FROM Invoice WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${invoiceStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const invoiceResult = await qbApiRequest<QBQueryResponse<QBInvoice>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(invoiceQuery)}`
        )

        const invoices = invoiceResult.QueryResponse.Invoice || []
        console.log(`Fetched ${invoices.length} Invoice transactions (starting at ${invoiceStartPosition})`)

        if (invoices.length === 0) break

        for (const invoice of invoices) {
          await processInvoice(invoice)
        }

        totalInvoices += invoices.length

        if (invoices.length < PAGE_SIZE) break

        invoiceStartPosition += PAGE_SIZE
      }
      console.log(`Total Invoice transactions fetched: ${totalInvoices}`)
    } catch (err: any) {
      console.error('Error fetching invoices:', err.message)
    }

    // ============================================
    // Fetch SalesReceipt transactions with pagination (Income)
    // ============================================
    console.log('Fetching SalesReceipt transactions...')
    let salesReceiptStartPosition = 1
    let totalSalesReceipts = 0

    try {
      while (true) {
        const salesReceiptQuery = `SELECT * FROM SalesReceipt WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${salesReceiptStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const salesReceiptResult = await qbApiRequest<QBQueryResponse<QBSalesReceipt>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(salesReceiptQuery)}`
        )

        const salesReceipts = salesReceiptResult.QueryResponse.SalesReceipt || []
        console.log(`Fetched ${salesReceipts.length} SalesReceipt transactions (starting at ${salesReceiptStartPosition})`)

        if (salesReceipts.length === 0) break

        for (const receipt of salesReceipts) {
          await processSalesReceipt(receipt)
        }

        totalSalesReceipts += salesReceipts.length

        if (salesReceipts.length < PAGE_SIZE) break

        salesReceiptStartPosition += PAGE_SIZE
      }
      console.log(`Total SalesReceipt transactions fetched: ${totalSalesReceipts}`)
    } catch (err: any) {
      console.error('Error fetching sales receipts:', err.message)
    }

    // ============================================
    // Fetch JournalEntry transactions with pagination
    // ============================================
    console.log('Fetching JournalEntry transactions...')
    let jeStartPosition = 1
    let totalJournalEntries = 0

    try {
      while (true) {
        const jeQuery = `SELECT * FROM JournalEntry WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${jeStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const jeResult = await qbApiRequest<QBQueryResponse<QBJournalEntry>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(jeQuery)}`
        )

        const journalEntries = jeResult.QueryResponse.JournalEntry || []
        console.log(`Fetched ${journalEntries.length} JournalEntry transactions (starting at ${jeStartPosition})`)

        if (journalEntries.length === 0) break

        for (const je of journalEntries) {
          await processJournalEntry(je)
        }

        totalJournalEntries += journalEntries.length

        if (journalEntries.length < PAGE_SIZE) break

        jeStartPosition += PAGE_SIZE
      }
      console.log(`Total JournalEntry transactions fetched: ${totalJournalEntries}`)
    } catch (err: any) {
      console.error('Error fetching journal entries:', err.message)
    }

    // ============================================
    // Fetch CreditCardCredit transactions with pagination (refunds)
    // ============================================
    console.log('Fetching CreditCardCredit transactions...')
    let creditCardCreditStartPosition = 1
    let totalCreditCardCredits = 0

    try {
      while (true) {
        const creditCardCreditQuery = `SELECT * FROM CreditCardCredit WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${creditCardCreditStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const creditCardCreditResult = await qbApiRequest<QBQueryResponse<QBCreditCardCredit>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(creditCardCreditQuery)}`
        )

        const creditCardCredits = creditCardCreditResult.QueryResponse.CreditCardCredit || []
        console.log(`Fetched ${creditCardCredits.length} CreditCardCredit transactions (starting at ${creditCardCreditStartPosition})`)

        if (creditCardCredits.length === 0) break

        for (const credit of creditCardCredits) {
          await processCreditCardCredit(credit)
        }

        totalCreditCardCredits += creditCardCredits.length

        if (creditCardCredits.length < PAGE_SIZE) break

        creditCardCreditStartPosition += PAGE_SIZE
      }
      console.log(`Total CreditCardCredit transactions fetched: ${totalCreditCardCredits}`)
    } catch (err: any) {
      console.error('Error fetching credit card credits:', err.message)
    }

    // ============================================
    // Fetch VendorCredit transactions with pagination (credits from vendors)
    // ============================================
    console.log('Fetching VendorCredit transactions...')
    let vendorCreditStartPosition = 1
    let totalVendorCredits = 0

    try {
      while (true) {
        const vendorCreditQuery = `SELECT * FROM VendorCredit WHERE TxnDate >= '${startDate}' ORDERBY TxnDate DESC STARTPOSITION ${vendorCreditStartPosition} MAXRESULTS ${PAGE_SIZE}`

        const vendorCreditResult = await qbApiRequest<QBQueryResponse<QBVendorCredit>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(vendorCreditQuery)}`
        )

        const vendorCredits = vendorCreditResult.QueryResponse.VendorCredit || []
        console.log(`Fetched ${vendorCredits.length} VendorCredit transactions (starting at ${vendorCreditStartPosition})`)

        if (vendorCredits.length === 0) break

        for (const credit of vendorCredits) {
          await processVendorCredit(credit)
        }

        totalVendorCredits += vendorCredits.length

        if (vendorCredits.length < PAGE_SIZE) break

        vendorCreditStartPosition += PAGE_SIZE
      }
      console.log(`Total VendorCredit transactions fetched: ${totalVendorCredits}`)
    } catch (err: any) {
      console.error('Error fetching vendor credits:', err.message)
    }

    // Log the sync
    await logSync(
      supabaseClient,
      'expense',
      'inbound',
      errorCount === 0 ? 'success' : 'failed',
      undefined,
      'qb_expense',
      undefined,
      errorCount > 0 ? `${errorCount} expenses failed to sync` : undefined
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${totalExpenses} transactions from QuickBooks (${totalPurchases} purchases, ${totalBills} bills, ${totalInvoices} invoices, ${totalSalesReceipts} sales receipts, ${totalJournalEntries} journal entries, ${totalCreditCardCredits} credit card credits, ${totalVendorCredits} vendor credits)`,
        transactionCount: totalExpenses,
        purchases: totalPurchases,
        bills: totalBills,
        invoices: totalInvoices,
        salesReceipts: totalSalesReceipts,
        journalEntries: totalJournalEntries,
        creditCardCredits: totalCreditCardCredits,
        vendorCredits: totalVendorCredits,
        errors: errorCount,
        startDate: startDate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sync expenses error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync expenses'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
