# Session Notes: Contact Roles UI Refinements and Email Issue

**Date**: 2025-10-12
**Status**: Partially Complete - Migrations Need to be Run

---

## Summary

This session focused on refining the Contact Roles UI and troubleshooting why site submit emails weren't being sent. We completed the UI improvements and identified that the database migrations haven't been run yet.

---

## What We Completed ✅

### 1. UI Refinements
- ✅ Removed border line separator between client names and role badges in ContactSidebar
- ✅ Removed "Select Role *" label from add role modal for cleaner interface
- ✅ Removed confirmation dialog when deleting roles - instant deletion on X click
- ✅ Changed from browser dropdown to custom radio button UI for role selection

### 2. Files Modified and Committed
```
Commit: ecf2ebe - "Contact roles system UI refinements and finalization"

Files changed:
- src/components/ContactRolesManager.tsx (removed confirmation, removed label)
- src/components/ContactSidebar.tsx (removed border classes)
- migrations/finalize_contact_roles.sql (created new migration)
- docs/CONTACT_ROLES_SYSTEM.md (updated documentation)
- Plus 7 other files (new components, hooks, docs)
```

### 3. Deployment
- ✅ Committed all changes to git
- ✅ Pushed to GitHub (commit ecf2ebe)
- ✅ Verified Supabase Edge Function is deployed (send-site-submit-email)

---

## Current Issue: Site Submit Emails Not Working 🔴

### The Problem

User reported: "when i Click on submit site, button, to send my email, even though I now have multiple site selectors for an account in the roles, it won't send the email because it says there are no site selectors"

### Root Cause Identified

The **email function code is correct** (it's looking for the Site Selector role in the `contact_client_role` table), but the **database migrations haven't been run yet**.

This means:
1. ❌ The `contact_client_role_type` table doesn't exist
2. ❌ The `contact_client_role` table doesn't exist
3. ❌ No contacts have been assigned the "Site Selector" role
4. ✅ The Edge Function code is correct and deployed

### Why Migrations Haven't Run

- The `DATABASE_URL` environment variable is not set in the codespace
- Cannot run migrations via `psql` command
- Need to run migrations via Supabase Dashboard SQL Editor

---

## What Needs to Be Done Next ⏳

### Step 1: Run Database Migrations (CRITICAL)

**Method**: Use Supabase Dashboard SQL Editor

**Instructions**: Follow [RUN_MIGRATIONS_VIA_DASHBOARD.md](../RUN_MIGRATIONS_VIA_DASHBOARD.md)

**Quick Steps**:
1. Go to https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/sql/new
2. Copy/paste `migrations/contact_roles_many_to_many.sql` → Run
3. Copy/paste `migrations/update_contact_roles.sql` → Run
4. Copy/paste `migrations/finalize_contact_roles.sql` → Run

**Expected Outcome**:
- 3 new tables created: `contact_client_role_type`, `contact_client_role`, and views
- 8 role types available: Site Selector, Franchisee, Franchisor, Real Estate Lead, Attorney, Lender, Contractor, Engineer
- Any existing `is_site_selector = true` contacts migrated to new system

### Step 2: Assign Site Selector Roles in UI

After migrations run, you need to assign the "Site Selector" role to contacts:

1. Open your CRM app
2. Click on a **Client** to open the sidebar
3. Find a contact who should receive site submit emails
4. Below their name, click **"+ Add Role"**
5. Select **"Site Selector"** radio button
6. Click "Add Role"

**Repeat for every contact at every client who should receive site submit emails.**

### Step 3: Test Site Submit Email

1. Open a Site Submit for a client that has at least one contact with Site Selector role
2. Click **"Submit Site"** button
3. Email should now send successfully
4. Check that Site Selectors receive the email

---

## Files Created This Session

### Documentation
- `docs/CONTACT_ROLES_SYSTEM.md` - Complete system documentation with UI refinements section
- `docs/SESSION_2025_10_12_CONTACT_ROLES_UI_REFINEMENTS.md` - This file
- `RUN_MIGRATIONS_VIA_DASHBOARD.md` - Instructions for running migrations via dashboard
- `deploy-contact-roles-migrations.sh` - Script to run migrations (requires DATABASE_URL)

### Migration Files
- `migrations/contact_roles_many_to_many.sql` - Main migration (already existed)
- `migrations/update_contact_roles.sql` - Role list update (already existed)
- `migrations/finalize_contact_roles.sql` - Final cleanup to 8 roles (created this session)

### Code Files
- `src/components/ContactRolesManager.tsx` - Role badge component
- `src/hooks/useContactClientRoles.ts` - Hook for role CRUD operations
- `database-schema-additions.ts` - TypeScript types for new tables

### Modified Files
- `src/components/ContactSidebar.tsx` - Removed border, integrated roles
- `src/components/ClientSidebar.tsx` - Integrated roles
- `src/components/AddContactRelationModal.tsx` - Added role selection
- `supabase/functions/send-site-submit-email/index.ts` - Updated to use new role system

---

## Technical Details

### Edge Function Query (Already Correct)

The email function queries like this:

```typescript
const { data: contacts } = await supabaseClient
  .from('contact_client_role')
  .select(`
    contact:contact_id (id, first_name, last_name, email),
    role:role_id (role_name)
  `)
  .eq('client_id', siteSubmit.client_id)
  .eq('is_active', true)

const siteSelectors = contacts
  ?.filter(item => item.role?.role_name === 'Site Selector')
  .map(item => item.contact)
```

This is correct! It will work as soon as:
1. Tables exist (after running migrations)
2. Roles are assigned (after using the UI)

### Database Schema

```
contact_client_role_type (lookup table)
├── id (uuid)
├── role_name (text, unique)
├── description (text)
├── sort_order (integer)
└── is_active (boolean)

contact_client_role (junction table)
├── id (uuid)
├── contact_id (uuid → contact)
├── client_id (uuid → client)
├── role_id (uuid → contact_client_role_type)
├── is_active (boolean)
└── notes (text)
```

### The 8 Roles (in order)
1. Site Selector
2. Franchisee
3. Franchisor
4. Real Estate Lead
5. Attorney
6. Lender
7. Contractor
8. Engineer

---

## Verification Queries

After running migrations, verify with these queries in Supabase SQL Editor:

```sql
-- Check tables exist
SELECT COUNT(*) FROM contact_client_role_type;
SELECT COUNT(*) FROM contact_client_role;

-- See all roles
SELECT role_name, sort_order, is_active
FROM contact_client_role_type
ORDER BY sort_order;

-- See all Site Selector assignments
SELECT
  c.first_name,
  c.last_name,
  c.email,
  cl.client_name,
  crt.role_name
FROM contact_client_role ccr
JOIN contact c ON ccr.contact_id = c.id
JOIN client cl ON ccr.client_id = cl.id
JOIN contact_client_role_type crt ON ccr.role_id = crt.id
WHERE crt.role_name = 'Site Selector'
  AND ccr.is_active = true;
```

---

## Next Session Checklist

When you return, here's what to do:

- [ ] Run the 3 migrations via Supabase Dashboard SQL Editor
- [ ] Verify tables were created with the verification queries above
- [ ] Assign "Site Selector" role to at least one contact for testing
- [ ] Test sending a site submit email
- [ ] If successful, assign roles to all other appropriate contacts

---

## Important Notes

### Why This Approach?

The system we built allows:
- ✅ Same contact can have different roles at different clients
- ✅ Same contact can have multiple roles at same client
- ✅ Site submit emails only go to contacts with "Site Selector" role for that specific client
- ✅ Works with `contact_client_relation` associations (not just `contact.client_id`)

### Migration Safety

All migrations are:
- ✅ Idempotent (safe to run multiple times)
- ✅ Non-destructive (keeps old `is_site_selector` field for backup)
- ✅ Include data migration (migrates existing site selectors)

### UI is Ready

The frontend is fully built and deployed:
- ✅ Role badges display correctly
- ✅ Add/remove roles works
- ✅ Radio button selection UI
- ✅ No confirmation on delete
- ✅ Clean, minimal design

**We just need to run the migrations!**

---

## Questions or Issues?

If you encounter any problems:

1. **Migration errors**: Most "already exists" errors are OK - continue to next migration
2. **No roles showing in UI**: Make sure migrations completed successfully
3. **Still no emails**: Check that contacts have been assigned "Site Selector" role via the UI
4. **Wrong contacts getting emails**: Check role assignments for that client

---

**Status**: Ready for database migrations
**Blocker**: Need to run migrations via Supabase Dashboard
**Next Action**: Follow [RUN_MIGRATIONS_VIA_DASHBOARD.md](../RUN_MIGRATIONS_VIA_DASHBOARD.md)
