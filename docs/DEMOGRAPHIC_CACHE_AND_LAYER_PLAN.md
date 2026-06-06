# Demographic Cache + Audit Log + Map Layer

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
