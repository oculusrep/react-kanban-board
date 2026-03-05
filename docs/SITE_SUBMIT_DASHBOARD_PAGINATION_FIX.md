# Site Submit Dashboard Client Filtering Fix

**Date:** 2026-03-05

## Problem

When selecting a client (e.g., "IV Nutrition - Patrick") in the Site Submit Dashboard client dropdown, only 1 result appeared instead of dozens of expected site submits. The same client showed all site submits correctly on the map.

## Root Cause

The Site Submit Dashboard was:
1. Fetching site submits without an explicit limit (defaulting to Supabase's 1000 row limit)
2. Filtering client-side with JavaScript `.filter()`
3. Populating the client dropdown only from client_ids found in those 1000 rows

Debug logging revealed:
```
🔍 Filtering by client: 3425a799-a99e-4bb4-9868-538a13a32b75 Total rows: 1000 Matching: 1
```

Only 1 of the first 1000 fetched site submits had the selected client_id, even though dozens existed in the database.

## Why the Map Worked

The map layer (`SiteSubmitLayer.tsx`) uses **server-side filtering**:
```typescript
query = query.eq('client_id', loadingConfig.clientId);
```

This fetches ALL matching records directly from the database, bypassing the 1000 row limit.

## Solution

### 1. Server-side Client Filtering

Modified `fetchReportData()` to accept an optional `filterClientId` parameter:

```typescript
const fetchReportData = async (filterClientId?: string) => {
  let query = supabase.from("site_submit").select(`...`);

  if (filterClientId) {
    query = query.eq('client_id', filterClientId);
  }

  const { data } = await query;
};
```

### 2. Re-fetch on Client Selection

Added useEffect to re-fetch data when client selection changes:

```typescript
useEffect(() => {
  fetchReportData(selectedClientId || undefined);
}, [selectedClientId]);
```

### 3. Paginated Client Dropdown Population

Created `fetchAllClients()` that paginates through all site_submit records:

```typescript
const fetchAllClients = async () => {
  const clientMap = new Map<string, string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from('site_submit')
      .select('client_id, client:client_id(id, client_name)')
      .not('client_id', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    data?.forEach((row: any) => {
      if (row.client_id && row.client?.client_name) {
        clientMap.set(row.client_id, row.client.client_name);
      }
    });

    hasMore = data?.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  setClients(Array.from(clientMap.entries()).map(([id, name]) => ({ id, name })));
};
```

## Files Changed

- `src/pages/SiteSubmitDashboardPage.tsx`
  - Added `filterClientId` parameter to `fetchReportData()`
  - Added `fetchAllClients()` with pagination
  - Added useEffect to re-fetch on client selection change
  - Removed redundant client-side filtering

## Key Takeaway

**Always use server-side filtering or pagination for Supabase queries that may exceed 1000 rows.** See `CLAUDE.md` for the pagination rule.
