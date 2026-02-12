# OVIS Prospecting System - Full Specification

**Created:** 2026-02-12
**Version:** 1.0
**Status:** Phase 1 In Progress

---

## Executive Summary

A comprehensive prospecting tracking system for OVIS that enables:
- Structured workflow from Hunter leads to client conversion
- Activity tracking across multiple channels (Email, LinkedIn, SMS, Voicemail, Call, Meeting)
- Time-on-task tracking with daily goals and streak management
- Coach accountability metrics and reporting
- Future expansion to client/contact relationship management

---

## Table of Contents

1. [Core Workflow](#core-workflow)
2. [Lead Funnel Stages](#lead-funnel-stages)
3. [Activity Types](#activity-types)
4. [Features by Phase](#features-by-phase)
5. [Database Schema](#database-schema)
6. [UI Components](#ui-components)
7. [Metrics & Reporting](#metrics--reporting)
8. [Technical Implementation Notes](#technical-implementation-notes)

---

## Core Workflow

### Daily Prospecting Routine

1. **Open Prospecting Dashboard**
2. **Review Hunter Leads** - New leads needing research
3. **Research Leads** - Find contact info (ZoomInfo in Phase 2)
4. **Execute Outreach** - Call, email, LinkedIn, SMS based on lead temperature
5. **Log Activities** - Track what was done and when
6. **Add Notes** - Capture conversation details, next steps
7. **Log Time** - Record hours spent on prospecting
8. **Review Metrics** - Check progress against goals

### Lead Temperature Strategy

| Lead Type | Primary Approach | Follow-up |
|-----------|------------------|-----------|
| HOT (with phone) | Call first | Email + LinkedIn after voicemail |
| HOT (no phone) | Email + LinkedIn | Call when number found |
| WARM/COLD | Email + LinkedIn first | Call as follow-up |

---

## Lead Funnel Stages

### Active Pipeline Stages

| Status | Description | Typical Actions |
|--------|-------------|-----------------|
| `new` | Just discovered, not yet contacted | Review, research |
| `researching` | Looking up contact info, LinkedIn, etc. | ZoomInfo lookup, web search |
| `active` | In active outreach sequence | Calls, emails, LinkedIn |
| `engaged` | They've responded, conversation ongoing | Schedule meeting |
| `meeting_scheduled` | Have a call/meeting set up | Prepare, attend |
| `converted` | Became a client | Transition to deal |

### Terminal Stages

| Status | Description | Re-engagement? |
|--------|-------------|----------------|
| `already_represented` | Has another broker | No (archive) |
| `not_interested` | Declined, don't follow up | No (archive) |
| `dead` | Bad contact info, out of business | No (archive) |
| `nurture` | Not ready now, check back later | Yes (6+ months) |

---

## Activity Types

### Outreach Activities

| Type | Code | Description | Logged Data |
|------|------|-------------|-------------|
| Email Sent | `email` | Sent email via Gmail | timestamp, subject, template_used |
| LinkedIn Message | `linkedin` | Sent LinkedIn message | timestamp |
| SMS Text | `sms` | Sent text message | timestamp |
| Voicemail Left | `voicemail` | Called, left voicemail | timestamp |
| Call Complete | `call` | Reached them on phone | timestamp, duration (optional) |
| Meeting Held | `meeting` | Had scheduled meeting | timestamp, duration (optional) |

### Activity Logging Requirements

- **Minimal friction** - One click to log activity type + timestamp
- **Optional notes** - Can add brief notes if desired
- **Activity feed** - Chronological list on lead detail page
- **Metrics aggregation** - Count by type for reporting

---

## Features by Phase

### Phase 1 (Current Implementation)

#### Database
- [x] `prospecting_activity` table for activity logging
- [x] `prospecting_note` table for running notes
- [x] `prospecting_time_entry` table for time tracking
- [x] `prospecting_vacation_day` table for streak protection
- [x] Update `hunter_lead.status` enum for new funnel stages
- [x] Add `hunter_lead.last_contacted_at` field

#### Lead Management
- [ ] Funnel stage management on lead detail
- [ ] Running notes panel (Slack-like, timestamped)
- [ ] Activity logging with one-click buttons
- [ ] Activity feed showing all touchpoints
- [ ] "Last contacted" timestamp auto-update

#### Prospecting Dashboard
- [ ] Follow-up tasks due today (filtered to Prospecting category)
- [ ] Hunter leads to review (status = new)
- [ ] Stale leads (not contacted in 45+ days)
- [ ] Quick stats overview

#### Time Tracking
- [ ] Daily time entry (hours:minutes)
- [ ] Goal: 2 hours/day (configurable)
- [ ] Vacation day marking
- [ ] Streak calculation (excludes vacation days)

#### Metrics View
- [ ] Outreach volume this week (calls, emails, LinkedIn, SMS)
- [ ] Response rate (engaged / contacted)
- [ ] Conversion funnel visualization
- [ ] Streak/consistency tracker
- [ ] Time-on-task progress bar

### Phase 2 (Future)

#### ZoomInfo Integration
- [ ] API connection for contact enrichment
- [ ] Auto-populate email, phone, LinkedIn from ZoomInfo
- [ ] Enrich button on lead detail page

**See [ZoomInfo Integration Guide](#zoominfo-integration-guide) below for detailed implementation requirements.**

#### Gmail Integration
- [ ] Full Gmail API OAuth setup
- [ ] Send email from OVIS
- [ ] Email logged to activity automatically
- [ ] Email appears in Gmail "Sent" folder

#### Email Templates
- [ ] Create/edit email templates
- [ ] Template selection when composing
- [ ] Variable substitution (name, company, etc.)
- [ ] Common templates:
  - Initial cold outreach
  - Follow-up after voicemail
  - Re-engagement after 45 days
  - Meeting request

#### Reply Detection
- [ ] Email agent monitors inbox
- [ ] Match replies to sent emails
- [ ] Auto-log reply as activity
- [ ] Tag contact/lead

#### Contact Email Integration
- [ ] Extend email capability to Contact entity
- [ ] Activity logging on contacts (not just leads)

### Phase 3 (Future)

#### Client/Contact Relationship Tracking
- [ ] Mark contacts for relationship tracking
- [ ] Categories:
  - Past clients
  - Current clients
  - Other brokers
  - Networking contacts
- [ ] Track last contact date
- [ ] Activity logging (call, email, text, LinkedIn)
- [ ] "Haven't talked in X days" queue
- [ ] Relationship health indicators

---

## Database Schema

### New Tables

```sql
-- Prospecting activities (outreach touchpoints)
CREATE TABLE prospecting_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contact(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('email', 'linkedin', 'sms', 'voicemail', 'call', 'meeting')),
  notes TEXT,
  template_id UUID REFERENCES email_template(id),
  email_subject TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Running notes on leads (Slack-like)
CREATE TABLE prospecting_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hunter_lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contact(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Daily time tracking
CREATE TABLE prospecting_time_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  UNIQUE(entry_date, user_id)
);

-- Vacation days (streak protection)
CREATE TABLE prospecting_vacation_day (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacation_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id),
  UNIQUE(vacation_date, user_id)
);

-- Email templates (Phase 2)
CREATE TABLE email_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT, -- 'cold_outreach', 'follow_up', 're_engagement', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- User prospecting settings
CREATE TABLE prospecting_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  daily_time_goal_minutes INTEGER DEFAULT 120, -- 2 hours
  stale_lead_days INTEGER DEFAULT 45,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Modifications to Existing Tables

```sql
-- Update hunter_lead status enum
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'researching';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'engaged';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'meeting_scheduled';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'already_represented';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'not_interested';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'dead';
ALTER TYPE hunter_lead_status ADD VALUE IF NOT EXISTS 'nurture';

-- Add last_contacted_at to hunter_lead
ALTER TABLE hunter_lead ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
```

### Indexes

```sql
CREATE INDEX idx_prospecting_activity_lead ON prospecting_activity(hunter_lead_id);
CREATE INDEX idx_prospecting_activity_contact ON prospecting_activity(contact_id);
CREATE INDEX idx_prospecting_activity_type ON prospecting_activity(activity_type);
CREATE INDEX idx_prospecting_activity_created ON prospecting_activity(created_at);
CREATE INDEX idx_prospecting_note_lead ON prospecting_note(hunter_lead_id);
CREATE INDEX idx_prospecting_time_entry_date ON prospecting_time_entry(entry_date);
CREATE INDEX idx_prospecting_vacation_day_date ON prospecting_vacation_day(vacation_date);
CREATE INDEX idx_hunter_lead_last_contacted ON hunter_lead(last_contacted_at);
```

### RLS Policies

```sql
-- prospecting_activity
ALTER TABLE prospecting_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all prospecting activities" ON prospecting_activity FOR SELECT USING (true);
CREATE POLICY "Users can insert prospecting activities" ON prospecting_activity FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own prospecting activities" ON prospecting_activity FOR UPDATE USING (auth.uid() = created_by);

-- prospecting_note
ALTER TABLE prospecting_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all prospecting notes" ON prospecting_note FOR SELECT USING (true);
CREATE POLICY "Users can insert prospecting notes" ON prospecting_note FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own prospecting notes" ON prospecting_note FOR UPDATE USING (auth.uid() = created_by);

-- prospecting_time_entry
ALTER TABLE prospecting_time_entry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own time entries" ON prospecting_time_entry FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own time entries" ON prospecting_time_entry FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own time entries" ON prospecting_time_entry FOR UPDATE USING (auth.uid() = user_id);

-- prospecting_vacation_day
ALTER TABLE prospecting_vacation_day ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own vacation days" ON prospecting_vacation_day FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own vacation days" ON prospecting_vacation_day FOR ALL USING (auth.uid() = user_id);

-- prospecting_settings
ALTER TABLE prospecting_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON prospecting_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own settings" ON prospecting_settings FOR ALL USING (auth.uid() = user_id);
```

---

## UI Components

### Prospecting Dashboard (`/hunter/prospecting`)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Prospecting Dashboard                                    [Log Time] btn │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│ │ Today's     │ │ This Week   │ │ Streak      │ │ Response    │        │
│ │ Time        │ │ Outreach    │ │             │ │ Rate        │        │
│ │ 1:30 / 2:00 │ │ 47 touches  │ │ 12 days 🔥  │ │ 23%         │        │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘        │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Follow-up Tasks Due Today                                     (5)  │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ ☐ Call John @ Chipotle - follow up on expansion               │
│ │ ☐ Email Sarah @ Sweetgreen - send market report               │
│ │ ☐ LinkedIn message to Mike @ CAVA                              │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ New Leads to Review                                           (8)  │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ 🔥 HOT  Wingstop - Expanding to Southeast        [View] [Research] │
│ │ 🔥 HOT  Raising Cane's - New CFO announced       [View] [Research] │
│ │ 🟠 WARM+ Jersey Mike's - 100 new units planned   [View] [Research] │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Stale Leads (45+ days no contact)                             (3)  │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ Shake Shack - Last contact: 52 days ago          [View] [Re-engage]│
│ │ Portillo's - Last contact: 48 days ago           [View] [Re-engage]│
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Lead Detail - Activity Panel

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Wingstop                                           Status: [Active ▼]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Quick Actions:                                                          │
│ [📧 Email] [💼 LinkedIn] [📱 SMS] [📞 Voicemail] [✅ Call] [🤝 Meeting] │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ Notes                                                    [+ Add Note]   │
│ ─────────────────────────────────────────────────────────────────────── │
│ Feb 12, 2:30pm                                                          │
│ Spoke with CFO. They're looking at Atlanta and Nashville markets.       │
│ Wants market report by Friday. Schedule follow-up call next week.       │
│                                                                         │
│ Feb 10, 9:15am                                                          │
│ Left voicemail. CFO is Michael Thompson, found on LinkedIn.             │
│ Direct line: 555-123-4567                                               │
│                                                                         │
│ Feb 8, 3:45pm                                                           │
│ Sent initial outreach email and LinkedIn connection request.            │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ Activity Timeline                                                       │
│ ─────────────────────────────────────────────────────────────────────── │
│ Feb 12  ✅ Call Complete                                                │
│ Feb 10  📞 Voicemail Left                                               │
│ Feb 8   📧 Email Sent - "Wingstop Expansion Opportunity"                │
│ Feb 8   💼 LinkedIn Message                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Time Entry Modal

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Log Prospecting Time                                              [X]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Date: [Feb 12, 2026 ▼]                                                  │
│                                                                         │
│ Time Spent:  [ 1 ] hours  [ 30 ] minutes                               │
│                                                                         │
│ Notes (optional):                                                       │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Researched 5 new leads, made 8 calls, sent 12 emails               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ☐ Mark today as vacation day (protects streak)                         │
│                                                                         │
│                                        [Cancel]  [Save Time Entry]      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Metrics View

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Prospecting Metrics                              This Week | This Month │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ TIME ON TASK                                                            │
│ ═══════════════════════════════════════════════════════════════════════ │
│ Today:     ████████████░░░░░░░░  1:30 / 2:00 (75%)                     │
│ This Week: █████████████████░░░  8:30 / 10:00 (85%)                    │
│ Streak:    12 days 🔥 (vacation days excluded)                          │
│                                                                         │
│ OUTREACH VOLUME (This Week)                                             │
│ ═══════════════════════════════════════════════════════════════════════ │
│ 📧 Emails:     15                                                       │
│ 💼 LinkedIn:   12                                                       │
│ 📱 SMS:        3                                                        │
│ 📞 Voicemails: 8                                                        │
│ ✅ Calls:      4                                                        │
│ 🤝 Meetings:   2                                                        │
│ ─────────────────────────────────────────────────────────────────────── │
│ Total Touches: 44                                                       │
│                                                                         │
│ RESPONSE RATE                                                           │
│ ═══════════════════════════════════════════════════════════════════════ │
│ Leads Contacted: 28                                                     │
│ Leads Engaged:   6 (21%)                                               │
│ Meetings Set:    2 (7%)                                                │
│                                                                         │
│ FUNNEL                                                                  │
│ ═══════════════════════════════════════════════════════════════════════ │
│ New:              12  ████████████                                      │
│ Researching:      5   █████                                            │
│ Active:           18  ██████████████████                               │
│ Engaged:          6   ██████                                           │
│ Meeting Sched:    2   ██                                               │
│ Converted:        3   ███                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Metrics & Reporting

### Key Metrics

| Metric | Calculation | Display |
|--------|-------------|---------|
| Time Today | Sum of today's time entries | HH:MM / Goal |
| Time This Week | Sum of Mon-Sun time entries | HH:MM / Goal |
| Streak | Consecutive days with time logged (excl vacation) | X days + fire emoji |
| Outreach Volume | Count of activities by type | By channel |
| Response Rate | (Engaged leads) / (Contacted leads) | Percentage |
| Conversion Rate | (Converted) / (Total active pipeline) | Percentage |

### Streak Calculation Logic

```typescript
function calculateStreak(timeEntries: TimeEntry[], vacationDays: Date[]): number {
  let streak = 0;
  let currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  while (true) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const isVacation = vacationDays.some(v => v.toISOString().split('T')[0] === dateStr);
    const hasEntry = timeEntries.some(e => e.entry_date === dateStr && e.minutes > 0);

    if (isVacation) {
      // Skip vacation days - don't count for or against streak
      currentDate.setDate(currentDate.getDate() - 1);
      continue;
    }

    if (hasEntry) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break; // Streak broken
    }
  }

  return streak;
}
```

---

## Technical Implementation Notes

### Task Category for Prospecting

Add "Prospecting" to task categories to filter tasks on dashboard:
- Call follow-up
- Email follow-up
- LinkedIn follow-up
- SMS follow-up
- Research lead

### Auto-update last_contacted_at

When logging an activity, automatically update `hunter_lead.last_contacted_at`:

```typescript
async function logActivity(leadId: string, activityType: string) {
  // Insert activity
  await supabase.from('prospecting_activity').insert({
    hunter_lead_id: leadId,
    activity_type: activityType,
    created_by: userId
  });

  // Update last_contacted_at
  await supabase.from('hunter_lead')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', leadId);
}
```

### File Structure

```
src/
├── components/
│   └── hunter/
│       ├── ProspectingDashboard.tsx
│       ├── ProspectingMetrics.tsx
│       ├── ProspectingTimeEntry.tsx
│       ├── LeadActivityPanel.tsx
│       ├── LeadNotesPanel.tsx
│       ├── ActivityLogButton.tsx
│       └── StaleLeadsList.tsx
├── hooks/
│   ├── useProspectingActivities.ts
│   ├── useProspectingNotes.ts
│   ├── useProspectingTime.ts
│   └── useProspectingMetrics.ts
└── pages/
    └── hunter/
        └── ProspectingPage.tsx
```

### API Endpoints (Supabase Functions - if needed)

For Phase 2 Gmail integration:
- `gmail-send-email` - Send email via Gmail API
- `gmail-oauth-callback` - Handle OAuth flow
- `email-reply-webhook` - Process incoming reply notifications

---

## Migration Path

### From Current State to Phase 1

1. Run database migration to create new tables
2. Update `hunter_lead` status enum
3. Add `last_contacted_at` column
4. Deploy new UI components
5. Add "Prospecting" task category

### Phase 1 to Phase 2

1. Set up Gmail API OAuth
2. Create email_template table (already in schema)
3. Build email composer component
4. Integrate with activity logging

### Phase 2 to Phase 3

1. Add `relationship_type` to contact table
2. Add `last_contacted_at` to contact table
3. Create contact activity logging (reuse prospecting_activity)
4. Build relationship tracking dashboard

---

## Open Questions / Future Considerations

1. **Should activities be editable after creation?** Current design allows updates by creator.

2. **Should we track email open/click rates?** Would require email tracking pixels - complexity vs value tradeoff.

3. **Integration with calendar for meeting scheduling?** Could auto-create activities from calendar events.

4. **Mobile app considerations?** Current design is web-focused but components could work on mobile web.

5. **Team visibility?** Current RLS allows viewing all activities but only editing own. May need adjustment for team scenarios.

---

## ZoomInfo Integration Guide

### Overview

ZoomInfo provides contact enrichment data including:
- **Email addresses** (work email, verified)
- **Phone numbers** (direct dial, mobile, company)
- **LinkedIn profile URL**
- **Job title verification**
- **Company information** (revenue, employee count, industry)

### Prerequisites

Before implementing ZoomInfo integration, you need:

1. **ZoomInfo Enterprise Account** with API access
   - Contact ZoomInfo sales for API pricing
   - API access is typically an add-on to enterprise subscriptions
   - Request: Person Search API + Person Enrich API

2. **API Credentials**
   - Client ID
   - Private Key (for JWT authentication)
   - These will be stored in Supabase secrets

### Implementation Steps

#### Step 1: Store API Credentials in Supabase

```sql
-- Store in Supabase Vault (run in SQL editor)
SELECT vault.create_secret('zoominfo_client_id', 'your-client-id-here');
SELECT vault.create_secret('zoominfo_private_key', 'your-private-key-here');
```

#### Step 2: Create Edge Function

Create `supabase/functions/enrich-contact/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZOOMINFO_API_BASE = 'https://api.zoominfo.com'

serve(async (req) => {
  try {
    const { firstName, lastName, companyName, targetId, contactId } = await req.json()

    // 1. Get ZoomInfo credentials from vault
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: secrets } = await supabase.rpc('get_secrets', {
      secret_names: ['zoominfo_client_id', 'zoominfo_private_key']
    })

    // 2. Authenticate with ZoomInfo (JWT)
    const token = await getZoomInfoToken(secrets.client_id, secrets.private_key)

    // 3. Search for person
    const searchResponse = await fetch(`${ZOOMINFO_API_BASE}/search/person`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        firstName,
        lastName,
        companyName,
        outputFields: ['id', 'email', 'phone', 'mobilePhone', 'linkedinUrl', 'jobTitle']
      })
    })

    const searchData = await searchResponse.json()

    if (!searchData.data?.length) {
      return new Response(JSON.stringify({ success: false, message: 'No matches found' }), {
        status: 404
      })
    }

    const person = searchData.data[0]

    // 4. Update contact record with enriched data
    if (contactId) {
      await supabase.from('contact').update({
        email: person.email,
        phone: person.phone,
        mobile_phone: person.mobilePhone,
        linkedin: person.linkedinUrl,
        title: person.jobTitle,
        enriched_at: new Date().toISOString(),
        enrichment_source: 'zoominfo'
      }).eq('id', contactId)
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        email: person.email,
        phone: person.phone,
        mobilePhone: person.mobilePhone,
        linkedin: person.linkedinUrl,
        jobTitle: person.jobTitle
      }
    }))

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500
    })
  }
})

async function getZoomInfoToken(clientId: string, privateKey: string): Promise<string> {
  // ZoomInfo uses JWT authentication
  // Generate JWT with client_id as issuer, sign with private key
  // Token is valid for 1 hour
  // Implementation depends on ZoomInfo's specific auth requirements
  // See: https://api-docs.zoominfo.com/#authentication
}
```

#### Step 3: Add Database Columns

```sql
-- Add enrichment tracking to contact table
ALTER TABLE contact ADD COLUMN IF NOT EXISTS linkedin TEXT;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
ALTER TABLE contact ADD COLUMN IF NOT EXISTS enrichment_source TEXT;

-- Create enrichment log for tracking API usage
CREATE TABLE IF NOT EXISTS enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contact(id),
  target_id UUID REFERENCES target(id),
  provider TEXT NOT NULL DEFAULT 'zoominfo',
  status TEXT NOT NULL, -- 'success', 'not_found', 'error'
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
```

#### Step 4: Add UI Components

1. **Enrich Button on Contact Add Form** (`TargetContactsPanel.tsx`)
   - Shows when first_name + last_name are filled
   - Calls edge function with name + company
   - Auto-fills email, phone, LinkedIn fields

2. **Enrich Button on Contact Detail Page**
   - For existing contacts without email/phone
   - Shows enrichment status and last enriched date

3. **Bulk Enrich Option**
   - On target detail page
   - Enriches all contacts linked to target

### API Usage & Costs

ZoomInfo API pricing is typically:
- Per-lookup pricing (varies by plan)
- Monthly credit allocation
- Track usage in `enrichment_log` table

### Alternative Providers

If ZoomInfo is not available, consider:

| Provider | Strengths | API Docs |
|----------|-----------|----------|
| **Apollo.io** | Good for B2B, includes email verification | api.apollo.io |
| **Clearbit** | Company data, real-time enrichment | clearbit.com/docs |
| **Hunter.io** | Email finding, verification | hunter.io/api |
| **Lusha** | Direct dials, mobile numbers | lusha.com/api |
| **RocketReach** | LinkedIn lookups | rocketreach.co/api |

### Testing

1. Create a test contact with known name/company
2. Call enrichment function
3. Verify fields are populated
4. Check enrichment_log for tracking

### Activation Checklist

When ready to activate ZoomInfo:

- [ ] Obtain ZoomInfo API credentials (Client ID + Private Key)
- [ ] Run database migration for enrichment columns
- [ ] Deploy `enrich-contact` edge function
- [ ] Store credentials in Supabase Vault
- [ ] Add "Enrich" button to TargetContactsPanel
- [ ] Test with sample contact
- [ ] Monitor API usage in enrichment_log

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-12 | Initial specification |
| 1.1 | 2026-02-12 | Added ZoomInfo Integration Guide |
