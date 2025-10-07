# Mapping Context Menu Bug Fix

**Date**: October 7, 2025
**Issue**: Multiple context menus appearing simultaneously when right-clicking on map markers
**Status**: ✅ RESOLVED

---

## 🐛 Problem Description

When right-clicking on a property or site submit marker on the mapping page, **both** the marker-specific context menu AND the map's general context menu would appear at the same time.

### Expected Behavior:
- Right-click on property marker → Show only property context menu (Verify Pin Location, Copy Coordinates, View in Google Maps)
- Right-click on site submit marker → Show only site submit context menu
- Right-click on empty map area → Show map context menu (Create Property, etc.)

### Actual Behavior:
- Right-click on property marker → **Both property context menu AND map context menu appeared**
- This created a confusing UX with overlapping menus

---

## 🔍 Root Cause

The issue was caused by **event propagation between Google Maps marker events and DOM events**:

1. Google Maps markers have their own event system (`marker.addListener('rightclick', ...)`)
2. The map's context menu was attached to the **map div DOM element** using `addEventListener('contextmenu', ...)`
3. When a marker was right-clicked:
   - The marker's right-click handler fired (showing property/site submit menu)
   - The event propagated to the map div's DOM
   - The map div's `contextmenu` listener also fired (showing map menu)
4. Google Maps' `event.preventDefault()` and `event.stopPropagation()` only work within the Google Maps event system, not the browser's DOM event system

### Why DOM-Based Detection Failed:
Initial attempts to detect if the click target was a marker (checking for `IMG` tags, `aria-label` attributes, etc.) failed because:
- Google Maps renders markers in complex ways (canvas overlays, dynamically positioned elements)
- The DOM structure changes based on zoom level and marker clustering
- No reliable way to identify marker elements from the DOM alone

---

## ✅ Solution

Implemented a **flag-based suppression system** using React state:

### 1. Added Suppression Flag
```typescript
const [suppressMapContextMenu, setSuppressMapContextMenu] = useState<boolean>(false);
```

### 2. Changed Map Right-Click Handler
**Before** (DOM-based):
```typescript
// ❌ Attached to DOM element - fires regardless of marker clicks
mapDiv.addEventListener('contextmenu', (e: MouseEvent) => {
  // Show map context menu
});
```

**After** (Google Maps API):
```typescript
// ✅ Use Google Maps native event system
map.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
  // Check suppression flag BEFORE showing map context menu
  if (suppressMapContextMenu) {
    console.log('🚫 Marker was right-clicked, skipping map context menu');
    return;
  }

  // Show map context menu only if flag is not set
  setContextMenu({
    isVisible: true,
    x: event.domEvent.clientX,
    y: event.domEvent.clientY,
    coordinates: { lat, lng },
  });
});
```

### 3. Set Flag in Marker Handlers
**Property Marker Right-Click**:
```typescript
const handlePropertyRightClick = (property: any, x: number, y: number) => {
  // Set flag to suppress map context menu
  setSuppressMapContextMenu(true);
  setTimeout(() => setSuppressMapContextMenu(false), 100);

  // Show property context menu
  setPropertyContextMenu({
    isVisible: true,
    x, y, property,
  });
};
```

**Site Submit Marker Right-Click**:
```typescript
const handleSiteSubmitRightClick = (siteSubmit: any, x: number, y: number) => {
  // Set flag to suppress map context menu
  setSuppressMapContextMenu(true);
  setTimeout(() => setSuppressMapContextMenu(false), 100);

  // Show site submit context menu
  setSiteSubmitContextMenu({
    isVisible: true,
    x, y, siteSubmit,
  });
};
```

### 4. Key Timing Details
- **Flag Duration**: 100ms timeout is sufficient because Google Maps processes events sequentially
- **Event Order**: Marker `rightclick` fires → Handler sets flag → Map `rightclick` fires → Map handler checks flag
- **Auto-Reset**: Flag automatically resets after timeout to ensure map right-clicks work normally

---

## 📁 Files Modified

### Primary Fix:
- **[/src/pages/MappingPageNew.tsx](src/pages/MappingPageNew.tsx)**
  - Added `suppressMapContextMenu` state (line ~126)
  - Changed map right-click handler to use Google Maps API (lines ~186-206)
  - Modified `handlePropertyRightClick` to set suppression flag (lines ~365-367)
  - Modified `handleSiteSubmitRightClick` to set suppression flag (lines ~393-395)

---

## 🎓 Key Learnings

### Why This Pattern Works:
1. **Native API Integration**: Using Google Maps' `rightclick` event instead of DOM `contextmenu` ensures events fire in the correct order
2. **Flag-Based Suppression**: Simple boolean flag is more reliable than trying to detect marker elements in the DOM
3. **Automatic Reset**: Short timeout ensures the flag doesn't interfere with subsequent interactions

### When to Use This Pattern:
- **Any time you have overlapping event systems** (Google Maps + DOM, Leaflet + DOM, etc.)
- **Custom UI over third-party map libraries** that handle events differently than browser
- **Context menus or tooltips** that need to be mutually exclusive

### Anti-Patterns to Avoid:
- ❌ Don't rely on DOM element inspection for Google Maps markers
- ❌ Don't use `event.stopPropagation()` across different event systems
- ❌ Don't try to detect marker clicks by parsing CSS classes or aria-labels
- ❌ Don't use long timeout values (>200ms) as it degrades UX

---

## 🧪 Testing Checklist

When implementing similar fixes, verify:

- [ ] Right-click on property marker → Only property context menu appears
- [ ] Right-click on site submit marker → Only site submit context menu appears
- [ ] Right-click on empty map area → Only map context menu appears
- [ ] Multiple rapid right-clicks don't cause menu conflicts
- [ ] Context menus close properly when clicking elsewhere
- [ ] Flag resets don't interfere with normal map interactions
- [ ] Works with marker clustering enabled
- [ ] Works at different zoom levels

---

## 🔮 Future Considerations

### If This Pattern Needs Extension:
1. **Multiple Marker Types**: Add similar suppression flags for each marker type
2. **Long-Press Mobile**: Consider similar pattern for mobile long-press events
3. **Hover Interactions**: May need separate flag for hover-based tooltips
4. **Custom Overlays**: If adding custom Google Maps overlays, they'll need similar handling

### If the Bug Returns:
1. Check that marker right-click handlers are setting the suppression flag
2. Verify the map's right-click handler is checking the flag
3. Ensure timeout duration is appropriate (100ms is usually sufficient)
4. Check that `map.addListener('rightclick')` is being used, not DOM `contextmenu`

---

## 📚 Related Documentation

- [MAPPING_SYSTEM_QUICK_START.md](MAPPING_SYSTEM_QUICK_START.md) - Mapping system overview
- [MAPPING_SYSTEM_DEVELOPMENT_PLAN.md](MAPPING_SYSTEM_DEVELOPMENT_PLAN.md) - Architecture details
- [Google Maps Events Documentation](https://developers.google.com/maps/documentation/javascript/events)

---

**Pattern Summary**: When dealing with overlapping event systems (Google Maps + DOM), use flag-based suppression with the native API's event system rather than trying to detect elements in the DOM.
