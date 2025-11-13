# User Management Dashboard Implementation

**Date:** November 13, 2025
**Status:** ✅ IMPLEMENTED - Ready for Testing
**Feature:** Complete user management system with role-based access control

---

## Overview

A comprehensive user management dashboard that allows administrators to:
- View all system users with their roles and status
- Create new user accounts with temporary passwords
- Edit user information and roles
- Send password reset emails
- Deactivate/activate user accounts
- Delete users (with confirmation)
- Manage roles (view, create custom roles)

---

## Architecture

### Database Schema

**New Table: `role`**
```sql
CREATE TABLE role (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,           -- 'admin', 'broker', 'assistant'
  display_name TEXT NOT NULL,          -- 'Administrator', 'Broker', 'Assistant'
  description TEXT,
  permissions JSONB,                   -- Future: fine-grained permissions
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Enhanced Table: `user`**
- Added foreign key constraint: `ovis_role` → `role.name`
- Ensures only valid roles can be assigned
- ON DELETE RESTRICT prevents deleting roles in use
- ON UPDATE CASCADE updates user records if role name changes

### Technology Stack

- **Frontend:** React + TypeScript + TailwindCSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Auth:** Supabase Auth (existing - no changes needed)
- **State Management:** React hooks (useUsers, useRoles)

---

## Files Created

### Database Migration
- [migrations/create_role_table.sql](../migrations/create_role_table.sql)
  - Creates `role` reference table
  - Seeds default roles (admin, broker, assistant)
  - Adds foreign key constraint to user table
  - Includes verification query

### TypeScript Schema
- [database-schema.ts](../database-schema.ts) (updated)
  - Added `role` table type definitions
  - Supports Insert/Update/Row operations

### Custom Hooks
- [src/hooks/useUsers.ts](../src/hooks/useUsers.ts)
  - `fetchUsers()` - Get all users with role info
  - `createUser()` - Create auth user + user table record
  - `updateUser()` - Update user details
  - `deleteUser()` - Delete user + auth account
  - `sendPasswordResetEmail()` - Send password reset link
  - `activateUser()` / `deactivateUser()` - Toggle user status

- [src/hooks/useRoles.ts](../src/hooks/useRoles.ts)
  - `fetchRoles()` - Get all available roles
  - `createRole()` - Create new custom role
  - `updateRole()` - Update role details
  - `deleteRole()` - Delete unused roles
  - `activateRole()` / `deactivateRole()` - Toggle role status

### UI Components
- [src/pages/UserManagementPage.tsx](../src/pages/UserManagementPage.tsx)
  - Main dashboard page
  - Users table with search/filter
  - Stats cards (total users, active users, available roles)
  - Roles section showing all roles with user counts

- [src/components/modals/CreateUserModal.tsx](../src/components/modals/CreateUserModal.tsx)
  - Form to create new users
  - Fields: email, password, name, first/last name, phone, role
  - Auto-creates Supabase auth account + user table record

- [src/components/modals/EditUserModal.tsx](../src/components/modals/EditUserModal.tsx)
  - Edit existing user details
  - Change role, update contact info
  - Activate/deactivate user toggle

- [src/components/modals/CreateRoleModal.tsx](../src/components/modals/CreateRoleModal.tsx)
  - Create new custom roles
  - Machine name (snake_case) + display name
  - Optional description

### Routes & Navigation
- [src/App.tsx](../src/App.tsx)
  - Added route: `/admin/users` (AdminRoute protected)

- [src/components/Navbar.tsx](../src/components/Navbar.tsx)
  - Added "👥 User Management" link for admins
  - Available in both desktop and mobile menus

---

## Setup Instructions

### 1. Run Database Migration

**IMPORTANT:** Run this migration BEFORE testing the feature.

```bash
# Option A: Via Supabase Dashboard (Recommended)
1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql
2. Open: migrations/create_role_table.sql
3. Copy the SQL contents
4. Paste into SQL Editor
5. Click "Run"
6. Verify output shows: "3 rows inserted" and verification table
```

**Option B: Via psql (if you have direct database access)**
```bash
psql -f migrations/create_role_table.sql
```

### 2. Verify Migration

Run this query in Supabase SQL Editor:
```sql
-- Should show 3 default roles
SELECT * FROM role ORDER BY name;

-- Should show foreign key constraint
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'user'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'ovis_role';
```

### 3. Build Application

```bash
npm run build
```

Should complete with no errors.

### 4. Start Development Server

```bash
npm run dev
```

### 5. Access User Management

1. Log in as an **admin** user
2. Click your profile menu (top right)
3. Click **"👥 User Management"**
4. You should see the User Management Dashboard

---

## Features & Usage

### View Users

**Users Table:**
- Shows all users with name, email, role, and status
- Search bar filters by name, email, or role
- Hover over rows for better visibility

**Stats Cards:**
- Total Users
- Active Users (can log in)
- Available Roles

### Create New User

1. Click **"+ Create User"** button
2. Fill in the form:
   - **Email:** User's login email (required)
   - **Temporary Password:** At least 6 characters (required)
   - **Full Name:** Display name (required)
   - **First/Last Name:** Optional, for detailed records
   - **Mobile Phone:** Optional contact info
   - **Role:** Select from dropdown (required)
3. Click **"Create User"**

**What happens:**
- Creates Supabase auth account (auto-confirmed)
- Creates user record in `user` table linked by `auth_user_id`
- If creation fails, auth account is rolled back

**User receives:**
- No automatic email (you send credentials manually)
- They can log in immediately with the temp password
- Recommend they change password via "Forgot Password" link

### Edit User

1. Click **"Edit"** on any user row
2. Modify:
   - Email (affects login)
   - Name, first/last name
   - Mobile phone
   - Role (changes permissions)
   - Active status (controls login access)
3. Click **"Save Changes"**

**Notes:**
- Changing email may prevent user from logging in with old email
- Deactivating a user prevents login but preserves data

### Send Password Reset

1. Click **"Reset Password"** on any user row
2. Confirm the email address
3. Password reset email sent to user
4. User clicks link → sets new password

**Reset link redirects to:**
```
https://your-domain.com/reset-password
```

### Delete User

1. Click **"Delete"** on any user row
2. Review confirmation dialog showing what will be deleted
3. Confirm deletion

**What gets deleted:**
- User record from `user` table
- Auth account from `auth.users`
- **Cannot be undone!**

**What's preserved:**
- Historical records (deals, properties created by this user)
- Foreign key references remain intact via `created_by_id`

### Create Custom Role

1. Click **"+ Create Role"** button
2. Fill in:
   - **Display Name:** Human-readable (e.g., "Senior Broker")
   - **Machine Name:** Lowercase identifier (e.g., "senior_broker")
   - **Description:** Optional explanation
3. Click **"Create Role"**

**Role appears:**
- In the "Available Roles" section
- In role dropdowns when creating/editing users
- In user table as assigned roles

**Permissions (Future):**
The `permissions` JSONB field is ready for future enhancement:
```json
{
  "can_manage_users": true,
  "can_delete_deals": false,
  "can_view_financials": true
}
```

### View Roles

**Roles Section (bottom of page):**
- Shows all roles as cards
- Display name + machine name
- Description
- User count (how many users have this role)
- Active/Inactive status badge

---

## Role-Based Access Control

### Current Roles (Seeded by Migration)

1. **Administrator (`admin`)**
   - Full system access
   - Can manage users
   - Can delete deals
   - Can view all data
   - Can manage financials

2. **Broker (`broker`)**
   - Full access to deals, properties, clients
   - Can create and edit deals
   - Can view financials
   - Cannot manage users

3. **Assistant (`assistant`)**
   - Limited access for support tasks
   - Can edit deals (but not create)
   - Cannot view financials
   - Cannot manage users

### Permissions System (Future Enhancement)

The `role` table includes a `permissions` JSONB field for fine-grained control:

```typescript
// Example future implementation
interface RolePermissions {
  can_manage_users: boolean;
  can_delete_deals: boolean;
  can_create_deals: boolean;
  can_edit_deals: boolean;
  can_view_financials: boolean;
  can_manage_financials: boolean;
  can_view_all_data: boolean;
  can_export_data: boolean;
  max_deal_value?: number;
}
```

**To implement:**
1. Add permission checks in components:
   ```typescript
   const { userRole } = useAuth();
   const role = await supabase.from('role').select('permissions').eq('name', userRole).single();
   const canDeleteDeals = role.data?.permissions?.can_delete_deals;
   ```

2. Add Row Level Security (RLS) policies based on permissions
3. Create permission management UI in role creation modal

---

## Security Considerations

### Admin-Only Access

- User Management page wrapped in `<AdminRoute>`
- Only users with `ovis_role = 'admin'` can access
- Non-admins see 403 or redirect

### Password Requirements

- Minimum 6 characters (Supabase default)
- Temporary passwords should be strong
- Users can change password after first login

### Auth Account Creation

**Uses Supabase Admin API:**
```typescript
const { data, error } = await supabase.auth.admin.createUser({
  email: email,
  password: password,
  email_confirm: true  // Skip email verification
});
```

**Requires:**
- Service role key (server-side)
- Or admin JWT token (client-side with admin role)

### Deletion Safety

- Confirmation dialog before deletion
- Shows what will be deleted
- Cannot undo deletion
- Historical records preserved (foreign keys remain valid)

### Role Assignment

- Only valid roles can be assigned (enforced by foreign key)
- Deleting a role in use is prevented (ON DELETE RESTRICT)
- Inactive roles hidden from user creation dropdown

---

## Testing Checklist

### Database Setup
- [ ] Run migration SQL successfully
- [ ] Verify 3 roles created (admin, broker, assistant)
- [ ] Check foreign key constraint exists on `user.ovis_role`
- [ ] Confirm existing users still work (no data lost)

### User Creation
- [ ] Click "+ Create User" button
- [ ] Fill all required fields
- [ ] Create user successfully
- [ ] Verify user appears in table
- [ ] Verify user can log in with temp password
- [ ] Check auth user created in Supabase Auth dashboard

### User Editing
- [ ] Click "Edit" on a user
- [ ] Change name, email, role
- [ ] Save changes successfully
- [ ] Verify changes reflected in table
- [ ] Toggle active status
- [ ] Confirm inactive user cannot log in

### Password Reset
- [ ] Click "Reset Password" on a user
- [ ] Confirm email sent (check email inbox)
- [ ] Click reset link from email
- [ ] Set new password successfully
- [ ] Log in with new password

### User Deletion
- [ ] Click "Delete" on a user
- [ ] Review confirmation message
- [ ] Confirm deletion
- [ ] Verify user removed from table
- [ ] Check auth account deleted in Supabase
- [ ] Verify historical records still show user name (via foreign keys)

### Role Management
- [ ] Click "+ Create Role" button
- [ ] Create custom role (e.g., "Senior Broker")
- [ ] Verify role appears in "Available Roles" section
- [ ] Verify role appears in user creation dropdown
- [ ] Assign new role to a user
- [ ] Attempt to delete role in use (should fail with error)

### Search & Filtering
- [ ] Search users by name
- [ ] Search users by email
- [ ] Search users by role
- [ ] Clear search shows all users

### Admin Access Control
- [ ] Log in as admin → User Management link visible
- [ ] Log in as non-admin → User Management link hidden
- [ ] Navigate directly to `/admin/users` as non-admin → redirected

### Mobile Responsiveness
- [ ] Open on mobile device
- [ ] User table scrolls horizontally if needed
- [ ] Modals display correctly on small screens
- [ ] Navigation menu shows User Management for admins

---

## Error Handling

### Common Errors & Solutions

**Error: "Foreign key constraint violation"**
- **Cause:** Trying to assign a role that doesn't exist
- **Solution:** Run migration to create `role` table and seed roles

**Error: "Cannot delete role - violates foreign key constraint"**
- **Cause:** Trying to delete a role that's assigned to users
- **Solution:** Reassign users to different role first, then delete

**Error: "User creation failed - email already exists"**
- **Cause:** Email already registered in Supabase Auth
- **Solution:** Use different email or delete existing auth account first

**Error: "Failed to fetch users"**
- **Cause:** Database connection issue or permissions
- **Solution:** Check Supabase connection, verify RLS policies allow admin to read `user` table

**Error: "Admin API not available"**
- **Cause:** Missing service role key or insufficient permissions
- **Solution:** Ensure Supabase client has admin privileges (use service role key for server-side operations)

---

## Future Enhancements

### Phase 1 (Current Implementation) ✅
- [x] View all users
- [x] Create users with temporary passwords
- [x] Edit user details
- [x] Delete users
- [x] Send password reset emails
- [x] Manage roles (view, create)
- [x] Search/filter users

### Phase 2 (Planned)
- [ ] Fine-grained permissions system
- [ ] Role-based UI restrictions (hide features based on role)
- [ ] Bulk user operations (bulk role assignment, bulk deactivation)
- [ ] User activity logs (who did what, when)
- [ ] Email templates for user invitations
- [ ] User groups/teams
- [ ] Custom permission overrides per user

### Phase 3 (Future)
- [ ] Two-factor authentication (2FA)
- [ ] SSO integration (Google, Microsoft)
- [ ] API key management for users
- [ ] Session management (view active sessions, force logout)
- [ ] Password policy enforcement (complexity requirements)
- [ ] User onboarding workflows

---

## Troubleshooting

### Migration Issues

**Problem:** Migration fails with "table already exists"
```sql
-- Solution: Drop table and re-run
DROP TABLE IF EXISTS role CASCADE;
-- Then run migration again
```

**Problem:** Foreign key constraint fails
```sql
-- Check for invalid roles in user table
SELECT DISTINCT ovis_role FROM "user" WHERE ovis_role IS NOT NULL;

-- Update invalid roles to valid ones
UPDATE "user" SET ovis_role = 'admin' WHERE ovis_role = 'invalid_role';
```

### Auth Issues

**Problem:** "Admin API not available"
- Check: Using correct Supabase client (with service role key for admin operations)
- Solution: For client-side, ensure logged-in user has admin privileges

**Problem:** Password reset emails not sending
- Check: Supabase Auth email templates configured
- Check: Email service enabled in Supabase settings
- Solution: Configure SMTP or use Supabase's default email service

### UI Issues

**Problem:** User Management link not visible
- Check: Current user's `ovis_role` is set to 'admin'
- Check: `userRole` from `useAuth()` hook returns 'admin'
- Solution: Update user's role in database manually if needed:
  ```sql
  UPDATE "user" SET ovis_role = 'admin' WHERE email = 'your-email@example.com';
  ```

**Problem:** Modals not opening
- Check: Browser console for JavaScript errors
- Check: React component state (showCreateUserModal, etc.)
- Solution: Clear browser cache, reload page

---

## Code Examples

### Creating a User Programmatically

```typescript
import { useUsers } from '../hooks/useUsers';

const { createUser } = useUsers();

const result = await createUser(
  'newuser@example.com',
  'tempPassword123',
  {
    name: 'John Doe',
    first_name: 'John',
    last_name: 'Doe',
    ovis_role: 'broker',
    mobile_phone: '555-1234',
    active: true
  }
);

if (result.success) {
  console.log('User created successfully');
} else {
  console.error('Error:', result.error);
}
```

### Checking User Permissions (Future)

```typescript
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

const { userRole } = useAuth();

// Fetch role permissions
const { data } = await supabase
  .from('role')
  .select('permissions')
  .eq('name', userRole)
  .single();

const permissions = data?.permissions as RolePermissions;

if (permissions?.can_delete_deals) {
  // Show delete button
}
```

---

## Documentation Links

- [Supabase Auth Admin API](https://supabase.com/docs/reference/javascript/auth-admin-api)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Foreign Keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)

---

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in browser console
3. Check Supabase dashboard logs
4. Review database migration output

---

**Implementation completed:** November 13, 2025
**Ready for testing and deployment** ✅
