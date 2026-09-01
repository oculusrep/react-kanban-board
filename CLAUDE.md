# OVIS Project Guidelines

## Deployment

**`git push origin main` deploys to production via the Vercel CLI integration.** The production site is the Vercel project `ovis` (aliased to https://ovis.oculusrep.com).

Notes:
- The Vercel build runs `vite build` (no `tsc` typecheck), so type errors don't block deploys but will still ship broken code — typecheck locally before pushing.
- A manual `vercel --prod` is also possible from a clean checkout if you need to redeploy a specific commit without pushing again.

## Database Migrations

**`supabase db push` does not work in this repo. Use the psql fallback, and always record the migration explicitly.**

The migration history has drifted (40 remote-only versions). Full diagnosis, options, and the reconciliation plan: [docs/SUPABASE_MIGRATION_DRIFT.md](docs/SUPABASE_MIGRATION_DRIFT.md).

Single application path — file first, psql apply, explicit record:

1. Write the change as a file in `supabase/migrations/` with a `date +%Y%m%d%H%M%S` version. No exceptions, including one-line fixes.
2. Apply it:
   ```bash
   set -a && . ./.env && set +a
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -f supabase/migrations/<version>_<name>.sql
   ```
   `--single-transaction` matters — without it a mid-file failure leaves the schema half-migrated.
3. Record it in the same session:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
     "INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('<version>','<name>') ON CONFLICT (version) DO NOTHING;"
   ```
   Skipping this step is how part of the current drift was created.
4. **Never use the MCP `apply_migration` tool or the Supabase dashboard SQL editor for schema changes.** Both stamp their own version number and are the source of most of the drift. Use them for read-only queries only.
5. Branch worktrees follow the same rule and note in the PR which migrations they applied to the shared production database — one prod DB is shared across all worktrees, so any branch that migrates puts `main` out of sync until it merges.

**Never rebuild an RPC or view from an older migration file.** Pull the current definition from the live database first (`pg_get_functiondef` / `pg_get_viewdef`); later migrations routinely add things the old file doesn't have, and rebuilding from it silently drops them. Views created with `SELECT t.*` expand to a fixed column list at creation time, so a new table column requires recreating the view.

Verify round-trip before calling a migration done — run it inside a transaction and `ROLLBACK`, so nothing test-related persists.

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

## Site Submit / Deal Data Ownership

**Economic fields (sqft, acres, lease/purchase price, rent, NNN, TI, delivery timeframe) live on three records — property, site_submit, deal — each with its own column. Snapshots flow forward at creation; edits never propagate back.** See [docs/SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md](docs/SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md) before editing any code that reads/writes these fields in a site-submit or deal context. Don't assume `site_submit.property.asking_lease_price` is the right source for an editable field on the site submit sidebar — it isn't, the value lives on `site_submit` directly.

## UX: Overlay-first object interactions

**Build cross-object interaction features as composable, drop-in components — not page-bound UI.** OVIS is moving toward a model where you can drill into any deal / contact / client / property / site_submit / assignment from wherever you are (map pin slideout, kanban card slideout, dashboard) without navigating away. See [docs/OVIS_OVERLAY_UX.md](docs/OVIS_OVERLAY_UX.md) for the full principle and rationale.

Two-tier model:
- **Pages = destinations** (Master Pipeline, Map, Tasks/Planning dashboard, all-tasks list). They have URLs and are workplaces.
- **Object interactions = overlays.** Always. From a page, from a slideout, from anywhere.

Concretely:
- New components that render object data take `objectType` + `objectId` props; they don't read `useParams`.
- Prefer "open in slideout" over `navigate('/deal/:id')` for related-object drill-downs (today this often still means navigating; flag the gap rather than papering over it with a page-bound design).
- A panel built for a sidebar should also work mounted inside a slideout body.

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
