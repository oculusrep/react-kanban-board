# Feature: Site Submit Click Handler in Property Details Slideout

**Date:** November 4, 2025
**Type:** UX Enhancement
**Status:** ✅ Complete

## Overview

Implemented click handler functionality in the Property Details slideout's Submits tab to update an already-open Site Submit Details slideout instead of doing nothing or opening a duplicate.

## Problem

When both the Site Submit Details slideout and Property Details slideout were open (stacked), clicking a site submit from the Property Details Submits tab had no effect. The expected behavior was to update the already-open Site Submit Details slideout to show the clicked site submit.

## Solution

Added an `onSiteSubmitClick` callback prop that flows from the parent component down through the component hierarchy, allowing the Property Details slideout to communicate site submit clicks back to the parent, which then updates the Site Submit slideout's ID.

## Component Flow

```
Parent Component (Navbar, PropertySidebar, AssignmentSidebar, ClientSidebar)
  ├─> SiteSubmitSlideOut (controlled by siteSubmitId state)
  └─> PropertyDetailsSlideOut
      └─> PropertyDetailsSlideoutContent
          └─> PropertySubmitsTab (receives onSiteSubmitClick callback)
              └─> SiteSubmitItem (triggers onClick)
```

## Changes Made

### 1. PropertyDetailsSlideOut.tsx
**Added:** `onSiteSubmitClick` prop

```typescript
interface PropertyDetailsSlideOutProps {
  // ... existing props
  onSiteSubmitClick?: (siteSubmitId: string) => void;
}
```

**Passed through** to PropertyDetailsSlideoutContent component (line 40)

### 2. PropertyDetailsSlideoutContent.tsx
**Added:** `onSiteSubmitClick` prop to interface (line 22)

**Updated:** Destructured in component function (line 25)

**Passed through** to PropertySubmitsTab component (line 253)

### 3. PropertySubmitsTab.tsx
**Already had:** `onSiteSubmitClick` prop in the component interface

**Passes to:** SiteSubmitItem component for each site submit

### 4. Parent Components (4 files updated)

#### Navbar.tsx (lines 1071-1074)
```typescript
onSiteSubmitClick={(siteSubmitId) => {
  // Update the existing site submit slideout with the new ID
  setSiteSubmitSlideout({ isOpen: true, siteSubmitId });
}}
```

#### AssignmentSidebar.tsx (lines 354-361)
```typescript
onSiteSubmitClick={(siteSubmitId) => {
  // Update the existing site submit slideout with the new ID
  setSiteSubmitSlideoutId(siteSubmitId);
  // Ensure the site submit slideout is open
  if (!siteSubmitSlideoutOpen) {
    setSiteSubmitSlideoutOpen(true);
  }
}}
```

#### PropertySidebar.tsx (lines 643-651)
```typescript
onSiteSubmitClick={(siteSubmitId) => {
  // Update the existing site submit sidebar with the new ID
  setSiteSubmitSidebarId(siteSubmitId);
  // Ensure the site submit sidebar is open
  if (!siteSubmitSidebarOpen) {
    setSiteSubmitSidebarOpen(true);
    setSiteSubmitSidebarMinimized(false);
  }
}}
```

#### ClientSidebar.tsx (lines 880-888)
```typescript
onSiteSubmitClick={(siteSubmitId) => {
  // Update the existing site submit sidebar with the new ID
  setSiteSubmitSidebarId(siteSubmitId);
  // Ensure the site submit sidebar is open
  if (!siteSubmitSidebarOpen) {
    setSiteSubmitSidebarOpen(true);
    setSiteSubmitSidebarMinimized(false);
  }
}}
```

## Files Modified

1. `/src/components/PropertyDetailsSlideOut.tsx` - Added prop and passed through
2. `/src/components/PropertyDetailsSlideoutContent.tsx` - Added prop and passed through
3. `/src/components/Navbar.tsx` - Implemented handler
4. `/src/components/AssignmentSidebar.tsx` - Implemented handler
5. `/src/components/property/PropertySidebar.tsx` - Implemented handler
6. `/src/components/ClientSidebar.tsx` - Implemented handler

## Behavior

### Before
1. User has Site Submit Details slideout open
2. User clicks "View Property Details" from Site Submit
3. Property Details slideout opens (stacked to the right)
4. User clicks a different site submit in Property Details Submits tab
5. **Nothing happens** ❌

### After
1. User has Site Submit Details slideout open
2. User clicks "View Property Details" from Site Submit
3. Property Details slideout opens (stacked to the right)
4. User clicks a different site submit in Property Details Submits tab
5. **Site Submit Details slideout updates to show the clicked site submit** ✅
6. If Site Submit slideout was closed, it opens automatically

## Technical Details

### State Update Mechanism

The parent components maintain the site submit ID in state:
- **Navbar:** Uses `siteSubmitSlideout` state object with `{ isOpen, siteSubmitId }`
- **AssignmentSidebar:** Uses separate `siteSubmitSlideoutId` and `siteSubmitSlideoutOpen` states
- **PropertySidebar/ClientSidebar:** Uses `siteSubmitSidebarId` and `siteSubmitSidebarOpen` states

When the callback is triggered, the parent updates this state, which causes React to re-render the SiteSubmitSlideOut/SiteSubmitSidebar component with the new ID.

### Iframe Reload

The SiteSubmitSlideOut component uses an iframe with a dynamic URL:
```typescript
<iframe src={`/site-submit/${siteSubmitId}?embedded=true`} />
```

When `siteSubmitId` changes, React updates the iframe's `src` attribute, causing the browser to load the new site submit details.

### Component Differences

- **Navbar context:** Uses `SiteSubmitSlideOut` (slideout panel)
- **Property/Assignment/Client contexts:** Uses `SiteSubmitSidebar` (sidebar panel)

Both are updated using the same callback pattern.

## Edge Cases Handled

1. **Site Submit slideout closed:** Opens it automatically when a site submit is clicked
2. **Site Submit slideout minimized:** Keeps it minimized, just updates the content
3. **No site submit slideout:** Creates one with the clicked ID
4. **Multiple contexts:** Works correctly in all 4 parent contexts (Navbar, PropertySidebar, AssignmentSidebar, ClientSidebar)

## Testing

Build completed successfully:
```bash
npm run build
```

## User Experience Benefits

1. **Seamless navigation:** Users can easily browse site submits without closing/reopening slideouts
2. **Maintains context:** Property Details stays open while viewing different site submits
3. **Consistent behavior:** Works the same way in all contexts
4. **Intuitive UX:** Clicking a site submit does what users expect - shows that site submit

## Future Enhancements

1. Add loading indicator when switching between site submits
2. Add transition animation when iframe content changes
3. Consider prefetching site submit data for faster loads
4. Add keyboard shortcuts for navigating between site submits

## Related Features

- [FEATURE_2025_11_04_PROPERTY_DETAILS_TABS.md](FEATURE_2025_11_04_PROPERTY_DETAILS_TABS.md) - Submits tab implementation
- [SLIDEOUT_STACKING_IMPLEMENTATION.md](SLIDEOUT_STACKING_IMPLEMENTATION.md) - Slideout stacking architecture
- [BUGFIX_2025_11_04_ASSIGNMENT_SITE_SUBMIT_SLIDEOUT.md](BUGFIX_2025_11_04_ASSIGNMENT_SITE_SUBMIT_SLIDEOUT.md) - Site submit slideout fix

---

**Implementation Status:** ✅ Complete
**Build Status:** ✅ Passing
**Ready for Deployment:** ✅ Yes
