# Deal-Level Contact Roles Implementation

**Branch:** `feature/deal-level-contact-roles`
**Date:** November 5, 2025
**Status:** Ready for Testing

## Overview

This implementation adds the ability to assign contact roles at the **deal level** (separate from client-level roles). Most importantly, it moves the "Critical Dates Reminders" role from client-level to deal-level, so that critical date email recipients are determined by contacts assigned to each specific deal.

## Key Changes

### 1. Database Schema

**New Tables Created:**
- `contact_deal_role_type` - Lookup table for deal-level role types
- `contact_deal_role` - Junction table linking contacts to deals with specific roles
- `v_contact_deal_roles` - View for querying deal-level contact roles

**Role Types Available at Deal Level (15 total):**
1. Franchisee
2. Franchisor
3. Real Estate Lead
4. Attorney
5. Lender
6. Contractor
7. Engineer
8. Landlord
9. Landlord Rep
10. Owner
11. Seller
12. Buyer
13. **Critical Dates Reminders** ⭐
14. Architect
15. Master Broker

**Migration File:** `supabase/migrations/20251105224414_create_deal_contact_roles.sql`

**Important:** The migration also marks "Critical Dates Reminders" as **inactive** (`is_active = false`) in the `contact_client_role_type` table, preventing new assignments at the client level while preserving historical data.

### 2. TypeScript Types

**File:** [database-schema-additions.ts](../database-schema-additions.ts)

Added types for:
- `ContactDealRoleType`
- `ContactDealRole`
- `ContactDealRoleInsert`
- `ContactDealRoleUpdate`
- `ContactDealRoleView`
- `CONTACT_DEAL_ROLE_NAMES` constant

### 3. Custom Hook

**File:** [src/hooks/useContactDealRoles.ts](../src/hooks/useContactDealRoles.ts)

New hook for managing contact-deal role assignments with methods:
- `addRole(contactId, dealId, roleId, notes?)`
- `removeRole(roleAssignmentId)`
- `toggleRoleActive(roleAssignmentId, isActive)`
- `updateRoleNotes(roleAssignmentId, notes)`
- `refreshRoles()`

Also includes `useHasDealRole()` helper hook for checking if a contact has a specific role for a deal.

### 4. UI Component

**File:** [src/components/ContactDealRolesManager.tsx](../src/components/ContactDealRolesManager.tsx)

New component for displaying and managing deal-level contact roles. Features:
- Color-coded role badges (14 different colors for each role type)
- Add/remove roles with modal interface
- Multi-select checkbox for adding multiple roles at once
- Compact mode for sidebar display

### 5. Integration with Deal Sidebar

**File:** [src/components/DealSidebar.tsx](../src/components/DealSidebar.tsx)

**Changes Made:**
- Added `ContactDealRolesManager` import
- Updated `ContactItem` component to accept `dealId`, `dealName`, and `onRoleChange` props
- Integrated `ContactDealRolesManager` into the expanded contact details section
- Added state to track `dealName` for display in role manager
- Modified deal data fetch to include `deal_name`

**UI Location:**
Role badges and the "+ Add Role" button now appear **directly below each contact name** in the "Associated Contacts" section. No need to expand the contact to see or manage roles - they're always visible for quick access.

### 6. Critical Dates Email System Updates

**Files Updated:**
1. [supabase/functions/send-critical-date-reminders-cron/index.ts](../supabase/functions/send-critical-date-reminders-cron/index.ts)
2. [supabase/functions/send-critical-date-email/index.ts](../supabase/functions/send-critical-date-email/index.ts)
3. [src/components/CriticalDateEmailPreviewModal.tsx](../src/components/CriticalDateEmailPreviewModal.tsx)

**Changes:**
- Changed from `contact_client_role_type` → `contact_deal_role_type`
- Changed from `contact_client_role` → `contact_deal_role`
- Changed filter from `.eq('client_id', deal.client_id)` → `.eq('deal_id', deal.id)`
- Updated error messages to reference "deal" instead of "client"

**Behavior:**
Critical date emails now **ONLY** pull recipients from contacts assigned to the specific deal with the "Critical Dates Reminders" role. Client-level "Critical Dates Reminders" roles are no longer used.

## Deployment Steps

### 1. Run Database Migration

**Option A: Using Supabase CLI**
```bash
npx supabase db push --db-url "your-database-url"
```

**Option B: Using psql**
```bash
psql $DATABASE_URL -f supabase/migrations/20251105224414_create_deal_contact_roles.sql
```

**Option C: Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `supabase/migrations/20251105224414_create_deal_contact_roles.sql`
3. Paste and run

### 2. Deploy Edge Functions

The critical dates email functions need to be redeployed:

```bash
supabase functions deploy send-critical-date-reminders-cron
supabase functions deploy send-critical-date-email
```

### 3. Deploy Frontend

Build and deploy the React application to pick up the new components and hooks:

```bash
npm run build
# Then deploy to your hosting environment
```

## Testing Plan

### 1. Database Migration Verification

After running the migration, verify:

```sql
-- Check that deal role tables exist
SELECT * FROM contact_deal_role_type ORDER BY sort_order;

-- Should return 15 roles including "Critical Dates Reminders" and "Master Broker"

-- Check that client-level "Critical Dates Reminders" is inactive
SELECT * FROM contact_client_role_type WHERE role_name = 'Critical Dates Reminders';

-- Should show is_active = false
```

### 2. UI Testing

1. **Navigate to a Deal**
   - Open any deal in the system
   - Open the "Associated Contacts" section in the right sidebar

2. **View Contact Roles (Always Visible)**
   - Roles now appear directly under each contact name without expanding
   - Verify that you see role badges immediately visible
   - Verify that you see an "+ Add Role" button for each contact

3. **Add Roles**
   - Click "+ Add Role" button
   - Verify modal appears with all 15 deal-level role types
   - Select one or more roles (e.g., "Critical Dates Reminders", "Attorney", "Master Broker")
   - Click "Add Role" or "Add X Roles"
   - Verify roles appear as colored badges directly under the contact
   - Verify each badge has an "X" to remove it

4. **Remove Roles**
   - Click the "X" on any role badge
   - Verify the role is immediately removed without confirmation

5. **Multiple Contacts**
   - View multiple contacts in the same deal
   - Verify each can have different roles (all visible without expanding)
   - Verify the "+ Add Role" button only shows roles not already assigned to that contact
   - Verify roles are color-coded and easy to distinguish at a glance

### 3. Critical Dates Email Testing

**Prerequisites:**
- Have a deal with at least one critical date configured
- Critical date should have "Send Email Reminder" enabled
- At least one contact on the deal should have the "Critical Dates Reminders" role

**Test Email Preview:**
1. Open a deal with a critical date
2. Click "Critical Dates" tab
3. Click on a critical date with email enabled
4. Click "Preview Email" button
5. Verify the "TO" recipients list shows ONLY contacts from the deal with "Critical Dates Reminders" role
6. Verify NO contacts from the client-level are included

**Test Manual Send:**
1. Use the manual send endpoint (or button if available)
2. Verify email is sent to deal-level contacts only
3. Check email inbox to confirm recipients

**Test Automated Cron Job:**
1. Create a critical date with:
   - `critical_date` = tomorrow's date
   - `send_email_days_prior` = 1
   - `send_email` = true
   - `sent_at` = null
2. Assign "Critical Dates Reminders" role to a contact on the deal
3. Wait for cron job to run (8:00 AM daily) or trigger manually
4. Verify email is sent to correct recipients
5. Verify `sent_at` timestamp is updated

### 4. Edge Cases

**Test 1: Deal with No Contacts**
- Create a deal with no associated contacts
- Try to preview critical date email
- Should show "No recipients" or similar message

**Test 2: Contact with No Email**
- Add a contact to a deal (no email address)
- Assign "Critical Dates Reminders" role
- Try to send critical date email
- Contact should be filtered out (not included in recipients)

**Test 3: Multiple Roles per Contact**
- Assign multiple roles to one contact (e.g., "Attorney" + "Critical Dates Reminders")
- Verify both badges appear
- Verify each can be removed independently

**Test 4: Same Contact on Multiple Deals**
- Add the same contact to two different deals
- Assign different roles on each deal
- Verify roles are independent per deal

**Test 5: Client-Level "Critical Dates Reminders" Role**
- Try to add "Critical Dates Reminders" role to a contact at the client level
- Should NOT appear in the available roles list
- Existing client-level assignments should remain in database but not be used

## Rollback Plan

If issues are discovered:

### 1. Revert Code Changes

```bash
git checkout main
```

### 2. Revert Database Migration

Run this SQL to undo the migration:

```sql
-- Drop deal-level role tables
DROP VIEW IF EXISTS v_contact_deal_roles;
DROP TABLE IF EXISTS contact_deal_role;
DROP TABLE IF EXISTS contact_deal_role_type;

-- Reactivate client-level "Critical Dates Reminders"
UPDATE contact_client_role_type
SET is_active = true
WHERE role_name = 'Critical Dates Reminders';
```

### 3. Redeploy Previous Edge Functions

```bash
git checkout main
supabase functions deploy send-critical-date-reminders-cron
supabase functions deploy send-critical-date-email
```

## Data Migration Considerations

### Existing Client-Level "Critical Dates Reminders" Assignments

**Current Behavior:**
- Client-level "Critical Dates Reminders" role is marked as **inactive**
- Existing assignments remain in `contact_client_role` table
- These assignments are NOT deleted (preserved for historical purposes)
- They will NOT be used by the critical dates email system
- They will NOT appear in the UI for new assignments

**If Migration Needed:**

If you want to migrate existing client-level "Critical Dates Reminders" assignments to deal-level, you'll need to write a custom script. Here's the logic:

```sql
-- For each client-level "Critical Dates Reminders" assignment:
-- 1. Find all deals associated with that client
-- 2. Create deal-level assignments for each deal

INSERT INTO contact_deal_role (contact_id, deal_id, role_id, is_active, notes, created_at, updated_at)
SELECT
  ccr.contact_id,
  d.id as deal_id,
  cdrt.id as role_id,
  ccr.is_active,
  'Migrated from client-level assignment' as notes,
  NOW() as created_at,
  NOW() as updated_at
FROM contact_client_role ccr
JOIN contact_client_role_type ccrt ON ccr.role_id = ccrt.id
JOIN deal d ON d.client_id = ccr.client_id
JOIN contact_deal_role_type cdrt ON cdrt.role_name = 'Critical Dates Reminders'
WHERE ccrt.role_name = 'Critical Dates Reminders'
  AND ccr.is_active = true
ON CONFLICT (contact_id, deal_id, role_id) DO NOTHING;
```

**⚠️ Warning:** Review this carefully before running. You may want to test on a single client first.

## Files Changed

### Database
- ✅ `supabase/migrations/20251105224414_create_deal_contact_roles.sql` - New migration
- ✅ `database-schema-additions.ts` - Added deal-level types

### Hooks
- ✅ `src/hooks/useContactDealRoles.ts` - New hook

### Components
- ✅ `src/components/ContactDealRolesManager.tsx` - New component
- ✅ `src/components/DealSidebar.tsx` - Modified to integrate roles UI

### Edge Functions
- ✅ `supabase/functions/send-critical-date-reminders-cron/index.ts` - Updated to use deal-level roles
- ✅ `supabase/functions/send-critical-date-email/index.ts` - Updated to use deal-level roles

### Frontend Components
- ✅ `src/components/CriticalDateEmailPreviewModal.tsx` - Updated to use deal-level roles

## Success Criteria

✅ Database migration runs without errors
✅ All 15 deal-level role types are available (including Master Broker)
✅ UI shows roles inline under each contact (no expansion needed)
✅ UI allows adding/removing roles for contacts on deals
✅ Role badges display with correct colors
✅ Critical date emails use deal-level "Critical Dates Reminders" contacts
✅ Client-level "Critical Dates Reminders" role is hidden from UI
✅ Email preview shows correct recipients
✅ Automated cron job sends to correct recipients

## Next Steps

1. **Run database migration** (see Deployment Steps above)
2. **Deploy edge functions**
3. **Deploy frontend build**
4. **Test in dev environment** (follow Testing Plan above)
5. **Verify critical dates emails** work correctly
6. **Monitor for any errors** in production logs
7. **Update user documentation** if needed

## Questions or Issues?

If you encounter any issues during testing:
1. Check Supabase logs for edge function errors
2. Check browser console for frontend errors
3. Verify database migration completed successfully
4. Confirm edge functions were redeployed
5. Test with a simple scenario first (one deal, one contact, one role)

## References

- [Contact Roles System Documentation](./CONTACT_ROLES_SYSTEM.md)
- [Critical Dates Email System Documentation](./CRITICAL_DATES_EMAIL_SYSTEM.md)
- [Development Standards](./DEVELOPMENT_STANDARDS.md)
