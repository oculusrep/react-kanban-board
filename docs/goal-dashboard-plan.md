# Goal Dashboard Implementation Plan

## Overview
A comprehensive dashboard for 2026 goal setting and 2025 performance review, designed for coaching sessions.

## Page Location
- **Route:** `/reports/goal-dashboard`
- **Menu:** Hamburger menu (reports menu)
- **Access Control:** User preference permission `can_view_goal_dashboard`
- **Page Name:** "Goal Dashboard"

---

## Section Layout (In Order)

### 1. 2025 Recap Section
Shows 2025 performance baseline with company-wide totals AND breakdown by broker.

**Metrics:**
- **Money Collected:** Actual payments received (from `payment` table, `paid_date` in 2025)
- **Deals Booked:** Count + GCI of deals with `booked_date` in 2025 and stage = Booked/Executed Payable/Closed Paid
- **Deals Closed:** Count + GCI of deals with `closed_date` in 2025 and stage = Closed Paid
- **2025 Goal vs Actual:** Compare original goals (38 transactions, $800k GCI) against actuals

**Breakdown by:**
- Company Total
- Mike & Arty (combined)
- Arty (solo)
- Greg (solo)

**Query References:**
- Collected payments: Reuse from `RobReport.tsx` lines 436-468 (filter for 2025)
- Booked/Closed deals: Reuse from `RobReport.tsx` lines 365-388 (filter for 2025)
- Broker splits: Use `commission_split` and `payment_split` tables

---

### 2. 2026 Goals Section (Admin-Editable)
Allows setting GCI and Transaction goals for the company and individual brokers.

**Goal Categories:**
- Company (total)
- Mike & Arty (team)
- Arty (solo)
- Greg (solo)

**Goal Types:**
- GCI Target ($)
- Transaction Count Target (#)

**For Both 2025 and 2026:**
- 2025 goals: Editable baseline for comparison (default: 38 transactions, $800k GCI)
- 2026 goals: New year targets

**Database Changes:**
The existing `goal` table needs a new column for `entity_type`:
- `company` - Company-wide goal
- `mike_arty` - Mike & Arty team goal
- `arty` - Arty individual goal
- `greg` - Greg individual goal

Current schema: `goal(id, year, goal_type, target_value)`
New schema: `goal(id, year, goal_type, target_value, entity_type)`

---

### 3. Gap Analysis Section
Visual comparison between 2025 actuals and 2026 goals.

**Views (all three, can hide later):**
1. **Table View:** 2025 Actual | 2026 Goal | Gap (difference)
2. **Progress Bars:** Percentage toward 2026 goal as year progresses
3. **By Category:** Breakdown for Mike & Arty, Arty, Greg, Company

**Includes:**
- 2025 Goal vs 2025 Actual comparison
- 2025 Actual vs 2026 Goal comparison

---

### 4. 2026 Cashflow Chart
Projected GCI by month based on invoiced payments.

**Data Source:**
- Invoiced payments from `payment` table
- Filter: Deals in Booked/Executed Payable stage
- Group by: `payment_date_estimated` (month)
- For 2026 calendar year

**Chart Type:** Bar chart or line chart showing monthly GCI projections

**Query Reference:**
- Invoiced payments: Reuse from `RobReport.tsx` lines 471-514

**Future Enhancement:** Filter by broker (company-wide to start)

---

### 5. Prospecting Metrics Section (Mike Only)
2025 prospecting activity summary.

**Metrics:**
- **Calls Made:** Count where `is_prospecting_call = true`
- **Completed Calls:** Count where `completed_call = true`
- **Meetings Held:** Count where `meeting_held = true`

**Display:**
- 2025 totals
- Expandable monthly breakdown

**Query Reference:**
- Activity queries: Reuse from `ProspectingDashboard.tsx` / `TodaysPlan.tsx`
- Filter by Mike's user ID
- Filter by `completed_at` in 2025

---

## Technical Implementation

### Files to Create
1. `/src/pages/GoalDashboardPage.tsx` - Main page component
2. `/src/components/reports/GoalDashboard2026.tsx` - Main dashboard component (or extend existing)

### Files to Modify
1. `/src/App.tsx` - Add route
2. `/src/components/Navbar.tsx` - Add hamburger menu item
3. `/src/types/permissions.ts` - Add `can_view_goal_dashboard` permission

### Database Changes
- Add `entity_type` column to `goal` table (values: 'company', 'mike_arty', 'arty', 'greg')
- Default existing rows to 'company'

### Constants (from RobReport.tsx)
```typescript
const BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',
};

const STAGE_IDS = {
  booked: '0fc71094-e33e-49ba-b675-d097bd477618',
  executedPayable: '70d9449c-c589-4b92-ac5d-f84c5eaef049',
  closedPaid: 'afa9a62e-9821-4c60-9db3-c0d51d009208',
};
```

---

## UI/UX Notes
- Match existing OVIS styling (cards, tables, progress bars)
- Use existing chart patterns (Recharts available)
- Admin-editable fields with inline edit/save/cancel pattern
- Collapsible sections for detailed breakdowns
