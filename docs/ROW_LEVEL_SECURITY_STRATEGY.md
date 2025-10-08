# Row Level Security (RLS) Strategy for OVIS

## Current Problem

Your database currently has **overly permissive RLS policies** that allow any authenticated user to see ALL data:

```sql
-- ❌ TOO PERMISSIVE - Current state
CREATE POLICY "Allow authenticated users to read all"
ON deal FOR SELECT TO authenticated USING (true);
```

This means if you add a "Client Access" user or "Limited Broker", they'll see **everything** - all deals, contacts, commissions, etc.

---

## Recommended Security Model

### User Role Hierarchy

Add a new `ovis_role` column to your `user` table:

```sql
-- Add role column to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS ovis_role TEXT DEFAULT 'broker';

-- Possible values:
-- 'admin'           - Full system access (you, system admin)
-- 'broker_full'     - Full broker access (current 3 users)
-- 'broker_limited'  - Limited broker (new user - restricted)
-- 'assistant'       - Administrative assistant (help brokers, no commissions)
-- 'client'          - Client portal access (very restricted)
```

### Access Matrix

| Resource | Admin | Broker (Full) | Broker (Limited) | Assistant | Client |
|----------|-------|---------------|------------------|-----------|---------|
| **Own Deals** | All | All owned/team | Only assigned | All (view/edit) | Only theirs |
| **Other Deals** | All | Team only | None | All (view/edit) | None |
| **Contacts** | All | All (CRUD) | Read-only | All (CRUD) | Only theirs |
| **Clients** | All | All (CRUD) | Read-only | All (CRUD) | Only theirs |
| **Commissions** | All | Own + view team | Own only | **View only** | None |
| **Payments** | All | All (CRUD) | View only | **View only** | None |
| **Users** | Manage | View | None | View | None |
| **Activities** | All | All | Own | All (CRUD) | None |
| **Notes** | All | All | Own | All (CRUD) | None |

**Assistant Role Details:**
- Can manage deals, contacts, clients (help brokers with day-to-day tasks)
- Can create/edit activities and notes on behalf of brokers
- **Cannot see or edit commissions/payments** (sensitive financial data)
- Cannot manage users
- Think: Executive assistant, operations coordinator

---

## Implementation Steps

### Step 1: Add Role Column to User Table

```sql
-- Add ovis_role column
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS ovis_role TEXT DEFAULT 'broker_full';

-- Set your admins
UPDATE "user" SET ovis_role = 'admin'
WHERE email IN ('mike@oculusrep.com', 'your_email@example.com');

-- Set the 3 existing brokers to full access
UPDATE "user" SET ovis_role = 'broker_full'
WHERE email IN ('broker1@example.com', 'broker2@example.com', 'broker3@example.com');

-- Verify
SELECT id, email, name, ovis_role FROM "user";
```

### Step 2: Helper Functions

Create PostgreSQL functions to check user roles:

```sql
-- Function to get current user's ID from JWT
CREATE OR REPLACE FUNCTION auth.user_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    (current_setting('request.jwt.claims', true)::json->>'user_id')
  )::uuid;
$$ LANGUAGE SQL STABLE;

-- Function to get current user's role
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT ovis_role FROM "user" WHERE id = auth.user_id();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT auth.user_role() = 'admin';
$$ LANGUAGE SQL STABLE;

-- Function to check if user is broker (full or limited)
CREATE OR REPLACE FUNCTION auth.is_broker()
RETURNS BOOLEAN AS $$
  SELECT auth.user_role() IN ('admin', 'broker_full', 'broker_limited');
$$ LANGUAGE SQL STABLE;

-- Function to check if user is assistant
CREATE OR REPLACE FUNCTION auth.is_assistant()
RETURNS BOOLEAN AS $$
  SELECT auth.user_role() = 'assistant';
$$ LANGUAGE SQL STABLE;

-- Function to check if user can manage operations (brokers + assistants)
CREATE OR REPLACE FUNCTION auth.can_manage_operations()
RETURNS BOOLEAN AS $$
  SELECT auth.user_role() IN ('admin', 'broker_full', 'broker_limited', 'assistant');
$$ LANGUAGE SQL STABLE;

-- Function to get user's broker_id (for commission/deal filtering)
CREATE OR REPLACE FUNCTION auth.user_broker_id()
RETURNS UUID AS $$
  SELECT id FROM broker WHERE user_id = auth.user_id() LIMIT 1;
$$ LANGUAGE SQL STABLE;
```

### Step 3: Example RLS Policies

#### Deal Table (Core Example)

```sql
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to read all" ON deal;
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON deal;
DROP POLICY IF EXISTS "Allow authenticated users to update" ON deal;
DROP POLICY IF EXISTS "Allow authenticated users to delete" ON deal;

-- SELECT Policy
CREATE POLICY "Users can view deals based on role"
ON deal FOR SELECT
TO authenticated
USING (
  -- Admins see everything
  auth.is_admin()
  OR
  -- Broker (Full) sees all deals
  auth.user_role() = 'broker_full'
  OR
  -- Broker (Limited) sees only deals they're assigned to
  (
    auth.user_role() = 'broker_limited'
    AND (
      owner_id = auth.user_id()
      OR id IN (
        SELECT deal_id FROM commission_split
        WHERE broker_id = auth.user_broker_id()
      )
    )
  )
  OR
  -- Clients see only deals where they're the client
  (
    auth.user_role() = 'client'
    AND client_id IN (
      SELECT id FROM client WHERE contact_id = auth.user_id()
    )
  )
);

-- INSERT Policy
CREATE POLICY "Brokers and admins can create deals"
ON deal FOR INSERT
TO authenticated
WITH CHECK (
  auth.is_admin() OR auth.user_role() IN ('broker_full', 'broker_limited')
);

-- UPDATE Policy
CREATE POLICY "Users can update deals based on role"
ON deal FOR UPDATE
TO authenticated
USING (
  auth.is_admin()
  OR auth.user_role() = 'broker_full'
  OR (
    auth.user_role() = 'broker_limited'
    AND owner_id = auth.user_id()
  )
);

-- DELETE Policy
CREATE POLICY "Only admins and deal owners can delete"
ON deal FOR DELETE
TO authenticated
USING (
  auth.is_admin() OR owner_id = auth.user_id()
);
```

#### Contact Table

```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read all" ON contact;
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON contact;
DROP POLICY IF EXISTS "Allow authenticated users to update" ON contact;

-- SELECT: Brokers see all, clients see only themselves
CREATE POLICY "Users can view contacts based on role"
ON contact FOR SELECT
TO authenticated
USING (
  auth.is_admin()
  OR auth.is_broker()  -- All brokers see all contacts
  OR (
    auth.user_role() = 'client'
    AND id = auth.user_id()
  )
);

-- INSERT: Only admins and full brokers
CREATE POLICY "Admins and brokers can create contacts"
ON contact FOR INSERT
TO authenticated
WITH CHECK (
  auth.is_admin() OR auth.user_role() = 'broker_full'
);

-- UPDATE: Admins, full brokers, limited brokers (read-only in UI)
CREATE POLICY "Users can update contacts based on role"
ON contact FOR UPDATE
TO authenticated
USING (
  auth.is_admin()
  OR auth.user_role() = 'broker_full'
  OR (
    auth.user_role() = 'client' AND id = auth.user_id()
  )
);
```

#### Contact Client Relation Table (Our New Table!)

```sql
-- Enable RLS
ALTER TABLE contact_client_relation ENABLE ROW LEVEL SECURITY;

-- SELECT: Based on whether user can see the contact or client
CREATE POLICY "Users can view contact-client relations based on role"
ON contact_client_relation FOR SELECT
TO authenticated
USING (
  auth.is_admin()
  OR auth.is_broker()  -- All brokers see all relationships
  OR (
    auth.user_role() = 'client'
    AND (
      contact_id = auth.user_id()
      OR client_id IN (
        SELECT id FROM client WHERE contact_id = auth.user_id()
      )
    )
  )
);

-- INSERT: Only admins and full brokers
CREATE POLICY "Admins and full brokers can create contact-client relations"
ON contact_client_relation FOR INSERT
TO authenticated
WITH CHECK (
  auth.is_admin() OR auth.user_role() = 'broker_full'
);

-- UPDATE: Admins and full brokers
CREATE POLICY "Admins and full brokers can update contact-client relations"
ON contact_client_relation FOR UPDATE
TO authenticated
USING (
  auth.is_admin() OR auth.user_role() = 'broker_full'
);

-- DELETE: Admins and full brokers
CREATE POLICY "Admins and full brokers can delete contact-client relations"
ON contact_client_relation FOR DELETE
TO authenticated
USING (
  auth.is_admin() OR auth.user_role() = 'broker_full'
);
```

#### Commission & Payment Tables (Sensitive!)

```sql
-- Commissions: Admins see all, brokers see own + team, limited sees own only
CREATE POLICY "Users can view commissions based on role"
ON commission_split FOR SELECT
TO authenticated
USING (
  auth.is_admin()
  OR auth.user_role() = 'broker_full'
  OR (
    auth.user_role() = 'broker_limited'
    AND broker_id = auth.user_broker_id()
  )
  -- Clients cannot see commissions
);

-- Payments: Similar to commissions
CREATE POLICY "Users can view payments based on role"
ON payment FOR SELECT
TO authenticated
USING (
  auth.is_admin() OR auth.user_role() = 'broker_full'
  -- Limited brokers and clients cannot see payments
);
```

---

## Quick Start: Minimal Security Setup

If you want to **quickly secure your system now** without full granular control:

```sql
-- 1. Add role column
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS ovis_role TEXT DEFAULT 'broker_full';

-- 2. Set yourself as admin
UPDATE "user" SET ovis_role = 'admin' WHERE email = 'your_email@example.com';

-- 3. Update ALL table policies to this simple pattern:
-- (Repeat for each table: deal, contact, client, etc.)

DROP POLICY IF EXISTS "Allow authenticated users to read all" ON contact_client_relation;
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON contact_client_relation;
DROP POLICY IF EXISTS "Allow authenticated users to update" ON contact_client_relation;
DROP POLICY IF EXISTS "Allow authenticated users to delete" ON contact_client_relation;

-- Simple admin-or-broker check
CREATE POLICY "Allow admins and brokers full access"
ON contact_client_relation FOR ALL
TO authenticated
USING (
  (SELECT ovis_role FROM "user" WHERE id = auth.user_id()) IN ('admin', 'broker_full', 'broker_limited')
)
WITH CHECK (
  (SELECT ovis_role FROM "user" WHERE id = auth.user_id()) IN ('admin', 'broker_full')
);
```

This gives you:
- ✅ Blocks non-broker users
- ✅ Allows current 3 brokers full access
- ✅ Ready to add limited/client users later
- ❌ But doesn't restrict limited brokers yet (you can add that later)

---

## Testing RLS Policies

```sql
-- Test as specific user
SET request.jwt.claims = '{"sub": "user-uuid-here"}';

-- See what deals you can see
SELECT * FROM deal;

-- Reset
RESET request.jwt.claims;
```

Or use Supabase Dashboard:
1. Go to Table Editor
2. Click on table
3. See "RLS Disabled" warning if no policies
4. Test with different user tokens

---

## Recommendations

### For Right Now (This Week)
1. ✅ Add `ovis_role` column
2. ✅ Set your 3 brokers to `broker_full`
3. ✅ Apply the "Quick Start" simple policies to all tables
4. ✅ Test that you can still access everything

### Short Term (Next Sprint)
1. Implement granular policies per table (deal, contact, commission, etc.)
2. Add limited broker with restricted view
3. Test thoroughly in dev

### Long Term (Before Adding Clients)
1. Build client portal UI
2. Add `client` role policies
3. Create client invite system
4. Audit log for sensitive data access

---

## Migration Script Template

See `migrations/implement_rls_roles.sql` for a complete implementation.

