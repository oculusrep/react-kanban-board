# StreetLight Integration — Handoff (2026-05-05)

**Status:** ⏸️ **BLOCKED** on response from StreetLight support
**Branch:** `feature/streetlight-integration` (also merged into `main`)
**Edge function deployed version:** `27` (live in production)

---

## Why we paused

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
| Edge function `streetlight` | v27 (auth, year-fallback 2025-2022, free-retry, day_part='all') | `main` matches |
| Edge function `streetlight-test` | **TEMPORARY**, `verify_jwt: false`, deployed for SATC probing | source untracked locally; deployed copy still live |
| Frontend `TrafficCountLayer.tsx` | Cache-first via RPC, 3× expanded `/geometry` bbox | `main` matches |
| Migrations | All applied (`20260503000000_streetlight_tables`, `20260504000001_streetlight_atomic_spend`, `20260504000002_streetlight_schema_fix`, `20260504000003_streetlight_segment_id_bigint`, `20260504000004_streetlight_traffic_role_permissions`, `20260505000000_streetlight_segments_in_bbox_rpc`) | `main` matches |

---

## Known follow-ups when we resume

### Cleanup
- [ ] Delete the `streetlight-test` edge function (deployed with `verify_jwt: false`, intended only for SATC probing). Source has never been committed.
- [ ] Server-side permission check in `handleMetrics` (`requireAuth` only validates JWT, doesn't check `can_consume_traffic_quota`). A user with view-only access could still craft a direct call. ~5 lines.

### Open implementation work
- [ ] Surface "data is N years old" warning in the popup for segments where `year_month` is more than 2 years old.
- [ ] Wire up the temporary `streetlight-test` capabilities (or drop it once we confirm coverage strategy).

### Documentation
- [ ] Once StreetLight support responds, capture their answer in this doc and decide direction.
- [ ] If a secondary data source is added (GDOT, HERE, etc.), update [STREETLIGHT_INTEGRATION_PLAN.md](STREETLIGHT_INTEGRATION_PLAN.md) with the new coverage strategy.

---

## Email sent to StreetLight support (2026-05-05)

Mike sent a detailed reproduction email asking the four questions above, with the exact `/geometry` body, the bbox where coverage drops, and the SitesUSA AADT comparison. The thread was started by their account contact offering to escalate to the support team.

The email's reproduction is **deterministic** — they should be able to paste the curl body and confirm the gap themselves, then route internally.

---

## How to resume

1. **Check this doc first** — it's the single source of truth for what's deployed and what's blocked.
2. Read StreetLight's response and decide which of the three "resume trigger" branches above applies.
3. If you need to re-test SATC parameters, the `streetlight-test` edge function is still deployed and unauthenticated; hit it with curl against `https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/streetlight-test` with a JSON bbox body.
4. The full session log of yesterday's bug fixes is in [STREETLIGHT_BUGFIX_2026_05_04.md](STREETLIGHT_BUGFIX_2026_05_04.md). Today's session (cache-first rendering, expanded bbox pre-fetch, 2025 year-fallback) is summarized in this doc.
5. Run `git log main --oneline -20` to see the merge history. The relevant feature branch is `feature/streetlight-integration` and is currently in sync with main.
