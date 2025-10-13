# How to Run Contact Roles Migrations via Supabase Dashboard

Since the `DATABASE_URL` is not set in your environment, you can run these migrations directly through the Supabase Dashboard.

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor

Go to: **https://supabase.com/dashboard/project/rqbvcvwbziilnycqtmnc/sql/new**

### 2. Run Migration 1: Create Tables and Views

Copy and paste the entire contents of this file into the SQL Editor:
```
migrations/contact_roles_many_to_many.sql
```

Click **"Run"** or press `Ctrl+Enter` (or `Cmd+Enter` on Mac)

**Expected Result:** You should see messages like:
- "Migrated X site selector contacts from contact.is_site_selector"
- Tables created successfully

### 3. Run Migration 2: Update Role List

Copy and paste the entire contents of this file:
```
migrations/update_contact_roles.sql
```

Click **"Run"**

**Expected Result:** Role list updated with your 8 specific roles

### 4. Run Migration 3: Finalize Roles

Copy and paste the entire contents of this file:
```
migrations/finalize_contact_roles.sql
```

Click **"Run"**

**Expected Result:** You should see exactly 8 active roles when you query:
```sql
SELECT role_name, sort_order, is_active
FROM contact_client_role_type
ORDER BY sort_order;
```

## Verify Everything Worked

Run this query to verify:

```sql
-- Check tables exist
SELECT COUNT(*) as role_types FROM contact_client_role_type;
SELECT COUNT(*) as role_assignments FROM contact_client_role;

-- See all active roles
SELECT role_name, sort_order
FROM contact_client_role_type
WHERE is_active = true
ORDER BY sort_order;
```

You should see:
1. Site Selector
2. Franchisee
3. Franchisor
4. Real Estate Lead
5. Attorney
6. Lender
7. Contractor
8. Engineer

## After Running Migrations

Once the migrations are complete, you need to **assign Site Selector roles to contacts**:

1. Go to your CRM app
2. Open a **Client Sidebar** (click on any client)
3. Find a contact who should receive site submit emails
4. Click **"+ Add Role"** below their name
5. Select **"Site Selector"**
6. Click "Add Role"

**Repeat for all contacts who should receive site submit emails for that client.**

## Testing

Once you've assigned at least one Site Selector role:

1. Create or open a Site Submit for that client
2. Click **"Submit Site"** button
3. The email should now be sent successfully!

## Troubleshooting

### "No Site Selector contacts found"

This means no contacts have been assigned the Site Selector role for that client yet. Follow the steps above to assign the role.

### Migration errors

If you get any errors like "relation already exists", that's OK - it means some parts were already run. You can continue with the next migration.

### Need to check existing roles

```sql
-- See all role assignments for a specific client
SELECT
  c.first_name,
  c.last_name,
  c.email,
  crt.role_name,
  ccr.is_active
FROM contact_client_role ccr
JOIN contact c ON ccr.contact_id = c.id
JOIN contact_client_role_type crt ON ccr.role_id = crt.id
WHERE ccr.client_id = 'YOUR-CLIENT-ID-HERE'
  AND ccr.is_active = true;
```
