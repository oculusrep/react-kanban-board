# Broker Limited Role Specification

**Status:** In Progress — spec interview paused
**Last Updated:** 2026-04-20
**Target User:** Greg Bennett (first broker_limited user — not computer savvy, needs a clean/simple UI)

---

## Design Principles

1. **Simplicity first** — strip the UI down to only what this broker needs day-to-day. Too many options will be confusing.
2. **Configuration over code** — leverage the existing permission system (role permissions + user-level JSONB overrides) so everything can be toggled from User Management admin UI.
3. **No schema changes for deal filtering** — use `deal_team_ids` array in the user's JSONB `permissions` field to map which deal teams a broker belongs to.

---

## Existing Infrastructure

The system already has everything needed:

- **`ovis_role`** column on `user` table — `broker_limited` value already defined
- **`role` table** with JSONB `permissions` field (147+ granular permissions across 13 categories)
- **User-level permission overrides** via JSONB `permissions` field on `user` table
- **`usePermissions` hook** with `hasPermission()`, `hasAnyPermission()`, `hasAllPermissions()`
- **Admin UI** for editing roles and per-user permission overrides

---

## Deal Filtering Approach

### Problem
`deal_team_id` on the deal table points to a `deal_team` lookup table with labels like "Mike & Greg", "Mike & Arty", etc. A single broker can appear in multiple deal team combinations.

### Solution
Add a `deal_team_ids` array to the user's JSONB `permissions` field:

```json
{
  "deal_team_ids": [3, 7, 12],
  "can_view_all_deals": false
}
```

- Frontend queries filter deals by `deal_team_id IN (user's deal_team_ids)`
- When a new deal team combination is created involving this broker, admin adds that ID to their array
- No schema changes required

---

## Navigation Visibility

### SHOW (broker_limited)
| Nav Item | Notes |
|----------|-------|
| Master Pipeline | Filtered to their deal teams only |
| Map | Full access |
| Deals | Search, view, edit — filtered to their deal teams |
| Properties | Search, view, edit |
| Contacts | Search, view, edit |
| Tasks | Their tasks only |

### HIDE (broker_limited)
| Nav Item | Reason |
|----------|--------|
| Site Submits | Chinese wall — brokers don't submit sites |
| Assignments | Not used by this role, reduces clutter |
| Clients | Visibility controlled separately (see Chinese Wall below) |
| Reports | Not needed |
| Rob Report | Not needed |
| Payments page | Not needed (but can see payment status within deals) |
| User Management | Admin only |
| KPI Dashboard | Not needed |
| Coach Dashboard | Not needed |
| Goal Dashboard | Not needed |
| Cashflow Dashboard | Not needed |
| Notes | Not needed |
| Prospecting | Not needed |
| Hunter AI | Not needed |
| Finance | Not needed |
| Gmail Integration | Not needed |
| Portal Email Template | Not needed |
| Client Portal | Not needed |

### Implementation
Add top-level visibility permission flags (e.g., `can_view_site_submits`, `can_view_assignments`, etc.) so each major nav item can be shown/hidden per role from the admin UI. This is more flexible than hardcoding role checks.

---

## Payment Permissions

| Action | broker_limited | admin |
|--------|---------------|-------|
| View payment status (paid/unpaid, date, amount) | Yes | Yes |
| Toggle payment checkboxes (triggers QuickBooks sync) | **No** | Yes |

- Use `can_view_financials: true` + `can_manage_payments: false`
- UI disables/hides payment checkboxes based on permission

---

## Invoicing

- Broker can create and send invoices for their deals only
- Cannot check payment boxes that trigger QuickBooks
- *(Details still need to be fleshed out — paused before this was fully specced)*

---

## Chinese Wall — Client-Level Access Restriction

### Problem
Some clients have conflicts of interest. Certain brokers must not see ANY data related to a specific client — deals, properties, contacts, site submits, files.

### Solution
Admin-controlled restricted access on the client record:

- Add a field to the client table (e.g., JSONB): `restricted_access: { enabled: true, allowed_user_ids: ["uuid1", "uuid2"] }`
- When `enabled: false` (default) — normal permission rules apply, no restriction
- When `enabled: true` — only users in `allowed_user_ids` (plus admin) can see the client and ALL associated records
- Walled-off users **cannot see the client at all** — it's completely invisible, not just blocked
- This filters out of: client lists, deal queries, property queries, contact queries, search results, site submits

### Why this approach
- It's the exception, not the rule — most clients won't need a wall
- Admin controls it (the one who knows about conflicts)
- No overhead for normal client setup
- Simple to implement with query-level filtering

---

## Open Questions (to resume later)

1. **Deal detail view** — Which tabs/sections within a deal should broker_limited see? Which fields should be read-only or hidden (commission %, house split, deal value)?
2. **Invoicing workflow** — Exact permissions for invoice creation/sending within deals
3. **Property access** — Can they see all properties or only properties tied to their deals?
4. **Contact access** — Can they see all contacts or only contacts tied to their deals/clients?
5. **Task scope** — Only their own tasks, or tasks related to their deals?
6. **Map view** — All properties on the map, or filtered to their deals?
7. **Nav permission flags** — Finalize the list of top-level `can_view_*` permissions to add to the permissions system
8. **Chinese wall implementation** — Exact field structure and query filtering approach
9. **Mobile view** — Same restrictions apply to the mobile sidebar nav?
