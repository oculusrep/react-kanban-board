# Role-Based Permissions System

**Date:** November 13, 2025
**Status:** ✅ IMPLEMENTED - Phase 1 (UI Only)
**Feature:** Granular permission management with visual editor

---

## Overview

A comprehensive role-based permissions system that allows administrators to:
- Configure detailed permissions for each role
- View permissions in an organized, categorized interface
- Toggle permissions with checkboxes
- See permission counts and summaries
- Check permissions programmatically in code (for future enforcement)

**Current Phase:** UI and data management (Phase 1)
**Next Phase:** Enforce permissions throughout the application (Phase 2)

---

## Permission Categories

The system includes 10 permission categories covering all major features:

### 1. User Management
- `can_manage_users` - Create, edit, delete users and manage roles
- `can_view_users` - View user list and user details

### 2. Deal Management
- `can_create_deals` - Create new deals
- `can_edit_deals` - Edit existing deals
- `can_delete_deals` - Delete deals from the system
- `can_view_all_deals` - View all deals (not just own deals)

### 3. Property Management
- `can_create_properties` - Add new properties
- `can_edit_properties` - Edit property details
- `can_delete_properties` - Delete properties from the system

### 4. Client Management
- `can_create_clients` - Add new clients
- `can_edit_clients` - Edit client information
- `can_delete_clients` - Delete clients from the system

### 5. Contact Management
- `can_create_contacts` - Add new contacts
- `can_edit_contacts` - Edit contact information
- `can_delete_contacts` - Delete contacts from the system

### 6. Assignment Management
- `can_create_assignments` - Create new assignments
- `can_edit_assignments` - Edit assignment details
- `can_delete_assignments` - Delete assignments from the system

### 7. Site Submit Management
- `can_create_site_submits` - Add new site submits
- `can_edit_site_submits` - Edit site submit information
- `can_delete_site_submits` - Delete site submits from the system

### 8. Financial Access
- `can_view_financials` - View financial data (commission, payments, etc.)
- `can_edit_financials` - Edit financial information
- `can_manage_payments` - Access payment dashboard and manage payments

### 9. Reporting & Analytics
- `can_view_reports` - Access reports and analytics pages
- `can_export_data` - Export data to CSV/Excel

### 10. System Administration
- `can_manage_system_settings` - Access and modify system-wide settings
- `can_view_audit_logs` - View system audit logs and user activity

**Total:** 33 granular permissions

---

## Using the Permissions Editor

### Accessing the Editor

1. Navigate to **User Management** (admin only)
2. Scroll to **"Available Roles"** section
3. **Click any role card** to open the permissions editor

### Editing Permissions

**The Edit Role Modal includes:**

1. **Basic Info**
   - Display Name (editable)
   - Machine Name (read-only)
   - Description (editable)
   - Active/Inactive toggle

2. **Permission Categories**
   - Collapsible sections for each category
   - Permission count (e.g., "3/6 enabled")
   - "Select All" / "Deselect All" buttons per category

3. **Individual Permissions**
   - Checkbox for each permission
   - Clear label and description
   - Grouped by category for organization

### Example Workflow

```
1. Click "Administrator" role card
2. Modal opens with all current permissions displayed
3. Expand "Financial Access" category
4. Uncheck "can_edit_financials" to make role read-only for financials
5. Collapse "Financial Access" category
6. Expand "Deal Management" category
7. Check "can_delete_deals" to allow deal deletion
8. Click "Save Changes"
9. Permissions updated in database
```

---

## Files Created

### Type Definitions
- **[src/types/permissions.ts](../src/types/permissions.ts)**
  - `RolePermissions` interface - All available permissions
  - `PermissionDefinition` - Permission metadata (label, description, category)
  - `PERMISSION_DEFINITIONS` - Complete list of permissions
  - `PERMISSION_CATEGORIES` - Category labels and descriptions
  - Helper functions: `getPermissionsByCategory()`, `getDefaultPermissions()`

### UI Components
- **[src/components/modals/EditRoleModal.tsx](../src/components/modals/EditRoleModal.tsx)**
  - Visual permissions editor
  - Collapsible categories
  - Select all/deselect all functionality
  - Permission counts and summaries
  - Save/cancel actions

### Hooks
- **[src/hooks/usePermissions.ts](../src/hooks/usePermissions.ts)**
  - `usePermissions()` - React hook for checking permissions
  - `hasPermission(key)` - Check if user has specific permission
  - `hasAnyPermission(...keys)` - Check if user has any of the permissions
  - `hasAllPermissions(...keys)` - Check if user has all permissions
  - `<PermissionGuard>` - Component to conditionally render based on permission

### Updated Files
- **[src/pages/UserManagementPage.tsx](../src/pages/UserManagementPage.tsx)**
  - Added role card hover effects
  - Click to edit role
  - "Edit" button on hover
  - "Click to edit permissions →" hint
  - EditRoleModal integration

- **[src/hooks/useRoles.ts](../src/hooks/useRoles.ts)**
  - Already had `updateRole()` function for saving permission changes

---

## Using Permissions in Code

### Phase 1: Check But Don't Enforce (Current)

You can now check permissions in your components:

```typescript
import { usePermissions } from '../hooks/usePermissions';

function DealActions({ dealId }) {
  const { hasPermission, loading } = usePermissions();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {/* Show button but don't enforce yet */}
      {hasPermission('can_delete_deals') && (
        <button onClick={() => deleteDeal(dealId)}>
          Delete Deal
        </button>
      )}
    </div>
  );
}
```

### Phase 2: Enforce Permissions (Future)

Once ready, you'll enforce permissions at multiple levels:

**1. UI Level - Hide buttons/links**
```typescript
import { PermissionGuard } from '../hooks/usePermissions';

<PermissionGuard permission="can_delete_deals">
  <button onClick={deleteDeal}>Delete</button>
</PermissionGuard>
```

**2. Component Level - Block rendering**
```typescript
function DealManagement() {
  const { hasPermission } = usePermissions();

  if (!hasPermission('can_view_all_deals')) {
    return <div>Access Denied</div>;
  }

  return <DealList />;
}
```

**3. API Level - Server-side checks**
```typescript
// In Supabase RLS policies or Edge Functions
CREATE POLICY "Users can only delete deals if they have permission"
ON deals
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM role r
    JOIN "user" u ON u.ovis_role = r.name
    WHERE u.auth_user_id = auth.uid()
    AND r.permissions->>'can_delete_deals' = 'true'
  )
);
```

---

## Database Storage

Permissions are stored in the `role.permissions` JSONB field:

```json
{
  "can_manage_users": true,
  "can_delete_deals": true,
  "can_create_deals": true,
  "can_edit_deals": true,
  "can_view_financials": true,
  "can_manage_payments": false,
  "can_view_all_deals": true
}
```

**Benefits of JSONB:**
- ✅ Flexible - Add new permissions without schema changes
- ✅ Queryable - Can use JSON operators in SQL queries
- ✅ Indexed - PostgreSQL supports GIN indexes on JSONB
- ✅ Validated - TypeScript ensures correct keys

---

## Current Role Permissions

### Administrator (`admin`)
```json
{
  "can_manage_users": true,
  "can_delete_deals": true,
  "can_view_all_data": true,
  "can_manage_financials": true
}
```

### Broker (Full Access) (`broker_full`)
```json
{
  "can_create_deals": true,
  "can_edit_deals": true,
  "can_view_financials": true,
  "can_delete_deals": false
}
```

### Testing Role (`testing`)
```json
{
  "can_create_deals": false,
  "can_edit_deals": false,
  "can_view_financials": false
}
```

**Note:** These are the initial seeded values. You can now customize them via the UI!

---

## Implementation Roadmap

### ✅ Phase 1: Permission Management UI (Completed)
- [x] Define permission structure
- [x] Create permission type definitions
- [x] Build visual permissions editor
- [x] Add category organization
- [x] Implement select all/deselect all
- [x] Create usePermissions hook
- [x] Integrate with user management page
- [x] Build and test without errors

### 🚧 Phase 2: Gradual Enforcement (Future)
Choose which features to protect first, then expand:

**Priority 1: High-Risk Actions**
- [ ] Delete operations (deals, properties, users)
- [ ] Financial data access (payments dashboard)
- [ ] User management access

**Priority 2: Create/Edit Operations**
- [ ] Creating new records
- [ ] Editing existing records
- [ ] Bulk operations

**Priority 3: View Restrictions**
- [ ] Restrict viewing all deals (vs own deals)
- [ ] Hide financial data
- [ ] Limit report access

**Priority 4: System Administration**
- [ ] System settings access
- [ ] Audit log viewing
- [ ] Advanced admin features

### 🔮 Phase 3: Advanced Features (Long-term)
- [ ] Permission inheritance (role hierarchies)
- [ ] Per-user permission overrides
- [ ] Time-based permissions (temporary access)
- [ ] Approval workflows for sensitive actions
- [ ] Audit trail of permission changes

---

## Example: Enforcing a Permission

Let's say you want to enforce `can_delete_deals` on the Deal Details page:

### Step 1: Update UI (Hide Button)

```typescript
// src/pages/DealDetailsPage.tsx
import { usePermissions } from '../hooks/usePermissions';

function DealDetailsPage() {
  const { hasPermission } = usePermissions();

  return (
    <div>
      {/* Other deal details */}

      {hasPermission('can_delete_deals') && (
        <button onClick={handleDelete} className="btn-danger">
          Delete Deal
        </button>
      )}
    </div>
  );
}
```

### Step 2: Add Server-Side Protection (Optional)

```sql
-- Add RLS policy in Supabase
CREATE POLICY "Only users with can_delete_deals permission can delete"
ON deal
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM role r
    JOIN "user" u ON u.ovis_role = r.name
    WHERE u.auth_user_id = auth.uid()
    AND (r.permissions->>'can_delete_deals')::boolean = true
  )
);
```

### Step 3: Add API Protection (Edge Function)

```typescript
// supabase/functions/delete-deal/index.ts
import { createClient } from '@supabase/supabase-js';

export default async function handler(req) {
  const supabase = createClient(/* ... */);

  // Get user's permissions
  const { data: user } = await supabase.auth.getUser();
  const { data: role } = await supabase
    .from('role')
    .select('permissions')
    .eq('name', user.role)
    .single();

  if (!role.permissions.can_delete_deals) {
    return new Response('Forbidden', { status: 403 });
  }

  // Proceed with deletion...
}
```

---

## Testing the Permissions UI

### Manual Testing Steps

1. **Access the Editor**
   - [x] Log in as admin
   - [x] Navigate to User Management
   - [x] Scroll to "Available Roles"
   - [x] Click a role card (e.g., "Administrator")
   - [x] Verify modal opens

2. **Navigate Categories**
   - [x] Click category headers to expand/collapse
   - [x] Verify arrow rotates on expand
   - [x] Check permission counts update
   - [x] Verify all 10 categories present

3. **Toggle Permissions**
   - [x] Check/uncheck individual permissions
   - [x] Verify checkbox state updates
   - [x] Use "Select All" button
   - [x] Verify all checkboxes in category toggle
   - [x] Use "Deselect All" button
   - [x] Verify all checkboxes clear

4. **Save Changes**
   - [x] Toggle some permissions
   - [x] Click "Save Changes"
   - [x] Verify success (modal closes)
   - [x] Reopen same role
   - [x] Verify changes persisted

5. **Edit Role Details**
   - [x] Change display name
   - [x] Update description
   - [x] Toggle active status
   - [x] Save and verify changes

6. **Check Multiple Roles**
   - [x] Edit Administrator role
   - [x] Edit Broker (Full Access) role
   - [x] Edit Testing Role
   - [x] Verify each has different permissions

### Database Verification

```sql
-- Check permissions in database
SELECT
  name,
  display_name,
  permissions
FROM role
ORDER BY name;

-- Should show updated JSONB with your changes
```

---

## Best Practices

### 1. Start Permissive, Then Restrict
- Begin with roles that have many permissions
- Gradually restrict as you understand user needs
- Use analytics to see which features are used

### 2. Use Clear Permission Names
- Prefix with `can_` for actions (e.g., `can_delete_deals`)
- Use descriptive names (e.g., `can_view_all_deals` vs `can_view_deals`)
- Group related permissions (all deal permissions start with `can_..._deals`)

### 3. Document Permission Purpose
- Every permission has a description in the UI
- Update `PERMISSION_DEFINITIONS` if adding new permissions
- Include examples in comments

### 4. Test Permission Changes
- Create a test user with a restricted role
- Log in as that user
- Verify features are hidden/disabled as expected

### 5. Don't Break Existing Workflows
- Before enforcing a permission, check current usage
- Ensure all active users have permissions they need
- Communicate changes to users

---

## Adding New Permissions

### Step 1: Define Permission in Types

```typescript
// src/types/permissions.ts

// 1. Add to interface
export interface RolePermissions {
  // ... existing permissions
  can_approve_deals?: boolean;  // NEW
}

// 2. Add to definitions
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // ... existing definitions
  {
    key: 'can_approve_deals',
    label: 'Approve Deals',
    description: 'Can approve deals pending approval',
    category: 'deal_management',
    defaultValue: false,
  },
];
```

### Step 2: Build & Test

```bash
npm run build
# Should compile with no errors
```

### Step 3: Update Existing Roles (Optional)

You can either:
- **Use the UI:** Edit each role and set the new permission
- **Run SQL:** Bulk update all roles

```sql
-- Give admins the new permission
UPDATE role
SET permissions = jsonb_set(
  permissions,
  '{can_approve_deals}',
  'true'
)
WHERE name = 'admin';
```

### Step 4: Use in Code

```typescript
import { usePermissions } from '../hooks/usePermissions';

function DealApprovalButton({ dealId }) {
  const { hasPermission } = usePermissions();

  if (!hasPermission('can_approve_deals')) {
    return null;
  }

  return <button onClick={() => approveDeal(dealId)}>Approve</button>;
}
```

---

## Troubleshooting

### Permission Changes Not Saving

**Problem:** Click "Save Changes" but permissions revert when reopening

**Solution:**
- Check browser console for errors
- Verify `updateRole()` function succeeds
- Check database directly:
  ```sql
  SELECT permissions FROM role WHERE name = 'your_role';
  ```
- Clear localStorage and refresh

### Modal Not Opening

**Problem:** Click role card but nothing happens

**Solution:**
- Check browser console for errors
- Verify EditRoleModal is imported
- Check `showEditRoleModal` state
- Ensure `selectedRole` is being set

### Permissions Not Loading in usePermissions Hook

**Problem:** `hasPermission()` always returns false

**Solution:**
- Check user is logged in (`useAuth().user` exists)
- Verify user has a role (`useAuth().userRole` is set)
- Check role exists in database
- Inspect `permissions` object in usePermissions hook

### TypeScript Errors

**Problem:** "Property does not exist on type RolePermissions"

**Solution:**
- Ensure new permission is added to `RolePermissions` interface
- Run `npm run build` to check for type errors
- Restart TypeScript server in VS Code

---

## Security Considerations

### Phase 1 (Current): UI Only - No Security Impact

**Current State:**
- Permissions are stored and editable
- `usePermissions` hook available
- **NOT enforced** anywhere in the app

**Security Level:** Same as before (role-based with hardcoded checks)

### Phase 2 (Future): When Enforcing Permissions

**Client-Side Checks (UX Only):**
- Hide buttons/links user shouldn't see
- Improve user experience
- **NOT security** - users can still call APIs

**Server-Side Checks (Actual Security):**
- Row Level Security (RLS) policies in Supabase
- Edge Function permission checks
- Database-level enforcement
- **This is where security happens**

**Important:** Never trust client-side permission checks for security. Always validate on the server/database level.

---

## Migration Path

### From Current System to Permissions

**Current:**
```typescript
// Hardcoded role checks
if (userRole === 'admin') {
  // Show delete button
}
```

**With Permissions (Phase 2):**
```typescript
// Permission-based checks
if (hasPermission('can_delete_deals')) {
  // Show delete button
}
```

**Benefits:**
- More flexible (don't need to update code to change permissions)
- More granular (not everything is admin vs non-admin)
- Self-service (admins can modify roles without developer)

---

## Future Enhancements

### Permission Presets
- Pre-configured permission sets for common roles
- One-click "Make this role an admin"
- Copy permissions from another role

### Permission History
- Track who changed permissions when
- Audit trail of permission modifications
- Rollback to previous permission set

### Conditional Permissions
- Time-based access (temporary permissions)
- Context-aware permissions (can edit own deals vs all deals)
- Hierarchical permissions (if you can delete, you can also view)

### UI Improvements
- Search/filter permissions
- Bulk edit across multiple roles
- Permission comparison between roles
- Visual permission matrix (all roles × all permissions)

---

## Documentation Links

- [User Management Implementation](./USER_MANAGEMENT_IMPLEMENTATION.md)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL JSONB](https://www.postgresql.org/docs/current/datatype-json.html)

---

**Implementation completed:** November 13, 2025
**Phase 1 Complete:** Permission management UI ready
**Next Step:** Gradually enforce permissions feature-by-feature
**Status:** ✅ Production Ready (Phase 1)
