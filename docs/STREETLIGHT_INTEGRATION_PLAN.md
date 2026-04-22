# StreetLight Advanced Traffic Counts (SATC) API — Integration Plan

**Status:** Planning — ready for review before implementation
**Last Updated:** 2026-04-22
**Owner:** mike@oculusrep.com
**Scope:** Integrate StreetLight SATC API into the OVIS mapping tool with strict quota guardrails, full caching, usage monitoring, and a permission-gated rollout (admin-only during testing).

---

## 1. The Critical Constraint

**Quota: 10,000 segments per year at $5,000/year = $0.50 per segment.** This is the single most important fact shaping every decision below.

Confirmed billing behavior (from StreetLight docs + user notes):
- Only the `/metrics` endpoint bills.
- Each **row** in a `/metrics` response = 1 segment from quota.
- **Repeat queries for the same segment still bill.** StreetLight does no dedup on their side.
- `/geometry`, `/segmentcount`, `/date_ranges`, `/usage` are free.
- Quota formula when you add dimensions: `segments × months × day_types × day_parts`. We will pin to one canonical spec to keep cost predictable.

**Implication:** caching is not an optimization, it's a survival requirement. A careless viewport pan over a dense metro could burn 500 segments in seconds at $250. Every `/metrics` call must be gated, logged, and attributed to a user.

---

## 2. Design Goals

1. **Never pay twice for the same segment** — permanent Postgres cache keyed on StreetLight `segment_id`.
2. **Separate "viewing the map" from "spending money"** — the free `/geometry` endpoint populates a catalog of segments (shape only, no AADT). Users see road geometries for free; AADT data loads only for segments we've already paid for, or when a user with spend permission explicitly requests it.
3. **Preview cost before spending it** — always call `/segmentcount` first and show a confirmation dialog with exact segment count.
4. **Org-wide hard ceiling** — stop all spending at a configurable threshold (default 95%, i.e. 9,500 segments).
5. **Per-user soft limits** — prevent a single user from burning the whole org budget in one session.
6. **Full audit trail** — every `/metrics` call recorded with user, timestamp, segments burned, polygon, date spec.
7. **Permission-gated rollout** — admin-only during testing; fine-grained permissions for view vs. spend when rolling out to brokers.
8. **Live usage dashboard** — current quota used/remaining, sourced from StreetLight `/usage` endpoint plus our local audit log.

---

## 3. Architecture

Two-tier cache model.

```
   User pans map
       │
       ▼
  ┌────────────────────┐   no, not cached    ┌──────────────────────┐
  │ segments in view?  │ ──────────────────▶ │ /geometry (FREE)     │
  │  (PostGIS query)   │                     │ upsert into catalog  │
  └──────┬─────────────┘                     └──────────────────────┘
         │ yes
         ▼
  ┌────────────────────┐
  │ render geometries  │   ← gray lines for segments without AADT
  └──────┬─────────────┘
         │
         │ user clicks "Load AADT for visible area"
         │ (requires can_consume_traffic_quota permission)
         ▼
  ┌────────────────────┐   uncached subset   ┌──────────────────────┐
  │ diff cache vs view │ ──────────────────▶ │ /segmentcount (FREE) │
  └──────┬─────────────┘                     │ preview cost         │
         │                                   └──────────┬───────────┘
         │                                              │
         │                                              ▼
         │                                   ┌──────────────────────┐
         │                                   │ confirm modal:       │
         │                                   │ "This will spend N   │
         │                                   │  of your quota"      │
         │                                   └──────────┬───────────┘
         │                                              │ confirm
         ▼                                              ▼
  ┌────────────────────┐                     ┌──────────────────────┐
  │ render colored     │ ◀────── upsert ──── │ /metrics (BILLABLE)  │
  │ segments w/ AADT   │                     │ log usage row        │
  └────────────────────┘                     └──────────────────────┘
```

---

## 4. Database Schema

All tables live in the existing Supabase Postgres. Use PostGIS (already in the existing plan).

```sql
-- 4.1  Segment catalog (populated from FREE /geometry endpoint)
CREATE TABLE streetlight_segment (
  segment_id        BIGINT PRIMARY KEY,              -- StreetLight stable ID
  osm_id            BIGINT,
  road_name         TEXT,
  road_number       TEXT,
  road_type         TEXT,                            -- 'interstate' | 'us_route' | 'state_route' | 'local'
  state             TEXT,
  county            TEXT,
  city              TEXT,
  geom              GEOMETRY(LINESTRING, 4326) NOT NULL,
  first_seen_at     TIMESTAMPTZ DEFAULT now(),
  last_refreshed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_streetlight_segment_geom ON streetlight_segment USING GIST (geom);
CREATE INDEX idx_streetlight_segment_state ON streetlight_segment (state);

-- 4.2  AADT metrics cache (populated from BILLABLE /metrics endpoint)
-- Compound key: we pin to one (year_month, day_type, day_part) spec per segment.
-- If we later want a second spec, we pay for it once and it becomes a new row.
CREATE TABLE streetlight_segment_metrics (
  segment_id   BIGINT NOT NULL REFERENCES streetlight_segment(segment_id) ON DELETE CASCADE,
  year_month   TEXT   NOT NULL,                      -- e.g. '2024-annual'
  day_type     TEXT   NOT NULL DEFAULT 'all_days',
  day_part     TEXT   NOT NULL DEFAULT 'all_day',
  aadt         INTEGER NOT NULL,
  trips_volume INTEGER,
  vmt          DECIMAL,
  vhd          DECIMAL,
  truck_pct    DECIMAL(5,2),
  raw          JSONB,                                -- full row for future fields
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_by   UUID REFERENCES "user"(id),
  usage_log_id UUID REFERENCES streetlight_usage_log(id),
  PRIMARY KEY (segment_id, year_month, day_type, day_part)
);
CREATE INDEX idx_streetlight_metrics_fetched ON streetlight_segment_metrics (fetched_at);

-- 4.3  Usage audit log (every /metrics call)
CREATE TABLE streetlight_usage_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES "user"(id),
  called_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  segments_requested INTEGER NOT NULL,               -- what we asked for
  segments_billed    INTEGER NOT NULL,               -- what StreetLight said was billable (is_billable=true)
  segments_new       INTEGER NOT NULL,               -- of the billed, how many were NOT already in cache
  segments_wasted    INTEGER GENERATED ALWAYS AS (segments_billed - segments_new) STORED,
  request_geometry   JSONB NOT NULL,                 -- the polygon/radius/segment list we sent
  date_spec          JSONB NOT NULL,                 -- year_month, day_type, day_part
  endpoint           TEXT NOT NULL,                  -- 'metrics' | 'metrics/paging'
  response_status    INTEGER,
  error_message      TEXT
);
CREATE INDEX idx_streetlight_usage_log_user_called ON streetlight_usage_log (user_id, called_at DESC);

-- 4.4  Per-user soft limits (null = inherit org default)
CREATE TABLE streetlight_user_limit (
  user_id               UUID PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  daily_segment_limit   INTEGER,                     -- null = use org default
  monthly_segment_limit INTEGER,
  updated_at            TIMESTAMPTZ DEFAULT now(),
  updated_by            UUID REFERENCES "user"(id)
);

-- 4.5  Org-wide quota config (single row, admin-editable)
CREATE TABLE streetlight_quota_config (
  id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  annual_segment_quota   INTEGER NOT NULL DEFAULT 10000,
  hard_stop_pct          INTEGER NOT NULL DEFAULT 95,   -- halt all /metrics calls at this %
  warning_pct            INTEGER NOT NULL DEFAULT 75,   -- banner warning
  default_daily_per_user INTEGER NOT NULL DEFAULT 200,
  contract_start_date    DATE    NOT NULL,              -- for annual reset tracking
  updated_at             TIMESTAMPTZ DEFAULT now(),
  updated_by             UUID REFERENCES "user"(id)
);
INSERT INTO streetlight_quota_config (id, contract_start_date) VALUES (1, CURRENT_DATE);
```

**Why compound-key `segment_metrics`:** if we ever want AADT for a *second* date spec (e.g. "2024 vs 2023 comparison"), we pay once and store both rows — we never re-bill for the same (segment, spec) pair.

---

## 5. Edge Function

Follow the existing pattern at [supabase/functions/esri-geoenrich/index.ts](supabase/functions/esri-geoenrich/index.ts).

### 5.1 New function: `supabase/functions/streetlight/index.ts`

Single function, multi-action body. Secret: `STREETLIGHT_API_KEY` in Supabase vault.

Actions (method dispatch via `body.action`):

| Action | StreetLight endpoint | Billable | Auth required |
|---|---|---|---|
| `segmentcount` | `POST /satc/v1/segmentcount` | No | `can_view_traffic_data` |
| `geometry` | `POST /satc/v1/geometry` | No | `can_view_traffic_data` |
| `metrics` | `POST /satc/v1/metrics` | **Yes** | `can_consume_traffic_quota` |
| `usage` | `GET /satc/v1/usage` | No | `can_view_traffic_data` |
| `date_ranges` | `POST /satc/v1/date_ranges` | No | `can_view_traffic_data` |

### 5.2 Server-side guardrails inside the `metrics` action

Every `/metrics` call runs through this gauntlet *before* hitting StreetLight:

1. **Auth check** — verify Supabase JWT, load user, confirm `can_consume_traffic_quota = true`. Reject 403 otherwise.
2. **Org hard stop** — read `streetlight_quota_config`. If `year_to_date_billed >= annual_segment_quota * hard_stop_pct / 100`, reject 429 with remaining count.
3. **Per-user daily check** — sum `streetlight_usage_log.segments_billed` for this user in last 24h. If `>= daily_limit`, reject 429.
4. **Pre-flight segmentcount** — server calls `/segmentcount` on the same geometry. If expected > some ceiling (e.g. 500 or per-user remaining daily), reject with the count so the client can show a tighter confirmation.
5. **Cache diff** — query `streetlight_segment_metrics` for existing (segment_id, date_spec) pairs in this geometry. If all cached, skip the API call entirely and return cached rows.
6. **Call `/metrics`** for only the missing segment IDs.
7. **Atomic transaction** — upsert rows into `streetlight_segment_metrics` + insert row into `streetlight_usage_log`. Both or neither.
8. **Return combined result** — cached + newly-fetched merged.

Every step is logged. Failed calls also get a usage log row with `error_message` and `segments_billed = 0` for audit.

### 5.3 Geometry action caching

`/geometry` is free, but calling it on every map pan is still wasteful. On the server:
- After calling `/geometry`, upsert returned segments into `streetlight_segment` by `segment_id`.
- On next call for an overlapping viewport, return segments from PostGIS (spatial query `ST_Intersects`) plus only fetch geometry for *new* tiles we haven't catalogued.
- Use an H3 or quadkey tile scheme on the client to track "I've already fetched geometry for this tile" (localStorage or a small `streetlight_geometry_tile_fetched` table).

---

## 6. Permission Design

Slot into the existing `PERMISSION_DEFINITIONS` registry at [src/types/permissions.ts](src/types/permissions.ts).

Add three permission keys under a new category `traffic_data`:

```typescript
{
  key: 'can_view_traffic_data',
  label: 'View traffic data',
  description: 'See road geometries and cached AADT values on the map. Does not consume quota.',
  category: PermissionCategory.traffic_data,
  defaultValue: false,
},
{
  key: 'can_consume_traffic_quota',
  label: 'Fetch new traffic data (spends quota)',
  description: 'Trigger /metrics API calls that consume StreetLight segment quota ($0.50/segment).',
  category: PermissionCategory.traffic_data,
  defaultValue: false,
},
{
  key: 'can_admin_traffic_quota',
  label: 'Manage traffic quota & audit log',
  description: 'View usage dashboard, set per-user limits, adjust org quota config.',
  category: PermissionCategory.traffic_data,
  defaultValue: false,
}
```

**Rollout phases:**

| Phase | Who has `can_view` | Who has `can_consume` | Who has `can_admin` |
|---|---|---|---|
| Testing | admin only | admin only | admin only |
| Internal preview | admin, power users | admin only | admin only |
| GA | broker, broker_limited, admin | selected brokers (per-user grant) | admin only |

During testing the UI will simply be invisible to non-admins — no banner, no hint. The existing Navbar pattern (`{hasPermission('can_view_traffic_data') && <NavLink>}`) handles this cleanly.

---

## 7. Monitoring Dashboard

New admin page: `/admin/traffic-quota` — permission-gated on `can_admin_traffic_quota`.

**Top cards (live):**
- Quota used / remaining (from `/usage` endpoint, source of truth; refreshed on page load + 60s poll)
- $ spent year-to-date / $ remaining
- % used with color bar (green < 75%, yellow 75–95%, red > 95%)
- Days until contract renewal
- "Wasted" count — segments billed that were already in cache (should be 0 if caching works; non-zero means a bug)

**Usage log table:**
- Columns: timestamp, user, segments billed, segments new, segments wasted, geometry (preview), date spec, status
- Filterable by user, date range, status
- Clicking a row → map popup showing the polygon that was queried

**Per-user table:**
- User, daily limit, monthly limit, 24h usage, 30d usage, inline edit daily/monthly limits

**Config panel:**
- Annual quota (editable in case of contract bump)
- Hard stop %
- Warning %
- Default per-user daily limit

**Segment cache stats:**
- Total segments in catalog (free)
- Total segments with AADT in cache (billed)
- Segments by state
- Oldest AADT fetch date (for refresh planning)

---

## 8. Client-Side Integration

### 8.1 New hook: `src/hooks/useStreetLightTraffic.ts`

Mirrors the [src/hooks/usePropertyGeoenrichment.ts](src/hooks/usePropertyGeoenrichment.ts) pattern.

```typescript
interface UseStreetLightTraffic {
  // Free: populate geometry catalog for viewport
  loadGeometry: (bounds: LatLngBounds) => Promise<SegmentGeometry[]>;

  // Free: preview cost before any spend
  previewCost: (bounds: LatLngBounds) => Promise<{ segmentCount: number; alreadyCached: number; newSpend: number }>;

  // Billable: gated by can_consume_traffic_quota
  loadMetrics: (bounds: LatLngBounds, dateSpec: DateSpec) => Promise<SegmentWithAADT[]>;

  // Free: current org/user quota status
  usageStatus: QuotaStatus | null;
}
```

### 8.2 Map layer component: `src/components/mapping/TrafficCountLayer.tsx`

Registers as a new entry in the existing layer management system ([src/hooks/useMapLayers.ts](src/hooks/useMapLayers.ts)).

Behaviors:
- On toggle on → `loadGeometry` for current viewport. Renders all segments as thin gray polylines.
- Segments that have cached AADT → colored per `colorScheme`.
- Segments without cached AADT → stay gray.
- Legend shows "X of Y segments have AADT data. [Load AADT for visible area]" button (only rendered if user has `can_consume_traffic_quota`).
- Clicking the button → `previewCost` → confirmation modal:
  > **"This will spend 47 segments of your organization's annual quota ($23.50).**
  > 47 segments visible, 0 already cached.
  > Remaining annual quota: 8,920 / 10,000 segments.
  > [Cancel] [Spend 47 segments]"
- On confirm → `loadMetrics` → segments colorize.

### 8.3 Quota banner

When `usageStatus.pct_used >= warning_pct`, show a persistent banner on the map page for admins and users with `can_consume_traffic_quota`:
> "⚠ Traffic data quota 78% used (7,800 of 10,000 segments). $1,100 remaining."

When `>= hard_stop_pct`, banner becomes red and the "Load AADT" button is disabled.

---

## 9. Guardrails Summary

| Guardrail | Layer | What it prevents |
|---|---|---|
| Permission gate | Frontend + edge function | Non-authorized users calling the API at all |
| Org hard stop at 95% | Edge function | Running out of quota before renewal |
| Per-user daily limit | Edge function | One user draining the whole budget |
| Pre-flight `/segmentcount` preview | Edge function + UI | Surprise spend; user confirms exact count |
| Cache-first dedup | Edge function | Paying twice for same (segment, date spec) |
| Atomic log+cache upsert | Edge function | Log and cache going out of sync |
| Wasted-segment counter | Dashboard | Detecting cache bugs that cause rebilling |
| Confirm-modal on every spend | Frontend | Accidental button clicks |
| Admin-only during testing | Permission defaults | Discovery of bugs in production before broker rollout |

---

## 10. Phased Implementation

### Phase 1 — Foundation & admin-only testing (est. 1 week)
- [ ] Migrations for 5 tables above
- [ ] Edge function `streetlight/index.ts` with all 5 actions + guardrails
- [ ] Add `traffic_data` permission category + 3 permission keys to [src/types/permissions.ts](src/types/permissions.ts)
- [ ] Seed admin role with all three permissions; all other roles get none
- [ ] `useStreetLightTraffic` hook
- [ ] `TrafficCountLayer` map layer component registered into existing layer system
- [ ] Confirmation modal
- [ ] Basic `/admin/traffic-quota` page with usage cards + log table

### Phase 2 — Monitoring polish (est. 3 days)
- [ ] Per-user limits UI
- [ ] Cache stats tab on admin page
- [ ] Quota banner on map page
- [ ] `/usage` endpoint background sync (cron) to detect drift between our log and StreetLight's ledger
- [ ] Slack/email alert at 75% and 95%

### Phase 3 — Internal preview (est. 1 week after Phase 1)
- [ ] Grant `can_view_traffic_data` to select internal users (view cached data only)
- [ ] Keep `can_consume_traffic_quota` admin-only
- [ ] Gather feedback on UX, color scheme, filters

### Phase 4 — Broker rollout (after sign-off)
- [ ] Grant `can_view_traffic_data` broadly
- [ ] Grant `can_consume_traffic_quota` per-user via admin UI (not role-wide)
- [ ] Add "Request access to load new traffic data" button for users without spend permission — creates a task for an admin

---

## 11. Open Questions (confirm before Phase 1)

1. **Exact auth header** — is it `x-api-key: <key>` or `Authorization: Bearer <key>`? Check the authenticated docs you have access to.
2. **Date spec to pin to** — recommend "most recent full year, all_days, all_day." Confirm the exact `year_month` string StreetLight expects.
3. **Does `/geometry` truly cost zero segments?** — public docs strongly imply yes, and the StreetLight note you shared confirms only `/metrics` counts. First production call, check `/usage` before and after to verify no silent charge.
4. **Rate limits** — per-minute/hour limits on free endpoints? Assume conservative client throttling (e.g. max 1 `/geometry` call per 2 seconds) until confirmed.
5. **Should we expose custom date specs to end users?** — recommend no for Phase 1. Each new spec for a segment is another $0.50. Fix one canonical spec.
6. **Coverage areas** — StreetLight covers US + Canada; do we want any geographic gate (e.g. bail out if bounds are outside North America)?
7. **Geographic prefetch strategy** — would it be cheaper to bulk-catalog segments (free `/geometry`) for the states we actually work in, ahead of user demand, so the map is always responsive? Yes, probably — but not a blocker for Phase 1.

---

## 12. Related

- Existing broader plan (covers multi-source strategy, DOT free data): [docs/TRAFFIC_COUNT_OVERLAY_PLAN.md](docs/TRAFFIC_COUNT_OVERLAY_PLAN.md)
- Edge function pattern reference: [supabase/functions/esri-geoenrich/index.ts](supabase/functions/esri-geoenrich/index.ts)
- Permission registry: [src/types/permissions.ts](src/types/permissions.ts)
- Permission hook: [src/hooks/usePermissions.tsx](src/hooks/usePermissions.tsx)
- Map layer service: [src/services/mapLayerService.ts](src/services/mapLayerService.ts)
- StreetLight Segment Quota Usage: https://developer.streetlightdata.com/docs/segment-quota-usage
- StreetLight Defining Geometry: https://developer.streetlightdata.com/docs/defining-geometry
