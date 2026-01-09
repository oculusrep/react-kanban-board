# Notes System Planning

## Status: Planning Phase

This document captures the discussion and planning for a new Notes/Activity system. Implementation is on hold pending further requirements gathering.

---

## Related Documents

- [NOTES_SPEC_FROM_GEMINI.MD](./NOTES_SPEC_FROM_GEMINI.MD) - Technical spec from Gemini

---

## Requirements Summary

### Core Functionality
- Free-form or hybrid notes (not strictly structured like tasks/calls)
- Chat-like UX for quick, low-friction note entry
- AI-ready structure for future summarization features

### Entity Support
| Entity | Note Type | Visibility |
|--------|-----------|------------|
| Deals | Internal only | Staff only |
| Properties | Internal only | Staff only |
| Prospects | Internal only | Staff only |
| Site Submits | Collaborative | Staff + Client users |

### UX Concerns Raised
- **Tab fatigue**: Many detail views already have too many tabs
- **Map sidebar conflict**: Notes panel shouldn't interfere with map views
- **Low friction**: Should be as easy as Slack/chat to add a quick note

---

## Gemini Spec Review

### What's Good
1. **Separate `notes` table** - Correct approach. Keeps narrative data separate from structured activities (tasks, calls) for cleaner AI summarization.
2. **`metadata jsonb`** - Future-proofs for AI features without schema changes.
3. **RLS policies** - Well-thought-out client visibility rules.
4. **Realtime** - Essential for collaborative Site Submit notes.

### Concerns / Gaps Identified

#### 1. RLS Policy Gap
The spec only shows SELECT policies. Need INSERT/UPDATE/DELETE policies:
```sql
-- Staff can insert/update their own notes
-- Clients should be able to add notes to their site submits (is_internal = false only)
```

#### 2. "Ghost Bubble" Complexity
The floating bubble that persists after closing the slideout adds significant complexity:
- State management across components
- Z-index conflicts with map/other UI
- Mobile responsiveness challenges

**Recommended alternative**: Auto-save drafts to localStorage keyed by entity ID. When you reopen the slideout, the draft is restored. No floating UI needed.

#### 3. Edit/Delete Not Addressed
Options to consider:
- No editing (Slack-style, immutable history)
- Time-limited editing (e.g., 5 minutes)
- Full edit capability with edit history

#### 4. Missing Database Indexes
```sql
CREATE INDEX idx_notes_deal ON notes(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_notes_property ON notes(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX idx_notes_prospect ON notes(prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX idx_notes_site_submit ON notes(site_submit_id) WHERE site_submit_id IS NOT NULL;
```

---

## Open Decision Points

### 1. Ghost State (Gemini Q1)
When you navigate away from a record with a half-written note:
- **Option A**: Auto-save as draft (recommended - simpler UX)
- **Option B**: Stay open as floating bubble until sent

### 2. Activity Feed Interleaving (Gemini Q2)
Should notes also appear in the Activity Timeline tab?
- **Option A**: Yes, show notes in Activity Timeline (recommended - single source of truth)
- **Option B**: Keep notes strictly in their own floating window

### 3. Edit/Delete Policy
- **Option A**: No editing (immutable history)
- **Option B**: Time-limited editing (5 min window)
- **Option C**: Full editing with history tracking

---

## Technical Context (For Future Implementation)

### Existing Activity System
The app has an `activity` table with polymorphic associations:
- Types: `task`, `logged_call`, `email`
- Foreign keys: `deal_id`, `property_id`, `contact_id`, `prospect_id`, `site_submit_id`

### Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth with user profiles
- **Real-time**: Supabase Realtime subscriptions

### User Types
- **Internal users**: Company staff (full access)
- **Client users**: External users who can view/collaborate on Site Submits

### Relevant Files
- `src/types/activity.ts` - Activity type definitions
- `src/services/activityService.ts` - Activity CRUD operations
- `src/components/activities/` - Activity UI components

---

## Next Steps

1. Decide on the three open decision points above
2. Refine the Gemini spec with missing RLS policies and indexes
3. Design the UI component placement (dock vs inline vs tab)
4. Implement database migration
5. Build components: NoteStream, NoteInput, NoteDock
6. Add real-time subscriptions
7. Integrate with existing slideout panels

---

*Last updated: January 9, 2026*
