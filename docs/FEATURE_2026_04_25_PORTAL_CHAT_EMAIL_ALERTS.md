# Portal Chat Email Alerts & Daily Digest — Implementation Plan

**Date:** 2026-04-25
**Status:** Plan / pre-implementation
**Owner:** Mike

## Goal

Surface portal activity to the right people via email so neither side has to live in the portal to know what's going on.

- When a **client** posts a chat comment in the portal, brokers on that account get an email alert (debounced, automatic).
- When a **broker** wants to bring the client up to speed, they hit a button on the site submit and send a digest of today's changes from their own Gmail. Manual, never automatic, so we don't spam clients.
- Both sides land on a "Recent Changes" view in the portal that highlights what's new.

## User stories

- **As a broker**, when my client comments on a site submit, I want an email so I can respond without having to babysit the portal.
- **As a broker**, when I've moved a deal forward today (status changes, files, internal updates marked client-visible), I want to push a single tidy summary to the client when *I'm* ready, not on every action.
- **As a client portal user**, I want one email summarizing what changed today on my projects, with a link straight into the portal where I can see the details.
- **As a client portal user**, I want to control whether I receive these alerts.

## Decisions (from Q&A on 2026-04-25)

| # | Topic | Decision |
|---|---|---|
| 1 | Recipient model for client→broker alerts | Brokers explicitly associated with the client. Reuse the existing **broker/deal team dropdown** on the client setup screen, alongside the portal user access section. |
| 2 | What counts as a "change" in the digest | Client-visible chat comments, files added, status changes. |
| 3 | Where the broker triggers the digest | **Bell icon** in the site submit header → modal with two options: "this site submit" / "all changes for this client today". |
| 4 | Cadence of client→broker emails | Debounced — 20 min quiet period after the last comment, then a single email summarizing the burst. |
| 5 | Recipients of the broker→client digest | Portal users explicitly **opted in** (checkbox per portal user, defaults **on**). |
| 6 | Re-send behavior within a day | Broker chooses in the modal: "everything today" or "only since last send". Default = "only since last send". |
| 7 | Where the email link lands | A new **"Recent Changes" tab** in the pipeline view (alongside stage tabs), using the same table layout. |
| 8 | Time window in that tab | Rolling **7 days** + visual **unread/today** indicators (reuse the `portal_site_submit_view` read-state model). |
| 9 | Email content | Both directions include the actual content (comment text, file names, old → new status), not just "click to view". |
| 10 | Email infrastructure | **Gmail API** for broker→client digest (sends from broker's Gmail, CCs the deal team). **Resend** for client→broker alerts (system sender). |
| 10b | "From" header for client→broker | `"<Client Name> (<Company>) via OVIS" <notifications@oculusrep.com>`, **Reply-To** = the client portal user's actual email so broker replies bypass OVIS. |
| 11 | Broker preview/edit before sending | Preview-and-edit. Modal shows the email body with the auto-generated change list; broker can add a custom note above the list before sending. |
| 12a | Modal default — which scope | Default to **"this site submit"** (broker has to opt in to broadcasting wider). |
| 12b | Modal default — which time range | Default to **"only since last send"** (avoids re-sending redundant info). |
| Bonus | Map legend | A **"Recent Changes"** toggle in the legend that filters site submit pins to those with activity in the rolling 7-day window. |

## Architecture

### Data model changes

#### 1. Reuse deal team for client → broker association
Goal: when a client comment arrives, we know which brokers to email.

**Reuse what exists:** the deal team / broker team concept already on `deal`. We expose the same dropdown on the client setup screen. Implementation options (decide during build):

- **Option A** — add `client.broker_team_id` (FK to whichever table holds team rosters). Simplest.
- **Option B** — `client_broker` junction table (`client_id`, `user_id`). More flexible if a client doesn't fit neatly into one named team.

Recommendation: start with whichever model the existing deal page uses, then mirror it.

#### 2. Activity capture
We need a single source of truth for "what changed today" so both the digest email and the Recent Changes pipeline tab read from one place.

**Proposal: `site_submit_activity` table**

```
site_submit_activity
  id                uuid pk
  site_submit_id    uuid fk -> site_submit
  client_id         uuid fk -> client (denormalized for fast queries)
  activity_type     enum('comment','file','status_change')
  actor_user_id     uuid fk -> user (broker, system, or portal user)
  actor_kind        enum('broker','portal_user','system')
  payload           jsonb  -- comment text, file name, {from_stage, to_stage}, etc.
  client_visible    bool   -- mirrors the underlying chat/file's client-visibility flag
  created_at        timestamptz default now()
  -- digest tracking
  included_in_send  uuid fk -> portal_email_send (null until sent in a digest)
```

This is written by triggers (or an app-level event bus) when:
- A chat comment row is inserted with `client_visible = true`.
- A file is uploaded and marked client-visible.
- A site submit's `submit_stage_id` changes.

The Recent Changes tab queries this table for the last 7 days, and the digest email queries it for "since last send" (or "today").

#### 3. Email send tracking

```
portal_email_send
  id              uuid pk
  client_id       uuid fk -> client
  triggered_by    uuid fk -> user (broker, or 'system' for client→broker debounce)
  direction       enum('broker_to_client','client_to_broker')
  scope           enum('site_submit','client_all')   -- only meaningful for broker→client
  site_submit_id  uuid?  -- only when scope = 'site_submit'
  recipients      text[] -- email addresses
  cc              text[]
  subject         text
  body_html       text
  activity_ids    uuid[] -- which site_submit_activity rows were included
  sent_at         timestamptz
  provider        enum('gmail','resend')
  provider_message_id text
  status          enum('sent','failed')
  error           text?
```

Used for:
- "Only since last send" computation (find max `sent_at` for that client/site-submit + broker, include activity rows with `created_at > sent_at`).
- Audit trail in the portal admin view.
- Mark `site_submit_activity.included_in_send` when sent.

#### 4. Portal user opt-in

Add `portal_user.email_alerts_opt_in bool default true` (or equivalent — depends on whether portal users live on `contact`, `auth.users`, or a dedicated table). One column. Edit in the portal user's profile page, plus an unsubscribe link in every digest email footer.

#### 5. Debounce queue for client → broker

Two reasonable implementations, pick one during build:

- **Postgres trigger + cron**: On each new client comment, upsert a row into `pending_client_comment_email` keyed by `(client_id, site_submit_id)` with `last_comment_at`. A cron edge function runs every 5 min, finds rows where `last_comment_at < now() - 20 minutes`, sends the email, deletes the row.
- **Edge function with `setTimeout`**: no good — Supabase functions don't persist between invocations. Reject this option.

Use the trigger + cron approach.

### Email infrastructure

#### Broker → client digest (Gmail)
- Reuse `_shared/gmail.ts` (already used by `send-portal-invite` and `send-site-submit-email`).
- Sender = the broker triggering the bell, looked up in `gmail_connection`.
- CC = other brokers on the deal team for that client (CC, not BCC, so client sees who else is on the conversation).
- BCC = the broker's own address (matches existing pattern of "CC the sender so they have a record").
- Reply-To = unset (default to From, so client replies go to the broker's Gmail inbox).
- Failure mode = if the broker isn't connected to Gmail, modal shows "Connect Gmail to send" CTA before the bell can be used — same as existing site submit email flow.

#### Client → broker debounce alert (Resend)
- New edge function: `supabase/functions/send-portal-comment-alert/index.ts`, modeled after `send-critical-date-email`.
- From: `"<Client Name> (<Company>) via OVIS" <notifications@oculusrep.com>` (uses `RESEND_FROM_EMAIL` env)
- Reply-To: the portal user's actual email (so broker replies go directly to client, bypassing OVIS)
- To: brokers on the client's deal team
- Subject: `"<Client> commented on <Site Submit Name>"` (or "X new comments on …" if multiple)

#### Email templates
Two new templates in `supabase/functions/_shared/`:

- `portalCommentAlertTemplate.ts` — for the client → broker direction. Lists each comment with timestamp, the verbatim text, and a deep link into the site submit chat.
- `portalDigestTemplate.ts` — for the broker → client direction. Sections per site submit (only one if scoped to that submit) with three subsections: Comments / Files / Status Changes. Broker's custom note rendered at top.

Both end with a "View in OVIS" CTA linking to `/portal/pipeline?tab=recent-changes` (or `/portal/site-submit/<id>?tab=recent` when scope = single).

### UI changes

#### 1. Client setup screen — broker/deal team dropdown
- Add to existing client edit form, near the portal user access section.
- Reuse the dropdown component from the deal page (need to identify which file — likely under `src/components/deal/` or similar).
- Saves to `client.broker_team_id` (or via the junction table — depends on model chosen).

#### 2. Site submit header — bell icon
- New icon button in the header of the site submit slideout / detail page.
- Disabled state with tooltip if broker has no Gmail connection.
- Click → opens `<DigestComposeModal />`.

#### 3. `<DigestComposeModal />` (new)
- Fields:
  - Scope toggle: "this site submit" / "all changes for this client today" (default first).
  - Time range toggle: "everything today" / "only since last send" (default second; first is hidden if no prior send today).
  - Custom note textarea (optional, rendered at top of email body).
  - Auto-generated change list preview, read-only (shows everything that will be sent).
  - Recipients summary ("Sending to: Sarah Smith, John Doe").
  - Send / Cancel buttons.
- On Send: calls a new edge function `send-portal-digest` which builds the email via Gmail API, writes a `portal_email_send` row, marks each included activity as sent, and returns success/failure.

#### 4. Pipeline view — "Recent Changes" tab
- New tab in `STAGE_TAB_ORDER` (or as a parallel concept to "signed").
- Same table layout as other tabs but the source is `site_submit_activity` joined to `site_submit` for the last 7 days.
- Each row = one site submit with activity. Columns: standard pipeline columns + "Last Change" (most recent activity timestamp) + "What Changed" (icon row: 💬 / 📎 / 🔄).
- Bold/dot the rows that are unread (use `portal_site_submit_view` to track).
- "Show on Map" button at the top of the tab → switches to map view and applies the legend's "Recent Changes" filter automatically.

#### 5. Map legend — Recent Changes toggle
- New toggle in the legend (location TBD, near existing layer toggles).
- When on, the SiteSubmitLayer filters pins to only those whose `id` appears in the user's recent-changes activity feed.
- Reuses the existing visibility-filter pattern on `SiteSubmitLayer`.

#### 6. Portal user profile — opt-in checkbox
- Single checkbox: "Email me when changes happen on my projects" (default on).
- Stored on `portal_user.email_alerts_opt_in`.

### Phasing

#### Phase 1 — ship the loop (target: working end-to-end)
1. Schema: `site_submit_activity`, `portal_email_send`, opt-in column.
2. Triggers/handlers that write to `site_submit_activity` for comments, files, and status changes.
3. Client setup screen: broker/deal team dropdown wired to client.
4. Edge function: `send-portal-comment-alert` (Resend, with debounce queue + cron).
5. Edge function: `send-portal-digest` (Gmail).
6. Bell icon + `<DigestComposeModal />`.
7. "Recent Changes" pipeline tab (basic table view, no map filter yet).

#### Phase 2 — polish & map integration
8. Unread/today indicators on the Recent Changes rows (read-state via `portal_site_submit_view`).
9. Map legend "Recent Changes" toggle + "Show on Map" button on the tab.
10. Audit log view for portal admins ("who sent what to whom and when").
11. Unsubscribe link wired to opt-in column.

## Open questions / assumptions

- **Chat data model**: I'm assuming chat comments live in a single table with `client_visible` and `actor_kind` (or equivalent role-derived) fields. Need to verify before writing the trigger that populates `site_submit_activity`. Will check existing chat code in phase 1 kickoff.
- **Status change history**: I'm assuming `submit_stage_id` changes can be captured with a Postgres trigger on `site_submit`. If there's an existing audit table (Salesforce-style `*_history`), use it instead.
- **Broker team data model on `deal`**: need to read the deal page to mirror the same concept on `client`. I'll do this when starting Phase 1, item 3.
- **Portal user model**: opt-in column lives on whatever table represents "portal user." Confirm this is `contact` or a dedicated table before phase 1, item 1.
- **Daily / "today" boundary**: Eastern Time per CLAUDE.md. "Today" = local-EST midnight to local-EST midnight. Stored timestamps are UTC; queries use `AT TIME ZONE 'America/New_York'`.
- **Multi-client portal users**: a portal user with access to multiple clients should still only get one email per client per debounce window. The queue is keyed by `(client_id, site_submit_id)`, not by user, so this works naturally.
- **"All changes for this client today" digest while site submit modal is open**: digest scope is the *client*, so the modal needs the client_id (the bell is on a site submit, but the site submit knows its client). No issue, just a reminder.

## Implementation order (rough)

A reasonable cut for the first PR:

1. Schema migrations (`site_submit_activity`, `portal_email_send`, `pending_client_comment_email`, `client.broker_team_id` or junction, `portal_user.email_alerts_opt_in`).
2. Capture triggers (the three: comment, file, status change).
3. Resend edge function `send-portal-comment-alert` + cron that drains the debounce queue.
4. Client setup screen — broker team dropdown.
5. Gmail edge function `send-portal-digest`.
6. Site submit header — bell icon + `<DigestComposeModal />`.
7. Pipeline "Recent Changes" tab (read-only feed view, no map integration).

Then a second PR for phase 2 (read state, map integration, audit view).
