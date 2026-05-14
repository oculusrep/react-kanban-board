---
to: ZoomInfo Technical Support
from: mike@oculusrep.com
date: 2026-05-13
subject: Search /search/contact rejecting outputFields that your support team confirmed are supported (hasEmail, hasDirectPhone, city, state, country)
---

# Email Draft — ZoomInfo Technical Support

**To:** ZoomInfo Technical Support
**From:** Mike Minihan, Oculus Rep (mike@oculusrep.com)
**Subject:** `/search/contact` rejecting `outputFields` your support team confirmed are supported — followup to April 9 ticket

---

Hi team,

I'm following up on guidance our team received from ZoomInfo support on April 9, 2026 regarding the Search → Enrich two-step flow. We implemented the recommended pattern, but the Search endpoint is still rejecting several `outputFields` that support explicitly told us we should use. I'd like your engineering team to take a look.

## Account context

- ZoomInfo account: Oculus Rep (username available on request)
- Integration: Server-side Supabase Edge Function (Deno) calling the Enterprise API
- Auth: PKI / signed JWT (RS256), `aud: enterprise_api`, `iss: api-client@zoominfo.com` — working correctly, tokens issued and cached for 55 minutes
- Endpoints in use:
  - `POST https://api.zoominfo.com/authenticate` — OK
  - `POST https://api.zoominfo.com/search/contact` — partially working (see below)
  - `POST https://api.zoominfo.com/enrich/contact` — working but response shape is inconsistent (see issue #2)

## Issue 1 — `/search/contact` rejects `outputFields` your team said are supported

On April 9, ZoomInfo support told us the two-step flow should look like this:

1. Call `/search/contact` (free, no credits) with availability flags (`hasEmail`, `hasDirectPhone`) so the user can decide whether enrichment is worth a credit.
2. Call `/enrich/contact` (1 credit) for selected matches to get email/phone/etc.

The "final working configuration" support sent us for Search was:

```json
{
  "outputFields": [
    "id", "firstName", "lastName", "jobTitle", "companyName",
    "city", "state", "country", "hasEmail", "hasDirectPhone"
  ],
  "rpp": 5,
  "firstName": "John",
  "lastName": "Smith",
  "companyName": "Acme Corp"
}
```

When we send exactly that request, the API returns:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "OutputFields invalid or disallowed.",
  "invalidOutputFields": ["hasEmail", "hasDirectPhone", "city", "state", "country"]
}
```

The only Search `outputFields` we have been able to get back without a 400 are:

```
id, firstName, lastName, jobTitle, companyName
```

Anything beyond that — including the `hasEmail` / `hasDirectPhone` preview flags support explicitly recommended — is rejected with `OutputFields invalid or disallowed`.

### Why this matters

Without `hasEmail` and `hasDirectPhone` on Search, the credit-saving UX support designed for us is impossible to deliver:

- Users can't preview whether a Search hit has data before spending a credit on `/enrich/contact`.
- Without `city` / `state`, multiple Search hits with the same first/last name (very common — e.g. several "John Smith"s at large companies) are indistinguishable, so users either guess or enrich all of them.
- Net effect: every Search match must be enriched to be useful, which defeats the point of having a separate free Search step.

### Questions for engineering

1. Are `hasEmail`, `hasDirectPhone`, `city`, `state`, `country` actually entitled on our account for the `/search/contact` endpoint? If the entitlement is plan-based, please confirm what plan/SKU is required to unlock them.
2. If they are entitled, why is the API returning `OutputFields invalid or disallowed` for them?
3. The endpoint `GET https://api.zoominfo.com/lookup/outputfields/contact/search` is documented as returning the available fields — does this endpoint reflect per-account entitlements, or is it a static list? We'd like to call it on startup and trust its output, but we want to confirm the contract first.

## Issue 2 — `/enrich/contact` response envelope is inconsistent

Our Enrich integration works, but we've had to add defensive code that probes four different response shapes to locate the person record:

```
data.data.result[0].data[0]
data.data.result[0]            (when result[0] is the person directly)
data.data[0].data[0]
data.result[0]
```

In production we've observed responses that match more than one of these shapes for what should be equivalent requests. Specifically:

- `matchPersonInput: [{ personId: "..." }]` with `outputFields: [...]`
- Response sometimes nests the person under `data.result[0].data[0]`, other times directly under `data[0]`.

### Questions for engineering

1. What is the canonical response envelope for `/enrich/contact` when called with a single `personId` in `matchPersonInput`?
2. Is there a stable JSON Schema / OpenAPI document for the Enrich response we can code against? The public docs at https://api-docs.zoominfo.com/ don't make the envelope unambiguous.
3. Are there conditions (no match, partial match, multi-match) under which the shape legitimately changes? If so, what field signals which shape is being returned?

## Issue 3 — `linkedinUrl` → `externalUrls` documentation gap

This one is informational — support told us in April that `linkedinUrl` is not a valid Enrich output field and that we should request `externalUrls` instead and parse the array for `type === "linkedin"`. That worked, but it isn't documented at https://api-docs.zoominfo.com/ as far as we can find, and it cost us a couple of debugging cycles. Adding a note about that mapping to the public docs would help other integrators.

## What we'd like from you

1. Confirmation of which Search `outputFields` our account is actually entitled to (issue #1) — ideally with whatever account/plan change is needed to unlock the preview flags.
2. A canonical, documented response envelope for `/enrich/contact` (issue #2).
3. If helpful, we can share Supabase Edge Function logs with full request/response payloads — let me know the best secure way to send them.

Happy to jump on a call with your engineering team if it would speed this up. Thanks for the help.

Best,
Mike Minihan
Oculus Rep
mike@oculusrep.com

---

## Internal notes (not part of email)

**Source of truth for the breakage:**
- `supabase/functions/hunter-zoominfo-enrich/index.ts:192-204` — Search `outputFields` stripped to the minimum set
- `supabase/functions/hunter-zoominfo-enrich/index.ts:349-378` — Enrich response shape probing
- `docs/ZOOMINFO_API_ISSUE.md:38` — Support's "final working configuration" that the API doesn't actually accept
- Commits `61be82aa` (April 9, 15:19 — strip disallowed fields) and `a060411f` (April 10 — handle multiple Enrich shapes)
