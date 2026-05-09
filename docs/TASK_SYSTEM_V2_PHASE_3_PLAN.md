# Task System v2 — Phase 3 Implementation Plan

**Branch:** `feat/tasks-v2-phase-3`
**Spec:** [TASK_SYSTEM_V2_SPEC.md](./TASK_SYSTEM_V2_SPEC.md) — §9 Calendar Sync
**Status:** 📝 Drafted 2026-05-09, not started

Phase 3 lands **Google Calendar pull-only sync** + the **Conflicts lane** on the dashboard. Single direction (Calendar → OVIS), multi-calendar per user, polling + webhook with manual "Sync now" fallback.

This is the heaviest phase by external surface area. Mitigation: the existing Gmail OAuth flow ([gmail_connection](../database-schema.ts), `gmail-connect`/`gmail-callback`/`gmail-sync` edge functions) is the exact template — same Google OAuth, similar token storage, similar sync engine shape.

## Scope of Phase 3

**In scope:**
- **Google OAuth (Calendar scope)** — `google_calendar_connection` table mirroring `gmail_connection`. Edge functions `gcal-connect` / `gcal-callback` / `gcal-disconnect`.
- **Multi-calendar config** — user picks which calendars (primary + personal + team) to read from. `google_calendar_subscription` table + UI on a Calendar Settings page.
- **Pulled events storage** — `external_calendar_event` table holding events from subscribed calendars.
- **Sync engine** — `gcal-sync` edge function. Pulls events for the next N days per subscribed calendar.
- **Polling cadence** — pg_cron schedule invoking `gcal-sync` every 5 minutes.
- **Webhook receiver** — `gcal-webhook` edge function that handles Google push notifications (near-real-time).
- **Manual "Sync now" button** — dashboard control that invokes `gcal-sync` for the current user.
- **Conflict detection** — view or function that returns event/block overlaps for (owner, date). Computed on demand; no separate conflicts table.
- **Conflicts lane** — small card next to Top 3 / Inbox on the dashboard. Lists current overlaps with a one-click resolve action (jump to the conflicting block's edit modal or jump to the meeting in Google).
- **Events on the timeline** — pulled events render as fixed slots interleaved with blocks (visual cue that the time isn't free).
- **Calendar settings page** at `/settings/calendars` — connect/disconnect Google account, pick calendars to subscribe.

**Deferred:**
- **Push back to Google** — pull-only per spec §9.1.
- **Reverse capture (drag Google event → task)** — explicitly deferred per spec §9.5.
- **Per-event categorization** — events are display-only; can't be classified, snoozed, or pinned.
- **Conflict notifications via email** — Phase 4 (notifications). Phase 3 lands the in-app Conflicts lane only.
- **Webhook channel rotation logic** — Google channels expire after a max of 7 days (calendar API). For first ship, use polling as the primary; add channel-renew cron in a follow-up if push notifications stay healthy.

## Work order (proposed PRs)

Most are sequential — the schema and OAuth wiring need to land before sync works.

| # | Title | Files (representative) | Risk |
|---|---|---|---|
| 1 | Schema: connection / subscription / event tables + RLS | `supabase/migrations/2026XXXX000000_task_system_v2_calendar_schema_phase3.sql`, regen `database-schema.ts` | Medium — three new tables, RLS, careful FK to "user" |
| 2 | Domain types + CRUD hooks | `src/types/calendar.ts`, `src/hooks/useGoogleCalendarConnection.ts`, `useCalendarSubscriptions.ts`, `useExternalCalendarEvents.ts` | Low |
| 3 | OAuth edge functions: gcal-connect / gcal-callback / gcal-disconnect | `supabase/functions/gcal-connect/index.ts`, `gcal-callback/index.ts`, `gcal-disconnect/index.ts` | Medium — Google OAuth wiring; mirror gmail-* exactly |
| 4 | Calendar settings page at /settings/calendars | `src/pages/CalendarSettingsPage.tsx`, route in `App.tsx` | Low — list calendars, connect/disconnect, subscription toggles |
| 5 | gcal-sync edge function — pulls events per subscribed calendar | `supabase/functions/gcal-sync/index.ts` | Medium — Google Calendar API calls, idempotent upsert into `external_calendar_event` |
| 6 | Cron schedule + manual Sync now button | pg_cron migration, dashboard "↻ Sync" control | Low — cron runs the same edge function |
| 7 | Conflict detection + Conflicts lane | `src/lib/calendarConflicts.ts` (overlap math), `src/components/tasks/dashboard/ConflictsLane.tsx`, mounted on TasksDashboardPage | Medium — visual surface |
| 8 | Calendar events on the timeline (interleaved with blocks) | render-only changes in `TodaysTimeline` | Low — visual addition |

PRs 1–6 form the minimum viable sync (you can connect, subscribe, and the dashboard shows pulled events). PR 7 adds the Conflicts lane. PR 8 puts events on the timeline. The webhook PR (`gcal-webhook`) was deferred per the resolved decisions — polling alone is acceptable for v1.

## Schema notes (PR 1)

Three tables. RLS: each user sees only their own connections / subscriptions / events.

### `google_calendar_connection`
Mirrors `gmail_connection` exactly except for the scope.

```sql
CREATE TABLE google_calendar_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  google_email VARCHAR NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  last_sync_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  sync_error TEXT,
  sync_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)                          -- single Google account per user (v1)
);
```

### `google_calendar_subscription`
Which calendars (per Google account connection) the user wants to read from. Spec §9.2 says the user can configure multiple Google Calendars. A connection is one Google account; a subscription is one calendar within that account.

```sql
CREATE TABLE google_calendar_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES google_calendar_connection(id) ON DELETE CASCADE,
  google_calendar_id TEXT NOT NULL,         -- e.g. "primary" or "abc@group.calendar.google.com"
  display_name TEXT,                         -- pulled from Calendar API
  color_hex TEXT,                            -- for visual tagging
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (connection_id, google_calendar_id)
);
```

### `external_calendar_event`
Pulled events from subscribed calendars. Idempotent upsert keyed on `(subscription_id, google_event_id)`.

```sql
CREATE TABLE external_calendar_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES google_calendar_subscription(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  html_link TEXT,                            -- direct deep-link to the event in Google Calendar
  status TEXT,                               -- 'confirmed' | 'tentative' | 'cancelled' from Google
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, google_event_id)
);
```

Indexes:
- `external_calendar_event(subscription_id, start_at)` for the timeline lookup
- `google_calendar_connection(user_id) WHERE is_active = TRUE` for the cron job's "active connections" filter
- `google_calendar_subscription(connection_id) WHERE enabled = TRUE` for sync targets

## Behavior notes

### OAuth flow (PRs 3 + 4)
Mirrors `gmail-connect` / `gmail-callback`. New scope: `https://www.googleapis.com/auth/calendar.readonly`. The callback writes into `google_calendar_connection` and redirects back to `/settings/calendars`.

### Sync engine (PR 5)
For each active connection:
1. Refresh the access token if `token_expires_at` is past.
2. For each enabled subscription, call `events.list` for the time window: today minus 1 day → today plus 14 days. Use the `updatedMin` parameter to fetch incrementals after the first full sync.
3. Upsert results into `external_calendar_event` keyed on `(subscription_id, google_event_id)`. Cancelled events: mark with `status='cancelled'` (don't delete — display might want to show them struck-through).
4. Update `last_synced_at` on each subscription and `last_sync_at` on the connection.
5. On error, write to `sync_error` and `sync_error_at` on the connection. Don't throw — let the next cron tick try again.

### Polling cadence (PR 6)
pg_cron schedule, every 5 minutes:

```sql
SELECT cron.schedule(
  'gcal-sync-tick',
  '*/5 * * * *',
  $$ SELECT net.http_post('<edge_function_url>/gcal-sync', '{}'::jsonb) $$
);
```

The edge function receives no per-user context from cron — it iterates all active connections and syncs each in turn.

Per-user "Sync now" button calls the same edge function with `{ user_id: X }` to scope to that user only.

### Webhook (PR 9, optional)
On connection setup, call Calendar API's `events.watch` with our `gcal-webhook` URL. Google POSTs to that URL when the calendar changes. The webhook validates the channel ID, looks up the connection, and triggers an immediate sync for that connection's subscriptions.

Channels expire after up to 7 days (Google's max). Renewal logic: when `webhook_expires_at < now() + 1 day`, re-watch during the next sync.

### Conflict detection (PR 7)
A view or SQL function that returns overlapping (event, block_instance) pairs for a given (user, date):

```sql
CREATE OR REPLACE FUNCTION calendar_conflicts_for_owner_date(p_owner_id UUID, p_date DATE)
RETURNS TABLE (
  block_instance_id UUID,
  block_name TEXT,
  block_start TIMESTAMPTZ,
  block_end TIMESTAMPTZ,
  event_id UUID,
  event_summary TEXT,
  event_start TIMESTAMPTZ,
  event_end TIMESTAMPTZ
) ...
```

Or compute client-side from already-fetched data — events for the date join blocks for the date, find overlaps with `tstzrange(start, end) && tstzrange(event_start, event_end)` semantics.

I lean toward **client-side computation in PR 7** — both sets are small (max ~10 events + ~7 blocks per day), the math is trivial, and it avoids a second DB function. Move to a SQL function only if performance complains.

### Conflicts lane (PR 7)
A small card next to Top 3 / Inbox. Renders each conflict as a one-line summary with a × dismiss action and a deep-link to the event in Google Calendar. Per spec §9.4 the user resolves manually — shrink/move the block, accept overlap, or fix the meeting in Google.

### Events on the timeline (PR 8)
TodaysTimeline gets a second data source. Render events as compact greyed slots interleaved chronologically with blocks. A "⛔ Meeting w/ Bob (calendar)" pattern from spec §11. No interaction beyond click-to-open-in-Google.

## Resolved decisions (2026-05-09)

1. **Token storage:** mirror `gmail_connection` shape exactly. Tokens stored as plain text in the DB column (matching existing pattern). Encryption-at-rest is Supabase's default; no app-layer crypto added.
2. **OAuth client:** reuse the existing Gmail Google Cloud OAuth client. Add `calendar.readonly` scope to the consent screen. One client ID + secrets to manage.
3. **Multi-account per user:** single Google account per user in v1. UNIQUE constraint on `google_calendar_connection.user_id`. Multi-calendar selection happens within that one account. Lift the constraint later if anyone has separate work + personal accounts both needing to feed the dashboard.
4. **Conflict detection:** client-side overlap math. SQL function only if perf complains.
5. **Webhook:** deferred from v1. Polling at 5-min cadence is fine for planning use case. Drop PR 9 from the work order; revisit if anyone hits the latency.
6. **Sync window:** today − 1 day → today + 14 days for routine syncs. First sync after connecting pulls a wider window (today − 7 → today + 30) so historic context exists.
7. **All-day events:** render as a thin banner above the timeline, not interleaved into the hour-based lane. Skip from conflict detection (informational only).

The work order above is now 8 PRs (was 9). PR 1 schema drops the webhook-channel columns since they'd sit unused.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Google API quota / rate limits | Sync per active connection, not per subscription — one `events.list` call per calendar per 5 min is ~12/hour/user, well under the 1M/day default quota |
| Token refresh race conditions across concurrent syncs | Refresh-then-update-DB happens inside the edge function before any API call; if two cron ticks fire simultaneously, the second uses the freshly-refreshed token. Worst case: one stale-token 401, retry on next tick |
| Pulled events drift out of sync if Google deletes are missed | Use `events.list` with `showDeleted=true` so cancelled events are seen. Mark cancelled rather than delete so the timeline can show "this got cancelled, FYI" |
| pg_cron not enabled or misconfigured | Pre-flight check before PR 6: confirm the extension exists (it does — see `friday_cfo_email_cron` migration). Otherwise fall back to a Render/Vercel cron hitting the edge function URL |
| Conflict false positives from all-day events | Treat all-day events as informational only; don't generate conflicts against blocks |

## What's next (post-Phase 3)

Phases 4 (notifications), 5 (recurring tasks), 7 (subtasks + projects UI), 8 (polish) remain. Phase 6 (Hunter migration) is deferred until after the Hunter extraction discussion.
