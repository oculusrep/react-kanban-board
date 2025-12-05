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
- AND `completed_at >= January 1st of current year` (adjustable via date filter)

### Displayed Fields
| Column | Description |
|--------|-------------|
| Completed | Date the activity was completed |
| Company | Company name from the linked contact |
| Contact | Contact name (clickable link to contact page) |
| Source Type | Contact's source type (from contact.source_type field) |
| Subject | Activity subject line |
| Status | Activity status with color coding (green = closed, blue = open) |
| Prospecting | Checkmark if `is_prospecting_call = true` |
| Completed | Checkmark if `completed_call = true` |
| Meeting | Checkmark if `meeting_held = true` |
| Actions | "Log New" button to create follow-up activity for the contact |

## Features

### Summary Statistics
The header displays four key metrics:
- **Total Activities**: Count of all matching activities
- **Prospecting Calls**: Count where `is_prospecting_call = true`
- **Completed Calls**: Count where `completed_call = true`
- **Meetings Held**: Count where `meeting_held = true`

### Conversion Funnel (Expandable)
Click "Show Funnel" to reveal a visual conversion funnel showing:
- Prospecting Calls → Completed Calls → Meetings Held
- Conversion rates between each stage
- Visual bar chart representation

### Date Range Filter
Filter activities by time period:
- **YTD** (default): Year to date
- **Last 30 Days**: Rolling 30-day window
- **Last 90 Days**: Rolling 90-day window
- **All Time**: No date restriction
- **Custom**: Pick specific start and end dates

### Search
Real-time search filters activities by:
- Contact name (first or last)
- Company name
- Subject line

### Sorting
Click any column header to sort:
- Completed date (default: descending)
- Company name
- Contact name
- Subject

### Quick Actions
- **Log Call**: Opens modal to create a new prospecting call
- **Log New** (per row): Opens modal pre-populated with that row's contact to log a follow-up
- **Row Click**: Opens the activity in a slideout for editing
- **Refresh**: Reload data from the database

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
- Log Call Modal: `src/components/LogCallModal.tsx`
- Follow-Up Modal: `src/components/FollowUpModal.tsx`
- Add Task Modal: `src/components/AddTaskModal.tsx`

---

# Follow-Up Prompt Feature

## Overview

When logging a new call via the LogCallModal, users are prompted to schedule a follow-up task after successfully saving. This feature helps maintain consistent follow-up cadence with prospects.

## How It Works

1. User logs a call with an associated contact
2. After successful save, instead of closing the modal, a follow-up prompt appears
3. User can:
   - **Quick schedule**: Tomorrow, In 3 Days, In 1 Week, In 2 Weeks
   - **Custom date**: Pick a specific date
   - **Skip**: Close without scheduling

## Default Subject Line

The follow-up subject defaults to:
- `Follow-up with {Contact Name} - {Company}` (if company exists)
- `Follow-up with {Contact Name}` (if no company)

The subject is editable before scheduling.

## Technical Details

### Activity Type
Follow-ups are created as **Task** activities (not Call), allowing them to appear in task lists.

### Status
Follow-ups are created with an **Open** or **Not Started** status.

### Linked Data
The follow-up inherits:
- `contact_id` from the original call
- Related object (deal, property, client, etc.) if one was linked

### State Management
Key state variables in LogCallModal:
- `followUp`: Object containing show flag, contact info, related object info
- `selectedContactCompany`: Tracks the contact's company for the subject line
- `followUpSubject`: The editable subject line
- `customFollowUpDate`: For custom date picker

### Race Condition Fix (Dec 2024)
Fixed issue where contact company wasn't populating:
1. Removed unconditional reset of `selectedContactCompany` in follow-up state reset
2. Added `isOpen` to fetchParentObjectData dependencies
3. Ensured fetch runs each time modal opens, not just when parentObject changes

### Files
- `src/components/LogCallModal.tsx` - Main implementation

---

# Interactive Prospecting Machine - Enhancement Ideas

## Implemented Features ✅

### 1. Quick Activity Creation ✅
- **Log Call button**: Opens LogCallModal from Prospecting Dashboard
- **Pre-populated fields**: Current date, logged-in user as owner
- **"Log New" per row**: Create follow-up for specific contact

### 2. Inline Editing ✅
- **Row click**: Opens LogCallModal in edit mode for that activity

### 3. Filters & Search ✅
- **Date range filter**: YTD, Last 30/90 days, All Time, Custom
- **Contact/Company/Subject search**: Real-time filtering
- (Not yet: Activity type filter, Status filter, Flag filters)

### 4. Conversion Funnel ✅
- Visual bar chart showing Prospecting → Completed → Meetings
- Conversion rates between stages
- Expandable/collapsible

### 5. Follow-Up Prompts ✅
- After logging a call, prompt to schedule follow-up
- Quick buttons for common intervals
- Custom date picker
- Editable subject defaulting to "Follow-up with Contact - Company"

### 6. Warning Icons with Action Dropdown ✅ (Dec 2024)
- **Yellow triangle**: Contact has no scheduled follow-up
- **Red triangle**: Contact has overdue follow-up
- **Clickable icons**: Click to open dropdown menu with actions:
  - **Log Call**: Opens LogCallModal for the contact
  - **Add Task**: Opens AddTaskModal for the contact
  - **Follow-up**: Opens FollowUpModal to quickly schedule a follow-up task
- Icons are larger (w-5 h-5) for better visibility
- Dropdown closes when clicking outside

### 7. Standalone Follow-Up Modal ✅ (Dec 2024)
- Reusable `FollowUpModal` component extracted for use outside LogCallModal
- Same UI as post-call follow-up prompt
- Quick schedule buttons: Tomorrow, In 3 Days, In 1 Week, In 2 Weeks
- Custom date picker option
- Editable subject with smart defaults
- Creates Task activity type with Open status
- File: `src/components/FollowUpModal.tsx`

### 8. Contact Name in Add Task Modal ✅ (Dec 2024)
- When opening AddTaskModal from Prospecting Dashboard, shows associated contact name
- Blue info box in modal footer: "Associated Contact: {name}"

## Future Enhancements (Not Yet Implemented)

### Contact Journey Timeline
- Click a contact to see their full prospecting history
- Timeline view of all touchpoints
- Days between activities
- Next suggested action

### Link to Deals
- Show if a contact has associated deals
- Track which prospecting activities led to deals
- Calculate prospecting-to-deal conversion rate

### Daily/Weekly Goals
- Set targets: "10 prospecting calls per day"
- Progress bar showing completion
- Streak tracking (consecutive days hitting goals)

### Leaderboard (Multi-user)
- If multiple users prospect, show rankings
- Metrics: calls made, meetings booked, deals closed

### Activity Reminders
- "You haven't called [Contact] in 30 days"
- Suggested follow-up list
- Overdue follow-up alerts

### Best Time to Call
- Analyze when completed calls are most successful
- Suggest optimal calling windows

### Contact Prioritization
- Score contacts based on engagement
- Highlight "hot" prospects (recent activity, multiple touchpoints)
- Flag "cold" contacts needing re-engagement

### Email Integration
- Log email opens/clicks as activities
- Auto-create activities from sent emails
- Template library for follow-ups

### Trend Charts
- Weekly/monthly prospecting activity trends
- Comparison to previous periods
- Seasonality analysis

### Pipeline Velocity
- Average time from first contact to deal
- Identify bottlenecks in the sales process

### Export & Sharing
- Export to CSV/Excel
- Scheduled email reports
- Shareable dashboard links

---

# Known Issues / Bugs

## Contact Company Not Populating (Fixed Dec 2024)
**Issue**: When logging a call from a contact page, the contact's company wasn't being captured for the follow-up subject line.

**Root Cause**: Race condition between two useEffect hooks:
1. `fetchParentObjectData` effect was only triggered by `[parentObject]` changes
2. Reset effect was unconditionally clearing `selectedContactCompany`

**Fix**:
- Added `isOpen` to fetchParentObjectData dependencies
- Moved company reset to context-aware section (only reset when not opening from contact)
