// Supabase Edge Function: Update W-9 Attachments on Unpaid Invoices
// One-time utility to update W-9 attachments on all unpaid invoices in QuickBooks
// Run manually once per year when W-9 is updated

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getQBConnection,
  refreshTokenIfNeeded,
  qbApiRequest,
  uploadAttachment,
  logSync
} from '../_shared/quickbooks.ts'
import { downloadFile, INVOICE_ATTACHMENT_FOLDER } from '../_shared/dropbox.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// W-9 filename in Dropbox
const W9_FILENAME = 'W9-Oculus REP - CURRENT.pdf'

interface QBInvoiceQuery {
  Id: string
  DocNumber: string
  CustomerRef: { name: string; value: string }
  TotalAmt: number
  Balance: number
  TxnDate: string
}

interface QBAttachable {
  Id: string
  FileName: string
  AttachableRef?: Array<{
    EntityRef: {
      type: string
      value: string
    }
  }>
}

interface QBQueryResponse<T> {
  QueryResponse: {
    Invoice?: T[]
    Attachable?: QBAttachable[]
    startPosition?: number
    maxResults?: number
    totalCount?: number
  }
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

    // Parse request body for options
    let dryRun = true  // Default to dry run for safety
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (body.dryRun === false) dryRun = false
      } catch {
        // Use defaults
      }
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

    console.log(`Fetching unpaid invoices from QuickBooks (dryRun: ${dryRun})...`)

    // Query for all unpaid invoices (Balance > 0)
    const PAGE_SIZE = 100
    let startPosition = 1
    const unpaidInvoices: QBInvoiceQuery[] = []

    while (true) {
      const query = `SELECT Id, DocNumber, CustomerRef, TotalAmt, Balance, TxnDate FROM Invoice WHERE Balance > '0' ORDERBY TxnDate DESC STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`

      const result = await qbApiRequest<QBQueryResponse<QBInvoiceQuery>>(
        connection,
        'GET',
        `query?query=${encodeURIComponent(query)}`
      )

      const invoices = result.QueryResponse.Invoice || []
      console.log(`Fetched ${invoices.length} unpaid invoices (starting at ${startPosition})`)

      if (invoices.length === 0) break

      unpaidInvoices.push(...invoices)

      if (invoices.length < PAGE_SIZE) break
      startPosition += PAGE_SIZE
    }

    console.log(`Total unpaid invoices found: ${unpaidInvoices.length}`)

    if (unpaidInvoices.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No unpaid invoices found',
          dryRun,
          invoicesProcessed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download the new W-9 from Dropbox
    console.log('Downloading new W-9 from Dropbox...')
    const w9Path = `${INVOICE_ATTACHMENT_FOLDER}/${W9_FILENAME}`
    const w9File = await downloadFile(w9Path)
    console.log(`Downloaded W-9: ${w9File.name} (${w9File.data.length} bytes)`)

    // Process each invoice
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const results: Array<{
      invoiceId: string
      invoiceNumber: string
      customer: string
      action: 'updated' | 'skipped' | 'error'
      oldW9Deleted: boolean
      newW9Uploaded: boolean
      error?: string
    }> = []

    for (const invoice of unpaidInvoices) {
      try {
        console.log(`Processing Invoice #${invoice.DocNumber} (ID: ${invoice.Id}) - ${invoice.CustomerRef.name}`)

        // Query for attachments on this invoice
        const attachmentQuery = `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Invoice' AND AttachableRef.EntityRef.Value = '${invoice.Id}'`

        const attachmentResult = await qbApiRequest<QBQueryResponse<QBAttachable>>(
          connection,
          'GET',
          `query?query=${encodeURIComponent(attachmentQuery)}`
        )

        const attachments = attachmentResult.QueryResponse.Attachable || []
        console.log(`  Found ${attachments.length} attachments`)

        // Find existing W-9 attachments (match by filename containing 'W9' or 'W-9')
        const w9Attachments = attachments.filter(att =>
          att.FileName?.toLowerCase().includes('w9') ||
          att.FileName?.toLowerCase().includes('w-9')
        )

        let oldW9Deleted = false
        let newW9Uploaded = false

        if (dryRun) {
          // Dry run - just report what would happen
          console.log(`  [DRY RUN] Would delete ${w9Attachments.length} old W-9(s) and upload new one`)
          results.push({
            invoiceId: invoice.Id,
            invoiceNumber: invoice.DocNumber,
            customer: invoice.CustomerRef.name,
            action: 'skipped',
            oldW9Deleted: false,
            newW9Uploaded: false
          })
          skippedCount++
        } else {
          // Delete old W-9 attachments
          for (const w9Att of w9Attachments) {
            try {
              console.log(`  Deleting old W-9: ${w9Att.FileName} (ID: ${w9Att.Id})`)

              // Get the full attachable to get SyncToken
              const fullAttachable = await qbApiRequest<{ Attachable: QBAttachable & { SyncToken: string } }>(
                connection,
                'GET',
                `attachable/${w9Att.Id}`
              )

              // Delete the attachable
              await qbApiRequest(
                connection,
                'POST',
                `attachable?operation=delete`,
                {
                  Id: w9Att.Id,
                  SyncToken: fullAttachable.Attachable.SyncToken
                }
              )

              oldW9Deleted = true
              console.log(`  Deleted old W-9: ${w9Att.FileName}`)
            } catch (deleteError: any) {
              console.error(`  Failed to delete W-9 ${w9Att.Id}:`, deleteError.message)
            }
          }

          // Upload new W-9
          try {
            console.log(`  Uploading new W-9: ${w9File.name}`)
            await uploadAttachment(
              connection,
              invoice.Id,
              w9File.data,
              w9File.name,
              'application/pdf'
            )
            newW9Uploaded = true
            console.log(`  Uploaded new W-9 successfully`)
          } catch (uploadError: any) {
            console.error(`  Failed to upload new W-9:`, uploadError.message)
          }

          if (newW9Uploaded) {
            results.push({
              invoiceId: invoice.Id,
              invoiceNumber: invoice.DocNumber,
              customer: invoice.CustomerRef.name,
              action: 'updated',
              oldW9Deleted,
              newW9Uploaded
            })
            updatedCount++
          } else {
            results.push({
              invoiceId: invoice.Id,
              invoiceNumber: invoice.DocNumber,
              customer: invoice.CustomerRef.name,
              action: 'error',
              oldW9Deleted,
              newW9Uploaded,
              error: 'Failed to upload new W-9'
            })
            errorCount++
          }
        }

        // Small delay between invoices to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (invoiceError: any) {
        console.error(`Error processing invoice ${invoice.Id}:`, invoiceError.message)
        results.push({
          invoiceId: invoice.Id,
          invoiceNumber: invoice.DocNumber,
          customer: invoice.CustomerRef.name,
          action: 'error',
          oldW9Deleted: false,
          newW9Uploaded: false,
          error: invoiceError.message
        })
        errorCount++
      }
    }

    // Log the operation
    await logSync(
      supabaseClient,
      'attachment',
      'outbound',
      errorCount === 0 ? 'success' : 'failed',
      undefined,
      'qb_invoice_attachments',
      undefined,
      dryRun ? 'Dry run - no changes made' : `Updated ${updatedCount} invoices, ${errorCount} errors`
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: dryRun
          ? `Dry run complete. Found ${unpaidInvoices.length} unpaid invoices that would be updated.`
          : `Updated W-9 attachments on ${updatedCount} invoices (${errorCount} errors)`,
        dryRun,
        totalUnpaidInvoices: unpaidInvoices.length,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Update W-9 attachments error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to update W-9 attachments'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
