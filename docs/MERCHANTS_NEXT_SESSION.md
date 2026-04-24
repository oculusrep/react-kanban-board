# Merchants Layer — Next Session (start here)

**Date captured:** 2026-04-23 EOD
**Purpose:** Focused pickup point. See [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md), [MERCHANTS_ADMIN_ROADMAP.md](MERCHANTS_ADMIN_ROADMAP.md), and [GOOGLE_PLACES_API_STATUS.md](GOOGLE_PLACES_API_STATUS.md) for full details.

---

## Where we are

**Shipped (on `feature/merchants-places-ingest`, not yet merged to main):**
- Tabbed admin UI at `/admin/merchants` (Brands / Categories / Ingestion / Closure Alerts)
- Logo variant selector per brand
- Places ingestion via the **new** Place.searchByText API (three-phase: statewide → metros → 4×4 subdivision)
- Resume-aware ingestion (skip brands ingested in last 48h)
- Spend-check CLI script
- Pagination fix for `googlePlacesSearchService.textSearch` — fixes a silent bug that was limiting ClosedBusinessSearchPanel to 20 of 60 results
- Full documentation of Places API bugs + migration + costs

**Ran end-to-end:** 401 brands ingested, **~37,000 merchant locations** in `merchant_location` table, $124.58 spent (inside Google's $200/mo credit).

**Not yet visible to brokers:** the map layer itself. The DB has the data; nothing renders it yet.

---

## Short list of what's still to do (prioritized)

### 1. Merge `feature/merchants-places-ingest` → main  *[5 min]*
Gets the ingestion tab, pagination fix, and all docs into production. No code changes needed — just merge and push.

### 2. Build the map layer  *[1–2 days, biggest user impact]*
This is what makes the whole feature real for brokers. Right now you have 37k merchant locations rotting in Supabase with no UI to see them. See spec §6 / §7 / §8:

- **Merchants toolbar button + floating drawer** (spec §6) — category tree with checkboxes, favorites section, search
- **Pin rendering** (spec §7, §8) — `AdvancedMarkerElement` with hotlinked Brandfetch logos, white halo CSS, zoom-scaled sizing, MarkerClusterer
- **Click popup** (spec §9) — InfoWindow showing name / address / business_status / website / phone

### 3. Build the monthly refresh cron  *[1 day]*
Keep merchant data fresh (closure detection, new stores) without re-running a full $124 ingestion. Smart strategy (see [GOOGLE_PLACES_API_STATUS.md §8](GOOGLE_PLACES_API_STATUS.md#8-cost-cutting-options-for-future-merchant-refresh-runs)):

- Nightly Place Details (1¢/call) on each cached `place_id` to detect closures → ~$2–4/month total
- Weekly: Phase 1 + Phase 2 only (skip Phase 3) per category to find new stores → ~$5–10/month total
- Target monthly burn: under $15. (Compare to today's $124 one-time.)
- Pattern to follow: [`supabase/functions/friday-cfo-email`](../supabase/functions/friday-cfo-email/) + its `pg_cron` migration

### 4. Migrate `ClosedBusinessSearchPanel` to the new Places API  *[1 day, can defer 6–12 months]*
Long-term health. Legacy `PlacesService` is deprecated and Google won't fix bugs. Pagination is now working (fix just shipped), but eventually this needs to move to `Place.searchByText`. Not urgent — Google promised ≥12 months notice before discontinuation.

### 5. Favorites UI  *[half-day]*
Schema + RLS already done. Just the UI for creating, sharing, and applying merchant favorites in the drawer. Spec §6.3–6.5.

---

## Lower-priority / nice-to-haves

- **Adaptive subdivision** in ingestion — cuts full-re-run cost 30-40%. Only worth it if you re-ingest often; monthly refresh via #3 above avoids full re-runs entirely. Spec §4 / roadmap.
- **Per-brand and per-category "Ingest" buttons** on Brands/Categories tabs — quick retry for specific brands without running all 401.
- **Brands tab polish** — CSV bulk import, "Review Unclaimed" filter, stale-logo age indicator.
- **AddressSearchBox migration** — legacy `Autocomplete` → new `AutocompleteSuggestion`. ~2–4 hours.
- **PlaceInfoLayer migration** — legacy → `Place` class. ~2 hours.
- **Permissions polish** — `can_admin_merchants` permission so non-admins can edit.

---

## Things to verify first thing when you sit back down

1. **Budget check:** `bun scripts/placesSpendCheck.ts` — confirm monthly spend is where it should be
2. **Branch state:** `git status && git log --oneline -5` — confirm feature branch is clean
3. **Admin UI sanity:** load `/admin/merchants` and spot-check stats
4. **Location count spot-check:** query `SELECT COUNT(*) FROM merchant_location` — should be ~37,000
5. **Brand coverage spot-check:** `bun scripts/checkBrand.ts "Starbucks"` → 293 locations; `bun scripts/checkBrand.ts "Chick-fil-A"` → should be similar high number

---

## Context worth remembering

- **Legacy Google Places API is deprecated** for new customers as of March 2025. Existing bugs won't be fixed. We have ~12–24 months before real EOL.
- **We migrated merchant ingestion to the new Place.searchByText API** because of two unfixable bugs (pagination truncation + INVALID_REQUEST on fresh instances).
- **The new API caps at 20 results/call vs legacy's 60.** This is why our full ingestion cost $124 instead of the originally-estimated $25.
- **ClosedBusinessSearchPanel was silently broken** before today — pagination bug limited it to 20 of 60 results per search. Now fixed.
- **Places API cost is pooled** across all OVIS features. Monitor via `google_places_api_log`.
