# Email to StreetLight Support — AGPS Enablement Request (2026-05-09)

**Context:** Reply to StreetLight support's response on the Crosstown Drive coverage gap. They recommended switching from CVD+ to AGPS with `osm_vintage: [202501]`. We implemented it and tested directly against the SATC API; both `/geometry` calls returned `401 — SATC Aggregated GPS source is not enabled for this account`.

This email asks them to either enable AGPS on the account or quote the upgrade path.

---

## Subject

Re: Crosstown Drive coverage — AGPS source returns 401 "not enabled for this account"

## Body

Thanks for the detailed answer on the CVD+ vs. AGPS distinction — that explanation lined up exactly with the gap we were seeing.

I updated our integration to use the parameters you recommended (`source: "agps"`, `osm_vintage: [202501]`, year 2025). Before deploying broadly I ran a direct probe against `/satc/v1/geometry` and the API returned 401 on every AGPS request:

```json
{
  "message": "SATC Aggregated GPS source is not enabled for this account."
}
```

The exact request body that produced the 401:

```json
{
  "country": "us",
  "mode": "vehicle",
  "source": "agps",
  "osm_vintage": [202501],
  "geometry": {
    "polygon": {
      "type": "Polygon",
      "coordinates": [[
        [-84.590, 33.380],
        [-84.560, 33.380],
        [-84.560, 33.400],
        [-84.590, 33.400],
        [-84.590, 33.380]
      ]]
    }
  }
}
```

I also tested the `nearest`-to-point form from your example payload (point `[-84.56443, 33.37426]`, `number_segments: 10`) — same 401, same message.

For comparison, the same bbox with `source: "cvd_plus"` returns successfully (it now requires `date.year` to be specified, but otherwise works), so the API key itself is valid and authorized for SATC — it just isn't entitled to the AGPS source.

**Two asks:**

1. **Can you enable AGPS on this account?** Our use case is the one we discussed — replacing SitesUSA as our AADT data source for site-selection work, primarily across Georgia / metro Atlanta but expanding to other Southeast markets. The AGPS coverage you described (residential roadways and above, 2019 → Feb 2026) is exactly what we need.

2. **If AGPS is a higher tier than what we're currently on**, can you quote the upgrade path — pricing, contract changes, and any per-segment cost difference vs. the current $0.50/segment we're paying on the 10,000-segment annual plan?

Account is under mike@oculusrep.com (OculusRep). Happy to jump on a call if it's faster than email.

Thanks,
Mike

---

## What Mike needs to fill in / confirm before sending

- [ ] Confirm "OculusRep" is how the account is registered with StreetLight (vs. a different legal entity name on the contract)
- [ ] If you have an account number / customer ID from StreetLight, paste it under the asks for faster routing
- [ ] Confirm the contract terms quoted ($0.50/segment, 10,000/year) match what's actually in the agreement — this came from internal notes, not the contract directly
- [ ] If the previous support thread had a ticket/case number, reply on that thread rather than starting a new one

## Reproduction details (for your reference, not necessarily to include)

- Endpoint: `POST https://api.streetlightdata.com/satc/v1/geometry`
- Auth header: `x-stl-key: <our key>`
- Date of test: 2026-05-09
- All three AGPS request shapes (polygon, nearest-by-count, nearest with `point.coordinates`) returned the same 401 message
- CVD+ returns 200 (with the known coverage gap); only AGPS is blocked at the entitlement layer
