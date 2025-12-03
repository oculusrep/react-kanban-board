# Role-Based Access Control (RBAC) Implementation

**Status: IMPLEMENTED** (December 2024)

## Overview

This document describes the role-based access control system used to restrict user access based on their assigned role. The implementation allows different user roles to see different dashboards, navigation options, and report views.

---

## Architecture

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `AuthContext` | Provides `userRole` from user table | `src/contexts/AuthContext.tsx` |
| `CoachRoute` | Route guard that redirects restricted roles | `src/components/CoachRoute.tsx` |
| `CoachNavbar` | Simplified navbar for coach users | `src/components/CoachNavbar.tsx` |
| `CoachDashboardPage` | Dashboard page for coach users | `src/pages/CoachDashboardPage.tsx` |
| `RobReport` | Report with `readOnly` prop | `src/components/reports/RobReport.tsx` |

### Database Schema

```sql
-- Role table (defines available roles)
CREATE TABLE role (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,  -- e.g., 'admin', 'broker', 'coach'
  description TEXT
);

-- User table (links auth users to roles)
CREATE TABLE "user" (
  id UUID PRIMARY KEY,
  auth_user_id UUID REFERENCES auth.users(id),
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  name TEXT,
  ovis_role TEXT REFERENCES role(name),  -- Foreign key to role.name
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### Role Detection Flow

```
1. User logs in via Supabase Auth
2. AuthContext fetches user record by auth_user_id
3. userRole is set from user.ovis_role field
4. Components check userRole to determine access/visibility
```

---

## Current Roles

| Role | Access Level | Dashboard | Navbar |
|------|-------------|-----------|--------|
| `admin` | Full access | Master Pipeline | Full navbar |
| `broker` | Standard access | Master Pipeline | Full navbar |
| `coach` | Read-only reports only | Coach Dashboard | Simplified navbar |

---

## Implementation Details

### 1. Route Guard Component

Create a route guard component that redirects restricted users:

```typescript
// src/components/CoachRoute.tsx
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface CoachRouteProps {
  children: ReactNode;
}

export default function CoachRoute({ children }: CoachRouteProps) {
  const { userRole } = useAuth();

  // If user is a coach, redirect them to coach dashboard
  if (userRole === 'coach') {
    return <Navigate to="/coach-dashboard" replace />;
  }

  // All other roles can access the route
  return <>{children}</>;
}
```

### 2. Simplified Navbar

Create a minimal navbar for restricted roles:

```typescript
// src/components/CoachNavbar.tsx
import { useAuth } from '../contexts/AuthContext';

export default function CoachNavbar() {
  const { user, signOut } = useAuth();

  return (
    <nav className="bg-white shadow p-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="text-xl font-bold text-gray-800">OVIS</span>
          <span className="ml-2 text-sm text-gray-500">Coach Dashboard</span>
        </div>
        {user && (
          <div className="flex items-center space-x-3">
            {/* User avatar and sign out button */}
          </div>
        )}
      </div>
    </nav>
  );
}
```

### 3. Role-Based Dashboard

Create a dedicated dashboard for the restricted role:

```typescript
// src/pages/CoachDashboardPage.tsx
import { useState, useEffect } from 'react';
import RobReport from '../components/reports/RobReport';

type ReportType = 'rob-report' | null;

export default function CoachDashboardPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType>(null);

  // Show report selection or selected report with readOnly prop
  if (selectedReport === 'rob-report') {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <button onClick={() => setSelectedReport(null)}>
          Back to Dashboard
        </button>
        <RobReport readOnly />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Report selection cards */}
    </div>
  );
}
```

### 4. Read-Only Report Props

Add `readOnly` prop to reports to hide edit functionality:

```typescript
// src/components/reports/RobReport.tsx
interface RobReportProps {
  readOnly?: boolean;
}

export default function RobReport({ readOnly = false }: RobReportProps) {
  // When readOnly is true:
  // - Hide warning icons and missing splits counts
  // - Make deal names plain text (not clickable)
  // - Hide "Edit Splits" / "+ Add Splits" buttons
  // - Don't render modals or slideouts
  // - Remove orange warning styling from rows
}
```

### 5. App Routing Configuration

Update App.tsx with role-based routing:

```typescript
// src/App.tsx
import { useAuth } from "./contexts/AuthContext";
import CoachRoute from "./components/CoachRoute";
import CoachNavbar from "./components/CoachNavbar";
import CoachDashboardPage from "./pages/CoachDashboardPage";

function ProtectedLayout() {
  const { userRole } = useAuth();

  // Coach users get a simplified navbar
  const NavbarComponent = userRole === 'coach' ? CoachNavbar : Navbar;

  return (
    <ProtectedRoute>
      {!isEmbedded && <NavbarComponent />}
    </ProtectedRoute>
  );
}

// Smart redirect based on user role
function RoleBasedRedirect() {
  const { userRole } = useAuth();

  if (userRole === 'coach') {
    return <Navigate to="/coach-dashboard" replace />;
  }

  return <Navigate to="/master-pipeline" replace />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<ProtectedLayout />}>
          <Route index element={<RoleBasedRedirect />} />

          {/* Role-specific route (no guard needed) */}
          <Route path="coach-dashboard" element={<CoachDashboardPage />} />

          {/* All other routes blocked for coach users */}
          <Route path="master-pipeline" element={<CoachRoute><KanbanBoard /></CoachRoute>} />
          <Route path="tasks" element={<CoachRoute><TaskDashboardPage /></CoachRoute>} />
          <Route path="deal/:dealId" element={<CoachRoute><DealDetailsPage /></CoachRoute>} />
          {/* ... wrap all restricted routes with CoachRoute */}
        </Route>
      </Routes>
    </AuthProvider>
  );
}
```

---

## Adding a New Restricted Role

Follow these steps to add a new role with limited access (e.g., "viewer"):

### Step 1: Add Role to Database

```sql
-- Add the new role
INSERT INTO role (id, name, description) VALUES (
  gen_random_uuid(),
  'viewer',
  'Read-only access to selected reports'
);
```

### Step 2: Create Route Guard

```typescript
// src/components/ViewerRoute.tsx
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ViewerRouteProps {
  children: ReactNode;
}

export default function ViewerRoute({ children }: ViewerRouteProps) {
  const { userRole } = useAuth();

  if (userRole === 'viewer') {
    return <Navigate to="/viewer-dashboard" replace />;
  }

  return <>{children}</>;
}
```

### Step 3: Create Simplified Navbar

```typescript
// src/components/ViewerNavbar.tsx
// Copy CoachNavbar.tsx and modify title/branding
```

### Step 4: Create Dashboard Page

```typescript
// src/pages/ViewerDashboardPage.tsx
// Similar to CoachDashboardPage, with reports appropriate for this role
```

### Step 5: Update ProtectedLayout

```typescript
function ProtectedLayout() {
  const { userRole } = useAuth();

  // Map roles to their navbar components
  const getNavbarComponent = () => {
    switch (userRole) {
      case 'coach': return CoachNavbar;
      case 'viewer': return ViewerNavbar;
      default: return Navbar;
    }
  };

  const NavbarComponent = getNavbarComponent();

  return (
    <ProtectedRoute>
      {!isEmbedded && <NavbarComponent />}
    </ProtectedRoute>
  );
}
```

### Step 6: Update RoleBasedRedirect

```typescript
function RoleBasedRedirect() {
  const { userRole } = useAuth();

  switch (userRole) {
    case 'coach':
      return <Navigate to="/coach-dashboard" replace />;
    case 'viewer':
      return <Navigate to="/viewer-dashboard" replace />;
    default:
      return <Navigate to="/master-pipeline" replace />;
  }
}
```

### Step 7: Add Routes and Guards

```typescript
// In App.tsx routes:

// Add new dashboard route
<Route path="viewer-dashboard" element={<ViewerDashboardPage />} />

// Wrap existing routes with BOTH guards if needed
<Route path="master-pipeline" element={
  <CoachRoute>
    <ViewerRoute>
      <KanbanBoard />
    </ViewerRoute>
  </CoachRoute>
} />
```

### Step 8: Create User with New Role

```sql
-- Create auth user in Supabase Dashboard first, then:
INSERT INTO "user" (
  auth_user_id,
  email,
  first_name,
  last_name,
  name,
  ovis_role,
  active
) VALUES (
  'auth-user-uuid-here',
  'user@example.com',
  'First',
  'Last',
  'First Last',
  'viewer',
  true
);
```

---

## Making Reports Read-Only

To make any report support read-only mode:

### 1. Add readOnly Prop

```typescript
interface MyReportProps {
  readOnly?: boolean;
}

export default function MyReport({ readOnly = false }: MyReportProps) {
```

### 2. Conditionally Render Interactive Elements

```typescript
// Hide edit buttons
{!readOnly && (
  <button onClick={handleEdit}>Edit</button>
)}

// Make links non-clickable
{readOnly ? (
  <span className="font-medium text-gray-900">{item.name}</span>
) : (
  <button onClick={() => openDetails(item.id)} className="text-blue-600 hover:underline">
    {item.name}
  </button>
)}

// Hide warning indicators
{!readOnly && warningCount > 0 && (
  <span className="text-orange-500">⚠️ {warningCount}</span>
)}

// Don't render modals/slideouts
{!readOnly && selectedItem && (
  <EditModal item={selectedItem} onClose={() => setSelectedItem(null)} />
)}
```

---

## Admin Access to Restricted Dashboards

Admins can access restricted dashboards via the hamburger menu:

```typescript
// In Navbar.tsx hamburger menu:
<button
  onClick={() => {
    navigate('/coach-dashboard');
    setIsReportsMenuOpen(false);
  }}
  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
>
  🏋️ Coach Dashboard
</button>
```

This allows admins to preview what restricted users see without logging out.

---

## Files Changed for Coach Role

| File | Changes |
|------|---------|
| `src/App.tsx` | Added CoachRoute, CoachNavbar imports; Updated ProtectedLayout; Added RoleBasedRedirect; Wrapped routes with CoachRoute |
| `src/components/CoachRoute.tsx` | New file - Route guard component |
| `src/components/CoachNavbar.tsx` | New file - Simplified navbar |
| `src/pages/CoachDashboardPage.tsx` | New file - Dashboard with report selection |
| `src/components/reports/RobReport.tsx` | Added `readOnly` prop and conditional rendering |
| `src/components/Navbar.tsx` | Added Coach Dashboard to hamburger menu |

---

## Testing Checklist

When adding a new restricted role:

- [ ] Role exists in `role` table
- [ ] Test user created with correct `ovis_role`
- [ ] Route guard redirects to correct dashboard
- [ ] Simplified navbar shows for role
- [ ] Default redirect sends role to their dashboard
- [ ] All protected routes redirect to dashboard
- [ ] Reports display in read-only mode
- [ ] No edit buttons or clickable links visible
- [ ] Admin can access restricted dashboard via menu
- [ ] Sign out works correctly

---

## Related Files

| File | Description |
|------|-------------|
| `src/contexts/AuthContext.tsx` | Provides userRole from database |
| `src/components/ProtectedRoute.tsx` | Base authentication guard |
| `src/components/AdminRoute.tsx` | Admin-only route guard |
| `src/pages/UserManagementPage.tsx` | Admin UI for managing users/roles |

---

## Changelog

| Date | Change |
|------|--------|
| Dec 2024 | Initial implementation of Coach role with restricted access |
| Dec 2024 | Added CoachNavbar, CoachRoute, CoachDashboardPage |
| Dec 2024 | Added readOnly prop to RobReport |
| Dec 2024 | Added Coach Dashboard to admin hamburger menu |

---

*Last Updated: December 2024*
