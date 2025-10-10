# Property Site Submit Tab Implementation

## Overview
This document describes the implementation of the "Submits" tab in the property slideout on the mapping page, which allows users to view and access site submits associated with a property in a side-by-side slideout pattern.

## Date
October 10, 2025

## Problem Statement
Users needed a way to:
1. View all site submits associated with a property from the property slideout
2. Click on a site submit to open its details in a side-by-side slideout (similar to how clicking "View Full Details" from a site submit opens the property slideout)
3. Have the submits displayed in the same style as the Property Info sidebar modal for consistency

## Solution Architecture

### Bidirectional Side-by-Side Slideout Pattern
The implementation creates a symmetric pattern that works in both directions:

**Direction 1: Site Submit → Property** (existing)
- When viewing a site submit, click "VIEW FULL DETAILS" on the Property tab
- Opens property slideout on the right
- Site submit slideout shifts left to accommodate

**Direction 2: Property → Site Submit** (new)
- When viewing a property, click the "SUBMITS" tab
- See a list of all associated site submits
- Click any site submit to open its slideout on the right
- Property slideout shifts left to accommodate

## Implementation Details

### 1. Type System Updates
**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

```typescript
// Added 'submits' to the TabType union
type TabType = 'property' | 'submit' | 'location' | 'files' | 'contacts' | 'submits';

// Added callback prop for opening site submit details
interface PinDetailsSlideoutProps {
  // ... existing props
  onViewSiteSubmitDetails?: (siteSubmit: SiteSubmit) => void;
}
```

### 2. SubmitsTabContent Component
**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

Created a new component that:
- Fetches site submits associated with the property using proper Supabase relationships
- Displays them in a list matching the PropertySidebar's SiteSubmitItem styling
- Handles loading and empty states
- Triggers the `onViewSiteSubmitDetails` callback when a submit is clicked

#### Key Features:
```typescript
const SubmitsTabContent: React.FC<{
  propertyId: string;
  onViewSiteSubmitDetails?: (siteSubmit: SiteSubmit) => void;
}> = ({ propertyId, onViewSiteSubmitDetails }) => {
  // Fetches site submits with related client and property_unit data
  const { data, error } = await supabase
    .from('site_submit')
    .select(`
      *,
      client!client_id (
        client_name
      ),
      property_unit (
        property_unit_name
      )
    `)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
}
```

#### Styling Pattern:
- Matches PropertySidebar's SiteSubmitItem component exactly
- Green hover effect (`hover:bg-green-50`)
- Stage displayed in green text (`text-green-600`)
- Client name in gray (`text-gray-500`)
- External link icon appears on hover
- Compact, border-separated list items

### 3. Tab Configuration
**File:** `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

Added "SUBMITS" tab to the property tabs list:
```typescript
const getAvailableTabs = (): { id: TabType; label: string; icon: React.ReactNode }[] => {
  if (isProperty) {
    return [
      { id: 'property' as TabType, label: 'PROPERTY', icon: <Building2 size={16} /> },
      { id: 'submits' as TabType, label: 'SUBMITS', icon: <FileText size={16} /> },
      { id: 'contacts' as TabType, label: 'CONTACTS', icon: <Users size={16} /> },
      { id: 'files' as TabType, label: 'FILES', icon: <FolderOpen size={16} /> },
    ];
  } else {
    // Site submit tabs unchanged
  }
};
```

### 4. State Management
**File:** `src/pages/MappingPageNew.tsx`

Added state for the site submit details slideout:
```typescript
// Site submit details slideout (for viewing site submit from property)
const [isSiteSubmitDetailsOpen, setIsSiteSubmitDetailsOpen] = useState(false);
const [selectedSiteSubmitData, setSelectedSiteSubmitData] = useState<any>(null);
```

### 5. Event Handlers
**File:** `src/pages/MappingPageNew.tsx`

Created handlers mirroring the property details pattern:

```typescript
// Handle viewing site submit details from property
const handleViewSiteSubmitDetails = async (siteSubmit: any) => {
  // Fetch fresh site submit data from database
  const { data: freshSiteSubmitData, error } = await supabase
    .from('site_submit')
    .select(`
      *,
      client (client_name),
      submit_stage (id, name),
      property_unit (property_unit_name),
      property (*)
    `)
    .eq('id', siteSubmit.id)
    .single();

  setSelectedSiteSubmitData(freshSiteSubmitData);
  setIsSiteSubmitDetailsOpen(true);
};

const handleSiteSubmitDataUpdate = (updatedData: any) => {
  setSelectedSiteSubmitData(updatedData);
};

const handleSiteSubmitDetailsClose = () => {
  setIsSiteSubmitDetailsOpen(false);
  setSelectedSiteSubmitData(null);
};
```

### 6. Slideout Layout and Positioning
**File:** `src/pages/MappingPageNew.tsx`

#### Main Pin Details Slideout (Property/Site Submit)
Updated to shift left when site submit details opens:
```typescript
<PinDetailsSlideout
  isOpen={isPinDetailsOpen}
  data={selectedPinData}
  type={selectedPinType}
  rightOffset={
    isPropertyDetailsOpen ? 500 :
    isSiteSubmitDetailsOpen ? 500 :
    isContactFormOpen ? 450 :
    0
  }
  onViewSiteSubmitDetails={handleViewSiteSubmitDetails}
  // ... other props
/>
```

#### Site Submit Details Slideout
Added new slideout instance for site submits opened from properties:
```typescript
{/* Site Submit Details Slideout (for viewing site submit from property) */}
<PinDetailsSlideout
  isOpen={isSiteSubmitDetailsOpen}
  onClose={handleSiteSubmitDetailsClose}
  data={selectedSiteSubmitData}
  type="site_submit"
  onViewPropertyDetails={handleViewPropertyDetails}
  onDataUpdate={handleSiteSubmitDataUpdate}
  rightOffset={0} // Always at the far right edge
/>
```

### 7. Cleanup on Close
**File:** `src/pages/MappingPageNew.tsx`

Updated the main slideout close handler to also close site submit details:
```typescript
const handlePinDetailsClose = () => {
  setIsPinDetailsOpen(false);
  setSelectedPinData(null);
  setSelectedPinType(null);

  // Close property details if open
  if (isPropertyDetailsOpen) {
    setIsPropertyDetailsOpen(false);
    setSelectedPropertyData(null);
  }

  // Close site submit details if open
  if (isSiteSubmitDetailsOpen) {
    setIsSiteSubmitDetailsOpen(false);
    setSelectedSiteSubmitData(null);
  }
};
```

## Database Relationships

The implementation relies on the existing database schema:

```
site_submit
├── property_id → property.id (foreign key)
├── client_id → client.id (foreign key)
└── property_unit_id → property_unit.id (foreign key)
```

### Important Query Pattern
To properly fetch client data, use the explicit foreign key name:
```typescript
// ✅ Correct - uses explicit foreign key name
client!client_id (client_name)

// ❌ Incorrect - may fail with ambiguous relationship
client (client_name)
```

## UI/UX Patterns

### Site Submit List Item Display
Each site submit shows:
1. **Primary line:** Site submit name (or sf_account as fallback)
2. **Secondary line:**
   - Stage in green text (left)
   - Property unit name in gray (center, if available)
   - Client name in gray (right)
3. **Interaction:** External link icon appears on hover

### Visual Consistency
The implementation maintains visual consistency with the existing PropertySidebar by:
- Using identical component structure and styling
- Reusing the same color scheme (green for submits, gray for metadata)
- Matching hover effects and transitions
- Using the same border and spacing patterns

## User Workflow

### Typical Usage Flow
1. User clicks a property pin on the map
2. Property slideout opens showing property details
3. User clicks the "SUBMITS" tab
4. List of associated site submits appears
5. User clicks a site submit from the list
6. Site submit slideout opens on the right
7. Property slideout shifts 500px left to accommodate
8. User can now view both property and site submit side-by-side
9. Closing either slideout returns to single slideout view

### Side-by-Side Configuration
- Property slideout: 500px wide, shifted left by 500px
- Site submit slideout: 500px wide, at right edge (0px offset)
- Total horizontal space used: 1000px

## Files Modified

1. **src/components/mapping/slideouts/PinDetailsSlideout.tsx**
   - Added 'submits' to TabType
   - Created SubmitsTabContent component
   - Added onViewSiteSubmitDetails prop
   - Added submits tab to property tabs configuration
   - Wired up submits tab rendering

2. **src/pages/MappingPageNew.tsx**
   - Added isSiteSubmitDetailsOpen state
   - Added selectedSiteSubmitData state
   - Created handleViewSiteSubmitDetails handler
   - Created handleSiteSubmitDataUpdate handler
   - Created handleSiteSubmitDetailsClose handler
   - Added Site Submit Details Slideout component
   - Updated rightOffset calculations
   - Updated cleanup in handlePinDetailsClose

## Testing Checklist

- [x] Site submits load correctly for properties with associated submits
- [x] Empty state displays for properties with no site submits
- [x] Clicking a site submit opens the site submit slideout
- [x] Property slideout shifts left when site submit opens
- [x] Site submit data is fresh (fetched from database, not cached)
- [x] Closing property slideout also closes site submit slideout
- [x] Styling matches PropertySidebar's SiteSubmitItem component
- [x] Loading states display correctly
- [x] Client and property unit relationships load properly

## Known Limitations

1. The implementation uses the existing PinDetailsSlideout component for site submit details, which means it inherits all site submit slideout behavior
2. The styling is tightly coupled to the PropertySidebar's SiteSubmitItem pattern
3. Currently uses Salesforce field `sf_submit_stage` instead of the newer `submit_stage` relationship

## Future Enhancements

1. Add ability to create new site submit from the property's Submits tab
2. Add filtering/sorting options for site submit list
3. Add submit count badge on the tab label
4. Consider using the newer `submit_stage` relationship for stage data
5. Add keyboard navigation for the site submit list

## Related Documentation

- See `CONTACT_MANAGEMENT_IMPLEMENTATION.md` for the similar contacts tab pattern
- See Property Info Sidebar screenshot: `Screen Shots/SCR-20251010-ihpi.png`
- See existing side-by-side pattern: `Screen Shots/SCR-20251009-opan.png`

## Notes

This implementation follows the established pattern from the existing property details slideout (opened from site submit) and maintains consistency with the PropertySidebar component styling. The symmetric bidirectional pattern provides a natural and intuitive navigation experience for users working with properties and site submits on the map.
