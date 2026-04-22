# Security Definer View Fixes

**Date:** 2026-04-22
**Trigger:** Supabase database linter flagged 19 views with `SECURITY DEFINER` and 2 tables without RLS

---

## RLS Disabled Tables (Fixed)

Enabled RLS with permissive authenticated read policies on:
- `esri_data_vintage`
- `traffic_cache`

## Security Definer Views

### Category 1: Server-side only — switched to `security_invoker`

These views are only queried from Edge Functions / agents using `service_role` key, which bypasses RLS. Safe to switch.

| View | Used in |
|------|---------|
| `v_hunter_dashboard` | hunter-agent briefing |
| `v_hunter_reconnect` | hunter-agent briefing |
| `v_hunter_outreach_queue` | hunter-agent briefing |
| `invoice_aging` | CFO agent tools |

### Category 2: Not queried in codebase — switched to `security_invoker`

These views exist in migrations but have no active query references. Safe to switch (or drop later).

| View |
|------|
| `v_dismissed_targets` |
| `v_prospecting_today_time` |
| `portal_site_submit_status` |
| `deal_current_stage_info` |
| `budget_vs_actual` |
| `deal_forecasting_summary` |

### Category 3: Client-side queries — LEFT AS `security_definer`

These views are queried from React components via the authenticated Supabase client. They were made `SECURITY DEFINER` to bypass RLS on underlying joined tables. Switching would likely return empty results.

| View | Used in |
|------|---------|
| `v_prospecting_weekly_metrics` | useProspectingMetrics hook |
| `v_prospecting_target` | TodaysPlan, TargetList components |
| `client_velocity_stats` | dealForecastingService, client/deal forecasting |
| `budget_vs_actual_monthly` | BrokerForecastDashboard |
| `v_contact_tags` | useContactTags hook |
| `v_prospecting_stale_targets` | useProspectingMetrics hook |
| `v_prospecting_daily_metrics` | useScorecardMetrics hook |
| `portal_user_analytics` | PortalAnalyticsPage |
| `document_handoff_history` | HandoffHistory component |

**To fix these in the future:** audit RLS policies on each underlying table the view joins, add missing policies, then switch to `security_invoker`.

---

## Revert SQL

If any view breaks after switching, revert with:

```sql
-- Revert a single view back to security_definer
ALTER VIEW public.<view_name> SET (security_invoker = off);
```

Or revert all 10 at once:

```sql
ALTER VIEW public.v_hunter_dashboard SET (security_invoker = off);
ALTER VIEW public.v_hunter_reconnect SET (security_invoker = off);
ALTER VIEW public.v_hunter_outreach_queue SET (security_invoker = off);
ALTER VIEW public.invoice_aging SET (security_invoker = off);
ALTER VIEW public.v_dismissed_targets SET (security_invoker = off);
ALTER VIEW public.v_prospecting_today_time SET (security_invoker = off);
ALTER VIEW public.portal_site_submit_status SET (security_invoker = off);
ALTER VIEW public.deal_current_stage_info SET (security_invoker = off);
ALTER VIEW public.budget_vs_actual SET (security_invoker = off);
ALTER VIEW public.deal_forecasting_summary SET (security_invoker = off);
```
