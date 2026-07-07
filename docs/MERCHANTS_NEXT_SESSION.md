# Merchants Layer — Next Session (start here)

**Last updated:** 2026-07-07
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
| **Favorites UI (lean MVP)** — drawer "Favorites" section above the tree with tri-state per favorite, "+ New" modal with preloaded picker, Edit / Delete via 3-dot menu. Sharing deferred. `owner_user_id` is DB-defaulted from `auth.uid()` so the client doesn't have to (and can't) supply it. | [MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx) · [MerchantCategoryTree.tsx](../src/components/mapping/MerchantCategoryTree.tsx) · [NewMerchantFavoriteModal.tsx](../src/components/mapping/NewMerchantFavoriteModal.tsx) · migrations `20260702190000`, `20260702200000`, `20260702210000`, `20260702220000` |
| **"Show all in viewport" toggle + "Select all" link** — the toggle drops the brand filter when zoom ≥ 13; the link ticks every brand at once so users can de-tick outliers instead of ticking 401 boxes. Both live in the drawer. | [MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx) · [LayerManager.tsx](../src/components/mapping/layers/LayerManager.tsx) |
| **Custom brand logo upload (Layer 3)** — admin uploads a PNG/SVG per brand; render prefers `custom_logo_url` over the Brandfetch URL. Storage in existing `assets` bucket under `merchant-logos/`. Upload/Replace/Remove buttons + "C" badge on the preview so overrides are visible at a glance. | [BrandsTab.tsx](../src/pages/admin/merchants/BrandsTab.tsx) · [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) · migration `20260702130000` |
| **Places name-match filter + `places_display_name` override** — Google Places Text Search is over-permissive (searching "24 Hour Fitness" returns Anytime Fitness, YMCAs, dance studios; ~40% of ingested rows were misclassified). Filter now rejects locations whose name doesn't contain the brand's display name (or its "brand minus last word" stem, so "Truist Bank" catches "Truist"). Admin can override per brand via a new inline "Places name" column. | [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) · [merchantIngestService.ts](../src/services/merchantIngestService.ts) · [BrandsTab.tsx](../src/pages/admin/merchants/BrandsTab.tsx) · migration `20260702180000` |
| **Ancillary sub-listing filter + `places_name_exclude` override** — Places returns separate entries for sub-services at the same storefront (Kroger Pharmacy/Bakery/Deli/Fuel Center, Wells Fargo ATM/Advisors, Lowe's Garden Center/Pro Desk/Tool Rental). Filter hides rows matching a hardcoded 20-token default list; per-brand override adds more tokens for edge cases. Hides ~2,000 additional cached rows at render time on top of the name-match filter. | [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) · [merchantIngestService.ts](../src/services/merchantIngestService.ts) · [BrandsTab.tsx](../src/pages/admin/merchants/BrandsTab.tsx) · migration `20260707120000` |

### DB state right now

- 401 active brands, 35 categories, **23,667 merchant locations**
- All 401 brands have `logo_fetched_at` within the past day (well inside Brandfetch's 30-day window)
- **15 brands flagged as `brandfetch_logo_status = 'miss'`** — admin can find them via the "Brandfetch returned nothing" filter. Examples: Kohl's, Sephora, Pottery Barn, Truist Bank, plus resolver mistakes like Sprouts → sproutsocial.com.
- **~48% of cached rows are hidden at render time** by the two new filters (~40% by name-mismatch — Places over-permissiveness — plus ~8.5% by ancillary sub-listing suffix). Rows aren't deleted; toggling `places_display_name` / `places_name_exclude` per brand recovers false-negatives if any.

---

## What's next (prioritized)

### 1. Brand-override curation pass *[~30 min, opportunistic]*

The two new filters (name-match + ancillary) work off defaults that fit most brands but overreach on ~20. When Mike (or any admin) notices a legit brand rendering zero or too-few pins, the fix is per-brand curation in the Brands tab:

- **Places name** column: set the actual Places display name if it differs from the brand row. Known likely candidates: **Truist Bank → `Truist`**, **Dunkin' Donuts → `Dunkin`**, **Apple Store → `Apple`**, **Verizon Wireless → `Verizon`**, **Mavis Discount Tire → `Mavis`**.
- **Exclude tokens** column: extra ancillary tokens for a specific brand (comma-separated, added on top of the global 20-token default).

No re-ingest is needed — the filters are render-time, so curation shows up on the next drawer open. Ingest-time filter picks up the same overrides for future runs.

### 2. Favorites — sharing UI (deferred from lean MVP) *[~2.5 hr]*

Schema + RLS for `merchant_favorite_share` exists (April 2026). Own-favorites CRUD shipped this session; sharing was deferred until it proves itself useful. When adding: user-picker dropdown of existing OVIS users (`ovis_role IS NOT NULL`, no free-text email per spec §6.5), view/edit permission picker, `(owner_name)` suffix in the drawer list for shared favorites. See git blame on [MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx) for the CRUD pattern to extend.

### 3. Closure detection (still deferred)

See [MERCHANTS_CLOSURE_DETECTION_DEFERRED.md](MERCHANTS_CLOSURE_DETECTION_DEFERRED.md) for the full writeup of why it's deferred (~$220–650/month at current Places API pricing) and the three options for picking it up. Triggers that would prompt revisiting: a broker getting burned by a closed-merchant recommendation, OVIS budget for Maps Platform going up, multi-state expansion, or Google introducing a cheaper status-check SKU.

### 4. Migrate `ClosedBusinessSearchPanel` to the new Places API  *[1 day, can defer 6–12 months]*

Long-term health item. Legacy `PlacesService` is deprecated. Pagination is working now (fix shipped in April 2026), but eventually this needs to move to `Place.searchByText` like the merchant ingestion already did. Not urgent — Google promised ≥12 months notice before discontinuation.

---

## Lower-priority / nice-to-haves

- **Zoom-scaled pin sizing** — currently fixed at 28px in [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx). Spec §8 calls for 24/32/40px at zoom 13/15/17+. Punted on perf grounds at v1.
- **Per-brand location counts** in the drawer (e.g. "Starbucks (293)") — needs a view that joins COUNT(merchant_location) onto merchant_brand, and probably should account for the render-time filters so the count matches what shows on the map.
- **Closure-alert badge on the Merchants toolbar button** — depends on closure detection (#3) actually populating `merchant_closure_alert` rows.
- **Bulk-delete of pre-filter cached rows** — the two filters hide ~48% of rows at render time; those rows are still in the DB. A one-shot cleanup script (DELETE by the same predicates) would shrink the table meaningfully. Deferred because deletion is destructive — leave until we're confident the heuristics are stable.
- **Per-brand "Re-ingest" button** on the admin Brands tab — quick retry without running all 401. Especially useful now that `places_display_name` and `places_name_exclude` can be tuned per brand.
- **`can_verify_merchant_locations`** as its own permission instead of piggybacking on `can_verify_restaurant_locations`.
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
- **RLS + `INSERT ... RETURNING` gotcha.** PostgREST's `.insert(...).select(...)` translates to `INSERT ... RETURNING`, at which point Postgres applies the **SELECT** `USING` clause to the returned row. If the SELECT policy uses `EXISTS (SELECT ... FROM same_table WHERE ...)`, that subquery can't see the row-in-flight (MVCC), so it returns FALSE and the whole INSERT is rejected with the opaque `new row violates row-level security policy` message. Fix: rewrite the SELECT USING clause to check the row's own columns directly (no subquery on the same table); if a share-based OR check is needed too, split into two PERMISSIVE policies so they're OR'd. See migration `20260702220000_merchant_favorite_returning_fix.sql`.
- **Layered curation pattern for Places-based data.** Filters run off a hardcoded default plus an optional per-brand override column. Used twice now: `places_display_name` (fixes name-mismatch overreach for brands like Truist Bank → "Truist") and `places_name_exclude` (adds ancillary tokens beyond the 20-token default). Additive-only semantics: if the default overreaches for a specific brand, don't add "un-exclude" logic — instead use the *other* column (`places_display_name`) to pin the expected shape. Keeps the default sane for everyone else.
- **Google Places Text Search is over-permissive.** Searching a common query returns semantically-adjacent businesses too — a "24 Hour Fitness" search returns Anytime Fitness, YMCAs, dance studios; a "Starbucks" search returns Cathedral Coffee. Both the render layer and the ingest guard now require the returned name to look like the brand's expected display name. Prior to that filter, ~40% of cached rows were misclassified. If a brand's ingest ever returns 0 legit-looking rows post-filter, first suspect is `places_display_name` needs setting.
