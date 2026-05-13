# StreetLight Integration — Handoff

**Status:** ✅ **SHIPPED** — AGPS live, full state-of-Georgia catalog backfilled
**Branch:** `main`
**Edge function `streetlight` deployed version:** `32` (AGPS column-by-name parser + `osm_vintage` in `/metrics` fields)
**Edge function `streetlight-backfill`:** deployed (admin-only, resumable, tile-driven catalog pre-warmer)
**Database cache:** populated for region=`georgia` (~3,744 tiles, ~900K segments)

See **"Update 2026-05-12"** below for the full sequence; the original 2026-05-05 / 2026-05-09 notes are kept for historical context.

---

## Update 2026-05-12 — AGPS enabled, response-shape bug, metrics fields, GA backfill

### Sequence

1. **StreetLight support enabled AGPS** on the Oculus Real Estate Partners / CRE API account.
2. **Re-ran the entitlement probe** via `streetlight-test` against the Crosstown Drive bbox `(33.380, -84.590, 33.400, -84.560)`. All AGPS calls returned 200 with 342 segments (vs. 70 for CVD+ in the same bbox). Entitlement confirmed.
3. **Bug 1 — `/geometry` parser silently dropped every segment.** v28-30 deployed `handleGeometry` returned 200 but the cache stayed empty. Diagnostics revealed AGPS responses are 3-column (`segment_id, osm_vintage, line_geometry`) versus CVD+'s 2-column (`segment_id, line_geometry`). The existing parser destructured `[id, geom]` positionally, so for AGPS `geom` was actually the integer osm_vintage and `geom.coordinates` was undefined. Filter dropped them all.
   - **Fix (v31):** column-index lookup by name (`columns.indexOf('segment_id')` / `'line_geometry'`). Works for either source; backwards-compatible. See [supabase/functions/streetlight/index.ts](../supabase/functions/streetlight/index.ts) `handleGeometry`.
4. **Bug 2 — `/metrics` returned 403 "No osm_vintage found within fields".** AGPS rejected metric requests because `osm_vintage` was missing from the `fields:` array (it was only at top-level).
   - **Fix (v32):** added `'osm_vintage'` to `fields: ['segment_id', 'osm_vintage', 'year_month', 'trips_volume']` in `handleMetrics`.
5. **Frontend behaviour validated.** With v32 deployed, the user confirmed segments rendered on Crosstown Drive (the original gap) and a click → $0.50 AADT fetch succeeded end-to-end.
6. **Catalog backfill — `streetlight-backfill` edge function.** Built a tile-driven backfill that walks pre-defined regions (`georgia`, `atlanta_metro`, `peachtree_city`) in 0.065° × 0.095° tiles, calls `/geometry` per tile at 1 req/sec, upserts into `streetlight_segment`. Resumable via `streetlight_backfill_progress`. Each invocation caps at 50 tiles / 130s to stay under Supabase's 150s edge-function gateway idle timeout. Geometry is unbilled, so the only "cost" is wall time (~2.5–3 h for whole GA).
7. **Internal-token auth path** added to the backfill function so it can be triggered server-side without a user JWT. Token in single-row `streetlight_backfill_config`. **Deploy is currently `verify_jwt: false`** while the backfill runs; will be reverted to `verify_jwt: true` and the internal_token row cleared once GA is complete.

### What got deployed

| Layer | Deployed state | Repo state |
|---|---|---|
| Edge fn `streetlight` | v32 — AGPS column-by-name parser + `osm_vintage` in `/metrics` fields | `main` matches (committed in this update) |
| Edge fn `streetlight-backfill` | NEW. v3+ — internal_token auth path, 50-tile / 130s budget per run, resumable | NEW in `main` |
| Edge fn `streetlight-test` | Still deployed (v7), `verify_jwt:false` — used to dump the raw AGPS response shape that caught Bug 1 | n/a — **DELETE** once GA backfill is fully confirmed shipped |
| Migration `streetlight_backfill_progress` | applied | NEW in `main` |
| Migration `streetlight_backfill_internal_auth` | applied (singleton `streetlight_backfill_config` table) | NEW in `main` |

### Known follow-ups when next picking this up

- [ ] **After GA backfill completes:** redeploy `streetlight-backfill` with `verify_jwt: true` and remove the `internal_token` body path from `requireAdmin` (or just clear the token row so the path becomes inert — the simpler option). Document is open while the backfill is still mid-run.
- [ ] **Delete `streetlight-test` edge function** once AGPS path is fully confirmed. It served its purpose catching the response-shape bug.
- [ ] **Server-side permission check in `handleMetrics`** (`requireAuth` only validates JWT, doesn't check `can_consume_traffic_quota`). A user with view-only access could craft a direct call. ~5 lines. *(Still open from prior session.)*
- [ ] **"Data is N years old" warning** in the popup for segments where `year_month` is older than 2 years. *(Still open from prior session.)*

### Useful queries / commands

```sql
-- Backfill progress
SELECT * FROM streetlight_backfill_progress;

-- Catalog size
SELECT COUNT(*) FROM streetlight_segment;
```

```bash
# Drive a region backfill via the internal-token path while verify_jwt:false is in effect.
# Token lives in streetlight_backfill_config; rotate / clear after use.
curl -s -X POST 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/streetlight-backfill' \
  -H 'Content-Type: application/json' \
  -d '{"region":"georgia","internal_token":"<uuid-from-streetlight_backfill_config>"}' | jq
```

---

## Update 2026-05-09 — AGPS attempted, blocked at entitlement layer

The 2026-05-05 email to StreetLight support came back. Their answer:

> CVD+ metrics represent an older generation of segments (2022 → April 2023, limited geographic coverage). The latest SATC vehicle traffic metrics use **AGPS source data**, available 2019 → Feb 2026, with coverage starting at residential roadway classes and above. Recommended pairing: most recent annualized year (2025) + AGPS source + latest OSM vintage `[202501]`.

That cleanly explains the original Crosstown Drive gap: we'd been hitting CVD+ (the legacy default) the entire time. So we made the switch:

1. **Edge function v28 deployed** — added `SATC_SOURCE = 'agps'` and `OSM_VINTAGE = [202501]` constants at the top of [supabase/functions/streetlight/index.ts](../supabase/functions/streetlight/index.ts), threaded both into `/geometry`, `/metrics`, and `/date_ranges` calls. Replaced the explicit `source: 'cvd_plus'` on `/metrics`.
2. **DB cache wiped** — `streetlight_segment` (5,292 rows), `streetlight_segment_metrics` (7 rows), `streetlight_usage_log` (18 rows). All of it was CVD+-derived data; segment IDs aren't comparable across sources, so a clean slate is correct. The 18 historical billings are gone, but most were from buggy v21-era testing anyway.
3. **Direct probe via `streetlight-test` (verify_jwt: false)** against the original Crosstown Drive bbox `(33.380, -84.590, 33.400, -84.560)` and support's example point `[-84.56443, 33.37426]`. Result:

   ```json
   "agps_polygon":     { "status": 401, "error": "SATC Aggregated GPS source is not enabled for this account." }
   "agps_nearest_10":  { "status": 401, "error": "SATC Aggregated GPS source is not enabled for this account." }
   "cvd_plus_polygon": { "status": 400, "error": "Year must be specified with source 'cvd_plus'" }
   ```

The API key is valid and authorized for SATC — it just isn't entitled to the AGPS source. Support recommended a product our contract apparently doesn't include.

**Side observation:** CVD+ now requires an explicit `date.year` on `/geometry` (it didn't when v27 shipped, since v27's `/geometry` call sent no `source` and used SATC's default). If we ever roll back to a CVD+ state, `/geometry` will need `date.year` added too — not just `/metrics`.

### Follow-up email sent 2026-05-09

Drafted at [docs/STREETLIGHT_AGPS_ENABLEMENT_EMAIL_2026_05_09.md](STREETLIGHT_AGPS_ENABLEMENT_EMAIL_2026_05_09.md). Two asks:

1. Enable AGPS on the account, OR
2. Quote the upgrade path (pricing, contract changes, per-segment cost delta vs. the current $0.50 / 10K-annual plan).

### Production impact while waiting

- Cache is empty, so the map shows no AADT data — no errors visible to view-only users.
- Users with `can_consume_traffic_quota` (admin, broker_full) who try to fetch AADT will hit a 401 from the edge function. The frontend currently surfaces this as a generic error; no users have been observed hitting it yet.
- No financial impact: 401s aren't billable, and the empty cache means no accidental charges.

### Resume triggers (now)

- **AGPS gets enabled** on our existing contract → no further code changes needed; v28 just starts working. Re-run the Crosstown Drive probe to confirm coverage, then mark integration shipped.
- **AGPS requires an upgrade we accept** → same as above, no code changes.
- **AGPS upgrade is too expensive / declined** → roll v28 back to a CVD+ state (see "Rollback notes" below) and revisit the secondary-data-source plan (GDOT free, possibly HERE/INRIX/Wejo) before SitesUSA can be retired.

### Rollback notes (if AGPS doesn't get enabled)

To restore working CVD+ behavior in [supabase/functions/streetlight/index.ts](../supabase/functions/streetlight/index.ts):

- Change `SATC_SOURCE` constant from `'agps'` to `'cvd_plus'`.
- Add `date: { year: <yearToTry> }` to `handleGeometry`'s slFetch body — CVD+ now requires it on `/geometry`, not just `/metrics`.
- Either drop `osm_vintage` from all calls or probe whether CVD+ accepts it (unverified; safer to drop).
- The `/metrics` flow already supplied `date: { year }`, so it just needs the source change.

The cleanup work in v28 (top-of-file constants, type plumbing) should stay — it's the right shape regardless of which source ends up final.

---

The integration is technically working end-to-end (auth, geometry, metrics fetch, billing, free retry, cache-first rendering, permission gating). The blocker is **a SATC product-coverage gap**, not a code bug.

### The gap

For Mike's primary use case (replacing SitesUSA), the SATC `/geometry` endpoint with `mode: vehicle` does not return segments on city-owned local arterials that *do* have published AADT data via SitesUSA. The canonical example we validated:

- **Crosstown Drive, Peachtree City, GA** (~16,000 vpd per SitesUSA, attributed to StreetLight)
- SATC `/geometry` returns **70 vehicle segments** for the bbox `(33.380, -84.590, 33.400, -84.560)`, but **zero** of them lie on Crosstown Drive itself. They're all on Joel Cowan Pkwy, S Peachtree Pkwy, and side streets / parking-lot drives.
- Validated by sampling 5 points along Crosstown Dr's centerline at 250m intervals — zero hits within 30m at every point.

### Business implication

At $0.50 per segment fetch, we cannot justify replacing SitesUSA if SATC has these coverage gaps for the road classes we work with most. Mike asked StreetLight support directly whether:

1. This exclusion is by design (probe-density threshold, road class, etc.)
2. There's a parameter combination that surfaces these roads
3. A higher-tier product (InSight or enterprise) includes them
4. SitesUSA's published AADT for these roads is sourced from a different StreetLight product than SATC

### Resume trigger

When StreetLight support responds, that answer determines next action:

- **If SATC can be expanded to include city arterials:** finish the integration, retire the temporary test function, and document the final coverage assumptions.
- **If a higher tier is required:** sales conversation, then re-evaluate $/road-class economics.
- **If gap is permanent on SATC:** add a secondary data source (GDOT free counts for state routes, possibly HERE/INRIX/Wejo for local roads) before SitesUSA can be retired.

---

## Current state of the code

Everything is live and functional within SATC's coverage. Specifically:

### Edge function (`streetlight`, version 27)

- Auth restored (`requireAuth()`)
- Year-fallback `2025 → 2024 → 2023 → 2022` for AADT (in case SATC has 2025 annual)
- 1.1s pacing between year attempts to respect SATC's 1 req/sec rate limit
- 429 retry-with-backoff in `slFetch`
- Free-retry path: segments previously billed under any user are excluded from `segments_billed` (overlap check on `streetlight_usage_log.checked_segment_ids`)
- Cache lookup uses `day_type='all'`, `day_part='all'` (matches what's stored)
- `/metrics` honors `dateSpec.day_part` / `direction` from frontend
- `day_part: 'all'` default; valid values are `'all'` or `'0'..'23'` (per SATC validation; the documented `-10`/`-1..-8` codes are NOT accepted by SATC)

### Frontend (`TrafficCountLayer.tsx`)

- **Cache-first rendering** via PostGIS RPC `get_streetlight_segments_in_bbox()`. The RPC returns the union of every segment we've ever fetched whose `geom` intersects the viewport, regardless of which past geometry-fetch bbox brought it in.
- `/geometry` runs in the background against a **3× expanded bbox** (capped at SATC's 0.07°×0.10° hard limit) to grow the catalog for nearby areas before the user pans there.
- Pre-popup DB cache guard: clicking a cached segment never shows the $0.50 prompt.
- "Already queried — no data available" gray polylines for segments billed but with no AADT returned (don't accidentally re-pay).
- Retry button on gray segments — guaranteed free per the edge function's overlap check.
- Material `directions_car` icon pill at each cached segment's midpoint, AADT-color border.
- Polyline thickness: 5px default, 7px on hover.
- Viewport guards: `MIN_ZOOM = 13`, no upper-zoom cap, bbox ≥ ~50m × 50m to avoid SATC 4xx on tiny polygons.

### Permissions

Migration `streetlight_traffic_role_permissions` grants:

| Role | View cached AADT | Fetch ($0.50/segment) | Admin quota |
|------|:----------------:|:---------------------:|:-----------:|
| **admin** | ✅ | ✅ | ✅ |
| **broker_full** | ✅ | ✅ | — |
| broker_lite, va, testing, coach, client | ✅ | ❌ | ❌ |

All four spend-buttons render as empty for users without `can_consume_traffic_quota`.

### Database

- `streetlight_segment` — geometry catalog (~2,000 rows; 243 in the Peachtree City viewport that's been panned over)
- `streetlight_segment_metrics` — AADT cache (1 row currently, after the v22 cache-bug fix)
- `streetlight_usage_log` — billing history (6 rows from yesterday's pre-fix testing; 3 of them were "paid for nothing" under v21 and now retry for free)
- `streetlight_quota_config`, `streetlight_user_limit` — config tables, populated as needed
- RPC `get_streetlight_segments_in_bbox(s, w, n, e)` — backed by GiST index `idx_streetlight_segment_geom`

### What's deployed where

| Layer | Deployed state | Repo state |
|---|---|---|
| Edge function `streetlight` | **v28** — `SATC_SOURCE='agps'` + `OSM_VINTAGE=[202501]` on `/geometry`, `/metrics`, `/date_ranges`. Returns 401 on every call until AGPS is enabled on the account. | `main` matches (changes not yet committed as of 2026-05-09) |
| Edge function `streetlight-test` | **TEMPORARY**, `verify_jwt: false`, v4 — repurposed 2026-05-09 to compare CVD+ vs AGPS for the entitlement probe. Source still untracked locally. | n/a — delete when AGPS work ships or is fully shelved |
| Frontend `TrafficCountLayer.tsx` | Cache-first via RPC, 3× expanded `/geometry` bbox | `main` matches |
| Migrations | All applied (`20260503000000_streetlight_tables`, `20260504000001_streetlight_atomic_spend`, `20260504000002_streetlight_schema_fix`, `20260504000003_streetlight_segment_id_bigint`, `20260504000004_streetlight_traffic_role_permissions`, `20260505000000_streetlight_segments_in_bbox_rpc`) | `main` matches |
| DB cache | **Empty** — wiped 2026-05-09 (was 5,292 segment rows / 7 metrics / 18 usage_log rows of CVD+ data, all superseded by the source change). | n/a |

---

## Known follow-ups when we resume

### Cleanup
- [ ] Delete the `streetlight-test` edge function once the AGPS direction is settled (kept around 2026-05-09 in case we need another probe round during the support back-and-forth).
- [ ] Commit v28 edge function changes to `main` once we confirm AGPS will be the final source — don't want to land "broken on production" code if the answer turns out to be a different parameter combo.
- [ ] Server-side permission check in `handleMetrics` (`requireAuth` only validates JWT, doesn't check `can_consume_traffic_quota`). A user with view-only access could still craft a direct call. ~5 lines.

### Open implementation work
- [ ] Surface "data is N years old" warning in the popup for segments where `year_month` is more than 2 years old.

### Documentation
- [x] ~~Once StreetLight support responds, capture their answer in this doc and decide direction.~~ Done 2026-05-09 — see "Update 2026-05-09" section above.
- [ ] If AGPS isn't enabled and we add a secondary data source (GDOT, HERE, etc.), update [STREETLIGHT_INTEGRATION_PLAN.md](STREETLIGHT_INTEGRATION_PLAN.md) with the new coverage strategy.

---

## Email sent to StreetLight support (2026-05-05)

Mike sent a detailed reproduction email asking the four questions above, with the exact `/geometry` body, the bbox where coverage drops, and the SitesUSA AADT comparison. The thread was started by their account contact offering to escalate to the support team.

The email's reproduction is **deterministic** — they should be able to paste the curl body and confirm the gap themselves, then route internally.

---

## How to resume

1. **Check this doc first** — it's the single source of truth for what's deployed and what's blocked.
2. Read StreetLight's reply on the AGPS enablement request (sent 2026-05-09; see [STREETLIGHT_AGPS_ENABLEMENT_EMAIL_2026_05_09.md](STREETLIGHT_AGPS_ENABLEMENT_EMAIL_2026_05_09.md)) and decide which "Resume triggers (now)" branch above applies.
3. If you need to re-test SATC parameters, `streetlight-test` is still deployed (verify_jwt: false). Hit it with curl against `https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/streetlight-test` with a JSON bbox body. The current version (v4) compares CVD+ vs AGPS side-by-side.
4. Earlier session history: [STREETLIGHT_BUGFIX_2026_05_04.md](STREETLIGHT_BUGFIX_2026_05_04.md) for the v22→v26 bug-fix work, this doc's "Update 2026-05-09" section for the AGPS attempt.
5. Run `git log main --oneline -20` to see the merge history. v28 edge function source is in `main`'s working tree but not yet committed — see "Cleanup" follow-ups.
