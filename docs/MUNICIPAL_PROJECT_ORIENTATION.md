# Municipal project orientation — unplaced records on the map

Branch: `fix/municipal-project-orientation`
Date: 2026-09-30

## The report

> Opening an unplaced record from the Municipal Projects unplaced list brings up the
> slideout but the map doesn't move — the municipality orientation isn't firing.
> Test case: "Ardent Acquisitions - SR-61 Master Planned Residential", Paulding County.

Two hypotheses came with it: (1) the RPC returns no bounds, probably a
`municipality` → `boundary_municipality` name-match failure on county-level rows;
(2) `focusMunicipalProject` isn't wired to the unplaced-list open path.

**Both were checked and both are wrong.** What follows is the evidence, because
"we checked and it was fine" is only useful if the check is reproducible.

## What was verified, and how

### 1. The RPC returns bounds — for this record and for every unplaced record

`municipal_project_orientation_bounds('3f3aa06d-…')` returns
`(33.7748, -85.0503, 34.0826, -84.7228)` — Paulding County. The name join is not
failing for county-level rows:

```sql
select mp.project_name, m.name as muni,
       (select count(*) from municipal_project_orientation_bounds(mp.id)) as bounds_rows
from municipal_project mp
left join municipality m on m.id = mp.municipality_id
where mp.centroid is null
order by bounds_rows;
```

All **14** unplaced records return exactly one row. Zero name-match failures.

A SQL result only proves the function works, not that the browser can reach it
(see `docs/` on reachability — grants and RLS are partial predicates). So the RPC
was also called over real HTTP with the app's own publishable key:

```bash
curl -X POST "$URL/rest/v1/rpc/municipal_project_orientation_bounds" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_id":"3f3aa06d-c6b7-47b6-a740-424ad8a70e05"}'
# 200, [{"min_lat":33.77…}]
```

…and through `@supabase/supabase-js` 2.57.4 with the client's exact config,
including the global `Accept: application/json` header in `src/lib/supabaseClient.ts`
(a real suspect — a global Accept could have defeated `maybeSingle()`'s
`application/vnd.pgrst.object+json` and returned an array, whose `.min_lat` would
be `undefined` and silently skip the `fitBounds`). It does not: the per-call
header wins and `data` comes back as a single object either way. Hypothesis
tested, not assumed.

Grants, column privileges and plan cost are all fine: `authenticated` has EXECUTE
on the RPC and SELECT on every column the path reads, and the single-row view
lookup is an index scan at 54ms — not a statement timeout.

### 2. `focusMunicipalProject` *is* wired to the unplaced-list open path

`src/pages/MappingPageNew.tsx`, the `MunicipalProjectUnplacedPanel` render:

```tsx
onSelect={(row) => {
  setSelectedMunicipalProject(row);
  setShowCustomLayersMenu(false);
  void focusMunicipalProject(row.id);
}}
```

and the panel's rows do call `onSelect`. The panel is rendered exactly once — it
is not one of the components that needs adding to both layer menus.

This was confirmed in the **deployed production bundle**, not just in source,
since `vite build` skips `tsc` and the only thing that matters is what shipped:

```
$ curl -s https://ovis.oculusrep.com/assets/index-3ed1505b.js | grep -o 'onSelect:be=>{[^}]*}'
onSelect:be=>{j(be),Vo(!1),W(be.id)}
```

`j` is `setSelectedMunicipalProject`, `W` is `focusMunicipalProject`. The whole
orientation branch is present and correct in the minified bundle, and `u` (the
guard `if(!u)return`) is `mapInstance`, which is demonstrably non-null — 31 map
layers receive it and their pins render.

### Conclusion of the investigation

**Every link in the chain verifies independently, and the reported failure could
not be reproduced from here** (no browser automation and no authenticated session
in this environment). The root cause of the specific symptom Mike saw is *not
established*. It is recorded as open rather than closed by circumstantial
alignment.

The most likely remaining explanation is that the viewport *did* change but
nothing on screen made it legible — a county-sized `fitBounds` onto an empty
basemap, with the record itself deliberately absent from the map, looks a lot
like "nothing happened." That is exactly the gap the second half of the request
describes, and it is the part that is now fixed.

## What changed

### A real gap that *was* found

`focusMunicipalProject` was only ever called from three places: the unplaced
worklist, a successful fetch, and a successful draw. **`onPinClick` never called
it at all**, and neither does a deep link. So orientation was, by construction,
missing on some paths that open a record.

Tying orientation to "whoever opened the slideout remembered to ask for it" was
the design flaw. It now hangs off the selection itself.

### `municipal_project_orientation_boundary(uuid)` — new RPC

Migration `20260930084845_municipal_project_orientation_boundary.sql`.
Returns the municipality's **outline** plus the exact bounding box:

| column | note |
|---|---|
| `municipality_name` | |
| `boundary_geojson` | `ST_SimplifyPreserveTopology(geometry, 0.0005)` — ~55m |
| `min_lat` / `min_lng` / `max_lat` / `max_lng` | envelope of the **full** geometry, not the simplified one |

The original bounds-only function was written on the reasoning that a county
MULTIPOLYGON is "tens of kilobytes per open for no benefit." The size argument
was right; simplification answers it directly:

| municipality | raw GeoJSON | simplified |
|---|---|---|
| Paulding County | 21.4 KB | **0.9 KB** |
| Forsyth County | 46.6 KB | 2.8 KB |
| Hall County | 51.4 KB | 3.9 KB |
| Cumming (largest on file) | 84.4 KB | 5.5 KB |

At under 6 KB worst case the outline costs about what the bounding box saved, so
the benefit is no longer "no benefit."

Still **view state only**: nothing is written, the record stays unplaced, and the
simplified ring is display-only — never a placement source. Placement remains a
drawn boundary, a fetched parcel, or a dropped pin. The function returns no row
for a placed record, so a placed project is never framed by its whole municipality.

`municipal_project_orientation_bounds(uuid)` is left in place but is no longer
called by the client. It is superseded, not dropped.

### `MunicipalProjectOrientationOverlay` — new component

`src/components/mapping/layers/MunicipalProjectOrientationOverlay.tsx`.
Drop-in, takes `map` + `projectId` + `isUnplaced`; reads no `useParams`, so it
works mounted anywhere (per the overlay-first principle in `docs/OVIS_OVERLAY_UX.md`).

It draws the municipality outline — Steel Blue `#4A6B94` stroke over an 8%
Light Slate Blue `#8FA9C8` wash, which reads as an *area to search* and cannot be
confused with a drawn project boundary (those carry stage colors and a solid fill)
— and owns the orientation `fitBounds`.

Three details that matter:

- **`clickable: false`.** The whole point of this view is that the next click
  places the record. An overlay covering a county that could swallow a pin-drop
  click or a terra-draw vertex would be worse than no overlay.
- **`zIndex: 1`**, under the project pins and under anything being drawn.
- **Fits once per project.** A `fittedRef` guard means a re-render while the
  slideout is open won't yank the viewport back while the user is panning around
  looking for the parcel.

Because the overlay keys off `selectedMunicipalProject`, orientation now fires on
**every** path that opens an unplaced record, including the pin-click and
deep-link paths that never reached `focusMunicipalProject`.

`focusMunicipalProject` is now honestly what its comment always claimed: a
no-op for unplaced records, and the mover-to-the-thing for placed ones.

### Why this also makes the original bug self-diagnosing

The outline is a **visible artifact of the orientation call**. A viewport change
alone is a signal that something ran; it is not evidence that it produced
anything. Now:

- Outline appears, map framed → orientation is working.
- Outline appears, map not framed → the RPC and the call path are fine; the
  problem is `fitBounds` against the map instance.
- No outline → the call path is broken, and the console says which of the two
  reasons it is (no municipality on the record, or no boundary on file for its
  name) rather than leaving a blank map to be misread as "nothing here."

That last distinction is deliberate: "we cannot see it" and "there is nothing
there" are different claims and must read differently.

## Scope note

Any municipality whose name doesn't match a `boundary_municipality` row is a
**Market Research / Market Planning** data problem, not one to fix here. The
overlay reports it in the console and carries on. At the time of writing there
are no such records — all 14 unplaced projects resolve an outline.

## Migration applied to the shared production database

`20260930084845_municipal_project_orientation_boundary.sql` was applied to
production from this branch (one prod DB is shared across all worktrees), and
recorded in `supabase_migrations.schema_migrations`. `main` is out of sync until
this branch merges. It is additive — a new function, no changes to existing
relations — so nothing on `main` breaks in the meantime.

Round-tripped before applying: run inside a transaction with `SET LOCAL ROLE
authenticated`, asserted 14/14 unplaced records resolve an outline and 0 placed
records return a row, then `ROLLBACK`.
