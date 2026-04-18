# Dropbox File Upload & Display Fixes (April 17, 2026)

## Issues

When dropping files onto a site submit, files would fail to upload or not appear in the UI after uploading. Multiple related bugs were found and fixed.

---

## Fix 1: Dropbox 429 Rate Limit on Multi-File Upload

**Symptom:** Dropping multiple files (e.g., 15) would fail partway through with a `DropboxResponseError: Response failed with a 429 code`. Some files would upload but the operation would error out.

**Root Cause:** `useDropboxFiles.uploadFiles()` used `Promise.all()` to upload all files in parallel. Dropbox's API rate limits kicked in around file 12-13, returning HTTP 429 (Too Many Requests) and causing the entire `Promise.all` to reject.

**Fix:** Changed to sequential uploads with a `for` loop.

**File:** `src/hooks/useDropboxFiles.ts` (uploadFiles function)

```typescript
// BEFORE (broken) - all uploads fire at once
const uploadPromises = filesArray.map(file => dropboxService.uploadFile(file, path));
await Promise.all(uploadPromises);

// AFTER (fixed) - uploads run one at a time
for (let i = 0; i < filesArray.length; i++) {
  await dropboxService.uploadFile(filesArray[i], targetFolderPath);
}
```

---

## Fix 2: Dropbox Pagination Missing in File Listing

**Symptom:** After uploading many files to a folder, only a subset of files would appear in the UI. Files were confirmed present in Dropbox but not displayed.

**Root Cause:** `DropboxService.listFolderContents()` only read the first page of results from Dropbox's `filesListFolder` API. When a folder had many entries, Dropbox returns paginated results with `has_more: true`, but the code never called `filesListFolderContinue` to fetch subsequent pages.

**Fix:** Added a `while (response.result.has_more)` loop to fetch all pages.

**File:** `src/services/dropboxService.ts` (listFolderContents method)

```typescript
// BEFORE - only first page
const response = await this.dbx.filesListFolder({ path, recursive: true });
const files = response.result.entries...;

// AFTER - fetches all pages
let allEntries = [];
let response = await this.dbx.filesListFolder({ path, recursive: true });
allEntries.push(...response.result.entries);
while (response.result.has_more) {
  response = await this.dbx.filesListFolderContinue({ cursor: response.result.cursor });
  allEntries.push(...response.result.entries);
}
```

---

## Fix 3: Supabase 406 Error Flooding from dropbox_mapping Query

**Symptom:** Console flooded with HTTP 406 errors on `dropbox_mapping` queries, happening in a tight loop every 3 seconds. Files panel wouldn't load.

**Root Cause:** The `fetchFiles` function in `useDropboxFiles` queried `dropbox_mapping` with `.single()`. When no mapping row exists (common for new properties), `.single()` returns a 406 error. This error triggered the polling useEffect (which fires every 3 seconds when there's an error), creating an infinite error loop.

**Fix:** Changed `.single()` to `.maybeSingle()`, which returns `null` cleanly when no row exists instead of throwing a 406.

**File:** `src/hooks/useDropboxFiles.ts` (fetchFiles function)

```typescript
// BEFORE - throws 406 when no mapping exists
.eq('entity_id', entityId).single();

// AFTER - returns null cleanly
.eq('entity_id', entityId).maybeSingle();
```

**General rule:** Always use `.maybeSingle()` instead of `.single()` when a row might not exist. `.single()` is only for cases where you're certain exactly one row will match.

---

## Fix 4: Dropbox Token Refresh Race Condition

**Symptom:** Multiple simultaneous `401 (Unauthorized)` errors from Dropbox API, each triggering its own token refresh call. Console showed several "Access token expired, refreshing..." messages at once.

**Root Cause:** When the Dropbox access token expires, multiple concurrent API calls (e.g., `folderExists` + `listFolderContents` + `getLatestCursor`) all fail with 401 simultaneously. Each call's `executeWithTokenRefresh` wrapper independently called `refreshAccessToken()`, resulting in redundant refresh requests.

**Fix:** Added a mutex (`refreshPromise`) to `DropboxService` so only one token refresh runs at a time. Concurrent callers await the same promise.

**File:** `src/services/dropboxService.ts`

```typescript
private refreshPromise: Promise<void> | null = null;

private async refreshAccessToken(): Promise<void> {
  // If a refresh is already in progress, wait for it
  if (this.refreshPromise) {
    return this.refreshPromise;
  }
  this.refreshPromise = (async () => {
    try {
      // ... actual refresh logic ...
    } finally {
      this.refreshPromise = null;
    }
  })();
  return this.refreshPromise;
}
```

---

## Also Fixed: Duplicate setFolderPath Call

**File:** `src/hooks/useDropboxFiles.ts` - `setFolderPath(path)` was called twice in succession. Removed the duplicate.

---

## Key Takeaways

| Pattern | Rule |
|---------|------|
| Dropbox file uploads | Upload sequentially, not in parallel, to avoid 429 rate limits |
| Dropbox folder listing | Always handle `has_more` pagination |
| Supabase optional lookups | Use `.maybeSingle()` not `.single()` when row may not exist |
| Token refresh | Use a mutex/promise dedup pattern when multiple concurrent calls may trigger refresh |
