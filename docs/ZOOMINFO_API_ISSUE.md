# ZoomInfo API Integration - Support Ticket Documentation

**Date:** February 16, 2026
**Status:** RESOLVED (April 9, 2026)

## Issue Summary

The ZoomInfo contact enrichment feature was returning a 400 error when requesting email, phone, and other contact fields on the **Search** endpoint. ZoomInfo support confirmed that the **Enrich** endpoint should be used for full data retrieval.

---

## Resolution (April 9, 2026)

ZoomInfo support confirmed:

1. **Search** (`/search/contact`) is intentionally limited — it's for finding records without spending credits. Output fields like email, phone, linkedinUrl are not available here.

2. **Enrich** (`/enrich/contact`) is the correct endpoint for retrieving full contact data (email, phone, etc.). This costs credits.

3. `linkedinUrl` is not a valid output field — use `externalUrls` instead, which is a nested array containing all social media URLs.

4. Search supports preview flags like `hasDirectPhone` and `hasEmail` to check data availability before spending credits on enrichment.

### Changes Made
- [x] Implemented two-step flow: Search (free) → Enrich (credits)
- [x] Added Enrich endpoint (`/enrich/contact`) to edge function
- [x] Replaced `linkedinUrl` with `externalUrls` parsing
- [x] Added `hasEmail` and `hasDirectPhone` to search output fields
- [x] Updated frontend UI with availability indicators and enrichment step
- [ ] Deploy updated edge function
- [ ] Test end-to-end on production

### Final Working Configuration

**Search Request:**
```json
{
  "outputFields": ["id", "firstName", "lastName", "jobTitle", "companyName", "city", "state", "country", "hasEmail", "hasDirectPhone"],
  "rpp": 5,
  "firstName": "John",
  "lastName": "Smith",
  "companyName": "Acme Corp"
}
```

**Enrich Request:**
```json
{
  "matchPersonInput": [{ "personId": "abc123" }],
  "outputFields": ["id", "firstName", "lastName", "email", "phone", "mobilePhone", "jobTitle", "companyName", "externalUrls", "city", "state", "country"]
}
```

---

## Original Issue (February 2026)

### Error Message
```json
{
  "success": false,
  "statusCode": 400,
  "error": "OutputFields invalid or disallowed.",
  "invalidOutputFields": ["email", "phone", "mobilephone", "linkedinurl", "city", "state", "country"]
}
```

**Root cause**: These fields are not available on the Search endpoint. They require the Enrich endpoint.

---

## How to Check Logs

### Supabase Dashboard
https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/functions/hunter-zoominfo-enrich/logs

### CLI
```bash
supabase functions logs hunter-zoominfo-enrich
```
