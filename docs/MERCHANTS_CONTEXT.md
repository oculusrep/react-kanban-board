# Merchants Layer — Context

**Read this first** before touching anything merchant-related. It is the orientation doc: what the feature is, how it got here, what is true in production right now, and which rules will bite you. The deep docs are linked at the bottom; this one exists so you don't have to read all seven of them to make a safe change.

**Last verified against production:** 2026-09-28.

---

## 1. What the feature is

A map layer that shows branded retail/restaurant/service locations as **actual brand logos** rather than generic pins, so a broker looking at a site can see the co-tenancy and competition around it at a glance.

The model is **curated brands + cached Places data**, not live API calls:

```
merchant_brand (403 curated brands, 35 categories)
      │
      │  admin triggers ingestion, per region
      ▼
Google Places API (New) ──► merchant_location (23,667 cached rows)
                                   │
                                   ▼
                         map renders by viewport, $0 runtime API cost
```

Two surfaces:
- **User:** the 🏬 Merchants drawer on the map (`/mapping`) — category tree, brand search, Favorites.
- **Admin:** `/admin/merchants` — Brands, Categories, Ingestion, Closure Alerts tabs, gated on `ovis_role = 'admin'`.

---

## 2. How it got here

| Date | What shipped |
|---|---|
| **2026-04-22** | Spec written. 7 tables migrated. Seeded 35 categories + 401 brands, plus 55 manual `brandfetch_domain` corrections. |
| **2026-04-23** | Four-tab admin shell. Places ingestion built — then rebuilt: the legacy `PlacesService.textSearch` turned out to have an unfixable pagination bug (20 results, not the advertised 60) and to throw `INVALID_REQUEST` on fresh instances. Migrated to `Place.searchByText` (Places API New) the same day. Full GA run: **401 brands, $124.58.** |
| **2026-06-26** | **The map layer itself** — drawer, Brandfetch logo pins via `AdvancedMarkerElement`, `MarkerClusterer` below zoom 13, click popup. Plus the daily logo-refresh cron and Brandfetch miss detection. Plus admin verify-pin-by-drag. Closure detection **deferred on cost** the same day. |
| **2026-07-02** | Favorites MVP (create/edit/delete, no sharing). "Show all in viewport" toggle. Admin custom logo upload. **Name-match filter** — ~40% of cached rows turned out to be misclassified. |
| **2026-07-07** | **Ancillary sub-listing filter** (Kroger Pharmacy, Wells Fargo ATM, …). Hides ~8.5% more. |
| **2026-07-25** | `is_default` org-wide favorite (OREP), auto-applied on first drawer open. |
| **2026-09-03** | Global wrong-pin removal (soft delete via `SECURITY DEFINER` RPC, any authenticated user). Favorite **sharing** UI — the schema had existed unused since April. |
| **2026-09-27** | Name-match + ancillary guards extracted to `supabase/functions/_shared/merchant-brand-guards.ts`. **One definition, three callers** (ingest, map render, site-research). |
| **2026-09-28** | **Ingestion regions.** Geography became a registry; Columbia SC added as the second market, with a quadtree partition and hard cost ceilings. Harris Teeter + Piggly Wiggly added; the 12 bogus North Augusta rows excluded. *On `feature/merchant-regions`, not merged.* |

---

## 3. Production state right now

Counts verified 2026-09-28:

| | |
|---|---:|
| Active brands / categories | 403 / 35 |
| Cached locations | 23,667 |
| Verified (hand-dragged) pins | 7 |
| Excluded (removed-as-wrong) pins | 12 |
| Favorites / shares | 3 / 1 |
| Closure alerts | 2 |
| `merchant_brand_region_ingest` rows | 401 (all `georgia`; the 2 new grocery brands have no run yet) |

**Roughly half of all cached rows never render.** The name-match and ancillary filters run at *render* time and hide ~48% of `merchant_location`. Rows are not deleted — flipping a brand's `places_display_name` recovers false negatives. Don't be alarmed by the gap between 23,667 and what you see on the map.

### Two things that are worse than the docs say

**Brandfetch logo coverage has collapsed: 180 `miss` / 221 `ok`.** [MERCHANTS_NEXT_SESSION.md](MERCHANTS_NEXT_SESSION.md) records ~15 misses in July. It is 180 now — 45% of brands render the fallback letter-circle instead of a logo. Nobody has diagnosed when or why this regressed. **This is the highest-value open item on the feature** and it is not written down anywhere else.

**The logo cron looks idle but is fine.** `merchant-logo-refresh-daily` reports `succeeded` every day (94 runs, latest today), yet no `logo_fetched_at` has moved since 2026-09-14. That is correct behaviour, not a failure: the function only touches brands older than `STALE_THRESHOLD_DAYS = 25`, and the fleet was refreshed 2026-09-11→14 in three batches of ≤150. The next real work is due **~2026-10-06**, clearing at 150/day before the Brandfetch 30-day licence expires ~2026-10-11. The cushion is 5 days and it works, but it is thin — if you see logos vanish site-wide in October, this is the first place to look.

---

## 4. Data model

Seven tables, all prefixed `merchant_`:

- **`merchant_brand`** — the curated master list. Carries Brandfetch fields (`brandfetch_domain`, `logo_url`, `logo_variant`, `brandfetch_logo_status`, `custom_logo_url`), Places tuning (`places_search_query`, `places_display_name`, `places_name_exclude`), and `last_ingested_at`.
- **`merchant_category`** — 35 admin-managed categories. One category per brand. `refresh_frequency_days` is editable but nothing consumes it yet.
- **`merchant_location`** — the Places cache. `google_place_id` is unique. Has three coordinate concepts: Places coords (`latitude`/`longitude`), admin overrides (`verified_*`), and soft-delete (`excluded_at`).
- **`merchant_favorite`** / **`_brand`** / **`_share`** — user-owned brand sets, Google-Docs-style sharing, plus one org-wide `is_default` favorite.
- **`merchant_closure_alert`** — table + admin tab exist; **nothing produces rows** (see §6).
- **`merchant_brand_region_ingest`** — per-region ingest history. *New on the unmerged branch.*

There is **no state/region/market column on `merchant_location`.** Region membership is decided in code, by `MerchantRegion.accept()`. The map queries purely by viewport bbox and is entirely geography-agnostic.

RLS pattern across all of them: authenticated users read, `merchants_is_admin()` writes. Two deliberate exceptions — the exclusion RPC (any user) and the `is_default` favorite (readable by everyone).

---

## 5. Rules that will bite you

**Ingestion is browser-only.** `ingestBrand()` calls `google.maps.importLibrary('places')` and `Place.searchByText` — the Maps **JavaScript** SDK. There is no headless path. An agent cannot run an ingestion; a human clicks the button at `/admin/merchants`. The `merchant-places-ingest` Edge Function was specced and never built; building it needs the REST endpoint (`POST places.googleapis.com/v1/places:searchText`), not the JS SDK.

**Never overwrite `verified_*` on re-ingest.** Those four columns are admin corrections made by dragging a pin to the real storefront. The upsert touches `latitude`/`longitude` only. Stomping them silently undoes manual work. Same constraint as `restaurant_location`.

**Removal is a soft delete, and it must stay one.** Ingest keys on `google_place_id`, so a hard `DELETE` is resurrected on the next run of that brand. Set `excluded_at` instead.

**Add a region, don't edit the search engine.** Geography lives in [src/services/merchantRegions.ts](../src/services/merchantRegions.ts). A new market is an entry in `MERCHANT_REGIONS` and nothing else — `merchantIngestService` contains no geography at all.

**A search bbox is never the region.** `locationRestriction` is always a rectangle and no real region is one. `MerchantRegion.accept()` is the actual boundary, so it must be geometric: a state code anchored on the ZIP, or a haversine radius. The old filter was `addr.includes(', GA') || /\bGeorgia\b/`, and that second branch matched every business on a street named *Georgia Avenue* — which is how a dozen North Augusta, **South Carolina** storefronts sat in the Georgia cache for five months.

**`merchant_brand.last_ingested_at` is region-blind.** The Ingestion tab's skip-recent guard must read `merchant_brand_region_ingest`, or one region's run makes the next region's run skip all 401 brands.

**The two render filters have additive-only semantics.** If the global default overreaches for one brand, do **not** add un-exclude logic — pin the expected shape with `places_display_name` instead. Keeps the default sane for the other 400. The guards live in exactly one file, [_shared/merchant-brand-guards.ts](../supabase/functions/_shared/merchant-brand-guards.ts), imported by ingest, map render and site-research. Change it once, check all three.

**Brandfetch's terms shape the architecture.** Logos must be **hotlinked**, never downloaded and stored. A brand's licence expires if no API call is made within 30 days. Server-side calls must forge browser-like `User-Agent`/`Referer`/`Origin` headers or they 302 to the ToS page.

**Check the logo CDN with GET, never HEAD, and test for the placeholder rather than for size.** Both halves were learned from the 2026-09-30 regression that put 180 brands on `miss`:
- Brandfetch answers **HEAD with 404** whenever the resized object is cold in their edge cache, while GET on the same URL returns 200 and a real logo — and warms the cache, after which HEAD works. A HEAD-only checker therefore never warms anything and mislabels ~40% of brands per run.
- A missing brand still returns 200, with a placeholder that is byte-identical across brands: **344 bytes, sha256 `763edd1e…`** (older docs say 338 — stale). Do not use a size floor above it: the old `≥1000 bytes` rule condemned nine real wordmark logos in the 590–966 byte range (Sephora 590, Staples 628, Kohl's 866).

**Ingestion cost is now bounded in three places**, and all three matter: an adaptive quadtree that recurses only into saturated cells, a per-brand `maxRequestsPerBrand` ceiling, and a run budget checked between brands. The thing that makes bounds necessary is subtle — the saturation test reads the **raw** Places response, before the name-match filter, so a brand with one real location in a region still returns 20 loose matches and trips the whole partition. Georgia's log: 12.9% of all calls saturated.

**Cost estimates in this feature have a history of being wrong.** The original spec said ~$25 for a full ingestion; it cost $124.58. The admin tab's estimator said $16 for the same run. The spec said closure detection would cost $0.25–0.50/month; it is $422 per sweep. Treat any figure here as a lower bound until a real run confirms it.

**Clusterer teardown uses `setMap(null)`, not `clearMarkers()`** — the latter's re-render is projection-guarded and leaves stale cluster glyphs on the map.

---

## 6. Deferred, and why

**Closure detection** — deferred 2026-06-26 on cost. `business_status` requires the Place Details **Pro** SKU at $20/1000, so one full sweep of 23,667 rows is ~$470, i.e. $270/month net of the $200 Maps credit even at monthly cadence. Everything downstream is already built and waiting: the `merchant_closure_alert` table, the admin tab, and grey/desaturated pin rendering for `CLOSED_*`. Only the producer is missing. Cheapest path when picked up is closure-by-absence (re-run the text search; a location missing from 2+ consecutive runs gets one paid Details call to confirm). Revisit if a broker gets burned, if the Maps budget rises, or if Google ships a cheap status-only SKU. Full analysis: [MERCHANTS_CLOSURE_DETECTION_DEFERRED.md](MERCHANTS_CLOSURE_DETECTION_DEFERRED.md).

**Server-side ingestion / monthly refresh** — never built. This is the single change that would most improve the feature's operability: it would make ingestion triggerable without a human at a browser and unblock refresh cron at the same time.

**Zoom-scaled pin sizing** — spec calls for 24/32/40px at zoom 13/15/17+; pins are fixed at 28px. Punted on performance grounds. This matters because it was Layer 1 of the three-layer fix for unreadable wordmark logos (DUNKIN', SUBWAY).

**Also unbuilt:** per-brand location counts in the drawer, closure-alert badge on the toolbar, admin screen for excluded pins, bulk CSV brand import, `can_verify_merchant_locations` as its own permission (it currently piggybacks on `can_verify_restaurant_locations`).

---

## 7. Open right now

1. **180 Brandfetch misses.** Biggest visible quality problem. Undiagnosed. Admin Brands tab has a "Brandfetch returned nothing" filter to work the list.
2. **Columbia SC is built but not run.** `feature/merchant-regions` is committed and unmerged; migration `20260928143932` **is already applied to the shared production database** (additive, and `main` doesn't read the table). The 401-brand Columbia ingestion has not happened — ~$35–50, browser session required. Afterwards, recalibrate `COLUMBIA_SC.avgRequestsPerBrand` from `google_places_api_log` and flip `costBasis` to `'measured'`.
3. **Neither state has a convenience/gas category at all** — QuikTrip, Circle K, Sunoco, Parker's. A decision, not a bug.
4. **Brand-override curation pass** — the render filters overreach on ~20 brands. Known candidates: Truist Bank → `Truist`, Dunkin' Donuts → `Dunkin`, Apple Store → `Apple`, Verizon Wireless → `Verizon`, Mavis Discount Tire → `Mavis`. No re-ingest needed; the filters are render-time.

---

## 8. Where the code is

| | |
|---|---|
| Region registry | [src/services/merchantRegions.ts](../src/services/merchantRegions.ts) |
| Ingestion (browser) | [src/services/merchantIngestService.ts](../src/services/merchantIngestService.ts) |
| Shared name/ancillary guards | [supabase/functions/_shared/merchant-brand-guards.ts](../supabase/functions/_shared/merchant-brand-guards.ts) |
| Map layer + pins | [src/components/mapping/layers/MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) |
| Drawer, favorites | [src/components/mapping/MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx) · [MerchantCategoryTree.tsx](../src/components/mapping/MerchantCategoryTree.tsx) |
| Right-click menu | [src/components/mapping/MerchantContextMenu.tsx](../src/components/mapping/MerchantContextMenu.tsx) |
| Admin tabs | [src/pages/admin/merchants/](../src/pages/admin/merchants/) |
| Logo cron | [supabase/functions/merchant-logo-refresh/index.ts](../supabase/functions/merchant-logo-refresh/index.ts) |

## 9. The other docs

- [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — the original full spec. Still the best reference for §4 (Places integration) and §5 (Brandfetch). Its cost figures are wrong; §13's closure estimate is wrong by ~1000×.
- [MERCHANTS_NEXT_SESSION.md](MERCHANTS_NEXT_SESSION.md) — July 2026 pickup point. Good "context worth remembering" section; its DB numbers are stale.
- [MERCHANTS_ADMIN_ROADMAP.md](MERCHANTS_ADMIN_ROADMAP.md) — admin-side detail, plus the three-layer logo-readability strategy.
- [MERCHANTS_CLOSURE_DETECTION_DEFERRED.md](MERCHANTS_CLOSURE_DETECTION_DEFERRED.md) — why closure detection is parked, and the three options for picking it up.
- [MERCHANTS_COLUMBIA_SC_EXPANSION.md](MERCHANTS_COLUMBIA_SC_EXPANSION.md) — the multi-region work: what changed, the geography, how to run the Columbia ingestion.
- [MERCHANT_PIN_REMOVAL_AND_FAVORITE_SHARING.md](MERCHANT_PIN_REMOVAL_AND_FAVORITE_SHARING.md) — soft-delete design and the sharing UI.
- [MERCHANT_FAVORITE_ORG_DEFAULT.md](MERCHANT_FAVORITE_ORG_DEFAULT.md) — the `is_default` mechanism and how to repoint it.
- [GOOGLE_PLACES_API_STATUS.md](GOOGLE_PLACES_API_STATUS.md) — Places deprecation status across all of OVIS, spend monitoring, and §8's cost-cutting knobs.
