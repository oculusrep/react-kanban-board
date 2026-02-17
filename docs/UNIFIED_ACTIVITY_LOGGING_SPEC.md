# Unified Activity Logging System Spec

**Created:** 2026-02-17
**Status:** Planned
**Priority:** Medium

---

## Problem Statement

Currently, prospecting activities are logged to two different tables depending on where the user is in the app:

| Location | Table | Fields |
|----------|-------|--------|
| Hunter Workspace | `prospecting_activity` | Simple: activity_type (enum), notes, email_subject |
| Contact Page | `activity` | Complex: activity_type_id (FK), description, Salesforce sync fields |

This causes:
1. **Split data** - Activities logged on Contact page don't appear in Hunter scorecard without dual-table queries
2. **Inconsistent UX** - Different logging interfaces in different places
3. **Complex queries** - Scorecard must query both tables and normalize data
4. **Maintenance burden** - Two code paths to maintain

---

## Proposed Solution

Unify on `prospecting_activity` table for all prospecting-related activities, using the Hunter `ActivityLogButtons` component everywhere.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Activity Logging Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Hunter Workspace ─┐                                            │
│                    │                                            │
│  Contact Page ─────┼──► ActivityLogButtons ──► prospecting_activity
│                    │         component                          │
│  ContactDetailDrawer┘                                           │
│                                                                  │
│  CRM Tasks ────────────► AddTaskModal ──────► activity          │
│  (non-prospecting)                            (for SF sync)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Table Responsibilities

| Table | Purpose | Use Cases |
|-------|---------|-----------|
| `prospecting_activity` | Quick activity logging for prospecting | Email, LinkedIn, SMS, Voicemail, Call, Meeting touches |
| `activity` | CRM tasks with full metadata | Salesforce sync, task management, deal activities |

---

## Implementation Plan

### Phase 1: Refactor Contact Page Activity Logging

**Files to Modify:**

1. **`src/pages/ContactDetailPage.tsx`**
   - Remove or hide the existing `GenericActivityTab` for prospecting activities
   - Add `ActivityLogButtons` component from Hunter
   - Wire up to `prospecting_activity` table

2. **`src/components/hunter/ActivityLogButtons.tsx`**
   - Make standalone/reusable (remove Hunter-specific dependencies)
   - Accept `contactId` and optional `targetId` as props
   - Move to `src/components/shared/` or `src/components/activity/`

3. **`src/components/contact/ContactDetailDrawer/ContactDetailDrawer.tsx`**
   - Already uses `useContactTimeline` hook which reads from both tables
   - Update `logActivity` to write to `prospecting_activity`

**New Component Props:**
```typescript
interface ActivityLogButtonsProps {
  contactId: string;
  targetId?: string | null;
  onActivityLogged?: (activity: ProspectingActivity) => void;
  variant?: 'full' | 'compact'; // full = labels, compact = icons only
  className?: string;
}
```

### Phase 2: Data Migration (Optional)

If historical data from `activity` table needs to appear in Hunter:

```sql
-- Migration: Copy prospecting activities from activity to prospecting_activity
INSERT INTO prospecting_activity (contact_id, target_id, activity_type, notes, created_at, created_by)
SELECT
  a.contact_id,
  a.target_id,
  CASE
    WHEN at.name ILIKE '%call%' OR a.completed_call THEN 'call'
    WHEN at.name ILIKE '%email%' THEN 'email'
    WHEN at.name ILIKE '%meeting%' OR a.meeting_held THEN 'meeting'
    WHEN at.name ILIKE '%linkedin%' THEN 'linkedin'
    WHEN at.name ILIKE '%sms%' OR at.name ILIKE '%text%' THEN 'sms'
    WHEN at.name ILIKE '%voicemail%' THEN 'voicemail'
    ELSE 'call' -- default fallback
  END as activity_type,
  a.description as notes,
  a.created_at,
  a.created_by_id as created_by
FROM activity a
LEFT JOIN activity_type at ON a.activity_type_id = at.id
WHERE a.is_prospecting = true
  AND a.contact_id IS NOT NULL
  AND NOT EXISTS (
    -- Avoid duplicates
    SELECT 1 FROM prospecting_activity pa
    WHERE pa.contact_id = a.contact_id
      AND pa.created_at = a.created_at
  );
```

### Phase 3: Simplify Scorecard Query

After migration, revert ProspectingWorkspace scorecard to single-table query:

```typescript
// Before (current - dual table)
const { data: prospectingData } = await supabase
  .from('prospecting_activity')
  .select('...');

const { data: activityData } = await supabase
  .from('activity')
  .select('...')
  .eq('is_prospecting', true);

// After (unified)
const { data } = await supabase
  .from('prospecting_activity')
  .select('contact_id, activity_type, created_at, hidden_from_timeline')
  .gte('created_at', todayStart);
```

---

## Files Affected

### Must Modify
- `src/pages/ContactDetailPage.tsx` - Add ActivityLogButtons
- `src/components/hunter/ActivityLogButtons.tsx` - Make reusable
- `src/components/hunter/ProspectingWorkspace.tsx` - Simplify scorecard (Phase 3)

### May Modify
- `src/components/GenericActivityTab.tsx` - Hide for prospecting contacts or deprecate
- `src/components/LogCallModal.tsx` - May become obsolete for prospecting

### New Files (Optional)
- `src/components/shared/ActivityLogButtons.tsx` - If extracted from hunter/
- `supabase/migrations/YYYYMMDD_migrate_prospecting_activities.sql`

---

## Rollback Plan

The current dual-query approach in ProspectingWorkspace works. If issues arise:
1. Keep both tables
2. Continue querying both in scorecard
3. No data loss since we're copying, not moving

---

## Success Criteria

1. Activities logged from Contact page appear in Hunter scorecard immediately
2. Single source of truth for prospecting activities (`prospecting_activity`)
3. Consistent activity logging UI across Hunter and Contact pages
4. Simplified codebase with single query path

---

## Questions to Resolve

1. **Historical data**: Do we need to migrate existing `activity` records, or start fresh?
2. **Salesforce sync**: Do prospecting activities need to sync to Salesforce? If so, we may need a trigger.
3. **CRM tasks**: Should the `activity` table still be used for non-prospecting CRM tasks (follow-up reminders, deal tasks)?

---

## Related Documentation

- [HUNTER_PROSPECTING_SYSTEM.md](./HUNTER_PROSPECTING_SYSTEM.md) - Hunter system overview
- [PROSPECTING_SYSTEM_SPEC.md](./PROSPECTING_SYSTEM_SPEC.md) - Full technical specification
