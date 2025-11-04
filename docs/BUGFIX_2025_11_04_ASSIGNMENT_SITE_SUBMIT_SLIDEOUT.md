# Bug Fix: Assignment Site Submit Slideout Issue

**Date:** November 4, 2025
**Component:** AssignmentSidebar
**Issue Type:** Wrong component being rendered

## Problem

When clicking a site submit from the "Associated Site Submits" section in the Assignment Info sidebar, the wrong sidebar component was being displayed:

- **Wrong behavior:** Displayed narrow "Site Submit Info" sidebar (600px width) using `SiteSubmitSidebar` component
- **Expected behavior:** Should display full "Site Submit Details" slideout (800px width) using `SiteSubmitSlideOut` component - the same view shown when clicking site submits from the top navigation

## Root Cause

The `AssignmentSidebar` component was using `SiteSubmitSidebar` (a minimalistic sidebar component) instead of `SiteSubmitSlideOut` (the full slideout panel component) when users clicked on site submits from the Associated Site Submits list.

## Solution

Updated [AssignmentSidebar.tsx](src/components/AssignmentSidebar.tsx) to use the correct `SiteSubmitSlideOut` component for consistency across the application.

### Changes Made

1. **Import statement** (line 5):
   ```typescript
   // Before
   import SiteSubmitSidebar from './SiteSubmitSidebar';

   // After
   import SiteSubmitSlideOut from './SiteSubmitSlideOut';
   ```

2. **State variables** (lines 116-117):
   ```typescript
   // Before
   const [siteSubmitSidebarOpen, setSiteSubmitSidebarOpen] = useState(false);
   const [siteSubmitSidebarId, setSiteSubmitSidebarId] = useState<string | null>(null);
   const [siteSubmitSidebarMinimized, setSiteSubmitSidebarMinimized] = useState(false);

   // After
   const [siteSubmitSlideoutOpen, setSiteSubmitSlideoutOpen] = useState(false);
   const [siteSubmitSlideoutId, setSiteSubmitSlideoutId] = useState<string | null>(null);
   // Removed minimize state (not needed for slideout)
   ```

3. **Click handler** (lines 297-301):
   ```typescript
   onClick={(id) => {
     setSiteSubmitSlideoutId(id);
     setSiteSubmitSlideoutOpen(true);
     onSiteSubmitModalChange?.(true);
   }}
   ```

4. **Component rendering** (lines 330-342):
   ```typescript
   // Before
   {siteSubmitSidebarOpen && siteSubmitSidebarId && (
     <SiteSubmitSidebar
       siteSubmitId={siteSubmitSidebarId}
       isMinimized={siteSubmitSidebarMinimized}
       onMinimize={() => setSiteSubmitSidebarMinimized(!siteSubmitSidebarMinimized)}
       onClose={...}
       propertySlideoutOpen={propertyDetailsSlideout.isOpen}
       propertySlideoutMinimized={propertyMinimized}
     />
   )}

   // After
   {siteSubmitSlideoutOpen && siteSubmitSlideoutId && (
     <SiteSubmitSlideOut
       isOpen={siteSubmitSlideoutOpen}
       siteSubmitId={siteSubmitSlideoutId}
       onClose={...}
       propertySlideoutOpen={propertyDetailsSlideout.isOpen}
       propertySlideoutMinimized={propertyMinimized}
     />
   )}
   ```

5. **Event listener update** (line 199):
   ```typescript
   // Updated to use new state variable
   if (event.data.type === 'OPEN_PROPERTY_SLIDEOUT' && siteSubmitSlideoutOpen) {
   ```

## Testing

- Build completed successfully with no TypeScript errors
- Component now uses the same slideout view regardless of entry point (top nav or assignment sidebar)

## Impact

- **User Experience:** Consistent UI when viewing site submits from any location in the application
- **Component Usage:** Properly uses the full-featured `SiteSubmitSlideOut` component instead of the minimal `SiteSubmitSidebar`
- **Code Quality:** Reduces confusion by having a single, consistent way to view site submit details

## Related Components

- [SiteSubmitSlideOut.tsx](src/components/SiteSubmitSlideOut.tsx) - Full slideout panel (800px, with minimize capability)
- [SiteSubmitSidebar.tsx](src/components/SiteSubmitSidebar.tsx) - Minimal sidebar (600px, different purpose)
- [AssignmentSidebar.tsx](src/components/AssignmentSidebar.tsx) - Fixed component
- [Navbar.tsx](src/components/Navbar.tsx) - Uses correct `SiteSubmitSlideOut` component
