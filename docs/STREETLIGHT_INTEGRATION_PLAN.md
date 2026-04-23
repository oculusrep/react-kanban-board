# StreetLight Advanced Traffic Counts (SATC) API — Integration Plan

**Status:** Planning — ready for review before implementation
**Last Updated:** 2026-04-23
**Owner:** mike@oculusrep.com
**Scope:** Integrate StreetLight SATC API into the OVIS mapping tool with strict quota guardrails, permanent caching, per-segment user-opt-in for every spend, usage monitoring, and a permission-gated rollout (admin-only during testing).

**What changed 2026-04-23 (vs. initial draft):**
- Spend flow is now **per-segment opt-in**. The confirmation modal lists each candidate segment with its own checkbox; all default **unchecked**. No "fetch everything in this polygon" shortcut. (§8.2a)
- Segments are classified into **three buckets** for the modal: `up-to-date`, `stale` (cached but newer data available), `never queried`. Stale explicitly surfaces the "paying again for this segment, different date" case. (§5.2, §8.2a)
- Server flow split into **two actions**: a free `classify` action that drives the modal, and the billable `metrics` action that runs only after user curation. (§5.1, §5.2)
- Audit log gains a per-segment breakdown table (`streetlight_usage_log_segment`) with `update_reason ∈ {new, refresh, different_daypart}` so the dashboard can show "spent 340 on refreshes, 210 on new data this month." (§4.3)
- Server-side **race re-verification** before every `/metrics` call: final spend can only shrink vs. what the user saw in the modal, never grow. (§5.2)

---

## 1. The Critical Constraint

**Quota: 10,000 segments per year at $5,000/year = $0.50 per segment.** This is the single most important fact shaping every decision below.

Confirmed billing behavior (from StreetLight docs + user notes):
- Only the `/metrics` endpoint bills.
- Each **row** in a `/metrics` response = 1 segment from quota.
- **Repeat queries for the same segment still bill.** StreetLight does no dedup on their side.
- `/geometry`, `/segmentcount`, `/date_ranges`, `/usage` are free.
- Quota formula when dimensions are added: `segments × months × day_types × day_parts`. We pin to one canonical spec to keep cost predictable.

**Implication:** caching is not an optimization, it's a survival requirement. A careless viewport pan over a dense metro could burn 500 segments in seconds at $250. Every `/metrics` call must be gated, logged, per-segment opt-in, and attributed to a user.

---

## 2. Design Goals

1. **Never pay twice for the same (segment, date spec)** — permanent Postgres cache keyed on StreetLight `segment_id` + date spec. Exact-spec repeats are served from cache. Different specs (e.g. newer year) require explicit per-segment opt-in.
2. **Separate "viewing the map" from "spending money"** — the free `/geometry` endpoint populates a catalog of segments (shape only). Users see road geometries for free; AADT data loads only for segments we've already paid for, or when a user with spend permission explicitly ticks a checkbox.
3. **Per-segment opt-in for every spend** — confirmation modal lists each candidate segment with its own checkbox. All default **unchecked**. No accidental spend is possible.
4. **Warn when refreshing cached data** — if a segment has cached AADT but a newer spec is available, the modal surfaces it as a "refresh" row, not a "new" row, so the user sees they'd be paying a second time for that segment.
5. **Preview cost before spending it** — running cost total updates live as the user checks/unchecks. Shows remaining annual quota after the proposed spend.
6. **Org-wide hard ceiling** — stop all spending at a configurable threshold (default 95%, i.e. 9,500 segments).
7. **Per-user soft limits** — prevent a single user from burning the whole org budget in one session.
8. **Full audit trail with update_reason** — every `/metrics` call recorded with user, timestamp, segments burned, polygon, date spec, and per-segment reason (`new` / `refresh` / `different_daypart`).
9. **Permission-gated rollout** — admin-only during testing; fine-grained permissions for view vs. spend when rolling out to brokers.
10. **Live usage dashboard** — quota used/remaining (from `/usage` endpoint + local log), with new-vs-refresh spend split so we can judge over time whether refreshing stale data is worth it.

---

## 3. Architecture

Two-tier cache model + per-segment opt-in at spend time.

```
   User pans map
       │
       ▼
  ┌──────────────────────┐  not cataloged   ┌──────────────────────┐
  │ segments in view?    │ ───────────────▶ │ /geometry (FREE)     │
  │ (PostGIS query)      │                  │ upsert into catalog  │
  └──────┬───────────────┘                  └──────────────────────┘
         │ yes
         ▼
  ┌──────────────────────┐
  │ render geometries    │   ← gray lines for segments without AADT
  │ colorize cached AADT │
  └──────┬───────────────┘
         │
         │ user clicks "Load AADT for visible area"
         │ (requires can_consume_traffic_quota permission)
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ PRE-FLIGHT (all FREE endpoints)                             │
  │  • /segmentcount  → total segments in polygon               │
  │  • /date_ranges   → latest spec available per segment       │
  │  • local cache    → what spec (if any) we already have      │
  └──────┬──────────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ CLASSIFY each segment into 3 buckets:                       │
  │  1. up-to-date  (cached spec == latest available)    FREE   │
  │  2. stale       (cached older than latest available) $0.50  │
  │  3. never queried                                    $0.50  │
  └──────┬──────────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ MODAL — per-segment checkboxes, default UNCHECKED           │
  │  • up-to-date group collapsed (nothing to decide)           │
  │  • stale group: expanded list, sortable, per-seg checkbox   │
  │  • new group: expanded list, per-seg checkbox               │
  │  • live cost tally updates as user checks                   │
  └──────┬──────────────────────────────────────────────────────┘
         │ user confirms (e.g. 23 of 70 checked)
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ SERVER re-verifies checked segment_ids against cache        │
  │ (race safety) and enforces org hard stop + per-user limits  │
  └──────┬──────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────┐                  ┌──────────────────────┐
  │ render colored       │ ◀── upsert ───── │ /metrics (BILLABLE)  │
  │ segments w/ new AADT │                  │ log usage + reason   │
  └──────────────────────┘                  └──────────────────────┘
```

---

## 4. Database Schema

All tables live in the existing Supabase Postgres. Uses PostGIS.

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
-- Compound key: one row per (segment, date spec). Never re-billed for same key.
-- Multiple rows per segment_id are allowed — each represents a paid-for spec.
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

-- 4.3  Usage audit log (one row per /metrics call)
CREATE TABLE streetlight_usage_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES "user"(id),
  called_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  segments_requested INTEGER NOT NULL,               -- what the client asked for after user curation
  segments_billed    INTEGER NOT NULL,               -- what StreetLight marked is_billable=true
  segments_new       INTEGER NOT NULL,               -- billed, never seen before
  segments_refresh   INTEGER NOT NULL DEFAULT 0,     -- billed, already have cache row for different spec
  segments_wasted    INTEGER GENERATED ALWAYS AS
                       (segments_billed - segments_new - segments_refresh) STORED,
  request_geometry   JSONB NOT NULL,                 -- polygon/radius we sent
  checked_segment_ids BIGINT[] NOT NULL,             -- exact IDs user opted into (modal checkboxes)
  date_spec          JSONB NOT NULL,                 -- year_month, day_type, day_part
  endpoint           TEXT NOT NULL,                  -- 'metrics' | 'metrics/paging'
  response_status    INTEGER,
  error_message      TEXT
);
CREATE INDEX idx_streetlight_usage_log_user_called ON streetlight_usage_log (user_id, called_at DESC);

-- 4.3b  Per-segment breakdown of each usage log row
-- Enables dashboard splits ("340 refresh vs 210 new this month") and per-call drill-down.
CREATE TABLE streetlight_usage_log_segment (
  usage_log_id  UUID   NOT NULL REFERENCES streetlight_usage_log(id) ON DELETE CASCADE,
  segment_id    BIGINT NOT NULL,
  update_reason TEXT   NOT NULL CHECK (update_reason IN ('new', 'refresh', 'different_daypart')),
  prior_spec    JSONB,                               -- if refresh: what did we already have?
  new_spec      JSONB NOT NULL,                      -- what did we just buy?
  aadt          INTEGER,
  PRIMARY KEY (usage_log_id, segment_id)
);
CREATE INDEX idx_usage_log_segment_reason ON streetlight_usage_log_segment (update_reason);

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

Actions (dispatch via `body.action`):

| Action | StreetLight endpoints used | Billable | Auth required |
|---|---|---|---|
| `segmentcount` | `POST /satc/v1/segmentcount` | No | `can_view_traffic_data` |
| `geometry` | `POST /satc/v1/geometry` | No | `can_view_traffic_data` |
| `classify` | `/geometry` + `/date_ranges` + local cache (composite) | No | `can_consume_traffic_quota` |
| `metrics` | `POST /satc/v1/metrics` (exact checked IDs only) | **Yes** | `can_consume_traffic_quota` |
| `usage` | `GET /satc/v1/usage` | No | `can_view_traffic_data` |
| `date_ranges` | `POST /satc/v1/date_ranges` | No | `can_view_traffic_data` |

### 5.2 Server-side gauntlet — two-phase flow

The spend flow is split into two server calls:

**Phase A: `classify` action (FREE)** — called when the user clicks "Load AADT for visible area." Returns per-segment classification data for the modal. No billable calls.

1. **Auth check** — verify Supabase JWT, load user, confirm `can_consume_traffic_quota = true`. Reject 403 otherwise.
2. **Call `/geometry`** for the polygon (unless all segments are already in our catalog). Upsert results into `streetlight_segment`.
3. **Call `/date_ranges`** for the full segment list. Tells us the latest `(year_month, day_type, day_part)` available per segment.
4. **Cache lookup** — for each segment, find the "freshest" cached spec in `streetlight_segment_metrics`.
5. **Classify into three buckets:**
   - `up_to_date`: cached spec == latest available. No action needed.
   - `stale`: we have a cached spec, but a newer one exists. Would cost $0.50 to refresh.
   - `new`: no cache row at all. Would cost $0.50 to fetch.
6. **Return** classified segment list with cached AADT values (so the modal can show what we already have).

**Phase B: `metrics` action (BILLABLE)** — called after user curates checkboxes and confirms. Body includes the exact `checked_segment_ids` array.

1. **Auth check** — as above.
2. **Org hard stop** — read `streetlight_quota_config`. If `year_to_date_billed + len(checked_segment_ids) > annual_segment_quota * hard_stop_pct / 100`, reject 429.
3. **Per-user daily check** — sum `streetlight_usage_log.segments_billed` for this user in last 24h + this request. If it would exceed `daily_limit`, reject 429.
4. **Race re-verification** — re-run the cache diff for just the `checked_segment_ids`. If any were fetched by another user in the window between modal open and confirm, drop them from the list. **Final spend can only shrink, never grow, relative to what the user saw.**
5. **Per-segment reason classification** — for each remaining segment ID, label `new` / `refresh` / `different_daypart` based on cache state.
6. **Call `/metrics`** with the final segment IDs and the pinned canonical date spec.
7. **Atomic transaction** — insert one `streetlight_usage_log` row, N `streetlight_usage_log_segment` rows (one per segment with `update_reason` + prior/new spec), and upsert N rows into `streetlight_segment_metrics`. All or nothing.
8. **Return** combined result (cached + newly-fetched).

Every call logged. Failed `/metrics` calls still get a usage log row with `error_message`, `segments_billed = 0`, `segments_new = 0`, `segments_refresh = 0` — so we can audit zero-cost failures.

### 5.3 Geometry action caching

`/geometry` is free, but calling it on every map pan is still wasteful. On the server:
- After calling `/geometry`, upsert returned segments into `streetlight_segment` by `segment_id`.
- On next call for an overlapping viewport, return segments from PostGIS (`ST_Intersects`) and only fetch geometry for *new* tiles we haven't catalogued.
- Use H3 or quadkey tile scheme on the client to track "already fetched geometry for this tile" (localStorage or a small `streetlight_geometry_tile_fetched` table).

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

During testing the UI is invisible to non-admins — no banner, no hint. Existing Navbar pattern (`{hasPermission('can_view_traffic_data') && <NavLink>}`) handles this.

---

## 7. Monitoring Dashboard

New admin page: `/admin/traffic-quota` — permission-gated on `can_admin_traffic_quota`.

**Top cards (live):**
- Quota used / remaining (from `/usage` endpoint, source of truth; refreshed on page load + 60s poll)
- $ spent year-to-date / $ remaining
- % used with color bar (green < 75%, yellow 75–95%, red > 95%)
- Days until contract renewal
- **New vs refresh split** — "Of 3,200 segments spent YTD: 2,100 new / 1,050 refresh / 50 wasted." Lets us judge whether refreshing stale data is worth it.
- "Wasted" count — segments billed that were already in cache for the exact same spec (should be 0; non-zero means a cache bug).

**Usage log table:**
- Columns: timestamp, user, segments billed, new, refresh, wasted, geometry (preview), date spec, status
- Filterable by user, date range, status, update_reason
- Clicking a row → map popup showing the polygon + expandable per-segment breakdown (`streetlight_usage_log_segment` rows: segment ID, reason, prior spec, new spec)

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
- Segments with multiple date specs cached (the ones we've refreshed at least once)
- Oldest AADT fetch date (for refresh planning)

---

## 8. Client-Side Integration

### 8.1 New hook: `src/hooks/useStreetLightTraffic.ts`

Mirrors the [src/hooks/usePropertyGeoenrichment.ts](src/hooks/usePropertyGeoenrichment.ts) pattern.

```typescript
interface UseStreetLightTraffic {
  // FREE: populate geometry catalog for viewport
  loadGeometry: (bounds: LatLngBounds) => Promise<SegmentGeometry[]>;

  // FREE: per-segment classification for the spend modal
  classifySegments: (bounds: LatLngBounds) => Promise<ClassifiedSegment[]>;

  // BILLABLE: gated by can_consume_traffic_quota; exact IDs only
  fetchMetrics: (checkedSegmentIds: number[]) => Promise<SegmentWithAADT[]>;

  // FREE: current org/user quota status (from /usage + local log)
  usageStatus: QuotaStatus | null;
}

interface ClassifiedSegment {
  segmentId: number;
  roadName: string;
  roadNumber?: string;
  roadType: 'interstate' | 'us_route' | 'state_route' | 'local';
  status: 'up_to_date' | 'stale' | 'new';
  cachedSpec?: DateSpec;       // only if status !== 'new'
  cachedAadt?: number;         // only if status !== 'new'
  cachedYear?: string;         // for display: "2023"
  latestAvailableSpec: DateSpec;
  latestAvailableYear: string; // for display: "2024"
}
```

### 8.2 Map layer component: `src/components/mapping/TrafficCountLayer.tsx`

Registers as a new entry in the existing layer management system ([src/hooks/useMapLayers.ts](src/hooks/useMapLayers.ts)).

**Baseline behavior (no spend):**
- On toggle on → `loadGeometry` for current viewport. Renders all segments as thin gray polylines.
- Segments with cached AADT → colored per `colorScheme`.
- Segments without cached AADT → stay gray.
- Legend shows "X of Y segments have AADT data. [Load AADT for visible area]" button (only rendered if user has `can_consume_traffic_quota`).

Clicking "Load AADT" opens the spend modal (§8.2a).

### 8.2a Spend modal — the heart of the guardrail system

Opened after `classifySegments()` returns.

```
┌─────────────────────────────────────────────────────────────┐
│ Load AADT for visible area                          [X]     │
├─────────────────────────────────────────────────────────────┤
│ 147 segments in view. Selected: 0 segments — $0.00.         │
│ Annual quota: 1,080 of 10,000 used. $4,460 remaining.       │
├─────────────────────────────────────────────────────────────┤
│ ▸ Up-to-date (74 segments)                            FREE  │
│   Already have the latest StreetLight data for these.       │
├─────────────────────────────────────────────────────────────┤
│ ▼ Refresh available (53 segments)                   $26.50  │
│   Cached an older year; newer data is available.            │
│   Sort: [▼ cached AADT desc]   Filter: [road name ▢]        │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ ☐  I-285 N    cached: 2023 (187K AADT)  → 2024      │   │
│   │ ☐  I-75 S     cached: 2023 (162K AADT)  → 2024      │   │
│   │ ☐  US-41 N    cached: 2023  (34K AADT)  → 2024      │   │
│   │ ...                                                  │   │
│   └─────────────────────────────────────────────────────┘   │
│   Quick-picks: [Select all on I-285] [Select all >100K]     │
├─────────────────────────────────────────────────────────────┤
│ ▼ Never queried (20 segments)                       $10.00  │
│   No AADT data at all for these segments.                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ ☐  GA-400 N                                         │   │
│   │ ☐  Abernathy Rd                                     │   │
│   │ ...                                                  │   │
│   └─────────────────────────────────────────────────────┘   │
│   Quick-picks: [Select all] [Select all interstate]         │
├─────────────────────────────────────────────────────────────┤
│                 [Cancel]       [Spend 0 segments ($0.00)]   │
└─────────────────────────────────────────────────────────────┘
```

**Behavioral rules:**
- All checkboxes default **unchecked** in both "Refresh available" and "Never queried" groups. No accidental spend is possible.
- "Up-to-date" group is collapsed by default — nothing to decide, just context.
- Header line updates live: `Selected: N segments. Cost: $X.XX. Remaining annual quota after spend: Y of 10,000.`
- Confirm button is **disabled** until at least one checkbox is checked.
- Confirm button label includes the final tally: `[Spend 23 segments ($11.50)]`.
- If the current selection would cross the per-user daily limit, the button disables and shows: "This would exceed your 200-segment daily limit."
- If it would cross the org hard stop, same behavior with a different message.
- `Esc` or `Cancel` closes without spending. No "are you sure" on cancel — cancel is friction-free, spend is the friction.

**Helpers for long lists:**
- Sort stale list by cached AADT descending (highest-traffic first — usually what you most want refreshed).
- Filter by road name/number substring.
- Quick-pick chips: "Select all on [road]", "Select all interstate", "Select all AADT > 100K", "Select all cached 2022 or older".
- Group sub-totals: per-road subtotal so users can think in routes rather than segments.

**Post-confirm:**
- On confirm → `fetchMetrics(checkedSegmentIds)` → server runs Phase B gauntlet (§5.2).
- Server may return fewer segments than requested (race re-verification dropped some that got cached in between). Toast: "Fetched 22 new AADT values. Remaining annual quota: 8,955."
- Newly-fetched segments colorize on the map immediately.

### 8.3 Quota banner

When `usageStatus.pct_used >= warning_pct`, show a persistent banner on the map page for admins and users with `can_consume_traffic_quota`:
> "⚠ Traffic data quota 78% used (7,800 of 10,000 segments). $1,100 remaining."

When `>= hard_stop_pct`, banner becomes red and the "Load AADT" button is disabled.

---

## 9. Guardrails Summary

| Guardrail | Layer | What it prevents |
|---|---|---|
| Permission gate | Frontend + edge function | Non-authorized users calling the API at all |
| Org hard stop at 95% | Edge function | Running out of quota before contract renewal |
| Per-user daily limit | Edge function | One user draining the whole budget |
| Free `classify` pre-flight | Edge function | Modal can show exact cost without spending |
| **Per-segment opt-in checkboxes, default unchecked** | Frontend | Any unintended spend — nothing happens without an active check |
| **Stale-vs-new bucket split in modal** | Frontend | Silently paying again for a segment we already have data for |
| **Server-side race re-verification** | Edge function | Paying for a segment another user just fetched between modal-open and confirm |
| Cache-first dedup on exact spec | Edge function | Paying twice for same (segment, date spec) |
| Atomic log + cache upsert | Edge function | Log and cache going out of sync |
| Wasted-segment counter | Dashboard | Detecting cache bugs that cause rebilling |
| New-vs-refresh dashboard split | Dashboard | Seeing over time whether refreshing stale data is worth the spend |
| Confirm button shows exact spend | Frontend | Surprise cost; user always sees `Spend N segments ($X.XX)` |
| Admin-only during testing | Permission defaults | Discovering bugs in production before broker rollout |

---

## 10. Phased Implementation

### Phase 1 — Foundation & admin-only testing (est. 1–1.5 weeks)
- [ ] Migrations for all tables in §4 (including `streetlight_usage_log_segment`)
- [ ] Edge function `streetlight/index.ts` with all 6 actions + two-phase gauntlet (§5.2)
- [ ] Add `traffic_data` permission category + 3 permission keys to [src/types/permissions.ts](src/types/permissions.ts)
- [ ] Seed admin role with all three permissions; all other roles get none
- [ ] `useStreetLightTraffic` hook with `loadGeometry`, `classifySegments`, `fetchMetrics`, `usageStatus`
- [ ] `TrafficCountLayer` map layer component registered into existing layer system
- [ ] Spend modal (§8.2a) with three-bucket UI, per-segment checkboxes, live cost counter, sort/filter/quick-picks
- [ ] Basic `/admin/traffic-quota` page with usage cards (incl. new-vs-refresh split) + log table w/ per-segment drill-down

### Phase 2 — Monitoring polish (est. 3 days)
- [ ] Per-user limits UI
- [ ] Cache stats tab on admin page
- [ ] Quota banner on map page
- [ ] `/usage` endpoint background sync (cron) to detect drift between our log and StreetLight's ledger
- [ ] Slack/email alert at 75% and 95%

### Phase 3 — Internal preview (est. 1 week after Phase 1)
- [ ] Grant `can_view_traffic_data` to select internal users (view cached data only)
- [ ] Keep `can_consume_traffic_quota` admin-only
- [ ] Gather feedback on UX, color scheme, filters, modal ergonomics

### Phase 4 — Broker rollout (after sign-off)
- [ ] Grant `can_view_traffic_data` broadly
- [ ] Grant `can_consume_traffic_quota` per-user via admin UI (not role-wide)
- [ ] Add "Request access to load new traffic data" button for users without spend permission — creates a task for an admin

---

## 11. Open Questions (confirm before Phase 1)

1. **Exact auth header** — is it `x-api-key: <key>` or `Authorization: Bearer <key>`? Check the authenticated docs.
2. **Date spec to pin to** — recommend "most recent full year, all_days, all_day." Confirm the exact `year_month` string StreetLight expects.
3. **Does `/geometry` truly cost zero segments?** — public docs imply yes; StreetLight note confirms only `/metrics` counts. First production call, check `/usage` before and after to verify no silent charge.
4. **Does `/date_ranges` truly cost zero segments?** — same verification. This is central to the classify flow being free.
5. **Rate limits** — per-minute/hour limits on free endpoints? Assume conservative client throttling (e.g. max 1 `/geometry` call per 2 seconds) until confirmed.
6. **Coverage areas** — StreetLight covers US + Canada; should we gate the UI to North America bounding boxes?
7. **Geographic prefetch strategy** — bulk-catalog segments (free `/geometry`) for states we work in, ahead of demand, so the map is always responsive? Likely yes — not a Phase 1 blocker.
8. **How many historical date specs should dashboard surface?** — if a segment has AADT cached for 2022, 2023, 2024, do we show all three in an expansion panel? Phase 2 question.

**Resolved:**
- ~~Should we expose custom date specs to end users?~~ No. Phase 1 pins one canonical spec; comparison across specs is a future feature.

---

## 12. Related

- Existing broader plan (covers multi-source strategy, DOT free data): [docs/TRAFFIC_COUNT_OVERLAY_PLAN.md](docs/TRAFFIC_COUNT_OVERLAY_PLAN.md)
- Edge function pattern reference: [supabase/functions/esri-geoenrich/index.ts](supabase/functions/esri-geoenrich/index.ts)
- Permission registry: [src/types/permissions.ts](src/types/permissions.ts)
- Permission hook: [src/hooks/usePermissions.tsx](src/hooks/usePermissions.tsx)
- Map layer service: [src/services/mapLayerService.ts](src/services/mapLayerService.ts)
- StreetLight Segment Quota Usage: https://developer.streetlightdata.com/docs/segment-quota-usage
- StreetLight Defining Geometry: https://developer.streetlightdata.com/docs/defining-geometry
- StreetLight Authentication: https://developer.streetlightdata.com/docs/authentication
