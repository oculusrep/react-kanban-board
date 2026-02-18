# Response Tracking System Spec

**Created:** 2026-02-17
**Status:** Planned
**Priority:** High

---

## Overview

Track prospect responses to measure engagement and "connections" separately from outreach volume.

---

## Metrics Definitions

### Outreach (things you initiate)
- Emails sent
- LinkedIn messages
- SMS messages
- Voicemails left
- Call attempts (connects + voicemails)

### Connections (two-way engagement)
- Call Connects (already tracked via `completed_call=true`)
- Meetings Held (already tracked)
- Email Responses (manually logged)
- LinkedIn Responses (manually logged)
- SMS Responses (manually logged)
- Return Calls (manually logged - they called you back)

---

## Data Model

### New Activity Types

Add to `prospecting_activity.activity_type` enum:

```sql
-- Response types (inbound engagement)
'email_response'     -- They replied to an email
'linkedin_response'  -- They replied on LinkedIn
'sms_response'       -- They replied via SMS
'return_call'        -- They called back
```

### Fields Used

Each response record in `prospecting_activity`:
- `activity_type` - One of the response types above
- `created_at` - When the response was received (editable, defaults to now)
- `notes` - Optional details about the response
- `contact_id` - The contact who responded
- `target_id` - The target company (optional)
- `email_subject` - For email responses, optionally capture subject line

---

## UI Components

### 1. Response Log Buttons

Add a "Responses" section to `ActivityLogButtons.tsx`:

```
Log Activity:
[Email] [LinkedIn] [SMS] [Voicemail] [Call] [Meeting]

Log Response:
[Email Reply] [LinkedIn Reply] [SMS Reply] [Return Call]
```

Response buttons have a different color scheme (green) to distinguish from outreach (blue).

### 2. Response Log Modal

When clicking a response button, show a modal with:

```
┌─────────────────────────────────────────────┐
│ Log Email Response                     [X]  │
├─────────────────────────────────────────────┤
│                                             │
│ Response Date                               │
│ ┌─────────────────────────────────────────┐ │
│ │ Feb 17, 2026  [calendar icon]           │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Notes (optional)                            │
│ ┌─────────────────────────────────────────┐ │
│ │ They're interested in 2 locations...   │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│              [Cancel]  [Save Response]      │
└─────────────────────────────────────────────┘
```

### 3. Updated Scorecard

Redesign scorecard to show both Outreach and Connections:

```
┌─────────────────────────────────────────────────────────────┐
│ Today's Scorecard                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ OUTREACH                          CONNECTIONS               │
│ ┌─────┬─────┬─────┬─────┐        ┌─────┬─────┬─────┐       │
│ │  3  │  1  │  0  │  2  │        │  1  │  0  │  2  │       │
│ │Email│ LI  │ SMS │ VM  │        │Call │Meet │Reply│       │
│ └─────┴─────┴─────┴─────┘        └─────┴─────┴─────┘       │
│                                                             │
│ Total: 6 touches                  Total: 3 connections     │
└─────────────────────────────────────────────────────────────┘
```

### 4. Timeline Display

Responses appear in the activity timeline with green styling (inbound indicator):

- Green background/border for response items
- Label shows "Email Reply", "LinkedIn Reply", etc.
- Date and notes displayed

---

## Implementation Plan

### Phase 1: Database & Types
1. Add new activity types to TypeScript types
2. Create migration to update `activity_type` enum in database (if using enum) or just use as strings

### Phase 2: Response Log Modal
1. Create `LogResponseModal.tsx` component
2. Date picker with default to today (editable)
3. Notes textarea
4. Save to `prospecting_activity` table

### Phase 3: Update Activity Log Buttons
1. Add "Responses" section with 4 buttons
2. Wire up to open `LogResponseModal` with correct type

### Phase 4: Update Scorecard
1. Query responses from `prospecting_activity`
2. Add response counts to state
3. Update UI to show Outreach vs Connections sections
4. Calculate totals for each category

### Phase 5: Timeline Integration
1. Update `ACTIVITY_CONFIG` with response types
2. Add green styling for response items
3. Ensure responses appear in contact timeline

---

## Files to Modify

### Create
- `src/components/hunter/LogResponseModal.tsx`

### Modify
- `src/types/timeline.ts` - Add response activity types
- `src/components/hunter/ActivityLogButtons.tsx` - Add response buttons
- `src/components/hunter/ProspectingWorkspace.tsx` - Update scorecard query & display
- `src/components/contact/ContactDetailDrawer/ContactDetailDrawer.tsx` - Add response buttons
- `src/hooks/useContactTimeline.ts` - Handle response types in timeline

---

## Scorecard Query Changes

```typescript
// Current activity types (outreach)
const outreachTypes = ['email', 'linkedin', 'sms', 'voicemail'];
// Call attempts come from completed_call field

// Response types (connections)
const responseTypes = ['email_response', 'linkedin_response', 'sms_response', 'return_call'];
// Plus: completed_call=true (call connects) and meetings

// Count outreach
const outreachCount = todayStats.emails + todayStats.linkedin + todayStats.sms + todayStats.voicemail;

// Count connections
const connectionCount = todayStats.calls + todayStats.meetings +
  todayStats.emailResponses + todayStats.linkedinResponses +
  todayStats.smsResponses + todayStats.returnCalls;
```

---

## Notes

- **No auto-detection:** Email responses are NOT auto-detected from Gmail sync to avoid counting existing client emails as prospecting responses
- **Editable dates:** Response dates can be edited in case logged on wrong day
- **Manual logging required:** All responses require explicit user action to log
- **Backward compatible:** Existing activities continue to work, new types are additive
