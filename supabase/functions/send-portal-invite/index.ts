// Portal Invite Email Edge Function
//
// This function sends portal invite emails to contacts.
// Requires configuration of an email service (e.g., Resend, SendGrid).
//
// To deploy:
// 1. Set up Supabase CLI: npx supabase login
// 2. Configure secrets: npx supabase secrets set RESEND_API_KEY=your_key
// 3. Deploy: npx supabase functions deploy send-portal-invite

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Configure email service (using Resend as example)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@yourdomain.com';

interface InviteRequest {
  contactId: string;
  email: string;
  inviteLink: string;
  expiresAt: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { contactId, email, inviteLink, expiresAt }: InviteRequest = await req.json();

    if (!contactId || !email || !inviteLink) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get contact details for personalization
    const { data: contact, error: contactError } = await supabase
      .from('contact')
      .select('first_name, last_name')
      .eq('id', contactId)
      .single();

    if (contactError) {
      console.error('Error fetching contact:', contactError);
    }

    const firstName = contact?.first_name || 'there';
    const expiresDate = new Date(expiresAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Email HTML template
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal Invitation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { height: 40px; margin-bottom: 20px; }
    h1 { color: #011742; margin: 0 0 10px; font-size: 24px; }
    p { color: #444; line-height: 1.6; margin: 0 0 20px; }
    .button { display: inline-block; padding: 14px 30px; background-color: #104073; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .button:hover { background-color: #0d3560; }
    .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
    .expire-note { background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 20px; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>You're Invited!</h1>
      </div>

      <p>Hi ${firstName},</p>

      <p>You've been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects, including property details, documents, and direct communication with your broker team.</p>

      <p>Click the button below to set up your account:</p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" class="button">Set Up Your Account</a>
      </p>

      <div class="expire-note">
        <strong>Note:</strong> This invitation link will expire on ${expiresDate}. If you need a new link, please contact your broker.
      </div>

      <p style="margin-top: 30px;">If you have any questions, simply reply to this email or reach out to your broker representative.</p>

      <p>Best regards,<br>The Oculus Team</p>
    </div>

    <div class="footer">
      <p>Oculus Real Estate Advisors</p>
      <p>This email was sent to ${email}</p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email via Resend
    if (!RESEND_API_KEY) {
      console.log('RESEND_API_KEY not configured, skipping email send');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Email service not configured. Use the invite link directly.'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: 'You\'re Invited to the Oculus Client Portal',
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Resend error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorData }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailData = await emailResponse.json();

    // Log the successful send
    await supabase.from('portal_invite_log').insert({
      contact_id: contactId,
      invite_email: email,
      status: 'email_sent',
      email_id: emailData.id,
    });

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
