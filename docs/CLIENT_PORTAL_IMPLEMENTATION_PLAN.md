# Client Portal Implementation Plan

**Created**: January 30, 2026
**Status**: Approved for Development
**Version**: 1.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Authentication & User Management](#authentication--user-management)
3. [Portal Structure & Navigation](#portal-structure--navigation)
4. [Map View](#map-view)
5. [Pipeline View](#pipeline-view)
6. [Detail Sidebar](#detail-sidebar)
7. [Comments/Chat System](#commentschat-system)
8. [Read/Unread Tracking](#readunread-tracking)
9. [Files Integration](#files-integration)
10. [Admin Configuration](#admin-configuration)
11. [Permissions Matrix](#permissions-matrix)
12. [Branding & Theming](#branding--theming)
13. [Database Changes](#database-changes)
14. [Phase 2 Features](#phase-2-features)
15. [Technical Implementation Notes](#technical-implementation-notes)

---

## Executive Summary

The Client Portal is a restricted-access view of the Oculus CRM that allows external clients to:
- View site submits associated with their account(s)
- See property details and files
- Communicate with brokers via a two-tier comment system
- Track their pipeline via map and table views

**Key Principles:**
- Reuse existing components where possible (map, files, etc.)
- Permission-based features (same codebase, different capabilities by role)
- Mobile-ready architecture (mobile UI in Phase 2)
- Minimal data exposure (clients see only what they need)

---

## Authentication & User Management

### User Creation Flow

1. **Contact-Based**: Portal users ARE contacts in the CRM
2. **Enable Portal Access**: Admin/Broker toggles "Portal Access" on a contact record
3. **Invite Email Sent**: System sends invite to contact's email
4. **Password Setup**: User clicks link and sets their own password
5. **Access Granted**: User can now log into the portal

### Authentication Requirements

| Requirement | Specification |
|-------------|---------------|
| Password Rules | 8+ characters, mixed case, at least one number |
| Session Duration | Persists until explicit logout |
| Forgot Password | Self-service flow via email |
| Invite Expiration | TBD (suggest 7 days with resend option) |

### Invite Email Specification

| Field | Value |
|-------|-------|
| From Address | Broker's email (preferred) or noreply@oculusrep.com (fallback) |
| Subject | "You've been invited to the Oculus Customer Portal" |
| Body | "You've been invited to the Oculus Customer Portal, click here to setup your password." |
| Branding | Oculus company logo, simple design |
| Link | Password setup page with secure token |

### Who Can Configure Portal Users

- Admin role
- Broker (Full Access) role

---

## Portal Structure & Navigation

### URL Routing

| Route | Description |
|-------|-------------|
| `/portal` | Portal home (redirects to Map or Pipeline based on preference) |
| `/portal/map` | Map view |
| `/portal/pipeline` | Pipeline table view |
| `/portal/*` | Any other portal routes |

**Unauthorized Access**: If a portal user attempts to access CRM routes (e.g., `/deals`, `/contacts`), redirect to `/portal`.

### Navigation Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ☰ │ Pipeline          │                    │ [Client Logo] [👤▼]│
│   │ (or Map)          │                    │                    │
├───┴───────────────────┴────────────────────┴────────────────────┤
│                                                                  │
│                     Main Content Area                            │
│                     (Map or Pipeline)                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Hamburger Menu** (top left): Toggle between "Pipeline" and "Map" views
- **View Title**: Current view name (just right of hamburger)
- **Client Logo** (top right): Logo of the client being viewed (uploaded per client)
- **User Menu** (far right): User name, avatar (future), logout option

---

## Map View

### Implementation Approach

**CRITICAL**: Reuse the existing map component (`MappingPage.tsx` and related components). Do NOT create a new map component.

### What to Show

| Element | Visible to Client |
|---------|-------------------|
| Site Submit Pins | Yes (filtered by client + status) |
| Property Search Bar | Yes |
| Clustering | Yes |
| Stage Toggle Legend | Yes (client-visible stages only) |
| All Properties Toggle | **NO** |
| Restaurant Trends Toggle | **NO** (Phase 2 consideration) |
| Top Nav Menu Items | **NO** (Properties, Contacts, Deals, etc.) |

### Client-Visible Statuses

Only show site submits with these stages:

1. Submitted-Reviewing
2. Pass
3. Use Declined
4. Use Conflict
5. Not Available
6. Lost / Killed
7. LOI
8. At Lease/PSA
9. Under Contract/Contingent
10. Store Opened

### Data Filtering Logic

```sql
-- Pseudocode for client portal site submit query
SELECT * FROM site_submit
WHERE client_id IN (
  -- Clients this portal user has access to
  SELECT client_id FROM portal_user_client_access
  WHERE user_id = :current_user_id
)
AND submit_stage_id IN (
  -- Client-visible stages
  SELECT id FROM submit_stage WHERE stage_name IN (
    'Submitted-Reviewing', 'Pass', 'Use Declined', 'Use Conflict',
    'Not Available', 'Lost / Killed', 'LOI', 'At Lease/PSA',
    'Under Contract/Contingent', 'Store Opened'
  )
)
```

### Pin Click Behavior

When a client clicks a pin:
1. The Detail Sidebar slides out from the right
2. The map remains visible
3. The pin is highlighted/centered

---

## Pipeline View

### Table Layout

Columns from left to right:

| # | Column | Source Field | Sortable |
|---|--------|--------------|----------|
| 1 | Property Name | property.property_name | Yes |
| 2 | Address | property.address | Yes |
| 3 | Available Sqft | property.available_sqft | Yes |
| 4 | Rent PSF | property.rent_psf | Yes |
| 5 | NNN PSF | property.nnn_psf | Yes |
| 6 | All-in Rent | property.all_in_rent | Yes |
| 7 | Year 1 Rent | site_submit.year_1_rent | Yes |
| 8 | TI | site_submit.ti | Yes |
| 9 | Notes | site_submit.notes | Yes |
| 10 | Status | site_submit.submit_stage_id | Yes |

### Filtering

**Stage Filter Tabs**: Horizontal tabs/chips across the top of the pipeline
- "All Sites" (default - shows all)
- One tab per client-visible status

**Search Box**: Filter by keyword (searches property name, address, notes)

### Unread Indicators

- **Row Highlight**: Subtle background color for rows with new activity
- **Indicator Dot**: Small dot/badge on the row

Unread means:
- User has never viewed this site submit, OR
- New comments since last view, OR
- New files since last view

### Row Click Behavior

When a client clicks a row:
1. Row becomes highlighted/selected
2. Detail Sidebar slides out from right
3. Pipeline table remains visible (sidebar overlays or pushes)

---

## Detail Sidebar

### Shared Component

The Detail Sidebar is the **same component** used in both Map and Pipeline views. It slides out from the right side of the screen.

### Layout

```
┌──────────────────────────────────────┐
│  Property Name                       │
│  123 Main St, Atlanta, GA 30301      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   View on Map / View in Pipeline │  │ ← Orange toggle button
│  └────────────────────────────────┘  │
│                                      │
│  ┌──────┬──────┬──────┐              │
│  │ DATA │ CHAT │FILES │              │ ← Tabs
│  └──────┴──────┴──────┘              │
│                                      │
│  [Tab Content Area]                  │
│                                      │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

### Toggle Button Behavior

| Current View | Button Text | On Click |
|--------------|-------------|----------|
| Pipeline | "View on Map" | Switch main content to Map, center on pin, keep sidebar open |
| Map | "View in Pipeline" | Switch main content to Pipeline, highlight row, keep sidebar open |

### DATA Tab - Fields Displayed

**Site Submit Fields:**

| Field | Display Name | Editable (Broker) |
|-------|--------------|-------------------|
| site_submit_name | Site Name | Yes |
| submit_stage_id | Status | Yes |
| date_submitted | Date Submitted | Yes |
| notes | Notes | Yes |
| delivery_timeframe | Delivery Timeframe | Yes |
| ti | TI | Yes |
| year_1_rent | Year 1 Rent | Yes |
| competitor_data | Competitor Data | Yes |

**Property Fields:**

| Field | Display Name | Editable (Broker) |
|-------|--------------|-------------------|
| property_name | Property Name | Yes |
| address | Address | Yes |
| city | City | Yes |
| state | State | Yes |
| zip | ZIP | Yes |
| available_sqft | Available Sqft | Yes |
| building_sqft | Building Sqft | Yes |
| acres | Acres | Yes |
| asking_lease_price | Asking Lease Price | Yes |
| asking_purchase_price | Asking Purchase Price | Yes |
| rent_psf | Rent PSF | Yes |
| nnn_psf | NNN PSF | Yes |
| all_in_rent | All-in Rent | Yes |

**Note**: All fields are READ-ONLY for client users. Brokers can edit.

### CHAT Tab

See [Comments/Chat System](#commentschat-system) section.

### FILES Tab

See [Files Integration](#files-integration) section.

---

## Comments/Chat System

### Two-Tier Architecture

| Tier | Visibility | Who Can Post |
|------|------------|--------------|
| Internal | Brokers only | Brokers only |
| Client-Visible | Brokers + all client users with access | Brokers + Clients |

### Comment Data Structure

```typescript
interface SiteSubmitComment {
  id: string;
  site_submit_id: string;
  author_id: string;          // user who posted
  content: string;
  visibility: 'internal' | 'client';
  created_at: timestamp;
  updated_at: timestamp;
  updated_by_id: string | null;  // for edit tracking
}
```

### UI Requirements

- Show author name and avatar (future) for each comment
- Show timestamp (relative: "2 hours ago" or absolute if older)
- "Edit" button visible only on own comments
- Clear visual separation between internal and client-visible (for brokers)
- Clients only see client-visible comments
- Input box at bottom with visibility toggle (for brokers)

### Edit Functionality

- Users can only edit their own comments
- Show "edited" indicator with timestamp
- No delete functionality (to preserve audit trail) - or make this configurable

---

## Read/Unread Tracking

### Tracking Table

```sql
CREATE TABLE portal_site_submit_view (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  site_submit_id UUID REFERENCES site_submit(id),
  last_viewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, site_submit_id)
);
```

### What Triggers "Unread"

A site submit is considered "unread" for a user if ANY of:
1. User has never viewed it (no record in tracking table)
2. `site_submit.updated_at` > `last_viewed_at`
3. Any comment with `created_at` > `last_viewed_at`
4. Any file added to property with `created_at` > `last_viewed_at`

### What Triggers "Read"

When user opens the Detail Sidebar for a site submit:
1. Upsert record in `portal_site_submit_view`
2. Set `last_viewed_at` = NOW()

### Visual Indicators

**Pipeline Table:**
- Row background: Subtle highlight color (e.g., light blue tint)
- Indicator dot: Small colored dot in first column or dedicated column

---

## Files Integration

### Source

Files come from Dropbox integration on the **Property** record (not site submit).

### Implementation

Reuse the existing Dropbox files component from the property pin details sidebar.

### Permissions

| Role | View | Download | Upload/Add |
|------|------|----------|------------|
| Client | Yes | Yes | No |
| Broker | Yes | Yes | Yes |

---

## Admin Configuration

### Contact Record - Portal Access Section

Add a new section to the Contact detail view/form:

```
┌─ Portal Access ──────────────────────────────────────┐
│                                                       │
│  ☑ Enable Portal Access                              │
│                                                       │
│  Invite Status: ● Pending / ✓ Accepted / Not Sent   │
│  [Resend Invite Button]                              │
│                                                       │
│  Client Access:                                       │
│  ☑ ABC Company                                       │
│  ☑ XYZ Corporation                                   │
│  ☐ 123 Industries                                    │
│                                                       │
│  (Shows clients from contact_client_relation)        │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### User Management Screen

New admin screen: `/admin/portal-users` (or similar)

**Features:**
- List all portal users (contacts with portal access enabled)
- Show: Name, Email, Invite Status, Client Access, Last Login
- Quick actions: Resend invite, Disable access, Edit client access
- Search/filter capabilities
- Bulk operations (future)

### Client Record - Logo Upload

Add a new field to the Client record:

| Field | Type | Description |
|-------|------|-------------|
| logo_url | string | URL to uploaded client logo |

**Upload Mechanism**: Use existing file upload pattern (Dropbox or direct upload to storage)

---

## Permissions Matrix

### Role Definitions

| Role | Description |
|------|-------------|
| client | External client user with portal access |
| broker | Internal broker with portal access (elevated permissions) |
| broker_full | Broker with full access (can configure portal users) |
| admin | Administrator (full system access) |

### Feature Access Matrix

| Feature | Client | Broker | Broker Full | Admin |
|---------|--------|--------|-------------|-------|
| View portal | ✓ | ✓ | ✓ | ✓ |
| View site submits (own clients) | ✓ | ✓ | ✓ | ✓ |
| View site submits (all clients) | ✗ | ✓ | ✓ | ✓ |
| Edit site submit fields | ✗ | ✓ | ✓ | ✓ |
| View internal comments | ✗ | ✓ | ✓ | ✓ |
| Post internal comments | ✗ | ✓ | ✓ | ✓ |
| View client-visible comments | ✓ | ✓ | ✓ | ✓ |
| Post client-visible comments | ✓ | ✓ | ✓ | ✓ |
| Edit own comments | ✓ | ✓ | ✓ | ✓ |
| View files | ✓ | ✓ | ✓ | ✓ |
| Download files | ✓ | ✓ | ✓ | ✓ |
| Upload files | ✗ | ✓ | ✓ | ✓ |
| Configure portal users | ✗ | ✗ | ✓ | ✓ |
| Access CRM routes | ✗ | ✓ | ✓ | ✓ |

---

## Branding & Theming

### Oculus Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Dark Navy | #011742 | Primary dark, headers |
| Navy | #104073 | Secondary, buttons |
| Blue | #34518a | Accents, links |
| Light Blue | #9bbadb | Backgrounds, highlights |
| White | #ffffff | Text, backgrounds |

### Branding Elements

| Element | Specification |
|---------|---------------|
| Company Logo | Oculus logo in header (subtle) |
| Client Logo | Top right corner for identification |
| Favicon | Oculus favicon |
| Portal Name | "Oculus Customer Portal" |

### Design Principles

- Keep branding subtle, not overwhelming
- Clean, professional appearance
- Consistent with existing CRM styling where appropriate
- Mobile-ready layouts (even if mobile UI is Phase 2)

---

## Database Changes

### New Tables

```sql
-- Portal user view tracking
CREATE TABLE portal_site_submit_view (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, site_submit_id)
);

-- Site submit comments
CREATE TABLE site_submit_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (visibility IN ('internal', 'client')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by_id UUID REFERENCES auth.users(id),
  CONSTRAINT content_not_empty CHECK (char_length(content) > 0)
);

-- Portal user client access (explicit grants)
CREATE TABLE portal_user_client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  granted_by_id UUID REFERENCES auth.users(id),
  granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(contact_id, client_id)
);
```

### Modified Tables

```sql
-- Add to contact table
ALTER TABLE contact ADD COLUMN portal_access_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE contact ADD COLUMN portal_invite_status VARCHAR(20) DEFAULT 'not_sent'
  CHECK (portal_invite_status IN ('not_sent', 'pending', 'accepted'));
ALTER TABLE contact ADD COLUMN portal_invite_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contact ADD COLUMN portal_invite_token VARCHAR(255);
ALTER TABLE contact ADD COLUMN portal_invite_expires_at TIMESTAMP WITH TIME ZONE;

-- Add to client table
ALTER TABLE client ADD COLUMN logo_url TEXT;
```

### Row Level Security (RLS)

Extend existing RLS policies to support portal users. Reference: `/docs/ROW_LEVEL_SECURITY_STRATEGY.md`

Key policies needed:
- Portal users can only see site_submits where client_id is in their granted access
- Portal users can only see client-visible comments
- Portal users cannot see internal data (commissions, payments, etc.)

---

## Phase 2 Features

These features are documented for future implementation:

### Mobile Responsive Design
- Pipeline table becomes card-based list on mobile
- Map legend collapses to dropdown/modal
- Detail sidebar slides up from bottom as sheet
- Touch-optimized controls

### Broker Notification System
When submitting a site, broker options:
1. Send individual email with direct link to that site submit
2. Send general link to portal
3. Don't send anything (for batch operations)

### Deep Links
- URLs that go directly to a specific site submit
- Format: `/portal/site-submit/:id`
- On login, redirect to the deep-linked item

### Ping/Feedback Request
- Broker can "ping" client users requesting feedback on a site submit
- Creates notification/badge on the site submit
- Optional email notification

### Restaurant Trends Toggle
- Consider adding to portal in future phase

---

## Technical Implementation Notes

### Component Reuse Strategy

| Existing Component | Portal Usage |
|-------------------|--------------|
| MappingPage.tsx | Base map view, configure for portal mode |
| SiteSubmitLayer.tsx | Reuse with portal filters applied |
| Property search | Reuse as-is |
| Clustering | Reuse as-is |
| Stage legend | Reuse, filter to client-visible stages |
| Dropbox files component | Reuse in FILES tab |

### New Components Needed

| Component | Description |
|-----------|-------------|
| PortalLayout | Wrapper with portal nav, client logo, user menu |
| PortalPipelineView | Table view with filtering, sorting, search |
| PortalDetailSidebar | Shared sidebar with DATA/CHAT/FILES tabs |
| PortalComments | Two-tier comment system |
| PortalUserAdmin | Contact portal access section |
| PortalUserManagement | Admin screen for all portal users |
| ClientLogoUpload | Logo upload component for client record |

### Route Structure

```typescript
// Portal routes (protected, portal users only)
/portal                    → PortalHome (redirect to default view)
/portal/map               → PortalMapView
/portal/pipeline          → PortalPipelineView

// Admin routes (protected, admin/broker-full only)
/admin/portal-users       → PortalUserManagement
```

### State Management

Consider using React Context for portal-specific state:
- Current user's client access list
- Selected site submit
- Current view (map/pipeline)
- Unread counts

### Performance Considerations

- Lazy load comments when CHAT tab is selected
- Lazy load files when FILES tab is selected
- Paginate pipeline table for large datasets
- Cache client access list on login
- Use optimistic updates for comment posting

---

## Implementation Checklist

### Phase 1 - Foundation
- [ ] Database migrations (new tables, modified tables)
- [ ] RLS policies for portal users
- [ ] Portal user authentication flow
- [ ] Invite email system

### Phase 2 - Core Views
- [ ] Portal layout component with navigation
- [ ] Map view (portal mode)
- [ ] Pipeline view with table
- [ ] Detail sidebar structure

### Phase 3 - Features
- [ ] DATA tab with fields
- [ ] CHAT tab with two-tier comments
- [ ] FILES tab with Dropbox integration
- [ ] Read/unread tracking
- [ ] Stage filtering (map legend + pipeline tabs)

### Phase 4 - Admin
- [ ] Contact record portal access section
- [ ] Portal user management screen
- [ ] Client logo upload

### Phase 5 - Polish
- [ ] Branding and theming
- [ ] Error handling and edge cases
- [ ] Testing with real client data
- [ ] Documentation and training

---

## Appendix: Reference Screenshots

The following screenshots were used as UX references:
- `Screen Shots/SCR-20260130-mlgv.png` - Pipeline view layout
- `Screen Shots/SCR-20260130-mlsm.png` - Pipeline with detail sidebar
- `Screen Shots/SCR-20260130-mmmm.png` - Map with detail sidebar
- `Screen Shots/SCR-20260130-mtzw.png` - Stage toggle legend

---

*Document generated from requirements interview on January 30, 2026*
