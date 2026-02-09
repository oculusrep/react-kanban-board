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
  // Request specific columns including doc_num for document numbers
  const reportQuery = new URLSearchParams({
    account: accountId,
    start_date: startDate,
    end_date: endDate,
    sort_by: 'tx_date',
    sort_order: 'ascend',
    columns: 'tx_date,txn_type,doc_num,name,memo,subt_nat_amount,rbal_nat_amount'
  })

  const result = await qbApiRequest<any>(
    connection,
    'GET',
    `reports/GeneralLedger?${reportQuery.toString()}`
  )

  console.log('GL Report columns:', JSON.stringify(result?.Columns?.Column?.map((c: any) => ({ title: c.ColTitle, type: c.ColType }))))

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
function parseGeneralLedgerReport(reportData: any): TransactionLine[] {
  const transactions: TransactionLine[] = []

  if (!reportData || !reportData.Rows || !reportData.Rows.Row) {
    return transactions
  }

  // Get column mapping from the report - QBO uses ColTitle or ColType
  const columns = reportData.Columns?.Column || []
  const colMap: Record<string, number> = {}

  columns.forEach((col: any, idx: number) => {
    const title = (col.ColTitle || '').toLowerCase()
    const colType = (col.ColType || '').toLowerCase()

    // Date column
    if (title.includes('date') || colType === 'date' || colType === 'tx_date') {
      colMap['date'] = idx
    }
    // Transaction type
    if (title.includes('type') || title === 'transaction type' || colType === 'txn_type') {
      colMap['type'] = idx
    }
    // Document number
    if (title.includes('num') || title.includes('doc') || colType === 'doc_num') {
      colMap['docNum'] = idx
    }
    // Name
    if (title.includes('name') || colType === 'name') {
      colMap['name'] = idx
    }
    // Memo/Description
    if (title.includes('memo') || title.includes('description') || colType === 'memo') {
      colMap['memo'] = idx
    }
    // Amount - QBO GL often uses single Amount column
    if (title === 'amount' || colType === 'amount' || colType === 'subt_nat_amount' || colType === 'subt_nat_home_amount') {
      colMap['amount'] = idx
    }
    // Debit
    if (title.includes('debit') || colType === 'debit_amount' || colType === 'debit') {
      colMap['debit'] = idx
    }
    // Credit
    if (title.includes('credit') || colType === 'credit_amount' || colType === 'credit') {
      colMap['credit'] = idx
    }
    // Balance
    if (title.includes('balance') || colType === 'balance' || colType === 'nat_home_open_bal' || colType === 'running_balance') {
      colMap['balance'] = idx
    }
  })

  let runningBalance = 0
  const rows = reportData.Rows.Row

  // Recursive function to extract data rows
  function extractRows(rowArray: any[], depth = 0) {
    for (const row of rowArray) {
      // If this row has nested rows, recurse
      if (row.Rows && row.Rows.Row) {
        extractRows(row.Rows.Row, depth + 1)
        continue
      }

      // Process data rows - be more lenient about row.type
      // Some QBO reports don't have type='Data', they just have ColData
      if (row.ColData && Array.isArray(row.ColData)) {
        const colData = row.ColData

        // Skip rows that don't have enough columns or are summary rows
        if (colData.length < 3) {
          continue
        }

        // Try to extract the transaction ID from ColData - QBO sometimes includes it as an 'id' attribute
        // The ID is typically on the transaction type column or doc_num column
        let txnId: string | null = null
        for (const col of colData) {
          if (col.id) {
            txnId = col.id
            break
          }
        }

        // Try to extract values using column mapping, with fallbacks
        const date = colData[colMap['date']]?.value || colData[0]?.value || ''
        const type = colData[colMap['type']]?.value || colData[1]?.value || ''
        const docNum = colData[colMap['docNum']]?.value || colData[2]?.value || null
        const name = colData[colMap['name']]?.value || colData[3]?.value || null
        const memo = colData[colMap['memo']]?.value || colData[4]?.value || null

        // For debit/credit - try multiple approaches
        let debit = 0
        let credit = 0

        // First try explicit debit/credit columns
        if (colMap['debit'] !== undefined && colData[colMap['debit']]?.value) {
          const val = colData[colMap['debit']].value
          debit = parseFloat(String(val).replace(/[,$]/g, '')) || 0
        }
        if (colMap['credit'] !== undefined && colData[colMap['credit']]?.value) {
          const val = colData[colMap['credit']].value
          credit = parseFloat(String(val).replace(/[,$]/g, '')) || 0
        }

        // If no debit/credit found, try the amount column
        if (debit === 0 && credit === 0 && colMap['amount'] !== undefined) {
          const amountVal = colData[colMap['amount']]?.value
          if (amountVal) {
            const amount = parseFloat(String(amountVal).replace(/[,$]/g, '')) || 0
            // For liability accounts (like draw accounts), positive usually means credit (commission earned)
            // negative means debit (draw taken)
            if (amount > 0) {
              credit = amount  // Commission credited to account
            } else if (amount < 0) {
              debit = Math.abs(amount)  // Draw from account
            }
          }
        }

        // Last resort: try to find any numeric value in the later columns
        if (debit === 0 && credit === 0) {
          for (let i = 5; i < colData.length; i++) {
            const val = colData[i]?.value
            if (val && typeof val === 'string' && /^-?\$?[\d,]+\.?\d*$/.test(val.trim())) {
              const amount = parseFloat(val.replace(/[,$]/g, '')) || 0
              if (amount > 0) {
                credit = amount
              } else if (amount < 0) {
                debit = Math.abs(amount)
              }
              break
            }
          }
        }

        // Skip if no date (likely a subtotal or header row)
        if (!date || date === '' || date === 'Total' || date.toLowerCase().includes('total')) {
          continue
        }

        // Skip beginning balance rows
        if (type.toLowerCase().includes('beginning balance')) {
          // Try to capture beginning balance
          if (colMap['balance'] !== undefined) {
            const balanceVal = colData[colMap['balance']]?.value
            if (balanceVal) {
              runningBalance = parseFloat(String(balanceVal).replace(/[,$]/g, '')) || 0
            }
          }
          continue
        }

        runningBalance = runningBalance + debit - credit

        transactions.push({
          id: txnId || `${date}-${docNum || transactions.length}`,
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

  // Log first few transactions for debugging
  if (transactions.length > 0) {
    console.log('Sample transactions:', JSON.stringify(transactions.slice(0, 3)))
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
