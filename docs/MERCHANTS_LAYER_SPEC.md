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
- **Admin surface:** Separate admin page in the hamburger menu, gated by `user.user_role = 'admin'`.
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
  -- Brandfetch resolution
  brandfetch_domain   TEXT,                          -- "starbucks.com" — overrides auto-match when set
  logo_url            TEXT,                          -- Resolved logo URL (cached; see §5)
  logo_variant        TEXT CHECK (logo_variant IN ('symbol','logo','icon')),
  logo_fetched_at     TIMESTAMPTZ,
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
CREATE INDEX idx_merchant_location_geo ON merchant_location USING GIST (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

-- User-owned Favorites (merchant sets).
CREATE TABLE merchant_favorite (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  acknowledged_by  UUID REFERENCES auth.users(id),
  acknowledged_at  TIMESTAMPTZ
);
```

### 3.2 Existing tables touched

- **`user` table** — no schema changes needed. Admin gating uses the existing `user.user_role` enum (`'admin' | 'broker_full' | 'broker_limited' | 'assistant'`). All admin-page access checks use `user_role = 'admin'`.

---

## 4. Google Places Integration

### 4.1 Ingestion job (admin-triggered, per brand or per category)

**Input:** a `merchant_brand.id` (or loop over brands in a category).

**Steps:**
1. Build a Text Search query. Default: `{brand.name} in Georgia`. Override with `places_search_query` if set.
2. Call Google Places Text Search API. Filter by `places_type_filter` if set (e.g., `cafe` for Starbucks to suppress "Starbucks catering" noise).
3. Paginate via `next_page_token` (up to 60 results per search; one token is free but requires a short delay before use).
4. **If 60+ results:** fall back to **metro-area partitioning** — re-run the search scoped to each of GA's major metros (Atlanta, Augusta, Savannah, Columbus, Macon, Athens) using `location` + `radius` params, dedupe by `place_id`.
5. For each result:
   - Upsert into `merchant_location` on `google_place_id` conflict.
   - Set `last_fetched_at = now()`.
   - If `business_status = OPERATIONAL`, set `last_verified_at = now()` as well.
   - If `business_status` changed from a prior non-null value, populate `previous_status` + `status_changed_at`, and insert a `merchant_closure_alert` row.
6. Log ingestion run (brand, requests made, rows inserted/updated) for cost tracking.

**API fields requested (basic-data tier to minimize cost — $0.017/request):**
`name, place_id, geometry/location, formatted_address, business_status, formatted_phone_number, website, types`

Skip: ratings, reviews, photos, price_level, opening_hours — not needed for v1 pin display.

### 4.2 Refresh job (monthly cron per category, nightly scheduler)

**Frequency:** per-category `refresh_frequency_days` (default 30). Configured by admin.

**Two parallel tasks per brand:**

**Task 1 — Verify existing locations (closure detection):**
For each `merchant_location` where `brand_id = X`, call Place Details with just `business_status` field.
- Update `last_fetched_at = now()`.
- If `OPERATIONAL`, also update `last_verified_at = now()`.
- If status changed, populate `previous_status`, `status_changed_at`, and insert `merchant_closure_alert`.

**Task 2 — Detect new locations:**
Re-run the same Text Search as §4.1. Any `place_id` not already in `merchant_location` is a newly-opened (or newly-listed) store — insert it.

---

## 5. Logo Resolution (Brandfetch)

### 5.1 Resolution flow (runs during brand creation and on manual admin refresh)

1. Admin creates/imports brand `{name: "Starbucks", brandfetch_domain: null}`.
2. System attempts domain resolution:
   - If `brandfetch_domain` is set, use it.
   - Otherwise, call Brandfetch's domain search endpoint with `name`. Take the top match.
   - If no confident match, leave `logo_url = null` — fallback pin will be used at render time.
3. Fetch brand assets from Brandfetch. Prefer in this order:
   - `symbol` variant (icon alone — best for tight pins like McDonald's arches)
   - `logo` variant (full logo with text — good for word-first brands like DUNKIN')
   - `icon` variant (favicon-style square)
4. **Cache the logo file in Supabase Storage** at `merchant-logos/{brand.id}.{ext}` to avoid Brandfetch hot-linking concerns and guarantee availability.
5. Persist `logo_url` (Supabase Storage public URL), `logo_variant`, `logo_fetched_at`.

### 5.2 Re-resolution

- Admin can click "Refresh logo" on any brand to re-run the flow.
- Batch "Refresh all logos" job runs quarterly (logos change rarely; no need for monthly).
- If Brandfetch returns 404 or low-confidence on re-fetch, keep the existing logo — don't blank it out.

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

New route `/admin/merchants`, linked from the main hamburger menu. Visible only to users with `user_role = 'admin'`.

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
- `merchant-logo-refresh` — weekly, Sunday 08:00 UTC. Function re-fetches Brandfetch for logos older than 90 days.
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
| Initial ingestion, all 420 brands | One-time | ~2,100 | **~$36** |
| Initial ingestion, one category (avg 12 brands) | One-time per category | ~60 | ~$1 |
| Monthly refresh, all GA locations (est. 15k–25k) | Monthly | 15k–25k | **$0.25–$0.50/mo** |
| Weekly refresh (if admin sets a category to 7 days) | Weekly | same set | ~$2/mo |
| Brandfetch API | Free tier covers v1 | n/a | $0 |
| Supabase Storage (logos) | ~420 × ~20KB avg | ~8MB | negligible |

**Bottom line:** well under $50/year steady-state at GA scope. Not a budget risk.

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
| 1 | Admin gating — new `is_admin` column? | **No new column.** Use existing `user.user_role = 'admin'`. |
| 2 | `Wal-Mart` vs `Wal-Mart Supercenter` | **Merge** into a single `Wal-Mart` brand. |
| 3 | `Family Dollar` vs `Dollar Tree` vs `Family Dollar \| Dollar Tree` | **Keep FD and DT separate; drop the combo row from import.** Combo-store support is Phase 2 (see §14). |
| 4 | `Pizza` singleton category | **Merge into `Restaurant Pizza`**; drop the `Pizza` category. |
| 5 | Cron infrastructure | **`pg_cron` + `pg_net`** calling Edge Functions, matching the `friday-cfo-email` reference pattern (see §10.2). |
| 6 | Share-to-non-user behavior | **Error only.** Sharing uses a dropdown of existing Oculus users; no free-text email, no invite flow. |
| 7 | Pin collision priority | **First-rendered wins for v1.** Smarter priority is a v2 refinement. |

### Still open (non-blocking — resolve during implementation)

1. **Brandfetch plan tier** — free tier's rate limits likely cover v1 (~420 brands, re-fetched quarterly = ~1,680 requests/year). Confirm when implementing. Paid tier trivially cheap if needed.
2. **Ingestion trigger UX detail** — on the admin page's "Refresh Places" button, should ingestion run synchronously (button in loading state) or async (fire-and-forget, progress in Ingestion Activity tab)? Lean: async for anything touching > 5 brands.
3. **Existing hamburger menu location** — confirm the correct parent component to slot the `/admin/merchants` link into. Match the pattern of existing admin links if any exist.

---

## 16. Implementation Order (Suggested)

1. **DB migrations** (§3) — all six tables + indexes.
2. **Seed CSV import** (§12) — cleanup + bulk load of 420 brands. Runs once.
3. **Brandfetch integration** (§5) — logo resolution + Supabase Storage caching. Run over seed list.
4. **Admin page tabs 1 & 2** (Brands, Categories, §7) — CRUD UI + manual "Refresh Places" button.
5. **Places ingestion job** (§4) — reusable module called by admin button and by cron.
6. **Map drawer UI** (§6) — floating drawer, category tree, search, per-user selection persistence.
7. **Merchant pin rendering** (§8) — advanced markers, clustering, zoom-sized logos, halo CSS.
8. **Popup** (§9) — InfoWindow on click.
9. **Favorites** (§6.3–6.5) — create/share/apply favorites.
10. **Background jobs** (§10) — monthly refresh cron, logo weekly cron.
11. **Closure alerts** (§11) — alerts table population, badges, admin Alerts tab, optional digest email.
12. **Admin page tab 3** (Closure Alerts, §7.2).

Each step is independently testable. Steps 1–4 deliver value to the admin before any user-facing UI exists, which derisks the ingestion and logo pipeline early.

---

## 17. References

- [CLAUDE.md](../CLAUDE.md) — project conventions (Eastern Time, brand color palette, Supabase pagination, external API docs).
- [GOOGLE_MAPS_ADVANCED_MARKER_FIX.md](GOOGLE_MAPS_ADVANCED_MARKER_FIX.md) — known pitfalls with `AdvancedMarkerElement`; relevant for §8.
- [advancedMarkers.ts](../src/components/mapping/utils/advancedMarkers.ts) — existing marker utility; new merchant markers should either reuse or extend the same `importLibrary('marker')` pattern to avoid race conditions.
- [RestaurantLayer.tsx](../src/components/mapping/layers/RestaurantLayer.tsx) — closest analog for the new layer; look here for clustering config and marker lifecycle patterns.
- [LayerPanel.tsx](../src/components/mapping/LayerPanel.tsx) / [LayerManager](../src/components/mapping/layers/LayerManager.tsx) — existing layer-state system the Merchants layer will register with.
- Google Places API — Text Search: https://developers.google.com/maps/documentation/places/web-service/search-text
- Google Places API — Place Details: https://developers.google.com/maps/documentation/places/web-service/details
- Brandfetch API docs: https://docs.brandfetch.com/
