import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getQBConnection, refreshTokenIfNeeded, getQBApiUrl } from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseClient = createClient(supabaseUrl, serviceRoleKey)

    // Get connection
    let connection = await getQBConnection(supabaseClient)
    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks not connected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseClient, connection)

    const qbEnv = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox'
    const productionUrl = 'https://quickbooks.api.intuit.com'
    const sandboxUrl = 'https://sandbox-quickbooks.api.intuit.com'

    // Try BOTH production and sandbox APIs to see which one works
    const results: any = {
      storedRealmId: connection.realm_id,
      configuredEnvironment: qbEnv,
      productionApiUrl: productionUrl,
      sandboxApiUrl: sandboxUrl,
    }

    // Query CompanyInfo from PRODUCTION API
    try {
      const prodResponse = await fetch(
        `${productionUrl}/v3/company/${connection.realm_id}/companyinfo/${connection.realm_id}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${connection.access_token}`
          }
        }
      )
      if (prodResponse.ok) {
        const data = await prodResponse.json()
        results.productionApi = {
          status: 'SUCCESS',
          companyName: data.CompanyInfo?.CompanyName,
          companyId: data.CompanyInfo?.Id,
        }
      } else {
        const errorText = await prodResponse.text()
        results.productionApi = {
          status: 'FAILED',
          httpStatus: prodResponse.status,
          error: errorText.substring(0, 500)
        }
      }
    } catch (e: any) {
      results.productionApi = { status: 'ERROR', message: e.message }
    }

    // Query CompanyInfo from SANDBOX API
    try {
      const sandboxResponse = await fetch(
        `${sandboxUrl}/v3/company/${connection.realm_id}/companyinfo/${connection.realm_id}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${connection.access_token}`
          }
        }
      )
      if (sandboxResponse.ok) {
        const data = await sandboxResponse.json()
        results.sandboxApi = {
          status: 'SUCCESS',
          companyName: data.CompanyInfo?.CompanyName,
          companyId: data.CompanyInfo?.Id,
        }
      } else {
        const errorText = await sandboxResponse.text()
        results.sandboxApi = {
          status: 'FAILED',
          httpStatus: sandboxResponse.status,
          error: errorText.substring(0, 500)
        }
      }
    } catch (e: any) {
      results.sandboxApi = { status: 'ERROR', message: e.message }
    }

    // Also try with the sandbox realm ID to see if that works
    const sandboxRealmId = '9341455860188054'
    try {
      const sandboxRealmResponse = await fetch(
        `${sandboxUrl}/v3/company/${sandboxRealmId}/companyinfo/${sandboxRealmId}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${connection.access_token}`
          }
        }
      )
      if (sandboxRealmResponse.ok) {
        const data = await sandboxRealmResponse.json()
        results.sandboxWithSandboxRealmId = {
          status: 'SUCCESS',
          companyName: data.CompanyInfo?.CompanyName,
          companyId: data.CompanyInfo?.Id,
          note: 'THIS CONFIRMS TOKENS ARE SANDBOX TOKENS!'
        }
      } else {
        results.sandboxWithSandboxRealmId = {
          status: 'FAILED',
          httpStatus: sandboxRealmResponse.status,
        }
      }
    } catch (e: any) {
      results.sandboxWithSandboxRealmId = { status: 'ERROR', message: e.message }
    }

    // Query recent invoices from production to see what's there
    try {
      const invoiceQueryResponse = await fetch(
        `${productionUrl}/v3/company/${connection.realm_id}/query?query=${encodeURIComponent('SELECT * FROM Invoice ORDER BY Id DESC MAXRESULTS 5')}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${connection.access_token}`
          }
        }
      )
      if (invoiceQueryResponse.ok) {
        const data = await invoiceQueryResponse.json()
        results.recentInvoicesInProduction = {
          status: 'SUCCESS',
          invoices: data.QueryResponse?.Invoice?.map((inv: any) => ({
            id: inv.Id,
            docNumber: inv.DocNumber,
            customerName: inv.CustomerRef?.name,
            totalAmt: inv.TotalAmt
          })) || []
        }
      } else {
        const errorText = await invoiceQueryResponse.text()
        results.recentInvoicesInProduction = {
          status: 'FAILED',
          httpStatus: invoiceQueryResponse.status,
          error: errorText.substring(0, 300)
        }
      }
    } catch (e: any) {
      results.recentInvoicesInProduction = { status: 'ERROR', message: e.message }
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Debug error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
