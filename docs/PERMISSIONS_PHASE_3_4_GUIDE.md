# Permissions System: Phase 3 & 4 Implementation Guide

This document outlines the implementation steps for **Phase 3 (Field-Level Permissions)** and **Phase 4 (Advanced Features)** of the permissions system.

## Current Status (Phases 1 & 2 Complete)

✅ **Phase 1**: Permission Management UI
- Edit role permissions via modal with checkboxes
- Permissions organized by category
- Visual permissions matrix showing all roles

✅ **Phase 2**: Page and Tab-Level Enforcement
- Report visibility controlled by permissions
- Tab-level permissions defined (commission, financial, documents, activity)
- Ready for implementation on individual pages

---

## Phase 3: Field-Level & Tab-Level Enforcement

### Overview
Phase 3 implements granular permission checks throughout the application at three levels:
1. **Tab-Level**: Hide entire tabs on detail pages
2. **Field-Level**: Hide individual form fields
3. **Sidebar-Level**: Hide sidebar sections

### Step 1: Implement Tab-Level Permissions on Deal Pages

#### Example: Deal Detail Page

Let's assume you have a Deal detail page with tabs like:
- Overview
- Commission
- Payments
- Documents
- Activity

**File**: `src/pages/DealDetailPage.tsx` (or wherever your deal tabs are defined)

```tsx
import { usePermissions } from '../hooks/usePermissions';

export default function DealDetailPage() {
  const { hasPermission, loading } = usePermissions();
  const [activeTab, setActiveTab] = useState('overview');

  // Define which tabs are available
  const tabs = [
    { id: 'overview', label: 'Overview', permission: null }, // Always visible
    { id: 'commission', label: 'Commission', permission: 'can_view_deal_commission_tab' },
    { id: 'payments', label: 'Payments', permission: 'can_view_deal_payments_tab' },
    { id: 'documents', label: 'Documents', permission: 'can_view_deal_documents_tab' },
    { id: 'activity', label: 'Activity', permission: 'can_view_deal_activity_tab' },
  ];

  // Filter tabs based on permissions
  const visibleTabs = tabs.filter(tab => {
    if (!tab.permission) return true; // Always show tabs with no permission
    if (loading) return false; // Hide while loading
    return hasPermission(tab.permission);
  });

  // Make sure active tab is visible
  useEffect(() => {
    const isActiveTabVisible = visibleTabs.some(tab => tab.id === activeTab);
    if (!isActiveTabVisible && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 ${activeTab === tab.id ? 'border-b-2 border-blue-600' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'commission' && hasPermission('can_view_deal_commission_tab') && <CommissionTab />}
        {activeTab === 'payments' && hasPermission('can_view_deal_payments_tab') && <PaymentsTab />}
        {activeTab === 'documents' && hasPermission('can_view_deal_documents_tab') && <DocumentsTab />}
        {activeTab === 'activity' && hasPermission('can_view_deal_activity_tab') && <ActivityTab />}
      </div>
    </div>
  );
}
```

### Step 2: Add Field-Level Permissions

For individual form fields or sections, add new permissions to `permissions.ts`:

```typescript
// In src/types/permissions.ts - RolePermissions interface
export interface RolePermissions {
  // ... existing permissions

  // Field-Level Visibility (Deal Page)
  can_view_deal_commission_amount?: boolean;
  can_view_deal_commission_rate?: boolean;
  can_edit_deal_commission_fields?: boolean;
  can_view_deal_buyer_info?: boolean;
  can_view_deal_seller_info?: boolean;

  // Field-Level Visibility (Property Page)
  can_view_property_value?: boolean;
  can_view_property_owner?: boolean;
  can_edit_property_financial_fields?: boolean;
}
```

Then add to `PERMISSION_DEFINITIONS`:

```typescript
// Add new category
export type PermissionCategory =
  | 'user_management'
  | 'deal_management'
  | 'property_management'
  | 'client_management'
  | 'contact_management'
  | 'assignment_management'
  | 'site_submit_management'
  | 'financial_access'
  | 'reporting'
  | 'tab_visibility'
  | 'field_visibility'  // New category
  | 'system_admin';

// In PERMISSION_DEFINITIONS array
{
  key: 'can_view_deal_commission_amount',
  label: 'View Deal Commission Amount',
  description: 'View commission dollar amounts on deals',
  category: 'field_visibility',
  defaultValue: false,
},
{
  key: 'can_view_deal_commission_rate',
  label: 'View Deal Commission Rate',
  description: 'View commission percentage rates',
  category: 'field_visibility',
  defaultValue: false,
},
// ... more field permissions
```

And add the category label:

```typescript
export const PERMISSION_CATEGORIES: Record<PermissionCategory, { label: string; description: string }> = {
  // ... existing categories
  field_visibility: {
    label: 'Field Visibility',
    description: 'Control visibility of individual fields and form sections',
  },
};
```

### Step 3: Implement Field-Level Hiding

**Example**: Hiding commission fields in a deal form

```tsx
import { usePermissions } from '../hooks/usePermissions';

export default function DealForm({ deal, onSave }) {
  const { hasPermission } = usePermissions();

  return (
    <form>
      {/* Basic fields - always visible */}
      <div>
        <label>Deal Name</label>
        <input type="text" name="name" defaultValue={deal.name} />
      </div>

      {/* Conditionally show commission amount */}
      {hasPermission('can_view_deal_commission_amount') && (
        <div>
          <label>Commission Amount</label>
          <input type="number" name="commission" defaultValue={deal.commission} />
        </div>
      )}

      {/* Conditionally show commission rate */}
      {hasPermission('can_view_deal_commission_rate') && (
        <div>
          <label>Commission Rate (%)</label>
          <input type="number" name="rate" defaultValue={deal.rate} />
        </div>
      )}

      {/* Protected edit functionality */}
      <button
        type="submit"
        disabled={!hasPermission('can_edit_deal_commission_fields')}
      >
        Save Deal
      </button>
    </form>
  );
}
```

### Step 4: Implement Sidebar Section Permissions

For sidebar sections (like in property or deal detail pages):

```tsx
import { usePermissions } from '../hooks/usePermissions';

export default function DealSidebar({ deal }) {
  const { hasPermission } = usePermissions();

  return (
    <div className="space-y-4">
      {/* Basic info - always visible */}
      <div className="bg-white p-4 rounded shadow">
        <h3>Deal Information</h3>
        <p>Status: {deal.status}</p>
        <p>Created: {deal.created_at}</p>
      </div>

      {/* Financial section - conditionally visible */}
      {hasPermission('can_view_financials') && (
        <div className="bg-white p-4 rounded shadow">
          <h3>Financial Details</h3>
          {hasPermission('can_view_deal_commission_amount') && (
            <p>Commission: ${deal.commission}</p>
          )}
          {hasPermission('can_view_deal_commission_rate') && (
            <p>Rate: {deal.rate}%</p>
          )}
        </div>
      )}

      {/* Documents section - conditionally visible */}
      {hasPermission('can_view_deal_documents_tab') && (
        <div className="bg-white p-4 rounded shadow">
          <h3>Recent Documents</h3>
          {/* Document list */}
        </div>
      )}
    </div>
  );
}
```

### Step 5: Using the PermissionGuard Component

For simple conditional rendering, use the `PermissionGuard` component:

```tsx
import { PermissionGuard } from '../hooks/usePermissions';

export default function DealPage({ deal }) {
  return (
    <div>
      <h1>{deal.name}</h1>

      {/* Only show commission section if user has permission */}
      <PermissionGuard permission="can_view_deal_commission_tab">
        <CommissionSection deal={deal} />
      </PermissionGuard>

      {/* Show fallback message if no permission */}
      <PermissionGuard
        permission="can_view_financials"
        fallback={<p className="text-gray-500">You don't have access to financial information</p>}
      >
        <FinancialSection deal={deal} />
      </PermissionGuard>
    </div>
  );
}
```

---

## Phase 4: Advanced Features & Server-Side Enforcement

### Overview
Phase 4 adds:
- Server-side permission enforcement
- Row-Level Security (RLS) policies
- API endpoint protection
- Permission inheritance
- Dynamic role assignment

### Step 1: Server-Side Permission Checks

Create a server-side permission utility for API endpoints and Supabase functions.

**File**: `supabase/functions/_shared/permissions.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

export interface UserPermissions {
  userId: string;
  role: string;
  permissions: Record<string, boolean>;
}

/**
 * Fetch user permissions from their role
 */
export async function getUserPermissions(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPermissions | null> {
  // Get user's role
  const { data: user, error: userError } = await supabase
    .from('user')
    .select('ovis_role')
    .eq('id', userId)
    .single();

  if (userError || !user) return null;

  // Get role permissions
  const { data: role, error: roleError } = await supabase
    .from('role')
    .select('permissions')
    .eq('name', user.ovis_role)
    .single();

  if (roleError || !role) return null;

  return {
    userId,
    role: user.ovis_role,
    permissions: role.permissions as Record<string, boolean>,
  };
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  userPermissions: UserPermissions,
  permission: string
): boolean {
  return userPermissions.permissions[permission] === true;
}

/**
 * Middleware to require specific permission
 */
export function requirePermission(permission: string) {
  return async (supabase: SupabaseClient, userId: string) => {
    const userPerms = await getUserPermissions(supabase, userId);

    if (!userPerms || !hasPermission(userPerms, permission)) {
      throw new Error(`Permission denied: ${permission} required`);
    }

    return userPerms;
  };
}
```

### Step 2: Protect API Endpoints

**Example**: Protecting a Supabase Edge Function

**File**: `supabase/functions/deal-reconciliation/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUserPermissions, hasPermission } from '../_shared/permissions.ts';

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get authenticated user
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Check permission
    const userPerms = await getUserPermissions(supabaseClient, user.id);
    if (!userPerms || !hasPermission(userPerms, 'can_view_deal_reconciliation')) {
      return new Response('Forbidden: Insufficient permissions', { status: 403 });
    }

    // Proceed with function logic
    const data = await performDealReconciliation(supabaseClient, userPerms);

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

### Step 3: Row-Level Security (RLS) Policies

RLS policies enforce permissions at the database level.

**Example**: RLS policies for the `deal` table

```sql
-- Enable RLS on deal table
ALTER TABLE deal ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all deals if they have permission
CREATE POLICY "Users can view deals based on permission"
  ON deal
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (
          (r.permissions->>'can_view_all_deals')::boolean = true
          OR deal.created_by = u.id  -- Can always see own deals
        )
    )
  );

-- Policy: Users can edit deals if they have permission
CREATE POLICY "Users can edit deals based on permission"
  ON deal
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_edit_deals')::boolean = true
    )
  );

-- Policy: Users can create deals if they have permission
CREATE POLICY "Users can create deals based on permission"
  ON deal
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_create_deals')::boolean = true
    )
  );

-- Policy: Users can delete deals if they have permission
CREATE POLICY "Users can delete deals based on permission"
  ON deal
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_delete_deals')::boolean = true
    )
  );
```

### Step 4: Column-Level Security for Financial Data

For sensitive fields like commission amounts:

```sql
-- Create a view that filters columns based on permissions
CREATE VIEW deal_with_permissions AS
SELECT
  d.id,
  d.name,
  d.status,
  d.client_id,
  d.property_id,
  d.created_at,
  d.updated_at,
  -- Only show commission fields if user has permission
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_view_deal_commission_amount')::boolean = true
    )
    THEN d.commission_amount
    ELSE NULL
  END AS commission_amount,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_view_deal_commission_rate')::boolean = true
    )
    THEN d.commission_rate
    ELSE NULL
  END AS commission_rate
FROM deal d;

-- Grant access to the view
GRANT SELECT ON deal_with_permissions TO authenticated;
```

### Step 5: Permission Inheritance

Create a helper function for permission inheritance (e.g., "admin" role inherits all permissions):

```sql
-- Function to merge role permissions with admin override
CREATE OR REPLACE FUNCTION get_effective_permissions(role_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role_permissions jsonb;
  admin_permissions jsonb;
BEGIN
  -- Get role permissions
  SELECT permissions INTO role_permissions
  FROM role
  WHERE name = role_name;

  -- If role is admin, return all permissions as true
  IF role_name = 'admin' THEN
    RETURN jsonb_build_object(
      'can_manage_users', true,
      'can_view_users', true,
      'can_create_deals', true,
      'can_edit_deals', true,
      'can_delete_deals', true,
      -- ... all other permissions set to true
    );
  END IF;

  RETURN COALESCE(role_permissions, '{}'::jsonb);
END;
$$;
```

### Step 6: Audit Logging

Track permission-based actions:

```sql
-- Create audit log table
CREATE TABLE permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES "user"(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  permission_checked text,
  granted boolean NOT NULL,
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
  ON permission_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_view_audit_logs')::boolean = true
    )
  );
```

---

## Testing Checklist

### Phase 3 Testing
- [ ] Tab-level permissions hide tabs correctly
- [ ] Field-level permissions hide sensitive fields
- [ ] Sidebar sections respect permissions
- [ ] PermissionGuard component works with fallbacks
- [ ] Active tab switches correctly when permissions change
- [ ] Form submissions respect edit permissions

### Phase 4 Testing
- [ ] API endpoints reject unauthorized requests
- [ ] RLS policies prevent unauthorized data access
- [ ] Column-level security filters sensitive data
- [ ] Audit logs capture permission checks
- [ ] Admin role has access to everything
- [ ] Permission changes take effect immediately

---

## Best Practices

1. **Default Deny**: Always default to denying access unless explicitly granted
2. **Server-Side First**: Never rely solely on client-side permission checks
3. **Granular Permissions**: Create specific permissions rather than broad ones
4. **Consistent Naming**: Use clear, consistent naming for permissions (e.g., `can_view_X`, `can_edit_X`)
5. **Audit Everything**: Log all permission checks for sensitive operations
6. **Test Thoroughly**: Test with different roles to ensure proper access control
7. **Document Changes**: Keep permission documentation up to date

---

## Troubleshooting

### Permission Not Taking Effect
1. Check that role has the permission enabled in database
2. Clear browser cache and refresh
3. Log out and log back in to refresh permissions
4. Verify RLS policies are enabled on the table

### User Can See Data They Shouldn't
1. Check RLS policies on the table
2. Verify API endpoint has permission check
3. Check for direct database queries bypassing permissions
4. Review column-level security setup

### Performance Issues
1. Consider caching permissions on the client
2. Optimize RLS policies (add indexes if needed)
3. Use database views for complex permission logic
4. Batch permission checks when possible

---

## Migration Path

When rolling out Phase 3 & 4:

1. **Start with Non-Critical Features**: Test tab/field hiding on less sensitive pages first
2. **Add RLS Gradually**: Enable RLS on one table at a time
3. **Monitor Performance**: Watch database query performance after enabling RLS
4. **User Communication**: Inform users about new access controls
5. **Have Rollback Plan**: Be ready to disable RLS if issues arise

---

## Read-Only vs Editable Field Permissions

### Overview
Beyond hiding fields, you may want to show fields but make them read-only for certain roles. This adds another layer of granular control.

### Step 1: Add Read-Only Permissions

Add read-only specific permissions to `permissions.ts`:

```typescript
// In src/types/permissions.ts - RolePermissions interface
export interface RolePermissions {
  // ... existing permissions

  // Read-Only Field Access (Deal Page)
  can_edit_deal_commission_fields?: boolean;  // Already exists
  can_edit_deal_status?: boolean;
  can_edit_deal_dates?: boolean;
  can_edit_deal_client?: boolean;

  // Read-Only Field Access (Property Page)
  can_edit_property_address?: boolean;
  can_edit_property_owner?: boolean;
  can_edit_property_financials?: boolean;

  // Read-Only Field Access (Client Page)
  can_edit_client_contacts?: boolean;
  can_edit_client_billing?: boolean;
}
```

Add to `PERMISSION_DEFINITIONS`:

```typescript
// Add new category
export type PermissionCategory =
  | 'user_management'
  | 'deal_management'
  | 'property_management'
  | 'client_management'
  | 'contact_management'
  | 'assignment_management'
  | 'site_submit_management'
  | 'financial_access'
  | 'reporting'
  | 'tab_visibility'
  | 'field_visibility'
  | 'edit_permissions'  // New category
  | 'system_admin';

// In PERMISSION_DEFINITIONS array
{
  key: 'can_edit_deal_commission_fields',
  label: 'Edit Deal Commission Fields',
  description: 'Modify commission amounts and rates',
  category: 'edit_permissions',
  defaultValue: false,
},
{
  key: 'can_edit_deal_status',
  label: 'Edit Deal Status',
  description: 'Change deal status (pending, active, closed, etc.)',
  category: 'edit_permissions',
  defaultValue: true,
},
// ... more edit permissions
```

Update category labels:

```typescript
export const PERMISSION_CATEGORIES: Record<PermissionCategory, { label: string; description: string }> = {
  // ... existing categories
  edit_permissions: {
    label: 'Edit Permissions',
    description: 'Control which fields users can edit vs view-only',
  },
};
```

### Step 2: Implement Read-Only Form Fields

**Example**: Deal form with read-only commission fields

```tsx
import { usePermissions } from '../hooks/usePermissions';

export default function DealForm({ deal, onSave }) {
  const { hasPermission } = usePermissions();

  // Can view vs can edit
  const canViewCommission = hasPermission('can_view_deal_commission_amount');
  const canEditCommission = hasPermission('can_edit_deal_commission_fields');

  return (
    <form>
      {/* Commission Amount - Conditional Read-Only */}
      {canViewCommission && (
        <div>
          <label>Commission Amount</label>
          <input
            type="number"
            name="commission"
            defaultValue={deal.commission}
            disabled={!canEditCommission}
            className={!canEditCommission ? 'bg-gray-100 cursor-not-allowed' : ''}
          />
          {!canEditCommission && (
            <p className="text-xs text-gray-500 mt-1">View only - no edit permission</p>
          )}
        </div>
      )}

      {/* Deal Status - Conditional Read-Only */}
      <div>
        <label>Deal Status</label>
        <select
          name="status"
          defaultValue={deal.status}
          disabled={!hasPermission('can_edit_deal_status')}
        >
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Save button respects overall edit permission */}
      <button
        type="submit"
        disabled={!hasPermission('can_edit_deals')}
      >
        Save Deal
      </button>
    </form>
  );
}
```

### Step 3: Visual Read-Only Indicators

Create a reusable component for read-only fields:

```tsx
// src/components/ReadOnlyField.tsx
import { usePermissions } from '../hooks/usePermissions';
import { RolePermissions } from '../types/permissions';

interface ReadOnlyFieldProps {
  label: string;
  value: string | number;
  editPermission: keyof RolePermissions;
  viewPermission?: keyof RolePermissions;
  children?: React.ReactNode;
}

export default function ReadOnlyField({
  label,
  value,
  editPermission,
  viewPermission,
  children
}: ReadOnlyFieldProps) {
  const { hasPermission } = usePermissions();

  // Check view permission if specified
  const canView = viewPermission ? hasPermission(viewPermission) : true;
  const canEdit = hasPermission(editPermission);

  if (!canView) return null; // Hide completely if no view permission

  if (canEdit && children) {
    return <>{children}</>; // Render editable version
  }

  // Render read-only version
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-900">
        {value}
      </div>
      <p className="text-xs text-gray-500">Read only</p>
    </div>
  );
}
```

Usage:

```tsx
import ReadOnlyField from '../components/ReadOnlyField';

export default function DealForm({ deal, onChange }) {
  const { hasPermission } = usePermissions();

  return (
    <form>
      {/* Commission field - read-only or editable based on permission */}
      <ReadOnlyField
        label="Commission Amount"
        value={`$${deal.commission.toLocaleString()}`}
        editPermission="can_edit_deal_commission_fields"
        viewPermission="can_view_deal_commission_amount"
      >
        {/* Editable version (only shown if user has edit permission) */}
        <div>
          <label>Commission Amount</label>
          <input
            type="number"
            value={deal.commission}
            onChange={(e) => onChange('commission', e.target.value)}
          />
        </div>
      </ReadOnlyField>
    </form>
  );
}
```

### Step 4: Server-Side Read-Only Enforcement

Protect fields on the backend:

```sql
-- Policy: Users can update deal, but not commission fields unless they have permission
CREATE POLICY "Users can update deals with field restrictions"
  ON deal
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_edit_deals')::boolean = true
    )
  )
  WITH CHECK (
    -- Allow all updates if user has edit permission
    EXISTS (
      SELECT 1
      FROM "user" u
      JOIN role r ON u.ovis_role = r.name
      WHERE u.auth_user_id = auth.uid()
        AND (r.permissions->>'can_edit_deals')::boolean = true
    )
    AND
    -- If commission fields changed, require commission edit permission
    (
      (OLD.commission_amount = NEW.commission_amount AND OLD.commission_rate = NEW.commission_rate)
      OR
      EXISTS (
        SELECT 1
        FROM "user" u
        JOIN role r ON u.ovis_role = r.name
        WHERE u.auth_user_id = auth.uid()
          AND (r.permissions->>'can_edit_deal_commission_fields')::boolean = true
      )
    )
  );
```

---

## Next Steps & Implementation Roadmap

### Completed ✅
- ✅ **Phase 1**: Permission Management UI
  - Role creation and editing
  - Visual permissions editor with categories
  - Permissions matrix with interactive toggles
  - Select all/none per role

- ✅ **Phase 2 (Partial)**: Page-Level Enforcement
  - Report visibility based on permissions
  - Tab-level permissions defined

### Phase 2 Remaining Tasks 🔄

#### Task 1: Implement Tab Hiding on Deal Pages
**Estimated Time**: 2-3 hours

1. Update Deal detail page to use tab permissions
2. Hide Commission/Payments tabs based on permissions
3. Test with different roles
4. Document implementation

**Files to Modify:**
- `src/pages/DealDetailPage.tsx` (or equivalent)
- Add tab visibility checks using `usePermissions` hook

#### Task 2: Implement Tab Hiding on Property Pages
**Estimated Time**: 1-2 hours

1. Update Property detail page
2. Hide Financial/Documents tabs based on permissions
3. Test and verify

#### Task 3: Implement Tab Hiding on Client Pages
**Estimated Time**: 1-2 hours

1. Update Client detail page
2. Hide Financial/Deals tabs based on permissions
3. Test and verify

### Phase 3: Field-Level Permissions 📋

#### Task 1: Add Field Visibility Permissions
**Estimated Time**: 3-4 hours

1. Add field-level permissions to `permissions.ts`
2. Create field visibility category
3. Update permissions matrix to include new permissions
4. Test permission toggling

#### Task 2: Implement Field Hiding
**Estimated Time**: 4-6 hours per entity (Deal, Property, Client)

1. Identify sensitive fields to protect
2. Wrap fields in permission checks
3. Test visibility with different roles
4. Ensure forms still submit correctly

**Example Fields to Protect:**
- **Deals**: Commission amount, commission rate, buyer info, seller info
- **Properties**: Property value, owner information, acquisition cost
- **Clients**: Billing information, contract terms, internal notes

#### Task 3: Add Read-Only Field Support
**Estimated Time**: 4-6 hours

1. Add edit permissions to `permissions.ts`
2. Create `ReadOnlyField` component
3. Implement read-only styling
4. Update forms to use conditional editing
5. Test edit restrictions

### Phase 4: Server-Side Enforcement 🔒

#### Task 1: Implement Server-Side Permission Checks
**Estimated Time**: 6-8 hours

1. Create server-side permission utility
2. Protect Supabase Edge Functions
3. Add permission checks to API endpoints
4. Test unauthorized access attempts

#### Task 2: Implement Row-Level Security (RLS)
**Estimated Time**: 8-10 hours

1. Design RLS policies for each table
2. Implement policies one table at a time
3. Test policy effectiveness
4. Monitor query performance
5. Add indexes if needed

**Tables to Protect:**
- `deal` - View/edit based on permissions
- `property` - View/edit based on permissions
- `client` - View/edit based on permissions
- `payment` - Restrict to financial permissions
- `commission` - Restrict to financial permissions

#### Task 3: Column-Level Security
**Estimated Time**: 4-6 hours

1. Create database views for sensitive columns
2. Implement column filtering based on permissions
3. Update application queries to use views
4. Test data access restrictions

#### Task 4: Audit Logging
**Estimated Time**: 4-6 hours

1. Create `permission_audit_log` table
2. Add logging to permission checks
3. Create audit log viewer (admin only)
4. Test log capture and viewing

### Phase 5: Advanced Features 🚀

#### Task 1: Permission Templates
**Estimated Time**: 3-4 hours

Create pre-configured permission sets:
- "Broker - Standard" template
- "Broker - Senior" template
- "Accounting" template
- "Assistant" template

#### Task 2: Bulk Permission Management
**Estimated Time**: 2-3 hours

1. Add "Copy permissions from role" feature
2. Enable permission export/import
3. Add permission comparison view

#### Task 3: Permission History & Rollback
**Estimated Time**: 4-6 hours

1. Track permission changes over time
2. Show who changed permissions and when
3. Allow permission rollback to previous state

#### Task 4: Resource-Level Permissions
**Estimated Time**: 8-12 hours

Implement per-resource access:
- Assign users to specific deals
- Assign users to specific properties
- Override role permissions for specific resources

---

## Testing Checklist

### Phase 2 Testing
- [ ] Tab-level permissions hide tabs correctly on Deal pages
- [ ] Tab-level permissions hide tabs correctly on Property pages
- [ ] Tab-level permissions hide tabs correctly on Client pages
- [ ] Active tab switches correctly when permissions change
- [ ] Browser refresh maintains permission state

### Phase 3 Testing
- [ ] Field-level permissions hide sensitive fields
- [ ] Read-only fields display correctly
- [ ] Read-only fields cannot be edited
- [ ] Form submissions respect edit permissions
- [ ] Field visibility updates when role changes
- [ ] Sidebar sections respect permissions

### Phase 4 Testing
- [ ] API endpoints reject unauthorized requests
- [ ] RLS policies prevent unauthorized data access
- [ ] Column-level security filters sensitive data
- [ ] Audit logs capture permission checks
- [ ] Permission changes take effect immediately
- [ ] Query performance is acceptable with RLS

### Phase 5 Testing
- [ ] Permission templates apply correctly
- [ ] Bulk operations work as expected
- [ ] Permission history is accurate
- [ ] Resource-level overrides work correctly

---

## Future Enhancements

- **Time-Based Permissions**: Grant temporary access to resources
- **Delegation**: Allow users to delegate permissions to others
- **Multi-Factor Authorization**: Require additional verification for sensitive actions
- **Permission Groups**: Bundle related permissions together
- **Conditional Permissions**: Permissions based on data state (e.g., can edit if deal is pending)
- **Mobile App Permissions**: Extend permissions to mobile applications
- **API Key Permissions**: Generate API keys with specific permission scopes

---

## Support

For questions or issues with permissions implementation:
1. Review this guide and the main PERMISSIONS_SYSTEM.md documentation
2. Check the example implementations in this guide
3. Test with the admin role to verify expected behavior
4. Review RLS policy errors in Supabase logs
5. Check browser console for permission-related errors
