# Airbyte Setup for AccountContactRelation Sync

**Goal**: Automatically sync Salesforce `AccountContactRelation` data into our new `contact_client_relation` table.

---

## Option A: Simple Approach (Recommended to Start)

Keep it simple - let Airbyte sync to `salesforce_AccountContactRelation` table (as it probably already does), then use a scheduled sync script.

### Steps:

1. **Verify Airbyte is syncing `AccountContactRelation`**
   - Log into your Airbyte dashboard
   - Go to your Salesforce → Supabase connection
   - Check if `AccountContactRelation` is in the list of synced tables
   - If NOT, add it to the sync (see "Adding a Table" below)

2. **Run the one-time migration** (do this now)
   - Copy contents of `migrations/contact_client_many_to_many.sql`
   - Run in Supabase SQL Editor: https://app.supabase.com/project/rqbvcvwbziilnycqtmnc/sql

3. **Set up ongoing sync** (choose one):

   **Option 3a: Manual (Simplest)**
   - After each Airbyte sync, run `migrations/sync_contact_client_relations.sql` in Supabase SQL Editor
   - Takes 30 seconds, run it daily/weekly depending on your Airbyte schedule

   **Option 3b: Automated with Supabase Function** (Better long-term)
   - Create a Supabase Edge Function that runs the sync script
   - Call it from a cron job or manually via API
   - See "Automation Setup" section below

---

## Adding AccountContactRelation to Airbyte (if needed)

If `AccountContactRelation` isn't already syncing:

1. **Open Airbyte Dashboard**
   - Go to your Airbyte instance
   - Find your Salesforce → Supabase connection

2. **Edit Connection**
   - Click on the connection
   - Click "Replication" tab
   - Find or search for `AccountContactRelation`

3. **Enable the Table**
   - Toggle it ON
   - Choose sync mode: **Incremental | Append + Deduped** (recommended)
   - Primary key: `Id`
   - Cursor field: `SystemModstamp` or `LastModifiedDate`

4. **Configure Destination**
   - Table name: `salesforce_AccountContactRelation`
   - Schema: `public` (default)

5. **Save and Sync**
   - Click "Save changes"
   - Click "Sync now" to run initial sync

---

## Automation Setup (Optional - for ongoing syncs)

### Method 1: Supabase Database Function (Easiest)

Create a PostgreSQL function that can be called via SQL:

```sql
-- Run this in Supabase SQL Editor
CREATE OR REPLACE FUNCTION sync_salesforce_contact_client_relations()
RETURNS TABLE (
  total_relations INTEGER,
  salesforce_synced INTEGER,
  updated_count INTEGER
) AS $$
DECLARE
  v_total INTEGER;
  v_sf_synced INTEGER;
  v_updated INTEGER;
BEGIN
  -- Count before
  SELECT COUNT(*) INTO v_total FROM contact_client_relation;

  -- Sync new/updated relationships
  WITH upserted AS (
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
    FROM "salesforce_AccountContactRelation" acr
    INNER JOIN contact c ON c.sf_id = acr."ContactId"
    INNER JOIN client cl ON cl.sf_id = acr."AccountId"
    WHERE
      acr."IsDeleted" = false
      AND acr."IsActive" = true
    ON CONFLICT (contact_id, client_id)
    DO UPDATE SET
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM upserted;

  -- Handle deleted relationships
  UPDATE contact_client_relation ccr
  SET is_active = false, updated_at = NOW()
  WHERE ccr.synced_from_salesforce = true
  AND ccr.sf_relation_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "salesforce_AccountContactRelation" acr
    WHERE acr."Id" = ccr.sf_relation_id
    AND (acr."IsDeleted" = true OR acr."IsActive" = false)
  );

  -- Count after
  SELECT COUNT(*) INTO v_total FROM contact_client_relation;
  SELECT COUNT(*) INTO v_sf_synced FROM contact_client_relation WHERE synced_from_salesforce = true;

  RETURN QUERY SELECT v_total, v_sf_synced, v_updated;
END;
$$ LANGUAGE plpgsql;
```

**To run the sync:**
```sql
SELECT * FROM sync_salesforce_contact_client_relations();
```

This gives you output like:
```
total_relations | salesforce_synced | updated_count
----------------|-------------------|---------------
      245       |       238         |      12
```

### Method 2: Supabase Edge Function (More Advanced)

Create an Edge Function that can be triggered via HTTP:

```typescript
// supabase/functions/sync-contact-relations/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Call the database function
  const { data, error } = await supabaseClient.rpc('sync_salesforce_contact_client_relations')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({
    success: true,
    results: data
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

Deploy and call via:
```bash
curl -X POST https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/sync-contact-relations \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### Method 3: Airbyte Post-Sync Hook (If Supported)

Some Airbyte versions support running SQL after sync. Check your Airbyte settings for "Post-sync SQL" or "Transformation" options.

---

## Verification

After running the sync (either manually or automated), verify it worked:

```sql
-- Check total relations
SELECT COUNT(*) as total FROM contact_client_relation;

-- Check Salesforce synced
SELECT COUNT(*) as salesforce_synced
FROM contact_client_relation
WHERE synced_from_salesforce = true;

-- Check primary relations
SELECT COUNT(*) as primary_relations
FROM contact_client_relation
WHERE is_primary = true;

-- See sample data
SELECT
  c.first_name || ' ' || c.last_name as contact_name,
  cl.client_name,
  ccr.role,
  ccr.is_primary,
  ccr.synced_from_salesforce
FROM contact_client_relation ccr
JOIN contact c ON c.id = ccr.contact_id
JOIN client cl ON cl.id = ccr.client_id
LIMIT 10;
```

---

## Recommended Starting Point

**Start with Option A (Manual sync)**:
1. Run one-time migration now
2. After each Airbyte sync, manually run `sync_contact_client_relations.sql`
3. Once comfortable, automate using Method 1 (Database Function)

**Why this approach?**
- Simple to understand
- Easy to troubleshoot
- Can automate later when you're confident it works
- No complex Airbyte configuration needed

---

## Troubleshooting

**Issue: "table salesforce_AccountContactRelation does not exist"**
- Solution: Add AccountContactRelation to your Airbyte sync (see "Adding a Table" section)

**Issue: "no matching contacts/clients found"**
- Solution: Ensure `contact` and `client` tables have `sf_id` populated from Salesforce

**Issue: "duplicate key value violates unique constraint"**
- Solution: This is normal - the `ON CONFLICT` clause handles it

---

## Questions?

Common questions:
- **How often should I sync?** - Same frequency as your Airbyte sync (daily/hourly/etc)
- **Will this overwrite manual changes?** - No, only relationships with `synced_from_salesforce = true` are updated
- **Can I still manually add relations?** - Yes! Manual relations have `synced_from_salesforce = false`
