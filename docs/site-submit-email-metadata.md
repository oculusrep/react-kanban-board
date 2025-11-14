# Site Submit Email Metadata Tracking

## Overview

This document describes the email metadata tracking system implemented for site submits. This feature tracks when site submit emails are sent and by whom, providing visibility into email activity directly on the site submit record.

## Database Schema Changes

### New Fields on `site_submit` Table

Two new fields were added to the `site_submit` table:

- **`email_sent_at`** (TIMESTAMPTZ, nullable)
  - Stores the timestamp when the site submit email was last sent
  - Updates each time a site submit email is sent
  - Displayed in EST/EDT timezone in the UI

- **`email_sent_by_id`** (UUID, nullable)
  - Foreign key reference to `auth.users(id)`
  - Stores the ID of the user who sent the email
  - Used to display the sender's name in the UI

### Migration File

**Location:** `supabase/migrations/20251114_add_email_tracking_to_site_submit.sql`

```sql
-- Add email tracking fields to site_submit table
ALTER TABLE site_submit
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_sent_by_id UUID REFERENCES auth.users(id);

-- Add index for querying site submits by email sent date
CREATE INDEX IF NOT EXISTS idx_site_submit_email_sent_at ON site_submit(email_sent_at);

-- Add comments for documentation
COMMENT ON COLUMN site_submit.email_sent_at IS 'Timestamp when the site submit email was last sent to the client';
COMMENT ON COLUMN site_submit.email_sent_by_id IS 'User ID of who sent the site submit email';
```

## Metadata Independence

The site submit table now tracks **three independent sets of metadata**:

1. **Created Metadata**
   - `created_at` - When the site submit record was originally created
   - `created_by_id` - User who created the record

2. **Updated Metadata**
   - `updated_at` - When the site submit record was last modified
   - `updated_by_id` - User who last modified the record

3. **Email Sent Metadata** (NEW)
   - `email_sent_at` - When the site submit email was last sent
   - `email_sent_by_id` - User who sent the email

These metadata sets are completely independent and serve different purposes. The email metadata specifically tracks communication with clients, while created/updated metadata tracks record lifecycle.

## Implementation Details

### Edge Function Changes

**File:** `supabase/functions/send-site-submit-email/index.ts`

When a site submit email is sent, the edge function now:

1. Sets `email_sent_at` to the current timestamp
2. Sets `email_sent_by_id` to the authenticated user's ID
3. Continues to update `updated_at` and `updated_by_id` (record modification tracking)
4. Conditionally sets `date_submitted` if null (marks as "Submitted")
5. Conditionally sets `submit_stage_id` to "Submitted-Reviewing" if null

**Code Location:** Lines 192-213

```typescript
const emailSentAt = new Date().toISOString()
const updateData: any = {
  updated_at: emailSentAt,
  updated_by_id: userId,
  email_sent_at: emailSentAt,
  email_sent_by_id: userId
}
```

### UI Components

#### 1. RecordMetadata Component

**File:** `src/components/RecordMetadata.tsx`

**New Props:**
- `emailSentAt?: string | null`
- `emailSentById?: string | null`

**Display:**
- Shows "Email Sent: [timestamp] by [user name]"
- Positioned after Created and Updated metadata
- Uses `UserByIdDisplay` component to fetch and display user name
- Timestamps formatted in EST/EDT timezone

**Example Output:**
```
Created: Nov 13, 2025, 2:30 PM by John Smith
Updated: Nov 14, 2025, 10:15 AM by John Smith
Email Sent: Nov 14, 2025, 10:19 AM by John Smith
```

#### 2. Site Submit Details Page

**File:** `src/pages/SiteSubmitDetailsPage.tsx`

**Changes:**
- Loads `email_sent_at` and `email_sent_by_id` from database (lines 279-280)
- Passes values to `RecordMetadata` component (lines 1065-1066)
- Displays in metadata section at bottom of form

#### 3. KPI Dashboard

**File:** `src/pages/KPIDashboardPage.tsx`

**Changes:**
- Removed dependency on `activity` table for email tracking
- Now reads `email_sent_at` and `email_sent_by_id` directly from `site_submit` table
- Includes `email_sent_by_id` in user lookup queries (line 186)
- Displays "Sent by [user name]" in report (line 233)
- Timestamps displayed in EST/EDT timezone

**Benefits:**
- More reliable - email metadata is always on the site_submit record
- Better performance - no need to query activity table
- Clearer data model - email tracking is first-class data

## Timezone Handling

All timestamps are stored in UTC in the database but displayed in **Eastern Time (EST/EDT)** in the UI:

```typescript
const formatTimestamp = (timestamp: string) => {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York' // Display in EST/EDT
  });
};
```

## Usage

### For End Users

When viewing a site submit:
1. Open the site submit details page
2. Scroll to the bottom to view the metadata section
3. See "Email Sent" timestamp and sender name (if email has been sent)

When viewing the KPI Dashboard:
1. Click on any time period metric (This Week, This Month, This Year)
2. View the report showing all site submits for that period
3. The "Email Sent" column shows when the email was sent and by whom

### For Developers

The email metadata is automatically set by the `send-site-submit-email` edge function. No additional code is needed when sending emails through the standard flow.

To access email metadata in queries:

```typescript
const { data } = await supabase
  .from('site_submit')
  .select('*, email_sent_at, email_sent_by_id')
  .eq('id', siteSubmitId)
  .single();
```

## Related Documentation

- [Site Submit Email Notification System](site-submit-email-notifications.md) - Details about the email sending system
- [Role-Based Permissions](role-based-permissions.md) - User permissions for site submits

## Maintenance Notes

- The `email_sent_at` and `email_sent_by_id` fields are **nullable** - they will be null until the first email is sent
- When an email is sent multiple times, the fields are **overwritten** with the most recent values
- The `idx_site_submit_email_sent_at` index improves query performance when filtering by email sent date
- Email metadata is **independent** of activity table records - both are created for redundancy and different use cases

## Future Enhancements

Potential future improvements:
- Track email send history (multiple sends) in a separate table
- Add email delivery status tracking
- Add email open/click tracking
- Export email activity reports
