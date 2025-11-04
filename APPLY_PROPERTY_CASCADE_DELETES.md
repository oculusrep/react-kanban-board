# Apply Property CASCADE DELETE Migration

## Problem
When trying to delete a property in production, you're getting a 409 conflict error because there are foreign key constraints without CASCADE DELETE rules.

## Solution
Run the SQL migration to add CASCADE DELETE constraints to property-related tables.

## Steps to Apply

### Option 1: Via Supabase Dashboard (RECOMMENDED)

1. Go to your Supabase SQL Editor:
   https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/sql/new

2. Copy and paste the entire contents of:
   `supabase/migrations/20251103220000_add_property_cascade_deletes.sql`

3. Click "Run" to execute the migration

4. Verify the migration by running this query:
   ```sql
   SELECT
       tc.table_name,
       kcu.column_name,
       rc.delete_rule,
       CASE
           WHEN rc.delete_rule = 'CASCADE' THEN '✅ Auto-deletes'
           WHEN rc.delete_rule = 'SET NULL' THEN '⚠️ Sets to NULL'
           WHEN rc.delete_rule = 'NO ACTION' THEN '❌ Still orphans'
           ELSE '❓ ' || rc.delete_rule
       END as what_happens
   FROM information_schema.table_constraints AS tc
   JOIN information_schema.key_column_usage AS kcu
       ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage AS ccu
       ON ccu.constraint_name = tc.constraint_name
   JOIN information_schema.referential_constraints AS rc
       ON rc.constraint_name = tc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'property'
   ORDER BY
       CASE rc.delete_rule
           WHEN 'CASCADE' THEN 1
           WHEN 'SET NULL' THEN 2
           WHEN 'NO ACTION' THEN 3
       END,
       tc.table_name;
   ```

5. You should see:
   - `property_contact.property_id` → CASCADE
   - `property_unit.property_id` → CASCADE
   - `activity.property_id` → CASCADE
   - `note_object_link.property_id` → CASCADE
   - `site_submit.property_id` → SET NULL

## What This Migration Does

### Tables with CASCADE DELETE (auto-delete when property is deleted):
- **property_contact** - Just a link table, the contact record stays
- **property_unit** - Property-specific units are deleted
- **activity** - Activities related to the property are deleted
- **note_object_link** - Note links related to the property are deleted

### Tables with SET NULL (keep record, just remove property reference):
- **site_submit** - Site submits exist independently of properties, so the property_id is just set to NULL

## Enhanced Delete Flow

The application now has a multi-step delete confirmation process:

1. **Check for Related Deals**: If the property is attached to any deals, show a warning with deal names
2. **Check for Related Site Submits**: If the property is attached to any site submits, show a warning with site submit info
3. **Final Confirmation**: Show final confirmation dialog explaining what will be deleted
4. **Execute Delete**: Delete the property and all CASCADE-related records

## After Migration

Once this migration is applied, you will be able to delete properties without getting the 409 conflict error!
