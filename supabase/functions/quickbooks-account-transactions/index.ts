import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  QBConnection
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AccountTransactionsRequest {
  accountId: string      // QBO Account ID
  accountName?: string   // For display purposes
  startDate?: string     // YYYY-MM-DD format
  endDate?: string       // YYYY-MM-DD format
}

interface TransactionLine {
  id: string
  date: string
  type: string
  docNumber: string | null
  name: string | null     // Customer/Vendor name
  memo: string | null
  debit: number
  credit: number
  balance: number
}

interface AccountTransactionsResponse {
  accountId: string
  accountName: string
  accountType: string
  currentBalance: number
  startDate: string
  endDate: string
  transactions: TransactionLine[]
  summary: {
    totalDebits: number
    totalCredits: number
    netChange: number
  }
}

/**
 * Fetch the General Ledger report for a specific account
 */
async function fetchAccountTransactions(
  connection: QBConnection,
  accountId: string,
  startDate: string,
  endDate: string
): Promise<any> {
  // Use the GeneralLedger report with account filter
  const reportQuery = new URLSearchParams({
    account: accountId,
    start_date: startDate,
    end_date: endDate,
    columns: 'tx_date,txn_type,doc_num,name,memo,debit_amount,credit_amount,subt_nat_home_amount',
    sort_by: 'tx_date',
    sort_order: 'ascend'
  })

  const result = await qbApiRequest<any>(
    connection,
    'GET',
    `reports/GeneralLedger?${reportQuery.toString()}`
  )

  return result
}

/**
 * Get account details including current balance
 */
async function getAccountDetails(
  connection: QBConnection,
  accountId: string
): Promise<{ name: string; type: string; balance: number }> {
  const result = await qbApiRequest<{ Account: { Name: string; AccountType: string; CurrentBalance?: number } }>(
    connection,
    'GET',
    `account/${accountId}`
  )

  return {
    name: result.Account.Name,
    type: result.Account.AccountType,
    balance: result.Account.CurrentBalance || 0
  }
}

/**
 * Parse the General Ledger report into a structured format
 * QBO Report structure can vary - this handles the common formats
 */
function parseGeneralLedgerReport(reportData: any): { transactions: TransactionLine[], debug: any } {
  const transactions: TransactionLine[] = []
  const debug: any = {
    hasRows: !!reportData?.Rows,
    hasRowArray: !!reportData?.Rows?.Row,
    rowCount: reportData?.Rows?.Row?.length || 0,
    columns: reportData?.Columns?.Column?.map((c: any) => c.ColTitle) || [],
    sampleRows: []
  }

  if (!reportData || !reportData.Rows || !reportData.Rows.Row) {
    return { transactions, debug }
  }

  // Get column mapping from the report
  const columns = reportData.Columns?.Column || []
  const colMap: Record<string, number> = {}
  columns.forEach((col: any, idx: number) => {
    const title = (col.ColTitle || col.ColType || '').toLowerCase()
    if (title.includes('date')) colMap['date'] = idx
    if (title.includes('type') || title === 'transaction type') colMap['type'] = idx
    if (title.includes('num') || title.includes('doc')) colMap['docNum'] = idx
    if (title.includes('name')) colMap['name'] = idx
    if (title.includes('memo') || title.includes('description')) colMap['memo'] = idx
    if (title.includes('debit') || title === 'amount') colMap['debit'] = idx
    if (title.includes('credit')) colMap['credit'] = idx
    if (title.includes('balance')) colMap['balance'] = idx
  })
  debug.columnMapping = colMap

  let runningBalance = 0
  const rows = reportData.Rows.Row

  // Recursive function to extract data rows
  function extractRows(rowArray: any[], depth = 0) {
    for (const row of rowArray) {
      // Capture sample for debugging
      if (debug.sampleRows.length < 5 && row.ColData) {
        debug.sampleRows.push({
          depth,
          type: row.type,
          colData: row.ColData?.map((c: any) => ({ value: c.value, id: c.id }))
        })
      }

      // If this row has nested rows, recurse
      if (row.Rows && row.Rows.Row) {
        extractRows(row.Rows.Row, depth + 1)
        continue
      }

      // Process data rows
      if (row.ColData && Array.isArray(row.ColData) && row.type === 'Data') {
        const colData = row.ColData

        // Try to extract values using column mapping, with fallbacks
        const date = colData[colMap['date']]?.value || colData[0]?.value || ''
        const type = colData[colMap['type']]?.value || colData[1]?.value || ''
        const docNum = colData[colMap['docNum']]?.value || colData[2]?.value || null
        const name = colData[colMap['name']]?.value || colData[3]?.value || null
        const memo = colData[colMap['memo']]?.value || colData[4]?.value || null

        // For debit/credit, look for 'Amount' column or specific debit/credit columns
        let debit = 0
        let credit = 0

        if (colMap['debit'] !== undefined) {
          debit = parseFloat(colData[colMap['debit']]?.value) || 0
        }
        if (colMap['credit'] !== undefined) {
          credit = parseFloat(colData[colMap['credit']]?.value) || 0
        }

        // If there's an 'amount' column without separate debit/credit
        // positive = debit (money out), negative = credit (money in)
        if (colMap['debit'] === colMap['credit'] || (debit === 0 && credit === 0)) {
          const amountIdx = colMap['debit'] !== undefined ? colMap['debit'] : 5
          const amount = parseFloat(colData[amountIdx]?.value) || 0
          if (amount > 0) {
            debit = amount
          } else if (amount < 0) {
            credit = Math.abs(amount)
          }
        }

        // Skip if no date (likely a subtotal row)
        if (!date || date === '') continue
        // Skip beginning balance rows
        if (type.toLowerCase().includes('beginning balance')) {
          const balanceVal = parseFloat(colData[colMap['balance']]?.value || colData[7]?.value) || 0
          runningBalance = balanceVal
          continue
        }

        runningBalance = runningBalance + debit - credit

        transactions.push({
          id: `${date}-${docNum || transactions.length}`,
          date,
          type,
          docNumber: docNum,
          name,
          memo,
          debit,
          credit,
          balance: runningBalance
        })
      }
    }
  }

  extractRows(rows)
  debug.transactionCount = transactions.length

  return { transactions, debug }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')

    // Use service role client for database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token', details: userError?.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get request body
    const { accountId, accountName, startDate, endDate } = await req.json() as AccountTransactionsRequest

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'accountId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Fetching account transactions for:', accountId)

    // Get the QBO connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected. Please connect in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    // Default date range: beginning of current year to today
    const today = new Date()
    const defaultStartDate = `${today.getFullYear()}-01-01`
    const defaultEndDate = today.toISOString().split('T')[0]

    const effectiveStartDate = startDate || defaultStartDate
    const effectiveEndDate = endDate || defaultEndDate

    // Get account details
    const accountDetails = await getAccountDetails(connection, accountId)

    // Fetch the General Ledger report
    const reportData = await fetchAccountTransactions(
      connection,
      accountId,
      effectiveStartDate,
      effectiveEndDate
    )

    console.log('Raw QBO Report structure:', JSON.stringify(reportData, null, 2).substring(0, 2000))

    // Parse the report
    const { transactions, debug } = parseGeneralLedgerReport(reportData)

    console.log('Parse debug:', JSON.stringify(debug, null, 2))

    // Calculate summary
    const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0)
    const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0)
    const netChange = totalDebits - totalCredits

    const response: AccountTransactionsResponse & { debug?: any } = {
      accountId,
      accountName: accountName || accountDetails.name,
      accountType: accountDetails.type,
      currentBalance: accountDetails.balance,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      transactions,
      summary: {
        totalDebits,
        totalCredits,
        netChange
      },
      // Include debug info temporarily to help diagnose the parsing issue
      debug
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Account transactions error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch account transactions'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
