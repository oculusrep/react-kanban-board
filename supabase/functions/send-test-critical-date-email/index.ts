import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TestEmailRequest {
  toEmail: string
  toName: string
  subject: string
  criticalDate: string
  description: string
  propertyName?: string
  propertyCity?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { toEmail, toName, subject, criticalDate, description, propertyName, propertyCity } = await req.json() as TestEmailRequest

    if (!toEmail || !subject) {
      throw new Error('toEmail and subject are required')
    }

    // Get Resend API key from environment
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured')
    }

    const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

    // Generate email HTML
    const emailHtml = generateCriticalDateEmailTemplate({
      subject,
      criticalDate,
      description,
      contactFirstName: toName.split(' ')[0] || 'there',
      propertyName,
      propertyCity,
    })

    // Send via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject: `[TEST] Critical Date Approaching - ${subject}`,
        html: emailHtml,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('Failed to send test email:', error)
      throw new Error('Failed to send test email')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test email sent to ${toEmail}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error sending test email:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function generateCriticalDateEmailTemplate(data: {
  subject: string
  criticalDate: string
  description: string
  contactFirstName: string
  propertyName?: string
  propertyCity?: string
}): string {
  const { subject, criticalDate, description, contactFirstName, propertyName, propertyCity } = data
  const finalDescription = description || subject

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'TBD'

    const datePart = dateStr.substring(0, 10)
    const [year, month, day] = datePart.split('-')
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`
  }

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
          <p>${contactFirstName},</p>
          <br>
          <p>This is a reminder email to let you know that the following Critical Date for our deal at ${propertyName || 'the property'} in ${propertyCity || 'the area'} is approaching.</p>

          <p style="margin-top: 20px; margin-bottom: 5px;"><strong>Critical Date:</strong> ${subject || 'Untitled'}</p>
          <p style="margin-top: 5px; margin-bottom: 5px;"><strong>Due Date:</strong> ${formatDate(criticalDate)}</p>
          <p style="margin-top: 5px; margin-bottom: 20px;"><strong>Description:</strong> ${finalDescription}</p>

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
