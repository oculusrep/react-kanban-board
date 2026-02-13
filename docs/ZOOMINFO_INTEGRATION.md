# ZoomInfo Integration Documentation

## Overview

This document tracks the implementation of ZoomInfo API integration for contact enrichment in the Hunter prospecting module.

**Status**: Blocked - awaiting ZoomInfo account field access
**Last Updated**: 2026-02-13

## Purpose

Enable on-demand contact enrichment from ZoomInfo to fill in missing contact data (phone, email, LinkedIn, title, etc.) for contacts in the Hunter prospecting workflow.

## Implementation Components

### 1. Database Migration
**File**: `supabase/migrations/20260213100000_zoominfo_contact_enrichment.sql`

Added columns to the `contact` table:
- `zoominfo_person_id` (TEXT) - ZoomInfo unique person identifier
- `zoominfo_profile_url` (TEXT) - Direct link to ZoomInfo profile
- `zoominfo_last_enriched_at` (TIMESTAMPTZ) - Last enrichment timestamp
- `zoominfo_data` (JSONB) - Raw API response storage

### 2. Edge Function
**File**: `supabase/functions/hunter-zoominfo-enrich/index.ts`

Supabase Edge Function that:
1. Authenticates with ZoomInfo using PKI (JWT-based) authentication
2. Searches for contacts using name/email/company criteria
3. Returns potential matches for user review before applying changes

### 3. Frontend Integration
**File**: `src/components/hunter/ProspectingWorkspace.tsx`

- "Enrich with ZoomInfo" button in contact sidebar
- Modal for selecting matches and choosing which fields to merge
- Field-by-field comparison when values differ

## Required Supabase Secrets

| Secret Name | Description |
|-------------|-------------|
| `ZOOMINFO_USERNAME` | ZoomInfo account username/email |
| `ZOOMINFO_CLIENT_ID` | ZoomInfo API client ID |
| `ZOOMINFO_PRIVATE_KEY` | ZoomInfo private key (PEM format) |

## Authentication Flow

ZoomInfo uses PKI (Public Key Infrastructure) authentication:

1. Create a JWT with specific claims:
   - `aud`: `'enterprise_api'`
   - `iss`: `'api-client@zoominfo.com'`
   - `client_id`: Your client ID
   - `username`: Your ZoomInfo username
   - `iat`: Current timestamp
   - `exp`: Expiration (5 minutes)

2. Sign JWT with RS256 algorithm using your private key

3. POST to `https://api.zoominfo.com/authenticate` with:
   - Header: `Authorization: Bearer {signed_jwt}`
   - Header: `Accept: application/json`

4. Receive access token (valid for 60 minutes)

5. Use access token for subsequent API calls

### Implementation Reference
Based on official ZoomInfo Python client: https://github.com/Zoominfo/api-auth-python-client

## Troubleshooting History

### Issue 1: 401 Unauthorized from Supabase
**Error**: Edge function call returned 401
**Cause**: Supabase session/JWT verification issue
**Solution**: User re-logged into the application to refresh session

### Issue 2: 500 Error - djwt library issues
**Error**: Internal server error during JWT creation
**Cause**: The `djwt@v3.0.1` Deno library had issues with RSA key handling
**Solution**: Switched to `jose@v5.2.0` library which has better PKCS8 support

### Issue 3: 500 Error - PEM key newlines stripped
**Error**: `Invalid PEM format - missing headers` or key deserialization errors
**Cause**: Supabase secrets strip newlines from PEM keys, breaking the format
**Solution**: Added `normalizePemKey()` function to restore proper PEM format:
```typescript
function normalizePemKey(pem: string): string {
  if (pem.includes('\n')) {
    return pem;
  }
  const match = pem.match(/-----BEGIN PRIVATE KEY-----(.*?)-----END PRIVATE KEY-----/);
  if (!match) {
    throw new Error('Invalid PEM format - missing headers');
  }
  const base64Content = match[1].replace(/\s/g, '');
  const lines = base64Content.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}
```

### Issue 4: 400 Error - Missing username/password
**Error**: `Missing required parameters: 'username' or 'email' must be entered`
**Cause**: Initial implementation used wrong JWT claims and auth request format
**Solution**: Updated to match official ZoomInfo Python client:
- Set issuer to `'api-client@zoominfo.com'` (not client ID)
- Set audience to `'enterprise_api'` (not API URL)
- Include `username` and `client_id` in JWT payload
- Send JWT via `Authorization: Bearer` header (not custom headers)
- Added `ZOOMINFO_USERNAME` as required secret

### Issue 5: 404 Error - Wrong API endpoint
**Error**: `ZoomInfo API error: 404`
**Cause**: Used `/search/person` endpoint which doesn't exist
**Solution**: Changed to correct endpoint: `/search/contact`

### Issue 6: 400 Error - Array parameters
**Error**: `ZoomInfo API error: 400`
**Cause**: Search parameters were passed as arrays (`[value]`) instead of strings
**Solution**: Changed to single string values:
```typescript
// Before (wrong)
searchParams.firstName = [request.first_name];

// After (correct)
searchParams.firstName = request.first_name;
```

### Issue 7: 400 Error - Disallowed output fields (CURRENT BLOCKER)
**Error**:
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
**Cause**: ZoomInfo account does not have access to these fields
**Status**: Awaiting response from ZoomInfo support/account manager

**Temporary Workaround**: Limited output fields to only accessible fields:
- `id`
- `firstName`
- `lastName`
- `jobTitle`
- `companyName`

This significantly limits the usefulness of enrichment since the most valuable fields (email, phone, LinkedIn) are not accessible.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://api.zoominfo.com/authenticate` | POST | Exchange JWT for access token |
| `https://api.zoominfo.com/search/contact` | POST | Search for contacts |

## Search Parameters

The Contact Search API accepts these parameters (based on ZoomInfo Node SDK):

**Contact Information:**
- `personId`, `emailAddress`, `hashedEmail`, `fullName`, `firstName`, `middleInitial`, `lastName`

**Job Details:**
- `jobTitle`, `excludeJobTitle`, `managementLevel`, `excludeManagementLevel`, `department`, `boardMember`

**Company Data:**
- `companyId`, `companyName`, `companyWebsite`, `companyTicker`, `companyDescription`, `parentId`, `ultimateParentId`, `companyType`

**Location:**
- `address`, `street`, `state`, `zipCode`, `country`, `continent`, `zipCodeRadiusMiles`, `metroRegion`

**Pagination:**
- `rpp` (results per page), `page`, `sortBy`, `sortOrder`

## Next Steps

1. **Contact ZoomInfo** - Request access to additional output fields:
   - `email` - Primary contact email
   - `phone` - Direct phone number
   - `mobilePhone` - Mobile phone number
   - `linkedinUrl` - LinkedIn profile URL
   - `city`, `state`, `country` - Location data

2. **Update edge function** - Once field access is granted, restore full output fields list

3. **Test full integration** - Verify enrichment workflow end-to-end

4. **Remove debug logging** - Clean up detailed error responses after integration is stable

## References

- [ZoomInfo API Documentation](https://docs.zoominfo.com/)
- [ZoomInfo Python Auth Client](https://github.com/Zoominfo/api-auth-python-client)
- [ZoomInfo Node SDK](https://github.com/CS3-Marketing/zoominfo-node-sdk)
- [ZoomInfo JS Client](https://github.com/ekohe/zoominfo-js-client)
