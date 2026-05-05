# StreetLight Integration — Bug Fixes & Changes (2026-05-04)

**Branch:** `feature/streetlight-integration`
**Edge function versions covered:** v22 → v25

This document captures the bug fixes and behavioral changes made to the StreetLight SATC integration during the 2026-05-04 session. The original plan is in [STREETLIGHT_INTEGRATION_PLAN.md](STREETLIGHT_INTEGRATION_PLAN.md); this is what actually got built/fixed against the live system.

---

## Files touched

| File | Change |
|------|--------|
| `supabase/functions/streetlight/index.ts` | Auth, year fallback, cache lookup fix, free-retry path, rate-limit handling, day_part pass-through |
| `src/components/mapping/TrafficCountLayer.tsx` | DB cache guard on popup, billed-segment gray state, advanced-options wireup, correct SATC day_part values |
| `src/hooks/useStreetLightTraffic.ts` | `fetchMetrics` accepts `FetchMetricsOptions` |
| `vite.config.ts` | Removed `allowedHosts: ['all']` debug setting |

---

## 1. Auth restored (v22)

**Was:** edge function had auth disabled with a hardcoded debug UUID `fe6e516f-…`.

**Now:** every request goes through `requireAuth(req, supabase)` — JWT-validated user, or 401.

[supabase/functions/streetlight/index.ts:611](../supabase/functions/streetlight/index.ts#L611)

---

## 2. Dynamic year fallback (v22)

**Was:** metrics call hardcoded `date: { year: 2022 }`.

**Now:** tries 2024 → 2023 → 2022 with a 1.1s pause between attempts (StreetLight rate limit is 1 req/sec). Stores the year that returned data in the cache row's `year_month` and `date_range_start/end`. The actual year used is also returned in the response as `year`.

If all 3 years return no data, `apiError` is set, `segments_billed = 0`, `response_status = 'failed'` — **no charge**.

[supabase/functions/streetlight/index.ts:465-510](../supabase/functions/streetlight/index.ts#L465-L510)

---

## 3. Cache lookup mismatch — the double-billing bug (v22)

**Root cause:** the cache write and cache lookup used different field values.

| Field | Stored as | Looked up as |
|-------|-----------|--------------|
| `day_type` | `'all'` | `'all_days'` |
| `day_part` | `'all'` | `'all_day'` |
| `year_month` | e.g. `'2022-annual'` | e.g. `'2024-annual'` |

The lookup never matched any stored row, so every click on a cached segment paid again. The user was charged 4× for segment `2896675860000001` before this was caught.

**Now:** lookup uses the resolved date_spec values (matching what's actually stored). Default is `day_type='all'`, `day_part='-10'` (SATC standard for "all day"). Cache hit returns the AADT in the `metrics` array with `segment_count: 0`, no usage_log row written, no charge.

[supabase/functions/streetlight/index.ts:402-424](../supabase/functions/streetlight/index.ts#L402-L424)

---

## 4. Free retry for previously-billed segments (v23)

**Was:** under v21, if StreetLight returned no data for a segment but didn't error, the user was billed for nothing — the cache write was skipped (apiError null but metricRows empty fell into the failure-log branch with billed = finalCount). Three of the user's six historical billings were "paid for nothing" with no cache row to show for it.

**Now:** before computing `segments_billed`, the edge function queries `streetlight_usage_log` for any prior successful row whose `checked_segment_ids` overlaps the current request, and excludes those segments from the bill. Only `newlyBilledIds.length` is charged. The free-retry segments are also omitted from the new log row's `checked_segment_ids` so they aren't double-counted in future overlap checks.

[supabase/functions/streetlight/index.ts:441-454](../supabase/functions/streetlight/index.ts#L441-L454)

The frontend popup respects this too: segments with a row in `streetlight_usage_log.checked_segment_ids` (loaded into `billedSet` on map mount) show a **gray polyline** and a "Retry (no charge if still no data)" button instead of the $0.50 prompt.

[src/components/mapping/TrafficCountLayer.tsx:138-156](../src/components/mapping/TrafficCountLayer.tsx#L138-L156)

---

## 5. Rate-limit handling (v24)

StreetLight's `/metrics` endpoint enforces 1 request/second. The year-fallback loop was firing 3 calls back-to-back, hitting 429.

**Now:**
- `slFetch` detects HTTP 429 and auto-retries up to twice with 1.5s → 3s backoff
- Year-fallback loop pauses 1.1s between attempts
- If all retries exhaust, throws `rate limit exhausted after retries`

[supabase/functions/streetlight/index.ts:42-72](../supabase/functions/streetlight/index.ts#L42-L72)

---

## 6. Frontend DB cache guard on popup (v22 partner change)

**Was:** clicking a cached segment relied on the in-memory `aadtMap` being populated. If the map had just remounted or panned, the popup could open with `aadt: null` and prompt for $0.50 even though the DB had the data.

**Now:** the popup `useEffect` does an on-the-fly query against `streetlight_segment_metrics` for the clicked segment. If a row exists, it displays the AADT and skips the prompt entirely. State is hydrated so subsequent renders are instant.

[src/components/mapping/TrafficCountLayer.tsx:265-294](../src/components/mapping/TrafficCountLayer.tsx#L265-L294)

---

## 7. Color scheme — "billed but no data" gray (v23 partner change)

| Polyline state | Color | Meaning |
|----------------|-------|---------|
| Has AADT cached | green/yellow/orange/red (per `aadtColor()`) | Click to view; no charge |
| Billed but no AADT | **gray (`#9ca3af`)** | StreetLight returned nothing; click "Retry" — free if still no data |
| Never queried | blue (`#3b82f6`) | Click to fetch for $0.50 |

`aadtColor()` thresholds: `<5k` green, `<20k` yellow, `<50k` orange, else red.

[src/components/mapping/TrafficCountLayer.tsx:73-79](../src/components/mapping/TrafficCountLayer.tsx#L73-L79)

---

## 8. SATC day_part values — empirically validated (v25 → v26)

After deploying v25 with `-10`/`-3`/etc. (taken from a doc summary that was apparently for InSight Planning, not SATC), the SATC API returned:
> `Validation errors: day_part — Day part as an hour must be between 0 and 23 (inclusive)`

So those bin codes are **not accepted by SATC.** The empirically validated values are:

| Value | Meaning |
|-------|---------|
| `'all'` | All day (full 24-hour aggregate) |
| `'0'` – `'23'` | Single hour (where `0` = 12am – 1am, `6` = 6am – 7am, etc.) |

**Custom ranges (e.g. 6am–11am) are not supported in a single call.** Approximating requires N separate calls (each billed):
- 6–11am = single hours `6`, `7`, `8`, `9`, `10` averaged = **5× billings**

### v26 final state
- Edge function default: `day_part: 'all'`
- Frontend dropdown: "All day (default)" + 16 single-hour options (6am–9pm)
- Frontend `FetchMetricsOptions.day_part` accepts `'all'` or `'0'..'23'`
- Each selected hour writes its own cache row, keyed `(segment_id, year_month, 'all', '6')` etc.

### What was wrong before
The Advanced Options dropdown in the popup had values like `"6-9"`, `"9-12"` — those aren't valid SATC syntax and the API would have rejected them. The dropdown was also never wired to a click handler, so it didn't actually do anything.

### What's correct now
- Dropdown values use SATC syntax (`-10`, `-3`, `-6`, etc.)
- "Fetch with these options" button is wired up — calls `fetchMetrics(segmentId, { day_part, direction })`
- Frontend `fetchMetrics` accepts `FetchMetricsOptions { day_part, direction }` and passes them as `date_spec` in the edge function body
- Edge function honors `dateSpec.day_part` / `dateSpec.day_type` / `dateSpec.direction` in the StreetLight call AND in the cache lookup, so different dimensions become separate cache rows (as the unique key `(segment_id, year_month, day_type, day_part)` already required)
- Each fetched dimension is a separate $0.50 charge — confirmed in StreetLight's quota docs

[src/components/mapping/TrafficCountLayer.tsx:319-329](../src/components/mapping/TrafficCountLayer.tsx#L319-L329)
[src/hooks/useStreetLightTraffic.ts:172-201](../src/hooks/useStreetLightTraffic.ts#L172-L201)
[supabase/functions/streetlight/index.ts:402-410](../supabase/functions/streetlight/index.ts#L402-L410)

---

## 9. vite.config.ts cleanup

Removed `server: { allowedHosts: ['all'] }` — was a debug setting and shouldn't ship.

---

## 10. Role-based access control for spend buttons

The three traffic permissions in [src/types/permissions.ts](../src/types/permissions.ts) are now wired to role records via migration `streetlight_traffic_role_permissions`:

| Role | View cached AADT | Fetch ($0.50/segment) | Admin quota |
|------|:----------------:|:---------------------:|:-----------:|
| **admin** | ✅ | ✅ | ✅ |
| **broker_full** | ✅ | ✅ | — |
| broker_lite, va, testing, coach, client | ✅ | ❌ | ❌ |

Frontend gating (already in place — no code change needed):
- [TrafficCountLayer.tsx:38](../src/components/mapping/TrafficCountLayer.tsx#L38) — `canConsumeQuota = hasPermission('can_consume_traffic_quota')`
- All four spend buttons render as empty / unmount when `canConsumeQuota` is false: per-segment Fetch button, Retry button, Advanced-options button, "Load AADT for Visible Area" button
- Non-admin/non-broker_full users see the polylines + cached AADT pills only — no path to spend money

**Server-side note:** the edge function still only checks JWT validity via `requireAuth`. A user without `can_consume_traffic_quota` who crafted a direct call could still hit the function. Defense-in-depth permission check on the server is a TODO (see "Open follow-ups" below).

---

## 11. Car-icon AADT pill (UX improvement)

Replaced the previous transparent-marker + floating-text label with an `AdvancedMarkerElement`-based pill:

- White background, 2px colored border matching the polyline (green/yellow/orange/red by AADT level)
- Material Design `directions_car` SVG icon (16×16, `#002147` deep midnight blue)
- AADT number formatted as `29k` for ≥1000 or exact (e.g., `847`)
- 13px bold font, drop shadow for legibility against the map
- `pointer-events: none` so clicks pass through to the underlying polyline (preserving click-to-fetch)
- Anchors at the segment midpoint, floats above the road like a label

[src/components/mapping/TrafficCountLayer.tsx:120-160](../src/components/mapping/TrafficCountLayer.tsx#L120-L160)

---

## 12. Viewport guard fixes (bbox-too-small + stale snapshot)

Two related bugs were causing "Edge Function returned a non-2xx status code" errors when zooming:

### Stale boundsSnapshot
`handleLoadAadt` (the bulk "Load AADT for Visible Area" button) was using `boundsSnapshot` — a snapshot taken **once** when the layer first activated and never refreshed. Zooming after layer activation caused the bulk-load to query StreetLight with the *original* (much larger) bounds. **Fix:** always use `getMapBounds()` (current viewport); removed `boundsSnapshot` state entirely.

[TrafficCountLayer.tsx:444-456](../src/components/mapping/TrafficCountLayer.tsx#L444-L456)

### Bbox too small at extreme zoom
`isSafeToQuery` only checked the *upper* bound. When users zoomed in past ~zoom 19, the bbox was tiny enough that StreetLight rejected the polygon with a 4xx, which (combined with a substring-match bug, see #13) surfaced as a 500 to the client. **Fix:** added MAX_ZOOM = 19 and a 0.0005° (~50m) minimum lat/lng diff. Below that, the API call is skipped entirely.

When the auto-load on map-idle short-circuits because the bbox isn't safe, it now also calls `clearError()` so a stale error doesn't linger. The legend tells the user *why*: "Zoom in to street level…" or "Zoom out a bit…".

[TrafficCountLayer.tsx:181-194](../src/components/mapping/TrafficCountLayer.tsx#L181-L194)
[TrafficCountLayer.tsx:241-244](../src/components/mapping/TrafficCountLayer.tsx#L241-L244)
[TrafficCountLayer.tsx:510-516](../src/components/mapping/TrafficCountLayer.tsx#L510-L516)

The "Load AADT for Visible Area" button is also disabled (with tooltip) when the current viewport isn't safe to query — feedback before clicking, not after.

[TrafficCountLayer.tsx:528-552](../src/components/mapping/TrafficCountLayer.tsx#L528-L552)

---

## 13. Substring-match fix for StreetLight 4xx errors (server)

The catch block in [supabase/functions/streetlight/index.ts](../supabase/functions/streetlight/index.ts) was deciding 400 vs 500 based on:

```ts
message.includes('too large') || message.includes('StreetLight error')
```

But `slFetch` throws `"StreetLight API error N: …"` (note: "API error", not "error"). So all `slFetch`-thrown errors fell through to status 500, which the supabase-js client surfaces as the unhelpful "Edge Function returned a non-2xx status code." **Fix:** broaden the substring check to `message.includes('StreetLight')` so both `slFetch` HTTP errors AND `handleGeometry`'s "StreetLight error: …" both return 400 with the original message intact.

Source-only change (not yet deployed; the frontend bbox guard makes this a defense-in-depth fix that won't be exercised in normal use).

[supabase/functions/streetlight/index.ts:729](../supabase/functions/streetlight/index.ts#L729)

---

## Edge function deploy timeline

| Version | What changed |
|---------|--------------|
| v22 | Auth restored; year fallback (2024→2023→2022); cache lookup uses correct day_type/day_part values, no year filter |
| v23 | Free-retry logic via `streetlight_usage_log.checked_segment_ids` overlap check |
| v24 | 429 retry-with-backoff in `slFetch`; 1.1s pause between year-fallback attempts |
| v25 | `dateSpec.day_part` / `dateSpec.direction` honored in API call AND cache lookup; default day_part was `-10` |
| v26 | Reverted day_part default to `'all'` after SATC rejected `-10` with "Day part as an hour must be between 0 and 23"; dropdown now offers `'all'` + single hours `6..20`. **(Currently deployed)** |
| _source-only_ | Substring-match fix for StreetLight 4xx errors (#13) — pending next deploy |

All deploys via `mcp__supabase__deploy_edge_function`. Function ID `ab6e7966-4eb7-4626-9f8a-be679349d608`.

---

## Open follow-ups

- **Server-side permission check.** `requireAuth` validates the JWT but doesn't check `can_consume_traffic_quota`. A determined user with view-only access could craft a direct call. ~5 lines to fix on the server.
- **Edge function deploy** for the substring-match fix (#13) — ride-along on the next change.
- **Recoup historical billings.** Three v21-era billings (segments `2896675860000004`, `6278995880000001`, and one of the `2896675860000001` calls) paid for segments where StreetLight returned no data, with no cache row to show. Free-retry logic (#4) means they retry without charge, but the original $1.50 is sunk.

---

## Net effect on user

- No more double-billing for segments already cached
- No more billing when StreetLight has no data for a year (year-fallback fails cleanly)
- Historical "paid for nothing" segments (gray) get a free retry — won't be charged again whether StreetLight returns data this time or not
- 429 rate-limit errors auto-recover instead of failing the click
- Advanced day_part / direction options actually work now
- Visual distinction between cached, paid-but-empty, and never-queried segments
- Spend buttons hidden entirely from non-admin / non-broker_full users — no way to accidentally trigger a charge
- Larger, more readable car-icon pill at each cached segment's midpoint
- Zooming in/out no longer produces cryptic "non-2xx" errors — viewport-guard message tells the user what to do
