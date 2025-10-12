# Contact Roles System - Quick Implementation Guide

## TL;DR

You asked for a system where:
- Contacts can have **multiple roles** for each client they're associated with
- The same contact can have **different roles for different clients**
- Site submit emails should go to contacts with **"Site Selector" role for that specific client**
- Should work with contacts associated via `contact_client_relation`, not just `contact.client_id`

**Status**: ✅ Fully designed and ready to implement!

---

## What I Built For You

### 1. **Database Schema** ✅

**New Tables:**
- `contact_client_role_type` - Lookup table with 10 predefined roles (Site Selector, Decision Maker, etc.)
- `contact_client_role` - Junction table: contact + client + role (many-to-many-to-many)

**Views:**
- `v_contact_client_roles` - Easy-to-read view of all role assignments
- `v_site_selectors_by_client` - Quick lookup for site submit emails

**Example Data:**
```
John Doe at Starbucks:
  - Site Selector ✓
  - Decision Maker ✓

John Doe at McDonald's:
  - Decision Maker ✓
  (No Site Selector role - won't get McDonald's site submit emails!)
```

### 2. **Migration Script** ✅

File: `migrations/contact_roles_many_to_many.sql`

**What it does:**
- Creates new tables with proper indexes and RLS
- Migrates existing `is_site_selector` data to new role system
- Migrates existing text roles from `contact_client_relation.role`
- Creates helpful views for querying

**Safe to run:** Uses `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`

### 3. **Updated Email Function** ✅

File: `supabase/functions/send-site-submit-email/index.ts`

**Old logic:**
```typescript
// Only found contacts where contact.client_id = X
FROM contact WHERE client_id = X AND is_site_selector = true
```

**New logic:**
```typescript
// Finds ALL contacts with Site Selector role via contact_client_role
FROM contact_client_role
WHERE client_id = X
AND role = 'Site Selector'
AND is_active = true
```

**Result:** Now catches contacts associated through `contact_client_relation` too!

### 4. **Frontend Components** ✅

**Custom Hook:** `src/hooks/useContactClientRoles.ts`
- Manages CRUD operations for roles
- Real-time updates
- Error handling

**UI Component:** `src/components/ContactRolesManager.tsx`
- Shows role badges with color coding
- Add/remove roles
- Modal for adding new roles
- Notes field for context

**Example usage:**
```tsx
<ContactRolesManager
  contactId={contact.id}
  clientId={client.id}
  contactName="John Doe"
  clientName="Starbucks"
/>
```

### 5. **Documentation** ✅

- `docs/CONTACT_ROLES_SYSTEM.md` - Complete system documentation (migration, API, testing)
- `database-schema-additions.ts` - TypeScript types for new tables
- `IMPLEMENTATION_GUIDE_CONTACT_ROLES.md` - This file!

---

## How To Implement

### Step 1: Run Database Migration (5 minutes)

```bash
# Connect to Supabase
psql "$DATABASE_URL" -f migrations/contact_roles_many_to_many.sql
```

**Expected output:**
```
NOTICE:  Migrated X site selector contacts from contact.is_site_selector
NOTICE:  Migrated Y site selector contacts from contact_client_relation
NOTICE:  Completed migration of text roles from contact_client_relation
```

**Verify:**
```sql
-- Check role types loaded
SELECT * FROM contact_client_role_type ORDER BY sort_order;
-- Should show 10 roles

-- Check data migrated
SELECT COUNT(*) FROM contact_client_role;
-- Should show migrated roles

-- Check site selectors for a client
SELECT * FROM v_site_selectors_by_client WHERE client_id = 'your-client-uuid';
```

### Step 2: Update TypeScript Types (2 minutes)

The types are ready in `database-schema-additions.ts`. Either:

**Option A:** Add them to your `database-schema.ts` manually
**Option B:** Regenerate types from Supabase:
```bash
npx supabase gen types typescript --project-id your-project-id > database-schema.ts
```

### Step 3: Deploy Email Function (1 minute)

The updated email function is already in your repo at:
`supabase/functions/send-site-submit-email/index.ts`

Deploy it:
```bash
npx supabase functions deploy send-site-submit-email
```

### Step 4: Add UI Components (15 minutes)

#### A. Update ClientSidebar

Add role display to the "Associated Contacts" section:

```tsx
import ContactRolesManager from './ContactRolesManager'

// In the contacts map:
{associatedContacts.map(contact => (
  <div key={contact.id}>
    <div className="flex items-center justify-between">
      <span>{contact.name}</span>
      {contact.is_primary && <span className="badge">Primary</span>}
    </div>

    {/* Add this: */}
    <ContactRolesManager
      contactId={contact.id}
      clientId={clientId}
      compact={true}
    />
  </div>
))}
```

#### B. Update ContactSidebar

Add role display to the "Associated Clients" section:

```tsx
import ContactRolesManager from './ContactRolesManager'

// In the clients map:
{associatedClients.map(client => (
  <div key={client.id}>
    <div className="flex items-center justify-between">
      <span>{client.name}</span>
      {client.is_primary && <span className="badge">Primary</span>}
    </div>

    {/* Add this: */}
    <ContactRolesManager
      contactId={contactId}
      clientId={client.id}
      compact={true}
    />
  </div>
))}
```

#### C. Update AddContactRelationModal

Add role selection when creating new association:

```tsx
import { useContactClientRoles } from '../hooks/useContactClientRoles'

const { availableRoleTypes, addRole } = useContactClientRoles()

// In the form:
<div>
  <label>Roles (optional)</label>
  <select multiple>
    {availableRoleTypes.map(role => (
      <option key={role.id} value={role.id}>
        {role.role_name}
      </option>
    ))}
  </select>
</div>

// After creating association:
await createAssociation(contactId, clientId)
// Add selected roles
for (const roleId of selectedRoleIds) {
  await addRole(contactId, clientId, roleId)
}
```

### Step 5: Test (15 minutes)

#### Test 1: Add Multiple Roles
1. Open a client sidebar (e.g., "Starbucks")
2. Find a contact (e.g., "John Doe")
3. Click "+ Add Role"
4. Select "Site Selector"
5. Click "+ Add Role" again
6. Select "Decision Maker"
7. **Verify:** Both badges show up

#### Test 2: Different Roles Per Client
1. Open contact sidebar for "John Doe"
2. For "Starbucks": Add "Site Selector" role
3. For "McDonald's": Add only "Decision Maker" role
4. Create site submit for Starbucks → John gets email ✓
5. Create site submit for McDonald's → John does NOT get email ✓

#### Test 3: Site Submit Email
1. Create a site submit for a client
2. Check email sent to all contacts with "Site Selector" role for that client
3. **Verify:** Includes contacts from `contact_client_relation`, not just `contact.client_id`

---

## Key Design Decisions

### Why `contact_client_role_type` Instead of `contact_role`?

There was already a `contact_role` table in your system for a different purpose, so I named the new lookup table `contact_client_role_type` to avoid conflicts.

### Why Unique Constraint on (contact, client, role)?

Prevents accidentally assigning the same role twice. If you need to "re-assign" a role, you can toggle `is_active` instead of creating a new row.

### Why Keep `contact.is_site_selector`?

Backward compatibility! Existing code may depend on it. The migration script automatically syncs it with the new role system. You can deprecate it later.

### Why `is_active` Instead of Hard Deletes?

Audit trail! You can see historical role assignments. Also allows "temporarily disabling" a role without losing the record.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│          contact_client_role_type           │
│  (Lookup table - 10 predefined roles)      │
│  - Site Selector                            │
│  - Decision Maker                           │
│  - Influencer                               │
│  - etc.                                     │
└─────────────────┬───────────────────────────┘
                  │
                  │ role_id (FK)
                  │
┌─────────────────▼───────────────────────────┐
│          contact_client_role                │
│  (Junction table - role assignments)        │
│  - contact_id (FK → contact)                │
│  - client_id  (FK → client)                 │
│  - role_id    (FK → contact_client_role_type)│
│  - is_active                                │
│  - notes                                    │
│  UNIQUE(contact_id, client_id, role_id)     │
└─────────────────────────────────────────────┘
        │                    │
        │                    │
        ▼                    ▼
┌───────────────┐    ┌───────────────┐
│   contact     │    │    client     │
│               │    │               │
└───────────────┘    └───────────────┘
```

**Example Data Flow:**

```
1. User creates site submit for "Starbucks"
                  │
                  ▼
2. Email function queries:
   contact_client_role
   WHERE client_id = 'Starbucks'
   AND role.role_name = 'Site Selector'
   AND is_active = true
                  │
                  ▼
3. Returns: John Doe, Jane Smith
                  │
                  ▼
4. Sends email to John & Jane
```

---

## Common Scenarios

### Scenario 1: Contact Works at Multiple Clients

**Setup:**
- John Doe is associated with Starbucks, McDonald's, and Wendy's
- He's a Site Selector for Starbucks only
- He's a Decision Maker for all three

**Database:**
```
contact_client_role:
  - John + Starbucks + Site Selector
  - John + Starbucks + Decision Maker
  - John + McDonald's + Decision Maker
  - John + Wendy's + Decision Maker
```

**Result:**
- Starbucks site submit → John gets email ✓
- McDonald's site submit → John does NOT get email ✓
- Wendy's site submit → John does NOT get email ✓

### Scenario 2: Multiple People Are Site Selectors

**Setup:**
- Starbucks has John, Jane, and Bob as contacts
- John: Site Selector + Decision Maker
- Jane: Site Selector
- Bob: Influencer (no Site Selector role)

**Database:**
```
contact_client_role:
  - John + Starbucks + Site Selector
  - John + Starbucks + Decision Maker
  - Jane + Starbucks + Site Selector
  - Bob + Starbucks + Influencer
```

**Result:**
- Starbucks site submit → John AND Jane get email ✓
- Bob does NOT get email ✓

### Scenario 3: Associated Through contact_client_relation

**Setup:**
- Sarah is NOT on any `contact.client_id` field
- Sarah is associated with Starbucks via `contact_client_relation`
- Sarah has Site Selector role for Starbucks

**Database:**
```
contact:
  - Sarah (client_id = NULL)

contact_client_relation:
  - Sarah + Starbucks

contact_client_role:
  - Sarah + Starbucks + Site Selector
```

**Result:**
- Starbucks site submit → Sarah gets email ✓
- OLD system would have missed Sarah ✗
- NEW system catches her ✓

---

## Rollback Plan

If something goes wrong:

### Quick Rollback (Keep New System, Fall Back to Old Query)

Edit `supabase/functions/send-site-submit-email/index.ts`:

```typescript
// Revert to old query temporarily
const { data: contacts } = await supabaseClient
  .from('contact')
  .select('id, first_name, last_name, email')
  .eq('client_id', siteSubmit.client_id)
  .eq('is_site_selector', true)
  .not('email', 'is', null)
```

Deploy:
```bash
npx supabase functions deploy send-site-submit-email
```

### Full Rollback (Remove New Tables)

```sql
DROP VIEW IF EXISTS v_site_selectors_by_client;
DROP VIEW IF EXISTS v_contact_client_roles;
DROP TABLE IF EXISTS contact_client_role CASCADE;
DROP TABLE IF EXISTS contact_client_role_type CASCADE;
```

**Note:** This loses all role assignment data! Only do this if you haven't gone live yet.

---

## Next Steps After Implementation

### Week 1: Basic Rollout
- ✅ Run migration
- ✅ Deploy email function
- ✅ Add role badges to sidebars
- ✅ Train 1-2 users

### Week 2: Full Rollout
- Add role selection to contact creation flow
- Bulk update existing contacts with roles
- User training for all staff

### Week 3: Advanced Features
- Role-based reporting ("Show me all Decision Makers")
- Role filters on contact lists
- Bulk role management page

### Week 4: Optimization
- Remove `is_site_selector` field (optional)
- Remove `contact_client_relation.role` text field (optional)
- Performance monitoring
- User feedback

---

## FAQ

**Q: Will this break existing site submit emails?**
A: No! The migration automatically converts existing `is_site_selector` data to the new role system.

**Q: Can I still use the old `contact.is_site_selector` field?**
A: Yes, but it won't work for contacts associated through `contact_client_relation`. The new system is more comprehensive.

**Q: What if I want to add a custom role?**
A: Easy! Just insert into `contact_client_role_type`:
```sql
INSERT INTO contact_client_role_type (role_name, description, sort_order)
VALUES ('Custom Role', 'My custom role description', 100);
```

**Q: Can I assign roles when I first associate a contact with a client?**
A: Yes! Update `AddContactRelationModal` to include role selection (see Step 4C above).

**Q: What about Salesforce sync?**
A: The migration preserves Salesforce role data. For bidirectional sync, you'd need to update your Airbyte/sync process (future enhancement).

---

## Support

If you run into issues:

1. **Check migration output** - Look for NOTICE messages
2. **Verify RLS policies** - Make sure temp policies are active
3. **Check browser console** - Look for TypeScript/API errors
4. **Test queries in SQL editor** - Use verification queries from docs
5. **Review edge function logs** - Check Supabase logs for email function errors

---

## Summary

This system gives you exactly what you asked for:

✅ **Multiple roles per contact-client relationship**
✅ **Different roles for different clients**
✅ **Site submit emails based on roles**
✅ **Works with associated contacts (contact_client_relation)**
✅ **Backward compatible with existing data**
✅ **Type-safe TypeScript implementation**
✅ **Ready-to-use UI components**

**Total implementation time:** ~40 minutes

**Files to deploy:**
1. `migrations/contact_roles_many_to_many.sql` (run once)
2. `supabase/functions/send-site-submit-email/index.ts` (deploy)
3. `src/hooks/useContactClientRoles.ts` (already in repo)
4. `src/components/ContactRolesManager.tsx` (already in repo)
5. Update `ClientSidebar.tsx` and `ContactSidebar.tsx` (small changes)

**Ready to go!** 🚀
