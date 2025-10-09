# Site Submit Email System Documentation

## Overview

The Site Submit Email System allows users to send automated email notifications to "Site Selector" contacts when a site submit is created or updated. The system uses Supabase Edge Functions and Resend email service.

---

## Features

✅ **Email Composer Modal** - Salesforce-style email composer with preview and editing
✅ **Rich Text Editor** - Full formatting capabilities (bold, italic, colors, lists, links)
✅ **Editable Recipients** - Add/remove TO, CC, and BCC recipients before sending
✅ **Editable Subject** - Customize subject line for each email
✅ **Preview/Edit Toggle** - Switch between editing and previewing HTML
✅ **Targeted Recipients** - Automatically loads contacts marked as `is_site_selector = true`
✅ **Professional HTML Template** - Pre-populated responsive template
✅ **Site Submit Navigation** - "Site Submits" dropdown menu in navbar with search
✅ **Test Mode** - Safe testing environment before going live

---

## Architecture

```
User clicks "Submit Site" button
    ↓
Frontend queries database for Site Submit + Site Selector contacts
    ↓
Email Composer Modal opens with:
    ├─ Pre-populated TO: Site Selector contacts
    ├─ Pre-populated CC: mike@oculusrep.com, asantos@oculusrep.com
    ├─ Pre-populated Subject: "New site for Review – [Property] – [Client]"
    └─ Pre-populated Body: HTML template with Site Submit details
    ↓
User edits email (optional):
    ├─ Modify recipients (add/remove TO, CC, BCC)
    ├─ Edit subject line
    ├─ Edit body with rich text editor
    └─ Preview HTML output
    ↓
User clicks "Send"
    ↓
Frontend calls Supabase Edge Function with custom email data
    ↓
Edge Function calls Resend API with user's custom content
    ↓
Returns success/failure to frontend
```

---

## Components Created/Modified

### 1. Edge Function
**Location:** `/supabase/functions/send-site-submit-email/index.ts`

**Purpose:** Serverless function that:
- Authenticates the request
- Queries Site Submit and related data
- Finds Site Selector contacts
- Sends emails via Resend
- Returns results

**Current Status:** TEST MODE (sends only to mike@oculusrep.com)

### 2. Email Composer Modal
**Location:** `/src/components/EmailComposerModal.tsx`

**Purpose:** Salesforce-style email composer that:
- Displays editable TO/CC/BCC recipient fields
- Provides rich text editor (React Quill) with formatting toolbar
- Allows toggling between Edit and Preview modes
- Validates email addresses
- Supports keyboard shortcuts (Enter, comma, space) for adding recipients
- Shows recipient count and loading states

**Features:**
- Bold, italic, underline, strike-through
- Text and background colors
- Headers (H1, H2, H3)
- Ordered and bulleted lists
- Text alignment
- Links
- Clean formatting

### 3. Site Submit Details Page
**Location:** `/src/pages/SiteSubmitDetailsPage.tsx`

**Changes:**
- Opens Email Composer Modal when "Submit Site" is clicked
- Fetches Site Submit data and Site Selector contacts
- Generates default email template
- Passes custom email data to Edge Function
- Includes loading spinner and success/error toasts

### 4. Navbar
**Location:** `/src/components/Navbar.tsx`

**Changes:**
- Added "Site Submits" dropdown menu
- Added "Add New Site Submit" option
- Added "Search Site Submits" option
- Added recently viewed Site Submits

### 5. Search Modal
**Location:** `/src/components/DedicatedSearchModal.tsx`

**Changes:**
- Added `site_submit` search type support
- Added database query for site submits
- Added teal icon for site submit results

### 6. Environment Variables
**Location:** `.env.example`

**Added:**
```bash
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=notifications@yourdomain.com
```

---

## Setup Instructions

### Step 1: Sign Up for Resend
1. Go to [resend.com](https://resend.com)
2. Create a free account
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `re_`)

### Step 2: Deploy Edge Function
1. Go to Supabase Dashboard
2. Navigate to Edge Functions
3. Click "Create a new function"
4. Name: `send-site-submit-email`
5. Paste the code from `/supabase/functions/send-site-submit-email/index.ts`
6. Click Deploy

### Step 3: Configure Environment Variables
In Supabase Dashboard → Edge Functions → send-site-submit-email → Secrets:

```
RESEND_API_KEY=re_your_actual_api_key_here
RESEND_FROM_EMAIL=onboarding@resend.dev
```

Note: `onboarding@resend.dev` is for testing. For production, use your verified domain.

### Step 4: Mark Contacts as Site Selectors

Run this SQL to mark a contact as a Site Selector:

```sql
UPDATE contact
SET is_site_selector = true
WHERE id = 'contact-uuid-here';
```

Or to mark by email:

```sql
UPDATE contact
SET is_site_selector = true
WHERE email = 'someone@example.com';
```

### Step 5: Test the System
1. Navigate to any Site Submit page
2. Click the green "Submit Site" button
3. Check mike@oculusrep.com for the test email
4. Email will show who it WOULD send to in production

---

## Production Deployment

### Step 1: Verify Your Domain in Resend
1. Go to [Resend Dashboard → Domains](https://resend.com/domains)
2. Click "Add Domain"
3. Enter `oculusrep.com`
4. Add these DNS records to your domain registrar:
   - SPF record
   - DKIM record
   - DMARC record (optional but recommended)
5. Wait for verification (~15 minutes)

### Step 2: Update Environment Variables
In Supabase Dashboard → Edge Functions → send-site-submit-email → Secrets:

```
RESEND_FROM_EMAIL=notifications@oculusrep.com
```

### Step 3: Deploy Production Code
Replace the Edge Function code with the production version (removing TEST MODE section).

**Contact your developer for the production code when domain is verified.**

---

## How to Use

### Sending an Email

1. **Navigate to a Site Submit:**
   - Click "Site Submits" in navbar
   - Click "Search Site Submits"
   - Search for the site submit
   - Click to open

2. **Click "Submit Site" button:**
   - Green button in top right of page
   - Appears only on existing (saved) site submits
   - Email Composer Modal will open

3. **Review and Edit Email (Optional):**
   - **TO Recipients:** Pre-populated with Site Selector contacts - add/remove as needed
   - **CC Recipients:** Pre-populated with mike@oculusrep.com and asantos@oculusrep.com - modify if needed
   - **BCC Recipients:** Empty by default - add if needed
   - **Subject:** Edit the subject line as desired
   - **Email Body:**
     - Use rich text editor to format and customize content
     - Add your own notes, remove sections, change formatting
     - Click "Preview" to see how the email looks
     - Click "Edit" to continue editing

4. **Send the Email:**
   - Click "Send" button
   - Wait for confirmation: "Successfully sent X email(s)..."
   - Or if error: Check that contacts have valid email addresses

### Keyboard Shortcuts in Recipient Fields

- **Enter, Comma, or Space:** Add email to recipient list
- Click the **×** button on any email tag to remove it

### Default Recipients (Can be Modified Before Sending)

**TO:** Pre-populated with all contacts where:
- `client_id` matches the site submit's client
- `is_site_selector = true`
- `email` is not null

**CC:** Pre-populated with:
- mike@oculusrep.com
- asantos@oculusrep.com

**BCC:** Empty by default

**Note:** All recipients can be added, removed, or modified in the Email Composer before sending.

---

## Email Template Customization

### Available Data Fields

The email template has access to all Site Submit data:

**Basic Info:**
- `siteSubmit.site_submit_name`
- `siteSubmit.client.client_name`
- `siteSubmit.property.property_name`
- `siteSubmit.property.address`, `.city`, `.state`, `.zip`
- `siteSubmit.property_unit.property_unit_name`

**Dates:**
- `siteSubmit.date_submitted`
- `siteSubmit.loi_date`
- `siteSubmit.delivery_date`

**Financial:**
- `siteSubmit.year_1_rent`
- `siteSubmit.ti`

**Other:**
- `siteSubmit.delivery_timeframe`
- `siteSubmit.notes`
- `siteSubmit.customer_comments`
- `siteSubmit.competitor_data`
- `siteSubmit.loi_written`

### How to Edit the Template

Edit the `generateEmailTemplate()` function in the Edge Function.

**Add a field:**
```typescript
<div class="field">
  <span class="label">Your Label:</span>
  <span class="value">${siteSubmit.field_name || 'N/A'}</span>
</div>
```

**Add a conditional field (only shows if value exists):**
```typescript
${siteSubmit.field_name ? `
  <div class="field">
    <span class="label">Your Label:</span>
    <span class="value">${siteSubmit.field_name}</span>
  </div>
` : ''}
```

**Format currency:**
```typescript
<span class="value">$${siteSubmit.amount.toLocaleString()}</span>
```

**Format date:**
```typescript
<span class="value">${new Date(siteSubmit.date_field).toLocaleDateString()}</span>
```

**Change colors:**
Find `.header` in the CSS and change `background-color`:
```css
.header {
  background-color: #10b981;  /* Green instead of blue */
}
```

---

## Troubleshooting

### "No Site Selector contacts found"

**Problem:** The client has no contacts marked as Site Selectors.

**Solution:**
```sql
-- Check contacts for a client
SELECT id, first_name, last_name, email, is_site_selector
FROM contact
WHERE client_id = 'client-uuid';

-- Mark as Site Selector
UPDATE contact
SET is_site_selector = true
WHERE id = 'contact-uuid';
```

### "Failed to send email"

**Problem:** Resend API key is invalid or not configured.

**Solution:**
1. Check Supabase → Edge Functions → Secrets
2. Verify API key starts with `re_`
3. Generate new key in Resend if needed

### "You can only send testing emails..."

**Problem:** Trying to send to unverified emails in sandbox mode.

**Solution:**
- **For testing:** Use TEST MODE (already configured)
- **For production:** Verify your domain in Resend

### Email goes to spam

**Problem:** Using unverified sender domain.

**Solution:**
1. Verify domain in Resend
2. Add all DNS records (SPF, DKIM, DMARC)
3. Use verified domain in `RESEND_FROM_EMAIL`

---

## Cost Breakdown

### Resend
- **Free Tier:** 3,000 emails/month, 100/day
- **Pro:** $20/month for 50,000 emails
- **Typical usage:** ~300 emails/month = **$0**

### Supabase Edge Functions
- **Free Tier:** 500,000 invocations/month
- **After:** $2 per million invocations
- **Typical usage:** ~300 invocations/month = **$0**

**Total monthly cost:** $0 (within free tiers)

---

## Future Enhancements

Potential features to add:

- [ ] Email scheduling (send at specific time)
- [ ] Multiple email templates (different formats)
- [ ] Recipient preview before sending
- [ ] Email history/audit log
- [ ] Bulk email functionality
- [ ] Email open/click tracking (Resend webhooks)
- [ ] Attachments support
- [ ] BCC recipients
- [ ] Reply-to configuration
- [ ] Custom email subject line
- [ ] Stage-based auto-sending

---

## Technical Notes

### Database Schema Requirements

The system queries these tables:
- `site_submit` - Main record
- `contact` - Recipients (requires `is_site_selector` column)
- `client` - For client name
- `property` - For property details
- `property_unit` - For unit details (optional)

### Security

- Edge Function uses service role key for database access
- User authentication required to trigger emails
- CORS headers configured for frontend access
- API keys stored securely in Supabase secrets

### Performance

- Emails sent in parallel using `Promise.all()`
- Database queries optimized with specific field selection
- Single round-trip to fetch all required data

---

## Support & Questions

For issues or questions:

1. Check Supabase Edge Function logs
2. Check Resend dashboard for delivery logs
3. Review browser console for frontend errors
4. Verify database contact configuration

---

## Version History

**v1.0** - Initial implementation
- Basic email sending functionality
- Site Selector contact filtering
- TEST MODE for safe testing
- Navbar integration
- Search functionality

**Status:** TEST MODE - Ready for production after domain verification

---

*Last updated: 2025-01-09*
