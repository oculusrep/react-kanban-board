# Site Submit Coordinate Management & Location Verification

## Overview

This document describes how site submit coordinates are managed in OVIS, including automatic population from properties, location verification workflow, and the coordinate priority system.

**Last Updated:** October 30, 2025
**Commit:** 5da4ae8

---

## Coordinate Fields

### Site Submit Table

The `site_submit` table contains the following coordinate fields:

- **`verified_latitude`** / **`verified_longitude`**: User-verified coordinates set by dragging pins on the map
- **`sf_property_latitude`** / **`sf_property_longitude`**: ⚠️ **DEPRECATED** - No longer used (legacy Salesforce cached data)

### Property Table

The `property` table contains:

- **`latitude`** / **`longitude`**: Primary OVIS property coordinates
- **`verified_latitude`** / **`verified_longitude`**: User-verified property coordinates

---

## Coordinate Priority System

When displaying site submits on the map, the system uses the following priority order:

1. **Site Submit Verified Coordinates**: `site_submit.verified_latitude/longitude`
2. **Property Verified Coordinates**: `property.verified_latitude/longitude`
3. **Property Coordinates**: `property.latitude/longitude`

If none of these exist, the site submit will not appear on the map.

### Implementation

See `getDisplayCoordinates()` function in [SiteSubmitLayer.tsx](../src/components/mapping/layers/SiteSubmitLayer.tsx):

```typescript
const getDisplayCoordinates = (siteSubmit: SiteSubmit) => {
  // First priority: Verified site submit coordinates
  if (siteSubmit.verified_latitude && siteSubmit.verified_longitude) {
    return {
      lat: siteSubmit.verified_latitude,
      lng: siteSubmit.verified_longitude,
      verified: true
    };
  }

  // Second priority: Property coordinates (prefer verified, fallback to regular)
  if (siteSubmit.property) {
    const propertyLat = siteSubmit.property.verified_latitude ?? siteSubmit.property.latitude;
    const propertyLng = siteSubmit.property.verified_longitude ?? siteSubmit.property.longitude;

    if (propertyLat && propertyLng) {
      return {
        lat: propertyLat,
        lng: propertyLng,
        verified: false
      };
    }
  }

  return null;
};
```

---

## Creating Site Submits

### From Property Sidebar

When creating a site submit from the Property Info Sidebar:

1. **Component**: [PropertySidebar.tsx](../src/components/property/PropertySidebar.tsx)
2. **Behavior**: Automatically fetches property coordinates on load
3. **Passed to Modal**: `initialLatitude` and `initialLongitude` props
4. **Result**: Site submit inherits property coordinates as `verified_latitude/longitude`

**Key Code:**
```typescript
// PropertySidebar loads coordinates
const { data: property } = await supabase
  .from('property')
  .select('contact_id, latitude, longitude, verified_latitude, verified_longitude')
  .eq('id', propertyId)
  .single();

const lat = property.verified_latitude ?? property.latitude;
const lng = property.verified_longitude ?? property.longitude;
setPropertyCoordinates({ latitude: lat, longitude: lng });

// Passes to modal
<SiteSubmitFormModal
  propertyId={propertyId}
  initialLatitude={propertyCoordinates.latitude ?? undefined}
  initialLongitude={propertyCoordinates.longitude ?? undefined}
  onSave={(newSiteSubmit) => { ... }}
/>
```

### From Map Pin Drop

When creating a site submit by dropping a pin on the map:

1. **Component**: [PinDetailsSlideout.tsx](../src/components/mapping/slideouts/PinDetailsSlideout.tsx)
2. **Behavior**: User clicks on map to drop a pin at desired location
3. **Saved as**: `verified_latitude/longitude` (user-verified coordinates)
4. **Result**: Site submit appears at exact pin drop location

**Key Code:**
```typescript
const insertData = {
  site_submit_name: siteSubmitName,
  property_id: siteSubmit.property_id,
  client_id: selectedClient.id,
  verified_latitude: propertyCoords.lat,  // User-verified coordinates from map pin
  verified_longitude: propertyCoords.lng, // User-verified coordinates from map pin
  // ... other fields
};
```

### From Assignment

When creating a site submit from an assignment:
1. Coordinates are NOT automatically populated
2. User must manually enter coordinates or verify location later
3. Site submit will use property coordinates for map display (if property has coordinates)

---

## Location Verification Workflow

### "Verify Location" Button

Every site submit detail page includes a **"Verify Location"** button (purple button with map pin icon).

**Component**: [SiteSubmitDetailsPage.tsx](../src/pages/SiteSubmitDetailsPage.tsx)

**Behavior:**
1. Opens map in new browser tab
2. URL includes query parameters: `/map?site-submit={id}&verify=true`
3. Map automatically zooms to site submit location (zoom level 18)
4. Pin details slideout opens with Location tab active
5. User can drag the pin to adjust coordinates
6. Coordinates save automatically as `verified_latitude/longitude`

**Visual Location:**
- Appears in the header button group
- Located before "Submit Site" (email) button
- Only visible on existing site submits (not new)

**Code:**
```typescript
<button
  onClick={() => window.open(`/map?site-submit=${siteSubmitId}&verify=true`, '_blank')}
  className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 flex items-center gap-1.5"
  title="Open map to verify location"
>
  <svg>...</svg>
  Verify Location
</button>
```

### Map URL Parameter Handling

**Component**: [MappingPageNew.tsx](../src/pages/MappingPageNew.tsx)

When the map loads with `?site-submit={id}&verify=true`:

1. Fetches site submit with coordinates
2. Determines best coordinates using priority system
3. Centers map at coordinates with zoom level 18
4. Opens pin details slideout automatically
5. Sets initial tab to "Location"
6. Shows toast message with instructions

**Code Flow:**
```typescript
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const siteSubmitId = params.get('site-submit');
  const verifyMode = params.get('verify') === 'true';

  if (siteSubmitId && verifyMode && mapInstance) {
    // Fetch site submit data
    supabase.from('site_submit').select(`
      id, site_submit_name,
      verified_latitude, verified_longitude,
      property!site_submit_property_id_fkey (
        latitude, longitude,
        verified_latitude, verified_longitude
      )
    `).eq('id', siteSubmitId).single()
    .then(({ data }) => {
      // Determine coordinates (priority: verified site submit > property)
      let lat = data.verified_latitude;
      let lng = data.verified_longitude;

      if (!lat || !lng) {
        lat = data.property?.verified_latitude ?? data.property?.latitude;
        lng = data.property?.verified_longitude ?? data.property?.longitude;
      }

      // Zoom and open slideout
      mapInstance.setCenter({ lat, lng });
      mapInstance.setZoom(18);
      setSelectedPinData(data);
      setSelectedPinType('site_submit');
      setPinDetailsInitialTab('location');
      setIsPinDetailsOpen(true);
    });
  }
}, [location.search, mapInstance]);
```

---

## Dragging Pins to Verify Location

### Existing Functionality

Users can drag site submit pins on the map to verify/adjust their location:

1. **Enable drag mode**: Right-click pin → "Verify Location"
2. **Drag pin**: Click and drag to new location
3. **Auto-save**: Coordinates save automatically as `verified_latitude/longitude`
4. **Visual indicator**: Pin changes to green checkmark when verified

### Verified Pin Display

Pins with `verified_latitude/longitude` display differently:
- **Icon**: Green checkmark marker
- **Function**: `createVerifiedStageMarkerIcon()` in [SiteSubmitPin.tsx](../src/components/mapping/SiteSubmitPin.tsx)
- **Color**: Green overlay on stage color

---

## Map Query & Filtering

### Query Structure

**Component**: [SiteSubmitLayer.tsx](../src/components/mapping/layers/SiteSubmitLayer.tsx)

The map layer queries site submits with a join to the property table:

```sql
SELECT
  id,
  site_submit_name,
  verified_latitude,
  verified_longitude,
  -- ... other fields
  property!site_submit_property_id_fkey (
    latitude,
    longitude,
    verified_latitude,
    verified_longitude
    -- ... other property fields
  )
FROM site_submit
```

**No database-level coordinate filtering** - all site submits are fetched, then filtered in JavaScript using `getDisplayCoordinates()`.

### Loading Modes

The map supports different loading strategies:

- **`static-100`** (default): First 100 site submits
- **`static-500`**: First 500 site submits
- **`static-all`**: All site submits (with pagination)
- **`client-filtered`**: Site submits for selected client only

After fetching, results are filtered to only include those with valid coordinates:

```typescript
const validSiteSubmits = (data || []).filter(siteSubmit =>
  getDisplayCoordinates(siteSubmit) !== null
);
```

---

## Migration from Salesforce Coordinates

### Previous System (Deprecated)

- Used `sf_property_latitude` and `sf_property_longitude` fields
- Cached Salesforce coordinate data in OVIS database
- Mixed data sources (OVIS vs Salesforce)

### Current System (Active)

- Uses OVIS property coordinates exclusively
- Clearer data ownership and priority
- Single source of truth per coordinate type

### Backward Compatibility

- `sf_property_latitude/longitude` fields still exist in database schema
- TypeScript interfaces may still include them for old data
- **These fields are never populated for new records**
- Display logic ignores these fields completely

---

## Troubleshooting

### Site Submit Not Showing on Map

**Possible Causes:**
1. Site submit has no `verified_latitude/longitude`
2. Associated property has no coordinates
3. Site submit is outside current map loading mode limits

**Solution:**
1. Click "Verify Location" button on site submit page
2. Or add coordinates to the associated property
3. Or use map pin drop to create site submit at specific location

### Coordinates Not Saving

**Check:**
1. User has permissions to update site_submit table
2. Property exists and has valid property_id foreign key
3. Browser console for JavaScript errors
4. Network tab for failed Supabase requests

### Wrong Location on Map

**Fix:**
1. Click "Verify Location" button
2. Drag pin to correct location
3. Coordinates auto-save as verified

---

## Related Files

### Core Components
- [PropertySidebar.tsx](../src/components/property/PropertySidebar.tsx) - Auto-populate property coordinates
- [SiteSubmitDetailsPage.tsx](../src/pages/SiteSubmitDetailsPage.tsx) - "Verify Location" button
- [MappingPageNew.tsx](../src/pages/MappingPageNew.tsx) - URL parameter handling
- [SiteSubmitLayer.tsx](../src/components/mapping/layers/SiteSubmitLayer.tsx) - Coordinate priority logic
- [PinDetailsSlideout.tsx](../src/components/mapping/slideouts/PinDetailsSlideout.tsx) - Pin drop creation

### Supporting Components
- [SiteSubmitFormModal.tsx](../src/components/SiteSubmitFormModal.tsx) - Accepts initial coordinates
- [SiteSubmitContextMenu.tsx](../src/components/mapping/SiteSubmitContextMenu.tsx) - Display coordinates
- [SiteSubmitPin.tsx](../src/components/mapping/SiteSubmitPin.tsx) - Verified marker icons

### Utilities & Hooks
- [useClientSearch.ts](../src/hooks/useClientSearch.ts) - Client site submit counts

---

## Best Practices

### For Developers

1. **Always use property coordinates** - Never reference `sf_property_latitude/longitude`
2. **Follow priority order** - Verified site submit > verified property > property
3. **Include property join** - Always join to property table when querying site submits for map display
4. **Filter in application** - Don't try to filter coordinates at database level (can't filter on joined fields)

### For Users

1. **Create from Property Sidebar** - Automatically inherits coordinates
2. **Use "Verify Location" button** - Easy way to check and adjust location
3. **Drag pins when needed** - Fine-tune exact location on map
4. **Verify property coordinates first** - If site submits show in wrong location, check property coordinates

---

## Future Enhancements

Potential improvements to consider:

- [ ] Bulk location verification tool
- [ ] Coordinate quality indicators (accuracy radius)
- [ ] Geocoding suggestions when coordinates missing
- [ ] Location history/audit trail
- [ ] Automatic coordinate validation on save
