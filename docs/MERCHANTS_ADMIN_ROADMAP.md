# Merchants Admin — Full Shell Roadmap

**Status:** Admin shell + ingestion complete 2026-04-23. Remaining work is the map layer itself.
**Owner:** mike@oculusrep.com
**Parent spec:** [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — §7 Admin Page

This doc tracks the admin UI work specifically. For the broader map-layer feature see the parent spec.

---

## What exists today

Four-tab admin shell at `/admin/merchants`, gated by `userRole === 'admin'`. Navbar entry under Reports menu. URL-backed tab state via `?tab=...`.

| Tab | Status | What it does |
|-----|--------|--------------|
| **Brands** | ✅ | Logo verification + inline domain edit + per-brand variant override (auto/icon/logo/symbol). Filters by search, logo-status, category. |
| **Categories** | ✅ | CRUD for 35 categories. Inline edit, add, delete (blocked by FK when brands still assigned), up/down reorder, per-category `refresh_frequency_days` editable. |
| **Ingestion** | ✅ | Primary control center for Places ingestion. "Ingest All" button with cost estimate + confirmation modal, single-brand test panel, live progress panel with cancel, recent Places API activity log. |
| **Closure Alerts** | ✅ | Empty-state-ready. Acknowledge action (writes `acknowledged_by` + `acknowledged_at`). Populates once the refresh cron runs. |

## Places ingestion ships

The Ingestion tab runs the full three-phase search (spec §4.2):

1. Statewide GA search — 20 max
2. Per-metro (6 metros) — up to 120 more
3. 4×4 subdivision of any metro that caps — up to 320 per dense metro

Uses the **new Places API** (`google.maps.places.Place.searchByText`), not the legacy `PlacesService.textSearch`. See spec §4.0 for why we migrated.

**Validated 2026-04-23 test run:**
- Starbucks: 293 GA locations, $1.42
- (Full 401-brand ingestion in progress)

**Google Cloud prerequisite** (one-time): Places API (New) must be enabled on the project AND the `VITE_GOOGLE_MAPS_API_KEY` must have it in its API restrictions allowlist. Details in spec §4.1.

## What's missing for the full feature

The admin side is essentially done for Phase 1. Remaining work is on the **map side**:

- **Merchant map layer + drawer UI** (spec §6) — the toolbar button, floating drawer, category tree, favorites
- **Pin rendering** (spec §7, §8) — advanced markers with Brandfetch logos, clustering, halo CSS
- **Click popup** (spec §9) — InfoWindow showing name/address/status
- **Monthly refresh cron** (spec §10) — Supabase Edge Function + `pg_cron` to auto-detect closures
- **Favorites UI** (spec §6.3–6.5) — schema/RLS done; create/share/apply UI not built

---

## Work completed

### Tabbed shell + all four tabs — ✅ shipped
- `src/pages/admin/MerchantAdminPage.tsx` — URL-backed tab state (`?tab=brands|categories|ingest|alerts`)
- Brands, Categories, Ingestion, Closure Alerts tabs all in place
- Implemented in these files under `src/pages/admin/merchants/`: `BrandsTab.tsx`, `CategoriesTab.tsx`, `IngestionTab.tsx`, `ClosureAlertsTab.tsx`, `shared.ts`
- Ran on `feature/merchants-admin-shell` branch, merged to main

### Places ingestion — ✅ shipped (browser-side)
- `src/services/merchantIngestService.ts` — three-phase search using the **new Places API** (`Place.searchByText`), not legacy PlacesService
- Admin Ingestion tab: Ingest All + test-single-brand + live progress + cancel + cost tracking via existing `google_places_api_log`
- No new API keys needed — reuses `VITE_GOOGLE_MAPS_API_KEY`
- **One-time Google Cloud config required:** enable Places API (New) on the OVIS GCP project, add it to the Maps key's API restrictions allowlist. Tests confirmed working 2026-04-23.

### Logo variant selector — ✅ shipped
- Migration `20260425_merchants_logo_variant.sql` — adds `logo_variant` column (default `'auto'`)
- Brands tab: per-row dropdown (Auto/Icon/Logo/Symbol). On change, rebuilds `logo_url` with the new Brandfetch variant path segment.

## Still open (Phase 2)

### Places ingestion — server-side Edge Function

Current ingestion runs browser-side. Fine for admin-triggered runs but doesn't scale to cron-based refresh. Needed for the monthly closure-detection loop.

Requires porting `merchantIngestService.ts` logic to a Supabase Edge Function. Complication: the new `Place.searchByText` API is part of Google Maps JS SDK — which doesn't run in Deno. The Edge Function would need to hit the equivalent REST endpoint directly (`POST https://places.googleapis.com/v1/places:searchText` with `X-Goog-Api-Key` and `X-Goog-FieldMask` headers). Same data model, different transport.

Pattern to follow: [`friday-cfo-email`](../supabase/functions/friday-cfo-email/) and its cron migration at [supabase/migrations/20260302100000_friday_cfo_email_cron.sql](../supabase/migrations/20260302100000_friday_cfo_email_cron.sql).

Functions to create:
- `supabase/functions/merchant-places-ingest/` — REST-based three-phase search, upserts `merchant_location`
- `supabase/functions/merchant-places-refresh/` — verifies existing `place_id`s via Place Details, updates `business_status`, creates `merchant_closure_alert` rows on changes
- `supabase/functions/merchant-logo-refresh/` — re-calls Brandfetch search for brands with `logo_fetched_at > 25 days` (stays inside the 30-day ToS window)

Each function validates caller's `ovis_role = 'admin'` or the `service_role` key.

Two new cron migrations:
- `merchant-category-refresh` — nightly; picks categories whose `last_refreshed_at > refresh_frequency_days`
- `merchant-logo-refresh` — daily; picks brands with stale `logo_fetched_at`

### Brands tab refinements (optional polish)

These weren't critical for Phase 1 and can wait:
- **Bulk CSV import** of brand → domain overrides (spec §7.3)
- **"Review Unclaimed" filter** — requires new `logo_source` column tracking `'claimed' | 'unclaimed' | 'manual' | 'none'`
- **Show `logo_fetched_at` age** as a column — useful once the monthly refresh cron runs

### 6. Logo readability at small pin sizes

**The problem.** Some brand logos render poorly at 32px pin size:
- **Wordmarks** (DUNKIN', SUBWAY, STAPLES) — text gets compressed to illegible squiggles.
- **Detailed marks** (Cracker Barrel's keystone, Buffalo Wild Wings full logo) — lose detail; become visual noise.
- **Thin-stroke logos** — disappear against busy map/satellite backgrounds.

This is cosmetic, not functional — the DB is correct; the CDN URL works; the map renders something. But the "something" may not be recognizable enough to be useful to the broker glancing at a map.

**Three-layer mitigation, each tackled at the right time:**

#### Layer 1 — Zoom-based pin sizing (owned by the map-layer work, spec §8)

Per the parent spec, pins scale with zoom level:
- zoom 13 → 24px
- zoom 15 → 32px
- zoom 17+ → 40px

So at the zoom levels brokers care about (close-in inspection of a site), logos are large enough to read. This solves ~70% of the readability complaints automatically — you just don't try to read a DUNKIN' wordmark when you're looking at all of Georgia.

**Status:** still pending. Part of spec §8 (pin rendering), which is the next big chunk of map-side work.

#### Layer 2 — Brandfetch asset-variant selection (owned by the admin tool — add in Brands tab)

Brandfetch's CDN URL supports requesting specific asset types:
```
https://cdn.brandfetch.io/{domain}/icon/?c={client_id}    ← icon/mark only (square, small-optimized)
https://cdn.brandfetch.io/{domain}/logo/?c={client_id}    ← full logo with text
```

Most major brands have **both** variants in Brandfetch. Some are way better as icons at pin size:
- ✅ **Icon wins:** Starbucks (mermaid), McDonald's (arches), Target (bullseye), Wendy's (face), Walmart (spark)
- ✅ **Logo wins:** DUNKIN' (the D alone is unrecognizable), Arby's (hat + wordmark together)
- 🤷 **Auto is fine:** everything else

**Status: ✅ shipped 2026-04-23**
1. ✅ Schema: `logo_variant TEXT NOT NULL DEFAULT 'auto' CHECK (auto|icon|logo|symbol)` added via migration `20260425_merchants_logo_variant.sql`.
2. ✅ Admin Brands tab: per-row dropdown (Auto/Icon/Logo/Symbol) next to Edit Domain.
3. ✅ On change, rebuilds `logo_url` with variant path segment and shows updated preview.
4. CDN URL format: `https://cdn.brandfetch.io/{domain}/{variant}/w/128/h/128?c={client_id}` for explicit variants, plain URL for `auto`.

#### Layer 3 — Custom-hosted logos (escape hatch, rarely needed)

For the handful (~5–10) of brands where *neither* Brandfetch variant is readable — perhaps very niche regional brands or brands with terrible Brandfetch profiles — let the admin upload a custom simplified pin-optimized PNG or SVG to Supabase Storage.

**Trade-off vs Brandfetch ToS:** Brandfetch's ToS forbids caching *Brandfetch-provided* logos locally. But hosting a **custom logo we uploaded ourselves** isn't covered by that restriction — we own the asset.

**Implementation:** Add an optional `custom_logo_url` column. When set, it overrides `logo_url` in pin rendering. Admin page gets an Upload button per brand. Defer until we actually hit the need in practice.

---

**Summary of where each layer stands:**
- **Layer 1 (zoom-based sizing)** — pending, part of spec §8 map-pin rendering work
- **Layer 2 (variant selector)** — ✅ shipped
- **Layer 3 (custom-hosted logos)** — still deferred; revisit if a specific brand can't be fixed via Layer 2

### 7. Permissions polish

Current gating is a blunt `userRole === 'admin'`. Consider:

- Breaking out a `can_admin_merchants` permission so broker-full users could review/edit brands without getting full admin access. Not critical; defer unless a non-admin needs to edit logos.
- For the "Refresh" and "Delete" operations specifically, consider a confirmation modal — easy to click by accident. Look at `ConfirmDialog` in `src/components/` for the pattern.

---

## Estimated effort (for the remaining Phase 2 work)

| Item | Effort | Status |
|------|--------|--------|
| Tabbed shell refactor | — | ✅ done |
| Categories tab CRUD | — | ✅ done |
| Ingestion tab + Ingest All | — | ✅ done |
| Closure Alerts tab | — | ✅ done |
| Logo variant selector | — | ✅ done |
| Places ingestion Edge Function + cron | 1 full day | ⏳ pending |
| Logo refresh Edge Function + cron | 2–4 hours | ⏳ pending |
| Brands tab polish (CSV import, unclaimed filter, age column) | 1–3 hours | ⏳ optional |
| Permissions polish | 30 min | ⏳ optional |

**Next big block:** map-side work (the pin rendering), not more admin. The admin is done enough to run the feature end-to-end once the map layer lands.

---

## Reference files from today's work

- [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — the parent spec
- [`MerchantAdminPage.tsx`](../src/pages/admin/MerchantAdminPage.tsx) — the tabbed shell
- [`merchants/`](../src/pages/admin/merchants/) — the four tab components + shared helpers
- [`merchantIngestService.ts`](../src/services/merchantIngestService.ts) — three-phase Places ingestion (new API)
- [`googlePlacesSearchService.ts`](../src/services/googlePlacesSearchService.ts) — legacy Places wrapper, still used by ClosedBusinessSearchPanel
- [`AdminRoute.tsx`](../src/components/AdminRoute.tsx) — admin guard
- Migrations: `20260422` (tables + RLS), `20260423` (seed), `20260424` (logo corrections), `20260425` (logo_variant)
- [`friday-cfo-email`](../supabase/functions/friday-cfo-email/) + its [cron migration](../supabase/migrations/20260302100000_friday_cfo_email_cron.sql) — pattern for the Phase 2 Edge Functions
