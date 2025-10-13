import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get the authenticated user's ID from the JWT token
    const authHeader = req.headers.get('Authorization')
    let userEmail = submitterEmail

    // If submitter email is not provided, fetch it from the user table
    if (!userEmail && authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user } } = await supabaseClient.auth.getUser(token)

        if (user?.id) {
          const { data: userData } = await supabaseClient
            .from('user')
            .select('email')
            .eq('id', user.id)
            .single()

          userEmail = userData?.email || user.email
        }
      } catch (error) {
        console.error('Error fetching user email:', error)
      }
    }

    // Send emails via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    // If custom email is provided, use it directly
    if (customEmail) {
      // Determine the "From" address - use user email if available and has oculusrep.com domain
      let fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

      if (userEmail && userEmail.endsWith('@oculusrep.com')) {
        // Use user's actual email as From address
        fromAddress = userEmail
      } else if (userEmail) {
        // If user has different domain, use default From with Reply-To
        fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
      }

      // Send email to actual recipients
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          reply_to: userEmail || undefined,
          to: customEmail.to,
          cc: customEmail.cc.length > 0 ? customEmail.cc : undefined,
          bcc: customEmail.bcc.length > 0 ? customEmail.bcc : undefined,
          subject: customEmail.subject,
          html: customEmail.htmlBody,
        }),
      })

      if (!res.ok) {
        const error = await res.text()
        console.error(`Failed to send email:`, error)
        throw new Error(`Failed to send email`)
      }

      await res.json()

      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully sent email to ${customEmail.to.length} recipient(s)`,
          emailsSent: 1,
          recipients: customEmail.to
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Original logic for non-custom emails (kept for backward compatibility)
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
          zip
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
    // New query uses contact_client_role table to find all contacts with Site Selector role
    // This includes contacts associated through contact_client_relation, not just contact.client_id
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

    console.log('DEBUG: Raw contacts data:', JSON.stringify(contacts, null, 2))

    // Filter for Site Selector role and contacts with email addresses
    const siteSelectors = contacts
      ?.filter((item: any) =>
        item.role?.role_name === 'Site Selector' &&
        item.contact?.email
      )
      .map((item: any) => item.contact)
      || []

    // Deduplicate contacts by email (in case a contact has multiple associations)
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

    // Determine the "From" address - use user email if available and has oculusrep.com domain
    let fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

    if (userEmail && userEmail.endsWith('@oculusrep.com')) {
      // Use user's actual email as From address
      fromAddress = userEmail
    }

    // Build CC list
    const ccList = ['mike@oculusrep.com', 'asantos@oculusrep.com']
    if (userEmail && !ccList.includes(userEmail)) {
      ccList.push(userEmail)
    }

    const emailPromises = uniqueContacts.map(async (contact: any) => {
      const emailHtml = generateEmailTemplate(siteSubmit, contact)

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          reply_to: userEmail || undefined,
          to: [contact.email],
          cc: ccList,
          subject: `New Site Submit: ${siteSubmit.site_submit_name || 'Untitled'}`,
          html: emailHtml,
        }),
      })

      if (!res.ok) {
        const error = await res.text()
        console.error(`Failed to send email to ${contact.email}:`, error)
        throw new Error(`Failed to send email to ${contact.email}`)
      }

      return res.json()
    })

    const results = await Promise.all(emailPromises)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully sent ${results.length} email(s) to Site Selectors`,
        emailsSent: results.length,
        recipients: uniqueContacts.map((c: any) => c.email)
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
  const stageName = 'N/A' // Stage info removed due to relationship ambiguity
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
