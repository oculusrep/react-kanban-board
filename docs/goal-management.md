# Goal Management

## Overview

The Goal Management system allows tracking of annual GCI and deal count targets with progress visualization, pipeline coverage analysis, and year-over-year comparison.

## Access

### Goal Management (Admin)
- **Route**: `/reports/goals`
- **Permission Required**: Admin role only
- **Features**: Full edit access, year selector for historical data

### Coach Dashboard (Read-Only)
- **Route**: `/coach-dashboard`
- **Access**: All authenticated users
- **Features**: Current year goals only, no editing

---

## Features

### Annual Goal Setting

Admins can set two types of goals per year:

| Goal Type | Description | Tracking Basis |
|-----------|-------------|----------------|
| **GCI Target** | Gross Commission Income target | Sum of `deal.gci` for Booked/Closed deals |
| **Deals Booked Target** | Number of deals to book | Count of Booked/Closed deals |

### Progress Visualization

Progress bars show completion percentage with color coding:

| Progress | Color | Status |
|----------|-------|--------|
| 0-39% | Red | Significantly behind |
| 40-59% | Orange | Behind |
| 60-79% | Yellow | On track |
| 80-99% | Light Green | Nearly there |
| 100%+ | Green | Goal achieved |

### Pipeline Coverage (Current Year Only)

Analyzes how much pipeline GCI covers the remaining goal:

```
Coverage Ratio = Pipeline GCI / Remaining Goal
```

| Coverage | Color | Interpretation |
|----------|-------|----------------|
| < 1.0x | Red | Pipeline insufficient to hit goal |
| 1.0-1.5x | Yellow | Pipeline covers goal but tight |
| > 1.5x | Green | Healthy pipeline buffer |

**Pipeline includes:**
- UC/Contingent deals
- Negotiating LOI deals
- At Lease/PSA deals

### Year-over-Year Comparison

Shows performance comparison vs the prior year:
- Current GCI vs prior year final GCI
- Current deals booked vs prior year final count
- Percentage change (green = improvement, red = decline)

---

## Year Selector (Admin Only)

Admins can select any year from 2020 to next year to:

1. **View historical goals** - See what targets were set
2. **View historical performance** - See actual results
3. **Add/edit goals retroactively** - Fix missing historical data
4. **Plan future goals** - Set next year's targets

When viewing a non-current year:
- Shows "Historical" badge
- Displays "Final results for [year]"
- Hides Pipeline Coverage (not relevant for closed years)
- YoY comparison adjusts to that year's prior year

---

## Data Sources

### Goals
- **Table**: `goal`
- **Fields**: `id`, `year`, `goal_type`, `target_value`, `created_at`, `updated_at`
- **Unique constraint**: One goal per year per type

### Booked/Closed Deals
- **Table**: `deal`
- **Filter**:
  - `stage_id` IN (Booked, Executed Payable, Closed Paid)
  - `booked_date` within selected year
- **Fields used**: `gci`, `booked_date`

### Pipeline Deals
- **Table**: `deal`
- **Filter**: `stage_id` IN (UC/Contingent, Negotiating LOI, At Lease/PSA)
- **Fields used**: `gci`

---

## Calculations

### GCI Progress
```
GCI Progress % = (Booked GCI / GCI Target) * 100
```

### Deals Progress
```
Deals Progress % = (Deals Booked / Deals Target) * 100
```

### Remaining Goal
```
GCI Remaining = GCI Target - Booked GCI
Deals Remaining = Deals Target - Deals Booked
```

### Pipeline Coverage
```
Coverage = Pipeline GCI / GCI Remaining
(Only shown if GCI Remaining > 0)
```

### Year Progress
```
Year Progress % = Day of Year / 365
```

---

## Database Schema

### goal table

```sql
CREATE TABLE goal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('gci', 'deal_count')),
  target_value NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by_id UUID REFERENCES auth.users(id),
  updated_by_id UUID REFERENCES auth.users(id),
  UNIQUE(year, goal_type)
);
```

### Row Level Security

- **SELECT**: All authenticated users can read goals
- **INSERT/UPDATE/DELETE**: Admin role only

---

## UI Components

### Goal Card

Each goal type displays:
- Target value (large text)
- Progress bar with percentage
- Current progress value
- Remaining amount

### Edit Mode (Admin)

When editing a goal:
1. Click "Edit" button
2. Enter numeric target value
3. Click "Save" to update or "Cancel" to discard
4. Loading state shown during save

### Empty State

When no goal is set:
- Admin: "Click Edit to set a [goal type] target"
- Non-admin: "No [goal type] target set for this year"

---

## Files

| File | Description |
|------|-------------|
| `src/components/reports/GoalDashboard.tsx` | Main goal dashboard component |
| `src/pages/GoalManagementPage.tsx` | Admin page wrapper |
| `src/pages/CoachDashboardPage.tsx` | Coach dashboard with embedded goals |

---

## Stage IDs Reference

| Stage | UUID |
|-------|------|
| Booked | `0fc71094-e33e-49ba-b675-d097bd477618` |
| Executed Payable | `70d9449c-c589-4b92-ac5d-f84c5eaef049` |
| Closed Paid | `afa9a62e-9821-4c60-9db3-c0d51d009208` |
| Under Contract / Contingent | `583507f5-1c53-474b-b7e6-deb81d1b89d2` |
| Negotiating LOI | `89b7ce02-d325-434a-8340-fab04fa57b8c` |
| At Lease/PSA | `bd25eacc-e6c5-4e78-8d5f-25b4577ba5fd` |

---

## Changelog

| Date | Change |
|------|--------|
| Dec 2024 | Initial Goal Dashboard implementation |
| Dec 2024 | Added year selector for historical goal tracking |
| Dec 2024 | Added retroactive goal editing capability |

---

*Last Updated: December 2024*
