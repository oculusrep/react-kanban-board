# Portal Files Display Issue - Ryann Frost

## Status: WAITING FOR USER TEST

**Date:** 2026-03-06

## Problem
Portal user Ryann Frost (`ryann@jeffsbagelrun.com`) can see the file COUNT in the "Property Files (3 items)" header but the actual file list doesn't render below it on her machine.

## What We've Ruled Out
1. **Code issue** - Files display correctly when logged in as Ryann from Mike's computer (incognito mode)
2. **RLS/permissions** - Another test portal user for same client sees files fine
3. **Collapsed state** - Screenshot shows chevron pointing up (expanded), not collapsed

## Debug Logging Added
Commit `ea1e1006` added comprehensive console logging to `PortalFilesTab.tsx`:

- `🔍 [property] getVisibleFiles:` - Shows filtering process
- `🔍 [property] File path check:` - Shows each file's path matching
- `🔍 [property] Visibility check:` - Shows visibility filtering for portal users
- `📁 [property] Rendering folder X:` - Shows each folder being rendered
- `📄 [property] Rendering file X:` - Shows each file being rendered
- `❌ [property] Malformed file:` - Shows if any file objects are corrupted

## Likely Causes
Based on testing, the issue is specific to Ryann's browser:

1. **Cached old JavaScript** - Most likely. Hard refresh (Cmd+Shift+R) should fix
2. **Browser extension** blocking content
3. **Browser compatibility** issue (need to know which browser she uses)

## Next Steps for Ryann
Have her try these in order:

1. **Hard refresh** - Press `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. **Clear browser cache** - If hard refresh doesn't work
3. **Try incognito/private mode** - Rules out extensions
4. **Check browser console** - Open DevTools (F12), go to Console tab, look for:
   - Any red error messages
   - The `🔍` and `📁` debug logs showing file processing

## Console Output to Look For
If working correctly, console should show:
```
🔍 [property] getVisibleFiles: {totalFiles: 3, folderPath: "...", ...}
🔍 [property] Files matching path: 3
📁 [property] Rendering 1 folders and 2 files: {...}
📁 [property] Rendering folder 0: Units ...
📄 [property] Rendering file 0: filename.pdf ...
```

If files aren't rendering, we need to see:
- Does `totalFiles` show the correct count?
- Does `Files matching path` show 0? (path mismatch issue)
- Are there any `❌` error logs? (malformed data)
- Any red JavaScript errors?

## Related Files
- `src/components/portal/PortalFilesTab.tsx` - Debug logging added
- `src/contexts/AuthContext.tsx` - Cache version invalidation (already deployed)

## Previous Debug Work
- Created admin script `scripts/admin-login-as-user.ts` to generate magic links
- Added `USER_CACHE_VERSION` to clear stale localStorage on deploy
