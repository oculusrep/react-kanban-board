# OVIS Project Guidelines

## Timezone

**Always use Eastern Time (EST/EDT) for all date and time operations in OVIS.**

When working with dates and times:
- Use local time (America/New_York timezone), not UTC
- For "today" calculations, use the user's local date, not `toISOString()` which returns UTC
- Database timestamps are stored in UTC but should be displayed and compared in Eastern Time
- When filtering for "today's" activities, use local midnight to local midnight

Example - Getting today's date correctly:
```typescript
// CORRECT - uses local date
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// WRONG - uses UTC which can be a different day in evening hours
const today = new Date().toISOString().split('T')[0];
```

### Database DATE columns
When inserting into PostgreSQL `DATE` columns:
- Use `YYYY-MM-DD` string format with local date (as shown above)
- Do NOT use `toISOString()` - it returns UTC which can be wrong date in evening
- DATE columns don't need `AT TIME ZONE` conversion in SQL views (they have no timezone info)

### Activity table user tracking
The `activity` table has both `user_id` and `owner_id` columns:
- `LogCallModal` sets `owner_id` (the person who owns/created the activity)
- Views should use `COALESCE(user_id, owner_id)` to handle both cases

## Brand Color Palette

**Always use the OVIS brand colors for UI design, styling decisions, and color schemes.**

| Color Name | Hex Code | Usage |
|------------|----------|-------|
| Deep Midnight Blue | `#002147` | Primary text, headings, active states, darkest accent |
| Steel Blue | `#4A6B94` | Secondary elements, mid-tone accents, prices/values |
| Light Slate Blue | `#8FA9C8` | Borders, inactive states, subtle backgrounds, lightest accent |
| Pure White | `#FFFFFF` | Backgrounds, card surfaces, contrast elements |

### Usage Guidelines

- **Primary Actions**: Use Deep Midnight Blue (`#002147`) for primary buttons, active toggles, main headings
- **Secondary Elements**: Use Steel Blue (`#4A6B94`) for secondary buttons, currency displays, links
- **Borders & Inactive**: Use Light Slate Blue (`#8FA9C8`) for borders, inactive toggle states, dividers
- **Backgrounds**: Use Pure White (`#FFFFFF`) for cards and content areas; use off-white (`#F8FAFC`) for page backgrounds to create contrast
- **Warnings/Alerts**: Use Terracotta (`#A27B5C`) for warning indicators (border style preferred over solid fills)

### Examples

```tsx
// Primary heading
<h1 style={{ color: '#002147' }}>Title</h1>

// Currency display
<span style={{ color: '#4A6B94' }}>{formatCurrency(amount)}</span>

// Subtle border
<div style={{ border: '1px solid #8FA9C8' }}>...</div>

// Active toggle button
<button style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>Active</button>

// Inactive toggle button
<button style={{ backgroundColor: 'transparent', color: '#8FA9C8' }}>Inactive</button>
```

## Tech Stack

- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Supabase for backend (PostgreSQL, Auth, Edge Functions)
- Recharts for data visualization
- React Router for navigation

## Code Conventions

- Use functional components with hooks
- Prefer named exports for components
- Use TypeScript strict mode
- Follow existing patterns in the codebase for consistency

## Supabase Query Pagination

**Always paginate Supabase queries that may return more than 1000 rows.**

Supabase has a default limit of 1000 rows per query. For tables with more records (site_submit, contact, property, activity, etc.), you MUST either:

1. **Use server-side filtering** - Apply `.eq()`, `.in()`, or other filters to limit results before fetching
2. **Paginate with `.range()`** - Loop through results in batches

### Example - Fetching all records with pagination:
```typescript
const PAGE_SIZE = 1000;
let offset = 0;
let hasMore = true;
const allResults: MyType[] = [];

while (hasMore) {
  const { data, error } = await supabase
    .from('my_table')
    .select('*')
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw error;

  allResults.push(...(data || []));
  hasMore = data?.length === PAGE_SIZE;
  offset += PAGE_SIZE;
}
```

### Example - Server-side filtering (preferred when applicable):
```typescript
// Instead of fetching all and filtering client-side:
const { data } = await supabase.from('site_submit').select('*');
const filtered = data.filter(row => row.client_id === selectedClientId); // BAD

// Use server-side filtering:
const { data } = await supabase
  .from('site_submit')
  .select('*')
  .eq('client_id', selectedClientId); // GOOD - gets ALL matching records
```

### Tables that commonly exceed 1000 rows:
- `site_submit` - Use server-side client_id filter or paginate
- `contact` - Use server-side filters or paginate
- `property` - Use server-side filters or paginate
- `activity` - Use date range filters or paginate
- `email_log` - Use date range or contact_id filters

## External API Integration

**Always check official API documentation before writing integration code.**

When integrating with external APIs (ESRI, ZoomInfo, Google Maps, etc.):
1. Look up the correct field names, endpoints, and request formats in the official documentation FIRST
2. Never assume or guess variable naming conventions - verify them
3. Test with a minimal API call to confirm the response structure before writing parsing code
4. Document the API reference URL in code comments for future maintenance

This prevents wasted iterations debugging parsing issues that are actually request format issues.

## Documentation

**All documentation must be saved to git.** When asked to document something, create a status summary, or write notes about an issue:

1. Find the appropriate existing file in `docs/` and update it, OR
2. Create a new markdown file in `docs/` with a descriptive name

Never just output documentation to the chat - always write it to a file and commit it. This applies to:
- Feature documentation
- Debug/troubleshooting notes
- Status summaries for issues in progress
- Implementation plans
- Any other documentation the user requests
