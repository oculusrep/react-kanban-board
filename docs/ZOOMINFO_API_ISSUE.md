# ZoomInfo API Integration - Support Ticket Documentation

**Date:** February 16, 2026
**Status:** Waiting for ZoomInfo Support Response

## Issue Summary

The ZoomInfo contact enrichment feature is returning a 400 error when requesting email, phone, and other contact fields. We need ZoomInfo support to clarify whether we're using the correct endpoint and/or if our subscription needs an upgrade.

---

## Current Implementation

### Edge Function Location
```
supabase/functions/hunter-zoominfo-enrich/index.ts
```

### Endpoint Being Called
```
POST https://api.zoominfo.com/search/contact
```

### Authentication Method
PKI (Private Key Infrastructure) using JWT authentication

### Current Request Structure
```json
{
  "outputFields": [
    "id",
    "firstName",
    "lastName",
    "jobTitle",
    "companyName"
  ],
  "rpp": 5,
  "firstName": "John",
  "lastName": "Smith",
  "companyName": "Acme Corp"
}
```

### Fields We Want to Add
- `email`
- `phone`
- `mobilePhone`
- `linkedinUrl`
- `city`
- `state`
- `country`

---

## Error Message

**Date:** February 14, 2026 (Friday)

```json
{
  "success": false,
  "statusCode": 400,
  "error": "OutputFields invalid or disallowed. Please contact your ZoomInfo Account Manager for purchasing options regarding any disallowed fields.",
  "invalidOutputFields": [
    "email",
    "phone",
    "mobilephone",
    "linkedinurl",
    "city",
    "state",
    "country"
  ]
}
```

---

## Questions Sent to ZoomInfo Support

1. Should we be using the **Contact Enrich** endpoint (`/enrich/contact`) instead of **Contact Search** (`/search/contact`) to retrieve email and phone data?

2. If Enrich is the correct endpoint, what are the required input parameters and available output fields?

3. Does our current subscription include access to email, phone, and LinkedIn fields on either the Search or Enrich endpoint?

4. If these fields require an upgrade, what are the purchasing options?

---

## ZoomInfo API Endpoints Reference

### Contact Search (what we're using now)
- **URL:** `https://api.zoominfo.com/search/contact`
- **Purpose:** Find contacts matching search criteria
- **Use case:** "Find people named John Smith at Acme Corp"

### Contact Enrich (might be what we need)
- **URL:** `https://api.zoominfo.com/enrich/contact`
- **Purpose:** Get detailed info for a specific person
- **Use case:** "Give me email/phone for this person I already know about"

---

## Supabase Secrets Required

```
ZOOMINFO_USERNAME    - ZoomInfo account email
ZOOMINFO_CLIENT_ID   - API client ID
ZOOMINFO_PRIVATE_KEY - PEM format private key
```

---

## Code Changes Needed After Resolution

Once ZoomInfo confirms the correct endpoint and fields, update:

1. **Endpoint URL** (line 23 in hunter-zoominfo-enrich/index.ts):
   ```typescript
   const ZOOMINFO_API_URL = 'https://api.zoominfo.com/search/contact';
   // May need to change to: 'https://api.zoominfo.com/enrich/contact'
   ```

2. **Output Fields** (lines 191-198):
   ```typescript
   outputFields: [
     'id',
     'firstName',
     'lastName',
     'jobTitle',
     'companyName',
     // Add these once confirmed:
     // 'email',
     // 'phone',
     // 'mobilePhone',
     // 'linkedinUrl',
   ],
   ```

3. **Input Parameters** (if switching to Enrich endpoint):
   - Enrich endpoint may require different input format
   - May need person ID or email as input instead of name search

---

## How to Check Logs

### Supabase Dashboard
https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/functions/hunter-zoominfo-enrich/logs

### CLI
```bash
supabase functions logs hunter-zoominfo-enrich
```

### Key Log Messages to Look For
- `[ZoomInfo] Generating new access token via PKI auth`
- `[ZoomInfo] Auth failed: {status} {errorText}` - Authentication issue
- `[ZoomInfo Enrich] API error: {status} {errorText}` - API call failed
- `[ZoomInfo Enrich] Found X results` - Success

---

## Support Ticket History

### February 16, 2026 - Initial Response from ZoomInfo
ZoomInfo support requested:
1. Full error message
2. Output values requested
3. Endpoint URL being called

### February 16, 2026 - Our Response
Sent email with all requested details plus questions about Search vs Enrich endpoint.

### [PENDING] ZoomInfo Response
_Add their response here when received_

---

## Resolution Notes

_Document the solution here once resolved_

### Changes Made
- [ ] Updated endpoint URL
- [ ] Updated output fields
- [ ] Updated input parameters
- [ ] Deployed updated function
- [ ] Tested successfully

### Final Working Configuration
```json
// Document the final working request structure here
```
