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

## Known Issues / TODO for Next Session

### Email Template Tweaks Needed
1. **Signature block not appearing** - User's saved email signature may not be rendering correctly
2. **Need extra blank lines**:
   - Add blank line after LOCATION & DEMOGRAPHICS section (before SUPPORTING DOCUMENTS)
   - Add blank line after SUPPORTING DOCUMENTS section

These will be addressed in the next session.

---

## Commits (Tonight's Session)

```
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
