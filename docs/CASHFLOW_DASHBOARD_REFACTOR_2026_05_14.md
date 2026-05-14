# Cashflow Dashboard → Forecast Tab Consolidation (2026-05-14)

## What got built

Consolidated the standalone Cashflow Dashboard into a tab on the Cash Flow Forecast page, and reframed the page around the primary question:

> **"What is my company and personal cash position?"**

### Page layout (top → bottom) at `/admin/budget/forecast`

1. **Header** — Back, title, year selector + Refresh (Refresh/year only show on the Forecast tab).
2. **Cash Position answer card** — prominent, brand-colored card with two big numbers:
   - **Company Net Profit** = House Net − Operating Expenses
   - **Mike's Net Commissions** = sum of `payment_split` rows for Mike for the month
   - Defaults to the current calendar month; falls back to January if year ≠ current year.
   - Visible on **both** tabs.
3. **Tab nav** — `?tab=` query param drives state.
   - **Cash Flow Forecast** (default) — full P&L view with expenses.
   - **Broker Splits** — embedded `<CashflowDashboard embedded />`.

### Net profit math (corrected)

The previous "Net Cash Flow" column double-counted COGS:

- **Before:** `Net Cash = House Net − (Operating + COGS)` ← double counts; broker splits + referrals are already deducted from House Net.
- **After:** `Net Profit = House Net − Operating` only.

This also fixed a latent label/number mismatch: the Operating Expenses summary card had been labeled "Budgeted (excl. COGS)" but its number included COGS. Now matches.

The COGS column in the Monthly Breakdown table is kept for reference but is **not** subtracted in Net Profit anywhere.

### Monthly Breakdown table changes (Forecast tab)

- Renamed `Net Cash` column → `Net Profit`.
- New `Mike's Net` column (deep midnight blue, brand color `#002147`).
- Per-payment drill-down now shows a `Mike's Split: $X` line alongside the Check / Referral / Broker Splits / House Net breakdown.
- Footer notes rewritten to explain the corrected semantics.

### Broker Splits tab

Renders `<CashflowDashboard embedded />`. New `embedded` prop on [src/components/reports/CashflowDashboard.tsx](../src/components/reports/CashflowDashboard.tsx) hides the standalone "Cashflow Planning" header card and replaces it with a compact one-line **Lens:** selector (Company GCI / Company House Net / Mike / Arty / Greg).

Includes:
- Per-payment expansion with full Check / Referral / Mike / Arty / Greg / House Net breakdown.
- **Mike's Split & House Net Rollup** table: 12 monthly rows, each expandable to its weekly rows (Mon–Sun by Monday's calendar month, approach A: boundary weeks appear in both months with month-scoped partial totals).
- The week algorithm in [src/components/reports/CashflowDashboard.tsx#L337-L394](../src/components/reports/CashflowDashboard.tsx#L337) starts each month's iteration at the Monday on/before the 1st of the month, so payments at month boundaries don't get orphaned.

### Routing & navigation

- `/reports/cashflow-dashboard` → `<Navigate to="/admin/budget/forecast?tab=splits" replace />` ([src/pages/CashflowDashboardPage.tsx](../src/pages/CashflowDashboardPage.tsx)). Old bookmarks redirect to the new tab.
- Cashflow Dashboard entries removed from both desktop and mobile menus in [src/components/Navbar.tsx](../src/components/Navbar.tsx). Goal Dashboard entries untouched.
- App.tsx route still wraps the redirect in `<CoachRoute>` — fine, since coaches still get bounced and the redirect target's `<AdminRoute>` gates real access.

### Data scope (important)

Both tabs are **forward-looking only**:

```
.eq('is_active', true)
.or('payment_received.eq.false,payment_received.is.null')
```

So everything on this page reflects **what's owed but not yet collected**. Already-received payments disappear from this view. There is no "Mike YTD collected" view here — there's a separate `Mike Is Owed Report` at `/reports/mike-is-owed` (not investigated this session).

---

## Known issue to fix on return

### Pipeline / UC toggle not propagating to per-payment drill-down

**Bug:** unchecking the **Pipeline 50%+** checkbox correctly removes pipeline-category dollars from the monthly column totals and from `Total Income` / `Net Profit`, but **doesn't remove the pipeline-stage deals from the per-payment list that appears when you expand a month** in the Forecast tab's Monthly Breakdown table.

**Why:** `monthlyForecasts[idx].payments` is bucketed purely by date+year in [CashFlowForecastPage.tsx#L310-L314](../src/pages/CashFlowForecastPage.tsx#L310). The category filtering (Pipeline / UC) only happens when computing `invoicedIncome` / `pipelineIncome` / `ucContingentIncome` in [#L317-L327](../src/pages/CashFlowForecastPage.tsx#L317). The expanded drill-down at [#L869-L913](../src/pages/CashFlowForecastPage.tsx#L869) iterates `forecast.payments` unfiltered, so pipeline-stage payments remain visible even when their checkbox is off.

**Fix sketch:** In the per-payment expansion, filter `forecast.payments` by:

```typescript
forecast.payments.filter(p =>
  p.category === 'invoiced'
  || (p.category === 'pipeline' && includePipeline)
  || (p.category === 'ucContingent' && includeUcContingent)
)
```

The `Expected Income (N payments)` heading count should also use the filtered length to stay consistent. Also worth checking whether the same bug exists in the Broker Splits tab's expanded view — that one filters at [src/components/reports/CashflowDashboard.tsx#L716-L723](../src/components/reports/CashflowDashboard.tsx#L716) so it should be fine, but verify.

---

## Follow-up: COGS removed from budgeting tools (same day)

Confirmed the brokerage accounting principle: **OVIS budget = Operating Expenses only.** COGS is not budgeted because broker splits + referral fees fire mechanically when a commission check arrives — there's no planning decision to make.

### Forecast page

- Dropped `cogsExpenses` and `budgetedExpenses` from `MonthlyForecast`.
- Data fetch now skips `Cost of Goods Sold` account types alongside Income/Other Income.
- Monthly Breakdown table no longer has COGS / Total Expenses columns — just Operating Expenses sits between Total Income and Net Profit.
- Heaviest / Lightest Months cards now sort by `operatingExpenses` (not the combined total).
- Surplus / Deficit month cards show `operatingExpenses` in their "Out:" breakdown.
- Bottom chart "Budget Expense Analysis by Month" (was stacked COGS+Operating) replaced with a single-series "Operating Expenses by Month" bar chart.
- "Net Cash" line in the monthly cash-flow chart relabeled to "Net Profit".
- Footer notes rewritten to explain why COGS is absent.

### Budget Setup ([src/pages/BudgetSetupPage.tsx](../src/pages/BudgetSetupPage.tsx))

- `qb_account` query now fetches only `['Expense', 'Other Expense']` — COGS removed.
- COGS/Exp badge UI collapsed to just "Exp".

### Budget Manager ([src/pages/BudgetManagePage.tsx](../src/pages/BudgetManagePage.tsx))

- Removed the "Cost of Goods Sold" section from `SECTION_DEFINITIONS`.
- `qb_account` query now fetches only `['Expense', 'Other Expense']`.

### Budget Dashboard ([src/pages/BudgetDashboardPage.tsx](../src/pages/BudgetDashboardPage.tsx)) — intentionally NOT changed

This page is the actuals/reporting view (full P&L with QB actuals + budget comparison). COGS legitimately appears there as actuals (commission payouts post through COGS accounts in QuickBooks). The budget column for COGS will naturally read as $0 since no one can input COGS budgets anymore. Worth a separate pass to clean up the visual treatment of "COGS budget" columns if they show prominently in this view — flagged for a follow-up.

### Memory saved

`/Users/mike/.claude/.../memory/project_budget_no_cogs.md` — preserves this domain rule for future sessions so the next person/agent doesn't reintroduce COGS into a budget query.

## Files touched this session

- [src/pages/CashFlowForecastPage.tsx](../src/pages/CashFlowForecastPage.tsx) — tab nav, answer card, net profit math, Mike's Net column, Mike's Split line in drill-down, `payment_split` fetch, **COGS removed from forecast page**.
- [src/components/reports/CashflowDashboard.tsx](../src/components/reports/CashflowDashboard.tsx) — `embedded` prop, compact Lens selector, weekly rollup with month-expansion, per-payment Mike/Arty/Greg detail.
- [src/pages/CashflowDashboardPage.tsx](../src/pages/CashflowDashboardPage.tsx) — replaced with redirect.
- [src/components/Navbar.tsx](../src/components/Navbar.tsx) — removed Cashflow Dashboard entries (desktop + mobile).
- [src/pages/BudgetSetupPage.tsx](../src/pages/BudgetSetupPage.tsx) — COGS removed from account fetch + badge UI.
- [src/pages/BudgetManagePage.tsx](../src/pages/BudgetManagePage.tsx) — COGS section + COGS from account fetch removed.

## Pre-existing issues not addressed

These were flagged during typechecking but are unrelated to this work:

- `effectiveBrokerIds`, `yearStart`, `yearEnd`, `DollarSign`, `CreditCard`, `userRole` — declared-but-unused warnings.
- Recharts `Tooltip` `formatter` type incompatibility (`Type '(value: number) => [string, ""]' is not assignable...`). Affects 4 chart instances in this file plus 1 in `CashflowDashboard.tsx`. Pre-existing, ignored.

## What to verify in browser when picking this up again

1. `/admin/budget/forecast` shows the Cash Position card at the top with current-month numbers.
2. Switch to Broker Splits tab → card still visible, splits view renders.
3. Old `/reports/cashflow-dashboard` URL redirects.
4. Hamburger menu no longer shows "💰 Cashflow Dashboard".
5. **Reproduce the Pipeline-toggle bug:** with Pipeline checked, expand a month with pipeline-stage payments; uncheck Pipeline; payments should disappear from the drill-down but currently don't.
