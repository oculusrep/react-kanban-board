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

### Phase 4 — AI route optimization
- Enable Google Route Optimization API in GCP (billing check required).
- Supabase Edge Function calls it server-side (keeps key off client), returns ordered stops →
  write back to `tour_stop.position`.

### Phase 5 — PDF export
- No PDF lib exists today. Add `@react-pdf/renderer` (designed doc) or `jspdf`+`html2canvas`
  (snapshot). Pull pertinent info straight off the staged site submits.

### Phase 6 — Live follow-along
- `navigator.geolocation.watchPosition` → location marker + highlight current/next stop.

## Applying the Phase 1 migration

The migration is additive (new tables only) and safe to apply. It is **not** auto-applied — run
`supabase db push` (or apply via the Supabase MCP) against the target project, then regenerate
types: `npm run schema`. Until then the Phase 1 UI renders against tables that don't exist yet.
