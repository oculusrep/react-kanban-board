# Adding a new system layer to the map

> **Landmine warning.** The map has **two** layer menus. Registering a
> layer only in `LayerManager` won't make it visible to users — you must
> also wire a row into the hardcoded menu inside `MappingPageNew.tsx`.
> We just spent an afternoon chasing this for the Cached Demographics
> layer; this doc exists so nobody else does.

## The two menus

1. **`src/components/mapping/LayerPanel.tsx`** — a generic panel that
   iterates `DEFAULT_LAYERS` from `LayerManager` and renders a row for
   each. **This is not what the map page uses.** It appears to be an
   older / alternate UI that is still maintained but not mounted on the
   main mapping route.

2. **`src/pages/MappingPageNew.tsx`** — the mapping page rendered at
   `/mapping`. Its `Layers` toolbar button opens a popup whose rows are
   **hardcoded inline in JSX**, not driven by `DEFAULT_LAYERS`. Search
   for `showCustomLayersMenu` to find the block (~line 2660 onward as
   of 2026-07-01).

Because the popup is hardcoded, adding an entry to `DEFAULT_LAYERS`
does nothing on its own. The layer state exists in the context and can
be toggled programmatically, but there's no UI to toggle it.

## Checklist for a new system layer

1. **Register in `LayerManager.tsx`.**
   - Add the layer type to the `LayerType` union.
   - Add a new entry to `DEFAULT_LAYERS` with `id`, `name`, `icon`,
     `description`, `defaultVisible`, `isSystemLayer`, and (if gated)
     `requiresPermission`.
   - If the layer has filter state (time range, mode, brand set, etc.),
     add corresponding `useState` hooks + setters and expose them on
     the context type.

2. **Add a row to `LayerPanel.tsx`.** Only needed if you want the
   generic panel to stay in sync. `visibleLayers.map(...)` handles the
   toggle row; for a filter block, wire a `{isVisible && layerId === '...' && ...}`
   guard similar to `MunicipalProjectFilters` /
   `CachedDemographicsFilters`.

3. **Add a row to the `MappingPageNew.tsx` hardcoded popup.**
   This is the one users actually see.
   - Destructure any new context values (filters, setters) from
     `useLayerManager()` at the top of the inner component.
   - Copy an existing row (Municipal Projects is a good template) and
     swap the layer id + icon + label + count binding.
   - If the layer has inline filters, render them inside a
     `{layerState.<layer_id>?.isVisible && (...)}` block so they only
     appear when the layer is on.
   - Respect `requiresPermission` with a `hasPermission(...)` guard
     wrapping the row (see `starbucks` / `starbucks_licensed_stores`).

4. **Mount the layer renderer.**
   Import your `<XxxLayer />` component near the top of
   `MappingPageNew.tsx` and mount it inside the map render tree.
   Follow the pattern of `MunicipalProjectsLayer` or
   `CachedDemographicsLayer` — pass `map`, `refreshTrigger`, and any
   click handlers, and drive visibility off
   `layerState.<layer_id>?.isVisible`.

5. **Wire any click-through behavior** (opening slideouts, seeding
   forms) in the callback prop, not inside the layer component.

## Why is there duplication?

`LayerPanel.tsx` predates `MappingPageNew.tsx`'s custom popup. Nobody
has consolidated them because they're used in different places (the
old panel is still referenced elsewhere, and the popup has
tightly-coupled inline filter widgets that don't fit the generic
pattern). Consolidating is a real refactor — until then, treat the two
menus as a coupled pair and update both.

## Related docs

- [DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md](DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md)
  — the original spec for Cached Demographics. Its "delivery summary"
  section originally assumed only `LayerPanel.tsx` needed updating;
  the popup wiring was retrofitted on 2026-07-01.
- [FEATURE_MAP_LAYERS_REQUIREMENTS.md](FEATURE_MAP_LAYERS_REQUIREMENTS.md)
  — the older custom-layer requirements doc.
- [FEATURE_2026_07_15_STARBUCKS_TARGET_AREA_OREP_EDITS.md](FEATURE_2026_07_15_STARBUCKS_TARGET_AREA_OREP_EDITS.md)
  — worked example of making a system layer **editable**: per-feature edit
  slideout, an editable style bucket for user-drawn features, a right-click
  "draw a polygon" flow, and RLS write policies gated on a matrix permission.
