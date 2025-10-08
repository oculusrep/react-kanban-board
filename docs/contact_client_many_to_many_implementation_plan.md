# Contact-Client Many-to-Many Relationship Implementation Plan

## Date: 2025-10-07

## Overview
Implement a many-to-many relationship between contacts and clients, allowing a single contact to be associated with multiple clients. This will replace the current one-to-many relationship (single `client_id` on contact table).

---

## Current State

### Database Schema
- **contact table**: Has a single `client_id` field (one-to-many relationship)
- **salesforce_AccountContactRelation table**: Contains Salesforce multi-client relationships with fields:
  - `AccountId` (Salesforce Account/Client ID)
  - `ContactId` (Salesforce Contact ID)
  - `Roles` (contact's role at that account)
  - `IsActive`, `IsDirect`, `IsDeleted`
  - Relationship metadata (start/end dates, strength, etc.)

### Current Limitation
- Each contact can only be associated with ONE client in OVIS
- Salesforce has many contacts associated with multiple accounts, but OVIS doesn't reflect this

---

## Proposed Solution: Hybrid Approach

Create a new native OVIS junction table (`contact_client_relation`) that:
1. Initially migrates all existing Salesforce multi-client relationships
2. Allows creating new relationships in OVIS (even for non-Salesforce records)
3. Can be periodically synced from Salesforce to capture new SF relationships

---

## Implementation Steps

### Phase 1: Database Schema Changes

#### Step 1.1: Create Junction Table
Create a new `contact_client_relation` table:

```sql
-- New junction table for many-to-many relationship
CREATE TABLE contact_client_relation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,

  -- Relationship metadata
  role TEXT,  -- Contact's role at this client (e.g., "Decision Maker", "Influencer")
  is_primary BOOLEAN DEFAULT false,  -- Is this the primary client association?
  is_active BOOLEAN DEFAULT true,  -- Is this relationship currently active?

  -- Salesforce sync fields (optional - for tracking source)
  sf_relation_id TEXT,  -- Maps to salesforce_AccountContactRelation.Id
  synced_from_salesforce BOOLEAN DEFAULT false,

  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES "user"(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES "user"(id),

  -- Ensure unique contact-client pairs
  UNIQUE(contact_id, client_id)
);

-- Indexes for performance
CREATE INDEX idx_contact_client_relation_contact_id ON contact_client_relation(contact_id);
CREATE INDEX idx_contact_client_relation_client_id ON contact_client_relation(client_id);
CREATE INDEX idx_contact_client_relation_is_primary ON contact_client_relation(is_primary) WHERE is_primary = true;
CREATE INDEX idx_contact_client_relation_sf_relation_id ON contact_client_relation(sf_relation_id) WHERE sf_relation_id IS NOT NULL;

-- Updated at trigger
CREATE TRIGGER update_contact_client_relation_updated_at
  BEFORE UPDATE ON contact_client_relation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

#### Step 1.2: Migrate Existing Salesforce Relationships
Add to master migration script:

```sql
-- Migrate existing Salesforce AccountContactRelation data
INSERT INTO contact_client_relation (
  contact_id,
  client_id,
  role,
  is_active,
  sf_relation_id,
  synced_from_salesforce,
  created_at
)
SELECT DISTINCT
  c.id AS contact_id,
  cl.id AS client_id,
  acr."Roles" AS role,
  COALESCE(acr."IsActive", true) AS is_active,
  acr."Id" AS sf_relation_id,
  true AS synced_from_salesforce,
  COALESCE(acr."CreatedDate"::timestamp, NOW()) AS created_at
FROM salesforce_AccountContactRelation acr
INNER JOIN contact c ON c.sf_id = acr."ContactId"
INNER JOIN client cl ON cl.sf_id = acr."AccountId"
WHERE
  acr."IsDeleted" = false
  AND acr."IsActive" = true
ON CONFLICT (contact_id, client_id) DO NOTHING;

-- Set one relationship as primary for each contact (prefer IsDirect = true)
WITH ranked_relations AS (
  SELECT
    ccr.id,
    ROW_NUMBER() OVER (
      PARTITION BY ccr.contact_id
      ORDER BY
        CASE WHEN acr."IsDirect" = true THEN 0 ELSE 1 END,
        acr."CreatedDate" ASC
    ) as rn
  FROM contact_client_relation ccr
  LEFT JOIN salesforce_AccountContactRelation acr ON ccr.sf_relation_id = acr."Id"
  WHERE ccr.synced_from_salesforce = true
)
UPDATE contact_client_relation
SET is_primary = true
WHERE id IN (SELECT id FROM ranked_relations WHERE rn = 1);
```

#### Step 1.3: Migrate Existing OVIS-Only Contact-Client Links
Handle contacts that have `client_id` set but no Salesforce relationship:

```sql
-- Migrate existing contact.client_id to junction table
-- (for contacts created in OVIS or without SF relationships)
INSERT INTO contact_client_relation (
  contact_id,
  client_id,
  is_primary,
  is_active,
  synced_from_salesforce,
  created_at
)
SELECT
  c.id AS contact_id,
  c.client_id,
  true AS is_primary,  -- Existing single relationship becomes primary
  true AS is_active,
  false AS synced_from_salesforce,
  c.created_at
FROM contact c
WHERE
  c.client_id IS NOT NULL
  AND NOT EXISTS (
    -- Don't duplicate if already migrated from Salesforce
    SELECT 1 FROM contact_client_relation ccr
    WHERE ccr.contact_id = c.id AND ccr.client_id = c.client_id
  )
ON CONFLICT (contact_id, client_id) DO NOTHING;
```

#### Step 1.4: (Optional) Deprecate contact.client_id
Two options:

**Option A: Keep for backward compatibility (RECOMMENDED initially)**
- Leave `contact.client_id` in place
- Update it to always point to the "primary" client from junction table
- Add trigger to keep it in sync

```sql
-- Function to keep contact.client_id in sync with primary relation
CREATE OR REPLACE FUNCTION sync_contact_primary_client()
RETURNS TRIGGER AS $$
BEGIN
  -- Update contact.client_id when primary relationship changes
  IF NEW.is_primary = true THEN
    UPDATE contact
    SET client_id = NEW.client_id
    WHERE id = NEW.contact_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_contact_primary_client_trigger
  AFTER INSERT OR UPDATE OF is_primary ON contact_client_relation
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION sync_contact_primary_client();
```

**Option B: Remove entirely (future cleanup)**
```sql
-- After confirming all code uses junction table:
ALTER TABLE contact DROP COLUMN client_id;
```

---

### Phase 2: TypeScript Types & Interfaces

#### Step 2.1: Update Database Schema Types
Regenerate TypeScript types from Supabase:
```bash
npm run generate-types
```

Or manually add to `database-schema.ts`:
```typescript
contact_client_relation: {
  Row: {
    id: string
    contact_id: string
    client_id: string
    role: string | null
    is_primary: boolean
    is_active: boolean
    sf_relation_id: string | null
    synced_from_salesforce: boolean
    created_at: string
    created_by_id: string | null
    updated_at: string
    updated_at_id: string | null
  }
  Insert: {
    id?: string
    contact_id: string
    client_id: string
    role?: string | null
    is_primary?: boolean
    is_active?: boolean
    sf_relation_id?: string | null
    synced_from_salesforce?: boolean
    created_at?: string
    created_by_id?: string | null
    updated_at?: string
    updated_by_id?: string | null
  }
  Update: {
    id?: string
    contact_id?: string
    client_id?: string
    role?: string | null
    is_primary?: boolean
    is_active?: boolean
    sf_relation_id?: string | null
    synced_from_salesforce?: boolean
    created_at?: string
    created_by_id?: string | null
    updated_at?: string
    updated_by_id?: string | null
  }
}
```

#### Step 2.2: Create Custom Types
Add to `src/lib/types.ts`:

```typescript
export interface ContactClientRelation {
  id: string;
  contact_id: string;
  client_id: string;
  role: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactWithClients extends Contact {
  clients?: Array<{
    client: Client;
    relation: ContactClientRelation;
  }>;
  primary_client?: Client;
}

export interface ClientWithContacts extends Client {
  contacts?: Array<{
    contact: Contact;
    relation: ContactClientRelation;
  }>;
}
```

---

### Phase 3: Custom Hooks for Contact-Client Relations

#### Step 3.1: Create `useContactClients` Hook
Create `src/hooks/useContactClients.ts`:

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ContactClientRelation } from '../lib/types';

export const useContactClients = (contactId: string) => {
  const [relations, setRelations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRelations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contact_client_relation')
        .select(`
          *,
          client:client_id (
            id,
            client_name,
            sf_client_type,
            phone,
            email,
            website
          )
        `)
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      setRelations(data || []);
    } catch (err) {
      console.error('Error fetching contact clients:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contactId) {
      fetchRelations();
    }
  }, [contactId]);

  const addClientRelation = async (
    clientId: string,
    role?: string,
    isPrimary?: boolean
  ) => {
    try {
      // If setting as primary, unset other primary relations
      if (isPrimary) {
        await supabase
          .from('contact_client_relation')
          .update({ is_primary: false })
          .eq('contact_id', contactId);
      }

      const { data, error } = await supabase
        .from('contact_client_relation')
        .insert({
          contact_id: contactId,
          client_id: clientId,
          role: role || null,
          is_primary: isPrimary || false,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      await fetchRelations();
      return data;
    } catch (err) {
      console.error('Error adding client relation:', err);
      throw err;
    }
  };

  const removeClientRelation = async (relationId: string) => {
    try {
      const { error } = await supabase
        .from('contact_client_relation')
        .delete()
        .eq('id', relationId);

      if (error) throw error;
      await fetchRelations();
    } catch (err) {
      console.error('Error removing client relation:', err);
      throw err;
    }
  };

  const setPrimaryClient = async (relationId: string) => {
    try {
      // Unset all primary flags for this contact
      await supabase
        .from('contact_client_relation')
        .update({ is_primary: false })
        .eq('contact_id', contactId);

      // Set new primary
      const { error } = await supabase
        .from('contact_client_relation')
        .update({ is_primary: true })
        .eq('id', relationId);

      if (error) throw error;
      await fetchRelations();
    } catch (err) {
      console.error('Error setting primary client:', err);
      throw err;
    }
  };

  const updateRelationRole = async (relationId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('contact_client_relation')
        .update({ role })
        .eq('id', relationId);

      if (error) throw error;
      await fetchRelations();
    } catch (err) {
      console.error('Error updating relation role:', err);
      throw err;
    }
  };

  return {
    relations,
    loading,
    error,
    refreshRelations: fetchRelations,
    addClientRelation,
    removeClientRelation,
    setPrimaryClient,
    updateRelationRole
  };
};
```

#### Step 3.2: Create `useClientContacts` Hook
Similar hook for viewing contacts associated with a client (create `src/hooks/useClientContacts.ts`).

---

### Phase 4: UI Component Updates

#### Step 4.1: Update Contact Sidebar - Associated Clients Section
Update `src/components/ContactSidebar.tsx`:

**Current:**
- Shows single client association

**New:**
- Show list of associated clients
- Indicate which is primary
- Allow adding new client associations
- Allow removing associations
- Allow changing primary client

```typescript
// In ContactSidebar.tsx - Add new module
import { useContactClients } from '../hooks/useContactClients';

const { relations, addClientRelation, removeClientRelation, setPrimaryClient } = useContactClients(contactId);

// Render associated clients
<SidebarModule
  title="Associated Clients"
  count={relations.length}
  isExpanded={expandedSidebarModules.clients}
  onToggle={() => toggleSidebarModule('clients')}
  icon={
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  }
  showAddButton={true}
  onAddNew={() => setShowAddClientModal(true)}
>
  {relations.map(relation => (
    <ClientRelationItem
      key={relation.id}
      relation={relation}
      onRemove={() => removeClientRelation(relation.id)}
      onSetPrimary={() => setPrimaryClient(relation.id)}
      onUpdateRole={(role) => updateRelationRole(relation.id, role)}
    />
  ))}
</SidebarModule>
```

#### Step 4.2: Create Client Association Modal
New component: `src/components/modals/AddClientRelationModal.tsx`

Features:
- Search/select client
- Specify role (dropdown or text input)
- Set as primary checkbox
- Save button

#### Step 4.3: Update Client Sidebar - Associated Contacts Section
Similar updates to show multi-contact associations on client sidebar.

#### Step 4.4: Update Contact Overview Tab
If contact overview shows client info, update to show all associated clients with primary highlighted.

---

### Phase 5: Query Updates

#### Step 5.1: Update Existing Contact Queries
Find and update all queries that join contacts with clients:

**Before:**
```typescript
const { data } = await supabase
  .from('contact')
  .select('*, client:client_id(*)')
  .eq('id', contactId);
```

**After:**
```typescript
const { data } = await supabase
  .from('contact')
  .select(`
    *,
    client_relations:contact_client_relation(
      *,
      client:client_id(*)
    )
  `)
  .eq('id', contactId);

// Get primary client
const primaryRelation = data?.client_relations?.find(r => r.is_primary);
const primaryClient = primaryRelation?.client;
```

#### Step 5.2: Update Contact Search/List Views
Update components that display contact lists to show primary client:

Files to update:
- `src/components/ContactList.tsx`
- `src/pages/ContactsPage.tsx`
- Any contact tables/grids

---

### Phase 6: Salesforce Sync Updates

#### Step 6.1: Update Airbyte Sync (Optional)
If using Airbyte to sync from Salesforce, configure it to also sync `AccountContactRelation` table updates.

#### Step 6.2: Create Periodic Sync Function
Create `src/services/syncContactClientRelations.ts`:

```typescript
export async function syncContactClientRelationsFromSalesforce() {
  // Query new/updated AccountContactRelations from Salesforce table
  // Insert/update corresponding records in contact_client_relation table
  // Mark as synced_from_salesforce = true
}
```

Run this periodically (e.g., nightly) or trigger on Salesforce webhook.

---

### Phase 7: Testing Plan

#### Step 7.1: Database Testing
- [ ] Verify junction table created successfully
- [ ] Verify Salesforce relationships migrated correctly
- [ ] Verify existing OVIS contact.client_id relationships migrated
- [ ] Verify unique constraint prevents duplicate relations
- [ ] Verify cascade deletes work properly
- [ ] Verify triggers maintain contact.client_id sync

#### Step 7.2: UI Testing
- [ ] Can add multiple clients to a contact
- [ ] Can remove client associations
- [ ] Can set/change primary client
- [ ] Can update relationship role
- [ ] Primary client displays correctly throughout UI
- [ ] Contact lists show correct primary client
- [ ] Client sidebars show all associated contacts

#### Step 7.3: Edge Cases
- [ ] Contact with no client associations
- [ ] Contact with 1 client (should be marked primary)
- [ ] Contact with 5+ clients
- [ ] Deleting a client removes all its contact relations
- [ ] Deleting a contact removes all its client relations
- [ ] Making relation primary updates contact.client_id correctly

---

### Phase 8: Migration Rollout

#### Step 8.1: Pre-Migration
1. Back up database
2. Test migration script on staging environment
3. Document rollback plan

#### Step 8.2: Migration
1. Run migration during low-traffic period
2. Verify data integrity after migration
3. Check error logs

#### Step 8.3: Post-Migration
1. Monitor for issues
2. Verify all contact-client associations working
3. Update documentation

---

## Files to Create/Modify

### New Files to Create
- [ ] `migrations/XXX_create_contact_client_relation_table.sql`
- [ ] `src/hooks/useContactClients.ts`
- [ ] `src/hooks/useClientContacts.ts`
- [ ] `src/components/modals/AddClientRelationModal.tsx`
- [ ] `src/components/ContactClientRelationItem.tsx`
- [ ] `src/services/syncContactClientRelations.ts`

### Existing Files to Modify
- [ ] `database-schema.ts` - Add new table types
- [ ] `src/lib/types.ts` - Add ContactClientRelation types
- [ ] `src/components/ContactSidebar.tsx` - Replace single client with multi-client module
- [ ] `src/components/ClientSidebar.tsx` - Update contacts module
- [ ] `src/components/ContactOverviewTab.tsx` - Update client association UI
- [ ] `src/components/ContactList.tsx` - Show primary client
- [ ] `src/pages/ContactsPage.tsx` - Update queries
- [ ] Any other components showing contact-client relationships

---

## Rollback Plan

If issues arise after migration:

1. **Restore contact.client_id from junction table:**
```sql
UPDATE contact c
SET client_id = (
  SELECT client_id
  FROM contact_client_relation
  WHERE contact_id = c.id AND is_primary = true
  LIMIT 1
);
```

2. **Drop junction table if needed:**
```sql
DROP TABLE IF EXISTS contact_client_relation CASCADE;
```

3. **Revert code changes** via git

---

## Future Enhancements

### Phase 9: Advanced Features (Post-Launch)
- [ ] Relationship strength indicator (hot/warm/cold)
- [ ] Relationship start/end dates
- [ ] Role hierarchy (primary decision maker, influencer, etc.)
- [ ] Activity tracking per client relationship
- [ ] Automatic role suggestions based on contact title
- [ ] Bulk import/export client associations
- [ ] Visual relationship map showing contact networks

---

## Success Metrics

Post-implementation, verify:
- [ ] All Salesforce multi-client relationships migrated successfully
- [ ] Can create new contact-client associations in OVIS
- [ ] Contact sidebar shows all associated clients
- [ ] Client sidebar shows all associated contacts
- [ ] Primary client relationship is clear in UI
- [ ] No breaking changes to existing contact/client functionality
- [ ] Performance acceptable (queries run in <500ms)

---

## Timeline Estimate

- **Phase 1 (Database)**: 2-3 hours
- **Phase 2 (Types)**: 30 minutes
- **Phase 3 (Hooks)**: 2 hours
- **Phase 4 (UI Components)**: 4-6 hours
- **Phase 5 (Query Updates)**: 2-3 hours
- **Phase 6 (Sync)**: 2 hours
- **Phase 7 (Testing)**: 3-4 hours
- **Phase 8 (Migration)**: 1 hour

**Total Estimated Time**: 17-22 hours

---

## Notes

- Consider adding RLS (Row Level Security) policies to `contact_client_relation` table
- May want to add audit logging for relationship changes
- Consider notification when primary client changes
- Think about how this affects contact assignment workflows
- May need to update any reports/exports that include client info

---

## Questions to Resolve

1. Should we allow contacts with zero client associations?
2. What happens to contact.client_id field - keep synced or deprecate?
3. Should role be free-text or dropdown with predefined values?
4. Do we need start/end dates for relationships?
5. How to handle conflicts when Salesforce and OVIS both modify same relationship?

---

## Next Session Prep

Before starting implementation:
1. Review this plan and make any adjustments
2. Decide on questions listed above
3. Ensure database backup is in place
4. Set up staging environment for testing
5. Review current Salesforce AccountContactRelation data to understand relationship patterns
