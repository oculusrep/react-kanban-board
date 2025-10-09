# Slideout Pattern Documentation

This document describes the pattern for implementing side-by-side slideouts in the application, where one slideout can open another slideout next to it while shifting itself to the left.

## Overview

The slideout pattern allows multiple panels to appear side-by-side from the right edge of the screen, similar to how Salesforce displays related forms. When a secondary slideout opens, the primary slideout shifts left to make room, and both remain visible simultaneously.

## Use Case Example

**Map View Property Contacts**: When viewing a property on the map, users can:
1. Click on a property pin → Property slideout opens (500px wide)
2. Navigate to Contacts tab → View contacts associated with the property
3. Click "Edit" on a contact → Contact form slideout opens (450px wide)
   - Property slideout shifts 450px to the left (positioned at `right: 450px`)
   - Contact form slideout appears at the right edge (positioned at `right: 0px`)
   - Both slideouts are visible side-by-side, flush against each other

## Key Components

### 1. Primary Slideout (e.g., PinDetailsSlideout)

The primary slideout that can shift left when a secondary slideout opens.

**Props Required:**
```typescript
interface PrimarySlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  rightOffset?: number; // Offset from right edge in pixels
  onEditContact?: (contactId: string | null, propertyId: string) => void; // Callback to open secondary slideout
  // ... other props
}
```

**Key Styling:**
```typescript
<div
  className="fixed top-0 h-full bg-white shadow-xl transition-all duration-300 z-40"
  style={{
    right: `${rightOffset}px`, // Dynamic positioning based on rightOffset prop
    top: '67px', // Align with navbar height
    height: 'calc(100vh - 67px)',
    width: '500px' // Fixed width
  }}
>
```

**Important Notes:**
- Uses `transition-all duration-300` for smooth sliding animation
- `z-index: 40` - Lower than secondary slideout
- `rightOffset` prop controls how far from the right edge it appears
- When `rightOffset = 0`: Positioned at right edge (default)
- When `rightOffset = 450`: Shifted 450px left to make room for 450px-wide secondary slideout

### 2. Secondary Slideout (e.g., ContactFormModal)

The secondary slideout that opens on top of/next to the primary slideout.

**Props Required:**
```typescript
interface SecondarySlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  rightOffset?: number; // Always 0 for secondary slideouts
  showBackdrop?: boolean; // Set to false to keep primary slideout visible
  // ... other props
}
```

**Key Styling:**
```typescript
<div
  className="fixed bottom-0 left-0 lg:left-auto w-full lg:w-[450px] bg-white shadow-xl transform transition-transform duration-300 z-[60]"
  style={{
    right: `${rightOffset}px`, // Always 0 for secondary slideouts
    top: '67px', // Match primary slideout top position
    height: 'calc(100vh - 67px)' // Match primary slideout height
  }}
>
```

**Important Notes:**
- Uses `z-index: 60` - Higher than primary slideout
- `rightOffset` should always be `0` (positioned at right edge)
- `showBackdrop: false` prevents darkening the primary slideout
- Width should be smaller than or equal to the shift amount of the primary slideout

### 3. Parent Component State Management

The parent component (e.g., MappingPageNew) manages the state for both slideouts.

**Required State:**
```typescript
// Primary slideout state
const [isPrimaryOpen, setIsPrimaryOpen] = useState(false);
const [primaryData, setPrimaryData] = useState<any>(null);

// Secondary slideout state
const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
const [secondaryData, setSecondaryData] = useState<any>(null);
```

**Handler Functions:**
```typescript
// Handler to open secondary slideout
const handleEditItem = (itemId: string | null, parentId: string) => {
  console.log('Opening secondary slideout:', { itemId, parentId });
  setSecondaryData({ itemId, parentId });
  setIsSecondaryOpen(true);
};

// Handler to close secondary slideout
const handleSecondaryClose = () => {
  setIsSecondaryOpen(false);
  setSecondaryData(null);
};
```

**Rendering Pattern:**
```tsx
{/* Primary Slideout */}
<PrimarySlideout
  isOpen={isPrimaryOpen}
  onClose={handlePrimaryClose}
  data={primaryData}
  rightOffset={isSecondaryOpen ? 450 : 0} // Shift left when secondary opens
  onEditItem={handleEditItem} // Callback to open secondary
/>

{/* Secondary Slideout */}
<SecondarySlideout
  isOpen={isSecondaryOpen}
  onClose={handleSecondaryClose}
  data={secondaryData}
  rightOffset={0} // Always at right edge
  showBackdrop={false} // Keep primary visible
/>
```

## Width Calculations

The key to making slideouts flush against each other is matching the shift amount to the secondary slideout width:

- **Primary slideout width**: Any width (e.g., 500px)
- **Secondary slideout width**: Should fit on screen alongside primary (e.g., 450px)
- **Primary slideout rightOffset when secondary opens**: Must equal secondary width (450px)
- **Secondary slideout rightOffset**: Always 0

**Formula:**
```
Primary rightOffset when secondary is open = Secondary slideout width
```

**Example:**
- Secondary slideout is 450px wide → Primary shifts to `right: 450px`
- Secondary slideout is 600px wide → Primary shifts to `right: 600px`

## Styling Guidelines

### Compact Secondary Slideout Design

When creating a secondary slideout, use compact styling to maximize efficiency:

**Header:**
```typescript
<div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
  <h2 className="text-lg font-semibold text-gray-900">
    {title}
  </h2>
  <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
    <X className="w-5 h-5" />
  </button>
</div>
```

**Content:**
```typescript
<div className="flex-1 overflow-y-auto p-3 space-y-4">
  {/* Form sections */}
</div>
```

**Section Headers:**
```typescript
<h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
  Section Title
</h3>
```

**Form Labels:**
```typescript
<label className="block text-xs font-medium text-gray-700 mb-0.5">
  Field Label
</label>
```

**Field Spacing:**
```typescript
<div className="space-y-3"> {/* Section spacing */}
  <div className="space-y-2"> {/* Field group spacing */}
    {/* Individual fields */}
  </div>
</div>
```

## Z-Index Hierarchy

Proper z-index layering ensures correct stacking:

```
Map/Background: z-0 to z-10
Primary Slideout: z-40
Secondary Slideout: z-60
Modal Backdrops (when used): z-50 or z-60
```

**Important:** Secondary slideouts should have `z-index` higher than primary slideouts.

## Alignment and Positioning

Both slideouts should align perfectly:

**Top Alignment:**
```css
top: 67px; /* Match navbar height */
```

**Height:**
```css
height: calc(100vh - 67px); /* Full viewport minus navbar */
```

**Transitions:**
```css
transition-all duration-300 ease-out; /* Smooth sliding */
```

## No Backdrop Pattern

When secondary slideouts should not dim the primary:

```typescript
{showBackdrop && (
  <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />
)}
```

Set `showBackdrop={false}` when rendering secondary slideout to keep primary fully visible.

## Complete Example: Property → Contact Edit

### Parent Component (MappingPageNew.tsx)

```typescript
// State
const [isPinDetailsOpen, setIsPinDetailsOpen] = useState(false);
const [selectedPinData, setSelectedPinData] = useState<any>(null);
const [isContactFormOpen, setIsContactFormOpen] = useState(false);
const [editingContactId, setEditingContactId] = useState<string | null>(null);
const [contactPropertyId, setContactPropertyId] = useState<string | null>(null);

// Handlers
const handleEditContact = (contactId: string | null, propertyId: string) => {
  setEditingContactId(contactId);
  setContactPropertyId(propertyId);
  setIsContactFormOpen(true);
};

const handleContactFormClose = () => {
  setIsContactFormOpen(false);
  setEditingContactId(null);
  setContactPropertyId(null);
};

// Render
<>
  {/* Primary: Property Slideout */}
  <PinDetailsSlideout
    isOpen={isPinDetailsOpen}
    onClose={() => setIsPinDetailsOpen(false)}
    data={selectedPinData}
    type="property"
    rightOffset={isContactFormOpen ? 450 : 0}
    onEditContact={handleEditContact}
  />

  {/* Secondary: Contact Form Slideout */}
  <ContactFormModal
    isOpen={isContactFormOpen}
    onClose={handleContactFormClose}
    propertyId={contactPropertyId || undefined}
    contactId={editingContactId || undefined}
    rightOffset={0}
    showBackdrop={false}
    onSave={handleContactFormClose}
    onUpdate={handleContactFormClose}
  />
</>
```

### Primary Slideout (PinDetailsSlideout.tsx)

```typescript
interface PinDetailsSlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  data: any;
  type: string;
  rightOffset?: number;
  onEditContact?: (contactId: string | null, propertyId: string) => void;
}

const PinDetailsSlideout: React.FC<PinDetailsSlideoutProps> = ({
  isOpen,
  onClose,
  data,
  type,
  rightOffset = 0,
  onEditContact
}) => {
  return (
    <div
      className="fixed bg-white shadow-xl transition-all duration-300 z-40 w-[500px]"
      style={{
        right: `${rightOffset}px`,
        top: '67px',
        height: 'calc(100vh - 67px)',
        transform: !isOpen ? 'translateX(100%)' : 'translateX(0)'
      }}
    >
      {/* Contacts Tab with Edit buttons */}
      <button
        onClick={() => onEditContact?.(contact.id, propertyId)}
        className="text-blue-600 hover:text-blue-800"
      >
        Edit
      </button>
    </div>
  );
};
```

### Secondary Slideout (ContactFormModal.tsx)

```typescript
interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId?: string;
  propertyId?: string;
  rightOffset?: number;
  showBackdrop?: boolean;
  onSave?: () => void;
  onUpdate?: () => void;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  contactId,
  propertyId,
  rightOffset = 0,
  showBackdrop = true,
  onSave,
  onUpdate
}) => {
  if (!isOpen) return null;

  return (
    <>
      {showBackdrop && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />
      )}

      <div
        className="fixed bottom-0 left-0 lg:left-auto w-full lg:w-[450px] bg-white shadow-xl transform transition-transform duration-300 z-[60] flex flex-col"
        style={{
          right: `${rightOffset}px`,
          top: '67px',
          height: 'calc(100vh - 67px)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)'
        }}
      >
        {/* Compact header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h2 className="text-lg font-semibold">
            {contactId ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button onClick={onClose}>×</button>
        </div>

        {/* Compact form content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Form fields */}
        </div>

        {/* Footer with actions */}
        <div className="border-t p-3">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </>
  );
};
```

## Testing Checklist

When implementing this pattern, test:

- [ ] Primary slideout opens and closes smoothly
- [ ] Secondary slideout opens and closes smoothly
- [ ] Primary slideout shifts left when secondary opens
- [ ] Primary slideout returns to right edge when secondary closes
- [ ] Both slideouts are flush against each other (no gap)
- [ ] Both slideouts align at the top (same top position)
- [ ] Both slideouts have same height
- [ ] No backdrop covers primary when secondary is open
- [ ] Map/background remains visible on the left
- [ ] Transitions are smooth (300ms)
- [ ] Z-index layering is correct (secondary on top)
- [ ] Closing secondary returns primary to original position
- [ ] Content in both slideouts is readable and accessible

## Common Pitfalls

### 1. Mismatched Widths
**Problem:** Gap between slideouts or overlap
**Solution:** Ensure `primaryRightOffset = secondaryWidth`

### 2. Backdrop Covering Primary
**Problem:** Primary slideout is dimmed/hidden when secondary opens
**Solution:** Set `showBackdrop={false}` on secondary slideout

### 3. Z-Index Issues
**Problem:** Slideouts appear in wrong order
**Solution:** Secondary must have higher z-index than primary (e.g., 60 vs 40)

### 4. Misaligned Tops
**Problem:** Slideouts don't align at top
**Solution:** Both should use `top: '67px'` (or same navbar height)

### 5. Different Heights
**Problem:** One slideout is taller/shorter than the other
**Solution:** Both should use `height: 'calc(100vh - 67px)'`

### 6. No Transition
**Problem:** Slideouts jump instead of sliding
**Solution:** Include `transition-all duration-300` in className

## Future Enhancements

Potential improvements to this pattern:

1. **Dynamic Width Calculation**: Automatically calculate optimal widths based on viewport size
2. **Responsive Breakpoints**: Stack slideouts vertically on smaller screens
3. **Triple Slideouts**: Support for 3+ levels of nested slideouts
4. **Slide Direction**: Support sliding from left or other directions
5. **Keyboard Navigation**: Add keyboard shortcuts to close/navigate slideouts
6. **Focus Management**: Trap focus within active slideout for accessibility
7. **State Persistence**: Remember slideout positions when navigating

## Related Files

- Primary slideout: `/src/components/mapping/slideouts/PinDetailsSlideout.tsx`
- Secondary slideout: `/src/components/ContactFormModal.tsx`
- Parent component: `/src/pages/MappingPageNew.tsx`
- Contact management: `/src/components/property/AddContactsModal.tsx`
- Documentation: `/workspaces/react-kanban-board/CONTACT_MANAGEMENT_IMPLEMENTATION.md`

## Version History

- **v1.0** (2025-10-09): Initial implementation for Property → Contact Edit flow
  - Property slideout (500px) + Contact form (450px)
  - Compact form styling with reduced spacing
  - No backdrop pattern for side-by-side visibility
