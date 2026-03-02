# Terra Draw Migration

Migrated from Google Maps Drawing library to Terra Draw.

**Implemented:** March 2, 2026

---

## Background

Google's Drawing Library was deprecated in August 2025 and will be removed in May 2026. Terra Draw is the officially recommended replacement - MIT licensed, free, no API costs.

---

## Packages Installed

```bash
npm install terra-draw terra-draw-google-maps-adapter
```

---

## Files Created

### `src/utils/coordinateConversion.ts`

Coordinate system conversion utilities:

```typescript
// Terra Draw uses GeoJSON standard: [lng, lat]
// App storage uses Google Maps convention: [lat, lng]

terraDrawToAppCoords(coords)      // [lng, lat][] → [lat, lng][]
appToTerraDrawCoords(coords)      // [lat, lng][] → [lng, lat][]
convertTerraDrawFeature(feature)  // GeoJSON Feature → DrawnShape
extractCircleFromPolygon(polygon) // Polygon → { center, radius }
```

### `src/components/mapping/DrawingToolbarV2.tsx`

New Terra Draw implementation with same external interface:

```typescript
interface DrawingToolbarProps {
  map: google.maps.Map | null;
  isActive: boolean;
  selectedLayerId: string | null;
  onShapeComplete: (shape: DrawnShape) => void;
  onDone: () => void;
  onCancel: () => void;
  onFormatClick?: () => void;
  hasSelectedShape?: boolean;
}
```

---

## Terra Draw Mode Mapping

| App Type | Terra Draw Mode |
|----------|-----------------|
| polygon | `TerraDrawPolygonMode` |
| rectangle | `TerraDrawRectangleMode` |
| circle | `TerraDrawCircleMode` |
| polyline | `TerraDrawLineStringMode` |

---

## Files Modified

- `src/pages/MappingPageNew.tsx` - Updated import to DrawingToolbarV2
- `src/pages/portal/PortalMapPage.tsx` - Updated import to DrawingToolbarV2

---

## Files Renamed

- `DrawingToolbar.tsx` → `DrawingToolbarLegacy.tsx` (kept for rollback)

---

## Key Implementation Details

### Coordinate Conversion

Terra Draw outputs GeoJSON with `[lng, lat]` coordinates. The app stores coordinates as `[lat, lng]`. Conversion happens automatically in `convertTerraDrawFeature()`.

### Circle Handling

Terra Draw stores circles as polygon approximations (64 points). The `extractCircleFromPolygon()` function:
1. Calculates centroid of polygon points
2. Calculates average distance from centroid to points
3. Returns `{ center: [lat, lng], radius: meters }`

### Event Handling

```typescript
draw.on('finish', (id: string, context: { mode: string; action: string }) => {
  if (context.action === 'draw') {
    // Shape completed - convert and pass to onShapeComplete
  }
});
```

---

## Rollback Plan

If issues arise:
1. Change import from `DrawingToolbarV2` back to `DrawingToolbarLegacy`
2. No database changes needed - coordinate format unchanged
3. Legacy file retained for rollback capability

---

## Files Reference

```
src/components/mapping/DrawingToolbarV2.tsx      # New Terra Draw implementation
src/components/mapping/DrawingToolbarLegacy.tsx  # Legacy Google Drawing (rollback)
src/utils/coordinateConversion.ts                # Coordinate conversion utilities
```

---

## Future Work (Optional)

- Update `CustomLayerLayer.tsx` to use Terra Draw for editing existing shapes
  - Currently still uses Google Maps native editing which works fine
  - Could migrate to `TerraDrawSelectMode` for consistency
