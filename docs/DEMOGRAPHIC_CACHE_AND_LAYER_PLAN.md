# Demographic Cache + Audit Log + Map Layer

> **Status (2026-06-09):** Phases A + B shipped on branch
> `feature/demographic-cache-audit-log`. Migration is applied to the prod
> DB and recorded in `supabase_migrations.schema_migrations`. Edge
> function is deployed and live. Frontend is on the branch only — not
> merged to `main`, not on Vercel prod. See the **Delivery summary** at
> the bottom for what actually shipped vs. what this plan originally
> proposed.

Follow-on to [DEMOGRAPHIC_RING_LAYERS_PLAN.md](DEMOGRAPHIC_RING_LAYERS_PLAN.md). Phases 1–3 (rings, drive-time, custom polygon) shipped — every Fetch still hits ESRI fresh. This plan adds:

1. An **audit log / cache table** that records every successful enrichment call.
2. A **lat/lng-keyed cache layer** inside the edge function that short-circuits ESRI calls when the same lookup was done recently.
3. A **"Cached demographics" map layer** in the layer panel — toggle it on, see pins for every past enrichment, click one to re-open the slideout prefilled with cached numbers.
4. A **cached badge + Refresh from ESRI** affordance in the slideout so users always know whether a number cost a credit.

## Goal & user value

- **Cost visibility** — answer "how many ESRI calls did we make this month, by who, by mode?" in one SQL query. Today we can't.
- **Cost reduction** — the same corner enriched 3 times in a week today = 3× the credits. With the cache, 1×.
- **Retrievability** — past enrichments become a first-class map layer. Open OVIS tomorrow, toggle "Cached demographics" on, see every spot anyone on the team has previously analyzed.
- **Transparency** — the slideout always tells you whether the numbers in front of you cost a credit right now or were pulled days ago.

## Data model

One new table. Apply via psql + manual `schema_migrations` INSERT per [reference_supabase_migration_workflow](../../.claude/projects/-Users-mike-Documents-GitHub-react-kanban-board/memory/reference_supabase_migration_workflow.md).

```sql
CREATE TABLE esri_enrichment_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id),
  called_at       timestamptz NOT NULL DEFAULT now(),
  mode            text NOT NULL CHECK (mode IN ('rings', 'polygon')),

  -- For rings/drive-time mode (mode = 'rings'):
  latitude        double precision,
  longitude       double precision,
  radii           numeric[],         -- e.g. {1,3,5}
  drive_times     numeric[],         -- e.g. {5,10,15}

  -- For polygon mode (mode = 'polygon'):
  polygon         jsonb,             -- GeoJSON Polygon, coordinates only
  polygon_centroid_lat  double precision,  -- for map-layer rendering
  polygon_centroid_lng  double precision,
  polygon_vertex_count  int,

  -- Snapshot of the result so the cache hit can return immediately:
  demographics    jsonb NOT NULL,    -- the full GeoenrichmentResult
  tapestry        jsonb,
  isochrones      jsonb,             -- drive-time polygon GeoJSON

  -- Cost / status accounting:
  cache_hit       boolean NOT NULL DEFAULT false,  -- true = we did NOT call ESRI
  success         boolean NOT NULL,
  error           text
);

CREATE INDEX esri_enrichment_log_lookup_rings
  ON esri_enrichment_log (latitude, longitude, called_at DESC)
  WHERE mode = 'rings' AND success = true;

CREATE INDEX esri_enrichment_log_user_time
  ON esri_enrichment_log (user_id, called_at DESC);

CREATE INDEX esri_enrichment_log_bbox
  ON esri_enrichment_log USING gist (
    ll_to_earth(latitude, longitude)
  );
```

RLS: users can read their own rows + read any cache hit (so cache works across users); only the edge function (service role) writes.

## Cache logic in the edge function

In `supabase/functions/esri-geoenrich/index.ts`, before calling ESRI:

```ts
// Look for a recent successful call with the same inputs.
const cacheTTLDays = 30;
const since = new Date(Date.now() - cacheTTLDays * 86400_000).toISOString();

const { data: hit } = await supabase
  .from('esri_enrichment_log')
  .select('*')
  .eq('mode', 'rings')
  .eq('success', true)
  .eq('latitude', request.latitude)
  .eq('longitude', request.longitude)
  .contains('radii', request.custom_radii ?? [1,3,5])
  .contains('drive_times', request.custom_drive_times ?? [10])
  .gte('called_at', since)
  .order('called_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (hit && !request.force_refresh) {
  await supabase.from('esri_enrichment_log').insert({
    mode: 'rings',
    latitude: request.latitude,
    longitude: request.longitude,
    radii: request.custom_radii,
    drive_times: request.custom_drive_times,
    demographics: hit.demographics,
    tapestry: hit.tapestry,
    isochrones: hit.isochrones,
    cache_hit: true,
    success: true,
    user_id: callerUserId,
  });
  return cached response with `cached_at: hit.called_at, cached_by: hit.user_id`;
}
```

Polygon mode: cache key is a hash of the rounded GeoJSON coordinates (4-decimal precision ≈ 11m). A re-drawn polygon that's slightly different won't hit cache — that's fine, polygon enrichment is the rarest use case.

A new `force_refresh: true` flag on the request body bypasses the cache. The slideout's "Refresh from ESRI" button sends this.

## Hook + slideout changes

`GeoenrichmentResult` adds two optional fields:

```ts
interface GeoenrichmentResult {
  // …existing fields…
  cached_at?: string | null;     // ISO timestamp of the original ESRI call
  cached_by?: string | null;     // user_id who originally paid for it
}
```

In `DemographicsAnalysisSlideout`, when `result.cached_at` is set, render a small badge below the Fetch button:

```
┌──────────────────────────────────────────┐
│ ⓘ Cached · 2 days ago by sarah@…         │
│ [Refresh from ESRI →]                    │
└──────────────────────────────────────────┘
```

Same badge in the View All modal.

## New "Cached demographics" map layer

### Behavior

- Entry in `LayerPanel.tsx` between "Site submits" and "Restaurants"
- Toggle on → small dot pins render for every cached enrichment in the current map bbox
- Default filters (panel below the toggle, ▸ Filters):
  - Time range: 7d / 30d / All (default: 30d)
  - Scope: **Mine + my team's** by default, **All users** opt-in
  - Mode: rings ⊕ polygon (both on by default)
- Polygon-mode entries: pin at polygon centroid, square icon (vs. round for rings)
- Click a pin → opens `DemographicsAnalysisSlideout` prefilled with the cached data (no ESRI call)

### Visual

- **Ring pin:** small filled circle, midnight (#002147) — distinguishable from property pins
- **Polygon pin:** small filled square, midnight
- Hover: tooltip with `pulled by <user> on <date>`
- At >100 pins in view, cluster

### Performance

- Pins fetched in `idle` event with bbox filter (same pattern as `StarbucksTargetAreaLayer`):
  ```ts
  supabase.rpc('get_cached_demographics_in_bbox', {
    min_lat, min_lng, max_lat, max_lng,
    user_id_filter, mode_filter, since
  })
  ```
- RPC dedupes by `(lat, lng, mode)` so 10 enrichments at the same spot show one pin (the most recent).

## File changes summary

**New:**
- `supabase/migrations/<timestamp>_esri_enrichment_log.sql` — table + indexes + RPC
- `src/components/mapping/layers/CachedDemographicsLayer.tsx` — pin layer
- `src/hooks/useCachedDemographicsLayer.ts` — bbox fetch + filter state

**Modified:**
- `supabase/functions/esri-geoenrich/index.ts` — cache check + log write on every call
- `src/hooks/usePropertyGeoenrichment.ts` — add `cached_at` / `cached_by` to result type
- `src/components/mapping/slideouts/DemographicsAnalysisSlideout.tsx` — cached badge + Refresh button
- `src/components/mapping/slideouts/DemographicsAnalysisModal.tsx` — cached badge in header
- `src/components/mapping/LayerPanel.tsx` — new layer entry
- `src/hooks/useMapLayers.ts` / `src/services/mapLayerService.ts` — register the new layer type

## Phased delivery

1. **Phase A — Table + edge-function cache (~3 hrs).** Migration + RPC, edge function reads/writes the log, slideout shows the badge. Immediate value: any team member's repeated Fetch on the same corner is free, and you have audit visibility in raw SQL.
2. **Phase B — Map layer + click-to-restore (~3 hrs).** New layer panel entry, bbox pin fetching, click handler that prefills the slideout. Now past lookups are first-class on the map.
3. **Phase C — Polish (~1-2 hrs).** Clustering at zoom, cluster styling, "Mine vs. All users" filter UI, mode filter chips.

Total ~7-8 hrs across 1-2 sessions.

## Open questions (already answered, but flag for sign-off)

- **Default scope = "Mine + my team's"** — single-user OVIS effectively means "all," which is fine. If you ever add multi-team workspaces, this guards privacy without UX cost.
- **Polygon pins at centroid + square icon** — keeps polygon entries findable on the map without a separate "Saved polygons" list. Centroid computed and stored at write time so the RPC doesn't have to compute it per query.
- **30-day TTL** — survives a typical site-evaluation cycle without keeping stale data forever. Configurable per-environment if needed.
- **Cache key includes `radii` and `drive_times` as a set** — `[1,3,5]` and `[3,5,1]` should hit the same cache row (use sorted arrays as the canonical form).

If any of these are wrong for your workflow, flag before I start Phase A.

---

## Delivery summary (2026-06-09)

What actually shipped on `feature/demographic-cache-audit-log`. Two commits:

- `a09507c8` — Phase A: cache + audit log
- `fb62177e` — Phase B: Cached Demographics map layer + click-to-restore

### Database

[`supabase/migrations/20260603120000_esri_enrichment_log.sql`](../supabase/migrations/20260603120000_esri_enrichment_log.sql)

Single table `esri_enrichment_log`. Schema matches the proposal above with one cleanup — the GIST `ll_to_earth` bbox index was dropped in favor of a plain composite index on `(latitude, longitude)` filtered to `success = true`. The earthdistance extension wasn't enabled in the project and the bbox queries are simple range filters, so the composite index is enough.

RLS:
- `esri_enrichment_log_read_authenticated` — any logged-in user can read successful rows (cache works across the team; the Cached Demographics layer renders everyone's lookups).
- `esri_enrichment_log_write_service_role` — only the edge function (service role) writes.

Indexes:
- `esri_enrichment_log_lookup_rings` — partial on `(latitude, longitude, called_at DESC) WHERE mode='rings' AND success AND NOT cache_hit` for cache lookups.
- `esri_enrichment_log_lookup_polygon` — same shape for polygon mode.
- `esri_enrichment_log_user_time` — for the future "who burned credits this month" dashboard.
- `esri_enrichment_log_bbox` — composite on `(latitude, longitude) WHERE success` for the map-layer bbox fetch.

Migration applied via `psql + INSERT into schema_migrations` per the established workflow (the supabase CLI's `db push` remains broken — see [reference_supabase_migration_workflow](../../.claude/projects/-Users-mike-Documents-GitHub-react-kanban-board/memory/reference_supabase_migration_workflow.md)).

### Edge function — `supabase/functions/esri-geoenrich/index.ts`

**Cache lookup before ESRI:**
- Rings: rounded lat/lng + sorted radii set + sorted drive_times set + 30-day window. Matches on `radii @> requested` and `drive_times @> requested` so a cached `[1,3,5]` row satisfies a request for `[1,3]`.
- Polygon: round all coords to 4 decimals (~11m), match on exact JSONB equality + stored centroid. A re-drawn polygon slightly off won't hit the cache; we accepted that tradeoff because polygon enrichment is the rarest use case.

**Log write on every call:**
- Fresh ESRI call → `cache_hit = false` + full result snapshot.
- Cache hit → second log row with `cache_hit = true` (audit trail of "who pulled this for free").
- Failure → `success = false` + error message.

**`force_refresh: true` bypasses the cache.** The slideout's "Refresh from ESRI" button sends this.

**Module-scope Supabase client** so steady traffic shares one connection across requests in the same Deno isolate.

**Caller identity:** JWT extracted from the `Authorization: Bearer ...` header → `user_id` written into every log row. Anonymous/invalid tokens still serve the request; they just write a NULL `user_id`.

### Hook — [src/hooks/usePropertyGeoenrichment.ts](../src/hooks/usePropertyGeoenrichment.ts)

- `GeoenrichmentResult` gained `cached_at` (ISO timestamp of the original ESRI call) and `cached_by` (user_id who paid for it).
- `enrichLocation(...)` and `enrichPolygon(...)` accept an optional `forceRefresh` arg that propagates to `force_refresh` on the edge function body.

### Slideout + Modal cached UI

[`src/components/mapping/slideouts/DemographicsAnalysisSlideout.tsx`](../src/components/mapping/slideouts/DemographicsAnalysisSlideout.tsx)

- `<CachedBadge>` renders below the Fetch button when `result.cached_at` is set: green mint background, `✓ Cached · pulled <X> ago · no ESRI credit charged`, with a **Refresh from ESRI** link.
- One badge for ring/drive-time results, one for polygon results — they're tracked separately so a fresh polygon pull doesn't override a cached ring badge or vice versa.
- New `prefilled?: PrefilledCacheState | null` prop lets the slideout open with state already seeded from a cached row (used by the Cached Demographics layer's click handler).

[`src/components/mapping/slideouts/DemographicsAnalysisModal.tsx`](../src/components/mapping/slideouts/DemographicsAnalysisModal.tsx)

- Footer adds a small green note (`rings cached`, `polygon cached`, or both) so the "View All" view also surfaces cache status.

### Cached Demographics map layer

New files:
- [`src/components/mapping/layers/CachedDemographicsLayer.tsx`](../src/components/mapping/layers/CachedDemographicsLayer.tsx) — bbox fetch on map idle, client-side dedupe by rounded `(lat, lng)`, renders one `google.maps.Marker` per deduped lookup. Click → `onPinClick(...)` carries the reconstituted `GeoenrichmentResult`.

Modified:
- [`src/components/mapping/layers/LayerManager.tsx`](../src/components/mapping/layers/LayerManager.tsx) — new `cached_demographics` entry in `DEFAULT_LAYERS` (icon: 📊). New state in the context: `cachedDemographicsTimeRange` (`'7d' | '30d' | 'all'`, default `'30d'`), `cachedDemographicsScope` (`'mine' | 'all'`, default `'mine'`), `cachedDemographicsModes` (`Set<'rings' | 'polygon'>`, default both).
- [`src/components/mapping/LayerPanel.tsx`](../src/components/mapping/LayerPanel.tsx) — `<CachedDemographicsFilters>` pill UI renders below the layer toggle when the layer is on. Mirrors the existing `MunicipalProjectFilters` pattern.
- [`src/pages/MappingPageNew.tsx`](../src/pages/MappingPageNew.tsx) — mounts the layer, holds the `demographicsPrefilled` state, wires the click handler into the existing slideout open path.

**Pin styling:**
- Rings: midnight (#002147) round dot.
- Polygon: terracotta (#A27B5C) square (SVG path).
- Both with white stroke for contrast against the basemap.

### Things deliberately deferred

- **Cluster at >100 pins in view.** Markers don't cluster yet — at any realistic 30-day OVIS volume this hasn't been a problem. Easy to add later via `@googlemaps/markerclusterer` if needed.
- **Isochrone polygons on cache restore.** Clicking a cached rings pin opens the slideout with ring + drive-time stats populated, but does NOT redraw the drive-time isochrone polygons even though they're stored in the cache row. The `isochrones` field is there; just not consumed by the slideout's overlay on prefilled open. Easy follow-up if users want it.
- **Admin-only "All users" scope.** Today any logged-in user can flip the scope filter to "All users". Probably fine for OVIS team size; if multi-tenant ever matters, gate that pill on `is_admin`.
- **"Who pulled this" attribution UI.** The cached badge says "pulled N days ago" but doesn't show the user's email. We have `cached_by` plumbed through; surfacing a tooltip with the email is a 5-line follow-up. Deferred until a single-user OVIS deployment outgrows.
- **Auto-purge of old rows.** The 30-day TTL is enforced in the query (`called_at >= now() - 30 days`). Rows older than 30 days stay in the table forever, growing slowly. A monthly `DELETE FROM esri_enrichment_log WHERE called_at < now() - 90 days` cron could be added if storage becomes a concern. At expected volume, this is years away.

### How to verify the cache is working

Open the slideout, Fetch the same `(lat, lng, radii, drive_times)` twice:

```sql
-- Should show one cache_hit=false row + one cache_hit=true row at the same coords:
SELECT mode, latitude, longitude, radii, drive_times, cache_hit, called_at
FROM esri_enrichment_log
WHERE success
ORDER BY called_at DESC
LIMIT 5;
```

On the second fetch, the green `Cached · …` badge should appear and the response is served without touching ESRI.

### How to verify the layer is working

1. Toggle on **📊 Cached Demographics** in the layer panel.
2. Round midnight dots and square terracotta dots appear at every previously-enriched location in the current map bbox.
3. Click any dot → the slideout opens with cached numbers populated, no spinner, no badge change.
4. Adjust the filter pills (`7d` / `30d` / `All`, `Mine` / `All users`, `Rings` / `Polygon`) and watch pins refresh.

### Production rollout checklist

When ready to merge to `main` and push to Vercel:

1. Merge the branch: `git checkout main && git merge feature/demographic-cache-audit-log && git push origin main`
2. Run `vercel --prod` (two-step deploy per [CLAUDE.md](../CLAUDE.md)).
3. The edge function is already deployed to the live Supabase project, so no `supabase functions deploy` step needed.
4. The migration is already applied to the live DB, so no `psql` step needed.
5. Smoke-test on the production URL: right-click → Demographics Here → Fetch twice on the same spot → confirm the green Cached badge appears on the second fetch.

---

## Post-ship fixes

### 2026-07-01 — Cached Demographics toggle was invisible on prod

The layer landed on `main` and shipped to Vercel weeks ago, but no one
could see the toggle. Cause: the map page's layer popup
(`MappingPageNew.tsx`) is a **hardcoded inline JSX menu**, not the
generic `LayerPanel.tsx` component the plan assumed. Registering the
layer in `LayerManager.DEFAULT_LAYERS` was necessary but not sufficient.

Fixed in commit `14dd5fa2` — added a Cached Demographics row
(with inline time-range / scope / mode filter pills) to the popup
between Municipal Projects and Custom Layers. Layer is now reachable
from the UI.

**Lesson learned, documented separately**: any new system layer needs
to be wired into both menus. See
[ADDING_A_SYSTEM_LAYER.md](ADDING_A_SYSTEM_LAYER.md) for the checklist.

### 2026-07-01 — Minimize button on the demographics slideout

Follow-up to the "keep the rings visible after I stop editing" ask.
Closing the slideout previously unmounted all three overlays
(rings / isochrones / polygon) because they live inside the slideout's
render tree — that's still the case. Instead, added a minimize (`–`)
control next to the close (`×`) button.

- **Minimize** collapses the panel to a small header pill in the
  top-right corner. Overlays stay mounted. Useful while you scroll the
  map or work in another slideout.
- **Close** still tears the overlays down as before.

Commit: `be63d203`. Implementation: `minimized` boolean state gates
only the slideout body; the overlays sit outside the conditional so
they render as long as `isOpen` is true.

If we ever want overlays to survive a full close (screenshot workflow,
etc.), the fix is bigger — lift `DemographicRingsOverlay` /
`DemographicIsochronesOverlay` / `DemographicPolygonOverlay` out of
the slideout up to `MappingPageNew` and drive them off page-level
state. Not done yet.

### 2026-07-18 — isolate the open point (hide the other cached dots)

Ask: when you open a cached demographics point, the *other* cached blue
dots should disappear so the map stays focused on the point you're
studying; closing the slideout brings them all back.

Implementation. [CachedDemographicsLayer.tsx](../src/components/mapping/layers/CachedDemographicsLayer.tsx)
gained an optional `activeCoordinates` prop. Each marker stores a rounded
`locationKey` (same `toFixed(4)` precision as `dedupeByLocation`), and only
the marker whose key matches the active point is given a `map`; the rest are
created with `map: null`. [MappingPageNew.tsx](../src/pages/MappingPageNew.tsx)
passes `activeCoordinates={demographicsLocation}` — i.e. any open demographics
point, whether reached by clicking a cached dot or by a right-click ad-hoc
fetch that hit cache.

**The bug in the first attempt** (`a2f67ed1`): the filter lived only in a
`useEffect` keyed on the selection, and the parent's `onPinClick` is an
**inline arrow** whose identity changes on every render. Opening the slideout
re-rendered the parent → `fetchAndRender`'s `useCallback` identity changed →
the idle-listener effect re-ran it → every marker was rebuilt **visible**. The
visibility effect lost that race and also didn't re-fire when the marker count
was unchanged (`setRowCount(sameN)` bails out), so the dots reappeared
instantly.

**The fix** (`b4082f28`): apply the filter **at marker-creation time** inside
`fetchAndRender`, reading the current selection from a ref (`activeKeyRef`) so
every rebuild respects it regardless of how often it runs. The standalone
effect is kept only to toggle visibility on a pure select/deselect that
doesn't trigger a re-fetch. The scope was also broadened from cached-pin-only
opens to any open point.

Not fixed (pre-existing): `onPinClick` still churns `fetchAndRender`'s identity
every render, causing redundant DB re-queries on the `idle` listener. Wrapping
the parent handler in `useCallback` would be the clean fix — deferred, since
the creation-time filter makes it correct (just not maximally efficient).
