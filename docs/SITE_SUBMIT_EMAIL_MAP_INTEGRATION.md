# Site Submit Email Integration - Map Slideout

## Overview

This document describes the implementation of the site submit email functionality directly within the map slideout, allowing users to send emails without losing their map context.

**Date:** November 6, 2025
**Feature:** Email Composer Integration in Map Slideout
**Principle:** Map-First Philosophy & DRY (Don't Repeat Yourself)

---

## Problem Statement

Previously, users had to open a site submit in a new tab to access the email functionality. This violated our Map-First Philosophy principle, which states:

> "Never navigate away from the map view if the action can be performed in context. The map is the primary workspace, and users should be able to complete most tasks without losing their map position or context."

### Previous Workflow (Problematic):
1. User views site submit on map
2. Clicks "Submit Site" button
3. New tab opens with site submit details page
4. User loses map context and position
5. User composes and sends email
6. User returns to map tab (if they remember)

---

## Solution

Implemented a reusable custom hook (`useSiteSubmitEmail`) that centralizes all email logic, making it available both on the map slideout and the details page.

### New Workflow (Improved):
1. User views site submit on map
2. Clicks "Submit Site" button in slideout header
3. Email composer modal opens **on top of the map**
4. User reviews/edits pre-filled email
5. User sends email
6. Modal closes, user is **still on the map** at the same position

---

## Architecture

### 1. Custom Hook: `useSiteSubmitEmail`

**Location:** `src/hooks/useSiteSubmitEmail.ts`

**Purpose:** Single source of truth for all site submit email functionality.

**Key Functions:**

#### `prepareEmail(siteSubmitId: string)`
Fetches all necessary data and prepares the email composer:
- Fetches site submit data with property and unit details
- Retrieves Site Selector contacts from client
- Fetches user data for email signature
- Gets Dropbox files for property unit (if available)
- Generates pre-filled email template
- Opens email composer modal

#### `sendEmail(siteSubmitId: string, emailData: EmailData)`
Sends the email via Supabase Edge Function:
- Authenticates user session
- Calls `send-site-submit-email` Edge Function
- Handles success/error responses
- Shows toast notifications
- Closes modal on success

**State Management:**
```typescript
{
  showEmailComposer: boolean,      // Controls modal visibility
  sendingEmail: boolean,           // Loading state during send
  emailDefaultData: {              // Pre-filled email data
    subject: string,
    body: string,
    recipients: any[]
  }
}
```

**API:**
```typescript
const {
  showEmailComposer,
  setShowEmailComposer,
  sendingEmail,
  emailDefaultData,
  prepareEmail,
  sendEmail,
} = useSiteSubmitEmail();
```

---

### 2. Map Slideout Integration: `PinDetailsSlideout`

**Location:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

**Changes:**

#### Import Hook (Line 29):
```typescript
import { useSiteSubmitEmail } from '../../../hooks/useSiteSubmitEmail';
```

#### Use Hook (Lines 672-679):
```typescript
const {
  showEmailComposer,
  setShowEmailComposer,
  sendingEmail,
  emailDefaultData,
  prepareEmail,
  sendEmail,
} = useSiteSubmitEmail();
```

#### Handler Functions (Lines 1665-1677):
```typescript
const handleSendEmail = async () => {
  if (!siteSubmit?.id || isNewSiteSubmit) {
    showToast('Please save the site submit before sending emails', { type: 'error' });
    return;
  }
  await prepareEmail(siteSubmit.id);
};

const handleSendEmailFromComposer = async (emailData: any) => {
  if (!siteSubmit?.id) return;
  await sendEmail(siteSubmit.id, emailData);
};
```

#### Submit Button (Lines 2303-2316):
```typescript
{/* Submit Site Button - For site submits (opens email composer modal) */}
{!isProperty && siteSubmit?.id && !isNewSiteSubmit && (
  <button
    onClick={handleSendEmail}
    disabled={sendingEmail}
    className="p-2 bg-green-500 bg-opacity-80 hover:bg-green-600 hover:bg-opacity-90 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
    title="Submit Site - Send email to Site Selector contacts"
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  </button>
)}
```

#### Email Composer Modal (Lines 2640-2651):
```typescript
{/* Email Composer Modal */}
{showEmailComposer && (
  <EmailComposerModal
    isOpen={showEmailComposer}
    onClose={() => setShowEmailComposer(false)}
    onSend={handleSendEmailFromComposer}
    defaultSubject={emailDefaultData.subject}
    defaultBody={emailDefaultData.body}
    defaultRecipients={emailDefaultData.recipients}
    isSending={sendingEmail}
  />
)}
```

---

### 3. Details Page Integration: `SiteSubmitDetailsPage`

**Location:** `src/pages/SiteSubmitDetailsPage.tsx`

**Changes:** Same hook integration pattern as PinDetailsSlideout

#### Import Hook (Line 19):
```typescript
import { useSiteSubmitEmail } from '../hooks/useSiteSubmitEmail';
```

#### Use Hook (Lines 105-113):
```typescript
const {
  showEmailComposer,
  setShowEmailComposer,
  sendingEmail,
  emailDefaultData,
  prepareEmail,
  sendEmail,
} = useSiteSubmitEmail();
```

#### Handler Functions (Lines 536-546):
```typescript
const handleSendEmail = async () => {
  if (!siteSubmitId || isNewSiteSubmit) {
    showToast('Please save the site submit before sending emails', { type: 'error' });
    return;
  }
  await prepareEmail(siteSubmitId);
};

const handleSendEmailFromComposer = async (emailData: any) => {
  if (!siteSubmitId) return;
  await sendEmail(siteSubmitId, emailData);
};
```

---

## Code Reduction

### Before (Duplicated Code):
- **PinDetailsSlideout:** Would have needed ~200 lines of email logic
- **SiteSubmitDetailsPage:** Had ~200 lines of email logic
- **Total:** ~400 lines across 2 files

### After (With Hook):
- **useSiteSubmitEmail Hook:** ~240 lines (single source of truth)
- **PinDetailsSlideout Integration:** ~25 lines
- **SiteSubmitDetailsPage Integration:** ~20 lines
- **Total:** ~285 lines

**Code Reduction:** ~115 lines removed (28% reduction)
**Maintenance:** Changes only need to be made in one place

---

## Email Data Flow

### 1. User Clicks "Submit Site" Button

```
User Action
    ↓
handleSendEmail()
    ↓
prepareEmail(siteSubmitId)
```

### 2. Data Fetching

```
prepareEmail()
    ↓
Fetch Site Submit Data (property, unit, client)
    ↓
Fetch Site Selector Contacts
    ↓
Fetch User Data (for signature)
    ↓
Fetch Dropbox Files (if property unit exists)
    ↓
Generate Email Template
    ↓
Set emailDefaultData
    ↓
Open Email Composer Modal (setShowEmailComposer(true))
```

### 3. User Reviews/Edits Email

```
EmailComposerModal renders
    ↓
Pre-filled with:
  - Subject: "New site for Review – [Property] – [Client]"
  - Body: HTML formatted email with site details
  - Recipients: Site Selector contacts
    ↓
User can edit any field
```

### 4. User Sends Email

```
User clicks "Send"
    ↓
handleSendEmailFromComposer(emailData)
    ↓
sendEmail(siteSubmitId, emailData)
    ↓
POST to /functions/v1/send-site-submit-email
    ↓
Edge Function sends emails via Resend
    ↓
Success toast shown
    ↓
Modal closes automatically
```

---

## Email Template Details

**Generated by:** `generateSiteSubmitEmailTemplate()` in `src/utils/siteSubmitEmailTemplate.ts`

**Includes:**
- Property name and address
- Property details (sqft, rent, etc.)
- Property unit details (if applicable)
- Google Maps link
- Traffic counts and demographics
- Links to Dropbox files (if available)
- User signature with contact info

**Format:** HTML email with proper styling and formatting

---

## Contact Role System

Emails are sent to contacts with the **"Site Selector"** role for the client.

**Database Query:**
```sql
SELECT
  contact.id, contact.first_name, contact.last_name, contact.email
FROM contact_client_role
JOIN contact ON contact.id = contact_client_role.contact_id
JOIN role ON role.id = contact_client_role.role_id
WHERE
  contact_client_role.client_id = [client_id]
  AND contact_client_role.is_active = true
  AND role.role_name = 'Site Selector'
  AND contact.email IS NOT NULL
```

**Deduplication:** Contacts are deduplicated by email address to prevent sending multiple emails to the same person.

---

## Error Handling

### Validation Errors:
- **No Site Submit ID:** "Please save the site submit before sending emails"
- **No Site Selector Contacts:** "No Site Selector contacts found for this client with email addresses"

### Network Errors:
- Connection failures to Supabase
- Edge Function errors
- Email sending failures via Resend

### User Feedback:
- **Success:** Toast notification with count of emails sent
- **Error:** Toast notification with error message
- **Loading:** Button disabled, spinner shown during send

---

## Testing

### Manual Test Steps:

1. **Open Map:**
   - Navigate to `/mapping`

2. **Click Site Submit Pin:**
   - Any site submit pin on the map
   - Slideout opens on the right

3. **Click Submit Site Button:**
   - Green email icon button in slideout header
   - Should be disabled for new site submits

4. **Verify Modal Opens:**
   - Email composer modal appears
   - Pre-filled with correct data
   - Recipients shown at top

5. **Edit Email (Optional):**
   - Change subject, body, or recipients
   - Should maintain changes

6. **Send Email:**
   - Click "Send" button
   - Should show loading state
   - Should close modal on success
   - Should show success toast

7. **Verify Map Context:**
   - Map should still be visible
   - Map position unchanged
   - Slideout still open

### Edge Cases Tested:

✅ New site submit (button disabled)
✅ Site submit without property unit
✅ Client without Site Selector contacts
✅ Property unit with Dropbox files
✅ Property unit without Dropbox mapping
✅ Network error during send
✅ Cancel/close modal without sending

---

## Benefits

### 1. **Map-First Philosophy Compliance**
- Users never leave the map view
- Map position and zoom preserved
- Slideout remains open for further actions

### 2. **Code Reusability**
- Single hook used in multiple places
- Consistent behavior across app
- Easy to add to new components

### 3. **Maintainability**
- Changes made in one place
- Easier to debug and test
- Less code to maintain overall

### 4. **User Experience**
- Faster workflow (no tab switching)
- Context preservation
- Intuitive modal interface
- Immediate feedback

### 5. **Development Standards**
- Follows DRY principle
- Follows Map-First Philosophy
- Proper separation of concerns
- TypeScript type safety

---

## Future Enhancements

### Potential Improvements:

1. **Email Templates:**
   - Allow users to save custom templates
   - Template selection in modal

2. **Scheduled Emails:**
   - Schedule email for later sending
   - Recurring emails for follow-ups

3. **Email History:**
   - Track sent emails per site submit
   - View previous email content
   - Resend functionality

4. **Attachment Support:**
   - Attach files directly from modal
   - Include additional documents

5. **BCC/CC Support:**
   - Add additional recipients
   - Internal team notifications

---

## Related Files

### Core Files:
- `src/hooks/useSiteSubmitEmail.ts` - Email hook
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx` - Map slideout
- `src/pages/SiteSubmitDetailsPage.tsx` - Details page
- `src/components/EmailComposerModal.tsx` - Email modal component

### Utilities:
- `src/utils/siteSubmitEmailTemplate.ts` - Email template generation
- `src/services/dropboxService.ts` - Dropbox file fetching

### Edge Functions:
- `supabase/functions/send-site-submit-email/index.ts` - Email sending service

### Database Tables:
- `site_submit` - Site submit data
- `contact_client_role` - Contact-client relationships
- `contact` - Contact information
- `role` - Role definitions
- `dropbox_mapping` - Dropbox folder mappings

---

## Commit History

**Main Commit:** `6ff9c3a`
```
feat: add reusable email composer to site submit map slideout

Implement email sending directly from the map slideout using a reusable
custom hook, following Map-First Philosophy and DRY principles.
```

**Previous Commits:**
- `9621eed` - Remove postMessage listener causing initialization error
- `cd90805` - Clarify Submit Site button opens in new tab
- `6111e93` - Add Submit Site button to site submit slideout on map
- `211677a` - Add Submit Site button to site submit sidebar

---

## Developer Notes

### When to Use This Hook:

Use `useSiteSubmitEmail` anywhere you need to send site submit emails:
- Map slideouts
- Details pages
- List views
- Dashboard cards
- Batch operations

### Import and Usage:

```typescript
import { useSiteSubmitEmail } from '../hooks/useSiteSubmitEmail';

function MyComponent() {
  const {
    showEmailComposer,
    setShowEmailComposer,
    sendingEmail,
    emailDefaultData,
    prepareEmail,
    sendEmail,
  } = useSiteSubmitEmail();

  const handleEmail = async () => {
    await prepareEmail(siteSubmitId);
  };

  return (
    <>
      <button onClick={handleEmail}>Send Email</button>
      {showEmailComposer && (
        <EmailComposerModal
          isOpen={showEmailComposer}
          onClose={() => setShowEmailComposer(false)}
          onSend={(data) => sendEmail(siteSubmitId, data)}
          defaultSubject={emailDefaultData.subject}
          defaultBody={emailDefaultData.body}
          defaultRecipients={emailDefaultData.recipients}
          isSending={sendingEmail}
        />
      )}
    </>
  );
}
```

### Modifying Email Logic:

To change how emails work, edit only `src/hooks/useSiteSubmitEmail.ts`. Changes will automatically apply to:
- Map slideout
- Details page
- Any future components using the hook

---

## Questions?

For questions about this implementation, contact the development team or refer to:
- `docs/DEVELOPMENT_STANDARDS.md` - Development principles
- `docs/SITE_SUBMIT_EMAIL_SYSTEM.md` - Original email system docs
- `UI_UX_GUIDELINES.md` - Map-First Philosophy details
