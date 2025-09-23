# Autocomplete Component Guidelines

## Standard Practice: Always Use Autocomplete Components for Entity Search

**IMPORTANT**: When implementing search functionality for entities (clients, deals, contacts, properties, assignments, etc.), ALWAYS use the established autocomplete component pattern unless explicitly told otherwise.

## Existing Autocomplete Components

### 1. ReferralPayeeAutocomplete
- **Purpose**: Search and select clients
- **Location**: `/src/components/ReferralPayeeAutocomplete.tsx`
- **Pattern**: Input field with live search, dropdown suggestions, stores ID but displays name

### 2. PropertyAutocompleteField
- **Purpose**: Search and select properties
- **Location**: `/src/components/property/PropertyAutocompleteField.tsx`
- **Pattern**: Similar to ReferralPayeeAutocomplete but for properties

### 3. EntityAutocomplete (New - Generic)
- **Purpose**: Generic autocomplete for any entity type
- **Location**: `/src/components/EntityAutocomplete.tsx`
- **Supports**: client, deal, contact, property, assignment entities

## Standard Autocomplete Pattern

### Core Features
1. **Live Search**: Debounced search with 150ms delay
2. **Stores ID, Displays Name**: Always store entity ID in database, display human-readable name in UI
3. **ILIKE Search**: Case-insensitive partial matching using PostgreSQL ILIKE
4. **Limited Results**: Limit to 5 suggestions for performance
5. **Select on Focus**: Input text is selected when focused for easy replacement
6. **Clear on Empty**: Setting input to empty clears the selection

### Key Components
```typescript
// State management
const [search, setSearch] = useState(''); // Display value
const [suggestions, setSuggestions] = useState<EntitySuggestion[]>([]);

// Load entity name from ID on mount
useEffect(() => {
  // Fetch entity name by ID and set search display value
}, [value]);

// Search with debouncing
useEffect(() => {
  const run = async () => {
    // Supabase query with .ilike() for partial matching
  };
  const handle = setTimeout(run, 150);
  return () => clearTimeout(handle);
}, [search]);

// Selection handling
const handleSelect = (entityId: string, entityName: string) => {
  onChange(entityId); // Store ID
  setSearch(entityName); // Display name
  setSuggestions([]);
};
```

### Database Query Pattern
```typescript
const { data } = await supabase
  .from(entityType)
  .select("id, name_field")
  .ilike("name_field", `%${searchTerm}%`)
  .order("name_field", { ascending: true })
  .limit(5);
```

## UI/UX Standards

### Input Field
- **Placeholder**: "Search {entity type}..."
- **Select on Focus**: `inputRef.current.select()`
- **Clear on Empty**: Reset selection when input is cleared

### Dropdown
```typescript
<ul className="bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto">
  {suggestions.map((suggestion) => (
    <li
      onClick={() => handleSelect(suggestion.id, suggestion.label)}
      className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
    >
      {suggestion.label}
    </li>
  ))}
</ul>
```

### Styling Classes
- **Input**: `"mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"`
- **Dropdown**: `"bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto"`
- **List Items**: `"p-2 hover:bg-gray-100 cursor-pointer text-sm"`

## Entity-Specific Considerations

### Client Autocomplete
- **Field**: `client_name`
- **Search**: `ilike("client_name", %term%)`
- **Display**: Direct client_name value

### Contact Autocomplete
- **Fields**: `first_name, last_name`
- **Search**: `ilike("first_name", %term%)` (primary search field)
- **Display**: `"${first_name} ${last_name}".trim()`

### Property Autocomplete
- **Fields**: `property_name, address`
- **Search**: `ilike("property_name", %term%)`
- **Display**: `property_name || address`
- **Fallback**: Show address if property_name is empty

### Deal Autocomplete
- **Field**: `deal_name`
- **Search**: `ilike("deal_name", %term%)`
- **Display**: Direct deal_name value

### Assignment Autocomplete
- **Field**: `assignment_name`
- **Search**: `ilike("assignment_name", %term%)`
- **Display**: Direct assignment_name value

## When NOT to Use Autocomplete

Only use simple dropdowns when:
1. **Fixed, Small Lists**: Predefined options like status values, types, etc.
2. **Explicitly Requested**: User specifically asks for dropdown instead of search
3. **Performance Critical**: Very specific performance requirements that conflict with search

## Common Mistakes to Avoid

1. **❌ Using simple `<select>` for entity selection**
2. **❌ Storing display names instead of IDs**
3. **❌ Not implementing debounced search**
4. **❌ Loading all entities upfront instead of searching**
5. **❌ Using exact match instead of ILIKE partial matching**
6. **❌ Not limiting search results**
7. **❌ Inconsistent styling with existing autocompletes**

## Implementation Checklist

- [ ] Import existing autocomplete component OR create one following the pattern
- [ ] Store entity ID, display entity name
- [ ] Implement debounced search (150ms)
- [ ] Use ILIKE for partial, case-insensitive matching
- [ ] Limit results to 5 suggestions
- [ ] Select input text on focus
- [ ] Clear selection when input is empty
- [ ] Use consistent styling classes
- [ ] Handle loading states appropriately
- [ ] Test with actual data from multiple entity types

## Example Usage

```typescript
// Good - Using autocomplete
<EntityAutocomplete
  entityType="client"
  value={selectedClientId}
  onChange={(id, name) => setSelectedClientId(id)}
  placeholder="Search clients..."
/>

// Bad - Using simple dropdown
<select onChange={(e) => setSelectedClientId(e.target.value)}>
  {clients.map(client => (
    <option key={client.id} value={client.id}>
      {client.client_name}
    </option>
  ))}
</select>
```

Remember: **Autocomplete components provide a much better user experience for entity selection and should be the default choice for all entity search functionality.**