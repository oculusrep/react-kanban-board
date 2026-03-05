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
