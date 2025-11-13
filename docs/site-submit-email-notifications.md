# Site Submit Email Notifications

## Overview

The Site Submit email notification system allows users to send site information to client contacts who have the "Site Selector" role. This feature helps streamline communication with clients by automatically generating and sending formatted emails with property details.

## How It Works

### Email Button Location

The "Submit Site" email button is available in two locations:
1. **Site Submit Details Page** (`/site-submit/{id}`) - Green button with envelope icon in the header
2. **Pin Details Slideout** - When viewing a site submit on the mapping interface

### Email Sending Process

1. User clicks the "Submit Site" email button
2. System validates that site selectors exist for the client
3. If valid, the email composer modal opens with pre-filled information
4. User can review/edit the email before sending
5. Email is sent to all active "Site Selector" contacts for the client

### Site Selector Role Requirement

**Important**: Emails can only be sent if the client has at least one contact with:
- The "Site Selector" role assigned
- An active status (`is_active = true`)
- A valid email address

If these requirements are not met, users will see an error notification:
> "No site selectors are associated to this client"

## Error Handling

### No Site Selectors Found

**Error Message**: "No site selectors are associated to this client"

**Cause**: The client has no contacts with the "Site Selector" role, or those contacts lack email addresses.

**Resolution**:
1. Navigate to the client's contact list
2. Identify which contacts should receive site submissions
3. Assign the "Site Selector" role to those contacts
4. Ensure each contact has a valid email address
5. Verify the contact is marked as active

### Authentication Issues

**Error Message**: "Not authenticated"

**Cause**: User session has expired or is invalid.

**Resolution**: Sign out and sign back in to refresh the session.

## Email Template

The system automatically generates an email with the following information:

- **Subject**: `New site for Review – {Property Name} – {Client Name}`
- **Body includes**:
  - Site submit name
  - Client name
  - Property details (name, address, city, state, zip)
  - Property unit information (if applicable)
  - Financial information (Year 1 Rent, TI)
  - Delivery timeframe
  - Marketing materials links
  - Property unit files from Dropbox (if available)
  - Notes and customer comments
  - User signature (name, email, phone)

### Email Recipients

- **To**: All contacts with "Site Selector" role for the client
- **CC**:
  - `mike@oculusrep.com`
  - `asantos@oculusrep.com`
  - The sending user (if different from CC list)

## Technical Implementation

### Key Components

1. **`useSiteSubmitEmail` Hook** (`src/hooks/useSiteSubmitEmail.ts`)
   - Manages email state and preparation
   - Fetches site selector contacts from database
   - Shows user-friendly error notifications
   - Requires `showToast` callback from parent component

2. **Toast Component** (`src/components/Toast.tsx`)
   - Displays success/error notifications
   - Requires `visible` prop to render

3. **Edge Function** (`supabase/functions/send-site-submit-email/index.ts`)
   - Handles actual email sending via Resend API
   - Validates contacts and permissions
   - Manages email formatting and attachments

### Database Schema

The system queries the following tables:
- `site_submit` - Site submission data
- `contact_client_role` - Contact-to-client role associations
- `role` - Role definitions (includes "Site Selector")
- `contact` - Contact information including email addresses

### Role-Based Access

**No role restrictions exist on the email button itself**. Any authenticated user can attempt to send emails. However, emails will only be sent if valid site selector contacts exist for the client.

## Troubleshooting

### Issue: Email button not working for specific users

**Possible Causes**:
1. Multiple browser tabs open causing session conflicts
2. Cached authentication data is stale
3. No site selectors assigned to the client

**Steps to Debug**:
1. Close all OVIS tabs except one
2. Hard refresh the browser (Cmd+Shift+R / Ctrl+Shift+R)
3. Check browser console for error messages
4. Verify site selectors exist for the client
5. Sign out and sign back in if issues persist

### Issue: Toast notification not appearing

**Cause**: Missing `visible` prop on Toast component

**Fixed in**: Commit `335fb27` - Added `visible={toast.visible}` prop to Toast in PinDetailsSlideout

## Related Files

- `src/hooks/useSiteSubmitEmail.ts` - Email preparation logic
- `src/pages/SiteSubmitDetailsPage.tsx` - Site submit details page
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Mapping slideout
- `src/components/EmailComposerModal.tsx` - Email composition UI
- `src/components/Toast.tsx` - Notification component
- `src/utils/siteSubmitEmailTemplate.ts` - Email template generation
- `supabase/functions/send-site-submit-email/index.ts` - Email sending service

## Changelog

### 2025-11-13
- **Feature**: Added user-friendly error notification when no site selectors exist
- **Fix**: Added missing `visible` prop to Toast component in PinDetailsSlideout
- **Improvement**: Modified `useSiteSubmitEmail` to accept `showToast` callback for proper notification display
- **Error Message**: Changed from "No Site Selector contacts found for this client with email addresses" to "No site selectors are associated to this client"
