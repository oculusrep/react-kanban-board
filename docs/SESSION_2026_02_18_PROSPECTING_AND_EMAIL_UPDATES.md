# Session 2026-02-18: Prospecting Time Tracking & Site Submit Email Updates

## Summary

This session focused on two main areas:
1. Adding prospecting time tracking to the Today's Plan and Prospecting Workspace headers
2. Migrating site submit emails from Resend to Gmail and adding portal deep links

---

## 1. Prospecting Time Tracking

### Features Added

#### Today's Plan Header Time Entry
- Added inline time entry fields (hours + minutes) to the Today's Plan page header
- Users can quickly log their prospecting time for the current day
- Save button persists the entry to the database
- Displays current streak with fire emoji indicator

#### Time History Modal
- New modal accessible via "History" button in the header
- Shows last 30 days of time entries in a scrollable list
- Each row displays: Date, time logged (or "No entry"/"Vacation"), and edit button
- Clicking edit opens the existing TimeEntryModal for that date
- Vacation days shown with special styling

#### Prospecting Workspace Integration
- Same time tracking UI added to the ProspectingWorkspace header
- Consistent experience across both prospecting interfaces

### Files Modified
- `src/components/prospecting/TodaysPlan.tsx` - Added time entry UI and history modal
- `src/components/prospecting/ProspectingWorkspace.tsx` - Added time entry UI
- `src/components/prospecting/TimeHistoryModal.tsx` - New component for viewing/editing history
- `src/components/hunter/TimeEntryModal.tsx` - Fixed z-index to appear above TimeHistoryModal

### Database
Uses existing tables from prospecting system (Phase 1):
- `prospecting_time_entry` - Daily time entries per user
- `prospecting_vacation_day` - Vacation days that protect streak
- `prospecting_settings` - User settings including daily time goal

---

## 2. Site Submit Email Updates

### Gmail Migration
Migrated site submit emails from Resend API to Gmail API for consistency with Hunter outreach emails.

#### Why Gmail?
- Emails appear in user's Gmail Sent folder
- Maintains proper threading if recipients reply
- Consistent with Hunter agent outreach emails
- Uses existing `_shared/gmail.ts` utilities

#### Implementation Details
- Edge function `send-site-submit-email` now uses Gmail API
- Gets user's Gmail connection from `gmail_connection` table
- Handles OAuth token refresh automatically
- Stores `gmail_message_id` and `gmail_thread_id` on site_submit records

### Portal Deep Links
Added clickable portal links to site submit emails.

#### How It Works
1. Email template includes "View in Portal" link
2. Link format: `{portalBaseUrl}/portal/map?selected={siteSubmitId}`
3. When clicked, takes recipient directly to portal map with that site selected

#### Authentication Flow
- If already logged in: Goes directly to map with site selected
- If not logged in: Redirects to `/portal/login`, then back to original URL after login

#### Files Modified for Portal Links
- `src/utils/siteSubmitEmailTemplate.ts` - Added portal link generation
- `src/hooks/useSiteSubmitEmail.ts` - Pass siteSubmitId and portalBaseUrl
- `src/components/SiteSubmitFormModal.tsx` - Pass new parameters
- `src/pages/SiteSubmitDetailsPage.tsx` - Pass new parameters
- `src/pages/portal/PortalLoginPage.tsx` - Fixed redirect to preserve original URL

#### Files Modified for Gmail Migration
- `supabase/functions/send-site-submit-email/index.ts` - Complete rewrite to use Gmail

---

## 3. Other Fixes

### Follow-up Display Improvements
- Follow-ups now display their scheduled date prominently on contact cards
- Activity timeline shows follow-ups sorted chronologically by scheduled date
- Clearer distinction between task creation date and scheduled date

### Activity Management
- Added ability to delete activities from contact record drawer timeline
- Live refresh of scorecard after deleting activities
- Added delete button for tasks in call list (ProspectingWorkspace)

### Map Improvements
- Fixed pin selection issues to allow free map panning
- Removed auto-center behavior from PinDetailsSlideout
- Added red pulsing halo effect around selected site submit pins
- Simplified site submit pin selection indicator

---

## 4. Email Composer Editor Upgrade

### Problem
ReactQuill editor stripped complex HTML like tables, making professional email templates render as plain text.

### Solution
Replaced ReactQuill with TipTap editor which fully supports tables and complex HTML.

#### TipTap Features
- Full table support (insert, add/remove rows/columns, delete)
- Text formatting (bold, italic, underline, strikethrough)
- Headings and lists (bullet, numbered)
- Text alignment (left, center, right)
- Link insertion and removal
- Color support

#### New Packages Installed
```
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-link
@tiptap/extension-underline
@tiptap/extension-text-align
@tiptap/extension-text-style
@tiptap/extension-color
```

#### Professional Table-Based Email Template
The site submit email template now uses a professional table layout:
- Dark header rows for section titles (PROPERTY DETAILS, LOCATION & DEMOGRAPHICS, etc.)
- Two-column property details table
- Styled links with consistent blue color
- User's saved email signature appended at bottom

### Files Modified
- `src/components/EmailComposerModal.tsx` - Replaced ReactQuill with TipTap
- `src/utils/siteSubmitEmailTemplate.ts` - Professional table-based layout
- `src/hooks/useSiteSubmitEmail.ts` - Fetches user's default email signature
- `supabase/functions/_shared/gmail.ts` - Fixed From header format for full name display

### Email Sender Name Fix
Gmail From header now properly displays full name:
```
"First Last" <email@example.com>
```
Instead of just the email address.

---

## 5. Hunter Scorecard Time Tracking

Added prospecting time tracking to the Hunter Scorecard tab.

### Features
- Inline hours/minutes input fields
- Save button to persist entry
- History button opens TimeHistoryModal
- Weekly total display
- Daily goal progress percentage
- Streak indicator with fire emoji

### Files Modified
- `src/components/scorecard/MasterScorecard.tsx` - Added time tracking UI

---

## 6. Email Signature Management (Gmail Settings Page)

### Features Added
Added a full email signature management system to the Gmail Settings page (`/settings/gmail`).

#### TipTap Signature Editor
- Rich text editor using TipTap (same as email composer)
- Toolbar with: Bold, Italic, Underline, Lists, Alignment, Links, Images
- Full HTML support for professional signatures

#### Signature CRUD Operations
- Create multiple signatures with custom names
- Edit existing signatures
- Delete signatures
- Set default signature (used automatically in site submit emails)

#### Database Table
Uses `user_email_signature` table:
- `id` - UUID primary key
- `user_id` - FK to user table
- `name` - Signature display name
- `signature_html` - Rich HTML content
- `is_default` - Boolean for default signature
- `created_at`, `updated_at` - Timestamps

### Files Modified
- `src/pages/GmailSettingsPage.tsx` - Added signature management section with TipTap editor

---

## 7. Email Template Styling Fixes

### Problem
Email template styles weren't rendering in email clients:
- Multi-line inline styles with newlines not parsed by email clients
- CSS `linear-gradient` not supported in most email clients
- Buttons appearing as plain text links

### Solution
Fixed all inline styles for email client compatibility:

#### Single-Line Styles
Converted all multi-line template literal styles to single-line:
```typescript
// Before (broken in email clients)
const buttonStyle = `
  display: inline-block;
  padding: 12px 24px;
  background-color: #2563eb;
`;

// After (works in email clients)
const buttonStyle = `display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff;`;
```

#### Solid Colors Instead of Gradients
Replaced CSS gradients with solid background colors:
```typescript
// Before
background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);

// After
background-color: #1e40af;
```

#### Table-Based Buttons
Changed CTA buttons from styled anchor tags to table-based buttons for better email rendering:
```html
<table cellpadding="0" cellspacing="0" style="display: inline-block;">
  <tr>
    <td style="background-color: #2563eb; border-radius: 6px; padding: 12px 24px;">
      <a href="..." style="color: #ffffff; text-decoration: none;">View on Map</a>
    </td>
  </tr>
</table>
```

### Files Modified
- `src/utils/siteSubmitEmailTemplate.ts` - Fixed all inline styles

---

## 8. Hunter Settings Access

### Problem
No easy way to access Hunter settings (email signatures, templates) from the Hunter dashboard.

### Solution
Added a settings gear icon to the Hunter dashboard header, next to the "Run Hunter" button.

#### Implementation
- Imported `Cog6ToothIcon` from Heroicons
- Added button with click handler to navigate to `/hunter/settings`
- Styled to match existing UI

### Files Modified
- `src/pages/HunterDashboardPage.tsx` - Added settings icon button

---

## 9. Signature Lookup Fix

### Problem
Email signatures not being found when preparing site submit emails.

### Root Cause
`GmailSettingsPage.tsx` was looking up user ID by `email` while `useSiteSubmitEmail.ts` was looking up by `auth_user_id`. If these resolved to different users, signatures wouldn't be found.

### Solution
Changed `GmailSettingsPage.tsx` to use `auth_user_id` for consistency:
```typescript
// Before
const { data } = await supabase
  .from('user')
  .select('id')
  .eq('email', user.email)
  .single();

// After
const { data: { session } } = await supabase.auth.getSession();
const authUserId = session?.user?.id;
const { data } = await supabase
  .from('user')
  .select('id')
  .eq('auth_user_id', authUserId)
  .single();
```

### Files Modified
- `src/pages/GmailSettingsPage.tsx` - Fixed user ID lookup

---

## Commits (This Session)

```
32f91c16 Fix email template styling and add Hunter settings access
fc3f0277 Add TipTap-based email signature editor to Gmail Settings page
... (earlier commits from previous sessions)
5a63d6d0 Replace ReactQuill with TipTap for email composer with table support
be7d6b83 Fix site submit email template for Quill editor compatibility
20b4f448 Redesign site submit email with clean table layout and signature support
41678048 Add prospecting time tracking to Hunter Scorecard tab
f139e1f0 Add session documentation for 2026-02-18
726d84d1 Migrate site submit emails from Resend to Gmail and add portal deep links
7726aed8 Fix timezone issue in useProspectingTime hook
9e37d81d Fix TimeEntryModal z-index to appear above TimeHistoryModal
ea8c7d9a Add time tracking to ProspectingWorkspace header
f808c57c Add prospecting time tracking to Today's Plan header
efff4959 Sort follow-ups chronologically by scheduled date in activity timeline
4b4cbfb7 Improve follow-up task display to clearly show scheduled date
464b4f71 Show follow-up scheduled date on contact card and activity timeline
a1a210db Live refresh scorecard after deleting activities
da65f241 Allow deleting activities from contact records in drawer timeline
7d920d50 Add delete task button to call list in ProspectingWorkspace
b8c756fa Add Lead quick-add modal and simplify site submit pin selection indicator
185b9d9e Pass selectedSiteSubmitId to SiteSubmitLayer for red halo effect
edf83625 Add red pulsing halo effect around selected site submit pins
8bf8a821 Remove auto-center behavior from PinDetailsSlideout to allow free map panning
ed43cb39 Fix map pin selection issues: allow panning and single orange pin
```

---

## Technical Notes

### Gmail API Integration
The site submit email function now uses the shared Gmail utilities:
- `sendEmail()` - Sends email via Gmail API
- `refreshAccessToken()` - Handles OAuth token refresh
- `isTokenExpired()` - Checks if access token needs refresh

### Portal Login Redirect
Portal login now preserves the original destination URL:
```typescript
const from = (location.state as { from?: { pathname: string; search: string } })?.from;
const redirectTo = from ? `${from.pathname}${from.search || ''}` : '/portal';
navigate(redirectTo, { replace: true });
```

This ensures deep links work even when users need to log in first.

### TipTap Editor Setup
```typescript
const editor = useEditor({
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Color,
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ],
  content: '',
});
```

### Email Template Structure
```
[Greeting]
[Intro paragraph]

┌────────────────────────────────────┐
│ PROPERTY DETAILS                   │ ← Dark header
├────────────────────────────────────┤
│ Property Name │ Value              │
│ Address       │ Value              │
│ Size          │ Value              │
│ ...           │ ...                │
└────────────────────────────────────┘

Quick Links: View on Map | View in Portal

┌────────────────────────────────────┐
│ LOCATION & DEMOGRAPHICS            │
├────────────────────────────────────┤
│ 1-Mile Population │ Value          │
│ 3-Mile Population │ Value          │
│ ...               │ ...            │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ SUPPORTING DOCUMENTS               │
├────────────────────────────────────┤
│ Marketing Materials (link)         │
│ Site Plan (link)                   │
│ ...                                │
└────────────────────────────────────┘

[Closing message]
[User's email signature]
```

---

## Quick Reference: Email Template Color Palette

```typescript
const COLORS = {
  primary: '#2563eb',      // Blue for headers and buttons
  primaryDark: '#1d4ed8',  // Darker blue for hover states
  headerBg: '#1e40af',     // Professional blue for section headers
  rowEven: '#ffffff',      // White for even rows
  rowOdd: '#f8fafc',       // Very light gray for odd rows (zebra striping)
  border: '#e2e8f0',       // Light gray border
  text: '#1e293b',         // Dark text
  textMuted: '#64748b',    // Muted text
  accent: '#059669',       // Green for success/highlights
};
```

---

## 10. QuickBooks Invoice Sync Fixes (2026-02-19)

### Problem 1: Inactive Entities (Error 610)
When syncing invoices to QuickBooks, the sync would fail with error:
```
QBO API error: 400 - "Object Not Found: Something you're trying to use has been made inactive"
```

This occurs when a customer, service item, or account has been marked inactive in QuickBooks.

### Solution
Updated `findOrCreateCustomer` and `findOrCreateServiceItem` functions to:
1. Check if the returned entity is inactive (`Active === false`)
2. Automatically reactivate inactive entities before use
3. Provide clear error messages if reactivation fails

#### Files Modified
- `supabase/functions/_shared/quickbooks.ts` - Added inactive entity detection and auto-reactivation

### Problem 2: Orphaned Invoice Links
Invoices showing as "synced" in OVIS but not actually existing in QuickBooks. This happens when an invoice is deleted directly in QBO.

### Solution
Updated `quickbooks-sync-invoice` function to:
1. **Verify invoice exists** before reporting "already synced" - actually calls QBO API
2. **Auto-detect orphaned links** - if invoice doesn't exist in QBO:
   - Clears `qb_invoice_id` and `qb_invoice_number` from payment
   - Sets `qb_sync_status` to `'orphaned'`
   - Sets `qb_sync_pending` to `true` for re-sync
   - Logs the orphan detection for audit
3. **Handle forceResync gracefully** - if invoice is missing during resync, clears link and prompts for new sync

#### Files Modified
- `supabase/functions/quickbooks-sync-invoice/index.ts` - Added orphan detection and recovery

### Problem 3: Payment Name Missing from Invoice Description
Invoice descriptions in QuickBooks were showing:
```
Payment Now Due for Commission related to procuring cause of Contract Agreement with...
```
Instead of the expected format:
```
Payment 1 of 2 Now Due for Commission related to procuring cause of Contract Agreement with...
```

### Root Cause
The `payment_name` column in the database was `null`. The UI generates payment names dynamically using `payment_sequence` and `number_of_payments`, but the QBO sync function was relying on the stored `payment_name` value.

### Solution
Updated `quickbooks-sync-invoice` function to dynamically generate the payment name using the same logic as the UI:

1. Added `payment_sequence` to the payment query
2. Added `number_of_payments` to the deal query
3. Generate payment name dynamically:
```typescript
const totalPayments = deal.number_of_payments || 1
const paymentName = payment.payment_name || `Payment ${payment.payment_sequence || 1} of ${totalPayments}`
const description = `${paymentName} Now Due for Commission related to procuring cause of Contract Agreement with ${deal.deal_name || client.client_name}`
```

#### Files Modified
- `supabase/functions/quickbooks-sync-invoice/index.ts` - Dynamic payment name generation

### Problem 4: Error Messages Disappearing Too Quickly
QBO sync error messages were auto-dismissing after 3 seconds, making it impossible to read the full error.

### Solution
1. Error messages now persist until manually dismissed
2. Added dismiss button (X) to error messages
3. Success messages still auto-dismiss after 5 seconds
4. Added modal popup for missing Contract Signed Date with clear instructions

#### Files Modified
- `src/components/payments/PaymentDetailPanel.tsx` - Persistent error messages, contract date modal

### Commits
```
cfb990a5 Fix QBO invoice description to dynamically generate payment name
166c29e4 Add debug logging to QBO invoice sync for payment_name investigation
d572878a Fix QBO invoice description format in resync to match create
df4f0753 Add modal popup for missing Contract Signed Date on QBO sync
a35f8cf9 Keep QBO sync error messages visible until dismissed
50629f9a Fix orphaned QBO invoice detection and auto-recovery
918dab3d Fix QBO sync error 610 by auto-reactivating inactive entities
```

---

## 11. Prospecting Workspace Improvements (2026-02-19)

### Problem 1: Email History Tab Not Showing Sent Emails
Emails sent from the contact drawer weren't appearing in the Email History tab.

### Root Cause
The `hunter_outreach_draft` records had status `'approved'` but the query was looking for `'sent'`.

### Solution
1. Update draft status to `'sent'` after successfully sending email
2. Query includes both `'sent'` and `'approved'` statuses for backwards compatibility

### Problem 2: Activity Timeline Showing Duplicate Emails
The same email was appearing 2-3 times in the Activity Timeline.

### Root Cause
Emails were being loaded from multiple sources without deduplication:
1. `prospecting_activity` table (when `logActivity('email', ...)` was called)
2. `activity` table (if email activities existed there)
3. `hunter_outreach_draft` table (the actual sent emails)

### Solution
Excluded email types from both `prospecting_activity` and `activity` table queries since `hunter_outreach_draft` is the canonical source for sent emails.

```typescript
// prospecting_activity query now excludes emails
let activitiesQuery = supabase
  .from('prospecting_activity')
  .select('...')
  .neq('activity_type', 'email');  // Exclude emails

// activity table also filters out email type
...(contactActivities || [])
  .filter(a => {
    const typeName = (a.activity_type as { name: string } | null)?.name?.toLowerCase() || '';
    return typeName !== 'email';  // Exclude emails
  })
```

### Problem 3: Activity Timeline Raw HTML Display
The Activity Timeline was showing raw HTML content for emails instead of just the subject line.

### Root Cause
`item.content` for `hunter_outreach` emails contained the full HTML body, and the display logic was falling back to content.

### Solution
Updated label logic to prioritize `item.subject` or `item.email_subject` for emails, only using `item.content` for non-hunter_outreach emails.

### Problem 4: Follow-up Not Appearing After Creation
When creating a follow-up from the contact drawer, it didn't immediately appear in the Activity Timeline.

### Solution
Added `loadActivityFeed()` call to the `onFollowUpCreated` callback to refresh the timeline after creating a follow-up.

### Problem 5: Jarring Refresh When Adding Follow-up
The activity timeline was flashing/resetting when a follow-up was added due to the loading spinner.

### Solution
Added a `silent` parameter to `loadActivityFeed()` that skips showing the loading spinner for background refreshes:

```typescript
const loadActivityFeed = useCallback(async (
  contactId: string,
  targetId?: string | null,
  silent: boolean = false
) => {
  // Only show loading spinner for initial loads, not silent refreshes
  if (!silent) {
    setLoadingFeed(true);
  }
  // ... rest of function
});

// Usage for smooth refresh after follow-up creation
loadActivityFeed(selectedContact.id, selectedContact.target_id, true);
```

### New Features Added

#### Follow-up Button in Contact Drawer
Added a "Follow-up" button next to "Compose & Send Email" button in the contact drawer. Clicking it opens the FollowUpModal to schedule a follow-up task that appears in the Call List.

#### Contact History Browser
Added "Browse History" link in the Contacted Today section that opens a modal with:
- Date picker to select any past date
- List of contacts reached on that date
- Click a contact to view their details in the drawer

#### Files Modified
- `src/components/hunter/ProspectingWorkspace.tsx` - All fixes and new features

### Commits
```
04640b71 Use silent refresh for Activity Timeline after follow-up creation
b2f01b39 Fix duplicate emails in Activity Timeline
6d921040 Refresh Activity Timeline after creating follow-up from contact drawer
8521c51d Fix Activity Timeline showing raw HTML for emails from hunter_outreach
9254f766 Add Follow-up button and Contact History browser to ProspectingWorkspace
6a740065 Fix Email History tab to show sent emails from contact window
```

---

## 12. Portal Password Reset Fixes (2026-02-19)

### Problem 1: 406 Error on Forgot Password
Portal users received a 406 error when trying to reset their password.

### Root Cause
The forgot password page was trying to query the `contact` table to verify the email existed before sending the reset email. Since Row Level Security (RLS) blocks unauthenticated queries to the contact table, this caused a 406 error.

### Solution
Removed the contact table verification query. The new approach:
1. Sends password reset email directly via `supabase.auth.resetPasswordForEmail()`
2. Always shows success message regardless of whether email exists (security best practice)
3. Lets Supabase Auth handle user existence checking internally

#### Files Modified
- `src/pages/portal/PortalForgotPasswordPage.tsx` - Removed contact table query

```typescript
// New approach: Direct Supabase Auth call without pre-verification
const { error: resetError } = await supabase.auth.resetPasswordForEmail(
  email.toLowerCase(),
  { redirectTo: `${window.location.origin}/portal/reset-password` }
);
```

### Problem 2: Generic "Supabase Auth" Sender Name
Password reset emails were sent from "Supabase Auth" instead of a branded sender like "Oculus Portal".

### Solution
Configured custom SMTP settings in Supabase Dashboard to send auth emails via Gmail with a branded alias.

#### Configuration Steps
1. **Set up Gmail alias:**
   - Go to Gmail Settings → "See all settings" → "Accounts and Import"
   - Under "Send mail as", click "Add another email address"
   - Add the alias (e.g., `portal@oculusrep.com`)
   - Verify the alias via confirmation email

2. **Generate Gmail App Password:**
   - Go to Google Account → Security
   - Ensure 2FA is enabled
   - Under "Signing in to Google" → "App passwords"
   - Generate a new app password for "Mail"
   - Copy the 16-character password

3. **Configure Supabase SMTP:**
   - Go to Supabase Dashboard → Project Settings → Authentication → SMTP Settings
   - Enable "Custom SMTP"
   - Settings:
     - **Sender email:** `portal@oculusrep.com` (your Gmail alias)
     - **Sender name:** `Oculus Portal`
     - **Host:** `smtp.gmail.com`
     - **Port:** `587`
     - **Username:** Your Gmail address (e.g., `you@gmail.com`)
     - **Password:** The 16-character App Password (not your regular password)

4. **Test the configuration:**
   - No deployment needed - takes effect immediately
   - Wait a few seconds between attempts (Supabase rate limits to 1 request per 6 seconds)

### Important Notes
- **App Password Required:** Regular Gmail passwords won't work for SMTP. You must use an App Password.
- **2FA Required:** You must have 2-factor authentication enabled on your Google account to generate App Passwords.
- **Rate Limiting:** If you get a 429 error ("Too Many Requests"), wait 6+ seconds and try again. This actually indicates the SMTP is configured correctly.
- **No Code Changes:** This is purely a Supabase Dashboard configuration change.

### Commits
```
(No code changes - configuration only)
```
