# Contact Roles System - Complete Implementation

**Date**: 2025-10-12
**Last Updated**: 2025-10-12 (UI Refinements)
**Status**: Production Ready

---

## Overview

This system redesigns how contact roles work in OVIS, enabling **multiple roles per contact-client relationship**. A contact can now have different roles for different clients, and multiple roles for the same client.

### Key Capabilities

✅ **Multiple roles per contact-client** - A contact can be both "Site Selector" and "Decision Maker" for the same client
✅ **Different roles per client** - John can be a "Site Selector" at Starbucks but only a "Decision Maker" at McDonald's
✅ **Flexible email routing** - Site submit emails automatically go to contacts with "Site Selector" role for that specific client
✅ **Associated contacts support** - Finds site selectors through `contact_client_relation` table, not just `contact.client_id`
✅ **Backward compatible** - Existing `is_site_selector` field migrated to new system

---

## Architecture

### Database Tables

#### 1. `contact_client_role_type` (Lookup Table)
Defines available role types.

```sql
CREATE TABLE contact_client_role_type (
  id UUID PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Predefined Roles (Final List):**
1. Site Selector - Receives site submit notifications
2. Franchisee - Franchise owner or operator
3. Franchisor - Franchise company representative
4. Real Estate Lead - Primary real estate contact
5. Attorney - Legal counsel and contract review
6. Lender - Financing and lending contact
7. Contractor - Construction and build-out contractor
8. Engineer - Engineering and technical contact

#### 2. `contact_client_role` (Junction Table)
Links contacts to clients with specific roles.

```sql
CREATE TABLE contact_client_role (
  id UUID PRIMARY KEY,
  contact_id UUID REFERENCES contact(id),
  client_id UUID REFERENCES client(id),
  role_id UUID REFERENCES contact_client_role_type(id),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ,
  created_by_id UUID,
  updated_at TIMESTAMPTZ,
  updated_by_id UUID,
  UNIQUE (contact_id, client_id, role_id)
);
```

**Key Points:**
- One row = one role assignment
- Unique constraint prevents duplicate role assignments
- `is_active` allows soft-deleting roles without removing history
- `notes` field for context about why this role was assigned

#### 3. Views for Easy Querying

**`v_contact_client_roles`**: Human-readable view of all relationships
```sql
SELECT * FROM v_contact_client_roles
WHERE client_id = 'starbucks-uuid';
```

**`v_site_selectors_by_client`**: Quick lookup for site selectors
```sql
SELECT * FROM v_site_selectors_by_client
WHERE client_id = 'starbucks-uuid';
```

---

## Data Migration

The migration script automatically migrates existing data:

### What Gets Migrated

1. **Contacts with `is_site_selector = true` and `client_id` set**
   - Creates role assignment for that client

2. **Contacts with `is_site_selector = true` in `contact_client_relation`**
   - Creates role assignments for all associated clients

3. **Existing text roles in `contact_client_relation.role`**
   - Maps text like "Decision Maker" to proper role types
   - Unmapped roles go to "Other" category

### Running the Migration

```bash
# Connect to your Supabase project
psql "$DATABASE_URL" -f migrations/contact_roles_many_to_many.sql
```

**Expected Output:**
```
NOTICE:  Migrated X site selector contacts from contact.is_site_selector
NOTICE:  Migrated Y site selector contacts from contact_client_relation
NOTICE:  Completed migration of text roles from contact_client_relation
```

---

## Site Submit Email Logic

### Old Logic (Before)
```typescript
// Only found contacts where contact.client_id = X and is_site_selector = true
const { data } = await supabase
  .from('contact')
  .select('*')
  .eq('client_id', clientId)
  .eq('is_site_selector', true)
```

**Problem**: Missed contacts associated through `contact_client_relation`

### New Logic (After)
```typescript
// Finds ALL contacts with Site Selector role for this client
const { data } = await supabase
  .from('contact_client_role')
  .select(`
    contact:contact_id (id, first_name, last_name, email),
    role:role_id (role_name)
  `)
  .eq('client_id', clientId)
  .eq('is_active', true)

// Filter for Site Selector role
const siteSelectors = data
  ?.filter(item => item.role?.role_name === 'Site Selector')
  .map(item => item.contact)
```

**Benefits:**
- ✅ Finds contacts associated through `contact_client_relation`
- ✅ Respects per-client role assignments
- ✅ Only emails contacts with explicit Site Selector role for THIS client
- ✅ Handles contacts associated with multiple clients correctly

---

## Frontend Components

### 1. Custom Hook: `useContactClientRoles`

**Location**: `src/hooks/useContactClientRoles.ts`

```typescript
const {
  roles,                  // Current role assignments
  availableRoleTypes,     // All role types
  loading,
  error,
  addRole,               // (contactId, clientId, roleId, notes?)
  removeRole,            // (roleAssignmentId)
  toggleRoleActive,      // (roleAssignmentId, isActive)
  updateRoleNotes,       // (roleAssignmentId, notes)
  refreshRoles,
} = useContactClientRoles(contactId, clientId)
```

**Features:**
- Loads all roles for a contact-client pair
- CRUD operations for role assignments
- Real-time updates

### 2. Component: `ContactRolesManager`

**Location**: `src/components/ContactRolesManager.tsx`

```tsx
<ContactRolesManager
  contactId={contact.id}
  clientId={client.id}
  contactName={contact.name}
  clientName={client.name}
  showAddButton={true}
  compact={false}
/>
```

**Features:**
- Displays role badges with color coding
- Add/remove roles with modal
- Shows role counts
- Optional notes per role

### 3. Integration Points

Update these components to show roles:

**`src/components/AddContactRelationModal.tsx`**
- Add role selection when associating contact to client
- Allow selecting multiple roles at once

**`src/components/ClientSidebar.tsx`**
- Show roles for each associated contact
- Use `ContactRolesManager` component

**`src/components/ContactSidebar.tsx`**
- Show roles for each associated client
- Use `ContactRolesManager` component

---

## UI Updates Needed

### 1. Update Associated Contacts Section (ClientSidebar)

**Current:**
```
Associated Contacts:
- John Doe [Primary]
  Role: Decision Maker
```

**New Design:**
```
Associated Contacts:
- John Doe [Primary]
  [Site Selector] [Decision Maker] [+ Add Role]
```

### 2. Update Associated Clients Section (ContactSidebar)

**Current:**
```
Associated Clients:
- Starbucks [Primary]
  Role: Site Selector
```

**New Design:**
```
Associated Clients:
- Starbucks [Primary]
  [Site Selector] [Real Estate Lead] [+ Add Role]
```

### 3. Add Bulk Role Management

Create a new page/modal for bulk role management:
- See all contacts with a specific role
- Bulk add/remove roles
- Export contacts by role for reporting

---

## Testing Checklist

### Database Testing

```sql
-- 1. Verify migration ran successfully
SELECT COUNT(*) FROM contact_client_role;
-- Should show migrated roles

-- 2. Check role types are loaded
SELECT * FROM contact_client_role_type ORDER BY sort_order;
-- Should show 10 predefined roles

-- 3. Find all site selectors for a client
SELECT * FROM v_site_selectors_by_client WHERE client_id = 'test-client-uuid';

-- 4. Test adding a role
INSERT INTO contact_client_role (contact_id, client_id, role_id)
VALUES (
  'contact-uuid',
  'client-uuid',
  (SELECT id FROM contact_client_role_type WHERE role_name = 'Site Selector')
);

-- 5. Test duplicate prevention (should fail)
INSERT INTO contact_client_role (contact_id, client_id, role_id)
VALUES (
  'contact-uuid',
  'client-uuid',
  (SELECT id FROM contact_client_role_type WHERE role_name = 'Site Selector')
);
-- Expected: ERROR: duplicate key value violates unique constraint
```

### Frontend Testing

#### Test Scenario 1: Multiple Roles for One Client
1. Open client sidebar for "Starbucks"
2. Find contact "John Doe"
3. Click "Add Role"
4. Add "Site Selector" role
5. Click "Add Role" again
6. Add "Decision Maker" role
7. **Verify**: Both badges show up
8. **Verify**: Can remove individual roles

#### Test Scenario 2: Different Roles for Different Clients
1. Open contact sidebar for "John Doe"
2. **Verify**: Shows associated clients with their specific roles
3. For "Starbucks", add "Site Selector" role
4. For "McDonald's", add "Decision Maker" role (NOT Site Selector)
5. Create site submit for Starbucks
6. **Verify**: John Doe gets email
7. Create site submit for McDonald's
8. **Verify**: John Doe does NOT get email (no Site Selector role)

#### Test Scenario 3: Associated Contacts Get Emails
1. Create contact "Jane Smith" (NOT on any client.client_id)
2. Associate Jane with "Starbucks" via `contact_client_relation`
3. Add "Site Selector" role to Jane at Starbucks
4. Create site submit for Starbucks
5. **Verify**: Jane gets email even though she's not on client.client_id

### Email Function Testing

```typescript
// Test sending email with new role system
const response = await fetch('http://localhost:54321/functions/v1/send-site-submit-email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    siteSubmitId: 'test-site-submit-uuid'
  })
})

// Check response
const result = await response.json()
console.log('Emails sent to:', result.recipients)
// Should include all Site Selectors for that client
```

---

## Migration Path

### Phase 1: Database Migration (Week 1)
- ✅ Run migration script
- ✅ Verify data migration
- ✅ Test queries
- ✅ Update TypeScript types

### Phase 2: Backend Updates (Week 1)
- ✅ Update email function to use new query
- ✅ Test email sending
- ✅ Deploy edge function

### Phase 3: Frontend - Basic (Week 2)
- ⏳ Add `ContactRolesManager` to sidebars
- ⏳ Update `AddContactRelationModal` to include role selection
- ⏳ Test CRUD operations

### Phase 4: Frontend - Advanced (Week 3)
- ⏳ Create bulk role management page
- ⏳ Add role filters to contact/client lists
- ⏳ Add reporting by role

### Phase 5: Cleanup (Week 4)
- ⏳ Deprecate `contact.is_site_selector` field (keep for backward compat)
- ⏳ Deprecate `contact_client_relation.role` text field
- ⏳ Update documentation
- ⏳ User training

---

## API Examples

### Get All Roles for a Contact at a Client

```typescript
const { data } = await supabase
  .from('contact_client_role')
  .select(`
    *,
    role:role_id (
      role_name,
      description
    )
  `)
  .eq('contact_id', contactId)
  .eq('client_id', clientId)
  .eq('is_active', true)
```

### Add a Role

```typescript
const { data, error } = await supabase
  .from('contact_client_role')
  .insert({
    contact_id: 'contact-uuid',
    client_id: 'client-uuid',
    role_id: 'role-uuid',  // Get from contact_client_role_type
    notes: 'Primary decision maker for real estate'
  })
```

### Get All Site Selectors for Multiple Clients

```typescript
const { data } = await supabase
  .from('v_site_selectors_by_client')
  .select('*')
  .in('client_id', ['client1-uuid', 'client2-uuid'])
```

### Check if Contact Has Specific Role

```typescript
const { data } = await supabase
  .from('contact_client_role')
  .select('id')
  .eq('contact_id', contactId)
  .eq('client_id', clientId)
  .eq('role_id', (
    await supabase
      .from('contact_client_role_type')
      .select('id')
      .eq('role_name', 'Site Selector')
      .single()
  ).data.id)
  .eq('is_active', true)
  .maybeSingle()

const hasSiteSelectorRole = !!data
```

---

## Troubleshooting

### Issue: "No Site Selector contacts found"

**Check:**
1. Are there contacts associated with this client?
   ```sql
   SELECT * FROM contact_client_relation WHERE client_id = 'uuid';
   ```

2. Do any have the Site Selector role?
   ```sql
   SELECT * FROM v_site_selectors_by_client WHERE client_id = 'uuid';
   ```

3. Do they have email addresses?
   ```sql
   SELECT c.* FROM contact c
   INNER JOIN contact_client_role ccr ON ccr.contact_id = c.id
   WHERE ccr.client_id = 'uuid' AND c.email IS NULL;
   ```

### Issue: Duplicate role error

**Cause**: Trying to assign the same role twice

**Solution**: Check existing roles first:
```typescript
const existingRoles = await supabase
  .from('contact_client_role')
  .select('role_id')
  .eq('contact_id', contactId)
  .eq('client_id', clientId)
  .eq('is_active', true)
```

### Issue: Role badges not showing

**Check:**
1. RLS policies are enabled on new tables
2. TypeScript types are up to date
3. Component is receiving correct props
4. Check browser console for errors

---

## Performance Considerations

### Indexes

The migration creates these indexes for performance:
```sql
CREATE INDEX idx_contact_client_role_contact ON contact_client_role(contact_id);
CREATE INDEX idx_contact_client_role_client ON contact_client_role(client_id);
CREATE INDEX idx_contact_client_role_role ON contact_client_role(role_id);
CREATE INDEX idx_contact_client_role_client_role
  ON contact_client_role(client_id, role_id)
  WHERE is_active = true;
```

### Query Optimization

**Good** ✅ (Uses index):
```sql
SELECT * FROM contact_client_role
WHERE client_id = 'uuid' AND role_id = 'uuid' AND is_active = true;
```

**Avoid** ❌ (No index):
```sql
SELECT * FROM contact_client_role
WHERE notes LIKE '%decision%';
```

---

## Future Enhancements

### 1. Role Hierarchy
Allow defining role hierarchy (e.g., Executive Sponsor > Decision Maker)

### 2. Role Permissions
Tie roles to actual CRM permissions (e.g., Site Selectors can approve sites)

### 3. Time-Based Roles
Add start/end dates for temporary role assignments

### 4. Role Templates
Create role templates for common scenarios (e.g., "C-Suite Package" = Executive Sponsor + Decision Maker + Financial Contact)

### 5. Salesforce Sync
Sync role assignments back to Salesforce `AccountContactRelation`

---

## Files Reference

### Database
- `migrations/contact_roles_many_to_many.sql` - Main migration script
- `database-schema-additions.ts` - TypeScript types for new tables

### Backend
- `supabase/functions/send-site-submit-email/index.ts` - Updated email function

### Frontend
- `src/hooks/useContactClientRoles.ts` - Main hook for role management
- `src/components/ContactRolesManager.tsx` - Role badge display and management
- `src/components/ClientSidebar.tsx` - Client detail sidebar (needs update)
- `src/components/ContactSidebar.tsx` - Contact detail sidebar (needs update)
- `src/components/AddContactRelationModal.tsx` - Associate contact modal (needs update)

### Documentation
- `docs/CONTACT_ROLES_SYSTEM.md` - This file
- `docs/CONTACT_CLIENT_MANY_TO_MANY_COMPLETE.md` - Related many-to-many system

---

## Support

### Questions?

**Database issues**: Check migration output, verify RLS policies
**Frontend issues**: Check browser console, verify component props
**Email issues**: Check Supabase edge function logs

### Common Questions

**Q: Can a contact have multiple roles for the same client?**
A: Yes! That's the whole point. They can be both Site Selector AND Decision Maker.

**Q: Can the same person have different roles at different clients?**
A: Yes! John can be Site Selector at Starbucks but only Influencer at McDonald's.

**Q: What happens to the old `is_site_selector` field?**
A: It's migrated to the new system but kept for backward compatibility. Eventually we can deprecate it.

**Q: Do emails still work?**
A: Yes, but better! The email function now finds Site Selectors through the new role system, catching more contacts.

---

## Recent Updates (2025-10-12 - UI Refinements Session)

### Changes Made

#### 1. UI Improvements
- ✅ Removed border line separator between client names and role badges in ContactSidebar
- ✅ Removed "Select Role *" label from add role modal for cleaner UI
- ✅ Removed confirmation dialog when deleting roles - now deletes immediately on X click
- ✅ Changed from browser dropdown to custom radio button UI for role selection

#### 2. Database Finalization
- ✅ Created `migrations/finalize_contact_roles.sql` to enforce exact 8 roles
- ✅ Deactivated all legacy roles (Decision Maker, Influencer, etc.)
- ✅ Ensured correct sort order: Site Selector, Franchisee, Franchisor, Real Estate Lead, Attorney, Lender, Contractor, Engineer

#### 3. Files Modified
- `src/components/ContactRolesManager.tsx` - Removed confirmation dialog, removed label from modal
- `src/components/ContactSidebar.tsx` - Removed border-b class from ClientItem wrapper and ClientItem itself
- `migrations/finalize_contact_roles.sql` - New migration to ensure only 8 specified roles exist

#### 4. User Experience Improvements
- **Instant deletion**: Click X to remove role without confirmation
- **Cleaner modal**: Radio buttons go directly under context text, no extra labels
- **No visual separation**: Seamless flow from client name to role badges
- **Consistent ordering**: All 8 roles always appear in the same order

### Migration Instructions

Run the finalization migration to ensure only the 8 specified roles exist:

```bash
psql "$DATABASE_URL" -f migrations/finalize_contact_roles.sql
```

This will:
1. Deactivate all existing roles
2. Ensure only the 8 specified roles exist and are active
3. Set correct sort order

---

**Last Updated**: 2025-10-12 (UI Refinements Complete)
**Version**: 1.1
**Status**: ✅ Production Ready
