# Merchants Admin — Full Shell Roadmap

**Status:** Phase 1 ("Brands" tab) landed 2026-04-22 in the first iteration.
**Owner:** mike@oculusrep.com
**Parent spec:** [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — §7 Admin Page

This doc is the pick-up point for expanding `/admin/merchants` from a single
Brands page into the full multi-tab admin shell the parent spec describes.

---

## What exists today (Phase 1 — done)

- Route: `/admin/merchants` → [`MerchantAdminBrandsPage`](../src/pages/admin/MerchantAdminBrandsPage.tsx)
- Navbar entry (desktop + mobile): "🏪 Merchants (Logos)" under the Reports menu, admin-gated by `userRole === 'admin'`
- Admin route guard: wrapped in existing `<AdminRoute>`
- Table view with:
  - Logo preview per brand (with letter-fallback pin when `logo_url` is missing or fails to load)
  - Stat cards: Total / With logo / Needs attention
  - Filters: search (name or domain), logo status, category
  - Inline edit for `brandfetch_domain` — on save, rebuilds the Brandfetch CDN URL in `logo_url` and bumps `logo_fetched_at`
  - Keyboard support: Enter to save, Escape to cancel

## What's missing (the full admin shell)

Per spec §7.2, the admin page should be a **tabbed UI** with these tabs:

| Tab | Status | Notes |
|-----|--------|-------|
| **Brands** | ✅ shipped | Current page. Rename to just "Brands" in tab nav. |
| **Categories** | ⏳ pending | CRUD for the 35 merchant categories; display order (drag-reorder); per-category `refresh_frequency_days` |
| **Closure Alerts** | ⏳ pending | Table of unacknowledged `merchant_closure_alert` rows; acknowledge button; filters; "View on Map" link |
| **Ingestion Activity** | ⏳ nice-to-have | Log table for audits; can be deferred to Phase 2 |

Plus a few cross-cutting refinements the current single-page version doesn't have.

---

## Step-by-step plan to pick up tomorrow

### 1. Refactor `MerchantAdminBrandsPage` into a tabbed shell

**What to do:**
- Create `src/pages/admin/MerchantAdminPage.tsx` as the new shell component.
- Use React Router nested routes OR tab-state-in-URL (`?tab=brands`, `?tab=categories`). The `?tab=` pattern is simpler for this codebase.
- Move the existing Brands page content into `src/pages/admin/merchants/BrandsTab.tsx` (or similar).
- The shell renders: page header, tab nav row, and the active tab's content below.
- Keep the `/admin/merchants` route pointing at the new shell; optionally add `/admin/merchants/:tab` if nested routes feel cleaner.

**Styling:**
- Tab nav matches the existing codebase convention — look at [`LayerManagementPage`](../src/pages/LayerManagementPage.tsx) for reference if there are tabs elsewhere, or roll a simple underline-style tab nav.
- Use brand colors: active tab border `#002147`, inactive text `#8FA9C8`.

### 2. Build **Categories** tab

**Data:** reads/writes `merchant_category`. Current rows: 35 seeded.

**UI:**
- Table columns: name, display_order (drag handle), brand count (computed), refresh_frequency_days, row actions.
- Row actions: Edit, Delete, "Refresh all Places" (stubbed; wires to ingestion job — §5 below).
- Header actions: `+ Add Category`.
- Inline edit or modal — either is fine. Modal is more familiar to this codebase (see `CreateLayerModal`/`EditLayerModal`).

**Gotchas:**
- Deleting a category is blocked by the FK `ON DELETE RESTRICT` on `merchant_brand.category_id` — surface the error clearly ("cannot delete: N brands still assigned").
- Reordering via drag updates `display_order`. Consider saving in multiples of 100 (seed already uses 100, 200, 300…) so inserts between rows don't need full re-indexing.
- `refresh_frequency_days` is per-category; default 30. Input should be a number field with sensible min/max (e.g., 1–365).

**Files to touch:**
- New: `src/pages/admin/merchants/CategoriesTab.tsx`
- Optional: extract a `useMerchantCategories` hook at `src/hooks/useMerchantCategories.ts` to parallel how `useMapLayers` is structured.

### 3. Build **Closure Alerts** tab

**Data:** reads/writes `merchant_closure_alert` (joined to `merchant_location` and `merchant_brand` for display). No alert rows exist yet — they'll be populated once ingestion/refresh jobs run.

**UI:**
- Filter row: unacknowledged only (default on), date range, category.
- Table columns: detected_at, location name, brand, address, previous_status → new_status, acknowledged_by (if ack'd), row action.
- Row action: "Acknowledge" (sets `acknowledged_by` to current user's `user.id` and `acknowledged_at = now()`).
- Optionally a "View on Map" button that deep-links to the mapping page with the location focused (requires map-layer side to support a selection query param; this is Phase 2 of the map work).

**Empty state:** "No closure alerts detected yet. The monthly refresh job will populate this tab." Show a neutral illustration or icon.

**Files to touch:**
- New: `src/pages/admin/merchants/ClosureAlertsTab.tsx`

### 4. Refinements on the Brands tab

Once the shell exists, add features the single-page version didn't have room for:

- **Refresh a single brand from Brandfetch** — button in the row actions that triggers a server-side call to re-resolve the domain. Requires an Edge Function (new) to avoid exposing the service role in the browser. Can be deferred.
- **Mass-refresh button** for all brands in a filtered set.
- **Bulk edit CSV import** — spec §7.3. Upload a CSV of brand → domain overrides in one shot. Low priority once inline edit works.
- **"Review Unclaimed" filter** — show only brands whose `logo_url` came from an unclaimed Brandfetch match (the ones worth eyeballing). Requires tracking that in the DB (new column `logo_source` with values like `'claimed' | 'unclaimed' | 'manual' | 'none'`) — small schema change.
- **Show `logo_fetched_at` age** — column or tooltip. Useful for spotting stale rows once monthly refresh starts running.

### 5. Wire up ingestion / refresh admin actions

The spec §4 (Places ingestion) and §10 (monthly refresh) call for buttons on the admin page that trigger these jobs. Both need **Supabase Edge Functions** because:

1. They hit Google Places API (would leak the server-side key if done from the browser)
2. They run long — better as background jobs, not synchronous UI requests

**Pattern to follow:** the existing [`friday-cfo-email`](../supabase/functions/friday-cfo-email/) edge function. Same `pg_cron` + `pg_net` approach for the scheduled version.

Concretely, for Phase 2 you'll need:
- `supabase/functions/merchant-places-ingest/` — takes `brand_id` or `category_id`, runs Text Search, upserts `merchant_location`.
- `supabase/functions/merchant-places-refresh/` — verifies existing `place_id`s, updates `business_status`, creates `merchant_closure_alert` rows on changes.
- `supabase/functions/merchant-logo-refresh/` — re-calls Brandfetch search for brands with `logo_fetched_at > 25 days`. Keeps the 30-day license valid per spec §5.
- Two new migrations for the cron schedules (`merchant-category-refresh` nightly, `merchant-logo-refresh` daily).

Buttons on admin page (Brands tab, Categories tab) call these functions via HTTP POST with `service_role` Authorization header (read from Vault). The Edge Function body validates the caller's `user.ovis_role = 'admin'` before doing anything.

### 6. Permissions polish

Current gating is a blunt `userRole === 'admin'`. Consider:

- Breaking out a `can_admin_merchants` permission so broker-full users could review/edit brands without getting full admin access. Not critical; defer unless a non-admin needs to edit logos.
- For the "Refresh" and "Delete" operations specifically, consider a confirmation modal — easy to click by accident. Look at `ConfirmDialog` in `src/components/` for the pattern.

---

## Estimated effort

| Item | Effort |
|------|--------|
| Tabbed shell refactor (§1) | 1–2 hours |
| Categories tab CRUD (§2) | 2–3 hours |
| Closure Alerts tab (§3) | 1–2 hours |
| Brands tab refinements (§4) | 1–3 hours depending on how many features |
| Places/logo Edge Functions (§5) | Bigger — 1 full day minimum; intersects with the cron work |
| Permissions polish (§6) | 30 min |

**Realistic for tomorrow:** tab shell + Categories tab + Closure Alerts tab. That delivers the full user-visible admin UI; §5 (ingestion/refresh Edge Functions) is its own focused session.

---

## Reference files from today's work

- [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — the parent spec
- [`MerchantAdminBrandsPage.tsx`](../src/pages/admin/MerchantAdminBrandsPage.tsx) — the existing page that becomes a tab
- [`AdminRoute.tsx`](../src/components/AdminRoute.tsx) — the existing admin guard; reused
- [`LayerManagementPage.tsx`](../src/pages/LayerManagementPage.tsx) — closest structural analog for table-with-CRUD patterns
- Supabase migrations `20260422`–`20260424` — schema + seed + logo corrections
