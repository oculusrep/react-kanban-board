// Portal Invite Email Edge Function
//
// This function sends portal invite emails to contacts using Gmail API.
// Sends through the inviting user's connected Gmail account.
//
// To deploy:
// 1. Set up Supabase CLI: npx supabase login
// 2. Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured
// 3. Deploy: npx supabase functions deploy send-portal-invite

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  sendEmail,
  refreshAccessToken,
  isTokenExpired,
  type GmailConnection,
} from '../_shared/gmail.ts';

interface InviteRequest {
  contactId: string;
  email: string;
  inviteLink: string;
  expiresAt: string;
  invitedByUserId?: string;  // User ID of person sending the invite
  customSubject?: string;    // Custom email subject
  customMessage?: string;    // Custom email message body
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contactId, email, inviteLink, expiresAt, invitedByUserId, customSubject, customMessage }: InviteRequest = await req.json();

    if (!contactId || !email || !inviteLink) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Get Gmail connection for the inviting user
    // If no invitedByUserId provided, try to get a default/system Gmail connection
    let gmailConnection: GmailConnection | null = null;

    if (invitedByUserId) {
      const { data: connection } = await supabase
        .from('gmail_connection')
        .select('*')
        .eq('user_id', invitedByUserId)
        .eq('is_active', true)
        .single();

      gmailConnection = connection as GmailConnection | null;
    }

    // If no connection found for the user, try to find any active Gmail connection
    // (fallback for system-level sending)
    if (!gmailConnection) {
      const { data: anyConnection } = await supabase
        .from('gmail_connection')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single();

      gmailConnection = anyConnection as GmailConnection | null;
    }

    if (!gmailConnection) {
      console.log('No Gmail connection available, returning link for manual sharing');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No Gmail connection available. Use the invite link directly.',
          useManualLink: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert custom message to HTML paragraphs (if provided)
    const messageHtml = customMessage
      ? customMessage.split('\n\n').map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('\n      ')
      : `<p>Hi ${firstName},</p>

      <p>You've been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects, including property details, documents, and direct communication with your broker team.</p>

      <p>Click the button below to set up your account:</p>`;

    // Use custom subject or default
    const emailSubject = customSubject || "You're Invited to the Oculus Client Portal";

    // Email HTML template - using inline styles for maximum email client compatibility
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portal Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #011742; margin: 0 0 10px; font-size: 24px;">You're Invited!</h1>
      </div>

      <div style="color: #444; line-height: 1.6;">
        ${messageHtml}
      </div>

      <!-- Button with inline styles and VML fallback for Outlook -->
      <div style="text-align: center; margin: 30px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${inviteLink}" style="height:50px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="#104073">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Set Up Your Account</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${inviteLink}" style="display: inline-block; padding: 14px 30px; background-color: #104073; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; mso-hide: all;">Set Up Your Account</a>
        <!--<![endif]-->
      </div>

      <!-- Fallback link in case button doesn't render -->
      <p style="color: #666; font-size: 12px; text-align: center; margin-top: 10px;">
        Or copy and paste this link into your browser:<br>
        <a href="${inviteLink}" style="color: #104073; word-break: break-all;">${inviteLink}</a>
      </p>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 20px; font-size: 14px; color: #666;">
        <strong>Note:</strong> This invitation link will expire on ${expiresDate}. If you need a new link, please contact your broker.
      </div>
    </div>

    <div style="text-align: center; margin-top: 30px; color: #888; font-size: 12px;">
      <p style="margin: 0 0 5px;">Oculus Real Estate Advisors</p>
      <p style="margin: 0;">This email was sent to ${email}</p>
    </div>
  </div>
</body>
</html>
    `;

    // Check if token needs refresh
    let accessToken = gmailConnection.access_token;

    if (isTokenExpired(gmailConnection.token_expires_at)) {
      console.log(`[Portal Invite] Refreshing token for ${gmailConnection.google_email}`);

      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

      try {
        const refreshResult = await refreshAccessToken(
          gmailConnection.refresh_token,
          clientId,
          clientSecret
        );

        accessToken = refreshResult.access_token;

        // Update stored token
        const newExpiresAt = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString();
        await supabase
          .from('gmail_connection')
          .update({
            access_token: accessToken,
            token_expires_at: newExpiresAt,
          })
          .eq('id', gmailConnection.id);
      } catch (refreshError) {
        console.error('[Portal Invite] Token refresh failed:', refreshError);
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Gmail token refresh failed. Use the invite link directly.',
            useManualLink: true,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build plain text version
    const plainTextMessage = customMessage
      ? `${customMessage}\n\nClick here to set up your account: ${inviteLink}\n\nThis invitation link will expire on ${expiresDate}.`
      : `Hi ${firstName},\n\nYou've been invited to access the Oculus Client Portal. This portal gives you visibility into your real estate projects.\n\nClick here to set up your account: ${inviteLink}\n\nThis invitation link will expire on ${expiresDate}.\n\nBest regards,\nThe Oculus Team`;

    // Send email via Gmail API (CC the sender so they have a record)
    const sendResult = await sendEmail(
      accessToken,
      gmailConnection.google_email,
      {
        to: [email],
        cc: [gmailConnection.google_email],  // CC the sender
        subject: emailSubject,
        bodyHtml: emailHtml,
        bodyText: plainTextMessage,
      }
    );

    if (!sendResult.success) {
      console.error('[Portal Invite] Gmail send failed:', sendResult.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: sendResult.error,
          message: 'Failed to send email via Gmail. Use the invite link directly.',
          useManualLink: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the successful send
    await supabase.from('portal_invite_log').insert({
      contact_id: contactId,
      invite_email: email,
      status: 'email_sent',
      email_id: sendResult.messageId,
    });

    console.log(`[Portal Invite] Email sent successfully to ${email} via ${gmailConnection.google_email}`);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
        sentFrom: gmailConnection.google_email,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Portal Invite] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
