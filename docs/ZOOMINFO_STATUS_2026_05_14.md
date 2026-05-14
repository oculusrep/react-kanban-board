---
status: blocked on vendor
last_updated: 2026-05-14
owner: mike@oculusrep.com
---

# ZoomInfo Integration — Current Status / Pickup Notes

## TL;DR

The ZoomInfo Search → Enrich flow is partially working in production but degraded. ZoomInfo's `/search/contact` endpoint is rejecting `outputFields` that ZoomInfo support themselves told us to use on April 9, 2026. We're shipping a stripped-down Search (just `id`, `firstName`, `lastName`, `jobTitle`, `companyName`) which means the "preview before spending a credit" UX is broken.

An email to ZoomInfo's tech team has been drafted but **not yet sent**. See [ZOOMINFO_SUPPORT_EMAIL_2026_05_13.md](ZOOMINFO_SUPPORT_EMAIL_2026_05_13.md).

## What's working

- PKI / JWT authentication (`/authenticate`) — stable, tokens cached 55 minutes
- `/search/contact` — works with the minimum `outputFields` set: `id, firstName, lastName, jobTitle, companyName`
- `/enrich/contact` — works; defensive parsing handles the four observed response shapes
- Frontend two-step flow in `ProspectingWorkspace.tsx` — wired up and rendering
- Database columns on `contact`: `zoominfo_person_id`, `zoominfo_profile_url`, `zoominfo_last_enriched_at`, `zoominfo_data`

## What's broken / degraded

### 1. Search endpoint rejects recommended `outputFields` (blocked on vendor)

ZoomInfo support's "final working configuration" (April 9, 2026) said this should work:

```json
"outputFields": [
  "id", "firstName", "lastName", "jobTitle", "companyName",
  "city", "state", "country", "hasEmail", "hasDirectPhone"
]
```

The API actually returns:

```json
{
  "statusCode": 400,
  "error": "OutputFields invalid or disallowed.",
  "invalidOutputFields": ["hasEmail", "hasDirectPhone", "city", "state", "country"]
}
```

**Functional impact:**
- No green/gray availability dots in the Search results modal — users can't tell which results have email/phone before spending a credit.
- No city/state on Search hits — ambiguous matches (multiple "John Smith") can't be disambiguated without enriching.
- Net effect: every Search hit must be enriched to be useful → defeats the credit-saving design.

**Code:** [supabase/functions/hunter-zoominfo-enrich/index.ts:192-204](../supabase/functions/hunter-zoominfo-enrich/index.ts#L192-L204)
**Commit that stripped the fields:** `61be82aa` (April 9, 2026)

### 2. Enrich response envelope is inconsistent (worked around)

Production responses for `/enrich/contact` sometimes nest the person record differently. The code now probes four shapes:

```
data.data.result[0].data[0]
data.data.result[0]
data.data[0].data[0]
data.result[0]
```

This is defensive code but not a real fix — we don't know what triggers the shape change.

**Code:** [supabase/functions/hunter-zoominfo-enrich/index.ts:349-378](../supabase/functions/hunter-zoominfo-enrich/index.ts#L349-L378)
**Commit that added the probing:** `a060411f` (April 10, 2026)

### 3. `linkedinUrl` → `externalUrls` undocumented (worked around)

Support told us `linkedinUrl` is not a valid Enrich field — we have to request `externalUrls` (array) and find the entry with `type === "linkedin"`. This isn't in ZoomInfo's public docs. Code at `extractLinkedInUrl()` handles it.

## What I've already tried

| Attempt | Result |
|---|---|
| Requesting `email`/`phone` on Search | 400 — Search doesn't support those (support confirmed) |
| Requesting `hasEmail`/`hasDirectPhone` on Search | 400 — even though support told us to |
| Requesting `city`/`state`/`country` on Search | 400 — same |
| Two-step Search → Enrich flow | Works, but Search is too sparse to be useful |
| Auto-retry Search without `companyName` filter when zero results | Mitigates company-name-mismatch issue ([index.ts:245-263](../supabase/functions/hunter-zoominfo-enrich/index.ts#L245-L263)) |
| Multiple response-shape probing on Enrich | Works but fragile |

## What I haven't tried yet (next steps when picking up)

1. **Send the support email** ([ZOOMINFO_SUPPORT_EMAIL_2026_05_13.md](ZOOMINFO_SUPPORT_EMAIL_2026_05_13.md)) — this is the main blocker. It asks three concrete questions:
   - Are the rejected fields actually entitled to our account, or do we need a plan upgrade?
   - Why does the API reject fields support told us to use?
   - Does `GET /lookup/outputfields/contact/search` reflect per-account entitlements?

2. **Call the `/lookup/outputfields/contact/search` endpoint ourselves** to see what fields ZoomInfo's own API claims we can request. This could either (a) confirm we're not entitled to the preview flags, in which case we have a clear sales conversation to have, or (b) show the preview flags as "available," in which case we have a clear bug to escalate.
   - URL: `https://api.zoominfo.com/lookup/outputfields/contact/search`
   - One-shot diagnostic — could be a 10-minute script using the existing auth flow in the edge function
   - TODO comment lives at [index.ts:194-195](../supabase/functions/hunter-zoominfo-enrich/index.ts#L194-L195)

3. **Check Supabase function logs** for any 400 responses still happening in production:
   - Dashboard: https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/functions/hunter-zoominfo-enrich/logs
   - CLI: `supabase functions logs hunter-zoominfo-enrich`

4. **Decide on UX fallback** if ZoomInfo can't/won't fix the entitlement issue:
   - Option A: Hide the Search step entirely; always go directly to Enrich. Removes credit-saving but works.
   - Option B: Keep Search as a "did we find anyone with this name?" check, but add a clear "results don't show data availability — enrichment costs 1 credit" warning.
   - Option C: Drop ZoomInfo, switch to an alternative (Apollo, RocketReach, etc.). See alternatives table in `docs/PROSPECTING_SYSTEM_SPEC.md`.

## Key files

| File | Role |
|---|---|
| [supabase/functions/hunter-zoominfo-enrich/index.ts](../supabase/functions/hunter-zoominfo-enrich/index.ts) | Edge function — both Search and Enrich actions |
| [src/components/hunter/ProspectingWorkspace.tsx](../src/components/hunter/ProspectingWorkspace.tsx) | Frontend — two-step flow UI (search modal, enrich confirmation, field-merge) |
| [docs/ZOOMINFO_INTEGRATION.md](ZOOMINFO_INTEGRATION.md) | Architecture / API reference |
| [docs/ZOOMINFO_API_ISSUE.md](ZOOMINFO_API_ISSUE.md) | Original Feb 2026 ticket + April 2026 "resolution" (now partly stale) |
| [docs/ZOOMINFO_SUPPORT_EMAIL_2026_05_13.md](ZOOMINFO_SUPPORT_EMAIL_2026_05_13.md) | Drafted but unsent followup email |

## Credentials / config (no changes needed)

Supabase secrets already configured:
- `ZOOMINFO_USERNAME`
- `ZOOMINFO_CLIENT_ID`
- `ZOOMINFO_PRIVATE_KEY`

Auth flow is stable — no action needed there.

## Open questions for ZoomInfo (captured in email)

1. Is our account entitled to `hasEmail`, `hasDirectPhone`, `city`, `state`, `country` on `/search/contact`? If not, what plan unlocks them?
2. Why does the API return `OutputFields invalid or disallowed` for fields support said to use?
3. What's the canonical response envelope for `/enrich/contact`?
4. Is `lookup/outputfields/contact/search` per-account or static?
