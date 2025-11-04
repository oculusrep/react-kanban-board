# Critical Dates Email System - Deployment Guide

**Quick Reference Guide for Deploying Critical Dates Email Automation**

---

## Prerequisites

- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] Resend API key (from [resend.com](https://resend.com))
- [ ] Supabase project linked (`supabase link --project-ref YOUR_REF`)

---

## Step 1: Deploy Edge Functions

```bash
# Navigate to project root
cd /Users/mike/Documents/GitHub/react-kanban-board

# Deploy manual email send function
supabase functions deploy send-critical-date-email

# Deploy automated cron job function
supabase functions deploy send-critical-date-reminders-cron
```

Expected output:
```
✓ Deployed Function send-critical-date-email
✓ Deployed Function send-critical-date-reminders-cron
```

---

## Step 2: Configure Environment Variables

### Via Supabase Dashboard

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Edge Functions** in sidebar
4. Click on `send-critical-date-email`
5. Go to **Settings** tab
6. Add environment variables:

```bash
RESEND_API_KEY=re_your_actual_api_key_here
RESEND_FROM_EMAIL=notifications@oculusrep.com
```

7. Repeat for `send-critical-date-reminders-cron`

### Via CLI (Alternative)

```bash
# Set for send-critical-date-email function
supabase secrets set RESEND_API_KEY=re_your_key --project-ref YOUR_REF
supabase secrets set RESEND_FROM_EMAIL=notifications@oculusrep.com --project-ref YOUR_REF
```

---

## Step 3: Set Up Cron Job

### Via Supabase Dashboard

1. Go to **Edge Functions** → **Cron Jobs** tab
2. Click **Create Cron Job**
3. Fill in:
   ```
   Function Name: send-critical-date-reminders-cron
   Cron Expression: 0 8 * * *
   Timezone: America/Los_Angeles
   Description: Send critical date reminder emails daily at 8 AM
   ```
4. Click **Create**

### Cron Expression Guide

```
0 8 * * *     - 8:00 AM daily
0 9 * * *     - 9:00 AM daily
0 8 * * 1-5   - 8:00 AM weekdays only
0 */6 * * *   - Every 6 hours
```

---

## Step 4: Verify Deployment

### Test Manual Email Send

```bash
curl -i --location --request POST \
  'https://your-project.supabase.co/functions/v1/send-critical-date-email' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"criticalDateId":"test-uuid-here"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Successfully sent X email(s) for critical date reminder",
  "emailsSent": X,
  "recipients": ["email1@example.com", "email2@example.com"]
}
```

### Test Cron Job

In Supabase Dashboard:

1. Go to **Edge Functions**
2. Click on `send-critical-date-reminders-cron`
3. Click **Invoke** button
4. Check response in logs

---

## Step 5: Create Test Data

```sql
-- Create a test critical date that should send tomorrow
INSERT INTO critical_date (
  id,
  deal_id,
  subject,
  critical_date,
  description,
  send_email,
  send_email_days_prior,
  sent_at,
  is_default,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'your-test-deal-id',
  'Test Critical Date Reminder',
  CURRENT_DATE + INTERVAL '8 days',  -- 8 days from now
  'This is a test to verify email reminders work correctly',
  true,
  7,  -- Send 7 days prior = tomorrow
  null,
  false,
  NOW(),
  NOW()
);
```

Wait for cron job to run or manually invoke the function.

---

## Step 6: Verify Email Delivery

### Check Resend Dashboard

1. Go to [resend.com/emails](https://resend.com/emails)
2. View recent emails sent
3. Check status (Delivered, Bounced, etc.)

### Check Database

```sql
-- Verify sent_at was updated
SELECT
  id,
  subject,
  critical_date,
  send_email_days_prior,
  sent_at
FROM critical_date
WHERE sent_at IS NOT NULL
ORDER BY sent_at DESC
LIMIT 10;
```

---

## Step 7: Configure Recipients

Ensure contacts have the "Critical Dates Reminders" role:

```sql
-- Check if role exists
SELECT * FROM contact_client_role_type
WHERE role_name = 'Critical Dates Reminders';

-- Assign role to a contact
INSERT INTO contact_client_role (
  contact_id,
  client_id,
  role_id,
  is_active
) VALUES (
  'contact-uuid',
  'client-uuid',
  (SELECT id FROM contact_client_role_type WHERE role_name = 'Critical Dates Reminders'),
  true
);
```

---

## Monitoring & Logs

### View Function Logs

In Supabase Dashboard:

1. Go to **Edge Functions**
2. Click on function name
3. View **Logs** tab

### View Cron Job History

In Supabase Dashboard:

1. Go to **Edge Functions** → **Cron Jobs**
2. Click on the cron job
3. View execution history

---

## Troubleshooting

### Function Not Deploying

```bash
# Check Supabase CLI version
supabase --version

# Update if needed
npm install -g supabase@latest

# Re-link project
supabase link --project-ref YOUR_REF
```

### Environment Variables Not Working

```bash
# List current secrets
supabase secrets list --project-ref YOUR_REF

# Delete and re-set if needed
supabase secrets unset RESEND_API_KEY --project-ref YOUR_REF
supabase secrets set RESEND_API_KEY=re_new_key --project-ref YOUR_REF
```

### Cron Job Not Running

1. Check cron expression is valid at [crontab.guru](https://crontab.guru)
2. Verify timezone setting
3. Check function logs for errors
4. Manually invoke function to test

### Emails Not Sending

1. Verify Resend API key is valid
2. Check Resend dashboard for delivery errors
3. Ensure `RESEND_FROM_EMAIL` domain is verified
4. Check function logs for specific errors

---

## Rollback Procedure

If you need to rollback:

```bash
# Disable cron job in Supabase Dashboard
# (Go to Cron Jobs → Toggle off)

# Or delete the functions
supabase functions delete send-critical-date-email --project-ref YOUR_REF
supabase functions delete send-critical-date-reminders-cron --project-ref YOUR_REF
```

---

## Production Checklist

- [ ] Edge functions deployed successfully
- [ ] Environment variables configured
- [ ] Cron job scheduled
- [ ] Test critical date created
- [ ] Test email received
- [ ] `sent_at` field updated correctly
- [ ] Recipients configured with proper roles
- [ ] Email template reviewed and approved
- [ ] Monitoring/logging verified
- [ ] Team notified of new automation

---

## Support

For issues or questions:

1. Check function logs in Supabase Dashboard
2. Check Resend dashboard for email delivery status
3. Review [CRITICAL_DATES_EMAIL_SYSTEM.md](./docs/CRITICAL_DATES_EMAIL_SYSTEM.md)
4. Check database for configuration issues

---

**Last Updated**: November 4, 2025
**Status**: Ready for Production Deployment
