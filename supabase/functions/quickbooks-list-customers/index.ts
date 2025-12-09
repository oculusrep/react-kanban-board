import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  QBConnection,
  QBCustomer
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ListCustomersRequest {
  search?: string  // Optional search term
  maxResults?: number
}

interface CustomerListItem {
  id: string
  displayName: string
  companyName?: string
  email?: string
  isSubCustomer: boolean
  parentId?: string
  parentName?: string
  fullyQualifiedName?: string
  active: boolean
}

/**
 * Query customers from QuickBooks
 */
async function queryCustomers(
  connection: QBConnection,
  search?: string,
  maxResults: number = 1000
): Promise<CustomerListItem[]> {
  let query = `SELECT * FROM Customer`

  if (search) {
    // Search by DisplayName (case-insensitive LIKE)
    query += ` WHERE DisplayName LIKE '%${search.replace(/'/g, "\\'")}%'`
  }

  query += ` MAXRESULTS ${maxResults}`

  const result = await qbApiRequest<{ QueryResponse: { Customer?: any[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(query)}`
  )

  if (!result.QueryResponse.Customer) {
    return []
  }

  return result.QueryResponse.Customer.map(c => ({
    id: c.Id,
    displayName: c.DisplayName,
    companyName: c.CompanyName,
    email: c.PrimaryEmailAddr?.Address,
    isSubCustomer: !!c.ParentRef,
    parentId: c.ParentRef?.value,
    parentName: c.ParentRef?.name,
    fullyQualifiedName: c.FullyQualifiedName,
    active: c.Active !== false
  }))
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authorization header is present
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !secretKey) {
      throw new Error('Supabase configuration missing')
    }

    // Get request body (optional for GET-like behavior)
    let search: string | undefined
    let maxResults = 1000

    if (req.method === 'POST') {
      const body = await req.json() as ListCustomersRequest
      search = body.search
      maxResults = body.maxResults || 1000
    }

    // Get the QBO connection
    let connection = await getQBConnection(supabaseUrl, secretKey)

    if (!connection) {
      return new Response(
        JSON.stringify({ error: 'QuickBooks is not connected. Please connect in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Refresh token if needed
    connection = await refreshTokenIfNeeded(supabaseUrl, secretKey, connection)

    // Query customers
    const customers = await queryCustomers(connection, search, maxResults)

    // Sort by fullyQualifiedName to group parents with children
    customers.sort((a, b) => {
      const nameA = a.fullyQualifiedName || a.displayName
      const nameB = b.fullyQualifiedName || b.displayName
      return nameA.localeCompare(nameB)
    })

    return new Response(
      JSON.stringify({
        success: true,
        customers,
        count: customers.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('List customers error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to list customers'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
