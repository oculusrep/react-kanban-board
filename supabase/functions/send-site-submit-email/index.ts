/**
 * Send Site Submit Email Edge Function
 *
 * Sends site submit emails via Gmail API on behalf of the authenticated user.
 * Uses the user's Gmail connection to send emails that appear in their Sent folder.
 *
 * Migrated from Resend to Gmail for consistency with Hunter outreach emails.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getUserIdFromAuthHeader } from '../_shared/jwt.ts'
import {
  sendEmail,
  refreshAccessToken,
  isTokenExpired,
  type GmailConnection,
  type SendEmailOptions,
} from '../_shared/gmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Attachment {
  filename: string
  content: string // Base64 encoded
  content_type: string
}

interface SiteSubmitEmailRequest {
  siteSubmitId: string
  submitterEmail?: string
  customEmail?: {
    to: string[]
    cc: string[]
    bcc: string[]
    subject: string
    htmlBody: string
    attachments?: Attachment[]
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { siteSubmitId, submitterEmail, customEmail } = await req.json() as SiteSubmitEmailRequest

    if (!siteSubmitId) {
      throw new Error('siteSubmitId is required')
    }

    // Create Supabase client with service role key for admin access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get the authenticated user's ID from the JWT token using local verification
    const authHeader = req.headers.get('Authorization')
    let userEmail = submitterEmail
    let authUserId: string | null = null
    let userId: string | null = null

    // Always try to get authUserId from JWT for activity logging
    if (authHeader) {
      try {
        // Use local JWT verification instead of network call to auth.getUser()
        authUserId = await getUserIdFromAuthHeader(authHeader)

        // Get the user record from our user table
        if (authUserId) {
          const { data: userData } = await supabaseClient
            .from('user')
            .select('id, email, name, first_name, last_name')
            .eq('auth_user_id', authUserId)
            .single()

          if (userData) {
            userId = userData.id
            if (!userEmail) {
              userEmail = userData.email
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
      }
    }

    if (!userEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User email not found. Please ensure you are logged in.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Gmail connection for this user
    const { data: connection, error: connError } = await supabaseClient
      .from('gmail_connection')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (connError || !connection) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Gmail not connected',
          details: 'Please connect your Gmail account in Settings to send emails.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const gmailConnection = connection as GmailConnection

    // Check if token needs refresh
    let accessToken = gmailConnection.access_token

    if (isTokenExpired(gmailConnection.token_expires_at)) {
      console.log(`[Site Submit Email] Refreshing token for ${gmailConnection.google_email}`)

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

      const refreshResult = await refreshAccessToken(
        gmailConnection.refresh_token,
        clientId,
        clientSecret
      )

      accessToken = refreshResult.access_token

      // Update stored token
      const newExpiresAt = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString()
      await supabaseClient
        .from('gmail_connection')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq('id', gmailConnection.id)
    }

    // Get sender display name
    const { data: senderData } = await supabaseClient
      .from('user')
      .select('name, first_name, last_name')
      .eq('id', userId)
      .single()

    const senderName = senderData?.name ||
      (senderData?.first_name && senderData?.last_name ? `${senderData.first_name} ${senderData.last_name}` : null) ||
      senderData?.first_name ||
      null

    // If custom email is provided, use it directly
    if (customEmail) {
      // Prepare email options for Gmail
      const emailOptions: SendEmailOptions = {
        to: customEmail.to,
        cc: customEmail.cc.length > 0 ? customEmail.cc : undefined,
        bcc: customEmail.bcc.length > 0 ? customEmail.bcc : undefined,
        subject: customEmail.subject,
        bodyHtml: customEmail.htmlBody,
        fromName: senderName || undefined,
      }

      // Send the email via Gmail
      const sendResult = await sendEmail(
        accessToken,
        gmailConnection.google_email,
        emailOptions
      )

      if (!sendResult.success) {
        console.error('[Site Submit Email] Failed to send:', sendResult.error)
        return new Response(
          JSON.stringify({
            success: false,
            error: sendResult.error,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`[Site Submit Email] Email sent successfully: ${sendResult.messageId}`)

      // Log activity for custom email send
      try {
        console.log('📧 Starting activity logging for custom email...')

        console.log('📝 Inserting activity record...')
        // Create activity record for the email send
        const { data: activityData, error: activityError } = await supabaseClient
          .from('activity')
          .insert({
            activity_type_id: null,
            related_object_type: 'site_submit',
            related_object_id: siteSubmitId,
            activity_date: new Date().toISOString(),
            created_by_id: userId,
            owner_id: userId,
            subject: 'Site Submit Email',
            description: `Site submit email sent via Gmail to ${customEmail.to.length} recipient(s): ${customEmail.to.join(', ')}`,
            sf_status: 'Completed'
          })
          .select()

        if (activityError) {
          console.error('❌ Error logging activity:', activityError)
        } else {
          console.log('✅ Activity logged successfully:', activityData)
        }

        console.log('📝 Updating site_submit metadata...')
        // Get current site_submit to check if date_submitted is null
        const { data: siteSubmit } = await supabaseClient
          .from('site_submit')
          .select('date_submitted, submit_stage_id')
          .eq('id', siteSubmitId)
          .single()

        // Get the "Submitted-Reviewing" stage ID
        const { data: submittedReviewingStage } = await supabaseClient
          .from('submit_stage')
          .select('id')
          .eq('name', 'Submitted-Reviewing')
          .single()

        // Update site_submit with email metadata
        const emailSentAt = new Date().toISOString()
        const updateData: any = {
          updated_at: emailSentAt,
          updated_by_id: userId,
          email_sent_at: emailSentAt,
          email_sent_by_id: userId,
          gmail_message_id: sendResult.messageId,
          gmail_thread_id: sendResult.threadId,
        }

        // If date_submitted is null, set it to the current date
        if (!siteSubmit?.date_submitted) {
          updateData.date_submitted = emailSentAt
          console.log('📅 Setting date_submitted to current date since it was null')
        }

        // If submit_stage_id is not already set, set it to "Submitted-Reviewing"
        if (!siteSubmit?.submit_stage_id && submittedReviewingStage?.id) {
          updateData.submit_stage_id = submittedReviewingStage.id
          console.log('📊 Setting submit_stage to "Submitted-Reviewing" since it was not set')
        }

        const { error: updateError } = await supabaseClient
          .from('site_submit')
          .update(updateData)
          .eq('id', siteSubmitId)

        if (updateError) {
          console.error('❌ Error updating site_submit metadata:', updateError)
        } else {
          console.log('✅ Site submit metadata updated successfully')
        }
      } catch (error) {
        console.error('❌ Error in activity logging:', error)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully sent email to ${customEmail.to.length} recipient(s) via Gmail`,
          emailsSent: 1,
          recipients: customEmail.to,
          messageId: sendResult.messageId,
          threadId: sendResult.threadId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Original logic for non-custom emails (backward compatibility)
    // Fetch site submit data with related information
    const { data: siteSubmit, error: siteSubmitError } = await supabaseClient
      .from('site_submit')
      .select(`
        *,
        client:client_id (
          id,
          client_name
        ),
        property:property_id (
          id,
          property_name,
          address,
          city,
          state,
          zip,
          marketing_materials
        ),
        property_unit:property_unit_id (
          id,
          property_unit_name
        )
      `)
      .eq('id', siteSubmitId)
      .single()

    if (siteSubmitError) throw siteSubmitError
    if (!siteSubmit) throw new Error('Site submit not found')

    // Fetch Site Selector contacts for this client
    const { data: contacts, error: contactsError } = await supabaseClient
      .from('contact_client_role')
      .select(`
        contact:contact_id (
          id,
          first_name,
          last_name,
          email
        ),
        role:role_id (
          role_name
        )
      `)
      .eq('client_id', siteSubmit.client_id)
      .eq('is_active', true)

    if (contactsError) throw contactsError

    // Filter for Site Selector role and contacts with email addresses
    const siteSelectors = contacts
      ?.filter((item: any) =>
        item.role?.role_name === 'Site Selector' &&
        item.contact?.email
      )
      .map((item: any) => item.contact)
      || []

    // Deduplicate contacts by email
    const uniqueContacts = Array.from(
      new Map(siteSelectors.map((c: any) => [c.email, c])).values()
    )

    if (uniqueContacts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No Site Selector contacts found for this client with email addresses'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Build CC list
    const ccList = ['mike@oculusrep.com', 'asantos@oculusrep.com']
    if (userEmail && !ccList.includes(userEmail)) {
      ccList.push(userEmail)
    }

    // Send email to each contact via Gmail
    const results = []
    for (const contact of uniqueContacts as any[]) {
      const emailHtml = generateEmailTemplate(siteSubmit, contact)

      const emailOptions: SendEmailOptions = {
        to: [contact.email],
        cc: ccList,
        subject: `New Site Submit: ${siteSubmit.site_submit_name || 'Untitled'}`,
        bodyHtml: emailHtml,
        fromName: senderName || undefined,
      }

      const sendResult = await sendEmail(
        accessToken,
        gmailConnection.google_email,
        emailOptions
      )

      if (!sendResult.success) {
        console.error(`Failed to send email to ${contact.email}:`, sendResult.error)
        throw new Error(`Failed to send email to ${contact.email}: ${sendResult.error}`)
      }

      results.push({
        email: contact.email,
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
      })
    }

    // Log activity for email send
    try {
      console.log('📧 Starting activity logging for automatic email...')

      console.log('📝 Inserting activity record...')
      const { data: activityData, error: activityError } = await supabaseClient
        .from('activity')
        .insert({
          activity_type_id: null,
          related_object_type: 'site_submit',
          related_object_id: siteSubmitId,
          activity_date: new Date().toISOString(),
          created_by_id: userId,
          owner_id: userId,
          subject: 'Site Submit Email',
          description: `Site submit email sent via Gmail to ${results.length} recipient(s): ${(uniqueContacts as any[]).map((c: any) => c.email).join(', ')}`,
          sf_status: 'Completed'
        })
        .select()

      if (activityError) {
        console.error('❌ Error logging activity:', activityError)
      } else {
        console.log('✅ Activity logged successfully:', activityData)
      }

      console.log('📝 Updating site_submit metadata...')
      const { data: currentSiteSubmit } = await supabaseClient
        .from('site_submit')
        .select('date_submitted, submit_stage_id')
        .eq('id', siteSubmitId)
        .single()

      const { data: submittedReviewingStage } = await supabaseClient
        .from('submit_stage')
        .select('id')
        .eq('name', 'Submitted-Reviewing')
        .single()

      const emailSentAt = new Date().toISOString()
      const updateData: any = {
        updated_at: emailSentAt,
        updated_by_id: userId,
        email_sent_at: emailSentAt,
        email_sent_by_id: userId,
      }

      if (!currentSiteSubmit?.date_submitted) {
        updateData.date_submitted = emailSentAt
        console.log('📅 Setting date_submitted to current date since it was null')
      }

      if (!currentSiteSubmit?.submit_stage_id && submittedReviewingStage?.id) {
        updateData.submit_stage_id = submittedReviewingStage.id
        console.log('📊 Setting submit_stage to "Submitted-Reviewing" since it was not set')
      }

      const { error: updateError } = await supabaseClient
        .from('site_submit')
        .update(updateData)
        .eq('id', siteSubmitId)

      if (updateError) {
        console.error('❌ Error updating site_submit metadata:', updateError)
      } else {
        console.log('✅ Site submit metadata updated successfully')
      }
    } catch (error) {
      console.error('❌ Error in activity logging:', error)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully sent ${results.length} email(s) via Gmail to Site Selectors`,
        emailsSent: results.length,
        recipients: (uniqueContacts as any[]).map((c: any) => c.email)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error sending emails:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function generateEmailTemplate(siteSubmit: any, contact: any): string {
  const clientName = siteSubmit.client?.client_name || 'N/A'
  const propertyName = siteSubmit.property?.property_name || 'N/A'
  const propertyAddress = siteSubmit.property
    ? `${siteSubmit.property.address || ''}, ${siteSubmit.property.city || ''}, ${siteSubmit.property.state || ''} ${siteSubmit.property.zip || ''}`.trim()
    : 'N/A'
  const stageName = 'N/A'
  const dateSubmitted = siteSubmit.date_submitted
    ? new Date(siteSubmit.date_submitted).toLocaleDateString()
    : 'N/A'

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #2563eb;
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
          }
          .content {
            background-color: #f9fafb;
            padding: 20px;
            border: 1px solid #e5e7eb;
            border-top: none;
          }
          .field {
            margin-bottom: 15px;
          }
          .label {
            font-weight: 600;
            color: #4b5563;
            display: block;
            margin-bottom: 4px;
          }
          .value {
            color: #1f2937;
          }
          .footer {
            background-color: #f3f4f6;
            padding: 15px;
            border-radius: 0 0 8px 8px;
            text-align: center;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0;">New Site Submit Notification</h2>
        </div>

        <div class="content">
          <p>Hello ${contact.first_name || 'there'},</p>

          <p>A new site submit has been created that may require your attention.</p>

          <div class="field">
            <span class="label">Site Submit Name:</span>
            <span class="value">${siteSubmit.site_submit_name || 'Untitled'}</span>
          </div>

          <div class="field">
            <span class="label">Client:</span>
            <span class="value">${clientName}</span>
          </div>

          <div class="field">
            <span class="label">Property:</span>
            <span class="value">${propertyName}</span>
          </div>

          <div class="field">
            <span class="label">Property Address:</span>
            <span class="value">${propertyAddress}</span>
          </div>

          ${siteSubmit.property_unit?.property_unit_name ? `
          <div class="field">
            <span class="label">Unit:</span>
            <span class="value">${siteSubmit.property_unit.property_unit_name}</span>
          </div>
          ` : ''}

          <div class="field">
            <span class="label">Stage:</span>
            <span class="value">${stageName}</span>
          </div>

          <div class="field">
            <span class="label">Date Submitted:</span>
            <span class="value">${dateSubmitted}</span>
          </div>

          ${siteSubmit.year_1_rent ? `
          <div class="field">
            <span class="label">Year 1 Rent:</span>
            <span class="value">$${siteSubmit.year_1_rent.toLocaleString()}</span>
          </div>
          ` : ''}

          ${siteSubmit.ti ? `
          <div class="field">
            <span class="label">TI:</span>
            <span class="value">$${siteSubmit.ti.toLocaleString()}</span>
          </div>
          ` : ''}

          ${siteSubmit.delivery_timeframe ? `
          <div class="field">
            <span class="label">Delivery Timeframe:</span>
            <span class="value">${siteSubmit.delivery_timeframe}</span>
          </div>
          ` : ''}

          ${siteSubmit.property?.marketing_materials ? `
          <div class="field">
            <span class="label">Marketing Materials:</span>
            <span class="value"><a href="${siteSubmit.property.marketing_materials}" target="_blank" style="color: #2563eb; text-decoration: none;">View Marketing Materials</a></span>
          </div>
          ` : ''}

          ${siteSubmit.notes ? `
          <div class="field">
            <span class="label">Notes:</span>
            <span class="value">${siteSubmit.notes}</span>
          </div>
          ` : ''}

          ${siteSubmit.customer_comments ? `
          <div class="field">
            <span class="label">Customer Comments:</span>
            <span class="value">${siteSubmit.customer_comments}</span>
          </div>
          ` : ''}
        </div>

        <div class="footer">
          <p>This is an automated notification from your CRM system.</p>
        </div>
      </body>
    </html>
  `
}
