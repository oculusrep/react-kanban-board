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
