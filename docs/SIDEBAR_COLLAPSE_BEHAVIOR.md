# Sidebar Collapse Behavior

## Overview
This document describes the collapse behavior of sidebar modules in both ClientSidebar and ContactSidebar components.

## Behavior
All sidebar modules (Notes, Deals, Contacts, Files, etc.) are **collapsed by default** when:
- Opening a client or contact for the first time
- Navigating to a different client or contact
- Refreshing the page

## Implementation

### ClientSidebar
**File:** [src/components/ClientSidebar.tsx](../src/components/ClientSidebar.tsx)

The sidebar module expansion states are initialized to `false` for all modules:
- Associated Contacts
- Child Accounts
- Notes
- Deals
- Site Submits
- Files

A `useEffect` hook resets all expansion states whenever the `clientId` changes, ensuring modules are always collapsed when viewing a different client.

### ContactSidebar
**File:** [src/components/ContactSidebar.tsx](../src/components/ContactSidebar.tsx)

The sidebar module expansion states are initialized to `false` for all modules:
- Notes
- Deals
- Associated Clients
- Files

A `useEffect` hook resets all expansion states whenever the `contactId` changes, ensuring modules are always collapsed when viewing a different contact.

## Key Changes Made (2025-10-08)

### Removed Features
- **localStorage persistence**: Previously, the expanded/collapsed state of sidebar modules was saved to localStorage and restored on page reload. This has been removed.
- **State persistence across navigation**: Sidebar states no longer persist when navigating between different clients or contacts.

### Added Features
- **Automatic reset on navigation**: All sidebar modules automatically collapse when the client/contact ID changes.
- **Clean initial state**: Every client or contact view starts with all modules collapsed for a consistent user experience.

## Code Examples

### Before (with localStorage persistence)
```typescript
const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
  const saved = localStorage.getItem(`expandedClientSidebarModules_${clientId}`);
  return saved ? JSON.parse(saved) : {
    contacts: false,
    notes: false,
    // ...
  };
});

const toggleSidebarModule = (module) => {
  const newState = { ...expandedSidebarModules, [module]: !expandedSidebarModules[module] };
  setExpandedSidebarModules(newState);
  localStorage.setItem(`expandedClientSidebarModules_${clientId}`, JSON.stringify(newState));
};
```

### After (collapsed by default)
```typescript
const [expandedSidebarModules, setExpandedSidebarModules] = useState({
  contacts: false,
  notes: false,
  // ...
});

// Reset on client/contact change
useEffect(() => {
  setExpandedSidebarModules({
    contacts: false,
    notes: false,
    // ...
  });
}, [clientId]); // or [contactId] for ContactSidebar

const toggleSidebarModule = (module) => {
  setExpandedSidebarModules({
    ...expandedSidebarModules,
    [module]: !expandedSidebarModules[module]
  });
};
```

## User Experience Impact
- Users will need to manually expand sidebar modules each time they view a client or contact
- This provides a cleaner, more predictable initial view
- Reduces visual clutter when first opening a sidebar
- Ensures consistency across all users and sessions
