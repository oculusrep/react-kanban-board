# Session Notes: Portal Email System & Permissions - February 4, 2026

## Overview

This session focused on fixing portal invite email delivery, adding admin menu permissions, fixing authentication issues, and UX improvements for the Arty's Draw Report.

## Features Implemented

### 1. Portal Invite Email System - Gmail API Integration

Switched portal invite emails from Resend API to Gmail API for better deliverability.

**Edge Function Changes:** `supabase/functions/send-portal-invite/index.ts`
- Switched from Resend API to Gmail API for sending emails
- Emails sent from authenticated user's Gmail account
- Added CC to sender so they have a record of sent invites
- Falls back gracefully if Gmail not configured

**New Admin Settings Page:** `src/pages/admin/PortalEmailSettingsPage.tsx`
- Allows admins to configure default portal invite email template
- Subject and message body are editable
- Supports `{{firstName}}` placeholder for contact personalization

**Database Migration:** `supabase/migrations/20260204_portal_email_template_settings.sql`
- Created `app_settings` table for storing application configuration
- Added default portal invite email template
- RLS policies restrict access to admins only

**Compose Modal for Custom Emails:** `src/components/portal/ClientPortalUsersSection.tsx`
- Added compose modal when sending portal invites
- Users can customize subject and message before sending
- Pulls default template from `app_settings` table
- Subject and message pre-populated from admin template

### 2. Admin Menu Permission Controls

Added granular permissions for admin menu items in the hamburger menu.

**New Permissions Added:** `src/types/permissions.ts`
```typescript
can_access_payments_dashboard
can_access_user_management
can_access_prospecting
can_access_hunter_ai
can_access_quickbooks
can_access_budget_pl
can_manage_portal_settings
can_access_client_portal
```

**Navbar Updates:** `src/components/Navbar.tsx`
- Admin menu items now check for specific permissions
- Items hidden if user lacks permission (unless admin role)
- Applied to both desktop dropdown and mobile menu

### 3. Logout 403 Error Fix

Fixed production logout error where users received 403 errors.

**Root Cause:** Supabase's default `signOut()` uses `scope: 'global'` which requires server confirmation and can fail if the session is already invalid.

**Fix Applied:** `src/contexts/AuthContext.tsx`
```typescript
await supabase.auth.signOut({ scope: 'local' });
```
- Changed to `scope: 'local'` which clears the local session without server confirmation
- Eliminates 403 errors on logout

### 4. Arty's Draw Report RLS Policy Fix

Fixed 406 error when Arty Santos accessed the Draw Report.

**Problem:** The `qb_commission_mapping` table had RLS policies that only allowed admins to access it, but Arty has user-level permission to view the report.

**SQL Fix Applied (via Supabase Dashboard):**
```sql
CREATE POLICY "qb_commission_mapping_arty_draw_report" ON qb_commission_mapping
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND (
                u.ovis_role = 'admin'
                OR (u.permissions->>'can_view_arty_draw_report')::boolean = true
            )
        )
    );
```
- Checks user-level `permissions` JSONB field for the specific permission
- Allows access for users with the permission granted at user level (not just role level)

### 5. Arty's Draw Report UX - Tooltip for Truncated Text

Added hover tooltip to show full Name/Memo content.

**File Modified:** `src/components/reports/ArtyDrawReport.tsx`
- Added `title` attribute to Name/Memo column cells
- Added `cursor-help` class for visual cue
- Users can hover over truncated text to see full content

## Files Changed Summary

### New Files
- `src/pages/admin/PortalEmailSettingsPage.tsx` - Admin page for email template settings
- `supabase/migrations/20260204_portal_email_template_settings.sql` - Database migration
- `src/components/portal/StatusBadgeDropdown.tsx` - Clickable status badge for changing deal status
- `src/components/mapping/popups/PlaceInfoPopup.tsx` - Popup for Google Places POI details
- `src/components/mapping/layers/PlaceInfoLayer.tsx` - Layer handling POI click events

### Modified Components
- `src/components/Navbar.tsx` - Permission checks for admin menu items
- `src/components/portal/ClientPortalUsersSection.tsx` - Compose modal, template loading, copy link button
- `src/components/portal/PortalAccessSection.tsx` - Compose modal, template loading (unified behavior)
- `src/components/reports/ArtyDrawReport.tsx` - Tooltip for truncated text
- `src/pages/portal/PortalPipelinePage.tsx` - StatusBadgeDropdown, real-time subscription
- `src/components/portal/PortalDetailSidebar.tsx` - StatusBadgeDropdown integration
- `src/components/mapping/layers/SiteSubmitLayer.tsx` - Real-time subscription for map pins
- `src/pages/portal/PortalMapPage.tsx` - Added PlaceInfoLayer for POI clicks
- `src/pages/MappingPageNew.tsx` - Added PlaceInfoLayer for POI clicks

### Modified Edge Functions
- `supabase/functions/_shared/gmail.ts` - Changed MIME encoding to 7bit
- `supabase/functions/send-portal-invite/index.ts` - Simplified HTML template

### Modified Contexts
- `src/contexts/AuthContext.tsx` - Fixed logout scope

### Modified Types
- `src/types/permissions.ts` - Added new admin menu permissions

### Modified Hooks
- `src/hooks/usePermissions.tsx` - (Referenced, explains permission resolution)

## Key Technical Details

### Permission Resolution Order
The `usePermissions` hook resolves permissions in this order:
1. User-level permission overrides (from `user.permissions` JSONB) - highest priority
2. Role permissions (from `role.permissions` based on `user.ovis_role`) - base permissions

This allows granting specific permissions to individual users without changing their role.

### Gmail API Integration
- Edge functions look up user's Gmail credentials from `gmail_credentials` table
- Emails sent using Google OAuth2 tokens
- User is CC'd on all portal invites they send

## Testing Notes

1. **Portal Email:** Send a portal invite, verify email arrives via Gmail
2. **Compose Modal:** Click invite button, verify modal opens with pre-populated template
3. **Admin Permissions:** Grant a non-admin user `can_access_quickbooks`, verify they see the menu item
4. **Logout:** Log out as any user, verify no 403 error
5. **Arty's Draw Report:** Log in as Arty Santos, verify report loads without 406 error
6. **Tooltip:** On Arty's Draw Report, hover over truncated Name/Memo text, verify tooltip shows full content

### 6. QuickBooks Invoice CC/BCC Email Fix

Fixed issue where CC emails weren't being sent when invoices were emailed from QuickBooks.

**Problem:** When Arty added his email as CC on invoice emails, he wasn't receiving the CC copy. Mike (BCC) was receiving his copy.

**Root Cause:** The `sendInvoice` function was using QuickBooks' `sendTo` query parameter:
```
invoice/${invoiceId}/send?sendTo=${email}
```

According to QuickBooks API behavior, the `sendTo` parameter **overrides all recipients** and ignores the `BillEmailCc` and `BillEmailBcc` fields stored on the invoice.

**Fix Applied:** `supabase/functions/_shared/quickbooks.ts`

Changed from:
```typescript
const endpoint = email
  ? `invoice/${invoiceId}/send?sendTo=${encodeURIComponent(email)}`
  : `invoice/${invoiceId}/send`
```

To:
```typescript
// Always send without sendTo param so QB uses BillEmail, BillEmailCc, and BillEmailBcc from the invoice
const endpoint = `invoice/${invoiceId}/send`
```

Now QuickBooks uses the email addresses already stored on the invoice object (`BillEmail`, `BillEmailCc`, `BillEmailBcc`) which are set during invoice sync.

**Edge Functions Deployed:**
- `quickbooks-send-invoice`
- `quickbooks-sync-invoice`

### 7. Portal Status Badge Dropdown (Broker View)

Added ability for brokers to change deal status directly from the client portal pipeline view.

**New Component:** `src/components/portal/StatusBadgeDropdown.tsx`
- Clickable status badge that opens dropdown with all available stages
- Only editable when `canEdit` prop is true (broker view)
- Updates `site_submit.site_submit_stage_id` in database
- Logs status change as a comment visible to clients
- Color-coded stages with hover states

**Files Modified:**
- `src/pages/portal/PortalPipelinePage.tsx` - Added StatusBadgeDropdown, real-time subscription for site_submit updates
- `src/components/portal/PortalDetailSidebar.tsx` - Added StatusBadgeDropdown with stages fetch
- `src/components/mapping/layers/SiteSubmitLayer.tsx` - Added real-time subscription for map pin auto-refresh

### 8. Copy Invite Link Button

Added ability to copy portal invite links without sending an email, for sharing via text or personal email.

**File Modified:** `src/components/portal/ClientPortalUsersSection.tsx`
- Added link icon button next to each portal user
- Generates new token if none exists or existing one is expired
- Copies link directly to clipboard
- Shows popover with link for easy copying
- Logs action as `link_copied` in `portal_invite_log`

### 9. Unified Portal Invite Email Behavior

Made Contact page and Client page behave consistently when sending portal invites.

**File Modified:** `src/components/portal/PortalAccessSection.tsx`
- Added compose modal (matching Client page behavior)
- Loads email template from `app_settings` table
- Passes `customSubject` and `customMessage` to edge function
- Previously, Contact page sent emails with hardcoded defaults

### 10. HTML Email Button Fix

Fixed issue where HTML email buttons weren't rendering properly in some email clients.

**Files Modified:**
- `supabase/functions/_shared/gmail.ts` - Changed MIME encoding from `quoted-printable` to `7bit`
- `supabase/functions/send-portal-invite/index.ts` - Simplified HTML template, removed VML conditional comments

### 11. Google Places POI Click Feature

Added ability to click on Google Places POIs (businesses, restaurants, etc.) on the map to view place details including business status.

**New Components:**
- `src/components/mapping/popups/PlaceInfoPopup.tsx` - Popup component showing place details
- `src/components/mapping/layers/PlaceInfoLayer.tsx` - Layer component handling POI click events

**Features:**
- Click any Google Places POI on the map to see details
- Shows business status with color-coded badges:
  - 🟢 **Open Now** - Currently open (green badge)
  - ⚪ **Closed Now** - Currently closed but operational (gray badge)
  - 🟡 **Temporarily Closed** - Business temporarily closed (yellow badge)
  - 🔴 **Permanently Closed** - Business permanently closed (red badge)
  - 🟢 **Open** - Operational but hours unknown (green badge)
- Displays address, rating, reviews, phone number
- Expandable hours of operation
- Direct link to website
- Works on both Portal Map and OVIS Map

**Requirements:**
- POI labels must be visible on the map (the "Labels" checkbox must be checked)
- Works in both development and production environments

**Business Status Logic:**
1. Temporary/permanent closures take priority over opening hours
2. If `isOpen()` returns `true` → "Open Now"
3. If `isOpen()` returns `false` → "Closed Now"
4. If `isOpen()` returns `undefined` but `business_status` is OPERATIONAL → "Open"
5. If no data available → no badge shown

**Google Places API Fields Used:**
- `business_status` - OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
- `opening_hours.isOpen()` - Real-time open/closed check
- `opening_hours.weekday_text` - Weekly hours text
- `rating` and `user_ratings_total` - Star rating and review count
- `formatted_address`, `formatted_phone_number`, `website`, `types`

**Files Modified:**
- `src/pages/portal/PortalMapPage.tsx` - Added PlaceInfoLayer component
- `src/pages/MappingPageNew.tsx` - Added PlaceInfoLayer component

**Google Places API Fields Used:**
- `business_status` - OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
- `opening_hours` - Current open/closed status and weekly hours
- `rating` and `user_ratings_total` - Star rating and review count
- `formatted_address`, `formatted_phone_number`, `website`, `types`

### 12. Portal Invite Error Message Improvements

Improved error messages when a portal invite link is invalid to help diagnose issues.

**File Modified:** `src/pages/portal/PortalInviteAcceptPage.tsx`

**Previous Behavior:** Generic "Invalid or expired invite link" message for all token lookup failures.

**New Behavior:** Checks `portal_invite_log` table to determine the specific reason:
- **Already used**: "This invite link has already been used to create an account. Please sign in instead."
- **Expired**: "This invite link has expired. Please contact your broker for a new invite."
- **Revoked**: "This invite link has been revoked. Please contact your broker for a new invite."
- **New invite sent**: "This invite link is no longer valid. A newer invite may have been sent - please check your email for the most recent invite, or contact your broker."
- **Not found**: "This invite link is not valid. Please check your email for the correct link, or contact your broker for a new invite."

**Common Cause of "Invalid" Errors:**
When a new invite is sent (e.g., clicking "Send Invite" again), it generates a new token which invalidates any previous links. Users should always use the most recent invite email.

## Commits

1. `a394c4df` - Add portal email customization, admin menu permissions, and fix logout
2. `a9002e38` - Add hover tooltip to Arty's Draw Report name/memo column
3. `4ac2fbde` - Fix invoice CC/BCC emails not being sent
4. `dc408005` - Document QuickBooks invoice CC/BCC email fix
5. `03eaa107` - Add portal status dropdown and improve invite email formatting
6. `10001cd0` - Fix portal user re-add after revocation
7. `d747c5d1` - Fix MIME encoding for HTML emails
8. `bc0c5d79` - Simplify HTML email template for better compatibility
9. `18135edb` - Add copy invite link button for portal users
10. `5b1a217a` - Unify portal invite email behavior across Contact and Client pages
11. `[pending]` - Add Google Places POI click feature to Portal and OVIS maps
12. `[pending]` - Improve portal invite error messages
