# Site Submit Email System Setup Guide

This guide explains how to set up and configure the automated email system for Site Submit notifications.

## Overview

The email system allows you to send templated email notifications to "Site Selector" contacts when a Site Submit is created or updated. The system uses:

- **Supabase Edge Functions** - Serverless backend for email logic
- **Resend** - Transactional email service (free tier: 3,000 emails/month, 100/day)
- **Email Templates** - Pre-formatted HTML emails with Site Submit data

## Architecture

```
Site Submit Page (Frontend)
    ↓ [Button Click]
Supabase Edge Function
    ↓ [Queries Database]
Contact Table (filtered by is_site_selector = true)
    ↓ [Sends via API]
Resend Email Service
    ↓ [Delivers]
Site Selector Recipients
```

## Setup Steps

### 1. Sign Up for Resend

1. Go to [https://resend.com](https://resend.com)
2. Create a free account
3. Navigate to **API Keys** section
4. Generate a new API key
5. Copy the key (starts with `re_`)

### 2. Configure Domain (Optional but Recommended)

For production use, you should configure a custom domain:

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `yourdomain.com`)
4. Add the DNS records provided by Resend to your domain registrar
5. Wait for verification (usually 5-15 minutes)
6. Use `notifications@yourdomain.com` as your sender email

**Note:** For testing, you can use Resend's sandbox domain, but emails will only be sent to verified addresses.

### 3. Deploy the Edge Function

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy send-site-submit-email
```

#### Option B: Manual Deployment via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click **Create Function**
4. Name it: `send-site-submit-email`
5. Copy the contents of `/supabase/functions/send-site-submit-email/index.ts`
6. Paste into the function editor
7. Click **Deploy**

### 4. Configure Environment Variables

In Supabase Dashboard:

1. Go to **Edge Functions**
2. Click on `send-site-submit-email`
3. Go to **Settings** tab
4. Add the following environment variables:

```bash
RESEND_API_KEY=re_your_actual_api_key_here
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

**Important:** The `SUPABASE_SERVICE_ROLE_KEY` is automatically available in Edge Functions, so you don't need to configure it.

### 5. Update Your Local Environment

Add to your `.env` file (for local testing):

```bash
# Resend Email Service
RESEND_API_KEY=re_your_actual_api_key_here
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

### 6. Configure Contact Records

For contacts to receive emails, they must:

1. Be associated with a client (`client_id`)
2. Have `is_site_selector = true`
3. Have a valid email address

To set a contact as a Site Selector:

```sql
UPDATE contact
SET is_site_selector = true
WHERE id = 'contact-uuid-here';
```

## How It Works

### 1. Frontend Flow

When a user clicks "Email Site Selectors" on a Site Submit page:

1. Frontend calls the Edge Function with the `siteSubmitId`
2. Edge Function authenticates the request
3. Edge Function queries the database for Site Submit details
4. Edge Function finds all Site Selector contacts for that client
5. Edge Function generates personalized emails
6. Edge Function sends emails via Resend API
7. Frontend displays success/error message

### 2. Email Template

The email includes:

- **Site Submit Name**
- **Client Name**
- **Property Name & Address**
- **Unit Number** (if applicable)
- **Submit Stage**
- **Date Submitted**
- **Year 1 Rent** (if provided)
- **TI Amount** (if provided)
- **Delivery Timeframe** (if provided)
- **Notes** (if provided)
- **Customer Comments** (if provided)

### 3. Security

- Only authenticated users can trigger emails
- Edge Function uses service role key for database access
- CORS headers configured for your frontend
- Resend API key stored securely in environment variables

## Testing

### Local Testing with Supabase CLI

```bash
# Start Supabase functions locally
supabase functions serve send-site-submit-email

# In another terminal, test the function
curl -i --location --request POST 'http://localhost:54321/functions/v1/send-site-submit-email' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"siteSubmitId":"your-site-submit-uuid"}'
```

### Testing from Frontend

1. Create or edit a Site Submit
2. Ensure the client has at least one contact with:
   - `is_site_selector = true`
   - Valid email address
3. Click "Email Site Selectors" button
4. Check the toast notification for success/failure
5. Check recipient inbox for email

## Troubleshooting

### "No Site Selector contacts found"

**Problem:** No contacts are marked as Site Selectors for this client.

**Solution:**
```sql
-- Check contacts for a client
SELECT id, first_name, last_name, email, is_site_selector
FROM contact
WHERE client_id = 'client-uuid-here';

-- Update contact to be Site Selector
UPDATE contact
SET is_site_selector = true
WHERE id = 'contact-uuid-here';
```

### "Failed to send email"

**Problem:** Resend API key is invalid or not configured.

**Solution:**
1. Verify API key in Supabase Edge Functions settings
2. Ensure key starts with `re_`
3. Check Resend dashboard for API key status

### "Domain not verified" (Production)

**Problem:** Emails sent from unverified domain go to spam or fail.

**Solution:**
1. Add domain in Resend dashboard
2. Add DNS records to your domain registrar
3. Wait for verification
4. Update `RESEND_FROM_EMAIL` to use verified domain

### Email not received

**Problem:** Email sent successfully but not in inbox.

**Solution:**
1. Check spam/junk folder
2. Verify recipient email address is correct
3. Check Resend dashboard logs for delivery status
4. For testing, use Resend sandbox with verified email addresses

## Customization

### Modify Email Template

Edit the `generateEmailTemplate()` function in `/supabase/functions/send-site-submit-email/index.ts` to customize:

- Email styling (CSS)
- Fields included
- Layout and formatting
- Company branding

### Add More Recipients

To send to additional contact types:

1. Add new role fields to contact table (e.g., `is_property_manager`)
2. Update Edge Function query to include additional roles:

```typescript
.eq('is_site_selector', true)
.or('is_property_manager', 'eq', true)
```

### Change Email Subject

Edit the `subject` field in the Edge Function:

```typescript
subject: `Site Submit Update: ${siteSubmit.site_submit_name || 'Untitled'}`,
```

## Cost Breakdown

### Resend Pricing

| Tier | Cost | Emails/Month | Emails/Day |
|------|------|--------------|------------|
| **Free** | $0 | 3,000 | 100 |
| **Pro** | $20/mo | 50,000 | Unlimited |
| **Enterprise** | Custom | Custom | Unlimited |

### Supabase Edge Functions

- First 500,000 invocations/month: **Free**
- After: $2 per million invocations

**Estimated Monthly Cost for Typical Usage:**
- 100 site submits/month × 3 recipients = 300 emails
- **Total: $0** (within free tiers)

## Alternative Email Providers

If you prefer a different email service:

### SendGrid

```typescript
const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sendgridApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    personalizations: [{ to: [{ email: contact.email }] }],
    from: { email: 'notifications@yourdomain.com' },
    subject: `New Site Submit: ${siteSubmit.site_submit_name}`,
    content: [{ type: 'text/html', value: emailHtml }],
  }),
})
```

### Mailgun

```typescript
const formData = new FormData()
formData.append('from', 'notifications@yourdomain.com')
formData.append('to', contact.email)
formData.append('subject', `New Site Submit: ${siteSubmit.site_submit_name}`)
formData.append('html', emailHtml)

const res = await fetch(
  `https://api.mailgun.net/v3/${domain}/messages`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`,
    },
    body: formData,
  }
)
```

### Gmail SMTP (Not Recommended)

While possible, Gmail SMTP has limitations:
- 500 emails/day limit
- Requires app password setup
- Lower deliverability rates
- No analytics/tracking

## Support

For issues or questions:

1. Check Supabase Edge Function logs
2. Check Resend dashboard for delivery logs
3. Review browser console for frontend errors
4. Check database for correct contact configuration

## Next Steps

- [ ] Add email scheduling (send at specific time)
- [ ] Add email templates library (multiple templates)
- [ ] Add recipient preview before sending
- [ ] Add email sending history/audit log
- [ ] Add bulk email functionality
- [ ] Add email open/click tracking
