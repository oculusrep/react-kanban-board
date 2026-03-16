# Deal Forecasting System

Automated payment date estimation and pipeline forecasting based on deal velocity and timeline data.

**Created:** March 2, 2026
**Status:** ✅ Deployed

---

## Overview

This system provides intelligent payment date estimation for pipeline deals, enabling accurate revenue forecasting even when brokers haven't entered specific dates. It uses historical velocity data, deal-specific timeline fields, and critical dates to calculate when payments are expected.

---

## Core Concepts

### Deal Timeline Anchors

| Stage | Clock Start | Anchor Date Field |
|-------|-------------|-------------------|
| Negotiating LOI | `deal.loi_date` → `site_submit.loi_date` → `deal.created_at` → `CURRENT_DATE` | - |
| At Lease/PSA | `loi_signed_date` → `last_stage_change_at` → `created_at` → `CURRENT_DATE` | Resets estimates from this date |
| Under Contract/Contingent | `contract_signed_date` | Resets estimates from this date |

**Note:** The system uses a fallback chain for anchor dates. If earlier dates are missing, it falls back to the next available date, ultimately using `CURRENT_DATE` if no historical dates exist. The function now checks both `deal.loi_date` and `site_submit.loi_date` for the LOI stage anchor.

### Velocity Defaults (Overrideable)

| Stage | Default Duration | Source Priority |
|-------|------------------|-----------------|
| Negotiating LOI | 30 days | 1. Historical (5+ deals) → 2. Client override → 3. Global default |
| At Lease/PSA | 45 days | 1. Historical (5+ deals) → 2. Client override → 3. Global default |

### Payment Date Estimation Formulas

**Lease Deals (2 payments):**
```
Estimated Execution Date =
  - If in LOI: loi_date + LOI velocity + At Lease/PSA velocity
  - If in At Lease/PSA: loi_signed_date + At Lease/PSA velocity
  - If in Under Contract+: contract_signed_date (actual)

Payment 1 = Estimated Execution Date + Contingency Period
  (if no contingency period, Payment 1 = Estimated Execution Date)

Payment 2 = Estimated Execution Date + Contingency Period + Rent Commencement Period
  (default rent commencement: 180 days if not entered)
```

**Purchase Deals (1 payment):**
```
Estimated Close Date = Contract Execution Date + Due Diligence Period + Closing Deadline
  (default closing deadline: 30 days)

Payment 1 = Estimated Close Date
```

### Behind Schedule Logic

When a deal exceeds expected stage duration:
```
weeks_behind = floor((actual_days_in_stage - expected_days) / 7)

If weeks_behind > 0:
  - Set is_behind_schedule = true
  - Push all payment estimates forward by (weeks_behind * 7) days
  - Kanban card turns pink
```

Rechecked weekly - adds another week for each 7 days over threshold.

---

## Database Schema

### Deal Table - New Fields

```sql
ALTER TABLE deal ADD COLUMN contingency_period_days INTEGER;
ALTER TABLE deal ADD COLUMN rent_commencement_days INTEGER;
ALTER TABLE deal ADD COLUMN due_diligence_days INTEGER;
ALTER TABLE deal ADD COLUMN closing_deadline_days INTEGER DEFAULT 30;
ALTER TABLE deal ADD COLUMN estimated_execution_date DATE;
ALTER TABLE deal ADD COLUMN is_behind_schedule BOOLEAN DEFAULT FALSE;
ALTER TABLE deal ADD COLUMN weeks_behind INTEGER DEFAULT 0;
ALTER TABLE deal ADD COLUMN loi_date DATE;
```

| Field | Type | Description |
|-------|------|-------------|
| `contingency_period_days` | integer | Permit/contingency period for leases |
| `rent_commencement_days` | integer | Days from execution to rent commencement |
| `due_diligence_days` | integer | Due diligence period for purchases |
| `closing_deadline_days` | integer | Days after DD to close (default 30) |
| `estimated_execution_date` | date | Calculated, but broker can override |
| `is_behind_schedule` | boolean | True when over expected stage duration |
| `weeks_behind` | integer | Number of weeks behind schedule |
| `loi_date` | date | From site submit, clock start for deal |

### LOI Date Sync

The `loi_date` field is bidirectionally synced between `deal` and `site_submit` tables:

| Direction | Trigger | Behavior |
|-----------|---------|----------|
| site_submit → deal | `trigger_sync_loi_date_from_site_submit` | When site_submit.loi_date updates, deal.loi_date updates |
| deal → site_submit | `trigger_sync_loi_date_from_deal` | When deal.loi_date updates, all linked site_submits update |
| New site_submit | `trigger_sync_loi_date_on_site_submit_insert` | If new site_submit has loi_date and deal has none, sync to deal |

**Source of Truth:** Site Submit LOI Written Date is the primary entry point. When entered there, it automatically populates the Deal Timeline LOI Date.

**UI Location:**
- Site Submit: "LOI Written Date" field (with "LOI Written" checkbox)
- Deal: "LOI Date" field in Timeline section (synced from site_submit)

**Migration:** `20260303_sync_loi_date_between_deal_and_site_submit.sql`

### Payment Table - New Fields

```sql
ALTER TABLE payment ADD COLUMN payment_date_auto_calculated DATE;
ALTER TABLE payment ADD COLUMN payment_date_source TEXT DEFAULT 'auto';
```

| Field | Type | Description |
|-------|------|-------------|
| `payment_date_auto_calculated` | date | System-calculated estimate |
| `payment_date_source` | text | 'auto', 'broker_override', or 'critical_date' |

### Client Table - New Fields

```sql
ALTER TABLE client ADD COLUMN velocity_loi_days_override INTEGER;
ALTER TABLE client ADD COLUMN velocity_lease_psa_days_override INTEGER;
```

| Field | Type | Description |
|-------|------|-------------|
| `velocity_loi_days_override` | integer | Override default LOI stage duration |
| `velocity_lease_psa_days_override` | integer | Override default At Lease/PSA duration |

### App Settings - New Keys

| Key | Default | Description |
|-----|---------|-------------|
| `velocity_loi_days_default` | 30 | Default LOI stage duration |
| `velocity_lease_psa_days_default` | 45 | Default At Lease/PSA duration |
| `default_rent_commencement_days` | 180 | Fallback rent commencement period |
| `default_closing_deadline_days` | 30 | Fallback closing deadline |
| `velocity_min_deals_for_historical` | 5 | Min closed deals to use client history |
| `behind_schedule_threshold_days` | 7 | Days over before marking behind |
| `friday_email_recipients` | [] | User IDs for weekly CFO email |

---

## UI Components

### 1. Deal Page - Forecasting Section

Collapsible section in deal form showing:

**For Leases:**
- Contingency Period (days) - with helper: "If not entered, assuming 0 days"
- Rent Commencement Period (days) - with helper: "If not entered, assuming 180 days"
- Estimated Execution Date (calculated, editable)
- Payment 1 Estimated Date (calculated)
- Payment 2 Estimated Date (calculated)

**For Purchases:**
- Due Diligence Period (days)
- Closing Deadline (days) - with helper: "If not entered, assuming 30 days"
- Estimated Close Date (calculated, editable)
- Payment Estimated Date (calculated)

### 2. Deal Creation - Smart Prompt

When creating a deal, prompt for:
- Deal type (Lease/Purchase)
- Contingency Period or Due Diligence Period
- Rent Commencement Period or Closing Deadline
- Show calculated estimates based on entries

### 3. Critical Dates Tab - Red Indicator

When deal is in Under Contract/Contingent or later stage AND critical dates are not entered:
- Critical Dates tab label turns red
- Appears in CFO audit report

### 4. Master Pipeline Kanban - Behind Schedule

Cards display behind-schedule status with:
- Card background turns pink
- Badge shows "Xw behind" (e.g., "2w behind")

**Real-Time Calculation (March 2026 Update):**
The kanban now calculates `weeks_behind` in real-time based on the current stage duration, rather than using stored database values. This ensures the badge always matches the "days in stage" display.

| Stage | Expected Days | Behind After |
|-------|---------------|--------------|
| Negotiating LOI | 30 | 37 days (30 + 7 threshold) |
| At Lease / PSA | 45 | 52 days (45 + 7 threshold) |

Formula: `weeks_behind = floor((days_in_stage - expected_days) / 7)`

**Stage Change Reset:**
When a deal moves out of a tracked stage (LOI or At Lease/PSA), the `is_behind_schedule` and `weeks_behind` fields are automatically reset to `false`/`0` both in the UI and database.

### 5. Client Page - Forecasting Section

New section showing:
- Historical Velocity Stats:
  - "Average LOI duration: 22 days (based on 7 closed deals)"
  - "Average At Lease/PSA duration: 38 days (based on 7 closed deals)"
- Override Fields:
  - LOI Stage Duration Override (days)
  - At Lease/PSA Stage Duration Override (days)

### 6. Finance Module - Settings (Gear Icon)

Settings page accessible via gear icon:
- LOI Stage Duration Default
- At Lease/PSA Stage Duration Default
- Default Rent Commencement Period
- Default Closing Deadline
- Minimum Deals for Historical Velocity
- Behind Schedule Threshold (days)
- Friday Email Recipients

---

## Estimation Logic

### Recalculation Triggers

Payment estimates recalculate when:
1. **Deal stage changes** - New anchor date, recalc downstream
2. **Forecasting fields updated** - contingency_period_days, rent_commencement_days, etc.
3. **LOI Date changes** - Clock start changes
4. **Critical dates entered** - Switch source to 'critical_date'
5. **Weekly behind-schedule check** - Auto-push if over threshold

**Important:** If `payment_date_source` = 'broker_override', do NOT overwrite.

### Velocity Priority

1. **Historical data** - If client has 5+ closed deals, use their actual average
2. **Client override** - If set on client record
3. **Global default** - From app_settings

### Behind Schedule Auto-Push

Checked on a schedule (daily or on deal view):
```
expected_days = velocity for current stage
actual_days = days since entered current stage
overage = actual_days - expected_days

if overage >= behind_schedule_threshold:
  weeks_behind = floor(overage / 7)
  is_behind_schedule = true
  push all estimates forward by (weeks_behind * 7) days
```

---

## CFO Agent Tools

### New Tools

| Tool | Description |
|------|-------------|
| `get_pipeline_forecast_with_estimates` | Revenue forecast using auto-calculated dates + probability weighting |
| `get_broker_take_home` | Broker's commission breakdown by deal + total (role-based access) |
| `get_house_profit` | Oculus profit for month/quarter/year |
| `get_deals_behind_schedule` | Pink card deals, weeks behind, forecast impact |
| `get_deals_needing_date_review` | Missing critical dates or auto-calc differs from override |
| `get_payments_pushed_to_next_year` | Payments originally forecast this year, now pushed |
| `get_forecast_accuracy` | Compare past estimates vs actual payment dates |

### Probability Weighting

| Stage | Probability |
|-------|-------------|
| Negotiating LOI | 50% |
| At Lease/PSA | 75% |
| Under Contract/Contingent | 85% |
| Booked | 90% |
| Executed Payable | 95% |
| Closed Paid | 100% |

---

## Friday CFO Summary Email

**Sent:** 9:00 AM Eastern Time every Friday to admin
**Edge Function:** `friday-cfo-email`
**Cron Jobs:**
- `friday-cfo-email-summer`: 13:00 UTC Fridays (9am EDT)
- `friday-cfo-email-winter`: 14:00 UTC Fridays (9am EST)

The function includes timezone-aware logic that checks if it's Friday 8-10 AM Eastern Time before sending. Only one email is sent per Friday regardless of which cron fires. Use `?force=true` query parameter to bypass timezone check for testing.

### Section 1: Personal & Company Financials
- Mike's Estimated Take-Home: This Month | This Year
- Arty's Estimated Take-Home: This Month | This Year
- Oculus (House) Profit: YTD Actual | Estimated Year-End
- Budget Variance: This Month (over/under) | YTD (over/under)

### Section 2: Critical Dates Audit
Deals in Under Contract/Contingent or later missing critical dates:
- Deal Name
- Client
- Broker
- Days in Stage
- Estimated Payment Amount
- Sorted by payment amount (biggest $ impact first)

### Section 3: Pipeline Health
- Deals behind schedule (count, total $ impact)
- Payments pushed from this year to next year (count, total $)

**Format:** Summary in email body with "View Full Report" links to CFO Dashboard

---

## Implementation Phases

### Phase 1: Database Migrations ✅
- Deal table new fields
- Payment table new fields
- Client table new fields
- App Settings new keys
- Migration: `20260302_deal_forecasting_system.sql`
- Fix migration: `20260302_fix_payment_estimates.sql` (JSONB extraction fix)
- Deal table `created_at` column now has DEFAULT NOW() and NOT NULL constraint

### Phase 2: UI Components ✅
- Deal page Forecasting section (`ForecastingSection.tsx`)
- Kanban pink cards + badge (`KanbanBoard.tsx`)
- Client page Forecasting section (`ClientForecastingSection.tsx`)
- Finance module settings page (`FinanceSettingsPage.tsx`)

### Phase 3: Estimation Logic ✅
- Service: `dealForecastingService.ts`
- Auto-calculate payment dates
- Recalculation triggers
- Historical velocity calculation
- Behind schedule detection + auto-push

### Phase 4: CFO Agent Tools ✅
- All 7 new tools added to `cfo-tools.ts`
- Update existing forecast tools to use estimates

### Phase 5: Friday Email ✅
- Edge Function: `friday-cfo-email/index.ts`
- Deployed with timezone-aware scheduling
- Cron jobs configured (13:00 and 14:00 UTC Fridays)

---

## Files Reference

```
# Database
supabase/migrations/20260302_deal_forecasting_system.sql      # Schema changes
supabase/migrations/20260302_fix_payment_estimates.sql        # JSONB extraction fix + CURRENT_DATE fallback
supabase/migrations/20260302_auto_calculate_payment_dates.sql # Auto-calc trigger on payment insert
supabase/migrations/20260302100000_friday_cfo_email_cron.sql  # Cron job setup
supabase/migrations/20260303_sync_loi_date_between_deal_and_site_submit.sql # Bidirectional LOI date sync

# UI Components
src/components/deals/ForecastingSection.tsx                 # Deal forecasting UI
src/components/clients/ClientForecastingSection.tsx         # Client velocity stats
src/components/KanbanBoard.tsx                              # Pink card styling + badge
src/pages/admin/FinanceSettingsPage.tsx                     # Global defaults (/admin/finance/settings)
src/pages/FinanceHubPage.tsx                                # Gear icon to settings

# Services
src/services/dealForecastingService.ts                      # Payment estimation logic
src/hooks/useKanbanData.ts                                  # Kanban query with forecasting fields

# Edge Functions
supabase/functions/_shared/cfo-tools.ts                     # 7 new CFO Agent tools
supabase/functions/friday-cfo-email/index.ts                # Weekly email job
```

---

## Deployment Notes

### Edge Function Deployment
```bash
npx supabase functions deploy friday-cfo-email --no-verify-jwt
```

### Cron Job Setup
The cron jobs are created via migration `20260302100000_friday_cfo_email_cron.sql` which:
1. Creates two pg_cron jobs for EST/EDT coverage
2. Uses `pg_net` to call the Edge Function with service role auth
3. The function's timezone logic ensures only one email sends per Friday

To verify cron jobs:
```sql
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE 'friday-cfo%';
```

### Testing the Friday Email
```bash
# Force send (bypasses timezone check)
curl -X POST "https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/friday-cfo-email?force=true" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

---

## Troubleshooting

### Payments Missing Estimated Dates

If payments don't have estimated dates, use the diagnostic function:

```sql
-- Check a specific deal
SELECT * FROM debug_payment_estimates('deal-uuid-here');

-- Or check the first LOI deal automatically
SELECT * FROM debug_payment_estimates();
```

Common issues:
1. **No active payments** - Generate payments first via the deal's Payment tab
2. **LOI Velocity = 0** - Check `app_settings` has `velocity_loi_days_default`
3. **Deal has no anchor date** - Ensure `loi_date` or `created_at` is populated

### Recalculating Payment Dates

To recalculate dates for existing payments:

```sql
-- Single deal
SELECT recalculate_payment_dates_for_deal('deal-uuid-here');

-- All pipeline deals
SELECT recalculate_payment_dates_for_deal(d.id)
FROM deal d
JOIN deal_stage ds ON ds.id = d.stage_id
WHERE ds.label NOT IN ('Lost', 'Closed Paid');
```

### Auto-Calculation Trigger

New payments automatically get estimated dates via the `trigger_auto_calculate_payment_dates` trigger (AFTER INSERT on payment table).

---

## Future Enhancements

- Monte Carlo simulation for payment date confidence intervals
- Machine learning model trained on historical velocity
- Broker-specific velocity tracking
- Deal complexity scoring affecting estimates
- Integration with external calendar for critical date reminders
