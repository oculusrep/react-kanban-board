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
  Matrix request (Advanced SKU) with a **chained departure**: the first point is reached at day
  start; each leg departs at (arrival at its origin + that stop's minutes), so legs are fetched
  sequentially. Cache is per leg (origin→destination coords): a cached departure within 15 min
  of the new one is reused, so an upstream minutes/order change only re-requests downstream
  legs once it shifts their departure by 15+ min. Requests go out at departures snapped to
  15-minute buckets (never in the past). If any leg lacks traffic data the day falls back to
  typical times, labeled. Past or missing date/time → "typical drive times".
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
| Edit category / notes / label | D Directions (per keystroke, debounced) | 0 |
| Edit minutes on stop k (future-dated day) | D Directions | 0 Directions; traffic: 0 if downstream departures move <15 min, else one request per downstream leg whose departure moved 15+ min |
| Edit day start time (future-dated day) | D Directions | 0 Directions; traffic: 0 if shift <15 min, else up to legs requests for that day |
| Drag / reorder within a day | D Directions | 1 Directions for the changed day (+ traffic for new/shifted legs) |
| Optimize, no end address (n mapped stops) | 1 Directions (round trip) + D | ⌈(n+1)/⌊100/n⌋⌉ Matrix + 1 Directions for that day (+ traffic) |
| Optimize, end address | 1 Directions + D | 1 Directions + 1 Directions for that day (+ traffic) |
| Page load | D Directions | D Directions (+ one traffic request per leg, sequential, for future-dated days — e.g. 11 for a 12-stop day) |

## Phase 4.6 — Site approach routes (branch `feature/tour-routing`)

Goal: control how a tour arrives at a site (main corridor past retail, the right entrance),
even when it isn't the fastest way in.

- **Data** (migration `20261028180635_tour_approach_waypoints`): `site_submit.approach_waypoints`
  (the site's default) and `tour_stop.approach_waypoints_override` (per tour). Ordered
  `[{lat,lng}]`, max 10 points, CHECK-constrained. Effective approach = override (NOT NULL;
  `[]` = explicitly none on this tour) → site default → none. Writing the site default fires
  the site_submit audit trigger (bumps `updated_at` / `updated_by_id`); nothing else.
- **Routing.** Day sequence = `[start?] + per stop: [approach points (stopover:false), stop] +
  [end?]`. Approach points add no stop time. An approach on stop 1 with no start address is
  ignored (nothing to route from).
- **No 25-stop cap.** Days are split greedily at stopovers into Directions requests of ≤25
  waypoints, each starting at the previous chunk's last stop; legs, polylines and drive times
  are stitched. Cached per chunk (`routeKey` includes the via flag, so approach points are in
  the key). One `DirectionsRenderer` per chunk.
- **Capture by dragging.** Routes are draggable. After a drag, the changed leg's
  `via_waypoints` become the proposed approach for the stop that leg ends at (legs ending at
  the end address are rejected). Banner: **Save approach for this site** (writes the site
  default; also clears this tour's override so the new default shows) / **Use for this tour
  only** (writes the override) / **Discard**. Saving seeds the route cache with the result
  Google rendered for the drag, so no extra Directions call. Approach points show as small
  hollow markers. Stop cards show a "custom approach" tag (map + Reorder panel); on the map:
  **clear** (tour override) or **skip on tour** / **clear for site** (site default, confirm).
- **Traffic.** Distance Matrix can't route through waypoints, so a leg with an approach is
  fetched as its segments (prev stop → a1 → … → stop), chained departures, summed. Same 15-min
  reuse tolerance per segment.
- **Optimize** is now always Distance Matrix + `solveOpenPath` (Directions `optimizeWaypoints`
  requires all waypoints to be stopovers, so it can't coexist with approaches). Each stop's
  approach is a fixed tail: matrix destination = the approach's first point, plus the fixed
  first-point → stop time (one cached Directions call per approached stop). End address = an
  extra matrix column (`toEnd`). Matrix tiled to ≤25×25 and ≤100 elements per request.

Google requests (this phase):

| Action | Requests |
|---|---|
| Drag a leg | 1 Directions (made by Google's renderer on drop) |
| Save approach (site or tour) | 0 Directions (cache seeded from the drag); traffic: one 1×1 Matrix per new segment of that leg if the day is future-dated, + downstream segments only if their departure moved 15+ min |
| Discard | 0 |
| Clear / skip | 1 Directions for that chunk (0 if that shape is still cached) + traffic for the changed leg |
| Optimize (n free stops, k with approaches) | k Directions (approach tails, cached) + ⌈(n+1)/r⌉·⌈(n+e)/25⌉ Matrix tiles (r = rows per tile) |

Migration `20261028180635_tour_approach_waypoints` applied to prod + recorded 2026-10-28.

### Fix 2026-10-28 — blank page after dragging a focused leg

`DirectionsRenderer` fires `directions_changed` **synchronously inside `setDirections()`**
and `getDirections()` returns a **copy**, not the object passed in (verified in Chromium).
The focus restyle's "was this my own setDirections?" check used object identity, so after a
drag every restyle looked like a new drag → infinite recursion → stack overflow; clearing
focus (Esc) then hit it inside a React effect and unmounted the app. Renderer styling, stop
focus and drag detection now live in `src/lib/tourRouteFocus.ts` (`RouteFocusController`):
a re-entrancy counter around every programmatic `setDirections`, drags delivered outside
Google's event, in/out legs redrawn on the dragged path. The map is wrapped in an error
boundary ("Reload map"). Regression test: `npm run test:tours`
(`tests/tours/tourRouteFocus.test.ts`, fake renderer with the same two behaviours; fails
with the original RangeError if the guard is removed).

## Phase 4.7 — Live tour day (branch `feature/tour-routing`)

- Migration `20261028195957_tour_stop_actual_departure`: `tour_stop.actual_departure_at
  timestamptz` (UTC; shown in Eastern). Existing tour_stop grants cover it.
  Applied to prod + recorded 2026-10-28.
- A day is **live** when `day_date` = today in **America/New_York** (`todayET`, never device
  zone / UTC). Live days get a LIVE badge, a ≥44px **Leaving now** button on each mapped stop
  (map schedule + Reorder panel), and the stamped time ("✓ Left 10:42 AM") opens a native time
  picker to edit or clear (Eastern wall time → UTC via `etWallTimeToDate`, DST-safe).
- **Anchor** = last stamped stop in route order. It and every earlier stop show done (✓,
  muted, no button unless stamped). The rest is re-projected by `computeLiveSchedule` from the
  anchor's departure; traffic for remaining legs via the existing chained Distance Matrix
  cache (departures snapped ≥ now, 15-min tolerance → repeat taps usually 0 calls).
- Footer: "Finish 5:12 PM (planned 4:40 PM, +32 min)", terracotta past the day's end time.
  **Reset to plan** clears the day's stamps in one UPDATE.
- iPhone width (<700px): map stacks over a full-width schedule; controls compact.

## Phase 4.8 — Remove from tour via the Add to tour menu (branch `feature/tour-routing`)

No migration. `AddToTourButton` (SiteSubmitSidebar, DealDetailsSlideout, SiteSubmitDetailsPage):
- Tours already containing the site submit show ✓; hover swaps the stop count for **Remove**; click
  removes that `tour_stop`. A confirm appears only if the stop carries work: notes, a custom label,
  an approach override (incl. `[]`), or a Leaving-now stamp. Tours without it: click adds to Unscheduled.
- Label: "On N tour(s) ▾" when on any tour (count = all `tour_stop` rows for the site submit), else "Add to tour ▾".
- `removeTourStop` (also used by the tour panel's remove) now deletes, then renumbers the remaining
  stops in that day / the unscheduled bucket 0..n-1 via `set_tour_stop_placements`. Two calls, not one
  transaction: a failed renumber leaves a position gap (order still correct) and is reported.
- Change events: `notifyTourStopsChanged(tourId)` / `onTourStopsChanged(tourId|null, fn)` in `useTours.ts`
  (window CustomEvent `ovis:tour-stops-changed`, same pattern as packageTracker). Add/remove fire it; every
  AddToTourButton, `useTours` stop counts, an open TourDetailPanel (silent reload) and the tour map
  (debounced redraw) listen.
- Touch/pen (by `pointerType`): first tap on a ✓ row turns it into "Remove from <tour>?" with Remove / Cancel
  (naming any work that would be lost, instead of a dialog); second tap removes. Mouse hover/click unchanged;
  keyboard activation follows the mouse path.

## Cleanup list

- **`anon` SELECT grant on `site_submit`** (pre-existing, found 2026-10-28 while adding
  `approach_waypoints`). RLS returns no rows — an anonymous PostgREST request
  `site_submit?select=id,approach_waypoints` returned `[]` / HTTP 200 — but the grant itself
  should be revoked per the CLAUDE.md grants rules. Left as-is by decision for now; needs its
  own migration + per-persona check (portal reads site_submit through `authenticated`).
- No editor for the tour-level `tour_date` (only per-day dates are editable).
- `DirectionsService` deprecated (Feb 2026) → Routes API migration (planned phase).

Next phases: Routes API migration (`computeRoutes` / `computeRouteMatrix` — also gives per-leg
traffic with waypoints), tour layer on the main map (register in **both** layer menus), PDF
export, portal tour view, live follow-along.
