# Session Handoff — Portal Email Alerts

**Date paused:** 2026-04-27
**Continuing from:** [FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md](FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md)

## Where we left off

The full Phase 1 feature is **built, deployed, and partially tested**. The client→broker email loop is confirmed working end-to-end. Several other paths are coded and live but haven't been clicked through. The user (Mike) and assistant were in the middle of setting up a Supabase MCP server so the assistant could run ad-hoc SQL directly without copy-paste.

## ✅ Confirmed working in production

- **Trigger fires** on portal-user comments → writes to `site_submit_activity` with `actor_kind = 'portal_user'`.
- **Debounce queue** populates correctly (`pending_client_comment_email`).
- **Cron** runs every 5 min — verified 10+ successful executions.
- **Resend email** delivered to `mike@oculusrep.com` — Mike confirmed receipt.
- **Migration history repaired** — local migrations (74 unique versions) marked as applied on remote, except `20251022` and `20251231` which were already there. Future `supabase db push --linked` will only push new migrations.

## ⏳ Live but never exercised

| Path | Status | How to test |
|---|---|---|
| Deep-link in fresh alert email | Deployed in commit `4008127e`. Old emails point at the OLD broken URL. | Re-arm the queue (SQL below), wait for cron, click the link. Should land on portal pipeline → Recent Changes → sidebar → Chat tab. |
| Broker→client digest (Gmail bell) | Deployed. Test client's site submits are in "Pursuing Ownership" — bell will be **disabled** with tooltip "Choose a client-visible stage to notify the client." | Move a test site submit to LOI or At Lease/PSA, click the amber bell, fill modal, send. |
| Bell stage-gating tooltip | Deployed in commit `ea3182a8` | Hover bell on a "Pursuing Ownership" submit — tooltip should appear. |
| File-shared activity capture | Deployed | Toggle a file visible on a site submit, then `SELECT * FROM site_submit_activity WHERE activity_type = 'file_shared' ORDER BY created_at DESC LIMIT 3;` |
| Stage change capture | Deployed | Change a site submit's stage, then check `site_submit_stage_history` and `site_submit_activity` for new rows. |
| Recent Changes tab UI | Deployed | Once activity rows exist, the tab should show grouped rows with 💬 / 📎 / 🔄 icons. |
| ClientBrokersSection UI | Deployed | Mike was added to `client_broker` (probably via UI; if via SQL, the UI itself is unverified). |

## ⚠️ Known issues (not from this work)

- **406 errors on `/rest/v1/user?...`** when the portal user logs in. Pre-existing RLS issue. Doesn't affect the email loop. Worth investigating separately.

## 🧪 Quick test recipe (when you resume)

To re-arm the comment-alert loop without waiting 20 min for a fresh comment:

```sql
INSERT INTO pending_client_comment_email
  (client_id, site_submit_id, first_comment_at, last_comment_at, comment_count)
VALUES (
  'e7baee6c-68fa-49e7-b24a-60fc78e6e67e',
  '1e4e9658-2ea0-4698-ae8c-607218176fdf',
  '2026-04-27 13:00:00+00',
  NOW() - INTERVAL '21 minutes',
  1
)
ON CONFLICT (client_id, site_submit_id) DO UPDATE SET
  last_comment_at = EXCLUDED.last_comment_at,
  first_comment_at = EXCLUDED.first_comment_at,
  comment_count = EXCLUDED.comment_count;
```

Then either wait <5 min for the cron tick, or hit the function directly (no auth header needed since `verify_jwt = false`):

```bash
curl -X POST https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/send-portal-comment-alert
```

Click the link in the resulting email — confirm new behavior.

## 🔧 Setup state (carried forward)

### Supabase secrets / vars
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` all already populated.
- `service_role_key` **NOT in `vault.decrypted_secrets`** — that's why the cron's auth header was empty. Fix was to disable `verify_jwt` on the function rather than populate the vault.

### Edge function config
- `supabase/config.toml` has `[functions.send-portal-comment-alert] verify_jwt = false` (commit `88a9fa56`).
- `supabase/config.toml` has `[functions.quickbooks-callback] verify_jwt = false` (pre-existing).

### Cron
- Job `portal-comment-alert-drain` exists at jobid 8, schedule `*/5 * * * *`, active = true.

### MCP (in progress when paused)
- File: `.mcp.json` at repo root, gitignored.
- Config:
  ```json
  {
    "mcpServers": {
      "supabase": {
        "command": "npx",
        "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=rqbvcvwbziilnycqtmnc"],
        "env": { "SUPABASE_ACCESS_TOKEN": "sbp_..." }
      }
    }
  }
  ```
- **Mike pasted his real PAT into the file** before pausing.
- **Claude Code restart required** to load the MCP server. Has not yet been done.

### Connection-URI workflow (abandoned but file may still exist)
- `~/.config/ovis-db.env` was created with a placeholder URL. Password was wrong (Mike pasted the dashboard's `[YOUR-PASSWORD]` placeholder instead of his real password). File still has `chmod 600` and the wrong creds. Can be deleted; we're using MCP now.

## 🚀 First steps in the next session

1. **Smoke-test the MCP server** — list tables or run `SELECT 1` to confirm the Supabase MCP tools are loaded after the restart.
2. **Run the queue-arming SQL** (above) via MCP — Mike's been waiting for this to verify the email deep-link.
3. **Click the link** in the resulting email — confirm it lands on the portal pipeline with Recent Changes / sidebar / Chat tab focused.
4. **Then continue with the untested paths** in the "Live but never exercised" table above.

## 📁 Files touched during this session

### New files
- `docs/PLAN_2026_04_25_DEAL_SITE_SUBMIT_STAGE_SYNC.md` — deferred follow-up plan
- `docs/TEST_PLAN_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md` — full test script
- `docs/HANDOFF_2026_04_27_PORTAL_EMAIL_ALERTS.md` — this file
- `src/components/portal/ClientBrokersSection.tsx`
- `src/components/portal/DigestComposeModal.tsx`
- `src/components/portal/RecentChangesTab.tsx`
- `supabase/functions/_shared/portalEmailTemplates.ts`
- `supabase/functions/send-portal-comment-alert/index.ts`
- `supabase/functions/send-portal-digest/index.ts`
- `supabase/migrations/20260425_portal_email_alerts_schema.sql`
- `supabase/migrations/20260425_portal_email_alerts_triggers.sql`
- `supabase/migrations/20260425_portal_email_alerts_cron.sql`
- `.mcp.json` (gitignored)

### Modified files
- `src/components/ClientOverviewTab.tsx` (added `<ClientBrokersSection />`)
- `src/components/client-pipeline/ClientPipelineBoard.tsx` (Recent Changes tab + initialSidebarTab prop)
- `src/components/shared/SiteSubmitSidebar.tsx` (bell icon + initialTab prop)
- `src/pages/SiteSubmitDetailsPage.tsx` (bell icon + DigestComposeModal mount)
- `src/pages/portal/PortalPipelinePage.tsx` (read `?tab=` URL param)
- `supabase/config.toml` (verify_jwt = false for send-portal-comment-alert)
- `.gitignore` (added `.mcp.json`)
- `docs/FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md` (added Phase 1 status section)

### Commits on `main`
- `ea3182a8` — feat(portal): Email alerts, digest, and Recent Changes tab
- `88a9fa56` — fix(portal-alerts): Disable JWT verification on send-portal-comment-alert
- `4008127e` — fix(portal-alerts): Deep-link comment alerts to portal pipeline + Chat tab

## 🔐 Security reminder

- Mike pasted what he thought was a DB password in chat earlier. Turned out to be the dashboard's `[YOUR-PASSWORD]` placeholder text, **not the real password**. No actual credential was leaked.
- The real Supabase PAT (`sbp_...`) is in `.mcp.json` which is gitignored.
- Don't commit `.mcp.json` or echo its contents.
