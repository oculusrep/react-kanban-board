# Portal Files Expand Issue - Debug Status

## Problem
Portal user reports she can see "Property Files (3 items)" in the header but clicking the expand arrow does nothing - files don't show.

## User Details
- Contact ID: `86d8571c-32df-4de7-b65a-96d48f62bae2`
- Client: Jeff's Bagel Run - Tarak & Krishna

## What We've Tried
1. Wrapped chevron in button element for better click target
2. Fixed item count to show loading/error states
3. Added debug banner (currently deployed) that shows state when expanded

## Current State
- Debug banner is deployed at https://ovis.oculusrep.com
- If she can expand the section, she'll see yellow debug info showing: `collapsed`, `loading`, `error`, `files`, `folders`, `regularFiles` counts
- But if the section won't expand at all, she won't see the debug banner

## To Resume - Login Options

### Option 1: Supabase Password Reset
1. Go to Supabase Dashboard → Authentication → Users
2. Find her by email
3. Send password reset OR temporarily set a known password
4. Log in as her, test, then have her reset password after

### Option 2: Create a Magic Link
```sql
-- In Supabase SQL Editor, generate a magic link for her email
SELECT auth.admin_generate_link('magiclink', 'her-email@example.com');
```

### Option 3: Check Data Directly
Query to check what she should see:
```sql
-- Check her accessible clients and site submits with files
SELECT
  ss.id as site_submit_id,
  p.property_name,
  dm.dropbox_folder_path
FROM portal_user_client_access puca
JOIN site_submit ss ON ss.client_id = puca.client_id
JOIN property p ON p.id = ss.property_id
LEFT JOIN dropbox_mapping dm ON dm.entity_id = p.id AND dm.entity_type = 'property'
WHERE puca.contact_id = '86d8571c-32df-4de7-b65a-96d48f62bae2'
  AND puca.is_active = true;
```

## Files Modified
- `src/components/portal/PortalFilesTab.tsx` - debug banner at line 616-621, console logging at line 478-489

## Next Step
Log in as her and reproduce the issue to see the actual state in the browser dev tools console.

## Cleanup Required
After fixing, remove:
1. Debug banner (lines 616-621 in PortalFilesTab.tsx)
2. Console.log statements (lines 478-489 in PortalFilesTab.tsx)
