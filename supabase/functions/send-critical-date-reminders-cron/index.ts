import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Starting critical date reminders cron job...')

    // Create Supabase client with service role key for admin access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]
    console.log('Today\'s date:', today)

    // Query to find critical dates that need emails sent today
    // Logic: critical_date - send_email_days_prior = today
    // We'll use a custom query to handle this calculation
    const { data: criticalDates, error: queryError } = await supabaseClient
      .from('critical_date')
      .select(`
        *,
        deal:deal_id (
          id,
          deal_name,
          client_id,
          owner:owner_id (
            id,
            name,
            email
          )
        )
      `)
      .eq('send_email', true)
      .is('sent_at', null)
      .not('critical_date', 'is', null)
      .not('send_email_days_prior', 'is', null)

    if (queryError) throw queryError

    console.log(`Found ${criticalDates?.length || 0} critical dates with email enabled`)

    // Filter to only those that should be sent today
    const criticalDatesToSendToday = criticalDates?.filter((cd: any) => {
      if (!cd.critical_date || cd.send_email_days_prior === null) return false

      // Calculate the send date (critical_date - send_email_days_prior)
      const criticalDateObj = new Date(cd.critical_date)
      const sendDate = new Date(criticalDateObj)
      sendDate.setDate(sendDate.getDate() - cd.send_email_days_prior)
      const sendDateStr = sendDate.toISOString().split('T')[0]

      console.log(`Critical Date: ${cd.subject}, Critical Date: ${cd.critical_date}, Days Prior: ${cd.send_email_days_prior}, Send Date: ${sendDateStr}, Today: ${today}`)

      return sendDateStr === today
    }) || []

    console.log(`${criticalDatesToSendToday.length} critical dates need emails sent today`)

    if (criticalDatesToSendToday.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No critical date reminders to send today',
          emailsSent: 0,
          processedDates: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send emails via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

    // Process each critical date
    const results = []
    const errors = []

    for (const criticalDate of criticalDatesToSendToday) {
      try {
        console.log(`Processing critical date: ${criticalDate.id} - ${criticalDate.subject}`)

        const deal = criticalDate.deal as any

        // Fetch contacts with "Critical Dates Reminders" role
        const { data: roleData, error: roleError } = await supabaseClient
          .from('contact_client_role_type')
          .select('id')
          .eq('role_name', 'Critical Dates Reminders')
          .single()

        if (roleError) {
          console.error('Error fetching role:', roleError)
          errors.push({ criticalDateId: criticalDate.id, error: 'Failed to fetch role' })
          continue
        }

        if (!roleData) {
          console.error('Critical Dates Reminders role not found')
          errors.push({ criticalDateId: criticalDate.id, error: 'Role not found' })
          continue
        }

        // Fetch contacts with Critical Dates Reminders role for this client
        const { data: contacts, error: contactsError } = await supabaseClient
          .from('contact_client_role')
          .select(`
            contact:contact_id (
              id,
              first_name,
              last_name,
              email
            )
          `)
          .eq('client_id', deal.client_id)
          .eq('role_id', roleData.id)
          .eq('is_active', true)

        if (contactsError) {
          console.error('Error fetching contacts:', contactsError)
          errors.push({ criticalDateId: criticalDate.id, error: 'Failed to fetch contacts' })
          continue
        }

        // Filter for contacts with emails and deduplicate
        const contactsWithEmail = contacts
          ?.filter((item: any) => item.contact?.email)
          .map((item: any) => item.contact) || []

        const uniqueContacts = Array.from(
          new Map(contactsWithEmail.map((c: any) => [c.email, c])).values()
        )

        if (uniqueContacts.length === 0) {
          console.log(`No contacts found for critical date ${criticalDate.id}`)
          errors.push({ criticalDateId: criticalDate.id, error: 'No recipients found' })
          continue
        }

        // Build CC list (deal owner + admin)
        const ccList = ['mike@oculusrep.com'] // Admin
        if (deal.owner?.email && !ccList.includes(deal.owner.email)) {
          ccList.push(deal.owner.email)
        }

        // Send emails to all contacts
        const emailPromises = uniqueContacts.map(async (contact: any) => {
          const emailHtml = generateCriticalDateEmailTemplate(criticalDate, deal, contact)

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [contact.email],
              cc: ccList,
              subject: `Critical Date Reminder: ${criticalDate.subject} - ${deal.deal_name || 'Untitled Deal'}`,
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

        await Promise.all(emailPromises)

        // Update the critical_date record with sent_at timestamp
        const { error: updateError } = await supabaseClient
          .from('critical_date')
          .update({
            sent_at: new Date().toISOString()
          })
          .eq('id', criticalDate.id)

        if (updateError) {
          console.error('Error updating sent_at:', updateError)
        }

        results.push({
          criticalDateId: criticalDate.id,
          subject: criticalDate.subject,
          emailsSent: uniqueContacts.length,
          recipients: uniqueContacts.map((c: any) => c.email)
        })

        console.log(`Successfully sent ${uniqueContacts.length} emails for critical date ${criticalDate.id}`)

      } catch (error) {
        console.error(`Error processing critical date ${criticalDate.id}:`, error)
        errors.push({
          criticalDateId: criticalDate.id,
          error: error.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${criticalDatesToSendToday.length} critical date(s)`,
        emailsSent: results.reduce((sum, r) => sum + r.emailsSent, 0),
        processedDates: results,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in critical date reminders cron job:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function generateCriticalDateEmailTemplate(criticalDate: any, deal: any, contact: any): string {
  const dealName = deal.deal_name || 'Untitled Deal'
  const subject = criticalDate.subject || 'Untitled'
  const description = criticalDate.description || ''
  const daysPrior = criticalDate.send_email_days_prior || 0

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'TBD'

    const datePart = dateStr.substring(0, 10)
    const [year, month, day] = datePart.split('-')
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`
  }

  const contactFirstName = contact.first_name || 'there'

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
            background-color: #dc2626;
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
            font-size: 14px;
          }
          .value {
            color: #1f2937;
            font-size: 15px;
          }
          .critical-date-box {
            background-color: #fef2f2;
            border: 2px solid #dc2626;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
          }
          .critical-date-label {
            font-size: 12px;
            text-transform: uppercase;
            color: #991b1b;
            font-weight: 600;
            margin-bottom: 8px;
          }
          .critical-date-value {
            font-size: 24px;
            font-weight: bold;
            color: #dc2626;
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
          <h2 style="margin: 0;">Critical Date Reminder</h2>
        </div>

        <div class="content">
          <p>Hello ${contactFirstName},</p>

          <p>This is a reminder that an important critical date is approaching for one of your deals.</p>

          <div class="field">
            <span class="label">Deal:</span>
            <span class="value">${dealName}</span>
          </div>

          <div class="field">
            <span class="label">Critical Date Type:</span>
            <span class="value">${subject}</span>
          </div>

          <div class="critical-date-box">
            <div class="critical-date-label">Critical Date</div>
            <div class="critical-date-value">${formatDate(criticalDate.critical_date)}</div>
            ${daysPrior ? `<div style="margin-top: 8px; font-size: 12px; color: #991b1b;">
              ${daysPrior} day${daysPrior !== 1 ? 's' : ''} prior notification
            </div>` : ''}
          </div>

          ${description ? `
          <div class="field">
            <span class="label">Description:</span>
            <span class="value">${description}</span>
          </div>
          ` : ''}

          <div style="margin-top: 20px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #1e40af;">
              <strong>Action Required:</strong> Please review this critical date and take any necessary actions to ensure all deadlines are met.
            </p>
          </div>
        </div>

        <div class="footer">
          <p style="margin: 0;">This is an automated reminder from your CRM system.</p>
          <p style="margin: 5px 0 0 0; font-size: 12px;">
            You are receiving this email because you have the "Critical Dates Reminders" role for this client.
          </p>
        </div>
      </body>
    </html>
  `
}
