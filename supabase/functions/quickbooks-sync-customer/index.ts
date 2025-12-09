import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  logSync,
  updateConnectionLastSync,
  postgrestQuery,
  postgrestUpdate,
  QBConnection,
  QBCustomer
} from '../_shared/quickbooks.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SyncCustomerRequest {
  clientId: string
}

/**
 * Find a customer in QuickBooks by DisplayName
 */
async function findCustomerByName(
  connection: QBConnection,
  displayName: string
): Promise<QBCustomer | null> {
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Customer?: QBCustomer[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Customer && searchResult.QueryResponse.Customer.length > 0) {
    return searchResult.QueryResponse.Customer[0]
  }
  return null
}

/**
 * Get a customer from QuickBooks by ID (needed for updates to get SyncToken)
 */
async function getCustomerById(
  connection: QBConnection,
  customerId: string
): Promise<QBCustomer | null> {
  try {
    const result = await qbApiRequest<{ Customer: QBCustomer }>(
      connection,
      'GET',
      `customer/${customerId}`
    )
    return result.Customer
  } catch (error) {
    console.error('Error fetching customer by ID:', error)
    return null
  }
}

/**
 * Create a customer in QuickBooks
 */
async function createCustomer(
  connection: QBConnection,
  customer: QBCustomer
): Promise<QBCustomer> {
  const result = await qbApiRequest<{ Customer: QBCustomer }>(
    connection,
    'POST',
    'customer',
    customer
  )
  return result.Customer
}

/**
 * Update a customer in QuickBooks
 */
async function updateCustomer(
  connection: QBConnection,
  customer: QBCustomer
): Promise<QBCustomer> {
  const result = await qbApiRequest<{ Customer: QBCustomer }>(
    connection,
    'POST',
    'customer',
    customer
  )
  return result.Customer
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

    // Get request body
    const { clientId } = await req.json() as SyncCustomerRequest

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'clientId is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
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

    // Fetch the client from OVIS
    const clients = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'client',
      `select=id,client_name,parent_id,qb_customer_id,phone,billing_street,billing_city,billing_state,billing_zip&id=eq.${clientId}`
    )

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const client = clients[0]

    // If client has a parent, ensure parent is synced first
    let parentQbCustomerId: string | null = null
    if (client.parent_id) {
      const parents = await postgrestQuery(
        supabaseUrl,
        secretKey,
        'client',
        `select=id,client_name,qb_customer_id&id=eq.${client.parent_id}`
      )

      if (parents && parents.length > 0) {
        const parent = parents[0]

        if (!parent.qb_customer_id) {
          // Parent not synced yet - need to sync parent first
          return new Response(
            JSON.stringify({
              error: `Parent client "${parent.client_name}" must be synced to QuickBooks first`,
              parentClientId: parent.id,
              parentClientName: parent.client_name
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        parentQbCustomerId = parent.qb_customer_id
      }
    }

    let qbCustomer: QBCustomer
    let action: 'created' | 'updated' | 'linked'

    if (client.qb_customer_id) {
      // Client already linked to QB - update the existing customer
      const existingCustomer = await getCustomerById(connection, client.qb_customer_id)

      if (!existingCustomer) {
        // QB customer was deleted - need to create new one
        console.log('QB customer not found, creating new one')
        client.qb_customer_id = null
      } else {
        // Update the existing customer
        const updateData: any = {
          Id: existingCustomer.Id,
          SyncToken: existingCustomer.SyncToken,
          DisplayName: client.client_name,
          CompanyName: client.client_name
        }

        // Update parent reference if changed
        if (parentQbCustomerId) {
          updateData.ParentRef = { value: parentQbCustomerId }
          updateData.Job = true
        } else if (existingCustomer.ParentRef && !client.parent_id) {
          // Parent was removed - can't easily remove parent in QB, just update other fields
          console.log('Note: Cannot remove parent relationship in QuickBooks via API')
        }

        // Update contact info
        if (client.phone) {
          updateData.PrimaryPhone = { FreeFormNumber: client.phone }
        }
        if (client.billing_street || client.billing_city) {
          updateData.BillAddr = {
            Line1: client.billing_street,
            City: client.billing_city,
            CountrySubDivisionCode: client.billing_state,
            PostalCode: client.billing_zip
          }
        }

        qbCustomer = await updateCustomer(connection, updateData)
        action = 'updated'
      }
    }

    if (!client.qb_customer_id) {
      // Check if customer already exists in QB by name
      const existingByName = await findCustomerByName(connection, client.client_name)

      if (existingByName) {
        // Found existing customer - link it
        qbCustomer = existingByName
        action = 'linked'
        console.log('Found existing QB customer by name, linking:', existingByName.Id)
      } else {
        // Create new customer in QB
        const newCustomer: any = {
          DisplayName: client.client_name,
          CompanyName: client.client_name
        }

        // Set parent reference for sub-customer
        if (parentQbCustomerId) {
          newCustomer.ParentRef = { value: parentQbCustomerId }
          newCustomer.Job = true
        }

        // Add contact info
        if (client.phone) {
          newCustomer.PrimaryPhone = { FreeFormNumber: client.phone }
        }
        if (client.billing_street || client.billing_city) {
          newCustomer.BillAddr = {
            Line1: client.billing_street,
            City: client.billing_city,
            CountrySubDivisionCode: client.billing_state,
            PostalCode: client.billing_zip
          }
        }

        qbCustomer = await createCustomer(connection, newCustomer)
        action = 'created'
        console.log('Created new QB customer:', qbCustomer.Id)
      }
    }

    // Update the OVIS client with the QB customer ID
    await postgrestUpdate(supabaseUrl, secretKey, 'client', `id=eq.${clientId}`, {
      qb_customer_id: qbCustomer!.Id
    })

    // Log the sync
    await logSync(
      supabaseUrl,
      secretKey,
      'customer',
      'outbound',
      'success',
      clientId,
      'client',
      qbCustomer!.Id
    )

    // Update connection last sync timestamp
    await updateConnectionLastSync(supabaseUrl, secretKey, connection.id)

    return new Response(
      JSON.stringify({
        success: true,
        action,
        qbCustomerId: qbCustomer!.Id,
        qbDisplayName: qbCustomer!.DisplayName,
        message: `Customer ${action} in QuickBooks: ${qbCustomer!.DisplayName}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Sync customer error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync customer'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
