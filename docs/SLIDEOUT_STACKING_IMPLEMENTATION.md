# Slideout Stacking Implementation

## Overview
This document describes the implementation of independent minimize controls for stacked slideouts in the application, specifically for Site Submit Details and Property Details slideouts.

## Problem Statement
The original implementation had a "View Property Details" link in Site Submit Details that didn't work properly. When both slideouts were open, they needed to:
1. Stack properly (both visible simultaneously)
2. Have independent minimize/expand controls
3. Adjust positioning dynamically based on each other's state
4. Display labels clearly without overlap when minimized

## Solution Architecture

### Component Hierarchy
```
Parent Components (Navbar, PropertySidebar, AssignmentSidebar, ClientSidebar)
  └── SiteSubmitSlideOut / SiteSubmitSidebar (left slideout)
      └── PropertyDetailsSlideOut (right slideout)
          └── SlideOutPanel (reusable base component)
```

### Key Components Modified

#### 1. SlideOutPanel.tsx
**Purpose**: Reusable base component for all slideouts

**Changes**:
- Added controlled minimize state support via `isMinimized` and `onMinimizeChange` props
- Positioned minimized labels at `calc(50% - 100px)` to avoid arrow button overlap
- Supports both controlled and uncontrolled minimize state modes

```typescript
interface SlideOutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
  canMinimize?: boolean;
  rightOffset?: number;
  isMinimized?: boolean;              // NEW: Controlled minimize state
  onMinimizeChange?: (minimized: boolean) => void;  // NEW: State change callback
}
```

#### 2. SiteSubmitSlideOut.tsx
**Purpose**: Site Submit slideout wrapper for Navbar context

**Changes**:
- Added `propertySlideoutMinimized` prop
- Calculates dynamic `rightOffset` based on Property Details state:
  - Property expanded: `900px`
  - Property minimized: `48px`
  - Property closed: `0px`

```typescript
const rightOffset = propertySlideoutOpen
  ? (propertySlideoutMinimized ? 48 : 900)
  : 0;
```

#### 3. SiteSubmitSidebar.tsx
**Purpose**: Site Submit sidebar for property/assignment/client page contexts

**Changes**:
- Same stacking logic as SiteSubmitSlideOut
- Calculates `rightPosition` dynamically

```typescript
const rightPosition = propertySlideoutOpen
  ? (propertySlideoutMinimized ? '48px' : '900px')
  : '0';
```

#### 4. PropertyDetailsSlideOut.tsx
**Purpose**: Property Details slideout wrapper

**Changes**:
- Added `isMinimized` and `onMinimizeChange` props
- Passes these props through to SlideOutPanel for controlled state

#### 5. Parent Components (Navbar, PropertySidebar, AssignmentSidebar, ClientSidebar)
**Changes**:
- Added `propertyMinimized` state tracking
- Pass both `propertySlideoutOpen` and `propertySlideoutMinimized` to child slideouts
- Handle minimize state changes via `onMinimizeChange` callback
- Reset minimize state when slideout closes

```typescript
const [propertyMinimized, setPropertyMinimized] = useState(false);

// In render:
<SiteSubmitSlideOut
  propertySlideoutOpen={propertyDetailsSlideout.isOpen}
  propertySlideoutMinimized={propertyMinimized}
/>

<PropertyDetailsSlideOut
  isMinimized={propertyMinimized}
  onMinimizeChange={setPropertyMinimized}
/>
```

## User Experience

### Stacking States

**State 1: Both Expanded**
- Property Details: 900px wide at right edge
- Site Submit: 800px wide at 900px offset
- Both full content visible side-by-side

**State 2: Property Minimized, Site Submit Expanded**
- Property Details: 48px wide at right edge (minimized bar)
- Site Submit: 800px wide at 48px offset
- Site Submit has more horizontal space

**State 3: Both Minimized**
- Property Details: 48px wide at right edge
- Site Submit: 48px wide at 48px offset
- Two narrow bars stacked, labels visible above arrows

**State 4: Site Submit Minimized, Property Expanded**
- Property Details: 900px wide at right edge
- Site Submit: 48px wide at 900px offset (minimized bar)
- Property Details has full width

### Label Positioning
- Minimized labels positioned at `calc(50% - 100px)` (100px above center)
- Arrow buttons positioned at `50%` (vertical center)
- Labels rotated -90 degrees for vertical display
- Clear separation prevents overlap

## Technical Details

### State Management Flow
1. User clicks minimize arrow on Property Details
2. SlideOutPanel calls `onMinimizeChange(true)`
3. Parent component updates `propertyMinimized` state
4. Site Submit receives new `propertySlideoutMinimized` prop
5. Site Submit recalculates `rightOffset` to 48px
6. CSS transition animates the position change

### CSS Transitions
All position changes use smooth transitions:
```css
transition-all duration-300 ease-in-out
```

### Z-Index Management
- Overlay: `z-40` (only shown for rightmost panel)
- Slideout panels: `z-50`
- Minimize buttons: `z-[100]`

## Files Changed

### Modified Files (8 total)
1. `src/components/SlideOutPanel.tsx` - Base slideout component
2. `src/components/PropertyDetailsSlideOut.tsx` - Property slideout wrapper
3. `src/components/SiteSubmitSlideOut.tsx` - Site Submit slideout for Navbar
4. `src/components/SiteSubmitSidebar.tsx` - Site Submit sidebar for pages
5. `src/components/Navbar.tsx` - Master pipeline context
6. `src/components/property/PropertySidebar.tsx` - Property page context
7. `src/components/AssignmentSidebar.tsx` - Assignment page context
8. `src/components/ClientSidebar.tsx` - Client page context

### Lines Changed
- Total: 88 insertions, 20 deletions
- Net: +68 lines

## Benefits

1. **Independent Control**: Each slideout can be minimized/expanded without affecting the other
2. **Space Efficiency**: When Property Details is minimized, Site Submit gets more horizontal space
3. **Visual Clarity**: Labels clearly visible above arrows when both are minimized
4. **Smooth UX**: All transitions are smooth and predictable
5. **Consistent Behavior**: Same stacking logic across all contexts (Navbar, Property, Assignment, Client pages)
6. **Reusable Pattern**: SlideOutPanel can be used for future stacked slideouts

## Testing Scenarios

### Functional Testing
- [ ] Click "View Property Details" from Site Submit opens Property Details
- [ ] Both slideouts visible simultaneously when both open
- [ ] Each slideout can be minimized independently
- [ ] Each slideout can be expanded independently
- [ ] Site Submit shifts left when Property Details expands
- [ ] Site Submit shifts right when Property Details minimizes
- [ ] Site Submit returns to right edge when Property Details closes

### Visual Testing
- [ ] Labels visible and readable when both minimized
- [ ] No overlap between labels and arrow buttons
- [ ] Smooth transitions during state changes
- [ ] Proper stacking order (Property Details on top)
- [ ] Overlay only shows for rightmost panel

### Edge Cases
- [ ] Rapid minimize/expand clicking
- [ ] Opening Property Details while Site Submit is minimized
- [ ] Closing Property Details while both are minimized
- [ ] Browser window resize with both slideouts open

## Future Enhancements

1. **Keyboard Navigation**: Add keyboard shortcuts for minimize/expand
2. **Persistence**: Remember minimize state in localStorage
3. **Animation Preferences**: Respect user's reduced motion preferences
4. **Touch Support**: Add swipe gestures for mobile devices
5. **Additional Layers**: Support for more than 2 stacked slideouts

## Related Documentation

- Original feature request: Site Submit "View Property Details" link not working
- Development standards: `/docs/DEVELOPMENT_STANDARDS.md`
- Component architecture: One component per view pattern

## Commit Information

**Branch**: `feat/layered-slideouts-property-details`
**Commit**: c6f9853
**Title**: feat: implement independent minimize controls for stacked slideouts

## Deployment Notes

- No database migrations required
- No environment variable changes
- No breaking changes to existing APIs
- Feature can be deployed independently
- No special deployment steps required

---

**Last Updated**: October 31, 2024
**Author**: Claude Code (AI Assistant)
**Reviewed By**: Mike (Product Owner)
