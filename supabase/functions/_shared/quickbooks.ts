// Shared QuickBooks Online API utilities for Supabase Edge Functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// QBO API Base URLs
const QBO_SANDBOX_API_URL = 'https://sandbox-quickbooks.api.intuit.com'
const QBO_PRODUCTION_API_URL = 'https://quickbooks.api.intuit.com'
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// Create a Supabase client for Edge Functions
// Uses the new secret key format (sb_secret_*)
export function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(supabaseUrl, supabaseKey)
}

// Database helpers using Supabase client (works with new key format)
export async function dbQuery(supabase: SupabaseClient, table: string, select: string, filters?: Record<string, any>): Promise<any[]> {
  let query = supabase.from(table).select(select)

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value)
    }
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Database query error: ${error.message}`)
  }
  return data || []
}

export async function dbInsert(supabase: SupabaseClient, table: string, data: any): Promise<any[]> {
  const { data: result, error } = await supabase
    .from(table)
    .insert(data)
    .select()

  if (error) {
    throw new Error(`Database insert error: ${error.message}`)
  }
  return result || []
}

export async function dbUpdate(supabase: SupabaseClient, table: string, filters: Record<string, any>, data: any): Promise<any[]> {
  let query = supabase.from(table).update(data)

  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }

  const { data: result, error } = await query.select()

  if (error) {
    throw new Error(`Database update error: ${error.message}`)
  }
  return result || []
}

// Legacy PostgREST helpers (kept for backwards compatibility but deprecated)
export async function postgrestQuery(supabaseUrl: string, secretKey: string, table: string, params: string): Promise<any> {
  // Use the new Supabase client approach instead
  const supabase = createSupabaseClient()

  // Parse params to extract select and filters
  const urlParams = new URLSearchParams(params)
  const select = urlParams.get('select') || '*'

  let query = supabase.from(table).select(select)

  // Handle filters (eq, in, etc.)
  for (const [key, value] of urlParams.entries()) {
    if (key !== 'select' && key !== 'limit') {
      // Parse "column=eq.value" format
      if (value.startsWith('eq.')) {
        query = query.eq(key, value.substring(3))
      }
      // Parse "column=in.(value1,value2,...)" format
      else if (value.startsWith('in.(') && value.endsWith(')')) {
        const valuesStr = value.substring(4, value.length - 1) // Extract between "in.(" and ")"
        const values = valuesStr.split(',').map(v => v.trim())
        query = query.in(key, values)
      }
    }
  }

  const limitStr = urlParams.get('limit')
  if (limitStr) {
    query = query.limit(parseInt(limitStr))
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`PostgREST error: ${error.message}`)
  }
  return data || []
}

export async function postgrestInsert(supabaseUrl: string, secretKey: string, table: string, data: any): Promise<any> {
  const supabase = createSupabaseClient()
  const { data: result, error } = await supabase
    .from(table)
    .insert(data)
    .select()

  if (error) {
    throw new Error(`PostgREST insert error: ${error.message}`)
  }
  return result || []
}

export async function postgrestUpdate(supabaseUrl: string, secretKey: string, table: string, params: string, data: any): Promise<any> {
  const supabase = createSupabaseClient()

  // Parse params to extract filters (e.g., "id=eq.uuid")
  const urlParams = new URLSearchParams(params)
  let query = supabase.from(table).update(data)

  for (const [key, value] of urlParams.entries()) {
    if (value.startsWith('eq.')) {
      query = query.eq(key, value.substring(3))
    }
  }

  const { data: result, error } = await query.select()

  if (error) {
    throw new Error(`PostgREST update error: ${error.message}`)
  }
  return result || []
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
  SyncToken?: string
  DisplayName: string
  CompanyName?: string
  GivenName?: string  // First name of contact
  FamilyName?: string  // Last name of contact
  PrimaryEmailAddr?: { Address: string }
  BillAddr?: {
    Line1?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  PrimaryPhone?: { FreeFormNumber: string }
  // Sub-customer support
  Job?: boolean  // True if this is a sub-customer (job)
  ParentRef?: { value: string }  // Reference to parent customer
  PrintOnCheckName?: string  // Name to print on checks
}

export interface QBInvoiceLine {
  Amount: number
  DetailType: 'SalesItemLineDetail'
  SalesItemLineDetail: {
    ItemRef: { value: string; name?: string }
    Qty?: number
    UnitPrice?: number
    ServiceDate?: string  // Service date for the line item (YYYY-MM-DD)
  }
  Description?: string
}

// Description-only line (no product, no amount) - used for broker attribution
export interface QBDescriptionLine {
  Amount: number  // Must be 0 for description-only lines
  DetailType: 'DescriptionOnly'
  DescriptionLineDetail: {
    ServiceDate?: string
  }
  Description: string
}

export interface QBInvoice {
  Id?: string
  DocNumber?: string
  CustomerRef: { value: string; name?: string }
  Line: (QBInvoiceLine | QBDescriptionLine)[]
  DueDate?: string
  TxnDate?: string  // Invoice date
  SalesTermRef?: { value: string; name?: string }  // Payment terms (e.g., "Due on receipt")
  CustomerMemo?: { value: string }
  BillEmail?: { Address: string }
  BillEmailCc?: { Address: string }  // CC recipients
  BillEmailBcc?: { Address: string }  // BCC recipients
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
 * Find or create a parent customer (Client) in QuickBooks
 * This is the top-level customer that sub-customers are organized under
 */
export async function findOrCreateParentCustomer(
  connection: QBConnection,
  clientName: string,
  email?: string
): Promise<string> {
  // Search for existing parent customer by name
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${clientName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Customer?: QBCustomer[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Customer && searchResult.QueryResponse.Customer.length > 0) {
    console.log('Found existing parent customer:', clientName, searchResult.QueryResponse.Customer[0].Id)
    return searchResult.QueryResponse.Customer[0].Id!
  }

  // Create new parent customer (Client)
  const newCustomer: QBCustomer = {
    DisplayName: clientName,
    CompanyName: clientName
  }

  if (email) {
    newCustomer.PrimaryEmailAddr = { Address: email }
  }

  const createResult = await qbApiRequest<{ Customer: QBCustomer }>(
    connection,
    'POST',
    'customer',
    newCustomer
  )

  console.log('Created new parent customer:', clientName, createResult.Customer.Id)
  return createResult.Customer.Id!
}

/**
 * Find or create a sub-customer (Deal) in QuickBooks under a parent customer
 * Sub-customers use the format "Client - Deal" as DisplayName
 * The bill-to company and contact are stored on the sub-customer
 */
export async function findOrCreateSubCustomer(
  connection: QBConnection,
  parentCustomerId: string,
  clientName: string,
  dealName: string,
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
  // Sub-customer display name format: "Client - Deal"
  const subCustomerDisplayName = `${clientName} - ${dealName}`

  // Search for existing sub-customer by name
  const searchQuery = `SELECT * FROM Customer WHERE DisplayName = '${subCustomerDisplayName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Customer?: QBCustomer[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Customer && searchResult.QueryResponse.Customer.length > 0) {
    console.log('Found existing sub-customer:', subCustomerDisplayName, searchResult.QueryResponse.Customer[0].Id)
    return searchResult.QueryResponse.Customer[0].Id!
  }

  // Parse contact name into first/last if provided
  let givenName: string | undefined
  let familyName: string | undefined
  if (billTo?.contactName) {
    const nameParts = billTo.contactName.trim().split(/\s+/)
    if (nameParts.length >= 2) {
      givenName = nameParts[0]
      familyName = nameParts.slice(1).join(' ')
    } else {
      familyName = billTo.contactName
    }
  }

  // Create new sub-customer (Deal)
  const newSubCustomer: QBCustomer = {
    DisplayName: subCustomerDisplayName,
    CompanyName: billTo?.companyName || clientName,
    Job: true,  // Mark as sub-customer/job
    ParentRef: { value: parentCustomerId },
    PrintOnCheckName: clientName  // Use client name on checks
  }

  if (givenName) newSubCustomer.GivenName = givenName
  if (familyName) newSubCustomer.FamilyName = familyName

  if (billTo?.email) {
    newSubCustomer.PrimaryEmailAddr = { Address: billTo.email }
  }

  if (billTo?.street || billTo?.city) {
    newSubCustomer.BillAddr = {
      Line1: billTo?.street,
      City: billTo?.city,
      CountrySubDivisionCode: billTo?.state,
      PostalCode: billTo?.zip
    }
  }

  if (billTo?.phone) {
    newSubCustomer.PrimaryPhone = { FreeFormNumber: billTo.phone }
  }

  const createResult = await qbApiRequest<{ Customer: QBCustomer }>(
    connection,
    'POST',
    'customer',
    newSubCustomer
  )

  console.log('Created new sub-customer:', subCustomerDisplayName, createResult.Customer.Id)
  return createResult.Customer.Id!
}

/**
 * Find or create a customer hierarchy in QuickBooks (Parent + Sub-customer)
 * Returns the sub-customer ID which is used for invoicing
 */
export async function findOrCreateCustomer(
  connection: QBConnection,
  clientName: string,
  dealName: string,
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
  // Step 1: Find or create parent customer (Client)
  const parentCustomerId = await findOrCreateParentCustomer(connection, clientName, email)

  // Step 2: Find or create sub-customer (Deal)
  const subCustomerId = await findOrCreateSubCustomer(
    connection,
    parentCustomerId,
    clientName,
    dealName,
    billTo
  )

  // Return the sub-customer ID for invoicing
  return subCustomerId
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
  // Log the invoice payload for debugging
  console.log('Creating invoice with payload:', JSON.stringify(invoice, null, 2))

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
 * Get an invoice from QuickBooks (needed to get SyncToken for update/delete)
 */
export async function getInvoice(
  connection: QBConnection,
  invoiceId: string
): Promise<QBInvoice & { Id: string; SyncToken: string; DocNumber: string }> {
  const result = await qbApiRequest<{ Invoice: QBInvoice & { Id: string; SyncToken: string; DocNumber: string } }>(
    connection,
    'GET',
    `invoice/${invoiceId}`
  )
  return result.Invoice
}

/**
 * Update an existing invoice in QuickBooks
 * Requires the SyncToken from the current invoice state
 * Uses sparse update - only updates the fields provided
 */
export async function updateInvoice(
  connection: QBConnection,
  invoiceId: string,
  syncToken: string,
  updates: Partial<QBInvoice>
): Promise<{ Id: string; DocNumber: string; SyncToken: string }> {
  // QuickBooks requires Id and SyncToken for updates
  const invoiceUpdate = {
    Id: invoiceId,
    SyncToken: syncToken,
    sparse: true,  // Only update fields that are provided
    ...updates
  }

  console.log('Updating invoice with payload:', JSON.stringify(invoiceUpdate, null, 2))

  const result = await qbApiRequest<{ Invoice: { Id: string; DocNumber: string; SyncToken: string } }>(
    connection,
    'POST',
    'invoice',
    invoiceUpdate
  )

  return {
    Id: result.Invoice.Id,
    DocNumber: result.Invoice.DocNumber,
    SyncToken: result.Invoice.SyncToken
  }
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

// ============================================================================
// Attachment API Functions
// ============================================================================

export interface QBAttachable {
  Id?: string
  SyncToken?: string
  FileName: string
  ContentType: string
  AttachableRef?: Array<{
    EntityRef: {
      type: string
      value: string
    }
    IncludeOnSend?: boolean  // When true, attachment is auto-selected for email
  }>
}

/**
 * Upload a file attachment to QuickBooks and optionally link it to an entity
 * Uses multipart/form-data as required by the QuickBooks Attachable API
 *
 * @param connection - QBO connection
 * @param fileData - The file content as Uint8Array
 * @param fileName - Name of the file
 * @param contentType - MIME type (e.g., 'application/pdf')
 * @param entityType - Optional: Type of entity to link to (e.g., 'Invoice')
 * @param entityId - Optional: ID of entity to link to
 * @param includeOnSend - Optional: If true, attachment is auto-selected when sending invoice via email (default: true)
 * @returns The created attachable object with Id
 */
export async function uploadAttachment(
  connection: QBConnection,
  fileData: Uint8Array,
  fileName: string,
  contentType: string,
  entityType?: string,
  entityId?: string,
  includeOnSend: boolean = true
): Promise<{ Id: string; FileName: string }> {
  const baseUrl = getQBApiUrl()
  const url = `${baseUrl}/v3/company/${connection.realm_id}/upload`

  // Build the metadata object
  const attachableMetadata: QBAttachable = {
    FileName: fileName,
    ContentType: contentType
  }

  // If linking to an entity, add the reference with IncludeOnSend flag
  if (entityType && entityId) {
    attachableMetadata.AttachableRef = [{
      EntityRef: {
        type: entityType,
        value: entityId
      },
      IncludeOnSend: includeOnSend  // Auto-select attachment for email when true
    }]
  }

  // QuickBooks expects multipart/form-data with:
  // 1. "file_metadata_01" - JSON metadata about the attachment
  // 2. "file_content_01" - The actual file content
  const boundary = `----QBBoundary${Date.now()}`

  // Build multipart body manually
  const encoder = new TextEncoder()
  const metadataJson = JSON.stringify(attachableMetadata)

  const parts: Uint8Array[] = []

  // Part 1: File metadata (JSON)
  const metadataPart = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file_metadata_01"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${metadataJson}\r\n`
  )
  parts.push(metadataPart)

  // Part 2: File content
  const fileHeader = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file_content_01"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  )
  parts.push(fileHeader)
  parts.push(fileData)
  parts.push(encoder.encode('\r\n'))

  // End boundary
  parts.push(encoder.encode(`--${boundary}--\r\n`))

  // Combine all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const body = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.length
  }

  console.log(`Uploading attachment: ${fileName} (${fileData.length} bytes)`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${connection.access_token}`,
      'Accept': 'application/json',
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: body
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`QBO Upload error (${response.status}):`, errorText)
    throw new Error(`QBO Upload error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log('Attachment uploaded successfully:', result.AttachableResponse?.[0]?.Attachable?.Id)

  // QuickBooks returns an array of responses
  const attachable = result.AttachableResponse?.[0]?.Attachable
  if (!attachable) {
    throw new Error('Invalid response from QuickBooks upload API')
  }

  return {
    Id: attachable.Id,
    FileName: attachable.FileName
  }
}

/**
 * Link an existing attachment to an entity (e.g., Invoice)
 * Use this if you uploaded a file without linking it initially
 */
export async function linkAttachmentToEntity(
  connection: QBConnection,
  attachableId: string,
  syncToken: string,
  entityType: string,
  entityId: string
): Promise<void> {
  const attachableUpdate = {
    Id: attachableId,
    SyncToken: syncToken,
    AttachableRef: [{
      EntityRef: {
        type: entityType,
        value: entityId
      }
    }]
  }

  await qbApiRequest(
    connection,
    'POST',
    'attachable',
    attachableUpdate
  )

  console.log(`Linked attachment ${attachableId} to ${entityType} ${entityId}`)
}
