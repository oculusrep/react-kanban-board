# Tour Feature — Implementation Plan

## Goal

Let brokers stage site submits onto a **tour** (like staging to an assignment today), then
work that tour on a dedicated page: reorder stops via drag-and-drop, AI-optimize the driving
route, render the route on the map, categorize each stop (flyby, tabletop, etc.), export a
client-facing PDF, and expose saved/archived tours to accounts through the existing portal.

Most of the plumbing already exists. This doc captures the schema, the build sequence, and the
known landmines so we don't rediscover them mid-build.

## Decisions locked (2026-07-25)

- **A tour stop points at a `site_submit`** (not raw property). Reuses staging, stage colors,
  portal visibility, and the client + coordinates + economics already hanging off the submit.
- **Live follow-along v1 = location dot + highlight current/next stop.** No turn-by-turn yet.
- **Route optimization = Google Route Optimization API** (the dedicated optimizer, not
  Directions `optimizeWaypoints`). Runs server-side via a Supabase Edge Function.

## Data model

Tours are **many-to-many + ordered + categorized**, so — unlike assignment→site_submit
(a 1:many `assignment_id` FK) — this uses a join table.

```
tour
  id              uuid pk
  client_id       uuid  -> client(id)          -- RLS key; drives portal exposure & archiving
  tour_name       text  not null
  description     text
  tour_date       date                          -- optional planned date
  is_archived     bool  default false           -- archived tours stay visible to the account
  created_by_id   uuid  -> auth.users(id)
  created_at / updated_at

tour_stop
  id              uuid pk
  tour_id         uuid  -> tour(id) on delete cascade
  site_submit_id  uuid  -> site_submit(id) on delete cascade
  position        int   not null                -- drag-and-drop order (kanban pattern)
  category_id     uuid  -> tour_stop_category(id)  -- flyby / tabletop / ...
  notes           text
  created_at / updated_at
  unique (tour_id, site_submit_id)              -- a submit can't be staged twice on one tour

tour_stop_category   -- lookup table, seeded (mirrors submit_stage pattern)
  id, name, sort_order, is_active
```

`position` uses the same integer-reindex approach as [KanbanBoard.tsx](../src/components/KanbanBoard.tsx).

## RLS

Copied from the portal RLS pattern (`supabase/migrations_legacy/20260130_client_portal_rls_v3.sql`),
reusing the existing helper functions `is_internal_user()`, `can_manage_portal()`,
`portal_user_contact_id()`:

- **Internal users** (`is_internal_user()`): full read/write on `tour` and `tour_stop`.
- **Portal users**: read-only `SELECT` on `tour` / `tour_stop` scoped to clients they can access
  via `portal_user_client_access` (`is_active = TRUE`). Archived tours remain visible (accounts
  can revisit any saved tour). Portal users do not build tours in v1.
- `tour_stop_category`: readable by all authenticated.

## Build sequence

### Phase 1 — Foundation (this pass)
1. Migration: `tour`, `tour_stop`, `tour_stop_category` (seeded) + RLS + grants + `updated_at` triggers.
2. `AddToTourButton` — a drop-in, overlay-first staging control (minimal clicks: "Add to tour ▾"
   lists the client's tours + "New tour…"). Props: `siteSubmitId`, `clientId`. No `useParams`.
3. `useTours` hook — CRUD + add/remove/reorder stops.
4. Bare `ToursListPage` at `/tours` to verify staging produces real rows.

### Phase 2 — Tour page + drag-drop
- Tour detail as a **drop-in panel** (works in a slideout body per OVIS overlay-first UX), not a
  page-bound view. Reuse `@hello-pangea/dnd` for stop reordering.

### Phase 3 — Map: route line + tour layer
- New `TourLayer` (polyline from ordered stops, reuse `TrafficCountLayer` polyline pattern).
- "Tour layer" filter so brokers can pull just a tour's pins to work.
- **Landmine:** a new map layer must be registered in **two** places — the generic
  `LayerPanel.tsx` *and* the hardcoded popup in `MappingPageNew.tsx` (~`showCustomLayersMenu`).
  See [ADDING_A_SYSTEM_LAYER.md](./ADDING_A_SYSTEM_LAYER.md).

### Phase 4 — Route optimization
(Superseded in part by Phase 4.5 below — open-path optimize for days without an end address.)

**Shipped (v1):** per-day **Optimize** button on `TourMapPage` uses Google **Directions**
`optimizeWaypoints` (client-side, no backend). It reorders a day's stops for the shortest
drive, honoring any Start/End address as fixed anchors, and writes back `tour_stop.position`.

**Requires the Directions API** on the Maps key (`VITE_GOOGLE_MAPS_API_KEY`, …`DKpxHQ`). If it's
missing from the key's API-restriction list, Optimize fails with `DIRECTIONS_ROUTE: REQUEST_DENIED`
and (since Phase 4.5) the map shows a per-day "Google couldn't build the driving route (REQUEST_DENIED)" warning. Full setup +
troubleshooting: [GOOGLE_MAPS_API_SETUP.md](./GOOGLE_MAPS_API_SETUP.md).

**Future upgrade:** the dedicated Google **Route Optimization API** (`routeoptimization.googleapis.com`)
for hard constraints (day time-windows, service times, >25 stops/day, multi-day balancing).
That one needs GCP enablement + billing and a Supabase Edge Function (server-side, keeps the key
off the client) that returns ordered stops → write back to `tour_stop.position`. Also note
`DirectionsService` is deprecated (Feb 2026) in favor of the Routes API `computeRoutes` — see the
setup doc's deprecation note.

### Phase 5 — PDF export
- No PDF lib exists today. Add `@react-pdf/renderer` (designed doc) or `jspdf`+`html2canvas`
  (snapshot). Pull pertinent info straight off the staged site submits.

### Phase 6 — Live follow-along
- `navigator.geolocation.watchPosition` → location marker + highlight current/next stop.

## Applying tour migrations

`supabase db push` does **not** work in this repo — use the psql + `schema_migrations` path in
CLAUDE.md. Applied to prod: `20260725170000_tour_schema`, `20260726120000_tour_scheduling`,
`20260726160000_tour_day_endpoints`. Pending (branch `feature/tour-routing`):
`20261028165400_tour_hardening` — see Phase 4.5.

## Status (recon 2026-10-28)

All of Phases 1–4 (v1) are on `main` and live since 2026-07-26. Prod usage at recon: 4 tours,
45 stops, but only one tour ("SBUX – July 2026") had ever been scheduled into a day.

| Area | State |
|---|---|
| Schema + RLS (`tour`, `tour_stop`, `tour_day`, `tour_stop_category`) | Built. Internal = full access; portal = SELECT on clients they can access. |
| Grants | Original migrations had **no REVOKE** — `anon` inherited SELECT/INSERT/… via default privileges (RLS was the only gate). Fixed in Phase 4.5. |
| "Add to tour" | Built — `SiteSubmitSidebar`, `DealDetailsSlideout` (disabled without a site submit), `SiteSubmitDetailsPage`. New stops land Unscheduled. |
| `/tours` list, `/tours/:id` page, slideout | Built — `ToursListPage`, `TourDetailPage`, `TourDetailSlideout` → `TourDetailPanel` (days, drag between days, category, minutes, notes, start/end address). |
| `/tours/:id/map` | Built — standalone map (`TourMapPage`), not a layer on the main map. |
| Drive times / schedule | Built — Directions legs → `computeDaySchedule`. |
| Optimize | Built (v1, Directions `optimizeWaypoints`) — **was a round trip when no end address**; fixed in 4.5. |
| Tour layer on the main map (Phase 3 original) | Not started. |
| PDF export (Phase 5) | Not started — no PDF library installed. |
| Live follow-along (Phase 6) | Not started. |
| Portal tour UI | Not started — RLS allows portal reads, no page uses them. |
| Routes API / Route Optimization API | Not started. |

Issues found at recon (all addressed in 4.5 unless noted): every edit (even a keystroke in a
minutes box) re-requested Directions for every day; Optimize optimized a round trip back to
stop 1 / the start address when no end was set; >25 stops, Directions failures and
un-geocoded start/end addresses degraded silently (straight lines, "Drive n/a"); map and panel
numbered stops differently when a stop lacked coordinates; drag saves were one UPDATE per stop
(non-atomic); stale "come next" / "(Phase 3)" copy; no grants block. Still open: no editor for
the tour-level `tour_date`; `DirectionsService` deprecated (Feb 2026) → Routes API.

## Phase 4.5 — pre-11/4 hardening (branch `feature/tour-routing`)

Stays on browser-side Directions + Distance Matrix (Routes API migration is a later phase).

- **Route cache** (`src/lib/tourRouteService.ts`). Every Google call for tours goes through it.
  A day's Directions request is keyed by ordered stop ids + coords + start/end
  (`routeKey`). Supabase data reloads on every edit; Google is only called on a key change.
  Minutes, category, notes and label edits are local math. Failures are cached too (no retry
  storm); the map shows **Retry route** to clear one day's entry.
- **Traffic.** Directions only returns `duration_in_traffic` when the request has **no stopover
  waypoints** ([docs](https://developers.google.com/maps/documentation/javascript/directions)),
  so `drivingOptions` on the multi-stop call would do nothing (and bill Directions Advanced).
  Instead, when `day_date` + `start_time` is in the future, each leg gets one 1×1 Distance
  Matrix request with `departureTime` = day start (Advanced SKU), cached by route key +
  departure. Approximation: every leg uses the day-start departure, not its own clock time.
  Past or missing date/time → typical drive times, labeled as such.
- **Optimize.** End address set → Directions `optimizeWaypoints` (fixed origin + fixed end is
  correct there). No end address → one-way open path: Distance Matrix drive times (chunked to
  ≤25 destinations / ≤100 elements per request), solved in the browser by `solveOpenPath`
  (exact Held-Karp ≤13 free stops, nearest-neighbour + 2-opt + or-opt above). Origin = start
  address, else stop 1 stays first; last stop is free. Stops without coordinates go to the end.
- **Atomic saves.** Drag and Optimize write through `set_tour_stop_placements(p_tour_id,
  p_placements jsonb)` — one UPDATE, SECURITY INVOKER (RLS applies), rejects stops/days from
  another tour, all-or-nothing.
- **No silent failures.** Per-day warning box on the map for: >25 stops (no request made),
  Directions failure (status shown, no straight-line fallback), un-geocoded start/end
  address, stops with no coordinates (by number).
- **Numbering.** Every stop in a day is numbered 1..n in both the panel and the map (pins,
  schedule); stops without coordinates keep their number and show "no location".
- **12-hour display** everywhere in Tours (day start/end pickers are 15-minute selects
  labeled "9:30 AM"; arrivals, finish, map schedule). Storage unchanged (`TIME` / "HH:MM").
- **Stop names.** New nullable `tour_stop.display_label`, edited inline (✎) in the panel.
  Displayed name = label → "City · short street" from the property (e.g. "Macon · 1516 Bass
  Rd") → property name. Full site submit name shown as small gray subtext. Same name on the
  panel, map schedule and pin tooltips (`stopDisplayName` in `tourRouting.ts`).
- **Migration `20261028165400_tour_hardening`**: `display_label` column, the placements RPC
  (EXECUTE to `authenticated` only), and REVOKE + GRANT for the four tables (`tour`,
  `tour_stop`, `tour_day`: CRUD to `authenticated`; `tour_stop_category`: SELECT only; nothing
  to `anon`). Round-trip tested in a rolled-back transaction 2026-10-28.
- Map no longer re-fits bounds on every edit (only first load).

Google requests per action, one tour with D routed days:

| Action | Before | After |
|---|---|---|
| Edit minutes / category / notes / label | D Directions (per keystroke, debounced) | 0 |
| Edit day start/end time | D Directions | 0 (+ legs-1 Matrix for that day if the departure is future and changed) |
| Drag / reorder within a day | D Directions | 1 Directions for the changed day (+ legs-1 traffic Matrix if future) |
| Optimize, no end address (n mapped stops) | 1 Directions (round trip) + D | ⌈(n+1)/⌊100/n⌋⌉ Matrix + 1 Directions for that day (+ traffic) |
| Optimize, end address | 1 Directions + D | 1 Directions + 1 Directions for that day (+ traffic) |
| Page load | D Directions | D Directions (+ traffic legs for future days) |

Next phases: Routes API migration (`computeRoutes` / `computeRouteMatrix` — also gives per-leg
traffic with waypoints), tour layer on the main map (register in **both** layer menus), PDF
export, portal tour view, live follow-along.
