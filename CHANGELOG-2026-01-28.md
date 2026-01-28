# Changelog - January 28, 2026

## Property Details and Site Submit Dashboard Improvements

### 1. Property Notes Field Enhancement
**Files Modified:**
- `src/components/property/PropertyDetailsSection.tsx`

**Changes:**
- Moved the "Property Notes" field from read-only display to editable section
- Positioned it directly under "Property Description" in the Property Details section
- Made the field fully editable with placeholder text
- Set as a multiline textarea with 4 rows
- Added tabIndex=4 for keyboard navigation

**Why:** Users need to be able to edit property notes directly from the property details section rather than having it as a read-only display.

**Commit:** `Move property notes to editable section in property details`

---

### 2. Property Map Navigation from Slideout
**Files Modified:**
- `src/pages/MappingPageNew.tsx`

**Problem:**
When clicking the map button (green icon) on the property slideout from the site submit dashboard, the map would open but show the user's current location instead of centering on the property's geolocation.

**Root Cause:**
- The `/mapping` route in App.tsx uses `MappingPageNew.tsx`, not `MappingPage.tsx`
- Initially added debug logging to the wrong file (MappingPage.tsx)
- MappingPageNew.tsx only handled `?property=ID&verify=true` mode, not plain `?property=ID`

**Solution:**
Added a new useEffect in MappingPageNew.tsx (lines 352-396) to handle property centering from URL parameter without verify mode:

```typescript
// Handle property centering from URL parameter (without verify mode)
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const propertyId = params.get('property');
  const verifyMode = params.get('verify') === 'true';

  if (propertyId && !verifyMode && mapInstance) {
    // Fetch FULL property data (needed for slideout)
    supabase
      .from('property')
      .select('*')
      .eq('id', propertyId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return;

        const lat = data.verified_latitude ?? data.latitude;
        const lng = data.verified_longitude ?? data.longitude;

        if (lat && lng) {
          // Center map on property
          mapInstance.setCenter({ lat, lng });
          mapInstance.setZoom(16);

          // Enable properties layer if not visible
          if (!layerState.properties?.isVisible) {
            toggleLayer('properties');
          }

          // Open the pin details slideout
          setSelectedPinData(data);
          setSelectedPinType('property');
          setPinDetailsInitialTab(undefined);
          setIsPinDetailsOpen(true);

          // Highlight the pin in orange
          setRecentlyCreatedPropertyIds(prev => new Set([...prev, propertyId]));
        }
      });
  }
}, [location.search, mapInstance, layerState.properties?.isVisible, toggleLayer]);
```

**Behavior:**
- Map centers on property coordinates (verified or regular)
- Zoom level set to 16
- Property pin highlighted in orange
- Property slideout opens automatically
- Properties layer enabled if not already visible

**Commits:**
1. `Add debug logging for property map centering to diagnose issue` (wrong file)
2. `Fix property map centering from slideout by updating MappingPageNew`
3. `Open property slideout and highlight pin when navigating from property sidebar`

---

### 3. Site Submit Slideout Opening from Property Sidebar
**Files Modified:**
- `src/pages/SiteSubmitDashboardPage.tsx`
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx` (interface only, callback exists)

**Problem:**
On the Dashboard tab of Site Submit Dashboard, when clicking on a site submit from within the property sidebar, nothing would happen. The site submit slideout should open but didn't.

**Root Cause:**
The PinDetailsSlideout component was calling `onViewSiteSubmitDetails` callback when a site submit was clicked, but this callback was not being passed from SiteSubmitDashboardPage to the PinDetailsSlideout components.

**Solution:**

1. **Added the missing callback handler:**
```typescript
const handleViewSiteSubmitDetails = useCallback((siteSubmit: any) => {
  console.log('📋 Opening site submit PIN DETAILS slideout from property sidebar (keeping property open):', siteSubmit);
  if (!siteSubmit?.id) {
    console.error('❌ No site submit ID found:', siteSubmit);
    return;
  }

  // Open the site submit pin details slideout (keeps property slideout open and nests them)
  setSelectedSiteSubmitData(siteSubmit);
  setIsSiteSubmitDetailsOpen(true);
  console.log('✅ Opened site submit pin details slideout:', siteSubmit.id, '(property slideout remains open)');
}, []);
```

2. **Added new state for site submit details slideout:**
```typescript
// Site Submit Details slideout (for viewing site submit from property)
const [isSiteSubmitDetailsOpen, setIsSiteSubmitDetailsOpen] = useState(false);
const [selectedSiteSubmitData, setSelectedSiteSubmitData] = useState<any>(null);
```

3. **Passed the callback to PinDetailsSlideout components:**
```typescript
<PinDetailsSlideout
  // ... other props
  onViewSiteSubmitDetails={handleViewSiteSubmitDetails}
/>
```

4. **Added a third PinDetailsSlideout for site submit details:**
```typescript
{/* Site Submit Details Slideout (for viewing site submit from property) */}
<PinDetailsSlideout
  isOpen={isSiteSubmitDetailsOpen}
  onClose={handleSiteSubmitDetailsClose}
  data={selectedSiteSubmitData}
  type="site_submit"
  onDataUpdate={handleDataUpdate}
  onOpenFullSiteSubmit={handleOpenFullSiteSubmit}
  rightOffset={isFullSiteSubmitOpen ? 800 : 0}
/>
```

**Behavior:**
- Clicking on a property opens the property pin details slideout
- Clicking on a site submit from within the property sidebar opens the site submit pin details slideout
- Both slideouts remain open and nest side-by-side (property shifts left, site submit appears on right)
- Matches the behavior when clicking pins on the map

**Slideout Hierarchy:**
```
Dashboard Table
  ↓ click property
Property Pin Details Slideout (500px wide)
  ↓ click site submit from submits tab
Site Submit Pin Details Slideout (500px wide, appears to the right)
  ↓ optional: click "View Full Details"
Full Site Submit Slideout (800px wide iframe, appears to the right)
```

**Right Offset Logic:**
- Property slideout: shifts left by 800px if full site submit open, or 500px if site submit details open
- Site submit details slideout: shifts left by 800px if full site submit open
- Full site submit slideout: always at right edge (0 offset)

**Commits:**
1. `Fix site submit slideout not opening from property sidebar` (added callback)
2. `Fix site submit to open pin details slideout instead of full slideout` (changed to pin details)
3. `Fix site submit slideout to nest with property slideout` (attempted full slideout nesting)
4. `Add nested pin details slideout for site submit` (final fix with proper pin details nesting)

**Debug Logging Added:**
Comprehensive console logging was added to track slideout state changes:
```typescript
useEffect(() => {
  console.log('🔄 Slideout states changed:', {
    isPinDetailsOpen,
    selectedPinType,
    selectedPinDataId: selectedPinData?.id,
    isPropertyDetailsOpen,
    selectedPropertyDataId: selectedPropertyData?.id,
    isSiteSubmitDetailsOpen,
    selectedSiteSubmitDataId: selectedSiteSubmitData?.id,
    isFullSiteSubmitOpen,
    fullSiteSubmitId
  });
}, [/* all dependencies */]);
```

---

## Architecture Notes

### Slideout Components Used

1. **PinDetailsSlideout** (from mapping)
   - Used for both property and site submit pin details
   - Smaller slideout with tabs (Property, Location, Submits, etc.)
   - Width: ~500px
   - Can be nested with other slideouts

2. **SiteSubmitSlideOut** (separate component)
   - Used for full site submit details
   - Iframe-based slideout showing full site submit page
   - Width: 800px
   - Used when "View Full Details" is clicked

### State Management

The SiteSubmitDashboardPage now manages multiple slideout states:

```typescript
// Primary pin details slideout (from clicking table rows)
isPinDetailsOpen, selectedPinData, selectedPinType

// Property details slideout (when viewing property from site submit)
isPropertyDetailsOpen, selectedPropertyData

// Site submit details slideout (when viewing site submit from property)
isSiteSubmitDetailsOpen, selectedSiteSubmitData

// Full site submit slideout (when opening full details)
isFullSiteSubmitOpen, fullSiteSubmitId
```

---

## Testing Performed

1. ✅ Property notes field is editable in property details section
2. ✅ Map button on property slideout centers map on property with orange pin
3. ✅ Map opens property slideout automatically when centering
4. ✅ Property pin is highlighted in orange on map
5. ✅ Clicking property from Dashboard table opens property slideout
6. ✅ Clicking site submit from property slideout opens site submit slideout
7. ✅ Both slideouts remain open and nest properly side-by-side
8. ✅ Slideouts use pin details component (not full iframe) for proper nesting
9. ✅ Behavior matches map pin clicking behavior

---

## Related Files

### Modified
- `src/components/property/PropertyDetailsSection.tsx`
- `src/pages/MappingPageNew.tsx`
- `src/pages/SiteSubmitDashboardPage.tsx`

### Referenced (interface/structure)
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx`
- `src/components/SiteSubmitSlideOut.tsx`
- `src/App.tsx` (routing discovery)

### Debug Files (not actively used)
- `src/pages/MappingPage.tsx` (added debug logging, but this route isn't used)

---

## Deployment

All changes deployed to production:
- Production URL: https://ovis.oculusrep.com
- Final deployment: January 28, 2026

## Git Commits

1. `Move property notes to editable section in property details`
2. `Add debug logging for property map centering to diagnose issue`
3. `Add comprehensive debugging for property map centering`
4. `Add even more comprehensive debugging for property map centering`
5. `Fix property map centering from slideout by updating MappingPageNew`
6. `Open property slideout and highlight pin when navigating from property sidebar`
7. `Add debug logging for site submit slideout issue`
8. `Fix site submit slideout not opening from property sidebar`
9. `Fix site submit to open pin details slideout instead of full slideout`
10. `Fix site submit slideout to nest with property slideout`
11. `Add nested pin details slideout for site submit`
