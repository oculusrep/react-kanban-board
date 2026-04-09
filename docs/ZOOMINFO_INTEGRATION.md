# ZoomInfo Integration Documentation

## Overview

This document tracks the implementation of ZoomInfo API integration for contact enrichment in the Hunter prospecting module.

**Status**: Active — two-step Search → Enrich flow implemented
**Last Updated**: 2026-04-09

## Purpose

Enable on-demand contact enrichment from ZoomInfo to fill in missing contact data (phone, email, LinkedIn, title, etc.) for contacts in the Hunter prospecting workflow.

## Architecture: Two-Step Flow

Per ZoomInfo support guidance, the integration uses a two-step flow:

1. **Search** (`/search/contact`) — Find matching contacts. Free, no credits spent. Returns basic info plus availability flags (`hasEmail`, `hasDirectPhone`) so the user can see what data is available before choosing to enrich.

2. **Enrich** (`/enrich/contact`) — Get full contact data for a selected match. Costs 1 credit per call. Returns email, phone, mobilePhone, jobTitle, companyName, externalUrls (replaces linkedinUrl), city, state, country.

### Key API Details (from ZoomInfo Support)

- **Search** is for locating records without spending credits — output fields are intentionally limited
- **Enrich** is for retrieving full data — this is where email, phone, etc. come from
- `linkedinUrl` is NOT a valid Enrich output field — use `externalUrls` instead (nested array with all social media URLs)
- Search supports preview flags like `hasDirectPhone`, `hasEmail` to check data availability before enriching
- Available output fields can be queried via: `https://api.zoominfo.com/lookup/outputfields/contact/search` and `https://api.zoominfo.com/lookup/outputfields/contact/enrich`

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

Supabase Edge Function that handles both actions:

**`action: 'search'`** — Search for contacts
- Input: `contact_id`, `first_name`, `last_name`, `email`, `company`
- Output fields: `id`, `firstName`, `lastName`, `jobTitle`, `companyName`, `city`, `state`, `country`, `hasEmail`, `hasDirectPhone`
- Returns up to 5 matches with availability indicators

**`action: 'enrich'`** — Enrich a specific person
- Input: `contact_id`, `person_id`
- Output fields: `id`, `firstName`, `lastName`, `email`, `phone`, `mobilePhone`, `jobTitle`, `companyName`, `externalUrls`, `city`, `state`, `country`
- Extracts LinkedIn URL from `externalUrls` array automatically
- Returns enriched data for field-level merge

### 3. Frontend Integration
**File**: `src/components/hunter/ProspectingWorkspace.tsx`

- "Enrich with ZoomInfo" button in contact sidebar
- **Step 1**: Search results modal with green/gray availability dots for email and phone
- **Step 2**: After selecting a match, enrichment runs and field-level merge UI appears
- User selects which fields to apply (empty fields auto-selected, conflicting fields shown for review)
- Credit usage is communicated clearly in the UI

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
**Cause**: Supabase session/JWT verification issue
**Solution**: User re-logged into the application to refresh session

### Issue 2: 500 Error - djwt library issues
**Cause**: The `djwt@v3.0.1` Deno library had issues with RSA key handling
**Solution**: Switched to `jose@v5.2.0` library which has better PKCS8 support

### Issue 3: 500 Error - PEM key newlines stripped
**Cause**: Supabase secrets strip newlines from PEM keys, breaking the format
**Solution**: Added `normalizePemKey()` function to restore proper PEM format

### Issue 4: 400 Error - Missing username/password
**Cause**: Initial implementation used wrong JWT claims and auth request format
**Solution**: Updated to match official ZoomInfo Python client — set issuer to `'api-client@zoominfo.com'`, audience to `'enterprise_api'`, send JWT via `Authorization: Bearer` header

### Issue 5: 404 Error - Wrong API endpoint
**Cause**: Used `/search/person` endpoint which doesn't exist
**Solution**: Changed to correct endpoint: `/search/contact`

### Issue 6: 400 Error - Array parameters
**Cause**: Search parameters were passed as arrays instead of strings
**Solution**: Changed to single string values

### Issue 7: 400 Error - Disallowed output fields (RESOLVED)
**Cause**: Was requesting email, phone, linkedinUrl etc. on the **Search** endpoint, which only supports limited output fields
**Resolution**: ZoomInfo support confirmed Search is intentionally limited. Use the **Enrich** endpoint (`/enrich/contact`) for full data. Also, `linkedinUrl` → `externalUrls` (nested field with all social URLs).

## API Endpoints

| Endpoint | Method | Purpose | Credits |
|----------|--------|---------|---------|
| `https://api.zoominfo.com/authenticate` | POST | Exchange JWT for access token | Free |
| `https://api.zoominfo.com/search/contact` | POST | Search for contacts | Free |
| `https://api.zoominfo.com/enrich/contact` | POST | Enrich contact with full data | 1 per call |
| `https://api.zoominfo.com/lookup/outputfields/contact/search` | GET | List available search output fields | Free |
| `https://api.zoominfo.com/lookup/outputfields/contact/enrich` | GET | List available enrich output fields | Free |

## Enrich API Format

The Enrich endpoint uses `matchPersonInput` to specify which person to enrich:

```json
{
  "matchPersonInput": [
    { "personId": "abc123" }
  ],
  "outputFields": [
    "id", "firstName", "lastName", "email", "phone",
    "mobilePhone", "jobTitle", "companyName", "externalUrls",
    "city", "state", "country"
  ]
}
```

### externalUrls Response Format

`externalUrls` is an array of objects:
```json
{
  "externalUrls": [
    { "type": "linkedin", "url": "https://www.linkedin.com/in/johndoe" },
    { "type": "twitter", "url": "https://twitter.com/johndoe" }
  ]
}
```

The edge function automatically extracts the LinkedIn URL from this array.

## References

- [ZoomInfo API Documentation](https://docs.zoominfo.com/)
- [ZoomInfo Python Auth Client](https://github.com/Zoominfo/api-auth-python-client)
- [ZoomInfo Node SDK](https://github.com/CS3-Marketing/zoominfo-node-sdk)
