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
          ),
          property:property_id (
            property_name,
            city,
            state
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
              subject: `Critical Date Approaching - ${criticalDate.subject}`,
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
  const subject = criticalDate.subject || 'Untitled'
  const description = criticalDate.description || subject

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
          .content {
            background-color: #ffffff;
            padding: 30px;
          }
          .signature {
            margin-top: 30px;
            padding-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="content">
          <p>${contactFirstName},</p>

          <p>This is a reminder email to let you know that the following Critical Date for our deal at ${deal.property?.property_name || 'the property'} in ${deal.property?.city || 'the area'} is approaching.</p>

          <p style="margin-top: 20px; margin-bottom: 5px;"><strong>Critical Date:</strong> ${subject}</p>
          <p style="margin-top: 5px; margin-bottom: 5px;"><strong>Due Date:</strong> ${formatDate(criticalDate.critical_date)}</p>
          <p style="margin-top: 5px; margin-bottom: 20px;"><strong>Description:</strong> ${description}</p>

          <p>Please give Mike or Arty a call if you have any questions or there are any concerns with the approaching deadline.</p>

          <div class="signature">
            <p style="margin-bottom: 5px;"><strong>Best,</strong></p>
            <p style="margin-bottom: 5px;"><strong>Mike</strong></p>
            <br>
            <p style="margin-bottom: 3px; font-size: 14px;"><strong>Mike Minihan</strong></p>
            <p style="margin-bottom: 3px; font-size: 14px;">Principal | Managing Broker</p>
            <p style="margin-bottom: 3px; font-size: 14px;">Oculus Real Estate Partners, LLC</p>
            <p style="margin-bottom: 3px; font-size: 14px;">M: 404-326-4010</p>
            <p style="margin-bottom: 3px; font-size: 14px;">E: <a href="mailto:mike@oculusrep.com" style="color: #2563eb; text-decoration: none;">mike@oculusrep.com</a></p>
          </div>
        </div>
      </body>
    </html>
  `
}
