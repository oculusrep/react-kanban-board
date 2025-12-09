// Shared QuickBooks Online API utilities for Supabase Edge Functions

// QBO API Base URLs
const QBO_SANDBOX_API_URL = 'https://sandbox-quickbooks.api.intuit.com'
const QBO_PRODUCTION_API_URL = 'https://quickbooks.api.intuit.com'
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// PostgREST API helpers for new format secret key
export async function postgrestQuery(supabaseUrl: string, secretKey: string, table: string, params: string): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PostgREST error: ${response.status} - ${error}`)
  }
  return response.json()
}

export async function postgrestInsert(supabaseUrl: string, secretKey: string, table: string, data: any): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PostgREST insert error: ${response.status} - ${error}`)
  }
  return response.json()
}

export async function postgrestUpdate(supabaseUrl: string, secretKey: string, table: string, params: string, data: any): Promise<any> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': secretKey,
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`PostgREST update error: ${response.status} - ${error}`)
  }
  return response.json()
}

export interface QBConnection {
  id: string
  realm_id: string
  access_token: string
  refresh_token: string
  access_token_expires_at: string
  refresh_token_expires_at: string
  status: string
}

export interface QBCustomer {
  Id?: string
  DisplayName: string
  CompanyName?: string
  PrimaryEmailAddr?: { Address: string }
  BillAddr?: {
    Line1?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  PrimaryPhone?: { FreeFormNumber: string }
}

export interface QBInvoiceLine {
  Amount: number
  DetailType: 'SalesItemLineDetail'
  SalesItemLineDetail: {
    ItemRef: { value: string; name?: string }
    Qty?: number
    UnitPrice?: number
  }
  Description?: string
}

export interface QBInvoice {
  Id?: string
  DocNumber?: string
  CustomerRef: { value: string; name?: string }
  Line: QBInvoiceLine[]
  DueDate?: string
  TxnDate?: string
  CustomerMemo?: { value: string }
  BillEmail?: { Address: string }
  BillAddr?: {
    Line1?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  PrivateNote?: string
}

/**
 * Get the active QBO connection from the database
 */
export async function getQBConnection(supabaseUrl: string, secretKey: string): Promise<QBConnection | null> {
  try {
    const connections = await postgrestQuery(
      supabaseUrl,
      secretKey,
      'qb_connection',
      'select=*&status=eq.connected&limit=1'
    )

    if (!connections || connections.length === 0) {
      console.error('No active QBO connection found')
      return null
    }

    return connections[0] as QBConnection
  } catch (error) {
    console.error('Error fetching QBO connection:', error)
    return null
  }
}

/**
 * Refresh the access token if expired
 */
export async function refreshTokenIfNeeded(
  supabaseUrl: string,
  secretKey: string,
  connection: QBConnection
): Promise<QBConnection> {
  const expiresAt = new Date(connection.access_token_expires_at)
  const now = new Date()

  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return connection // Token is still valid
  }

  console.log('Access token expired or expiring soon, refreshing...')

  const clientId = Deno.env.get('QUICKBOOKS_CLIENT_ID')
  const clientSecret = Deno.env.get('QUICKBOOKS_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('QuickBooks credentials not configured')
  }

  const response = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Token refresh failed:', errorText)

    // Mark connection as expired
    await postgrestUpdate(supabaseUrl, secretKey, 'qb_connection', `id=eq.${connection.id}`, { status: 'expired' })

    throw new Error('Failed to refresh QuickBooks token. Please reconnect.')
  }

  const tokens = await response.json()

  // Update tokens in database
  const newAccessTokenExpiresAt = new Date(now.getTime() + (tokens.expires_in * 1000))
  const newRefreshTokenExpiresAt = new Date(now.getTime() + (100 * 24 * 60 * 60 * 1000)) // 100 days

  await postgrestUpdate(supabaseUrl, secretKey, 'qb_connection', `id=eq.${connection.id}`, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: newAccessTokenExpiresAt.toISOString(),
    refresh_token_expires_at: newRefreshTokenExpiresAt.toISOString()
  })

  return {
    ...connection,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: newAccessTokenExpiresAt.toISOString(),
    refresh_token_expires_at: newRefreshTokenExpiresAt.toISOString()
  }
}

/**
 * Get the QBO API base URL based on environment
 */
export function getQBApiUrl(): string {
  const environment = Deno.env.get('QUICKBOOKS_ENVIRONMENT') || 'sandbox'
  return environment === 'production' ? QBO_PRODUCTION_API_URL : QBO_SANDBOX_API_URL
}

/**
 * Make an authenticated request to the QBO API
 */
export async function qbApiRequest<T>(
  connection: QBConnection,
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  body?: object
): Promise<T> {
  const baseUrl = getQBApiUrl()
  const url = `${baseUrl}/v3/company/${connection.realm_id}/${endpoint}`

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${connection.access_token}`
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`QBO API error (${response.status}):`, errorText)
    throw new Error(`QBO API error: ${response.status} - ${errorText}`)
  }

  return response.json()
}

/**
 * Find or create a customer in QuickBooks
 */
export async function findOrCreateCustomer(
  connection: QBConnection,
  clientName: string,
  email?: string,
  billTo?: {
    companyName?: string
    contactName?: string
    email?: string
    street?: string
    city?: string
    state?: string
    zip?: string
    phone?: string
  }
): Promise<string> {
  // Search for existing customer by name
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${clientName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Customer?: QBCustomer[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Customer && searchResult.QueryResponse.Customer.length > 0) {
    return searchResult.QueryResponse.Customer[0].Id!
  }

  // Create new customer
  const newCustomer: QBCustomer = {
    DisplayName: clientName,
    CompanyName: billTo?.companyName || clientName
  }

  if (billTo?.email || email) {
    newCustomer.PrimaryEmailAddr = { Address: billTo?.email || email! }
  }

  if (billTo?.street || billTo?.city) {
    newCustomer.BillAddr = {
      Line1: billTo?.street,
      City: billTo?.city,
      CountrySubDivisionCode: billTo?.state,
      PostalCode: billTo?.zip
    }
  }

  if (billTo?.phone) {
    newCustomer.PrimaryPhone = { FreeFormNumber: billTo.phone }
  }

  const createResult = await qbApiRequest<{ Customer: QBCustomer }>(
    connection,
    'POST',
    'customer',
    newCustomer
  )

  console.log('Created new QBO customer:', createResult.Customer.Id)
  return createResult.Customer.Id!
}

/**
 * Find or create a service/product item in QuickBooks
 */
export async function findOrCreateServiceItem(
  connection: QBConnection,
  itemName: string
): Promise<string> {
  // Search for existing item
  const searchQuery = `SELECT * FROM Item WHERE Name = '${itemName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Item?: { Id: string }[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Item && searchResult.QueryResponse.Item.length > 0) {
    return searchResult.QueryResponse.Item[0].Id
  }

  // Create new service item
  const newItem = {
    Name: itemName,
    Type: 'Service',
    IncomeAccountRef: {
      value: '1' // Default income account - may need to be configured
    }
  }

  const createResult = await qbApiRequest<{ Item: { Id: string } }>(
    connection,
    'POST',
    'item',
    newItem
  )

  console.log('Created new QBO service item:', createResult.Item.Id)
  return createResult.Item.Id
}

/**
 * Create an invoice in QuickBooks
 */
export async function createInvoice(
  connection: QBConnection,
  invoice: QBInvoice
): Promise<{ Id: string; DocNumber: string }> {
  const result = await qbApiRequest<{ Invoice: { Id: string; DocNumber: string } }>(
    connection,
    'POST',
    'invoice',
    invoice
  )

  return {
    Id: result.Invoice.Id,
    DocNumber: result.Invoice.DocNumber
  }
}

/**
 * Send an invoice via email through QuickBooks
 */
export async function sendInvoice(
  connection: QBConnection,
  invoiceId: string,
  email?: string
): Promise<void> {
  const endpoint = email
    ? `invoice/${invoiceId}/send?sendTo=${encodeURIComponent(email)}`
    : `invoice/${invoiceId}/send`

  await qbApiRequest(connection, 'POST', endpoint)
  console.log('Invoice sent via QBO:', invoiceId)
}

/**
 * Get an invoice from QuickBooks (needed to get SyncToken for delete)
 */
export async function getInvoice(
  connection: QBConnection,
  invoiceId: string
): Promise<{ Id: string; SyncToken: string; DocNumber: string }> {
  const result = await qbApiRequest<{ Invoice: { Id: string; SyncToken: string; DocNumber: string } }>(
    connection,
    'GET',
    `invoice/${invoiceId}`
  )
  return result.Invoice
}

/**
 * Delete (void) an invoice in QuickBooks
 * Note: QuickBooks doesn't truly delete invoices - it voids them
 */
export async function deleteInvoice(
  connection: QBConnection,
  invoiceId: string,
  syncToken: string
): Promise<void> {
  // QuickBooks requires the full invoice object with SyncToken to delete
  await qbApiRequest(
    connection,
    'POST',
    'invoice?operation=delete',
    {
      Id: invoiceId,
      SyncToken: syncToken
    }
  )
  console.log('Invoice deleted/voided in QBO:', invoiceId)
}

/**
 * Log a sync operation
 */
export async function logSync(
  supabaseUrl: string,
  secretKey: string,
  syncType: 'invoice' | 'payment' | 'expense' | 'customer' | 'vendor' | 'bill',
  direction: 'inbound' | 'outbound',
  status: 'success' | 'failed' | 'pending',
  entityId?: string,
  entityType?: string,
  qbEntityId?: string,
  errorMessage?: string
): Promise<void> {
  await postgrestInsert(supabaseUrl, secretKey, 'qb_sync_log', {
    sync_type: syncType,
    direction,
    status,
    entity_id: entityId,
    entity_type: entityType,
    qb_entity_id: qbEntityId,
    error_message: errorMessage
  })
}

/**
 * Update the last_sync_at timestamp on the connection
 */
export async function updateConnectionLastSync(
  supabaseUrl: string,
  secretKey: string,
  connectionId: string
): Promise<void> {
  await postgrestUpdate(supabaseUrl, secretKey, 'qb_connection', `id=eq.${connectionId}`, {
    last_sync_at: new Date().toISOString()
  })
}
