# UI/UX Guidelines for OVIS CRM

This document establishes consistent patterns and rules for building UI components across the application.

## Universal Components Principle

**RULE: Always use universal, reusable components. Never duplicate component logic.**

When building features, always check if a component already exists before creating a new one. Changes to a component should automatically apply everywhere it's used.

### Examples of Universal Components

1. **PinDetailsSlideout** (`/src/components/mapping/slideouts/PinDetailsSlideout.tsx`)
   - Used for viewing/editing properties and site submits
   - Works in: Map page, Site Submit Dashboard, any future reports
   - Requires: `LayerManagerProvider` wrapper for context
   - **DO NOT** create separate property or site submit detail views - always use this component

2. **SiteSubmitSidebar** (`/src/components/SiteSubmitSidebar.tsx`)
   - Uses iframe to load `SiteSubmitDetailsPage`
   - Used in: ClientSidebar, AssignmentSidebar, PropertySidebar, DealDetailsPage
   - **DO NOT** create custom site submit forms - always use this component

3. **SiteSubmitDetailsPage** (`/src/pages/SiteSubmitDetailsPage.tsx`)
   - Single source of truth for site submit display/editing
   - Loaded via iframe in SiteSubmitSidebar
   - Can also be accessed directly at `/site-submit/{id}`

## Filter Pattern: Autosuggest Only

**RULE: Never use browser dropdown lists (`<select>`) for filters. Always use autosuggest/search inputs.**

### Why?
- Better UX on mobile and desktop
- Handles large lists efficiently
- Consistent search/filter experience across the app
- Keyboard navigation friendly

### Autosuggest Implementation Pattern

```tsx
// State management
const [selectedItemId, setSelectedItemId] = useState<string>("");
const [selectedItemName, setSelectedItemName] = useState<string>("");
const [items, setItems] = useState<{ id: string; name: string }[]>([]);

// Auto-suggest state
const [itemQuery, setItemQuery] = useState("");
const [showItemDropdown, setShowItemDropdown] = useState(false);

const itemInputRef = useRef<HTMLInputElement>(null);
const itemDropdownRef = useRef<HTMLDivElement>(null);

// Click outside handler
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      itemDropdownRef.current &&
      !itemDropdownRef.current.contains(event.target as Node) &&
      !itemInputRef.current?.contains(event.target as Node)
    ) {
      setShowItemDropdown(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

// Filter items based on query
const filteredItems = items.filter(item =>
  item.name.toLowerCase().includes(itemQuery.toLowerCase())
);

// Selection handler
const handleSelectItem = (item: { id: string; name: string }) => {
  setSelectedItemId(item.id);
  setSelectedItemName(item.name);
  setItemQuery(item.name);
  setShowItemDropdown(false);
};

// Clear handler
const clearFilter = () => {
  setSelectedItemId("");
  setSelectedItemName("");
  setItemQuery("");
};
```

### UI Template

```tsx
<div className="relative">
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Filter by [Item Type]
  </label>
  <div className="relative">
    <input
      ref={itemInputRef}
      type="text"
      value={itemQuery}
      onChange={(e) => {
        setItemQuery(e.target.value);
        setShowItemDropdown(true);
        if (!e.target.value) {
          setSelectedItemId("");
          setSelectedItemName("");
        }
      }}
      onFocus={() => setShowItemDropdown(true)}
      placeholder="Search items..."
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
    />
    {selectedItemId && (
      <button
        onClick={() => {
          setSelectedItemId("");
          setSelectedItemName("");
          setItemQuery("");
          itemInputRef.current?.focus();
        }}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <X size={16} />
      </button>
    )}
  </div>

  {/* Dropdown */}
  {showItemDropdown && filteredItems.length > 0 && (
    <div
      ref={itemDropdownRef}
      className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
    >
      {filteredItems.map((item) => (
        <div
          key={item.id}
          onClick={() => handleSelectItem(item)}
          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
        >
          {item.name}
        </div>
      ))}
    </div>
  )}
</div>
```

### Reference Implementation

See `/src/pages/AssignmentsReportPage.tsx` for a complete working example with multiple autosuggest filters.

## Database Schema Awareness

**RULE: Always consult the database schema before writing queries.**

The schema file is located at `/database-schema.ts` and contains the TypeScript types for all database tables.

### Common Mistakes to Avoid:

1. **Wrong column names**
   - ❌ `property_unit.square_feet`
   - ✅ `property_unit.sqft`
   - ❌ `property_unit.nnn_psf`
   - ✅ `property_unit.nnn`

2. **Wrong foreign key syntax**
   - ❌ `property:property_id (...)`
   - ✅ `property!site_submit_property_id_fkey (...)`

### Before Writing a Query:
1. Open `/database-schema.ts`
2. Find your table in the `Tables` type
3. Check the exact column names in the `Row` interface
4. Use the correct foreign key constraint names (format: `tablename_columnname_fkey`)

## Report Pages Pattern

All report pages should follow this structure:

1. **Autosuggest filters** (not dropdown selects)
2. **Sortable columns** with click-to-sort headers
3. **Pagination** (50 items per page is standard)
4. **CSV export** functionality
5. **Clear filters** button when filters are active
6. **Loading and error states**

## Styling Guidelines

### Consistency
- Use Tailwind CSS classes consistently
- Filter sections: `bg-white rounded-lg shadow p-4 mb-6`
- Filter icon: `<Filter size={18} className="text-gray-600" />`
- Clear button: `text-sm text-blue-600 hover:text-blue-800`
- Input fields: `w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm`

### Icons
- Use `lucide-react` for all icons
- Common icons: `ChevronDown`, `ChevronUp`, `Download`, `X`, `Filter`
- Size: typically `16` or `18` for UI elements

## Testing on Mobile

When testing features on mobile:
1. Start dev server with: `npm run dev -- --host`
2. Access via your local network IP (e.g., `http://192.168.4.159:5173/`)
3. Test touch gestures, long-press, and autosuggest dropdowns
4. Ensure components are responsive and touch-friendly

## Questions?

When building new features:
1. Check this document first
2. Look for similar existing components
3. Reuse universal components
4. Follow established patterns
5. Update this document when creating new patterns
