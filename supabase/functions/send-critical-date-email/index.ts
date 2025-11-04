import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CriticalDateEmailRequest {
  criticalDateId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { criticalDateId } = await req.json() as CriticalDateEmailRequest

    if (!criticalDateId) {
      throw new Error('criticalDateId is required')
    }

    // Create Supabase client with service role key for admin access
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Fetch critical date data with deal and property information
    const { data: criticalDate, error: criticalDateError } = await supabaseClient
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
      .eq('id', criticalDateId)
      .single()

    if (criticalDateError) throw criticalDateError
    if (!criticalDate) throw new Error('Critical date not found')

    // Check if email should be sent
    if (!criticalDate.send_email) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Email sending is not enabled for this critical date'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check if email was already sent
    if (criticalDate.sent_at) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Email has already been sent for this critical date'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const deal = criticalDate.deal as any

    // Fetch contacts with "Critical Dates Reminders" role
    const { data: roleData, error: roleError } = await supabaseClient
      .from('contact_client_role_type')
      .select('id')
      .eq('role_name', 'Critical Dates Reminders')
      .single()

    if (roleError) throw roleError
    if (!roleData) throw new Error('Critical Dates Reminders role not found')

    // Fetch all contacts with Critical Dates Reminders role for this client
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

    if (contactsError) throw contactsError

    // Filter for contacts with emails and deduplicate
    const contactsWithEmail = contacts
      ?.filter((item: any) => item.contact?.email)
      .map((item: any) => item.contact) || []

    const uniqueContacts = Array.from(
      new Map(contactsWithEmail.map((c: any) => [c.email, c])).values()
    )

    if (uniqueContacts.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No contacts found with "Critical Dates Reminders" role and email addresses for this client'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Send emails via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

    // Build CC list (deal owner + admin)
    const ccList = ['mike@oculusrep.com'] // Admin
    if (deal.owner?.email && !ccList.includes(deal.owner.email)) {
      ccList.push(deal.owner.email)
    }

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

    const results = await Promise.all(emailPromises)

    // Update the critical_date record with sent_at timestamp
    const { error: updateError } = await supabaseClient
      .from('critical_date')
      .update({
        sent_at: new Date().toISOString()
      })
      .eq('id', criticalDateId)

    if (updateError) {
      console.error('Error updating sent_at:', updateError)
      // Don't throw - emails were sent successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully sent ${results.length} email(s) for critical date reminder`,
        emailsSent: results.length,
        recipients: uniqueContacts.map((c: any) => c.email)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error sending critical date emails:', error)
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
            font-size: 14px;
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
          ${contactFirstName ? `<p>${contactFirstName},</p><br>` : ''}
          <p>This is a reminder email to let you know that the following Critical Date for our deal at ${deal.property?.property_name || 'the property'} in ${deal.property?.city || 'the area'} is approaching.</p>

          <p style="margin-top: 20px; margin-bottom: 5px;"><strong>Critical Date:</strong> ${subject}</p>
          <p style="margin-top: 5px; margin-bottom: 5px;"><strong>Due Date:</strong> ${formatDate(criticalDate.critical_date)}</p>
          <p style="margin-top: 5px; margin-bottom: 20px;"><strong>Description:</strong> ${description}</p>

          <p>Please give Mike or Arty a call if you have any questions or there are any concerns with the approaching deadline.</p>

          <div class="signature">
            <p style="margin-bottom: 5px;">Best,</p>
            <p style="margin-bottom: 5px;">Mike</p>
            <br>
            <p style="margin-bottom: 3px; font-size: 12px;"><strong>Mike Minihan</strong></p>
            <p style="margin-bottom: 3px; font-size: 12px;">Principal | Managing Broker</p>
            <p style="margin-bottom: 3px; font-size: 12px;">Oculus Real Estate Partners, LLC</p>
            <p style="margin-bottom: 3px; font-size: 12px;">M: 404-326-4010</p>
            <p style="margin-bottom: 3px; font-size: 12px;">E: <a href="mailto:mike@oculusrep.com" style="color: #2563eb; text-decoration: none;">mike@oculusrep.com</a></p>
          </div>
        </div>
      </body>
    </html>
  `
}
