# Merchants Layer — Next Session (start here)

**Last updated:** 2026-06-26
**Purpose:** Focused pickup point. See [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) for the full spec, [MERCHANTS_ADMIN_ROADMAP.md](MERCHANTS_ADMIN_ROADMAP.md) for admin-side detail, and [MERCHANTS_CLOSURE_DETECTION_DEFERRED.md](MERCHANTS_CLOSURE_DETECTION_DEFERRED.md) for the parked closure-detection work.

---

## Where we are

**Merchants feature is live in production at https://ovis.oculusrep.com.** Brokers can open the 🏬 Merchants drawer from the map toolbar, filter by category/brand, and see brand-logo pins clustered on the map.

### Shipped end-to-end

| Capability | Files / commits |
|---|---|
| **Map layer** — toolbar button + 360px floating drawer (dark mode), category tree with tri-state checkboxes, brand search, clickable "N brands" count popover for deselect, brand-logo pins via `AdvancedMarkerElement` with halo CSS, `MarkerClusterer` below zoom 13, click popup with status / phone / website / Get Directions | [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) · [MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx) · [MerchantPopup.tsx](../src/components/mapping/popups/MerchantPopup.tsx) |
| **Brandfetch logo-refresh cron** — daily 08:00 UTC. Renews the 30-day API license per brand AND verifies CDN coverage (distinguishes a real logo from Brandfetch's 338-byte placeholder via Content-Length). Backfilled all 401 brands; 15 misses identified. | [merchant-logo-refresh/index.ts](../supabase/functions/merchant-logo-refresh/index.ts) · migrations `20260626085157`, `20260626101519` |
| **Admin Brands tab — Brandfetch miss surface** — new stat card, new "Brandfetch returned nothing" filter, per-row warning badge (terracotta + `!`). `saveDomain` now resets status to `unknown` and re-verifies via the Edge Function so the badge updates without a reload. | [BrandsTab.tsx](../src/pages/admin/merchants/BrandsTab.tsx) |
| **Verify pin location** — right-click any merchant pin → "Verify pin location" → drag to real storefront → drop. Saves to `verified_latitude` / `verified_longitude` / `verified_at` / `verified_by`. ESC cancels. Verified coords take precedence at render time. Gated by `can_verify_restaurant_locations` (same permission as restaurants). | [MerchantContextMenu.tsx](../src/components/mapping/MerchantContextMenu.tsx) · migration `20260626122550` |
| **Operational cleanup** — unscheduled `friday-cfo-email-summer/winter` crons (they had been silently failing every Friday because the migration referenced a non-existent vault secret). Edge Function code left intact for Mike's planned rework. | migration `20260626093537` |
| **Migration history reconciled** — repaired 4 ghost server-only timestamps that had been blocking `supabase db push` since various Studio/MCP applications | n/a (CLI repairs) |

### DB state right now

- 401 active brands, 35 categories, **21,108 merchant locations**, 9 non-operational
- All 401 brands have `logo_fetched_at` within the past day (well inside Brandfetch's 30-day window)
- **15 brands flagged as `brandfetch_logo_status = 'miss'`** — admin can find them via the "Brandfetch returned nothing" filter. Examples: Kohl's, Sephora, Pottery Barn, Truist Bank, plus resolver mistakes like Sprouts → sproutsocial.com.

---

## What's next (prioritized)

### 1. Favorites UI — apply / create / share saved brand sets *[~2.5 hr lean, ~5–6 hr full spec]*

Schema + RLS for `merchant_favorite`, `merchant_favorite_brand`, `merchant_favorite_share` are already done (April 2026 migration `20260422_merchants_map_layer_tables.sql`). Just need the UI in the drawer. Spec §6.3–6.5.

**Effort breakdown** (per the conversation that led to this doc):

| Piece | Effort |
|---|---|
| Drawer "Favorites" section above the category tree — list with tri-state checkboxes that apply-on-click (toggles every brand in the favorite) | ~1.5 hr |
| "+ New Favorite" modal — name input + brand multi-select (reuses the category tree component) | ~1 hr |
| Delete + Rename | ~30 min |
| Share modal — dropdown of existing OVIS users (NO free-text email per spec) + view/edit permission picker | ~1.5 hr |
| Shared-favorites query + `(owner_name)` suffix in the list | ~1 hr |
| Duplicate action + 3-dot context menu polish | ~30 min |

**Lean MVP** (own favorites only, no sharing) = ~2.5 hr. **Full spec** (with sharing) = ~5–6 hr. Mike's preference when raised in conversation: lean first, defer sharing until it proves itself useful.

**Pickup pointers when starting:**
- The drawer state lives in [LayerManager](../src/components/mapping/layers/LayerManager.tsx) (`merchantSelectedBrandIds: Set<string>`). Favorites should drive this same Set — applying a favorite = unioning its brand IDs into the Set.
- For tri-state on a favorite: compare its brand IDs to the current Set (all in = ☑, none = ☐, partial = ◪). Same logic as the category tri-state already in [MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx).
- For the user picker in the Share modal, the existing `user` table has the rows. Filter to active OVIS users (`ovis_role IS NOT NULL`).
- The "Create Favorite" modal should reuse the category tree from MerchantsDrawer — extract it into its own component before building this.

### 2. "Show all merchants in viewport" toggle — for trade-area scans  *[~1 hr]*

**Mike's ask:** when zoomed into a specific trade area, it'd be useful to flip on "show every merchant we have here" without ticking 401 brand checkboxes. When zoomed out, this is undesirable — would dump 21k pins on the map.

**Recommended shape — a zoom-gated "Show all in viewport" toggle in the drawer:**
- Sits above the category tree, just below the Show on map / N brands row
- **Enabled only when `map.getZoom() >= 13`** (matches the cluster-breakdown threshold — at that zoom you're in trade-area territory). Disabled state shows a "Zoom in to enable" hint.
- When ON, **overrides `selectedBrandIds`** — MerchantLayer fetches every `merchant_location` in viewport regardless of brand filter. Brand-checkbox state is preserved but visually muted so it's clear they aren't driving the render right now.
- When OFF, reverts to brand-checkbox behavior.

**Alternatives considered, not chosen:**
- *Literal "Select all 401 brands" button* — would render 300–600 pins in dense areas (Atlanta intown), turning cluster bubbles into noise. Attractive-nuisance.
- *Auto-show-all-at-high-zoom* — silent magic; users wouldn't know why pins keep changing. Explicit toggle is clearer.
- *Per-category "select all" button* — already exists (the category-level tri-state).

**Implementation notes:**
- Add a `showAllInViewport: boolean` to [LayerManager](../src/components/mapping/layers/LayerManager.tsx) state alongside `merchantSelectedBrandIds`.
- MerchantLayer's `fetchLocations` checks the flag — when true, drops the `.in('brand_id', brandIds)` filter from the Supabase query. Everything else (viewport bounds, pagination, popup, verify-location) works unchanged.
- Add a zoom-change listener on the map so the toggle disables/enables in real time as the user pans/zooms.

### 3. Closure detection (still deferred)

See [MERCHANTS_CLOSURE_DETECTION_DEFERRED.md](MERCHANTS_CLOSURE_DETECTION_DEFERRED.md) for the full writeup of why it's deferred (~$220–650/month at current Places API pricing) and the three options for picking it up. Triggers that would prompt revisiting: a broker getting burned by a closed-merchant recommendation, OVIS budget for Maps Platform going up, multi-state expansion, or Google introducing a cheaper status-check SKU.

### 4. Migrate `ClosedBusinessSearchPanel` to the new Places API  *[1 day, can defer 6–12 months]*

Long-term health item. Legacy `PlacesService` is deprecated. Pagination is working now (fix shipped in April 2026), but eventually this needs to move to `Place.searchByText` like the merchant ingestion already did. Not urgent — Google promised ≥12 months notice before discontinuation.

---

## Lower-priority / nice-to-haves

- **Zoom-scaled pin sizing** — currently fixed at 28px in [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx). Spec §8 calls for 24/32/40px at zoom 13/15/17+. Punted on perf grounds at v1.
- **Per-brand location counts** in the drawer (e.g. "Starbucks (293)") — needs a view that joins COUNT(merchant_location) onto merchant_brand.
- **Closure-alert badge on the Merchants toolbar button** — depends on closure detection (#3) actually populating `merchant_closure_alert` rows.
- **Custom-hosted logos (Layer 3)** — escape hatch for brands where Brandfetch has nothing useful. See [MERCHANTS_ADMIN_ROADMAP.md §6 Layer 3](MERCHANTS_ADMIN_ROADMAP.md). Defer until the 15 current Brandfetch misses get tried-and-failed with alt domains.
- **`can_verify_merchant_locations`** as its own permission instead of piggybacking on `can_verify_restaurant_locations`.
- **Per-brand "Re-ingest" button** on the admin Brands tab — quick retry without running all 401.
- **CSV bulk import / "Review Unclaimed" filter / stale-logo age column** on the Brands tab (older roadmap items, never built).

---

## Things to verify first thing when you sit back down

1. **Cron health:** `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'merchant-logo-refresh-daily';` — should be active, schedule `0 8 * * *`
2. **Brandfetch coverage:** `SELECT brandfetch_logo_status, COUNT(*) FROM merchant_brand WHERE brandfetch_domain IS NOT NULL GROUP BY brandfetch_logo_status;` — should be ~386 ok / ~15 miss
3. **Logo freshness:** `SELECT COUNT(*) FROM merchant_brand WHERE logo_fetched_at < NOW() - INTERVAL '25 days';` — should be small (only stragglers); 0 right after the cron runs
4. **Last cron run:** check Supabase Edge Function logs for `merchant-logo-refresh` — should see daily 08:00 UTC runs with `licenseRenewed:14ish, cdnOk:14ish` in steady state

---

## Context worth remembering

- **Brandfetch CDN's hotlink protection is sneaky.** Requests without browser-like `User-Agent` + `Referer` + `Origin` headers get a 302 to their ToS docs regardless of whether the brand exists. From server-side (Edge Function), we forge those headers. The 200 response is the same for hit vs miss — disambiguator is `Content-Length` (real logos ≥1KB, placeholder = 338 bytes).
- **Spec §13's closure-detection cost estimate ($0.25–0.50/month) is wrong.** Actual is ~$422 per full sweep at current Place Details Pro SKU pricing. See [MERCHANTS_CLOSURE_DETECTION_DEFERRED.md](MERCHANTS_CLOSURE_DETECTION_DEFERRED.md).
- **Re-ingestion (whenever it lands) must NOT overwrite `verified_latitude` / `verified_longitude` / `verified_at` / `verified_by`.** Those are admin overrides. Same constraint as `restaurant_location.verified_*`.
- **Supabase Studio + MCP `apply_migration` insert their own timestamps into `schema_migrations`**, which causes `supabase db push` to fail with "Remote migration versions not found in local migrations directory." Repair with `supabase migration repair --status reverted <ghost_ts1> <ghost_ts2>`. Documented in memory: `reference_supabase_migration_workflow.md`.
- **Today's `friday-cfo-email` discovery: the cron migration `20260302100000_friday_cfo_email_cron.sql` references `vault.secrets.service_role_key` which doesn't exist in this project.** Every Friday firing has been silently 500-ing. The cron is now unscheduled; Edge Function code is intact for Mike's planned rework. Use the inline anon-JWT pattern from `email-triage-job` (or the `X-Cron-Secret` pattern from `gcal-sync-tick`) when rewiring.
