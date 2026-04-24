# Google Places API — Status, Bugs, and Migration Plan

**Last Updated:** 2026-04-23
**Owner:** mike@oculusrep.com
**Why this doc exists:** The Merchants map-layer build (April 2026) forced a mid-project migration from legacy `PlacesService` to the new `Place` API after we discovered unfixable bugs in the legacy one. This doc is the central reference for everything OVIS now knows about Google Places.

---

## 1. The short version

- Google deprecated `google.maps.places.PlacesService` for new customers in March 2025.
- Google has stated **"existing bugs in PlacesService will not be addressed"**.
- We hit two of those bugs during merchant ingestion: pagination silently truncates results to 20 (should be 60), and fresh PlacesService instances return `INVALID_REQUEST`.
- **Merchant ingestion migrated to the new `Place.searchByText` API** (commit `b3409527` onward).
- **The rest of OVIS still uses legacy PlacesService.** Most of it works, but ClosedBusinessSearchPanel is silently affected by the pagination bug (see §4).
- Google will give "at least 12 months notice" before full discontinuation, so legacy code has a ~12–24 month runway.

---

## 2. The two bugs we hit

### 2.1 Pagination silently returns 20 instead of 60

**Where it lives:** `googlePlacesSearchService.textSearch()` in [src/services/googlePlacesSearchService.ts](../src/services/googlePlacesSearchService.ts).

**Mechanism:** Google's PlacesService returns up to 3 pages × 20 results = 60 via a callback that fires once per page. The wrapping Promise resolves on page 1. When the callback re-fires for pages 2 and 3, the Promise is already resolved — those results go nowhere.

**Observable effect:** Every `textSearch` call returns exactly 20 rows when there are >20 matching places. The 2 extra `request_count` the method logs are real API calls; they just discard the data.

**Consumers of this bug (in the codebase):**
- `ClosedBusinessSearchPanel` — when a broker searches "closed restaurants in Atlanta" they've been getting the top 20 by Places' ranking, not 60. Users don't realize they're missing 2/3 of possible matches.
- None of the other OVIS features use `textSearch` specifically, so that's the only place with silent data loss.

**Status (as of 2026-04-23):** We've ported a pagination-correct `textSearchFullPagination` wrapper to the shared service so ClosedBusinessSearchPanel now paginates correctly. Commit trail in the git history.

### 2.2 Fresh PlacesService instances return INVALID_REQUEST

**Where it shows up:** anywhere that does `new google.maps.places.PlacesService(someDiv)` and immediately calls `.textSearch()`.

**Mechanism:** unknown. Google hasn't documented or acknowledged it. Empirically: an already-warm PlacesService instance (created at app load and used for a while) works; a new instance created later in the same tab, even with a DOM-attached div, returns `INVALID_REQUEST` from every textSearch call.

**Workaround:** reuse the single initialized PlacesService from `googlePlacesSearchService`. Don't create fresh instances.

**Consumers:** the merchant ingestion initially tried a fresh instance and hit this bug, which pushed us to the new API. Other OVIS code happens to reuse the shared instance so they're unaffected.

---

## 3. The merchant-ingestion migration (what we built)

- File: [src/services/merchantIngestService.ts](../src/services/merchantIngestService.ts)
- Uses `google.maps.places.Place.searchByText` (2025 API), loaded via `google.maps.importLibrary('places')`.
- Three-phase search because new API caps at **20 results per call** (legacy was 60):
  1. Statewide GA locationRestriction → up to 20
  2. Per-metro (6 metros) if Phase 1 hit 20 → up to 120 more
  3. 4×4 subdivision of any metro that also hit 20 → up to 320 more per dense metro
- Deduped by `google_place_id`, upserted into `merchant_location`.
- Every call logged to `google_places_api_log` at the same 2¢/request model as legacy searches.

See [MERCHANTS_LAYER_SPEC.md §4](MERCHANTS_LAYER_SPEC.md#4-google-places-integration) for the full writeup.

---

## 4. Cost reality — measured 2026-04-23

| Operation | Count | Cost |
|---|---:|---:|
| Merchant ingestion (401 brands, Places calls) | 6,229 requests | **$124.58** |
| Merchant ingestion (legacy textSearch attempts before migration) | 3 requests | $0.06 |
| Historical ClosedBusinessSearchPanel grid searches (pre-2026-04-23, month-to-date) | 270 requests | $5.40 |
| **Total Places API spend April 2026** | **6,502 requests** | **$130.04** |

Against Google's **$200/month Maps Platform credit**, we've used ~65% of April's credit just on the merchant initial ingestion. **Ongoing monthly burn (no fresh full ingestion) should be well under $20/month** once:

- Monthly closure-detection refresh runs on cached `place_id`s (cheap Place Details ~1¢ each × ~20k locations = $2–4/month)
- New-location detection re-runs the full 3-phase search for a subset of categories per month (~$15 spread across the month if staggered)
- Legacy ClosedBusinessSearchPanel usage continues at historical rates ($5–6/month visible in the log)

**Per-brand cost breakdown from the 2026-04-23 ingestion:**

| Density tier | Approx. count | Avg. cost/brand |
|---|---:|---:|
| Sparse (Phase 1 only) | ~150 | $0.02 |
| Mid (Phase 2 triggered) | ~180 | $0.14 |
| Dense (Phase 3 triggered on 1 metro) | ~50 | $0.50–$0.80 |
| Super-dense (Phase 3 on multiple metros) | ~20 | $1.00–$1.50 |

Starbucks verified: 293 GA locations at $1.42 (Phase 3 fired on Atlanta and a couple smaller metros).

**Estimate in the spec (§13) said ~$25. Reality was ~5× that.** Root cause: the new API's 20-per-call cap forces Phase 2 to trigger on almost any chain (legacy's 60-cap wouldn't have), and Phase 3 4×4 grids are expensive per triggering brand. Spec has been updated to reflect the real number.

---

## 5. Inventory of OVIS features that use Google Places

| Feature | File | API used | Status | Risk |
|---|---|---|---|---|
| Merchant ingestion | `merchantIngestService.ts` | New Places (`Place.searchByText`) | ✅ live | Low — on the forward-compatible API |
| ClosedBusinessSearchPanel | `ClosedBusinessSearchPanel.tsx` | Legacy `PlacesService` (+ `nearbySearchWithGrid`) | Works, **pagination bug in the textSearch code path just fixed** | Medium — legacy deprecation clock ticking |
| AddressSearchBox | `AddressSearchBox.tsx` | Legacy `google.maps.places.Autocomplete` | Works | Medium — legacy `Autocomplete` has a new-API replacement (`AutocompleteSuggestion`) |
| PlaceInfoLayer | `PlaceInfoLayer.tsx` | Legacy `PlacesService` | Works | Medium — will need migration when legacy is EOL'd |

The **map itself** (rendering, AdvancedMarkerElement, geocoding) is not part of the Places deprecation and is unaffected.

---

## 6. Migration roadmap for remaining Places consumers

Not urgent, but should be on the 2026 Q3/Q4 plan before Google starts enforcing the discontinuation.

### 6.1 ClosedBusinessSearchPanel → new Place API
- **Effort:** ~1 day. It's the biggest legacy consumer, with its own UI, budget checks, result storage (`google_places_result` table), grid search logic.
- **Strategy:** Replicate the three-phase pattern from `merchantIngestService.ts`. The `nearbySearchWithGrid` helper can stay (it uses `nearbySearch` which has a similar new-API equivalent).
- **Prerequisite:** already done — Places API (New) enabled on GCP project, API key allowlist updated.

### 6.2 AddressSearchBox → AutocompleteSuggestion
- **Effort:** ~2–4 hours. Autocomplete surface is smaller. Google provides a direct replacement class.
- **Strategy:** Replace `new google.maps.places.Autocomplete(input)` with the new `AutocompleteSuggestion` pattern (Promise-based, event-driven).

### 6.3 PlaceInfoLayer → Place class
- **Effort:** ~2 hours. Just a field refresh when clicking POIs on the map.
- **Strategy:** Swap `service.getDetails(placeId, callback)` for `await Place.fetchFields()`.

---

## 7. Budget & monitoring

- **Single pool:** all OVIS Places API usage hits the same Google Cloud billing project and the same $200/month credit.
- **Log table:** every call is recorded in `google_places_api_log` (`request_type`, `request_count`, `estimated_cost_cents`, `results_count`, `response_status`, `created_at`).
- **Spend check script:** [scripts/placesSpendCheck.ts](../scripts/placesSpendCheck.ts) prints hour/day/month totals with type breakdown. Run with `bun scripts/placesSpendCheck.ts`.
- **Historical baseline (pre-merchant-ingestion):** ~$5–10/month from ClosedBusinessSearchPanel usage visible in the log.
- **Post-ingestion ongoing estimate:** $10–20/month with monthly refresh + normal Closed Business usage. Well within the $200 credit.

---

## 8. Cost-cutting options for future merchant refresh runs

If cost becomes a concern, here are the knobs we can turn on the merchant ingestion — not yet implemented:

1. **Adaptive subdivision (recommended first step):** start Phase 3 with 2×2 = 4 cells; only subdivide further on cells that themselves hit 20. Saves ~60% on medium-density brands, preserves coverage for dense ones. ~2-hour refactor.
2. **Per-brand Phase-3 opt-out:** mark specific brands (the ones where you accept 120-location cap as "good enough") to skip Phase 3. Small schema add.
3. **Category-scoped ingestion:** admin runs refresh one category at a time instead of all-at-once. Cost smoothing rather than cost reduction.
4. **Nightly diff-only refresh:** use Place Details (cheap) on existing `place_id`s to detect closures; only run the full 3-phase search when category's monthly refresh is due. Already how §4.4 of the spec describes it — just not built yet.

---

## 9. Reference

- [MERCHANTS_LAYER_SPEC.md](MERCHANTS_LAYER_SPEC.md) — the layer's full spec, with §4 on Places integration
- [MERCHANTS_ADMIN_ROADMAP.md](MERCHANTS_ADMIN_ROADMAP.md) — admin UI progress + pending Edge Function work
- [src/services/merchantIngestService.ts](../src/services/merchantIngestService.ts) — three-phase search implementation using new API
- [src/services/googlePlacesSearchService.ts](../src/services/googlePlacesSearchService.ts) — legacy service wrapper; now has pagination fix
- [scripts/placesSpendCheck.ts](../scripts/placesSpendCheck.ts) — CLI tool for spend report
- Google's migration guide: https://developers.google.com/maps/documentation/javascript/places-migration-overview
- Google's deprecation notice for PlacesService: https://developers.google.com/maps/legacy
