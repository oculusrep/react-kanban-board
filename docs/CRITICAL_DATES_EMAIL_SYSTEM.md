# Critical Dates Email System

**Date**: November 4, 2025
**Branch**: `dev/critical-dates-automated-emails`
**Status**: Complete - Ready for Testing

---

## Overview

The Critical Dates Email System provides automated email reminders for important deal milestones and deadlines. The system uses the same Resend email infrastructure as Site Submits and includes:

- **Email Preview Modal** - Preview emails before they're sent automatically
- **Automated Daily Cron Job** - Sends reminder emails based on configured days prior
- **Manual Email Sending** - Send emails on-demand via Edge Function
- **Salesforce Historical Data** - Preserves existing `sent_at` timestamps from Salesforce

---

## Features

### 1. Email Preview

Users can preview the exact email that will be sent to recipients:

- **Location**: Critical Date Sidebar → "Send Email Days Prior" field → "Preview Email" button
- **Shows**:
  - Complete email template with real data
  - List of all recipients (TO and CC)
  - Email subject line
  - Scheduled send date calculation
  - Contact roles and associations

**Component**: `src/components/CriticalDateEmailPreviewModal.tsx`

### 2. Automated Email Reminders

Daily cron job checks for critical dates that need reminders sent:

- **Runs**: Daily at 8:00 AM (configurable)
- **Logic**: Finds critical dates where `critical_date - send_email_days_prior = today`
- **Updates**: Sets `sent_at` timestamp after successful email send
- **Handles**: Multiple critical dates per run
- **Logs**: Detailed processing information for debugging

**Edge Function**: `supabase/functions/send-critical-date-reminders-cron/index.ts`

### 3. Manual Email Sending

For testing or on-demand sending:

- **Endpoint**: `/send-critical-date-email`
- **Input**: `{ criticalDateId: string }`
- **Validations**:
  - `send_email` must be `true`
  - `sent_at` must be `null` (prevents duplicates)
  - Recipients must exist

**Edge Function**: `supabase/functions/send-critical-date-email/index.ts`

---

## Email Recipients

### TO Recipients
Contacts with the **"Critical Dates Reminders"** role for the deal's client:

```sql
SELECT contact.* FROM contact_client_role
JOIN contact ON contact.id = contact_client_role.contact_id
WHERE contact_client_role.client_id = [deal's client_id]
  AND contact_client_role.role_id = [Critical Dates Reminders role_id]
  AND contact_client_role.is_active = true
  AND contact.email IS NOT NULL
```

### CC Recipients
1. **Deal Owner** - The user assigned as the deal owner
2. **Admin** - mike@oculusrep.com (hardcoded for now)

---

## Email Template

The email template is designed to be clear and actionable:

### Visual Design
- **Red header** - Signals urgency/importance
- **Highlighted critical date box** - Makes the date stand out
- **Action callout** - Blue box with next steps
- **Professional footer** - Explains why recipient got the email

### Dynamic Content
- Deal name
- Critical date type (subject)
- Critical date value (formatted as "January 15, 2026")
- Days prior notification count
- Description (optional)
- Personalized greeting using contact's first name

### Example Subject Line
```
Critical Date Reminder: Contingency Date Expiration - Walmart Expansion Deal
```

---

## Configuration

### Environment Variables

Required in Supabase Edge Functions settings:

```bash
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=notifications@oculusrep.com
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=automatically_available
```

### Cron Schedule

Set up in Supabase Dashboard → Edge Functions → Cron Jobs:

```
Function: send-critical-date-reminders-cron
Schedule: 0 8 * * *  (8:00 AM daily)
Timezone: America/Los_Angeles (or your preference)
```

---

## Database Schema

### Critical Date Table

The `sent_at` field tracks when automated emails are sent:

```sql
CREATE TABLE critical_date (
  id UUID PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,

  -- Critical Date Info
  subject TEXT NOT NULL,
  critical_date DATE,
  description TEXT,

  -- Email Settings
  send_email BOOLEAN DEFAULT FALSE,
  send_email_days_prior INTEGER,
  sent_at TIMESTAMPTZ,  -- ← Auto-updated when email sent

  -- Metadata
  is_default BOOLEAN DEFAULT FALSE,
  sf_id TEXT UNIQUE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by_id UUID,
  updated_by_id UUID
);
```

### Constraint

```sql
CONSTRAINT check_send_email_days_prior
CHECK (
  (send_email = FALSE) OR
  (send_email = TRUE AND send_email_days_prior IS NOT NULL AND send_email_days_prior >= 0)
)
```

This ensures `send_email_days_prior` is always set when `send_email = true`.

---

## How It Works

### User Workflow

1. **User creates/edits critical date** in CriticalDateSidebar
2. **Checks "Send Email Reminder"** checkbox
3. **Sets "Days Prior"** value (e.g., 7 for one week before)
4. **Clicks "Preview Email"** button to see what will be sent
5. **System auto-saves** the settings
6. **Cron job runs daily** and sends email when the date arrives
7. **`sent_at` field updates** with timestamp after successful send

### Email Send Logic

**Cron job query logic**:
```typescript
// Find all critical dates with email enabled, not yet sent
const criticalDates = await supabase
  .from('critical_date')
  .select('*')
  .eq('send_email', true)
  .is('sent_at', null)
  .not('critical_date', 'is', null)
  .not('send_email_days_prior', 'is', null)

// Filter to only those where send date = today
const toSendToday = criticalDates.filter(cd => {
  const criticalDateObj = new Date(cd.critical_date)
  const sendDate = new Date(criticalDateObj)
  sendDate.setDate(sendDate.getDate() - cd.send_email_days_prior)
  return sendDate.toISOString().split('T')[0] === today
})
```

**Example**:
- Critical Date: **February 14, 2026**
- Days Prior: **7**
- Email Send Date: **February 7, 2026** (calculated as Feb 14 - 7 days)
- When today is Feb 7, email is sent

### Historical Data Handling

For records migrated from Salesforce:

- If `Send_Email_Date__c` exists in Salesforce → `sent_at` is populated
- System will NOT send duplicate emails (checks `sent_at IS NULL`)
- Preview modal shows `sent_at` timestamp if already sent

---

## API Reference

### Send Critical Date Email (Manual)

**Endpoint**: `POST /functions/v1/send-critical-date-email`

**Request**:
```json
{
  "criticalDateId": "uuid-here"
}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Successfully sent 3 email(s) for critical date reminder",
  "emailsSent": 3,
  "recipients": [
    "contact1@example.com",
    "contact2@example.com",
    "contact3@example.com"
  ]
}
```

**Response** (No Recipients):
```json
{
  "success": false,
  "message": "No contacts found with 'Critical Dates Reminders' role and email addresses for this client"
}
```

### Send Critical Date Reminders (Cron)

**Endpoint**: `POST /functions/v1/send-critical-date-reminders-cron`

**Request**: None (triggered by cron schedule)

**Response**:
```json
{
  "success": true,
  "message": "Processed 5 critical date(s)",
  "emailsSent": 12,
  "processedDates": [
    {
      "criticalDateId": "uuid-1",
      "subject": "Contingency Date Expiration",
      "emailsSent": 3,
      "recipients": ["contact1@example.com", "contact2@example.com", "contact3@example.com"]
    },
    // ... more critical dates
  ],
  "errors": [
    {
      "criticalDateId": "uuid-6",
      "error": "No recipients found"
    }
  ]
}
```

---

## Testing

### 1. Test Email Preview

```bash
# In browser:
1. Open a deal with a critical date
2. Click on a critical date to open sidebar
3. Check "Send Email Reminder"
4. Set "Days Prior" (e.g., 7)
5. Click "Preview Email" button
6. Verify:
   - Email template renders correctly
   - Recipients list shows correct contacts
   - CC includes deal owner and admin
   - Subject line is correct
   - Send date calculation is accurate
```

### 2. Test Manual Email Send

```bash
# Using curl:
curl -i --location --request POST \
  'https://your-project.supabase.co/functions/v1/send-critical-date-email' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"criticalDateId":"your-critical-date-uuid"}'

# Check:
# 1. Emails received by all recipients
# 2. sent_at field updated in database
# 3. Subsequent attempts return "already sent" error
```

### 3. Test Cron Job

```bash
# Local testing:
supabase functions serve send-critical-date-reminders-cron

# In another terminal:
curl -i --location --request POST \
  'http://localhost:54321/functions/v1/send-critical-date-reminders-cron' \
  --header 'Authorization: Bearer YOUR_ANON_KEY'

# Or manually trigger in Supabase Dashboard:
# Edge Functions → send-critical-date-reminders-cron → Invoke
```

### 4. Test Date Calculation

Create test critical dates with different scenarios:

```sql
-- Should send today (if today is Jan 8, 2026)
INSERT INTO critical_date (id, deal_id, subject, critical_date, send_email, send_email_days_prior, sent_at)
VALUES (gen_random_uuid(), 'deal-id', 'Test 1', '2026-01-15', true, 7, null);
-- Send date: Jan 15 - 7 = Jan 8 ✓

-- Should NOT send yet (send date in future)
INSERT INTO critical_date (id, deal_id, subject, critical_date, send_email, send_email_days_prior, sent_at)
VALUES (gen_random_uuid(), 'deal-id', 'Test 2', '2026-01-20', true, 7, null);
-- Send date: Jan 20 - 7 = Jan 13 (future)

-- Should NOT send (already sent)
INSERT INTO critical_date (id, deal_id, subject, critical_date, send_email, send_email_days_prior, sent_at)
VALUES (gen_random_uuid(), 'deal-id', 'Test 3', '2026-01-15', true, 7, '2026-01-08T08:00:00Z');
-- Has sent_at timestamp
```

---

## Deployment

### 1. Deploy Edge Functions

```bash
# Make sure you're in the project root
cd /Users/mike/Documents/GitHub/react-kanban-board

# Deploy the manual send function
supabase functions deploy send-critical-date-email

# Deploy the cron job function
supabase functions deploy send-critical-date-reminders-cron
```

### 2. Set Environment Variables

In Supabase Dashboard:

1. Go to **Edge Functions**
2. Click on each function
3. Go to **Settings** tab
4. Add environment variables:
   ```
   RESEND_API_KEY=re_your_api_key
   RESEND_FROM_EMAIL=notifications@oculusrep.com
   ```

### 3. Configure Cron Schedule

In Supabase Dashboard:

1. Go to **Edge Functions**
2. Click **Cron Jobs** tab
3. Click **Create Cron Job**
4. Configure:
   ```
   Function: send-critical-date-reminders-cron
   Schedule: 0 8 * * *
   Timezone: America/Los_Angeles
   ```

### 4. Test in Production

1. Create a test critical date with send date = tomorrow
2. Manually change system date or wait for cron to run
3. Verify email received
4. Check `sent_at` field updated

---

## Troubleshooting

### Email Not Sent

**Problem**: Cron job runs but no emails sent

**Check**:
```sql
-- Verify critical date configuration
SELECT
  id,
  subject,
  critical_date,
  send_email,
  send_email_days_prior,
  sent_at,
  critical_date::date - send_email_days_prior AS send_date
FROM critical_date
WHERE send_email = true
  AND sent_at IS NULL;
```

**Common Issues**:
- `send_email = false` (email disabled)
- `sent_at` is not null (already sent)
- `send_email_days_prior` is null (missing required field)
- `critical_date` is null (no date set)
- Send date calculation doesn't match today

### No Recipients Found

**Problem**: "No contacts found with Critical Dates Reminders role"

**Solution**:
```sql
-- Check if role exists
SELECT * FROM contact_client_role_type
WHERE role_name = 'Critical Dates Reminders';

-- Check if contacts have the role
SELECT c.*, ccr.*
FROM contact c
JOIN contact_client_role ccr ON ccr.contact_id = c.id
JOIN contact_client_role_type rt ON rt.id = ccr.role_id
WHERE rt.role_name = 'Critical Dates Reminders'
  AND ccr.client_id = 'your-client-id'
  AND ccr.is_active = true;

-- Add role to a contact
INSERT INTO contact_client_role (contact_id, client_id, role_id, is_active)
VALUES (
  'contact-id',
  'client-id',
  (SELECT id FROM contact_client_role_type WHERE role_name = 'Critical Dates Reminders'),
  true
);
```

### Duplicate Emails Sent

**Problem**: Same email sent multiple times

**Cause**: `sent_at` not being updated properly

**Fix**:
```sql
-- Check if sent_at is being updated
SELECT id, subject, sent_at, updated_at
FROM critical_date
WHERE send_email = true
ORDER BY updated_at DESC;

-- Manually mark as sent (emergency fix)
UPDATE critical_date
SET sent_at = NOW()
WHERE id = 'critical-date-id';
```

### Preview Modal Not Loading Recipients

**Problem**: Preview shows "Loading recipients..." forever

**Check**:
1. Browser console for errors
2. Network tab for failed API calls
3. Database permissions for contact queries

**Debug**:
```typescript
// In CriticalDateEmailPreviewModal.tsx
// Add console.log in fetchRecipients function
console.log('Deal data:', dealData);
console.log('Role data:', roleData);
console.log('Contacts:', contacts);
```

---

## File Changes

### New Files
- `src/components/CriticalDateEmailPreviewModal.tsx` - Email preview modal component
- `supabase/functions/send-critical-date-email/index.ts` - Manual email send function
- `supabase/functions/send-critical-date-reminders-cron/index.ts` - Daily cron job function
- `docs/CRITICAL_DATES_EMAIL_SYSTEM.md` - This documentation file

### Modified Files
- `src/components/CriticalDateSidebar.tsx` - Added Preview Email button and modal integration

---

## Future Enhancements

- [ ] **Email Customization** - Allow users to edit email template before sending
- [ ] **Email History** - Track all sent emails in a separate table
- [ ] **Retry Logic** - Automatically retry failed email sends
- [ ] **Email Analytics** - Track open rates and click rates
- [ ] **Bulk Actions** - Send emails for multiple critical dates at once
- [ ] **Email Templates** - Multiple template options for different critical date types
- [ ] **Timezone Support** - Send emails based on user's timezone
- [ ] **Email Preferences** - Allow contacts to opt out of specific notification types
- [ ] **Test Email** - Send a test email to current user
- [ ] **Email Logs** - View detailed logs of all email activity

---

## Related Documentation

- [Critical Dates Feature Overview](./SESSION_2025_11_03_CRITICAL_DATES_FEATURE.md)
- [Email System Setup Guide](./EMAIL_SYSTEM_SETUP.md)
- [Development Standards](./DEVELOPMENT_STANDARDS.md)

---

**Status**: Ready for deployment and testing in development environment
