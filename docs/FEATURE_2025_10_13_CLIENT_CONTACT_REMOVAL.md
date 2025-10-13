# Feature: Remove Contact Association from Client Sidebar

**Date:** October 13, 2025
**Component:** `ClientSidebar.tsx`
**Type:** Feature Addition

## Overview
Added the ability to remove contact associations from the Client Info sidebar, matching the existing functionality in the Property sidebar. Users can now hover over a contact in the "Associated Contacts" section and click a trash icon to remove the association.

## User Request
> "from the client detail page, I want to be able to remove an associated contact from the client from the Client info sidebar like I can remove a contact from a property on the property info sidebar... can we get a trash can icon there the same way we do it with property?"

## Implementation Details

### Reference Implementation
Reviewed [PropertySidebar.tsx](../src/components/property/PropertySidebar.tsx#L64-L82) for the established pattern:
- Trash icon with hover effect using CSS group classes
- Confirmation dialog before removal
- `onRemove` callback pattern

### Changes Made

#### 1. ContactItemProps Interface Update
**File:** [ClientSidebar.tsx:39](../src/components/ClientSidebar.tsx#L39)

Added optional `onRemove` callback to the interface:
```typescript
interface ContactItemProps {
  contact: Contact;
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: (contactId: string) => void;
  onClick?: (contactId: string) => void;
  onRemove?: (contactId: string) => void;  // ✅ Added
}
```

#### 2. ContactItem Component Structure
**File:** [ClientSidebar.tsx:55-114](../src/components/ClientSidebar.tsx#L55-L114)

Modified the component layout to support hover-based controls:

- Added `group` class to wrapper div (line 55) for CSS group hover functionality
- Split interaction areas:
  - Main content area remains clickable for contact selection
  - Controls section contains trash icon and chevron
- Added trash icon button (lines 79-99):
  ```typescript
  {onRemove && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (confirm('Remove this contact from the client? The contact will not be deleted, only the association.')) {
          onRemove(contact.id);
        }
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
      title="Remove contact from client"
    >
      <svg className="w-4 h-4 text-gray-400 hover:text-red-600" ...>
        {/* Trash icon SVG */}
      </svg>
    </button>
  )}
  ```

#### 3. Remove Handler Function
**File:** [ClientSidebar.tsx:452-460](../src/components/ClientSidebar.tsx#L452-L460)

Created handler that uses the existing `removeContactRelation` hook:
```typescript
const handleRemoveContact = async (contactId: string) => {
  try {
    await removeContactRelation(contactId);
    // The hook will automatically refresh the relations list
  } catch (err) {
    console.error('Error removing contact from client:', err);
    alert('Failed to remove contact from client. Please try again.');
  }
};
```

#### 4. Prop Connection
**File:** [ClientSidebar.tsx:569](../src/components/ClientSidebar.tsx#L569)

Connected the handler to the ContactItem component:
```typescript
<ContactItem
  contact={contact}
  isExpanded={expandedContacts[contact.id]}
  onToggle={() => toggleContact(contact.id)}
  onEdit={(contactId) => {...}}
  onClick={onContactClick}
  onRemove={handleRemoveContact}  // ✅ Added
/>
```

## Technical Details

### Database Operation
- Deletes record from `contact_client_relation` table (many-to-many relationship)
- Contact record remains in `contact` table (only removes association)
- Operation performed via `useClientContacts` hook's `removeContactRelation` function

### UI Behavior
- Trash icon hidden by default (`opacity-0`)
- Appears on hover via `group-hover:opacity-100` CSS class
- Button has red hover state for destructive action indication
- Confirmation dialog prevents accidental deletions
- Auto-refresh via hook after successful removal

### Confirmation Message
```
"Remove this contact from the client? The contact will not be deleted, only the association."
```

This clearly communicates that only the relationship is being removed, not the contact itself.

## User Experience Flow
1. User hovers over contact in "Associated Contacts" section
2. Trash icon fades into view on the right side
3. User clicks trash icon
4. Confirmation dialog appears
5. Upon confirmation:
   - Association removed from database
   - Contact list automatically refreshes
   - Contact remains in system for use elsewhere

## Pattern Consistency
This implementation maintains consistency with PropertySidebar:
- Same visual design (trash icon, hover effects)
- Same confirmation message pattern
- Same data handling (remove association, not entity)
- Same user interaction flow

## Testing Checklist
- [ ] Trash icon appears on hover
- [ ] Trash icon disappears when not hovering
- [ ] Confirmation dialog appears on click
- [ ] Clicking "Cancel" does not remove association
- [ ] Clicking "OK" removes association
- [ ] Contact list refreshes after removal
- [ ] Contact still exists in contacts table
- [ ] Error handling displays alert on failure
- [ ] Works with both regular contacts and leads

## Files Modified
- [src/components/ClientSidebar.tsx](../src/components/ClientSidebar.tsx)

## Related Documentation
- [PropertySidebar Implementation](../src/components/property/PropertySidebar.tsx)
- [useClientContacts Hook](../src/hooks/useClientContacts.ts)
