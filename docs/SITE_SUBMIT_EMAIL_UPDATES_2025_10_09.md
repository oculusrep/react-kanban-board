# Site Submit Email System Updates - October 9, 2025

## Session Summary

This session focused on completing the site submit email system by:
1. Removing test mode to enable live email sending
2. Implementing comprehensive email template with Salesforce-style formatting
3. Adding auto-generation of Google Maps links
4. Fixing database field name issues

---

## Changes Made

### 1. Remove Test Mode from Email System

**Files Modified:**
- `supabase/functions/send-site-submit-email/index.ts`

**Changes:**
- Removed test mode that was sending only to `mike@oculusrep.com`
- Enabled live sending to actual recipients (TO, CC, BCC)
- Configured `From` address to use logged-in user's @oculusrep.com email
- Set `Reply-To` to logged-in user's email address
- Fetch user email from `user` table instead of just auth email

**Key Code Updates:**
```typescript
// Custom email path - lines 46-94
if (customEmail) {
  let fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

  if (userEmail && userEmail.endsWith('@oculusrep.com')) {
    fromAddress = userEmail // Use user's actual email as From
  }

  // Send to actual recipients (no test mode)
  await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from: fromAddress,
      reply_to: userEmail || undefined,
      to: customEmail.to,
      cc: customEmail.cc.length > 0 ? customEmail.cc : undefined,
      bcc: customEmail.bcc.length > 0 ? customEmail.bcc : undefined,
      subject: customEmail.subject,
      html: customEmail.htmlBody,
    }),
  })
}

// Non-custom email path - lines 145-197
let fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'

if (userEmail && userEmail.endsWith('@oculusrep.com')) {
  fromAddress = userEmail
}

const ccList = ['mike@oculusrep.com', 'asantos@oculusrep.com']
if (userEmail && !ccList.includes(userEmail)) {
  ccList.push(userEmail)
}

// Send to actual Site Selector contacts
const emailPromises = contacts.map(async (contact) => {
  await fetch('https://api.resend.com/emails', {
    body: JSON.stringify({
      from: fromAddress,
      reply_to: userEmail || undefined,
      to: [contact.email],
      cc: ccList,
      subject: `New Site Submit: ${siteSubmit.site_submit_name || 'Untitled'}`,
      html: emailHtml,
    }),
  })
})
```

**Deployment:**
```bash
npx supabase functions deploy send-site-submit-email
```

---

### 2. Auto-Generate and Save Google Maps Links

**Files Modified:**
- `src/components/property/PropertyDetailScreen.tsx`

**Purpose:**
Automatically generate Google Maps URLs from property coordinates and save to `property.map_link` field

**Implementation (lines 195-205):**
```typescript
const handleFieldUpdate = async (field: keyof Property, value: any) => {
  // ...existing code...

  const updates: Record<string, any> = { [field]: value };

  // If coordinates changed, auto-generate and save map_link
  if (field === 'latitude' || field === 'longitude' ||
      field === 'verified_latitude' || field === 'verified_longitude') {
    // Get the best coordinates (prioritize verified)
    const newLat = field === 'verified_latitude' ? value :
                   (property?.verified_latitude || (field === 'latitude' ? value : property?.latitude));
    const newLng = field === 'verified_longitude' ? value :
                   (property?.verified_longitude || (field === 'longitude' ? value : property?.longitude));

    if (newLat && newLng) {
      updates.map_link = `https://www.google.com/maps?q=${newLat},${newLng}`;
      updateField('map_link', updates.map_link);
    }
  }

  await updateProperty(updates);
}
```

**Behavior:**
- Triggers when latitude, longitude, verified_latitude, or verified_longitude changes
- Prioritizes verified coordinates over regular coordinates
- Generates URL: `https://www.google.com/maps?q={lat},{lng}`
- Saves to `property.map_link` field automatically

---

### 3. Comprehensive Email Template Implementation

**Files Modified:**
- `src/pages/SiteSubmitDetailsPage.tsx`

**Overview:**
Complete rewrite of email template to match Salesforce formatting with proper field mappings and conditional logic.

#### Updated Data Fetching (lines 316-395)

**Expanded Property Query:**
```typescript
const { data: siteSubmitData } = await supabase
  .from('site_submit')
  .select(`
    *,
    client:client_id (id, client_name),
    property:property_id (
      id, property_name, address, city, state, zip,
      trade_area, map_link, latitude, longitude,
      verified_latitude, verified_longitude,
      available_sqft, acres, building_sqft,
      rent_psf, asking_lease_price, asking_purchase_price, nnn_psf,
      marketing_materials, site_plan, demographics,
      traffic_count, traffic_count_2nd, total_traffic,
      1_mile_pop, 3_mile_pop, hh_income_median_3_mile
    ),
    property_unit:property_unit_id (
      id, property_unit_name, sqft, rent, nnn
    )
  `)
  .eq('id', siteSubmitId)
  .single();
```

**Fetch All Site Selector Contacts:**
```typescript
const { data: contacts } = await supabase
  .from('contact')
  .select('id, first_name, last_name, email')
  .eq('client_id', siteSubmitData.client_id)
  .eq('is_site_selector', true)
  .not('email', 'is', null);
```

**Fetch User Data for Signature:**
```typescript
const { data: { user } } = await supabase.auth.getSession();
const { data: userData } = await supabase
  .from('user')
  .select('first_name, last_name, email')
  .eq('id', user?.id)
  .single();
```

#### New Template Generation Function (lines 467-640)

**Template Structure:**

1. **Contact Names (Line 1)**
   - All Site Selector first names, comma-separated
   ```typescript
   const contactNames = contacts.map(c => c.first_name).filter(Boolean).join(', ');
   ```

2. **Boilerplate Intro (Line 2)**
   - "Please find below a new site submit for [property_name]. Your feedback on this site is appreciated."

3. **Property Details Section**
   - **Property Name:** Always shown, bolded
   - **Trade Area:** Conditional (only if `property.trade_area` exists)
   - **Map Link:** Auto-generated from coordinates, displays as "View Map"
     ```typescript
     const getMapLink = () => {
       if (property?.map_link) return property.map_link;
       const lat = property?.verified_latitude || property?.latitude;
       const lng = property?.verified_longitude || property?.longitude;
       return (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null;
     };
     ```
   - **Address:** Combined from address, city, state

4. **Available Sqft / Acres (Complex Conditional Logic)**
   ```typescript
   // Priority 1: property_unit.sqft
   if (propertyUnit?.sqft) {
     emailHtml += `<strong>Available Sqft:</strong> ${propertyUnit.sqft.toLocaleString()}<br/>`;
   }
   // Priority 2: property.available_sqft
   else if (property?.available_sqft) {
     emailHtml += `<strong>Available Sqft:</strong> ${property.available_sqft.toLocaleString()}<br/>`;
   }
   // Priority 3: property.acres (with optional building_sqft)
   else if (property?.acres) {
     emailHtml += `<strong>Acres:</strong> ${property.acres}<br/>`;
     if (property?.building_sqft) {
       emailHtml += `<strong>Building Sqft:</strong> ${property.building_sqft.toLocaleString()}<br/>`;
     }
   }
   ```

5. **Base Rent / Ground Lease / Purchase Price (Complex Conditional Logic)**
   ```typescript
   // Priority 1: property_unit.rent
   if (propertyUnit?.rent) {
     emailHtml += `<strong>Base Rent:</strong> ${formatCurrency(propertyUnit.rent)}<br/>`;
   }
   // Priority 2: property.rent_psf
   else if (property?.rent_psf) {
     emailHtml += `<strong>Base Rent:</strong> ${formatCurrency(property.rent_psf)}<br/>`;
   }
   // Priority 3: property.asking_lease_price
   else if (property?.asking_lease_price) {
     emailHtml += `<strong>Ground Lease Rent:</strong> ${formatCurrency(property.asking_lease_price)}<br/>`;
   }
   // Priority 4: property.asking_purchase_price
   else if (property?.asking_purchase_price) {
     emailHtml += `<strong>Purchase Price:</strong> ${formatCurrency(property.asking_purchase_price)}<br/>`;
   }
   ```

6. **NNN (Conditional Logic)**
   ```typescript
   if (propertyUnit?.nnn) {
     emailHtml += `<strong>NNN:</strong> ${formatCurrency(propertyUnit.nnn)}<br/>`;
   } else if (property?.nnn_psf) {
     emailHtml += `<strong>NNN:</strong> ${formatCurrency(property.nnn_psf)}<br/>`;
   }
   ```

7. **Delivery Timeframe**
   ```typescript
   if (siteSubmit.delivery_timeframe) {
     emailHtml += `<strong>Delivery Timeframe:</strong> ${siteSubmit.delivery_timeframe}<br/>`;
   }
   ```

8. **Supporting Files Section** (Conditional - only if files exist)
   - Marketing Materials (hyperlink)
   - Site Plan (hyperlink)
   - Demographics (hyperlink)

9. **Property Location Details Section** (Conditional - only if traffic data exists)
   - Traffic Count
   - Traffic Count 2nd
   - Total Traffic Count

10. **Site Demographics Section** (Conditional - only if demographic data exists)
    - 1 Mile Population
    - 3 Mile Population
    - Median HH Income (3 miles) - formatted as currency

11. **Site Notes Section** (Conditional - only if notes exist)
    - Preserves line breaks: `notes.replace(/\n/g, '<br/>')`

12. **Competitor Sales Section** (Conditional - only if competitor_data exists)
    - Preserves line breaks: `competitor_data.replace(/\n/g, '<br/>')`

13. **Closing Boilerplate**
    - "If this property is a pass, please just respond back to this email with a brief reason as to why it's a pass. If you need more information or want to discuss further, let me know that as well please."

14. **Email Signature**
    ```typescript
    emailHtml += `<br/><br/>`;
    emailHtml += `<p>Thanks!<br/><br/>`;
    emailHtml += `${userData?.first_name || ''} ${userData?.last_name || ''}<br/>`;
    emailHtml += `${userData?.email || ''}</p>`;
    ```

**Helper Functions:**
```typescript
// Currency formatting
const formatCurrency = (value: number | null | undefined) => {
  if (!value) return null;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

// Map link generation
const getMapLink = () => {
  if (property?.map_link) return property.map_link;
  const lat = property?.verified_latitude || property?.latitude;
  const lng = property?.verified_longitude || property?.longitude;
  return (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null;
};
```

---

### 4. Bug Fix: Database Field Name Correction

**Issue:**
Query was failing with 400 Bad Request error:
```
column property_1.traffic_count_2 does not exist
```

**Root Cause:**
Database field is named `traffic_count_2nd` (not `traffic_count_2`)

**Fix Applied:**
Changed all references from `traffic_count_2` to `traffic_count_2nd` in:
- Property query select statement (line 350)
- Template logic (lines 593-605)

**Before:**
```typescript
traffic_count_2,  // ❌ Wrong field name
```

**After:**
```typescript
traffic_count_2nd,  // ✅ Correct field name
```

---

## Testing & Debugging

### Debug Logging Added (Temporary)
```typescript
console.log('Site Submit Data:', siteSubmit);
console.log('Property Unit:', propertyUnit);
console.log('Property:', property);
```

**Purpose:** Verify data is being fetched correctly from database

**Location:** Beginning of `generateEmailTemplate()` function

**Note:** Can be removed once testing is complete

---

## Documentation Created

1. **EMAIL_TEMPLATE_REQUIREMENTS.md**
   - Complete specification of all template fields
   - Conditional logic for each field
   - Show/hide rules
   - Data source mappings
   - Field priorities and fallbacks

2. **SITE_SUBMIT_EMAIL_UPDATES_2025_10_09.md** (this file)
   - Session summary
   - All code changes with context
   - Implementation details
   - Bug fixes

---

## Deployment Steps

### 1. Edge Function Deployment
```bash
npx supabase functions deploy send-site-submit-email
```

### 2. Frontend Deployment
```bash
git add -A
git commit -m "Update site submit email template"
git push
```
- Auto-deploys via Vercel/hosting platform
- Wait for build to complete (~1-2 minutes)
- Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)

---

## Known Issues & Limitations

### 1. User Phone Number Field
- `user` table does not have `phone_number` field
- Signature currently shows: first_name, last_name, email (no phone)
- **Future Enhancement:** Add phone field to user table or use alternative source

### 2. Field Name Verification Needed
- Some field names may not match between schema and Salesforce
- Recommend testing with various property types to verify all fields populate correctly

### 3. Property Unit Data
- Only fetches if `site_submit.property_unit_id` is set
- Falls back to property-level fields if no property_unit

---

## Git Commits Made

1. **`0f94841`** - Update site submit email template with comprehensive field mappings
2. **`3351748`** - Fix email template: Map Link shows 'View Map', add Delivery Timeframe field
3. **`1387717`** - Add debug logging to email template generation
4. **`bcb6b28`** - Fix database field name: traffic_count_2 -> traffic_count_2nd

---

## Next Steps / Future Enhancements

1. **Remove Debug Logging**
   - Once testing confirms all fields populate correctly
   - Remove console.log statements from generateEmailTemplate()

2. **Add Phone Number to Signature**
   - Add `phone_number` field to `user` table
   - Update query and template to include phone

3. **Test with Various Property Types**
   - Property with units
   - Property without units
   - Ground lease properties
   - Purchase properties
   - Verify all conditional logic paths work

4. **Additional Template Improvements**
   - Add property images if available
   - Add custom branding/logo
   - Enhance mobile email rendering

5. **Analytics/Tracking**
   - Track email open rates (Resend provides this)
   - Track which properties get most engagement
   - Monitor delivery success rates

---

## Related Files

- `supabase/functions/send-site-submit-email/index.ts` - Edge function for sending emails
- `src/pages/SiteSubmitDetailsPage.tsx` - Frontend page with email template
- `src/components/EmailComposerModal.tsx` - Modal for composing/editing emails
- `src/components/property/PropertyDetailScreen.tsx` - Auto-saves map links
- `docs/EMAIL_TEMPLATE_REQUIREMENTS.md` - Complete template specification
- `docs/SITE_SUBMIT_EMAIL_SYSTEM.md` - Original system documentation

---

## Database Schema References

### Key Tables
- `site_submit` - Main site submission record
- `property` - Property details
- `property_unit` - Unit-specific details (sqft, rent, nnn)
- `contact` - Site Selector contacts (where `is_site_selector = true`)
- `client` - Client information
- `user` - User information for email signature

### Important Field Names
- `traffic_count_2nd` (NOT `traffic_count_2`)
- `1_mile_pop`, `3_mile_pop` (quoted in TypeScript)
- `hh_income_median_3_mile`
- `verified_latitude`, `verified_longitude` (priority over lat/lng)

---

## Contact Information

**Implementation Date:** October 9, 2025
**Implemented By:** Claude Code with Mike from Oculus Rep
**Production URL:** https://ovis.oculusrep.com
**Supabase Project:** rqbvcvwbziilnycqtmnc
