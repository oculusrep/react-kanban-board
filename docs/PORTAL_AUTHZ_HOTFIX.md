# Portal / role authorization hotfix — 2026-09-22

**Status:** applied to the shared production database (`20260922094836_portal_authz`, `20260922094837_cron_caller_auth`), all six edge functions deployed, branch `hotfix/portal-authz` **not merged**. Follow-on: `feature/portal-field-control`.

Companion to [EMAIL_RLS_HOTFIX](#see-also): that one scoped email tables; this one fixes the role helper underneath everything else.

## What was wrong

```sql
-- before
SELECT COALESCE((SELECT ovis_role FROM "user" WHERE id = auth.uid()), 'broker_full')
```

`user.id` is the OVIS primary key; `auth.uid()` is the auth identity. They are equal for **exactly one account** — the admin — so every other caller fell through to the `'broker_full'` default. Measured, by impersonation: one client-portal login could read 5,923 contacts, 4,775 properties, 772 deals, 7,883 critical dates, 245 commission splits and 369 payments, and write most of them. The external coach likewise.

**The UI is not the boundary.** The portal never renders commission or payment fields, but Supabase exposes every table at `/rest/v1/<table>`, and a portal user holds both the publishable key and their own access token. Hiding a field in React removes it from the page, never from the API. That is why the fix is in RLS, and why `feature/portal-field-control` must serve the portal through a function with no direct SELECT on base tables.

### Two bugs cancelling out

The five role helpers and 19 policies still used pre-rename role names (`assistant`, `broker_limited`): the `ovis_role` FK rename cascaded to rows, never to function bodies or policy text — the same trap as the earlier VA/RLS incident. The broken `'broker_full'` default is what kept the VA working.

**Fixing the lookup alone removes all of the VA's access** (measured: 3,219 site submits → 0). Both had to be fixed in one migration. Policies were regenerated from `pg_policies` — the live definitions — not rebuilt from older migration files, so command, roles, `PERMISSIVE`, `USING` and `WITH CHECK` all carry over.

## Decisions taken

| | |
|---|---|
| No role match | Returns NULL. Helpers `COALESCE(..., false)` so a NULL can never be inverted into access by a `NOT` or `<>` in some policy. |
| VA | Treated exactly like `broker_full`, including payments and commission splits — preserving what the VA can do today, and matching the VA role's own `can_manage_payments`. |
| Coach | No access. Rob Report, Goal Dashboard and Scorecard read `deal`/`payment`/`commission_split` and **will be empty**. |
| broker_lite | Mapped from `broker_limited`. Loses write on 11 tables, returning to the read-only role its own policies describe. No broker_lite login exists. |

## Harness

`scripts/rls_role_harness.py` — 69 tables × 6 roles (admin, broker_full, broker_lite, va, coach, portal), reads *and* write probes, all inside one rolled-back transaction, before and after. broker_lite has no login, so one is simulated on a borrowed unmapped auth account inside the rollback.

Result: **no internal read losses, no VA write losses.** Coach and portal → 0 on the CRM. `anon` → permission denied.

Two defects the harness caught before this shipped, both of which a row-count-free review would have missed:

1. "Add `va` wherever `broker_full` appears" **widened** the VA on `portal_activity_log` (0 → 886). That policy checks `ovis_role` directly and was never broken. Excluded.
2. The first `activity` draft added an OR branch, granting internal users 21,267 email rows instead of the 13,071 they had. Rewritten as an added *requirement* over the original expression.

Write access is invisible to row counts, which is why the probes exist: a no-op `UPDATE ... SET col = col` per table, counting affected rows.

## Service-role functions

A function using the service-role key **bypasses RLS entirely**, so `verify_jwt` — which any portal JWT passes — was the only gate. `deal-synopsis` would summarise any deal's email-derived activity (`activity.subject` + `.description`) for any logged-in caller.

All six now share `_shared/caller-auth.ts`:

| function | service | internal user |
|---|---|---|
| deal-synopsis | — | ✅ |
| email-triage | ✅ (cron + gmail-sync) | ✅ (review page) |
| backfill-attachments / backfill-gmail-labels | ✅ | ✅ |
| send-portal-digest | — | ✅ |
| send-portal-comment-alert | ✅ | — |

"Internal" is checked by calling `is_internal_user()` **as the caller**, so the database's definition is the only one.

`send-portal-comment-alert` had `verify_jwt = false` and was callable by anyone on the internet. It is back on, and service-only. It had been sending `Bearer null` for months: its cron read a vault secret named `service_role_key` that has never existed.

### Cron authentication

Both crons now send `X-Cron-Secret` from vault (`ovis_cron_secret`, matching the `OVIS_CRON_SECRET` function secret) plus the public anon JWT purely to satisfy the platform gate. This is the shared-secret pattern `gcal-sync`, `ovis-sweep-tick` and the site-research worker already use, and it keeps the service-role key out of vault. **Slightly different from "service role only"** — the practical equivalent: only infrastructure holds the secret, no person can present one.

These two jobs were created directly in the database and had never been in a migration. They are now.

## Table RLS

- `site_submit_comment` — portal reads `visibility = 'client'` only (95 internal broker comments were exposed; the UI's `.eq('visibility','client')` is client-side and a direct API call skips it). Portal inserts are constrained the same way.
- `site_submit_activity` — portal reads `client_visible = true` and only its own tenant's rows (1,561 → 119); no portal write. The `capture_*` triggers are `SECURITY DEFINER`, **verified**: a portal user can still post a comment and the trigger still writes its activity row.
- `deal_synopsis`, `portal_email_send` (56,150 rows), `hunter_outreach_draft`, `property_activity`, `prospecting_activity`, `thread_message` — internal only. Surplus `anon`/`authenticated` grants revoked on all of them.

## INTERIM portal policies — delete these

The portal had **no policies of its own** on `client`, `site_submit`, `property`, `property_unit`, `deal` or `contact`. Every portal page worked only because clients were treated as brokers. Section 8 of the migration adds read-only, own-client policies so the portal keeps working:

> portal after: 1 client, 63 site submits, 63 properties, 106 units, its own contact row, **0** payments / commissions / critical dates.

`feature/portal-field-control` replaces them with the matrix-driven portal function; **delete section 8 then.** Notes for that branch:

- `deal` reaches the portal sidebar through `deal.site_submit_id`, not `client_id` — scope by both.
- The portal must be able to read its **own contact row** or `PortalContext` cannot finish loading.
- `portal_user_client_ids()` / `portal_user_contact_id()` are `SECURITY DEFINER`, so policies using them don't require the portal to read `contact` or `portal_user_client_access`.

## Found, not fixed

- **`is_portal_visible_stage()` is broken** — it selects `submit_stage.stage_name`, a column that does not exist, so it throws whenever called. It is dead code (no caller in policies, functions, views or `src/`). Deliberately not used by the interim policies.
- `gmail-sync` still has no caller check and its cron still sends a hardcoded legacy anon JWT.
- ~30 other public tables have policies that never reference the caller (`restaurant_trend`, `merchant_location`, `note`, `property_note`, …), and 11 tables have RLS disabled entirely. Reported separately; out of scope here.

## See also

- `docs/KNOWLEDGE_CAPTURE.md` — Intel feature
- `hotfix/email-rls` — the email-table lockdown this builds on (also unmerged at time of writing)
