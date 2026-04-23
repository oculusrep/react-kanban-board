# Merchants Map Layer — Implementation Spec

**Status:** Planning — ready for review before implementation
**Last Updated:** 2026-04-22
**Owner:** mike@oculusrep.com
**Scope:** A new map layer that shows branded retail/restaurant/service locations across Georgia, sourced from Google Places via a curated brand master list, with per-brand logos rendered as pins. Includes a floating drawer UI for category/brand selection, user-owned shareable "Favorites" sets, and a separate admin page for master-list management. First phase of a larger Map Layer System overhaul.

---

## 1. Goals & Non-Goals

### Goals
1. Display brand-recognizable merchant pins (actual logos, not generic icons) on the OVIS map, clustered at low zoom.
2. Let users filter visible merchants by admin-curated categories ("Grocery Stores," "Restaurant Coffee Donuts") or by individual brand.
3. Let users save and reuse custom merchant sets ("Starbucks Competition," "BWW Committee Package") as private-by-default, optionally shareable Favorites.
4. Keep runtime API cost near zero by caching all Google Places data in Supabase; re-query Places only on scheduled refreshes.
5. Surface closure changes (detected via `business_status` flip) through in-app alerts so brokers know when a location goes offline.

### Non-Goals (v1)
- **Coming Soon / pre-opening locations.** Google Places only knows about existing businesses. Deferred to **Phase 2** — will require an OVIS-level override layer (manual flag or site_submit integration).
- **Nationwide coverage.** Georgia only for v1. Multi-state is a later decision, primarily an API-cost conversation.
- **Real-time freshness.** Monthly refresh cadence is acceptable for CRE workflows; not chasing sub-day freshness.
- **Automatic new-brand discovery.** Master list is admin-curated. "Discover brands we don't have" tooling is a later nice-to-have (see §13).
- **User-created categories.** Categories are admin-managed and fixed; end users create Favorites, not categories.

---

## 2. Architecture Overview

**Hybrid model:** curated brand list + Supabase location cache + lazy Google Places ingestion, admin-triggered.

```
┌─────────────────────┐
│   merchant_brand    │  ← Admin-curated master list (~420 rows at seed)
│ name, category,     │     Seeded once from user's provided list.
│ brandfetch_domain   │     New brands added via admin page.
└──────────┬──────────┘
           │
           │ (admin triggers ingestion per brand or per category)
           ▼
┌─────────────────────┐       ┌──────────────────────┐
│  Google Places API  │─────▶ │  merchant_location   │
│  (Text Search,      │       │  (Supabase cache)    │
│   Place Details)    │       │  place_id, lat/lng,  │
│                     │       │  business_status,    │
│                     │       │  last_verified_at,   │
│                     │       │  last_fetched_at     │
└─────────────────────┘       └──────────┬───────────┘
                                         │
                    ┌────────────────────┴──────────────┐
                    │                                   │
                    ▼                                   ▼
           ┌─────────────────┐              ┌───────────────────┐
           │  Map render     │              │  Monthly refresh  │
           │  (statewide,    │              │  cron (closure    │
           │  clustered)     │              │  + new-location   │
           │                 │              │  detection)       │
           └─────────────────┘              └───────────────────┘
```

**Key architectural decisions** (all confirmed in interview):
- **Data source:** Hybrid — curated brand list + Places cache with TTL-based refresh.
- **Scope:** Georgia-only for v1.
- **Categories:** Fixed admin-managed taxonomy, one category per brand (multi-category support deferred).
- **Favorites:** Private by default, shareable like Google Docs.
- **Display scope:** Statewide with clustering (Option A); runtime API cost = $0.
- **Pin style:** Logo-forward with CSS white halo, constrained by height for mixed aspect ratios.
- **Click behavior:** Simple InfoWindow popup; no sidebar in v1.
- **Admin surface:** Separate admin page in the hamburger menu, gated by `user.ovis_role = 'admin'`.
- **Ingestion:** Admin pre-seeds each category before it's exposed to users (Option C).

---

## 3. Data Model

### 3.1 New tables

```sql
-- The curated master list of brands the system knows about.
CREATE TABLE merchant_brand (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,                 -- "Starbucks"
  normalized_name     TEXT NOT NULL UNIQUE,          -- "starbucks" (lowercased, trimmed) for dedup
  category_id         UUID NOT NULL REFERENCES merchant_category(id),
  -- Brandfetch resolution (see §5)
  brandfetch_domain   TEXT,                          -- "starbucks.com" — required for logo rendering; overrides auto-match
  logo_url            TEXT,                          -- Brandfetch CDN URL (hotlinked at render time, not a local file)
  logo_variant        TEXT NOT NULL DEFAULT 'auto'
                        CHECK (logo_variant IN ('auto','icon','logo','symbol')),
                                                     -- Admin override of Brandfetch asset variant
                                                     -- (added migration 20260425 — see §6 of ADMIN_ROADMAP)
  logo_fetched_at     TIMESTAMPTZ,                   -- Last successful Brandfetch API call; refreshed monthly to maintain license
  -- Places search tuning
  places_search_query TEXT,                          -- Override for text search (default = name)
  places_type_filter  TEXT,                          -- Optional: 'cafe', 'grocery_or_supermarket', etc.
  -- Operational
  is_active           BOOLEAN NOT NULL DEFAULT true, -- Soft-disable without deleting
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin-curated category taxonomy.
CREATE TABLE merchant_category (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL UNIQUE,         -- "Grocery Stores"
  display_order           INTEGER NOT NULL DEFAULT 100, -- For UI sort
  refresh_frequency_days  INTEGER NOT NULL DEFAULT 30,  -- Per-category refresh cadence (§10)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The Google Places cache. One row per physical location we know about.
CREATE TABLE merchant_location (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL REFERENCES merchant_brand(id) ON DELETE CASCADE,
  google_place_id     TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,                    -- From Places (may differ slightly from brand.name)
  latitude            NUMERIC(10, 7) NOT NULL,
  longitude           NUMERIC(10, 7) NOT NULL,
  formatted_address   TEXT,
  phone               TEXT,
  website             TEXT,
  business_status     TEXT NOT NULL DEFAULT 'OPERATIONAL', -- OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  -- Two distinct timestamps (see §10)
  last_fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(), -- When we last talked to Places
  last_verified_at    TIMESTAMPTZ NOT NULL DEFAULT now(), -- When Places last confirmed OPERATIONAL
  -- Change tracking for alerts
  previous_status     TEXT,                             -- Populated on status transition
  status_changed_at   TIMESTAMPTZ,                      -- When business_status last flipped
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_location_brand ON merchant_location(brand_id);
CREATE INDEX idx_merchant_location_status ON merchant_location(business_status) WHERE business_status != 'OPERATIONAL';
-- Composite B-tree for viewport-bounded queries; matches repo convention (no PostGIS in this codebase).
CREATE INDEX idx_merchant_location_geo ON merchant_location(latitude, longitude);

-- User-owned Favorites (merchant sets).
CREATE TABLE merchant_favorite (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                       -- "Starbucks Competition"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The brands in each Favorite.
CREATE TABLE merchant_favorite_brand (
  favorite_id  UUID NOT NULL REFERENCES merchant_favorite(id) ON DELETE CASCADE,
  brand_id     UUID NOT NULL REFERENCES merchant_brand(id) ON DELETE CASCADE,
  PRIMARY KEY (favorite_id, brand_id)
);

-- Google-Docs-style sharing. Absence of row = no access. Owner is implied.
CREATE TABLE merchant_favorite_share (
  favorite_id  UUID NOT NULL REFERENCES merchant_favorite(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL CHECK (permission IN ('view','edit')) DEFAULT 'view',
  shared_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (favorite_id, user_id)
);

-- In-app closure alerts.
CREATE TABLE merchant_closure_alert (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      UUID NOT NULL REFERENCES merchant_location(id) ON DELETE CASCADE,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  new_status       TEXT NOT NULL,                      -- CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  acknowledged_by  UUID REFERENCES "user"(id),
  acknowledged_at  TIMESTAMPTZ
);
```

### 3.2 Existing tables touched

- **`user` table** — no schema changes needed. Admin gating uses the existing `"user".ovis_role` column (values `'admin' | 'broker_full' | 'broker_limited' | 'assistant'`). All admin-page access checks use `ovis_role = 'admin'`. FK references use `"user"(id)` (the custom OVIS user table, joined to `auth.uid()` via `auth_user_id`).

---

## 4. Google Places Integration

### 4.0 API choice — Places API (New), not legacy PlacesService

Implementation uses **`google.maps.places.Place.searchByText`** (the 2025 Places API), NOT `google.maps.places.PlacesService.textSearch` (legacy).

**Why we migrated during v1 build:**

The legacy PlacesService API is deprecated for new customers as of March 2025 and Google has publicly stated:

> "Existing bugs in PlacesService will not be addressed."

We hit two of those bugs during build:

1. **Pagination discards pages 2-3.** PlacesService's `textSearch(callback)` fires its callback once per page (up to 3 pages × 20 = 60 results). The Promise wrapping pattern only resolves on page 1; pagination's subsequent callback invocations land on an already-resolved Promise and are discarded. Effective cap: 20 results, not the advertised 60.
2. **Fresh PlacesService instances return `INVALID_REQUEST`.** Creating a new `PlacesService(div)` inside the same app where an existing instance works returns INVALID_REQUEST on every textSearch call. No workaround reliably defeats it.

`Place.searchByText` is Promise-based, has strict `locationRestriction` (vs legacy's loose `locationBias`), and requires no DOM-attached attribution div. Trade-off: it caps at **20 results per call** (vs legacy's advertised 60). We compensate with more aggressive geographic partitioning (§4.2).

The existing `ClosedBusinessSearchPanel` feature still uses legacy PlacesService and continues to work; migration of that code to the new API is a separate future project.

### 4.1 Google Cloud setup (one-time per project)

Before the first ingestion can run, the OVIS Google Cloud project needs:

1. **Places API (New) enabled** — enable at `https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=<PROJECT_NUMBER>`. This is a SEPARATE product from the legacy "Places API" (also kept enabled for `ClosedBusinessSearchPanel`).
2. **API key allowlist updated** — the Maps API key used by the browser (`VITE_GOOGLE_MAPS_API_KEY`) must have **Places API (New)** in its "API restrictions" list (if the key is in restricted mode). Unrestricted keys don't need this change.
3. **Billing enabled** — the same Google Cloud project's billing account covers Places API (New). Pricing parity with legacy: ~$17/1000 Text Search requests. The monthly $200 Maps Platform credit applies.

### 4.2 Three-phase ingestion flow

**Input:** a `merchant_brand` row (or iterate a list).

**Phase 1 — statewide search**
Call `Place.searchByText({textQuery: "{brand} in Georgia", locationRestriction: <GA bbox>, maxResultCount: 20, ...})`. Returns up to 20 GA-only locations.

**Phase 2 — per-metro search (only if Phase 1 hit 20)**
For each of 6 GA metro bboxes (Atlanta, Savannah, Augusta, Columbus, Macon, Athens), repeat the search with `locationRestriction` set to that metro. Up to 20 per metro = 120 additional possible. Results unioned by `place_id`.

**Phase 3 — 4×4 metro subdivision (only if a metro in Phase 2 hit 20)**
For any metro that also capped at 20, split its bbox into a 4×4 = 16 sub-cells and search each. Up to 20 per cell = 320 additional per dense metro. Unioned into the same result map.

**Metro bounding boxes (hardcoded in [src/services/merchantIngestService.ts](../src/services/merchantIngestService.ts))** — loosely cover the metro + inner suburbs. Chosen conservatively wide so Phase 3 subdivision catches outer-ring stores too.

**Fields requested on each call:**
`id, displayName, formattedAddress, location, businessStatus, nationalPhoneNumber, websiteURI, types`

Skip: ratings, reviews, photos, opening hours — not needed for v1 pin display.

**Upsert per result:**
- Find by `google_place_id`.
- If exists: update all fields, bump `last_fetched_at`, bump `last_verified_at` if OPERATIONAL. On status change, populate `previous_status` + `status_changed_at` AND insert a `merchant_closure_alert` row.
- If new: insert.

**Log each Place.searchByText call** as one row in `google_places_api_log` at 2¢ per request, consistent with the existing cost-tracking infra used by ClosedBusinessSearchPanel.

**Cost model (Georgia, full 401-brand run):**

| Brand class | Count | Cost per brand | Subtotal |
|---|---:|---:|---:|
| Simple (Phase 1 only) | ~350 | $0.02 | ~$7 |
| Medium density (Phase 2) | ~30 | $0.14 | ~$4 |
| Dense (Phase 3 on one metro) | ~15 | ~$0.50 | ~$8 |
| Super-dense (Phase 3 on multiple metros, e.g. Starbucks) | ~5 | ~$1.40 | ~$7 |
| **Total** | **401** | avg ~$0.07 | **~$26** |

Validated 2026-04-23: Starbucks test returned 293 GA locations at $1.42.

### 4.3 Current vs planned architecture

**Today (Phase 1 of feature):** ingestion runs **browser-side** via the admin Ingestion tab. Admin clicks "Ingest all 401 brands" → browser tab executes all API calls → upserts via Supabase client. Progress tracked in a React state panel with cancel support.

**Deferred to Phase 2:** a Supabase Edge Function (`merchant-places-ingest`) that does the same work server-side, so it can be invoked by `pg_cron` for monthly refresh without a browser session. Same three-phase logic, same `google_places_api_log` cost tracking. The client-side flow stays for admin-triggered runs.

### 4.4 Monthly refresh (still pending — Edge Function work)

**Frequency:** per-category `refresh_frequency_days` (default 30). Admin-configurable in the Categories admin tab.

**Two parallel tasks per brand:**

**Task 1 — Verify existing locations (closure detection):**
For each `merchant_location` under the brand, call `Place` fetchFields API with just `businessStatus`.
- Update `last_fetched_at = now()`.
- If `OPERATIONAL`, also update `last_verified_at = now()`.
- If status changed, populate `previous_status`, `status_changed_at`, and insert `merchant_closure_alert`.

**Task 2 — Detect new locations:**
Re-run the same three-phase search as §4.2. Any `place_id` not already in `merchant_location` is newly-opened (or newly-listed) — insert it.

Runs as a Supabase Edge Function triggered by `pg_cron` (see §10). Not yet built.

---

## 5. Logo Resolution (Brandfetch)

Brandfetch's [Logo API](https://docs.brandfetch.com/logo-api/guidelines) is free for commercial use but has **two ToS constraints that shape the architecture**:

1. **Hotlinking required** — "you cannot download and store logos locally." Logos must be served from Brandfetch's CDN at render time.
2. **30-day license renewal** — a brand's license expires if no API call is made within 30 days; cached references must then be deleted. Implication: metadata refresh must run at least monthly.

These constraints **replace** the local-cache approach of earlier drafts. The revised flow:

### 5.1 Resolution flow (runs during brand creation and on admin manual refresh)

1. Admin creates/imports brand `{name: "Starbucks", brandfetch_domain: null}`.
2. System resolves a domain for the brand:
   - If `brandfetch_domain` is set, use it.
   - Otherwise, call Brandfetch's domain-search endpoint with `name`. Take the top match.
   - No confident match → leave `brandfetch_domain = NULL`. Fallback pin (§5.3) will be used at render time.
3. System builds the Brandfetch CDN URL from the resolved domain and stores it in `merchant_brand.logo_url`. URL patterns:
   ```
   # Auto (default): Brandfetch picks the best asset for this brand
   https://cdn.brandfetch.io/{brandfetch_domain}/w/128/h/128?c={BRANDFETCH_CLIENT_ID}

   # Explicit variant override (admin-selected in Brands tab)
   https://cdn.brandfetch.io/{brandfetch_domain}/{variant}/w/128/h/128?c={BRANDFETCH_CLIENT_ID}
   # where variant is 'icon', 'logo', or 'symbol'
   ```
   (Width/height sized generously — actual render size is controlled by CSS, §8.)
4. Persist `logo_url`, `brandfetch_domain`, `logo_variant`, `logo_fetched_at`. We do **not** download the image; `logo_url` is a Brandfetch CDN URL that browsers fetch directly at render time.
5. Track resolution in a dedicated audit table if useful for debugging (not v1-critical).

**No Supabase Storage**. The `merchant-logos/` bucket from earlier drafts is removed from this spec.

**`logo_variant` column**: added in migration `20260425` for the admin variant-selector feature. Addresses brands whose auto-selected logo is unreadable at pin size (wordmarks like DUNKIN', SUBWAY). See MERCHANTS_ADMIN_ROADMAP.md §6 for the three-layer readability mitigation strategy.

### 5.2 Monthly metadata refresh (MANDATORY per Brandfetch ToS)

- Background job runs monthly (see §10) and re-calls the Brandfetch API for every brand that has a `brandfetch_domain`. This renews the license without us needing to re-fetch assets.
- If the resolved domain changes (rare — brand rebrand), `logo_url` updates automatically from the new domain.
- `logo_fetched_at` bumped on every successful refresh.
- Admin can also click "Refresh logo" on any brand to re-run resolution immediately.
- If Brandfetch returns 404 or low confidence on re-fetch, keep existing `logo_url` but flag the brand in admin UI for manual domain entry.

### 5.3 Fallback pin

When `logo_url IS NULL`:
- Render a Deep Midnight Blue (`#002147`) filled circle with the brand's first letter in white.
- Same halo treatment as logo pins for visual consistency.

---

## 6. User-Facing UI — Merchants Drawer

### 6.1 Entry point

A new **"Merchants" button** in the map toolbar (alongside existing tool buttons — Layers, Drawing, Distance, etc.).

- Icon: store/shopping bag (Lucide `Store` or `ShoppingBag`).
- Label: "Merchants" on hover tooltip.
- Active state (when drawer is open): filled Deep Midnight Blue background.

### 6.2 Drawer behavior

- **Style:** Floating drawer, slides in from the right edge of the map.
- **Width:** 360px.
- **Height:** Full map height minus toolbar.
- **Modality:** Non-modal — user can click through to the map without closing the drawer. Drawer stays open until user explicitly closes it (X button or clicks the Merchants button again).
- **Scroll:** Internal scrolling; fixed header (search) and fixed section dividers.

### 6.3 Drawer contents

```
┌─ Merchants ──────────────────────[×]┐
│ 🔍 [search brands or categories...] │
├─────────────────────────────────────┤
│ ⭐ FAVORITES          [+ New]       │
│   ☐ Starbucks Competition     (me) │
│   ☐ BWW Committee Package (Alex) ⓘ │
│   ☐ Grocery Stores            (me) │
├─────────────────────────────────────┤
│ BY CATEGORY                         │
│   ▸ ☐ Auto Parts Tires       (18)  │
│   ▸ ☐ Banks                  (17)  │
│   ▾ ◪ Grocery Stores         (15)  │
│       ☑ ALDI                       │
│       ☑ Food Lion                  │
│       ☐ H Mart                     │
│       ...                          │
│   ▸ ☐ Restaurant Casual      (82)  │
│   ...                              │
└────────────────────────────────────┘
```

### 6.4 Interaction rules

- **Category checkbox** is tri-state: `☐` none selected, `◪` some selected, `☑` all selected. Clicking toggles all brands in the category on or off.
- **Categories collapsed by default.** Clicking the caret (`▸`) expands; clicking the category name toggles the checkbox.
- **Search** filters both categories and brands live. Matching brands expand their parent category automatically. Case- and whitespace-insensitive.
- **Favorite checkbox** enables all brands in that favorite in one action. If a favorite's brands are partially active from other selections, the favorite shows `◪`.
- **Favorite ownership indicator:** `(me)` for user-owned, `(name)` for shared favorites. Hover shows a tooltip with who shared and when.
- **`[+ New]`** opens a "Create Favorite" modal: name input + multi-select of brands (reuses the same category tree).
- **Context menu on a favorite row** (three-dot): Rename, Share, Duplicate, Delete. Shared favorites show Share only if current user has `edit` permission.
- **Selection persistence:** saved per-user to `user_preferences` (or equivalent) on each change. Yesterday's selections restore on next login.

### 6.5 Favorites sharing UI

- **Share modal:** Select recipients from a **dropdown list of existing Oculus users** (fetched from the `user` table). **No free-text email input** — sharing is restricted to existing OVIS accounts. If an admin later adds the user, a favorite can be re-shared to them then.
- Pick permission per recipient: `view` or `edit`.
- Shared users see the favorite in their Favorites list with the owner's name suffix (e.g., `BWW Committee Package (Alex)`).
- **Permission semantics:** `view` = see + apply the favorite. `edit` = rename, modify brand list, reshare. Only the owner can delete.

---

## 7. Admin Page

### 7.1 Location

New route `/admin/merchants`, linked from the main hamburger menu. Visible only to users with `ovis_role = 'admin'`.

### 7.2 Tabs

**Tab 1 — Brands**
- Table: name, category, logo preview, location count (from `merchant_location`), last ingested, status (active/inactive).
- Row actions: Edit, Refresh Places (ingest this brand), Refresh Logo, Deactivate.
- Header actions: `+ Add Brand`, `Bulk Import (CSV)`, `Export`.
- Add/Edit modal: name, category dropdown, `brandfetch_domain` (optional override), `places_search_query` (optional override), `places_type_filter` (optional, dropdown of Places types).

**Tab 2 — Categories**
- Table: name, brand count, refresh frequency (days), display order.
- Row actions: Edit, Refresh All Places (re-ingest every brand in the category), Reorder (drag handle).
- Header actions: `+ Add Category`.

**Tab 3 — Closure Alerts**
- Table: location name, brand, address, new status, detected at, acknowledged by.
- Row actions: Acknowledge, View on Map (open Merchants layer with this location selected).
- Filters: unacknowledged only (default), last 30/60/90 days, by category.

**Tab 4 — Ingestion Activity** *(nice-to-have for v1; can defer)*
- Log table: timestamp, trigger (manual/cron), brand, requests made, rows added/updated, estimated cost.

### 7.3 Bulk import (CSV)

For loading the initial 420-brand seed and future bulk adds:
- Upload a CSV with columns: `category`, `name`.
- System **normalizes** on import:
  - Trim whitespace on both columns.
  - Case-insensitive dedupe within category.
  - Auto-create any category not already present.
  - Flag suspicious rows for admin review before commit (see §12).

---

## 8. Pin Rendering

### 8.1 Individual merchant pin

**At zoom ≥ 13 (see §8.3):**

Rendered as an `AdvancedMarkerElement` with an HTML `<img>` element.

```html
<div class="merchant-pin" data-brand-id="...">
  <img src="{logo_url}" alt="{brand.name}" />
</div>
```

```css
.merchant-pin img {
  height: 32px;        /* fixed height; width auto for mixed aspect ratios */
  width: auto;
  max-width: 80px;     /* cap to prevent extreme wordmarks from dominating */
  filter: drop-shadow(0 0 3px white)
          drop-shadow(0 0 3px white)
          drop-shadow(0 0 2px rgba(0,0,0,0.3));
  transition: transform 0.15s ease;
}
.merchant-pin:hover img {
  transform: scale(1.15);
}
```

**`<img>` attributes** (both correctness and performance):
- `loading="lazy"` — browser defers fetching pins outside the current viewport.
- Explicit `width` and `height` — prevents layout shift during logo load.
- `decoding="async"` — doesn't block the main thread during image decode.
- `referrerpolicy="no-referrer-when-downgrade"` — default, works with Brandfetch CDN.
- `onerror` handler swaps the `<img>` for the fallback letter pin if load fails.

**Preconnect hint** (critical for first-paint performance, since Brandfetch CDN is cross-origin):

Add to the mapping page's head (or wherever the map loads — likely [MappingPageNew.tsx](../src/pages/MappingPageNew.tsx) or the portal map page):
```html
<link rel="preconnect" href="https://cdn.brandfetch.io" crossorigin>
<link rel="dns-prefetch" href="https://cdn.brandfetch.io">
```

This warms the DNS + TLS handshake at page load (before any pin ever renders), erasing the ~30–50ms first-paint penalty introduced by using a cross-origin CDN instead of local caching.

**Height scales with zoom:**
- zoom 13: 24px
- zoom 15: 32px
- zoom 17+: 40px

**Collision behavior:** `collisionBehavior: 'OPTIONAL_AND_HIDES_LOWER_PRIORITY'`. **v1 uses first-rendered wins** — simplest implementation, keeps the feature shippable. Smarter priority (e.g., favoring pins near active deals or site submits) is a deliberate v2 refinement so we can tune it against real usage rather than guessing.

### 8.2 Closed-location treatment

- `business_status = CLOSED_PERMANENTLY`: pin shown only if admin toggles "show closed locations" filter; otherwise hidden. Grayscaled logo with red strikethrough overlay when shown.
- `business_status = CLOSED_TEMPORARILY`: pin shown by default but desaturated (60% saturation) with a small yellow dot badge in the corner.

### 8.3 Clustering & zoom thresholds

- `@googlemaps/markerclusterer` (same library used by `RestaurantLayer`).
- **Below zoom 13:** cluster bubbles only. Deep Midnight Blue circle, white count text. No individual logos.
- **At zoom ≥ 13:** clusters break; individual merchant pins render.
- **Mixed-category clusters** (v1): plain numbered bubble. *(v2: small colored dots around the perimeter representing category mix.)*
- Cluster size thresholds: `minimumClusterSize: 3`, `gridSize: 60`, `maxZoom: 12` (so clusters disappear at zoom 13).

---

## 9. Click Behavior (Popup)

Simple Google Maps InfoWindow on pin click. No sidebar in v1.

**Popup contents:**
```
┌─────────────────────────────────┐
│ [logo] Starbucks                │
│ 1234 Peachtree St NE            │
│ Atlanta, GA 30309               │
│                                 │
│ 🟢 Operational                  │
│ Last verified: Apr 15, 2026     │
│                                 │
│ (404) 555-0100                  │
│ starbucks.com                   │
│                                 │
│ [ Get Directions ↗ ]            │
└─────────────────────────────────┘
```

**Status rendering:**
- `OPERATIONAL` → 🟢 green dot + "Operational"
- `CLOSED_TEMPORARILY` → 🟡 yellow dot + "Temporarily Closed"
- `CLOSED_PERMANENTLY` → 🔴 red dot + "Permanently Closed"

**"Get Directions"** opens `https://www.google.com/maps/dir/?api=1&destination={place_id}` in a new tab.

---

## 10. Background Jobs

### 10.1 Jobs

1. **Category refresh job** — runs nightly (e.g., 2am ET). For each category where `NOW() - last_refreshed_at > refresh_frequency_days`, run the ingestion + verification flow (§4.2). Configured per-category; default 30 days.
2. **Logo refresh job** — runs weekly. Walks brands where `logo_fetched_at` is older than 90 days and retries Brandfetch.
3. **Closure alert digest (optional)** — daily email to admins if any unacknowledged `merchant_closure_alert` rows exist. Summary count + link to the Alerts tab. Opt-in per admin.

### 10.2 Infrastructure

Deploy as **Supabase Edge Functions triggered by `pg_cron` + `pg_net`**, matching the existing convention in the codebase (see [supabase/migrations/20260302100000_friday_cfo_email_cron.sql](../supabase/migrations/20260302100000_friday_cfo_email_cron.sql) for the reference pattern).

Each scheduled job:
1. Lives in a migration file: `CREATE EXTENSION IF NOT EXISTS pg_net;` + `SELECT cron.schedule(name, cron_expr, body)`.
2. Body uses `net.http_post(...)` to call an Edge Function with a `Bearer` token pulled from `vault.decrypted_secrets`.
3. Edge Function (Deno) performs the actual work (Places API calls, DB updates).
4. Schedule is expressed in **UTC**; the Edge Function itself handles any Eastern-Time semantics (e.g., skipping runs outside business hours if needed), following the DST-safe pattern from the `friday-cfo-email` example.

Jobs to create:
- `merchant-category-refresh` — nightly 07:00 UTC (~2am–3am ET). Function scans categories where `last_refreshed_at` exceeds `refresh_frequency_days`, runs ingestion + closure verification.
- `merchant-logo-refresh` — **daily, 08:00 UTC. Scans brands where `logo_fetched_at` is older than 25 days** (5-day safety margin on Brandfetch's 30-day license expiry) and re-calls the Brandfetch API. Mandatory per Brandfetch ToS (§5). Daily scheduling + age-based selection is defensive: if one night's run fails, the next night catches up before anything expires.
- `merchant-closure-digest` *(optional, if admin opts in)* — daily 13:00 UTC (~9am ET). Function emails unacknowledged closure alerts.

### 10.3 Timestamps (the two-timestamp rule)

Every `merchant_location` carries both:
- `last_fetched_at` — when we most recently called Places about this location, regardless of outcome.
- `last_verified_at` — when Places most recently confirmed this location is OPERATIONAL.

A location that has `last_fetched_at = yesterday` but `last_verified_at = 3 months ago` is stale only in verification, not in refresh — it's been verified CLOSED for 3 months. Both values are surfaced in admin tool so admins can differentiate "we haven't checked in a while" from "we checked and it's been down."

All timestamps use Eastern Time semantics per project conventions (`America/New_York`).

---

## 11. Closure Alerts

### 11.1 Trigger

Whenever §4 ingestion or §10.1 refresh job detects a `business_status` transition:
- `OPERATIONAL` → `CLOSED_TEMPORARILY` or `CLOSED_PERMANENTLY`: create alert.
- `CLOSED_TEMPORARILY` → `CLOSED_PERMANENTLY`: create alert.
- `CLOSED_PERMANENTLY` or `CLOSED_TEMPORARILY` → `OPERATIONAL`: **create alert (re-opening)** — relevant for CRE.

### 11.2 Surfaces

1. **Badge on Merchants toolbar button** — red dot with count of unacknowledged alerts. Clears when alerts are acknowledged in admin page.
2. **Badge on admin hamburger menu entry** — same count.
3. **Email digest (admin opt-in)** — daily roll-up, not per-event. Subject: "OVIS: N merchant status changes detected." Body lists each change with a direct link to the admin Alerts tab.
4. **Map-level visual** — the pin itself already reflects current `business_status` (§8.2), so the closure is visually obvious when the user pans to it.

Per-category escalation (e.g., "alert me immediately when any Grocery Store closes") is a v2 refinement.

---

## 12. Data Cleanup / Import Plan

The user-provided seed list has known quality issues that must be resolved on import. These are flagged for admin review in the bulk-import flow (§7.3) rather than silently coerced.

### 12.1 Auto-handled
- **Trim whitespace** on brand names and category names (many entries end in a trailing space).
- **Normalize punctuation** — curly quotes → straight, collapse double spaces.

### 12.2 Merge/keep decisions (confirmed with user, 2026-04-22)

- **`ALDI` vs `Aldi`** — duplicate, merge. Keep single `ALDI` entry.
- **`Fitness` vs `Fitness `** (trailing space) — same category, merge into single `Fitness`.
- **`Pizza` → `Restaurant Pizza`** — singleton category `Pizza` (only contains `Old Chicago Pizza & Tap House`) is merged into `Restaurant Pizza`. The `Pizza` category is dropped.
- **`Wal-Mart` + `Wal-Mart Supercenter` → `Wal-Mart`** — merge into a single brand. Both store formats are searched as one brand in Places.
- **`Family Dollar` and `Dollar Tree` — kept as separate brands.**
- **`Family Dollar | Dollar Tree` — dropped from initial import.** Combo stores (locations branded with both) are a real phenomenon that Google Places handles inconsistently (some listings are tagged one, some the other, some both). Handling combo stores cleanly requires a Phase-2 feature — most likely a `merchant_location.secondary_brand_id` column letting a single physical location represent two brands. For v1, combo locations will surface under whichever individual brand Google Places assigns them; we accept the small amount of duplication. This is noted in §15 as a Phase 2 item.

### 12.3 Brandfetch pre-flight

Before running the bulk logo fetch (§5), the admin page shows a **preview table**:
- Each brand → resolved Brandfetch domain → logo preview.
- Admin reviews and overrides any wrong matches (e.g., "Target" might auto-match to something wrong in Brandfetch — admin sets `brandfetch_domain = target.com` explicitly).
- Admin approves; bulk fetch runs.

---

## 13. Cost Estimates (GA scope, ~420 brands)

All estimates assume Google Places Basic-data tier ($0.017/request).

| Operation | Frequency | Requests | Cost |
|---|---|---|---|
| Google Places — initial ingestion, all 420 brands | One-time | ~2,100 | **~$36** |
| Google Places — initial ingestion, one category (avg 12 brands) | One-time per category | ~60 | ~$1 |
| Google Places — monthly refresh, all GA locations (est. 15k–25k) | Monthly | 15k–25k | **$0.25–$0.50/mo** |
| Google Places — weekly refresh (if admin sets a category to 7 days) | Weekly | same set | ~$2/mo |
| Brandfetch — domain resolution + monthly license renewal | ~420/month | ~420/month | **$0** (free tier: 500K/mo cap, ~420 uses 0.08%) |
| Brandfetch — CDN image delivery to users' browsers | Per map view | unmetered | **$0** (included in free tier) |
| Supabase Storage (logos) | ❌ not used — hotlinked per Brandfetch ToS | — | — |

**Bottom line:** ~$36 one-time + well under $50/year steady-state at GA scope. Not a budget risk. Brandfetch's free tier covers v1 with 3+ orders of magnitude of headroom.

---

## 14. Phases & Rollout

### Phase 1 (this spec)
- All of §3–12 above.
- Admin page, Merchants drawer, pins, clustering, popups, monthly refresh, closure alerts.
- Seeded with user's 420 brands (post-cleanup).
- Georgia only.

### Phase 2 (follow-on)
- **"Coming Soon" locations** — OVIS-layer override for leased-but-unopened sites. Likely integrates with `site_submit` data.
- **Combo-store handling** — `merchant_location.secondary_brand_id` (or a join table) to let a single physical location represent two brands, e.g., Family Dollar / Dollar Tree combo stores. Admin UI to mark combo locations; pin rendering shows either brand's logo (or a split indicator) based on user selection context.
- **Per-location custom notes** — admin or broker can annotate a specific location ("closed for remodel," "new signage coming").
- **Sidebar detail view** on click (replacing popup for richer analysis — nearby OVIS properties, site submits, etc.).
- **"Discover new brands" tool** — runs Places `type=X` nearby search, surfaces chains not in the master list, lets admin one-click add.
- **Smarter pin collision priority** — favor pins near active deals/site_submits, or brands the current user has recently worked with.

### Phase 3 (later)
- Multi-state expansion (FL, TN, AL, SC first likely).
- Per-category immediate alerts (not just daily digest).
- Mixed-category cluster visualization (colored perimeter dots).
- Brand performance overlays (merge with placer_rank data where available).

---

## 15. Open Questions / Decisions to Confirm Before Implementation

### Resolved in the 2026-04-22 design interview

| # | Question | Resolution |
|---|---|---|
| 1 | Admin gating — new `is_admin` column? | **No new column.** Use existing `user.ovis_role = 'admin'`. |
| 2 | `Wal-Mart` vs `Wal-Mart Supercenter` | **Merge** into a single `Wal-Mart` brand. |
| 3 | `Family Dollar` vs `Dollar Tree` vs `Family Dollar \| Dollar Tree` | **Keep FD and DT separate; drop the combo row from import.** Combo-store support is Phase 2 (see §14). |
| 4 | `Pizza` singleton category | **Merge into `Restaurant Pizza`**; drop the `Pizza` category. |
| 5 | Cron infrastructure | **`pg_cron` + `pg_net`** calling Edge Functions, matching the `friday-cfo-email` reference pattern (see §10.2). |
| 6 | Share-to-non-user behavior | **Error only.** Sharing uses a dropdown of existing Oculus users; no free-text email, no invite flow. |
| 7 | Pin collision priority | **First-rendered wins for v1.** Smarter priority is a v2 refinement. |
| 8 | Brandfetch plan tier + logo architecture | **Free Logo API tier** (500K requests/month cap — we use <1%). **Hotlink from Brandfetch CDN at render time; do not download to Supabase Storage.** Required by their ToS (can't cache locally; 30-day license renewal). Monthly metadata refresh is mandatory, not optional. |

### Still open (non-blocking — resolve during implementation)

1. **Ingestion trigger UX detail** — on the admin page's "Refresh Places" button, should ingestion run synchronously (button in loading state) or async (fire-and-forget, progress in Ingestion Activity tab)? Lean: async for anything touching > 5 brands.
2. **Existing hamburger menu location** — confirm the correct parent component to slot the `/admin/merchants` link into. Match the pattern of existing admin links if any exist.
3. **`BRANDFETCH_CLIENT_ID` provisioning** — need to register for a free Brandfetch developer account and store the `client_id` as a Supabase secret. One-time setup task at implementation.

---

## 16. Implementation Order (Progress tracked)

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | **DB migrations** (§3) — 7 tables + indexes + RLS + helpers | ✅ | Migration `20260422_merchants_map_layer_tables.sql` |
| 2 | **Seed CSV import** (§12) — 35 categories + 401 brands | ✅ | Migration `20260423_merchants_seed_brands.sql`, corrections in `20260424` |
| 3 | **Brandfetch integration** (§5) — domain resolution + CDN URL | ✅ | [scripts/resolveBrandfetchDomains.ts](../scripts/resolveBrandfetchDomains.ts); hotlinked per ToS |
| 3b | **Logo variant selector** (§5) | ✅ | Migration `20260425_merchants_logo_variant.sql`; Brands tab dropdown |
| 4 | **Admin page — Brands tab** | ✅ | Logo verification with inline domain edit + variant override |
| 4 | **Admin page — Categories tab** | ✅ | CRUD, reorder, per-category refresh_frequency_days |
| 4 | **Admin page — Ingestion tab** | ✅ | "Ingest All" + per-brand Test + live progress + Places API activity log |
| 4 | **Admin page — Closure Alerts tab** | ✅ | Empty-state-ready; acknowledge action |
| 5 | **Places ingestion — browser-side** (§4.2) | ✅ | Three-phase search using new Places API (Place.searchByText) |
| 5 | **Places ingestion — Edge Function for cron** (§4.3) | ⏳ | Deferred to Phase 2. Needed for monthly refresh. |
| 6 | **Map drawer UI** (§6) — floating drawer, categories, favorites | ⏳ | Not started |
| 7 | **Merchant pin rendering** (§8) — logos with halo, clustering | ⏳ | Not started |
| 8 | **Popup** (§9) — InfoWindow on click | ⏳ | Not started |
| 9 | **Favorites** (§6.3–6.5) — create/share/apply | ⏳ | Schema + RLS done; UI not started |
| 10 | **Background jobs** (§10) — monthly refresh cron, logo daily cron | ⏳ | Not started |
| 11 | **Closure alerts wiring** (§11) — populated by the refresh cron | ⏳ | Tab UI done; waiting on cron to populate rows |
| 12 | **Admin page Ingestion Activity tab** (§7.2) | 🤷 | Consolidated into the Ingestion tab's "Recent Places API activity" panel |

**Currently missing to make the feature user-visible on the map:** steps 6, 7, 8. Once those land, brokers see merchant pins.

**Currently missing for ongoing health:** step 10 (cron) so closures auto-detect without admin clicking "ingest" every month.

---

## 17. References

- [CLAUDE.md](../CLAUDE.md) — project conventions (Eastern Time, brand color palette, Supabase pagination, external API docs).
- [GOOGLE_MAPS_ADVANCED_MARKER_FIX.md](GOOGLE_MAPS_ADVANCED_MARKER_FIX.md) — known pitfalls with `AdvancedMarkerElement`; relevant for §8.
- [advancedMarkers.ts](../src/components/mapping/utils/advancedMarkers.ts) — existing marker utility; new merchant markers should either reuse or extend the same `importLibrary('marker')` pattern to avoid race conditions.
- [RestaurantLayer.tsx](../src/components/mapping/layers/RestaurantLayer.tsx) — closest analog for the new layer; look here for clustering config and marker lifecycle patterns.
- [LayerPanel.tsx](../src/components/mapping/LayerPanel.tsx) / [LayerManager](../src/components/mapping/layers/LayerManager.tsx) — existing layer-state system the Merchants layer will register with.
- Google Places API (New) — Text Search: https://developers.google.com/maps/documentation/javascript/place-search-by-text
- Google Places API (New) — Place class: https://developers.google.com/maps/documentation/javascript/places-overview
- Google Places API (legacy, being phased out) — Text Search: https://developers.google.com/maps/documentation/places/web-service/search-text
- Google Maps Places migration guide (legacy → new): https://developers.google.com/maps/documentation/javascript/places-migration-overview
- Brandfetch API docs: https://docs.brandfetch.com/
- [merchantIngestService.ts](../src/services/merchantIngestService.ts) — our three-phase ingestion implementation
- [googlePlacesSearchService.ts](../src/services/googlePlacesSearchService.ts) — legacy PlacesService wrapper still used by ClosedBusinessSearchPanel
