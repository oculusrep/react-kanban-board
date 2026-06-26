# Merchant Closure Detection — Deferred

**Status:** Deferred 2026-06-26 on cost grounds. Pick up when budget appetite changes or the value justifies the spend.

## Why deferred

The original [MERCHANTS_LAYER_SPEC.md §13](MERCHANTS_LAYER_SPEC.md) estimated monthly closure-detection refresh at **$0.25–$0.50/month**. That estimate is wrong — it appears to have been calculated against the legacy Places API at $0.017/1000, but `business_status` is no longer on a free tier.

**Actual cost per the 2026 Places API (New) pricing:**

| SKU | $/1000 | Used for |
|---|---:|---|
| Place Details (IDs only) | $0 | id, displayName, types |
| Place Details (Basic) | $5 | + address, location |
| **Place Details (Pro)** | **$20** | **+ `business_status`** ← what we'd need |
| Place Details (Enterprise) | $25 | + ratings, photos |

OVIS currently has **21,108 cached merchant_location rows**.

| Cadence | Cost/sweep | Monthly gross | Net after $200 Maps credit |
|---|---:|---:|---:|
| Monthly | $422 | $422 | $222 |
| Bi-weekly | $422 | $844 | **$644** |
| Weekly | $422 | $1,688 | $1,488 |

Mike's decision 2026-06-26: not worth the spend right now. Logo refresh (free) shipped instead; closure detection deferred.

## What's already built that closure-detection would light up

These are wired and just waiting for closure-alert rows to start appearing:

- **`merchant_closure_alert` table** — schema + RLS done in migration `20260422_merchants_map_layer_tables.sql`.
- **`/admin/merchants` Closure Alerts tab** — [ClosureAlertsTab.tsx](../src/pages/admin/merchants/ClosureAlertsTab.tsx). Empty-state-ready. Acknowledge action works.
- **Map pin treatment** — [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) already renders `CLOSED_PERMANENTLY` pins grayscale/dimmed (when shown) and `CLOSED_TEMPORARILY` pins desaturated. Driven purely by `merchant_location.business_status` — nothing else needed.

The only missing piece is the **producer** of closure-alert rows.

## When to revisit

Triggers that should prompt picking this up:

1. **First time a broker is materially burned** by recommending a permanently-closed location to a client (e.g. sending a site submit to a CLOSED_PERMANENTLY merchant adjacency on a comp report).
2. **OVIS budget for Maps Platform spend goes up** — current $200/month credit covers basic Maps + ingestion + restaurant trends; closure detection would require either a paid plan or willingness to bill ~$220–650/month.
3. **Google Places pricing changes** — the Place Details Pro SKU at $0.02/call is the killer here. If Google introduces a cheaper "status only" sub-tier, math changes.
4. **OVIS expands beyond Georgia** — multi-state would multiply 21k by 3–5×. At that point a "detect closures from text-search absence" strategy becomes the only reasonable option.

## Implementation options when ready

Ranked cheapest → most accurate.

### Option A: Closure-by-absence (cheapest, recommended for first pass)

Re-run the existing three-phase text search (already implemented in [merchantIngestService.ts](../src/services/merchantIngestService.ts), needs port to Deno REST) per category on `refresh_frequency_days` cadence. Inferences:

- Each location returned by the search → `last_verified_at = now()`, `business_status = 'OPERATIONAL'`.
- Each location **not** returned for 2+ consecutive runs → call Place Details (Pro SKU, $0.02) to confirm status. If `CLOSED_*`, write `merchant_closure_alert` row.
- New `place_id`s in search results that aren't in `merchant_location` → insert (catches new-store openings).

**Cost:** roughly same as initial ingestion ($60–120 per full sweep) plus a small Details bill for genuinely-disappeared locations. Estimated $120–250/month bi-weekly, mostly absorbed by Maps credit.

**Detection lag:** up to 2 × `refresh_frequency_days` (e.g. 4 weeks if categories are on 14-day cadence).

**Implementation cost (engineering):** ~6–8 hours. The hard part is porting `merchantIngestService.ts` (browser, uses `google.maps.places.Place.searchByText`) to Deno REST (`POST https://places.googleapis.com/v1/places:searchText`). Same logic, different transport. Three-phase metro-bbox + 4×4 subdivision logic should port directly.

### Option B: Spec-faithful Place Details polling (most accurate, most expensive)

Per spec §4.4 Task 1: call `Place.fetchFields({fields: ['businessStatus']})` on every `merchant_location` on cadence. Status transitions create alerts.

**Cost:** $422 per full sweep (see above table). Burns through the $200 credit at any cadence.

**Detection lag:** matches the cron cadence (1 week if weekly).

**Implementation cost:** ~3–4 hours. Simpler than Option A — no three-phase search to port, just an iterator that hits Place Details for each cached row.

### Option C: Hybrid — text-search ingestion + smart re-poll

Do Option A's text-search re-ingestion (gets us location adds + most closure signal for cheap), but pay for Place Details on a **stratified sample** of high-importance locations (e.g. anything within 1 mile of an active site_submit or deal). This catches "the closures Mike cares about" without paying to poll long-tail merchants.

**Cost:** Option A cost + (active site_submits × ~20 nearby merchants × $0.02 monthly) ≈ Option A + ~$10–30/month.

**Implementation cost:** ~10 hours (Option A + the proximity-stratification logic).

## When to add the in-app surfaces

Independent of producer choice, these UI pieces from spec §11 light up automatically once `merchant_closure_alert` starts having rows:

- **Toolbar badge** on the 🏬 Merchants button (red dot + unacknowledged count). ~1 hour. Reads `merchant_closure_alert` WHERE `acknowledged_at IS NULL`. Simple query, no cron dependency.
- **Weekly digest email** to admins. ~3 hours. Edge Function + cron (Monday mornings ET), Resend via the friday-cfo-email pattern. Sends "N closures detected this week" with link to the admin Alerts tab.
- **Admin hamburger menu badge** — same count as toolbar badge, shown on the Reports menu entry.

These can ship today even with zero closure-detection producer, because the table will populate later. The badge will sit at zero until then.

## Reference files

- [docs/MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — full spec, §4.4 + §10 + §11 are the relevant sections
- [src/services/merchantIngestService.ts](../src/services/merchantIngestService.ts) — browser-side three-phase ingestion to port
- [src/pages/admin/merchants/ClosureAlertsTab.tsx](../src/pages/admin/merchants/ClosureAlertsTab.tsx) — already-built consumer UI
- [supabase/migrations/20260422_*_merchants_map_layer_tables.sql](../supabase/migrations) — `merchant_closure_alert` schema
- [supabase/functions/merchant-logo-refresh/index.ts](../supabase/functions/merchant-logo-refresh/index.ts) — the cron we DID build; pattern for any future merchant Edge Function
