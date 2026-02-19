// Shared QuickBooks Online API utilities for Supabase Edge Functions

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// QBO API Base URLs
const QBO_SANDBOX_API_URL = 'https://sandbox-quickbooks.api.intuit.com'
const QBO_PRODUCTION_API_URL = 'https://quickbooks.api.intuit.com'
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

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
  GivenName?: string    // First name
  FamilyName?: string   // Last name
  PrimaryEmailAddr?: { Address: string }
  BillAddr?: {
    Line1?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  PrimaryPhone?: { FreeFormNumber: string }
  Active?: boolean      // Whether customer is active (true) or inactive (false)
  SyncToken?: string    // Required for updates
}

export interface QBInvoiceLine {
  Amount: number
  DetailType: 'SalesItemLineDetail' | 'DescriptionOnly'
  SalesItemLineDetail?: {
    ItemRef: { value: string; name?: string }
    Qty?: number
    UnitPrice?: number
    ServiceDate?: string  // YYYY-MM-DD format - the date service was provided
  }
  DescriptionLineDetail?: {
    ServiceDate?: string
    TaxCodeRef?: { value: string }
  }
  Description?: string
}

export interface QBInvoice {
  Id?: string
  DocNumber?: string  // Invoice number - required when QBO has "Custom transaction numbers" enabled
  CustomerRef: { value: string; name?: string }
  Line: QBInvoiceLine[]
  DueDate?: string
  TxnDate?: string
  SalesTermRef?: { value: string; name?: string }  // Payment terms reference
  CustomerMemo?: { value: string }
  BillEmail?: { Address: string }
  BillEmailCc?: { Address: string }   // CC email address
  BillEmailBcc?: { Address: string }  // BCC email address
  BillAddr?: {
    Line1?: string  // Contact Name
    Line2?: string  // Company Name
    Line3?: string  // Street Address
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  PrivateNote?: string
}

/**
 * Get the active QBO connection from the database
 */
export async function getQBConnection(supabaseClient: SupabaseClient): Promise<QBConnection | null> {
  const { data, error } = await supabaseClient
    .from('qb_connection')
    .select('*')
    .eq('status', 'connected')
    .single()

  if (error || !data) {
    console.error('No active QBO connection found:', error)
    return null
  }

  return data as QBConnection
}

/**
 * Refresh the access token if expired
 */
export async function refreshTokenIfNeeded(
  supabaseClient: SupabaseClient,
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
    await supabaseClient
      .from('qb_connection')
      .update({ status: 'expired' })
      .eq('id', connection.id)

    throw new Error('Failed to refresh QuickBooks token. Please reconnect.')
  }

  const tokens = await response.json()

  // Update tokens in database
  const newAccessTokenExpiresAt = new Date(now.getTime() + (tokens.expires_in * 1000))
  const newRefreshTokenExpiresAt = new Date(now.getTime() + (100 * 24 * 60 * 60 * 1000)) // 100 days

  const { error: updateError } = await supabaseClient
    .from('qb_connection')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: newAccessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: newRefreshTokenExpiresAt.toISOString()
    })
    .eq('id', connection.id)

  if (updateError) {
    console.error('Failed to save refreshed tokens:', updateError)
    throw new Error('Failed to save refreshed tokens')
  }

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
  const url = environment === 'production' ? QBO_PRODUCTION_API_URL : QBO_SANDBOX_API_URL
  console.log('[QBO] getQBApiUrl called - QUICKBOOKS_ENVIRONMENT:', environment, '| URL:', url)
  return url
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

  // Log the full URL being called
  console.log(`[QBO API] ${method} ${url}`)

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
    const existingCustomer = searchResult.QueryResponse.Customer[0]

    // Check if the customer is inactive and reactivate it
    if (existingCustomer.Active === false) {
      console.log(`Customer "${clientName}" is inactive, reactivating...`)
      try {
        await qbApiRequest(
          connection,
          'POST',
          'customer',
          {
            Id: existingCustomer.Id,
            SyncToken: existingCustomer.SyncToken,
            sparse: true,
            Active: true
          }
        )
        console.log(`Reactivated customer "${clientName}" (ID: ${existingCustomer.Id})`)
      } catch (reactivateError: any) {
        console.error(`Failed to reactivate customer "${clientName}":`, reactivateError.message)
        throw new Error(`Customer "${clientName}" is inactive in QuickBooks and could not be reactivated. Please manually activate the customer in QuickBooks.`)
      }
    }

    // Update existing customer with contact name if provided
    if (billTo?.contactName) {
      console.log(`Processing contact name update for customer ${existingCustomer.Id}: "${billTo.contactName}"`)
      console.log(`Existing customer name - GivenName: "${existingCustomer.GivenName}", FamilyName: "${existingCustomer.FamilyName}"`)

      const nameParts = billTo.contactName.trim().split(/\s+/)
      let givenName: string | undefined
      let familyName: string | undefined

      if (nameParts.length >= 2) {
        givenName = nameParts[0]
        familyName = nameParts.slice(1).join(' ')
      } else if (nameParts.length === 1) {
        givenName = nameParts[0]
      }

      console.log(`Parsed name - GivenName: "${givenName}", FamilyName: "${familyName}"`)

      // Only update if the name has changed
      const needsUpdate = givenName && (existingCustomer.GivenName !== givenName || existingCustomer.FamilyName !== familyName)
      console.log(`Needs update: ${needsUpdate} (GivenName changed: ${existingCustomer.GivenName !== givenName}, FamilyName changed: ${existingCustomer.FamilyName !== familyName})`)

      if (needsUpdate) {
        console.log(`Updating QBO customer ${existingCustomer.Id} with name: ${givenName} ${familyName || ''}`)

        // Need to get SyncToken for update
        const customerQuery = `SELECT * FROM Customer WHERE Id = '${existingCustomer.Id}'`
        const customerResult = await qbApiRequest<{ QueryResponse: { Customer?: Array<{ Id: string; SyncToken: string }> } }>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(customerQuery)}`
        )

        const syncToken = customerResult.QueryResponse.Customer?.[0]?.SyncToken
        if (syncToken) {
          try {
            // Build update payload - only include FamilyName if it has a value
            const updatePayload: Record<string, any> = {
              Id: existingCustomer.Id,
              SyncToken: syncToken,
              sparse: true,
              GivenName: givenName
            }
            if (familyName) {
              updatePayload.FamilyName = familyName
            }

            console.log('Sending QBO customer update:', JSON.stringify(updatePayload))
            await qbApiRequest(
              connection,
              'POST',
              'customer',
              updatePayload
            )
            console.log('Updated QBO customer name successfully')
          } catch (updateError: any) {
            console.error('Failed to update QBO customer name:', updateError.message)
            // Don't fail - continue with the existing customer ID
          }
        }
      }
    }

    return existingCustomer.Id!
  }

  // Create new customer
  const newCustomer: QBCustomer = {
    DisplayName: clientName,
    CompanyName: billTo?.companyName || clientName
  }

  // Parse contact name into first and last name for QBO
  if (billTo?.contactName) {
    const nameParts = billTo.contactName.trim().split(/\s+/)
    if (nameParts.length >= 2) {
      // First word is given name, rest is family name
      newCustomer.GivenName = nameParts[0]
      newCustomer.FamilyName = nameParts.slice(1).join(' ')
    } else if (nameParts.length === 1) {
      // Single name - use as given name
      newCustomer.GivenName = nameParts[0]
    }
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
  // Search for existing item (including inactive items)
  const searchQuery = `SELECT * FROM Item WHERE Name = '${itemName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Item?: { Id: string; Active?: boolean; SyncToken?: string }[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Item && searchResult.QueryResponse.Item.length > 0) {
    const existingItem = searchResult.QueryResponse.Item[0]

    // Check if the item is inactive and reactivate it
    if (existingItem.Active === false) {
      console.log(`Service item "${itemName}" is inactive, reactivating...`)
      try {
        await qbApiRequest(
          connection,
          'POST',
          'item',
          {
            Id: existingItem.Id,
            SyncToken: existingItem.SyncToken,
            sparse: true,
            Active: true
          }
        )
        console.log(`Reactivated service item "${itemName}" (ID: ${existingItem.Id})`)
      } catch (reactivateError: any) {
        console.error(`Failed to reactivate service item "${itemName}":`, reactivateError.message)
        throw new Error(`Service item "${itemName}" is inactive in QuickBooks and could not be reactivated. Please manually activate it in QuickBooks.`)
      }
    }

    return existingItem.Id
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
  const result = await qbApiRequest<{ Invoice: { Id: string; DocNumber?: string } }>(
    connection,
    'POST',
    'invoice',
    invoice
  )

  console.log('QBO createInvoice response:', JSON.stringify(result.Invoice, null, 2))

  // QuickBooks may not return DocNumber immediately in some cases
  // Fall back to Id if DocNumber is not available
  return {
    Id: result.Invoice.Id,
    DocNumber: result.Invoice.DocNumber || result.Invoice.Id
  }
}

/**
 * Send an invoice via email through QuickBooks
 *
 * Note: We do NOT use the sendTo query parameter because it overrides ALL recipients
 * and ignores the BillEmailCc and BillEmailBcc fields stored on the invoice.
 * Instead, we rely on the BillEmail, BillEmailCc, and BillEmailBcc already set on the invoice.
 */
export async function sendInvoice(
  connection: QBConnection,
  invoiceId: string,
  _email?: string  // Kept for backwards compatibility but no longer used
): Promise<void> {
  // Always send without sendTo param so QB uses BillEmail, BillEmailCc, and BillEmailBcc from the invoice
  const endpoint = `invoice/${invoiceId}/send`

  await qbApiRequest(connection, 'POST', endpoint)
  console.log('Invoice sent via QBO:', invoiceId)
}

/**
 * Get an invoice from QuickBooks by ID
 */
export async function getInvoice(
  connection: QBConnection,
  invoiceId: string
): Promise<{ Id: string; SyncToken: string; DueDate?: string; DocNumber?: string }> {
  const result = await qbApiRequest<{ Invoice: { Id: string; SyncToken: string; DueDate?: string; DocNumber?: string } }>(
    connection,
    'GET',
    `invoice/${invoiceId}`
  )
  return result.Invoice
}

/**
 * Delete an invoice from QuickBooks
 * Note: QBO requires SyncToken for deletion (optimistic locking)
 */
export async function deleteInvoice(
  connection: QBConnection,
  invoiceId: string,
  syncToken: string
): Promise<void> {
  console.log(`[QBO API] Deleting invoice ${invoiceId}`)

  await qbApiRequest(
    connection,
    'POST',
    'invoice?operation=delete',
    {
      Id: invoiceId,
      SyncToken: syncToken
    }
  )

  console.log(`Deleted QBO invoice ${invoiceId}`)
}

/**
 * Update an invoice in QuickBooks (sparse update)
 * QBO requires SyncToken for optimistic locking
 */
export async function updateInvoice(
  connection: QBConnection,
  invoiceId: string,
  syncToken: string,
  updates: { DueDate?: string; TxnDate?: string }
): Promise<{ Id: string; SyncToken: string; DueDate?: string; TxnDate?: string; DocNumber?: string }> {
  const result = await qbApiRequest<{ Invoice: { Id: string; SyncToken: string; DueDate?: string; TxnDate?: string; DocNumber?: string } }>(
    connection,
    'POST',
    'invoice?operation=update',
    {
      Id: invoiceId,
      SyncToken: syncToken,
      sparse: true,
      ...updates
    }
  )
  return result.Invoice
}

/**
 * Interface for QuickBooks Attachable (file attachment)
 */
export interface QBAttachable {
  Id?: string
  FileName: string
  ContentType: string
  AttachableRef: Array<{
    EntityRef: {
      type: string
      value: string
    }
    IncludeOnSend: boolean
  }>
}

/**
 * Upload an attachment to a QuickBooks invoice
 * Uses multipart/form-data to upload the file
 * @param connection - QBO connection
 * @param invoiceId - The QBO invoice ID to attach to
 * @param fileData - The file content as Uint8Array
 * @param fileName - The filename for the attachment
 * @param contentType - MIME type of the file (defaults to application/pdf)
 * @returns The created attachable object
 */
export async function uploadAttachment(
  connection: QBConnection,
  invoiceId: string,
  fileData: Uint8Array,
  fileName: string,
  contentType: string = 'application/pdf'
): Promise<{ Id: string; FileName: string }> {
  const baseUrl = getQBApiUrl()
  const url = `${baseUrl}/v3/company/${connection.realm_id}/upload`

  console.log(`[QBO API] Uploading attachment: ${fileName} to invoice ${invoiceId}`)

  // Create the metadata for the attachment
  const metadata: QBAttachable = {
    FileName: fileName,
    ContentType: contentType,
    AttachableRef: [
      {
        EntityRef: {
          type: 'Invoice',
          value: invoiceId
        },
        IncludeOnSend: true  // Include this attachment when sending the invoice
      }
    ]
  }

  // Build multipart form data manually
  // QBO expects: file_metadata_01 (JSON) and file_content_01 (file bytes)
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2)

  // Build the multipart body
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []

  // Part 1: file_metadata_01 (JSON metadata)
  const metadataPart = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file_metadata_01"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    JSON.stringify(metadata) + '\r\n'
  )
  parts.push(metadataPart)

  // Part 2: file_content_01 (file bytes)
  const fileHeaderPart = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file_content_01"; filename="${fileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  )
  parts.push(fileHeaderPart)
  parts.push(fileData)
  parts.push(encoder.encode('\r\n'))

  // Closing boundary
  parts.push(encoder.encode(`--${boundary}--\r\n`))

  // Combine all parts into a single Uint8Array
  const totalLength = parts.reduce((acc, part) => acc + part.length, 0)
  const body = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    body.set(part, offset)
    offset += part.length
  }

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
    console.error(`QBO upload error (${response.status}):`, errorText)
    throw new Error(`QBO upload error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log(`Uploaded attachment ${fileName} to invoice ${invoiceId}:`, result.AttachableResponse?.[0]?.Attachable?.Id)

  return {
    Id: result.AttachableResponse?.[0]?.Attachable?.Id,
    FileName: fileName
  }
}

/**
 * Log a sync operation
 */
export async function logSync(
  supabaseClient: SupabaseClient,
  syncType: 'invoice' | 'payment' | 'expense' | 'customer' | 'vendor' | 'bill' | 'journal_entry',
  direction: 'inbound' | 'outbound',
  status: 'success' | 'failed' | 'pending',
  entityId?: string,
  entityType?: string,
  qbEntityId?: string,
  errorMessage?: string
): Promise<void> {
  await supabaseClient
    .from('qb_sync_log')
    .insert({
      sync_type: syncType,
      direction,
      status,
      entity_id: entityId,
      entity_type: entityType,
      qb_entity_id: qbEntityId,
      error_message: errorMessage
    })
}

// ============================================================================
// Vendor Functions
// ============================================================================

export interface QBVendor {
  Id?: string
  DisplayName: string
  CompanyName?: string
  GivenName?: string
  FamilyName?: string
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  BillAddr?: {
    Line1?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
}

/**
 * Find or create a vendor in QuickBooks
 */
export async function findOrCreateVendor(
  connection: QBConnection,
  vendorName: string,
  options?: {
    companyName?: string
    email?: string
    phone?: string
    street?: string
    city?: string
    state?: string
    zip?: string
  }
): Promise<{ Id: string; DisplayName: string }> {
  // Search for existing vendor by name
  const searchQuery = `SELECT * FROM Vendor WHERE DisplayName = '${vendorName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Vendor?: QBVendor[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Vendor && searchResult.QueryResponse.Vendor.length > 0) {
    const existingVendor = searchResult.QueryResponse.Vendor[0]
    console.log('Found existing QBO vendor:', existingVendor.Id, existingVendor.DisplayName)
    return { Id: existingVendor.Id!, DisplayName: existingVendor.DisplayName }
  }

  // Create new vendor
  const newVendor: QBVendor = {
    DisplayName: vendorName,
    CompanyName: options?.companyName || vendorName
  }

  if (options?.email) {
    newVendor.PrimaryEmailAddr = { Address: options.email }
  }

  if (options?.phone) {
    newVendor.PrimaryPhone = { FreeFormNumber: options.phone }
  }

  if (options?.street || options?.city) {
    newVendor.BillAddr = {
      Line1: options?.street,
      City: options?.city,
      CountrySubDivisionCode: options?.state,
      PostalCode: options?.zip
    }
  }

  const createResult = await qbApiRequest<{ Vendor: QBVendor }>(
    connection,
    'POST',
    'vendor',
    newVendor
  )

  console.log('Created new QBO vendor:', createResult.Vendor.Id, createResult.Vendor.DisplayName)
  return { Id: createResult.Vendor.Id!, DisplayName: createResult.Vendor.DisplayName }
}

/**
 * Get a vendor by ID from QuickBooks
 */
export async function getVendor(
  connection: QBConnection,
  vendorId: string
): Promise<QBVendor | null> {
  try {
    const result = await qbApiRequest<{ Vendor: QBVendor }>(
      connection,
      'GET',
      `vendor/${vendorId}`
    )
    return result.Vendor
  } catch (error) {
    console.error(`Failed to get vendor ${vendorId}:`, error)
    return null
  }
}

// ============================================================================
// Bill Functions
// ============================================================================

export interface QBBillLine {
  Amount: number
  DetailType: 'AccountBasedExpenseLineDetail'
  AccountBasedExpenseLineDetail: {
    AccountRef: { value: string; name?: string }
    BillableStatus?: 'Billable' | 'NotBillable' | 'HasBeenBilled'
    CustomerRef?: { value: string; name?: string }
  }
  Description?: string
}

export interface QBBill {
  Id?: string
  SyncToken?: string
  DocNumber?: string
  VendorRef: { value: string; name?: string }
  Line: QBBillLine[]
  TxnDate?: string  // YYYY-MM-DD format
  DueDate?: string  // YYYY-MM-DD format
  PrivateNote?: string
  APAccountRef?: { value: string; name?: string }
}

/**
 * Create a bill in QuickBooks
 * Bills are used to record money owed to a vendor (Accounts Payable)
 */
export async function createBill(
  connection: QBConnection,
  bill: QBBill
): Promise<{ Id: string; DocNumber?: string }> {
  const result = await qbApiRequest<{ Bill: { Id: string; DocNumber?: string } }>(
    connection,
    'POST',
    'bill',
    bill
  )

  console.log('Created QBO bill:', result.Bill.Id, 'DocNumber:', result.Bill.DocNumber)
  return {
    Id: result.Bill.Id,
    DocNumber: result.Bill.DocNumber
  }
}

/**
 * Get a bill by ID from QuickBooks
 */
export async function getBill(
  connection: QBConnection,
  billId: string
): Promise<{ Id: string; SyncToken: string; DocNumber?: string } | null> {
  try {
    const result = await qbApiRequest<{ Bill: { Id: string; SyncToken: string; DocNumber?: string } }>(
      connection,
      'GET',
      `bill/${billId}`
    )
    return result.Bill
  } catch (error) {
    console.error(`Failed to get bill ${billId}:`, error)
    return null
  }
}

/**
 * Delete a bill from QuickBooks
 */
export async function deleteBill(
  connection: QBConnection,
  billId: string,
  syncToken: string
): Promise<void> {
  await qbApiRequest(
    connection,
    'POST',
    'bill?operation=delete',
    {
      Id: billId,
      SyncToken: syncToken
    }
  )
  console.log(`Deleted QBO bill ${billId}`)
}

// ============================================================================
// Journal Entry Functions
// ============================================================================

export interface QBJournalEntryLine {
  Amount: number
  DetailType: 'JournalEntryLineDetail'
  JournalEntryLineDetail: {
    PostingType: 'Debit' | 'Credit'
    AccountRef: { value: string; name?: string }
    Entity?: {
      Type: 'Customer' | 'Vendor' | 'Employee'
      EntityRef: { value: string; name?: string }
    }
  }
  Description?: string
}

export interface QBJournalEntry {
  Id?: string
  SyncToken?: string
  DocNumber?: string
  TxnDate?: string  // YYYY-MM-DD format
  Line: QBJournalEntryLine[]
  PrivateNote?: string
  Adjustment?: boolean  // Set to true for adjusting entries
}

/**
 * Create a journal entry in QuickBooks
 * Journal entries are used for double-entry bookkeeping (debits and credits must balance)
 */
export async function createJournalEntry(
  connection: QBConnection,
  journalEntry: QBJournalEntry
): Promise<{ Id: string; DocNumber?: string }> {
  // Validate that debits and credits balance
  let totalDebits = 0
  let totalCredits = 0
  for (const line of journalEntry.Line) {
    if (line.JournalEntryLineDetail.PostingType === 'Debit') {
      totalDebits += line.Amount
    } else {
      totalCredits += line.Amount
    }
  }

  // Round to 2 decimal places for comparison
  const roundedDebits = Math.round(totalDebits * 100) / 100
  const roundedCredits = Math.round(totalCredits * 100) / 100

  if (roundedDebits !== roundedCredits) {
    throw new Error(`Journal entry is unbalanced: Debits=${roundedDebits}, Credits=${roundedCredits}`)
  }

  const result = await qbApiRequest<{ JournalEntry: { Id: string; DocNumber?: string } }>(
    connection,
    'POST',
    'journalentry',
    journalEntry
  )

  console.log('Created QBO journal entry:', result.JournalEntry.Id, 'DocNumber:', result.JournalEntry.DocNumber)
  return {
    Id: result.JournalEntry.Id,
    DocNumber: result.JournalEntry.DocNumber
  }
}

/**
 * Get a journal entry by ID from QuickBooks
 */
export async function getJournalEntry(
  connection: QBConnection,
  journalEntryId: string
): Promise<{ Id: string; SyncToken: string; DocNumber?: string } | null> {
  try {
    const result = await qbApiRequest<{ JournalEntry: { Id: string; SyncToken: string; DocNumber?: string } }>(
      connection,
      'GET',
      `journalentry/${journalEntryId}`
    )
    return result.JournalEntry
  } catch (error) {
    console.error(`Failed to get journal entry ${journalEntryId}:`, error)
    return null
  }
}

/**
 * Delete a journal entry from QuickBooks
 */
export async function deleteJournalEntry(
  connection: QBConnection,
  journalEntryId: string,
  syncToken: string
): Promise<void> {
  await qbApiRequest(
    connection,
    'POST',
    'journalentry?operation=delete',
    {
      Id: journalEntryId,
      SyncToken: syncToken
    }
  )
  console.log(`Deleted QBO journal entry ${journalEntryId}`)
}

// ============================================================================
// Account Query Functions
// ============================================================================

export interface QBAccount {
  Id: string
  Name: string
  FullyQualifiedName?: string
  AccountType: string
  AccountSubType?: string
  Active: boolean
}

/**
 * Find an account by name in QuickBooks
 */
export async function findAccountByName(
  connection: QBConnection,
  accountName: string
): Promise<QBAccount | null> {
  const searchQuery = `SELECT * FROM Account WHERE Name = '${accountName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Account?: QBAccount[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Account && searchResult.QueryResponse.Account.length > 0) {
    return searchResult.QueryResponse.Account[0]
  }
  return null
}

/**
 * Find an account by fully qualified name (includes parent account path)
 * Example: "Commissions Paid Out:Bennett Retail Group"
 */
export async function findAccountByFullName(
  connection: QBConnection,
  fullName: string
): Promise<QBAccount | null> {
  const searchQuery = `SELECT * FROM Account WHERE FullyQualifiedName = '${fullName.replace(/'/g, "\\'")}'`
  const searchResult = await qbApiRequest<{ QueryResponse: { Account?: QBAccount[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  if (searchResult.QueryResponse.Account && searchResult.QueryResponse.Account.length > 0) {
    return searchResult.QueryResponse.Account[0]
  }
  return null
}

/**
 * List all accounts of a specific type
 */
export async function listAccountsByType(
  connection: QBConnection,
  accountType: string
): Promise<QBAccount[]> {
  const searchQuery = `SELECT * FROM Account WHERE AccountType = '${accountType}' AND Active = true`
  const searchResult = await qbApiRequest<{ QueryResponse: { Account?: QBAccount[] } }>(
    connection,
    'GET',
    `query?query=${encodeURIComponent(searchQuery)}`
  )

  return searchResult.QueryResponse.Account || []
}
