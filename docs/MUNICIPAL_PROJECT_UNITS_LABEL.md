# Municipal Project — Units Label

Compact label shown on the Municipal Projects slideout and in KML exports. Format: `+<total_units> <stage_abbreviation>` (either side dropped if missing). Examples: `+50 UR`, `+50 AP`, `+50`, `UR`.

## Where it lives

- **Formatter:** [`src/utils/municipalProjectUnitsLabel.ts`](../src/utils/municipalProjectUnitsLabel.ts) — `formatUnitsLabel(totalUnits, abbreviation)`
- **Slideout consumer:** [`src/components/mapping/slideouts/MunicipalProjectSlideout.tsx`](../src/components/mapping/slideouts/MunicipalProjectSlideout.tsx) (resolves `effectiveAbbreviation` then calls the formatter)
- **KML consumer:** [`src/services/municipalProjectKmlExport.ts`](../src/services/municipalProjectKmlExport.ts) (joins `project_stage.abbreviation` client-side; emits as `units_label` ExtendedData and in the popup HTML)
- **Map layer consumer:** [`src/components/mapping/layers/MunicipalProjectLayer.tsx`](../src/components/mapping/layers/MunicipalProjectLayer.tsx) — draws the label directly on the map when the “Label pins by” chooser is on (see next section)
- **Layer chooser + style controls + per-stage abbreviation editor:** [`src/components/mapping/layers/MunicipalProjectInlineFilters.tsx`](../src/components/mapping/layers/MunicipalProjectInlineFilters.tsx) — “Label pins by”, “Size / Fill / Line”, and the “Stage colors & abbreviations” section in the layer panel

## On-map pin label (shipped 2026-07-02)

The Municipal Projects layer can draw a label next to each pin. Controlled from the layer's filter panel (**Layers → Municipal Projects → “Label pins by”**).

### Modes

| Value          | What renders                                                    | Source                                                          |
|----------------|-----------------------------------------------------------------|-----------------------------------------------------------------|
| `none` (default) | No label                                                      | —                                                               |
| `total_units`  | Raw total_housing_units number, e.g. `80`                       | `municipal_project.total_housing_units`                         |
| `units_label`  | The full computed string, e.g. `+80 RC`                         | `formatUnitsLabel(total_housing_units, effective_stage_abbreviation)` (same value shown in the slideout and KML) |

For `units_label`, the layer joins `project_stage.abbreviation` client-side after fetching from `municipal_project_v` (mirrors the KML export pattern — `municipal_project_v` doesn't expose the abbreviation).

State is session-only in the `LayerManager` context (`municipalProjectsLabelMode`); refresh returns to `none`.

### Style controls

When any mode other than `none` is active, three inline controls appear:

- **Size** — font size in pixels (integer 8–24, default 11)
- **Fill** — text color (color picker, default brand midnight `#002147`)
- **Line** — outline / halo color drawn behind the fill (color picker, default white `#FFFFFF`)

All three are session-only in `LayerManager` (`municipalProjectsLabelFontSize / FillColor / LineColor`). The stroke is rendered via SVG `paint-order="stroke"` so the halo sits behind the fill — this keeps labels legible on any basemap.

### Rendering

Labels are their own draggable `google.maps.Marker` (not `Marker.label` on the pin) with an SVG icon that draws the text. Two reasons for the separate marker:

1. Labels stay visible independently of the pin. They render whenever the layer is on AND the row passes filters AND at least one of (Show pins, Show polygons) is checked. So you can hide pins and still see labels floating over polygons.
2. `google.maps.MarkerLabel` doesn't support a stroke/outline. The SVG approach gives us full control over size, fill color, and line color.

### Draggable — per-project persistence

Each label is draggable on the map. On drag end, the layer computes the screen-pixel offset from the pin centroid and persists it to the `municipal_project` row.

**Schema (migration [`20260702120000_municipal_project_label_offset.sql`](../supabase/migrations/20260702120000_municipal_project_label_offset.sql)):**

- `municipal_project.label_offset_x_px int null` — screen-pixel X offset relative to pin centroid (+ = right)
- `municipal_project.label_offset_y_px int null` — screen-pixel Y offset relative to pin centroid (+ = down)
- Both `null` = no offset saved; label sits at its default position just below the pin tip.
- View `municipal_project_v` was dropped and recreated to expose the two new columns (no dependent views existed).

**Why pixel offsets, not lat/lng.** Offsets are stored in *screen pixels* so a label stays at the same visual distance from the pin at every zoom level. At render time, the layer converts the stored pixel offset back to a lat/lng using `map.getProjection()` at the current zoom (`offsetToLatLng` helper in the layer). A `zoom_changed` listener bumps a state tick so labels re-derive their positions when the user zooms.

The save fires from the `dragend` handler:

```ts
labelMarker.addListener('dragend', (e) => {
  const { x, y } = latLngToOffset(map, centroid_lat, centroid_lng, e.latLng.lat(), e.latLng.lng());
  supabase.from('municipal_project').update({ label_offset_x_px: x, label_offset_y_px: y }).eq('id', row.id);
  setRows(prev => prev.map(r => r.id === row.id ? { ...r, label_offset_x_px: x, label_offset_y_px: y } : r));
});
```

Local `setRows` update is critical — without it, the next React re-render would use the pre-drag row and snap the label back.

### To reset a project's label to default

`update municipal_project set label_offset_x_px = null, label_offset_y_px = null where id = '…';`

There's no reset button in the UI yet — if that becomes a pain point, add one to the project slideout.

## Computed at render/export time — not stored

The Units Label is **never persisted on the `project` row**. It is derived on every render and every KML export from two inputs:

1. `project.total_housing_units` (lives on the project)
2. `project_stage.abbreviation` for the project's effective stage

This means **changing an abbreviation in `project_stage` flows automatically to every project that uses that stage** — slideout, KML popup, KML ExtendedData. **No per-project backfill migration is ever needed when an abbreviation changes.**

Practical implication: editing the abbreviation in the layer panel (or running a one-line `UPDATE project_stage SET abbreviation = '...' WHERE name = '...'`) is the complete change. There is nothing else to update.

## Effective stage resolution

A project's effective stage is `status_override_id` if set, otherwise `status_stage_id` (computed from completed task stages — see [MUNICIPAL_PROJECT_IMPORTER_SPEC.md](MUNICIPAL_PROJECT_IMPORTER_SPEC.md)). The formatter consumes the abbreviation of whichever stage wins. If a project has no effective stage, the label shows only the unit count (or nothing if units are also null).

## Seeded abbreviations

Initial mapping comes from [`supabase/migrations/20260531120000_project_stage_abbreviation.sql`](../supabase/migrations/20260531120000_project_stage_abbreviation.sql):

| Stage name         | Abbreviation |
|--------------------|--------------|
| Planning           | `UR`         |
| Approved           | `AP`         |
| Under Construction | `UC`         |
| Built Out          | `RC`         |

These are editable per-stage in the layer panel and shared across all users. New stages added via the importer have a null abbreviation by default — the Units Label will fall back to units-only until someone sets one.
