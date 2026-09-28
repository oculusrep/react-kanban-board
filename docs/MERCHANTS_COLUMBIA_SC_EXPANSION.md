# Merchants Layer — Columbia SC Expansion (research only)

**Status:** Built on `feature/merchant-regions`, not yet merged. Ingestion run still to do.
**Date:** 2026-09-28
**Branch:** `feature/merchant-regions` (worktree `../react-kanban-board-merchant-regions`)
**Migration applied to the shared production DB:** `20260928143932_merchant_brand_region_ingest` — additive only; `main` does not read the table, so it is safe out of sync until merge.
**Question asked:** What is actually required to make merchants work for Columbia, SC and surrounding counties within 50 miles, the way it works for Georgia today?
**Related:** [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) · [MERCHANTS_NEXT_SESSION.md](MERCHANTS_NEXT_SESSION.md) · [GOOGLE_PLACES_API_STATUS.md](GOOGLE_PLACES_API_STATUS.md)

---

## Headline

**The map side needs zero changes.** Everything geographic in the merchants feature lives in one file — [src/services/merchantIngestService.ts](../src/services/merchantIngestService.ts) — in three hardcoded constants and one address string test. The render layer queries `merchant_location` by map viewport bbox and knows nothing about states.

So this is an **ingestion-scope change plus one admin-UI affordance**, not a feature build. Rough size: half a day of code, ~$30–60 of Places spend, plus a short brand-gap pass.

---

## 1. What is Georgia-specific today (the complete list)

| # | Location | What it is |
|---|---|---|
| 1 | [merchantIngestService.ts:176-184](../src/services/merchantIngestService.ts#L176-L184) | `GA_STATE_BOUNDS` — the Phase 1 `locationRestriction` bbox |
| 2 | [merchantIngestService.ts:186-193](../src/services/merchantIngestService.ts#L186-L193) | `GA_METROS` — 6 hardcoded metro bboxes for Phase 2 |
| 3 | [merchantIngestService.ts:433](../src/services/merchantIngestService.ts#L433) | Post-filter: `addr.includes(', GA') \|\| /\bGeorgia\b/.test(addr)` — the only thing stopping out-of-state results being cached |
| 4 | [IngestionTab.tsx](../src/pages/admin/merchants/IngestionTab.tsx) lines ~264, 301, 330, 575 | Copy strings ("GA locations"). Cosmetic. |

That's it. The search itself is geography-neutral: `textQuery` is just the brand name (not "Starbucks in Georgia"), and all geography comes from `locationRestriction`.

## 2. What needs NO change

Confirmed by reading the code, not assumed:

- **[MerchantLayer.tsx:427-437](../src/components/mapping/layers/MerchantLayer.tsx#L427-L437)** — fetches by viewport bbox (`latitude/longitude` OR `verified_latitude/verified_longitude`), paginated, brand-filtered. No state predicate anywhere. SC rows render the moment they exist.
- **Schema** — `merchant_location` has no state/region/market column. Nothing to backfill.
- **Brands, categories, Brandfetch logos** — national chains, already resolved. A Columbia Chick-fil-A uses the same `merchant_brand` row as an Atlanta one.
- **Favorites, sharing, RLS, clustering, popups, verified-pin drag, exclusions, `places_display_name` / `places_name_exclude` curation** — all brand- or row-level, not geographic.
- **Drawer / LayerManager** — the Merchants layer is already registered in both menus (cf. `docs/ADDING_A_SYSTEM_LAYER.md`); no second registration needed.
- **Google Cloud** — Places API (New) already enabled, key already allowlisted, same billing project and $200/mo credit.

## 3. The geography

Columbia centroid (State House): **34.0007, -81.0348**. A 50-mile radius gives:

```
north  34.725    south  33.277
east  -80.163    west  -81.907
```

Recommended ingestion bbox, widened so partially-covered counties are fully swept:

```
north  34.80     south  33.20
east  -80.05     west  -82.00
```

**Counties intersecting the 50-mile radius** (for scoping conversations — ingestion is driven by the bbox, not a county list):

- *Core, essentially fully inside:* Richland, Lexington, Kershaw, Fairfield, Calhoun, Newberry, Saluda
- *Mostly inside:* Orangeburg (north ~⅔), Sumter (west ~⅔), Lee
- *Partly inside:* Chester (south half), Clarendon (NW corner), Aiken (NE portion), Edgefield (east), Union (south tip), Barnwell (north tip)

Ballpark 16 counties, ~1.1M people — Columbia MSA is ~850k. The 50-mile circle does **not** reach Georgia (nearest GA point ≈ 62 mi, near Augusta), so there is no overlap with existing coverage and no dedup risk beyond the existing `google_place_id` unique constraint.

## 4. Search-phase design for the region

Georgia's three-phase scheme (state → 6 named metros → 4×4 grid) doesn't transfer: the Columbia region has one real metro, and the whole region is roughly 110 × 112 miles — comparable in area to the Atlanta metro bbox, which already requires 4×4 subdivision for dense brands.

Recommended shape:

- **Phase 1** — one `searchByText` over the region bbox. Most brands finish here (under the 20-result cap).
- **Phase 2** — if Phase 1 caps at 20, a **4×4 grid over the region bbox** (16 cells, each ~28 mi). Replaces the "named metros" step.
- **Phase 3** — 2×2 subdivision of any cell that also caps at 20. Only Starbucks / McDonald's / Dollar General / Subway class brands should reach this.

This is the *adaptive subdivision* idea already recommended in [GOOGLE_PLACES_API_STATUS.md §8](GOOGLE_PLACES_API_STATUS.md#8-cost-cutting-options-for-future-merchant-refresh-runs), applied from the start rather than retrofitted.

**Cost estimate:** 401 brands × 2¢ base = $8.02. If ~20% cap and run the 16-cell grid: +$25.60. A handful reaching Phase 3: +$5–15. **Total ≈ $35–50.** (Georgia's measured full run was $124.58 across 6 metros.) Well inside the monthly credit.

## 5. Replace the address filter with a coordinate filter

The current `', GA' || /\bGeorgia\b/` test is a text match and **it already leaks**. All 12 SC rows in the database today are North Augusta businesses on *Georgia Avenue* — the `\bGeorgia\b` branch matched the street name:

```
Waffle House — 321 Georgia Ave, North Augusta, SC 29841
Wells Fargo  — 402 Georgia Ave, North Augusta, SC 29841
...
```

(They're invisible on the map today only because they're outside where anyone looks, and several also fail the render-time name-match filter.)

For a radius-defined region, the right test is geometric, not textual: **keep a result if it is within 50 miles of 34.0007, -81.0348** (haversine on the returned lat/lng). That is exact, needs no address parsing, and matches how the scope was actually described. Recommend switching Georgia to a bbox/state-code test at the same time and dropping the `\bGeorgia\b` branch.

## 6. The one non-obvious gotcha: `last_ingested_at` is global

[IngestionTab.tsx:155-166](../src/pages/admin/merchants/IngestionTab.tsx#L155-L166) has a "skip brands ingested in the last N hours" toggle that reads `merchant_brand.last_ingested_at`, and [merchantIngestService.ts](../src/services/merchantIngestService.ts) stamps that column at the end of every `ingestBrand()` run.

That column is **region-agnostic**. Once a second region exists, running Columbia stamps every brand as "just ingested," and the next Georgia run silently skips all of them (and vice versa).

Two ways out:

- **Minimal:** disable the skip-recent toggle whenever more than one region is in play. Cheap, but loses a genuinely useful guard on a 401-brand run.
- **Recommended:** a small tracking table, e.g. `merchant_brand_region_ingest (brand_id, region_id, last_ingested_at, locations_found)`, and point skip-recent at it. ~20 lines of migration; also gives per-region coverage reporting the feature doesn't have today.

## 7. Brand-list gaps for the Columbia market

The 401-brand master list is national/Southeast and transfers well — Publix, Food Lion, Bojangles', Cook Out, Zaxby's, Hwy 55, Belk, Ingles are all already there. Missing chains with real Columbia-area presence:

- **Harris Teeter** — grocery, not in the list
- **Piggly Wiggly** — grocery, not in the list
- **Lowe's Food** is present but is a NC/VA banner with little SC-midlands footprint; **Lowes Foods** spelling may also need a `places_display_name`
- **No convenience/gas category exists at all** (true for Georgia too) — QuikTrip, Circle K, Sunoco, Parker's. Out of scope unless you want it for both states.
- Columbia-local independents (Groucho's Deli, Lizard's Thicket, Rush's, Zesto) are the kind of thing the master list has deliberately excluded so far — flag for a decision, don't assume.

Brands with no SC presence cost 2¢ each to discover and cache nothing. Not worth pre-pruning.

## 8. Work order

### Done (on `feature/merchant-regions`)

1. **Region registry** — [src/services/merchantRegions.ts](../src/services/merchantRegions.ts). `MerchantRegion` carries `id`, `name`, `locationLabel`, `bounds`, `subAreas`, `phase3Grid`, `accept()`, and a cost calibration (`avgRequestsPerBrand` + `costBasis`). Georgia and Columbia are the two entries. **A third market is a config entry in `MERCHANT_REGIONS` and nothing else.**
2. **Region-driven ingestion** — [merchantIngestService.ts](../src/services/merchantIngestService.ts). `ingestBrand(brand, region)` / `ingestBrands(brands, region, …)`. Phase 1 = `region.bounds`, Phase 2 = `region.subAreas`, Phase 3 = `region.phase3Grid` subdivision of any saturated sub-area. The `', GA' || /\bGeorgia\b/` post-filter is gone, replaced by `region.accept()`.
3. **Per-region ingest tracking** — migration `20260928143932`. `merchant_brand_region_ingest (brand_id, region_id, last_ingested_at, locations_found)`, backfilled with all 401 brands under `georgia`. Skip-recent and the stale count now read it.
4. **Region picker in the Ingestion tab** — [IngestionTab.tsx](../src/pages/admin/merchants/IngestionTab.tsx). Every stat, button, cost figure and confirm-modal string is scoped to the selected region; the "cached locations" and "stale here" cards count per region.
5. **Cost estimator fixed** — was a flat 2 calls/brand for everything, which undershot Georgia's real run 8× ($16 predicted vs $124.58 spent). Now `brandCount × region.avgRequestsPerBrand × 2¢`, and the UI says out loud when a region's multiplier is an un-calibrated estimate.

### Still to do (needs a browser session — see §10)

6. Test-run 3 brands against Columbia (one sparse, one mid, one dense — e.g. REI / Chick-fil-A / Dollar General) and eyeball pin placement on the map.
7. Full 401-brand Columbia run. — *~$35–50, 20–40 min of browser time*
8. Recalibrate `COLUMBIA_SC.avgRequestsPerBrand` from `google_places_api_log` and flip `costBasis` to `'measured'`.
~~9. Add Harris Teeter + Piggly Wiggly~~ — **done 2026-09-28**, migration `20260928185116`. Both Brandfetch domains verified live against the CDN (2,380 / 4,068 bytes, clear of the 338-byte placeholder). 403 active brands now. They will be picked up by the first Columbia run.
~~10. Remove the 12 bogus North Augusta rows~~ — **done 2026-09-28**. Soft-deleted, never `DELETE`: ingest upserts on `google_place_id`, so a hard delete is resurrected by the next run of that brand. `excluded_at`/`excluded_by`/`exclusion_reason = 'SC row admitted by old Georgia Avenue address filter'`. Zero SC rows now visible in the cache; no verified pin was touched.

### Cost guard (added after review)

The first cut of the Columbia region used a fixed 4×4 grid, which meant any brand tripping the region-wide cap paid for all 16 cells: **17 calls/brand as soon as a brand caps once ($136 for 401 brands), 81 in the worst case ($650)**. The `$35–50` estimate assumed a ~20% cap rate with nothing enforcing it.

Georgia's log shows why that was optimistic: **6,229 calls / 401 brands = 15.53 per brand, with 12.9% of all calls saturating**. The cap test runs on the *raw* Places response, before the name-match filter, and Google's text search is permissive enough that a brand with one real location still returns 20 loose matches and trips the partition.

Three guards now:

| Guard | Value |
|---|---|
| Adaptive quadtree (recurse only into saturated cells) | 2×2, maxDepth 3 |
| Per-brand ceiling (`maxRequestsPerBrand`) | 25 calls / $0.50, reported as `truncated` |
| Run budget, checked between brands | $75 default in the admin UI |

Revised projection: **1 call/brand floor ($8), ~7.2 likely (~$57), $75 hard stop.** A cost model built from the committed config reproduces Georgia's real run at 16.4 calls/brand against 15.53 measured, which is the basis for trusting the 7.2.

Georgia keeps its curated-metro strategy — it is a shipped market with 23k rows already paid for, and changing its search shape would invalidate the measured calibration for no present benefit.

## 10. Running the ingestion

Ingestion is **browser-side only** — `ingestBrand()` calls `google.maps.importLibrary('places')` and `Place.searchByText`, which exist only inside a loaded page. There is no headless path; the `merchant-places-ingest` Edge Function in [MERCHANTS_LAYER_SPEC.md §4.3](MERCHANTS_LAYER_SPEC.md) was deferred and never built.

So: `/admin/merchants` → **Ingestion** tab → pick **Columbia SC (50-mile radius)** in the new Region dropdown → test a few brands → run. Keep the tab open; it has a progress panel and a cancel button.

If markets keep being added, building that Edge Function becomes the better investment — it would make ingestion triggerable without a human at a browser, and would unblock the monthly refresh at the same time.

## 9. Open questions for Mike

- **Radius or counties?** Built as a 50-mile circle, which is what was asked for. It differs from "these 16 counties" at the edges (Aiken, Chester, Clarendon, Barnwell) — county-exact would need a boundary lookup at ingest time. Changing it later is a one-line edit to `COLUMBIA_RADIUS_MILES` plus a re-run.
- **Convenience/gas category** — real gap for both states. Separate decision.
- **Columbia's cost multiplier is a guess** (4.5 calls/brand). The confirm modal says so. If the real run comes in far above that, the adaptive-subdivision knob in [GOOGLE_PLACES_API_STATUS.md §8](GOOGLE_PLACES_API_STATUS.md#8-cost-cutting-options-for-future-merchant-refresh-runs) is the next lever.
