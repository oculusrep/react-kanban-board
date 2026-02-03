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
 */
function parseGeneralLedgerReport(reportData: any): TransactionLine[] {
  const transactions: TransactionLine[] = []

  if (!reportData || !reportData.Rows || !reportData.Rows.Row) {
    return transactions
  }

  let runningBalance = 0
  const rows = reportData.Rows.Row

  // Find the section with the account data
  for (const section of rows) {
    // Skip header rows, look for Row arrays
    if (section.Rows && section.Rows.Row) {
      for (const row of section.Rows.Row) {
        if (row.ColData && Array.isArray(row.ColData)) {
          const colData = row.ColData

          // Parse columns: date, type, doc_num, name, memo, debit, credit, balance
          const date = colData[0]?.value || ''
          const type = colData[1]?.value || ''
          const docNum = colData[2]?.value || null
          const name = colData[3]?.value || null
          const memo = colData[4]?.value || null
          const debit = parseFloat(colData[5]?.value) || 0
          const credit = parseFloat(colData[6]?.value) || 0

          // Skip if no date (likely a subtotal row)
          if (!date || date === '') continue

          runningBalance = runningBalance + debit - credit

          transactions.push({
            id: `${date}-${docNum || Math.random()}`,
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
    } else if (section.ColData && Array.isArray(section.ColData)) {
      // Direct row data
      const colData = section.ColData
      const date = colData[0]?.value || ''
      const type = colData[1]?.value || ''
      const docNum = colData[2]?.value || null
      const name = colData[3]?.value || null
      const memo = colData[4]?.value || null
      const debit = parseFloat(colData[5]?.value) || 0
      const credit = parseFloat(colData[6]?.value) || 0

      if (!date || date === '' || type === 'Beginning Balance') {
        if (type === 'Beginning Balance') {
          // Handle beginning balance
          const balance = parseFloat(colData[7]?.value) || 0
          runningBalance = balance
        }
        continue
      }

      runningBalance = runningBalance + debit - credit

      transactions.push({
        id: `${date}-${docNum || Math.random()}`,
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

  return transactions
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

    // Parse the report
    const transactions = parseGeneralLedgerReport(reportData)

    // Calculate summary
    const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0)
    const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0)
    const netChange = totalDebits - totalCredits

    const response: AccountTransactionsResponse = {
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
      }
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
