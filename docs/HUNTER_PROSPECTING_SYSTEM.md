# Hunter AI Prospecting System

**Last Updated:** 2026-02-17
**Status:** Phase 1 Complete, Phase 2 In Progress

---

## Overview

The Hunter AI Prospecting System is an intelligent lead generation and sales prospecting platform that:

1. **Automatically discovers leads** by monitoring news sources, press releases, and industry publications
2. **Scores and prioritizes leads** based on geographic relevance and expansion signals
3. **Manages the prospecting workflow** from discovery to conversion
4. **Tracks outreach activities** across multiple channels (email, LinkedIn, SMS, voicemail, calls, meetings)
5. **Generates AI-drafted outreach** for emails and voicemail scripts

---

## System Architecture

### Data Flow

```
News Sources → Hunter Agent → Signals → Targets → Contacts → Deals
     ↓              ↓           ↓          ↓          ↓
  RSS/API      AI Analysis   Scoring   Enrichment  Outreach
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `hunter_source` | News sources to monitor (RSS feeds, websites) |
| `hunter_signal` | Individual news articles/signals discovered |
| `target` | Companies identified as potential leads (formerly `hunter_lead`) |
| `target_signal` | Links signals to targets with extracted info |
| `hunter_outreach_draft` | AI-generated email/voicemail drafts |
| `hunter_feedback` | User feedback to improve AI scoring |
| `contact` | People at target companies (with `target_id` link) |
| `activity` | Prospecting activities (with `is_prospecting` flag) |

---

## Current Implementation (Phase 1)

### UI Components

#### Hunter Dashboard (`/hunter`)
The main prospecting interface with 5 tabs:

| Tab | Component | Description |
|-----|-----------|-------------|
| **Today's Plan** | `TodaysPlan.tsx` | Daily prospecting workflow - follow-ups, overdue, new leads |
| **Targets** | `HunterLeadsTab.tsx` | All targets with filtering by status and signal strength |
| **Outreach** | `HunterOutreachTab.tsx` | AI-drafted emails and voicemail scripts |
| **Sources** | `HunterSourcesTab.tsx` | Manage RSS feeds and news sources |
| **Stats** | `HunterStatsTab.tsx` | Analytics and performance metrics |

#### Target Detail Page (`/hunter/lead/:leadId`)
Comprehensive view of a single target with:

- **Source Articles** - News articles that triggered the signal
- **Score Reasoning** - AI explanation of why this is a good lead
- **Scoring Feedback** - Report incorrect scores to improve AI
- **Target Geography** - Markets they're expanding into
- **Outreach History** - Draft emails/voicemails sent
- **Activity Log Buttons** - Quick logging for calls, emails, LinkedIn, SMS, voicemail, meetings
- **Contacts Panel** - People at the company (linked via `target_id`)
- **Notes Panel** - Running notes with timestamps
- **Activity Timeline** - All activities for this target
- **Key Contact** - Primary contact from the article (clickable to add as contact)
- **Brand Details** - Website, industry segment, last signal date

### Features Implemented

#### ProspectingWorkspace (`/hunter`)
The main prospecting interface with:

- **Daily Scorecard** - Real-time activity tracking with 6 individual cards:
  - Emails Sent (blue)
  - LinkedIn (indigo)
  - SMS (purple)
  - Voicemail (orange)
  - Call Connect (emerald)
  - Meeting Held (teal)
- **Task List** - Follow-ups due today and overdue
- **New Leads** - Recently discovered targets
- **Find Contact** - Search across all contacts
- **Contact Detail Drawer** - Slide-out panel with unified timeline

#### Today's Plan Dashboard
- **Today's Progress stats** - Follow-ups due, overdue count, new leads, calls made, meetings
- **Outreach This Week** - Metrics for emails, LinkedIn, SMS, voicemails, calls, meetings, total touches
- **Follow-ups Due Today** - Prospecting tasks due today with quick actions
- **Overdue Follow-ups** - Tasks overdue up to 30 days with dismiss/complete options
- **New Leads from Hunter** - AI-discovered targets awaiting review
- **Ready to Call** - Researched targets ready for first contact
- **Quick Add Target** - Manually add a target company

#### Target Management
- **Signal Strength Classification**: HOT, WARM+, WARM, COOL
- **Status Workflow**: new → researching → active → engaged → meeting_scheduled → converted
- **Terminal Statuses**: already_represented, not_interested, dead, nurture, dismissed
- **Dismiss with Reason** - Track why targets were passed (too small, wrong segment, etc.)
- **Convert to Contact** - Create contact from key person info

#### Contact Integration
- **TargetContactsPanel** - Add/manage contacts linked to a target
- **Key Contact Quick-Add** - Click to pre-fill contact form from article's key person
- **Primary Contact Designation** - Star to mark primary contact
- **Contact Actions** - Email, phone, view details

#### Activity Tracking
- **Quick Log Buttons** - One-click logging for Email, LinkedIn, SMS, Voicemail, Call, Meeting
- **Activity Timeline** - Chronological view of all outreach
- **Prospecting Flag** - Activities marked with `is_prospecting = true` appear in Today's Plan
- **Target Linking** - Activities linked to targets via `target_id`

#### Notes System
- **Running Notes** - Timestamped notes for each target
- **Quick Add** - Simple textarea to add notes

#### Outreach Queue
- **AI-Generated Drafts** - Email subjects, bodies, voicemail scripts
- **Review Workflow** - Draft → Approved → Sent or Rejected
- **Send via Gmail** - Integration ready (requires OAuth setup)
- **Voicemail Scripts** - "Mark as Called" for phone scripts

### Database Migrations

| Migration | Description |
|-----------|-------------|
| `20260212000000_prospecting_system_phase1.sql` | Base prospecting tables, views, metrics |
| `20260212100000_rename_hunter_lead_to_target.sql` | Renamed `hunter_lead` to `target` |
| `20260212110000_add_dismiss_tracking.sql` | Dismiss columns, `v_dismissed_targets` view |
| `20260212120000_add_target_id_to_activity.sql` | Added `target_id` and `is_prospecting` to activity |

### Key Views

| View | Purpose |
|------|---------|
| `v_prospecting_weekly_metrics` | Weekly outreach stats (emails, calls, etc.) |
| `v_prospecting_stale_targets` | Targets not contacted in 45+ days |
| `v_dismissed_targets` | Dismissed targets with reasons |

---

## File Structure

```
src/
├── pages/
│   ├── HunterDashboardPage.tsx      # Main dashboard with tabs
│   └── HunterLeadDetailsPage.tsx    # Target detail page
├── components/
│   ├── hunter/
│   │   ├── ProspectingWorkspace.tsx # Main prospecting command center
│   │   ├── HunterLeadsTab.tsx       # Targets list with filters
│   │   ├── HunterOutreachTab.tsx    # Outreach draft queue
│   │   ├── HunterSourcesTab.tsx     # News sources management
│   │   ├── HunterStatsTab.tsx       # Analytics
│   │   ├── ActivityLogButtons.tsx   # Quick activity logging
│   │   ├── LeadActivityTimeline.tsx # Activity history
│   │   ├── LeadNotesPanel.tsx       # Notes management
│   │   ├── TargetContactsPanel.tsx  # Contacts linked to target
│   │   ├── DismissTargetModal.tsx   # Dismiss with reason
│   │   ├── ProspectingDashboard.tsx # Legacy dashboard (reference)
│   │   └── TimeEntryModal.tsx       # Time tracking
│   ├── contact/
│   │   └── ContactDetailDrawer/     # Reusable contact drawer
│   │       ├── ContactDetailDrawer.tsx  # Main container
│   │       ├── types.ts             # Component props/types
│   │       └── index.ts             # Re-exports
│   └── prospecting/
│       ├── TodaysPlan.tsx           # Today's Plan tab
│       └── AddTargetModal.tsx       # Manual target creation
├── hooks/
│   ├── useContactTimeline.ts        # Unified timeline from all sources
│   ├── useProspectingMetrics.ts     # Weekly metrics data
│   ├── useProspectingActivities.ts  # Activity logging
│   ├── useProspectingNotes.ts       # Notes CRUD
│   └── useProspectingTime.ts        # Time tracking
└── types/
    ├── timeline.ts                  # UnifiedTimelineItem types
    └── prospecting.ts               # Type definitions
```

---

## Phase 2 Roadmap

### ZoomInfo Integration (Contact Enrichment)
**See detailed guide in:** `docs/PROSPECTING_SYSTEM_SPEC.md#zoominfo-integration-guide`

- [ ] Obtain ZoomInfo API credentials
- [ ] Create `enrich-contact` edge function
- [ ] Add enrichment columns to contact table
- [ ] Add "Enrich" button to contact forms
- [ ] Track API usage in `enrichment_log` table

**Alternative providers:** Apollo.io, Clearbit, Hunter.io, Lusha, RocketReach

### Gmail Integration
- [ ] Full Gmail API OAuth setup
- [ ] Send emails directly from OVIS
- [ ] Auto-log sent emails as activities
- [ ] Track email opens/replies

### Email Templates
- [ ] Create/edit reusable templates
- [ ] Variable substitution ({{name}}, {{company}})
- [ ] Template categories (cold outreach, follow-up, re-engagement)

### Reply Detection
- [ ] Monitor inbox for replies
- [ ] Match replies to sent emails
- [ ] Auto-update target status when engaged

---

## Phase 3 Roadmap

### Client Relationship Tracking
- [ ] Mark contacts for ongoing relationship tracking
- [ ] Categories: past clients, current clients, brokers, networking
- [ ] "Haven't talked in X days" queue
- [ ] Relationship health indicators

### Calendar Integration
- [ ] Sync meetings from Google Calendar
- [ ] Auto-create activities from calendar events
- [ ] Meeting prep reminders

### Advanced Analytics
- [ ] Conversion funnel visualization
- [ ] Response rate by outreach type
- [ ] Best time to contact analysis
- [ ] Source ROI tracking

---

## Hunter AI Agent

The Hunter AI Agent runs as a scheduled job (Supabase Edge Function or external service) that:

1. **Fetches news** from configured RSS feeds and sources
2. **Analyzes articles** for franchise expansion signals
3. **Extracts entities** - company names, people, locations
4. **Scores relevance** based on geography match and signal strength
5. **Creates targets** with signal strength classification
6. **Generates outreach drafts** for high-priority leads

### Agent Configuration

Located in: `hunter-agent/` directory (separate from main app)

Key files:
- News source fetching
- Article parsing and entity extraction
- Scoring algorithms
- Outreach generation prompts

---

## API Reference

### Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `hunter-send-outreach` | Send approved emails via Gmail |
| `enrich-contact` | ZoomInfo contact enrichment (Phase 2) |

### Key Database Operations

```typescript
// Get targets by status
const { data } = await supabase
  .from('target')
  .select('*')
  .eq('status', 'new')
  .order('signal_strength');

// Log activity for target
await supabase.from('activity').insert({
  target_id: targetId,
  contact_id: contactId,
  subject: 'Call with John',
  activity_type_id: callTypeId,
  is_prospecting: true
});

// Get weekly metrics
const { data } = await supabase
  .from('v_prospecting_weekly_metrics')
  .select('*')
  .single();
```

---

## Configuration

### Environment Variables

```env
# Supabase (already configured)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Gmail API (Phase 2)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=

# ZoomInfo (Phase 2)
ZOOMINFO_CLIENT_ID=
ZOOMINFO_PRIVATE_KEY=
```

### User Settings

Settings stored in `prospecting_settings` table:
- `daily_time_goal_minutes` - Default: 120 (2 hours)
- `stale_lead_days` - Default: 45

---

## Troubleshooting

### Common Issues

**Outreach tab is empty**
- Outreach drafts are created by the Hunter AI agent when it runs
- Check if the agent is scheduled and running
- Verify `hunter_outreach_draft` table has data

**Follow-ups not showing in Today's Plan**
- Ensure activities have `is_prospecting = true`
- Check `activity_date` is within the correct range
- Verify activity status is not closed

**Metrics showing zero**
- The `v_prospecting_weekly_metrics` view aggregates from `activity` table
- Ensure activities are being logged with correct types
- Check the view definition matches your activity type IDs

---

## Related Documentation

- `docs/PROSPECTING_SYSTEM_SPEC.md` - Full technical specification
- `docs/PROSPECTING_SYSTEM_SPEC.md#zoominfo-integration-guide` - ZoomInfo setup guide

---

## Changelog

| Date | Changes |
|------|---------|
| 2026-02-17 | Expanded scorecard to 6 activity types (Email, LinkedIn, SMS, Voicemail, Call, Meeting) |
| 2026-02-17 | Added `hidden_from_timeline` column to prospecting_activity table |
| 2026-02-17 | Hidden activities excluded from scorecard counts and Activity tab |
| 2026-02-17 | Email display fixed - Activity tab shows subject only, Email History has expandable body |
| 2026-02-17 | Gmail sender name now displays properly via RFC 2047 encoding |
| 2026-02-17 | Added Find Contact modal to ProspectingWorkspace |
| 2026-02-17 | Created ContactDetailDrawer reusable component |
| 2026-02-17 | Created useContactTimeline hook for unified timeline data |
| 2026-02-12 | Initial Hunter/Prospecting system implementation |
| 2026-02-12 | Merged Hunter and Prospecting dashboards |
| 2026-02-12 | Added Today's Plan as default landing page |
| 2026-02-12 | Added Outreach This Week metrics |
| 2026-02-12 | Added Key Contact quick-add functionality |
| 2026-02-12 | Added dismiss tracking with reasons |
| 2026-02-12 | Documented ZoomInfo integration requirements |
