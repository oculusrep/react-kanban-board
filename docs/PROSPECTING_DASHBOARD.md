# Prospecting Dashboard

## Overview

The Prospecting Dashboard is a Business Development module that tracks prospecting activities for the current year. It provides visibility into sales outreach efforts including prospecting calls, completed calls, and meetings held.

## Access

- **Route**: `/prospecting`
- **Menu Location**: Hamburger menu → "Prospecting"
- **Access Control**: Admin users only

## Data Source

The dashboard queries the `activity` table with the following criteria:

### Filter Conditions
- `is_prospecting_call = true` OR
- `completed_call = true` OR
- `meeting_held = true`
- AND `completed_at >= January 1st of current year`

### Displayed Fields
| Column | Description |
|--------|-------------|
| Completed | Date the activity was completed |
| Company | Company name from the linked contact |
| Contact | Contact name (clickable link to contact page) |
| Source Type | Activity type (e.g., Call, Email, Meeting) |
| Subject | Activity subject line |
| Status | Activity status with color coding (green = closed, blue = open) |
| Prospecting | Checkmark if `is_prospecting_call = true` |
| Completed | Checkmark if `completed_call = true` |
| Meeting | Checkmark if `meeting_held = true` |

## Features

### Summary Statistics
The header displays four key metrics:
- **Total Activities**: Count of all matching activities
- **Prospecting Calls**: Count where `is_prospecting_call = true`
- **Completed Calls**: Count where `completed_call = true`
- **Meetings Held**: Count where `meeting_held = true`

### Sorting
Click any column header to sort:
- Completed date (default: descending)
- Company name
- Contact name
- Subject

### Refresh
Click the "Refresh" button to reload data from the database.

## Database Schema

The dashboard relies on these activity table fields:
- `is_prospecting_call` (boolean)
- `completed_call` (boolean)
- `meeting_held` (boolean)
- `completed_at` (timestamp)
- `subject` (text)
- `status_id` → `activity_status` (relation)
- `contact_id` → `contact` (relation)
- `activity_type_id` → `activity_type` (relation)

## Technical Notes

### Foreign Key Disambiguation
The activity table has duplicate foreign key constraints. The query uses explicit FK hints:
- `activity_status!fk_activity_status_id`
- `contact!fk_activity_contact_id`
- `activity_type!fk_activity_type_id`

### Files
- Component: `src/components/reports/ProspectingDashboard.tsx`
- Page: `src/pages/ProspectingDashboardPage.tsx`
- Route: `src/App.tsx` (line ~109)
- Menu: `src/components/Navbar.tsx` (desktop ~510-520, mobile ~1005-1015)

## Future Enhancement Ideas

See the "Interactive Prospecting Machine" section below for potential enhancements.

---

# Interactive Prospecting Machine - Enhancement Ideas

## Phase 1: Core Interactivity

### 1. Quick Activity Creation
- **Add New Prospecting Activity Button**: Opens a modal to quickly log a call/meeting
- **Pre-populated fields**: Current date, logged-in user as owner
- **Required fields**: Contact, activity type, one prospecting flag checked

### 2. Inline Editing
- Click a row to open activity slideout for full editing
- Quick toggle buttons for prospecting flags directly in the table
- Inline status updates (dropdown to change status)

### 3. Filters & Search
- **Date range filter**: Custom date range beyond current year
- **Contact/Company search**: Filter by name
- **Activity type filter**: Show only calls, emails, meetings, etc.
- **Status filter**: Open vs. Closed activities
- **Flag filters**: Show only prospecting calls, only completed calls, only meetings

## Phase 2: Pipeline & Conversion Tracking

### 4. Conversion Funnel
Visual funnel showing:
```
Prospecting Calls → Completed Calls → Meetings Held → Deals Created
      100              45                 20              5
```

### 5. Contact Journey Timeline
- Click a contact to see their full prospecting history
- Timeline view of all touchpoints
- Days between activities
- Next suggested action

### 6. Link to Deals
- Show if a contact has associated deals
- Track which prospecting activities led to deals
- Calculate prospecting-to-deal conversion rate

## Phase 3: Productivity & Gamification

### 7. Daily/Weekly Goals
- Set targets: "10 prospecting calls per day"
- Progress bar showing completion
- Streak tracking (consecutive days hitting goals)

### 8. Leaderboard (Multi-user)
- If multiple users prospect, show rankings
- Metrics: calls made, meetings booked, deals closed

### 9. Activity Reminders
- "You haven't called [Contact] in 30 days"
- Suggested follow-up list
- Overdue follow-up alerts

## Phase 4: Intelligence & Automation

### 10. Best Time to Call
- Analyze when completed calls are most successful
- Suggest optimal calling windows

### 11. Contact Prioritization
- Score contacts based on engagement
- Highlight "hot" prospects (recent activity, multiple touchpoints)
- Flag "cold" contacts needing re-engagement

### 12. Email Integration
- Log email opens/clicks as activities
- Auto-create activities from sent emails
- Template library for follow-ups

## Phase 5: Reporting & Analytics

### 13. Trend Charts
- Weekly/monthly prospecting activity trends
- Comparison to previous periods
- Seasonality analysis

### 14. Pipeline Velocity
- Average time from first contact to deal
- Identify bottlenecks in the sales process

### 15. Export & Sharing
- Export to CSV/Excel
- Scheduled email reports
- Shareable dashboard links

## Implementation Priority Recommendation

**Start with these high-impact, low-effort features:**

1. **Inline row click → Activity slideout** (leverages existing component)
2. **Date range filter** (simple UI addition)
3. **Contact/Company search** (filtering existing data)
4. **Quick Add Activity button** (uses existing activity form)
5. **Conversion funnel visualization** (compelling visual, data already exists)

**Medium-term:**
6. Daily goals with progress tracking
7. Contact journey timeline
8. Link activities to deals

**Long-term:**
9. Email integration
10. AI-powered suggestions
11. Leaderboards and gamification
