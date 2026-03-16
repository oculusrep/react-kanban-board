# Document Handoff Tracking

Track LOI and Lease documents as they pass between "Us" (tenant/broker) and "LL" (landlord) during negotiations.

**Created:** March 16, 2026
**Status:** ✅ Implemented (Phases 1-3 Complete)

---

## Overview

During pipeline meetings, brokers need to quickly see who currently has the ball on LOI and Lease negotiations. This feature adds a clickable toggle on kanban cards and deal pages to track document handoffs, with full history for analytics.

---

## User Stories

1. **As a broker in a pipeline meeting**, I want to quickly see which deals are waiting on the landlord vs. waiting on us, so I know where to focus follow-up efforts.

2. **As a broker**, I want to toggle the document holder with one click, so I can update status in real-time during meetings.

3. **As a broker**, I want to backdate a handoff if I'm updating the system after the fact, so the timeline remains accurate.

4. **As a manager**, I want to see the full history of document handoffs, so I can analyze negotiation patterns and identify bottlenecks.

5. **As a manager**, I want to pull stats on average time clients/landlords hold documents, so I can set expectations and identify slow actors.

---

## UI Components

### 1. Kanban Card Badge (LOI & At Lease/PSA columns only)

**No status yet:**
- No badge displayed (clean card)

**With Us:**
- Teal/blue pill: `Us • 5d`
- Click to toggle to LL

**With Landlord:**
- Amber/orange pill: `LL • 3d`
- Click to toggle to Us

**Behavior:**
- Single click toggles holder, sets date to today
- Optimistic UI update, saves to database
- Badge only appears after first toggle (manual start)

### 2. Kanban Three-Dot Menu Addition

New menu item: **"Edit Handoff Date"**
- Opens date picker popover
- Allows backdating the current handoff
- Only visible when a handoff status exists

### 3. Deal Page Header

**Display format:** `LOI with LL • 3d (5 turns)`

- Shows current document type (based on stage)
- Shows current holder with days count
- Shows total turn count in parentheses
- Clickable to toggle (same as kanban)
- Small calendar icon or click on days to edit date

**When no status:** Shows subtle "Track handoff" link or nothing

### 4. Deal Sidebar - Handoff History Section

**Location:** Collapsible section in deal sidebar

**Header:** "Document Handoffs" with expand/collapse

**Table format:**
| Date | Document | With | Days |
|------|----------|------|------|
| Mar 15 | Lease | LL | 4 |
| Mar 11 | LOI | LL | 2 |
| Mar 9 | LOI | Us | 5 |
| Mar 4 | LOI | LL | 3 |
| Mar 1 | LOI | Us | — |

- Sorted newest first
- "Days" shows duration held before next handoff
- Last row shows "—" for days (still in progress or was final)
- Click row to edit date (future enhancement)

---

## Database Schema

### New Table: `document_handoff`

```sql
CREATE TABLE document_handoff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('LOI', 'Lease')),
  holder TEXT NOT NULL CHECK (holder IN ('us', 'll')),
  changed_at DATE NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- For tracking edits
  original_changed_at DATE,  -- If backdated, stores the original toggle date

  CONSTRAINT valid_document_type CHECK (document_type IN ('LOI', 'Lease')),
  CONSTRAINT valid_holder CHECK (holder IN ('us', 'll'))
);

-- Indexes
CREATE INDEX idx_document_handoff_deal_id ON document_handoff(deal_id);
CREATE INDEX idx_document_handoff_deal_date ON document_handoff(deal_id, changed_at DESC);

-- RLS
ALTER TABLE document_handoff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view handoffs for deals they can access"
  ON document_handoff FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM deal WHERE deal.id = document_handoff.deal_id
  ));

CREATE POLICY "Users can insert handoffs"
  ON document_handoff FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update handoffs"
  ON document_handoff FOR UPDATE
  USING (auth.uid() IS NOT NULL);
```

### Deal Table - Denormalized Current Status

For fast kanban queries, store current status on deal:

```sql
ALTER TABLE deal ADD COLUMN current_handoff_holder TEXT CHECK (current_handoff_holder IN ('us', 'll'));
ALTER TABLE deal ADD COLUMN current_handoff_date DATE;
ALTER TABLE deal ADD COLUMN current_handoff_document TEXT CHECK (current_handoff_document IN ('LOI', 'Lease'));

COMMENT ON COLUMN deal.current_handoff_holder IS 'Current document holder: us or ll';
COMMENT ON COLUMN deal.current_handoff_date IS 'Date document changed to current holder';
COMMENT ON COLUMN deal.current_handoff_document IS 'Current document type being tracked';
```

### Trigger: Sync Current Handoff to Deal

```sql
CREATE OR REPLACE FUNCTION sync_current_handoff()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE deal
  SET
    current_handoff_holder = NEW.holder,
    current_handoff_date = NEW.changed_at,
    current_handoff_document = NEW.document_type
  WHERE id = NEW.deal_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_current_handoff
  AFTER INSERT ON document_handoff
  FOR EACH ROW
  EXECUTE FUNCTION sync_current_handoff();
```

---

## Implementation Plan

### Phase 1: Database Migration ✅
1. Create `document_handoff` table
2. Add denormalized columns to `deal` table
3. Create sync trigger
4. Add RLS policies

**Migration:** `supabase/migrations/20260316_document_handoff_tracking.sql`

### Phase 2: Kanban Integration ✅
1. Update `useKanbanData` hook to fetch handoff fields
2. Create `HandoffBadge` component (clickable pill)
3. Add badge to kanban card (LOI/Lease columns only)
4. Implement toggle click handler with optimistic update
5. Add "Edit Handoff Date" to three-dot menu
6. Create `HandoffDatePicker` modal component

**Files:**
- `src/hooks/useKanbanData.ts` - Added handoff fields to query
- `src/components/deals/HandoffBadge.tsx` - Clickable pill component
- `src/components/deals/HandoffDatePicker.tsx` - Date picker modal
- `src/components/KanbanBoard.tsx` - Badge and menu integration

### Phase 3: Deal Page Integration ✅
1. Add handoff status to deal page header
2. Make header badge clickable with same toggle behavior
3. Add discrete date edit access (calendar icon)
4. Create `HandoffHistory` collapsible section component
5. Add to deal sidebar

**Files:**
- `src/components/DealHeaderBar.tsx` - Badge in header next to stage
- `src/components/deals/HandoffHistory.tsx` - Collapsible history section
- `src/components/DealSidebar.tsx` - Added HandoffHistory section
- `src/lib/types.ts` - Added handoff fields to DealCard interface

### Phase 4: Analytics Prep (Future)
1. Create view for handoff statistics by client
2. Create view for handoff statistics by landlord (if tracked)
3. Add to CFO tools for reporting

---

## Document Type Determination

The document type is automatically determined by the deal's current stage:

| Stage | Document Type |
|-------|---------------|
| Negotiating LOI | LOI |
| At Lease / PSA | Lease |
| At Lease/PSA | Lease |

If the deal is in any other stage, the handoff toggle is not shown.

---

## Color Scheme

| Holder | Background | Text | Tailwind Classes |
|--------|------------|------|------------------|
| Us | Teal/Cyan | Dark Teal | `bg-cyan-100 text-cyan-800` |
| LL | Amber | Dark Amber | `bg-amber-100 text-amber-800` |
| None | — | — | (no badge shown) |

---

## Edge Cases

### Deal moves between LOI and Lease stages
- History preserves all records with their document types
- Current handoff status clears when entering new stage? **OR**
- Current status persists and document type updates?

**Decision:** Current status clears when moving to a new tracked stage. User must re-toggle to start tracking the new document. This keeps data clean and intentional.

### Deal moves to non-tracked stage (Booked, etc.)
- Handoff badge no longer displays
- History remains intact for reporting
- Current handoff fields remain (for reference) but badge hidden

### Backdating creates overlap
- If user backdates to before a previous handoff, we allow it
- History table sorts by `changed_at` regardless of insert order
- Could add validation later if needed

---

## Files to Create/Modify

### New Files
```
src/components/deals/HandoffBadge.tsx        # Clickable pill component
src/components/deals/HandoffHistory.tsx      # History table for sidebar
src/components/deals/HandoffDatePicker.tsx   # Date picker popover
supabase/migrations/YYYYMMDD_document_handoff_tracking.sql
```

### Modified Files
```
src/hooks/useKanbanData.ts                   # Add handoff fields to query
src/components/KanbanBoard.tsx               # Add badge + menu item
src/pages/DealDetailsPage.tsx                # Add header badge + sidebar section
src/lib/types.ts                             # Add handoff types to DealCard
```

---

## Future Enhancements

- [ ] Activity feed integration (show handoffs in deal activity stream)
- [ ] Client analytics dashboard (avg LOI/Lease time per client)
- [ ] Landlord tracking (if landlord contacts are linked)
- [ ] Notifications when document has been with LL > X days
- [ ] Bulk update from kanban (select multiple, toggle all)

---

---

## Deployment Notes

### Run Database Migration

After deploying, run the migration to create the database schema:

```bash
supabase db push
```

Or apply the migration directly:

```sql
-- Run contents of supabase/migrations/20260316_document_handoff_tracking.sql
```

### Testing

1. Navigate to Master Pipeline (kanban board)
2. Find a deal in "Negotiating LOI" or "At Lease/PSA" column
3. Click the deal card - no badge should appear initially
4. Insert a test handoff record manually:
   ```sql
   INSERT INTO document_handoff (deal_id, document_type, holder, changed_at)
   VALUES ('your-deal-id', 'LOI', 'us', CURRENT_DATE);
   ```
5. Refresh the page - the "Us • 0d" badge should appear
6. Click the badge to toggle to "LL"
7. Use three-dot menu "Edit Handoff Date" to backdate
8. Check deal page header and sidebar for history

---

*Last updated: 2026-03-16*
