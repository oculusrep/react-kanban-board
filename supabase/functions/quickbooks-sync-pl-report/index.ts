// Supabase Edge Function: Sync P&L Report from QuickBooks
// Fetches the actual P&L report from QBO (includes payroll and all transactions)
// Used for: 1) Payroll data (not available via Accounting API), 2) Full P&L validation

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

// QBO Report response structure
interface QBReportColumn {
  ColTitle: string
  ColType: string
}

interface QBReportRow {
  Header?: {
    ColData: Array<{ value: string; id?: string }>
  }
  Rows?: {
    Row: QBReportRow[]
  }
  Summary?: {
    ColData: Array<{ value: string }>
  }
  ColData?: Array<{ value: string; id?: string }>
  type?: string
  group?: string
}

interface QBProfitAndLossReport {
  Header: {
    Time: string
    ReportName: string
    DateMacro: string
    StartPeriod: string
    EndPeriod: string
    Currency: string
    Option: Array<{ Name: string; Value: string }>
  }
  Columns: {
    Column: QBReportColumn[]
  }
  Rows: {
    Row: QBReportRow[]
  }
}

interface PLLineItem {
  account_name: string
  account_id: string | null
  amount: number
  section: string  // 'Income', 'COGS', 'Expense', 'Other Income', 'Other Expense'
  parent_account: string | null
  ancestor_path: string[]  // Full path from root to parent (e.g., ['Payroll', 'Management'])
  depth: number
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

    // Parse request body for date range and accounting method
    let startDate = `${new Date().getFullYear()}-01-01`
    let endDate = new Date().toISOString().split('T')[0]
    let accountingMethod: 'Accrual' | 'Cash' = 'Accrual'

    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.startDate) startDate = body.startDate
        if (body.endDate) endDate = body.endDate
        if (body.accountingMethod === 'Cash' || body.accountingMethod === 'Accrual') {
          accountingMethod = body.accountingMethod
        }
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

    console.log(`Fetching P&L report from QuickBooks for ${startDate} to ${endDate} (${accountingMethod} basis)...`)

    // Fetch the P&L report from QuickBooks
    // Using dynamic accounting_method (Accrual or Cash)
    const reportParams = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      accounting_method: accountingMethod,
      minorversion: '65'
    })

    const report = await qbApiRequest<QBProfitAndLossReport>(
      connection,
      'GET',
      `reports/ProfitAndLoss?${reportParams.toString()}`
    )

    console.log('P&L Report received, parsing...')

    // Parse the report into line items
    const lineItems: PLLineItem[] = []
    let currentSection = ''

    // Recursive function to parse report rows
    // ancestorPath tracks the full hierarchy (e.g., ['Payroll', 'Management'] for 'Salary - Mike')
    const parseRows = (rows: QBReportRow[], parentAccount: string | null = null, ancestorPath: string[] = [], depth: number = 0) => {
      for (const row of rows) {
        // Section headers
        if (row.Header && row.Header.ColData) {
          const headerName = row.Header.ColData[0]?.value || ''

          // Detect section based on header
          if (headerName === 'Income' || headerName === 'Total Income') {
            currentSection = 'Income'
          } else if (headerName === 'Cost of Goods Sold' || headerName === 'Total Cost of Goods Sold') {
            currentSection = 'COGS'
          } else if (headerName === 'Expenses' || headerName === 'Total Expenses') {
            currentSection = 'Expense'
          } else if (headerName === 'Other Income' || headerName === 'Total Other Income') {
            currentSection = 'Other Income'
          } else if (headerName === 'Other Expenses' || headerName === 'Total Other Expenses') {
            currentSection = 'Other Expense'
          }
        }

        // Data rows (actual account lines)
        if (row.ColData && row.ColData.length >= 2) {
          const accountName = row.ColData[0]?.value || ''
          const accountId = row.ColData[0]?.id || null
          const amountStr = row.ColData[1]?.value || '0'
          const amount = parseFloat(amountStr.replace(/,/g, '')) || 0

          // Skip total/summary rows and empty accounts
          if (accountName &&
              !accountName.startsWith('Total ') &&
              !accountName.includes('Gross Profit') &&
              !accountName.includes('Net Operating Income') &&
              !accountName.includes('Net Income') &&
              amount !== 0) {
            lineItems.push({
              account_name: accountName,
              account_id: accountId,
              amount: amount,
              section: currentSection || 'Unknown',
              parent_account: parentAccount,
              ancestor_path: ancestorPath,
              depth: depth
            })
          }
        }

        // Recursively process nested rows
        if (row.Rows?.Row) {
          const newParent = row.Header?.ColData?.[0]?.value || parentAccount
          // Build full ancestor path for children
          const newAncestorPath = newParent ? [...ancestorPath, newParent] : ancestorPath
          parseRows(row.Rows.Row, newParent, newAncestorPath, depth + 1)
        }
      }
    }

    if (report.Rows?.Row) {
      parseRows(report.Rows.Row)
    }

    // Calculate totals by section
    const totals = {
      income: 0,
      cogs: 0,
      expense: 0,
      otherIncome: 0,
      otherExpense: 0
    }

    for (const item of lineItems) {
      switch (item.section) {
        case 'Income':
          totals.income += item.amount
          break
        case 'COGS':
          totals.cogs += item.amount
          break
        case 'Expense':
          totals.expense += item.amount
          break
        case 'Other Income':
          totals.otherIncome += item.amount
          break
        case 'Other Expense':
          totals.otherExpense += item.amount
          break
      }
    }

    const grossProfit = totals.income - totals.cogs
    const operatingIncome = grossProfit - totals.expense
    const netIncome = operatingIncome + totals.otherIncome - totals.otherExpense

    // Extract payroll items specifically (these aren't available via Accounting API)
    // QuickBooks Payroll creates two types of entries:
    // 1. Wages/Salary under COGS (Payroll > Management > Salary)
    // 2. Employer taxes under Expenses (Taxes and Licenses > FUTA, Medicare, etc.)
    // We filter by BOTH payroll ancestry AND section to separate them correctly
    const isPayrollRelated = (item: PLLineItem) =>
      item.account_name.toLowerCase().includes('payroll') ||
      item.parent_account?.toLowerCase().includes('payroll') ||
      item.ancestor_path.some(ancestor => ancestor.toLowerCase().includes('payroll'))

    // COGS payroll items (wages, salaries) - these go in the COGS section
    const payrollCOGSItems = lineItems.filter(item =>
      item.section === 'COGS' && isPayrollRelated(item)
    )

    // Expense payroll items (employer taxes like FUTA, Medicare, SS, SUTA) - these go in Expenses
    const payrollExpenseItems = lineItems.filter(item =>
      item.section === 'Expense' && isPayrollRelated(item)
    )

    const totalPayrollCOGS = payrollCOGSItems.reduce((sum, item) => sum + item.amount, 0)
    const totalPayrollExpenses = payrollExpenseItems.reduce((sum, item) => sum + item.amount, 0)

    // Log the sync
    await logSync(
      supabaseClient,
      'pl_report',
      'inbound',
      'success',
      undefined,
      'qb_pl_report',
      undefined,
      undefined
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: `P&L report fetched for ${startDate} to ${endDate} (${accountingMethod} basis)`,
        period: {
          startDate,
          endDate
        },
        accountingMethod,
        lineItems: lineItems,
        // Payroll items extracted separately for hybrid mode
        // COGS payroll (wages/salary) - display in COGS section
        payrollCOGSItems: payrollCOGSItems,
        totalPayrollCOGS: totalPayrollCOGS,
        // Expense payroll (employer taxes) - display in Operating Expenses
        payrollExpenseItems: payrollExpenseItems,
        totalPayrollExpenses: totalPayrollExpenses,
        totals: {
          income: totals.income,
          cogs: totals.cogs,
          grossProfit: grossProfit,
          expenses: totals.expense,
          operatingIncome: operatingIncome,
          otherIncome: totals.otherIncome,
          otherExpenses: totals.otherExpense,
          netIncome: netIncome
        },
        reportHeader: report.Header
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Fetch P&L report error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch P&L report'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
