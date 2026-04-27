# Portal Chat Email Alerts — Test Plan

**Date:** 2026-04-25
**Feature:** [FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md](FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md)
**Scope:** End-to-end manual testing for Phase 1.

## Pre-flight checklist

Before any testing, verify these are in place:

- [ ] Both migrations applied: `20260425_portal_email_alerts_schema.sql`, `20260425_portal_email_alerts_triggers.sql`, `20260425_portal_email_alerts_cron.sql`
- [ ] Both edge functions deployed and ACTIVE: `send-portal-comment-alert`, `send-portal-digest`
- [ ] Cron job exists: `SELECT jobname, schedule FROM cron.job WHERE jobname = 'portal-comment-alert-drain';` returns one row
- [ ] Env vars present: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] You have at least one **portal user** set up on a test client with `portal_access_enabled = true` and a real email you can check
- [ ] You have a Gmail-connected broker user (to send the digest)

## Test data prep (one-time)

Pick a test client (call it **Test Client**) with at least one site submit. Note its `client_id` and a `site_submit_id` for SQL queries.

```sql
-- Sanity check: confirm test data
SELECT c.id AS client_id, c.client_name, ss.id AS site_submit_id, ss.site_submit_name
FROM client c
JOIN site_submit ss ON ss.client_id = c.id
WHERE c.client_name ILIKE '%test%'
LIMIT 5;
```

---

## Section A — Schema + triggers

Goal: confirm activity rows fire correctly on each event source.

### A1. Client-visible comment from a broker
1. Open the test site submit in your browser (as a broker/internal user).
2. In the chat tab, post a **client-visible** comment.
3. Run:
   ```sql
   SELECT activity_type, actor_kind, payload, created_at
   FROM site_submit_activity
   WHERE site_submit_id = '<id>' ORDER BY created_at DESC LIMIT 5;
   ```
4. **Expect:** new row, `activity_type = 'comment'`, `actor_kind = 'broker'`, `payload->>'text'` matches what you wrote.
5. Confirm the debounce queue is **empty** (broker comments don't queue):
   ```sql
   SELECT * FROM pending_client_comment_email WHERE site_submit_id = '<id>';
   ```
   **Expect:** zero rows.

### A2. Internal comment (not client-visible)
1. Post an **internal** comment on the same site submit.
2. **Expect:** no new `site_submit_activity` row (trigger only fires for `visibility = 'client'`).

### A3. Client-visible comment from a portal user
1. Log in as a portal user (incognito window) with access to Test Client.
2. Open a site submit and post a comment.
3. Run the SQL from A1.
4. **Expect:** new activity row, `actor_kind = 'portal_user'`.
5. Run the queue check from A1.
6. **Expect:** one row in `pending_client_comment_email`, `comment_count = 1`.
7. Post **a second comment** as the same portal user within 20 min.
8. **Expect:** queue row updated — `comment_count = 2`, `last_comment_at` advanced. Still **one row** in queue.

### A4. File shared via portal_file_visibility
1. As a broker, on a site submit's files tab, mark a Dropbox file/folder visible to the portal.
2. Run:
   ```sql
   SELECT activity_type, payload FROM site_submit_activity
   WHERE site_submit_id = '<id>' AND activity_type = 'file_shared'
   ORDER BY created_at DESC LIMIT 3;
   ```
3. **Expect:** new row with `payload->>'file_name'` populated, `actor_kind = 'broker'`.
4. Toggle the file back to hidden, then back to visible.
5. **Expect:** another `file_shared` activity row (the trigger fires on each transition into visible).

### A5. Stage change
1. Change the site submit's stage via the UI (e.g. Submitted-Reviewing → LOI).
2. Run:
   ```sql
   SELECT activity_type, payload FROM site_submit_activity
   WHERE site_submit_id = '<id>' AND activity_type = 'status_change'
   ORDER BY created_at DESC LIMIT 3;

   SELECT from_stage_id, to_stage_id, changed_at, changed_by_id
   FROM site_submit_stage_history
   WHERE site_submit_id = '<id>'
   ORDER BY changed_at DESC LIMIT 5;
   ```
3. **Expect:** one new `site_submit_activity` row with `payload->>'from_stage_label'` and `'to_stage_label'`. **Plus** one new `site_submit_stage_history` row.
4. Change the stage again. **Expect:** the previous history row's `duration_seconds` is now populated.

### A6. Stage change with no UI (direct SQL)
```sql
UPDATE site_submit SET submit_stage_id = '<some-stage-id>' WHERE id = '<id>';
```
**Expect:** new activity row with `actor_kind = 'system'` (no `auth.uid()` in a SQL editor session).

---

## Section B — Client setup → Brokers section

### B1. Visibility on a new client
1. Navigate to "Add new client".
2. Scroll to where Portal Users / Brokers sections live.
3. **Expect:** Brokers section shows the placeholder "Save the client first…" message. No add button.

### B2. Visibility on an existing client
1. Open Test Client.
2. Scroll past the Portal Users section.
3. **Expect:** "Brokers on this Account" section visible with `+ Add Broker` button.
4. If no brokers yet, **expect:** "No brokers assigned yet…" message.

### B3. Add a broker
1. Click `+ Add Broker`.
2. **Expect:** modal opens with search input and a list of available brokers (filtered to active, role in `admin`/`broker_full`/`va`/`testing`).
3. Type a partial name into search.
4. **Expect:** list filters live.
5. Click `Add` next to a broker.
6. **Expect:** modal closes, broker appears in the section list.
7. Open the modal again.
8. **Expect:** the broker you just added is **not** in the available list.

### B4. Remove a broker
1. Click `Remove` next to a broker.
2. **Expect:** confirmation dialog.
3. Confirm.
4. **Expect:** broker disappears from the list. Verify in DB:
   ```sql
   SELECT id, user_id, is_active FROM client_broker WHERE client_id = '<id>';
   ```
   The row is `is_active = false` (soft-delete).

### B5. Multi-broker
1. Add two more brokers.
2. **Expect:** all three render in the list ordered by `created_at` ascending.

---

## Section C — Bell icon + DigestComposeModal

### C1. Bell visibility
1. Open the test site submit detail page.
2. **Expect:** "Notify Client" button (with bell icon) appears in the header between Copy Portal Link and Submit Site.
3. Hover for tooltip when no client is assigned (open a site submit with `client_id = null`): button is disabled with tooltip "Assign a client to send portal updates".

### C2. Open the modal
1. Click the bell.
2. **Expect:** modal opens with:
   - Scope toggle defaulted to "This site submit (…)".
   - Time range toggle: only shows "Everything today" if there's no prior send today; both options show otherwise. Default = "Only since last send" if available, else "Everything today".
   - Custom note textarea (empty).
   - Preview area showing what will be sent.
   - Recipients section listing portal user emails.

### C3. Preview accuracy
1. Have at least one new activity since the last send (e.g. a recent comment).
2. **Expect:** preview lists each activity with timestamp + summary.
3. Toggle scope between "this site submit" and "all changes for this client today".
4. **Expect:** preview updates — `client_all` includes activities from other site submits for this client.

### C4. Recipients
1. Find a portal user with `email_alerts_opt_in = false` for Test Client and set it via SQL:
   ```sql
   UPDATE contact SET email_alerts_opt_in = false
   WHERE id = '<contact-id>';
   ```
2. Reopen the modal.
3. **Expect:** that user's email is **not** in the Recipients list.
4. Reset: `UPDATE contact SET email_alerts_opt_in = true WHERE id = '<contact-id>';`

### C5. Send disabled when nothing to send
1. Open a site submit with **no** recent activity.
2. Click bell.
3. **Expect:** preview says "Nothing new in this window…", Send button disabled.

### C6. Send disabled when no recipients
1. Temporarily disable all portal users for Test Client (or pick a client with none).
2. Open bell modal.
3. **Expect:** Recipients section shows the warning message; Send disabled.

### C7. Successful send
1. With a real client + at least one new activity + at least one opted-in portal user:
2. Add a custom note ("Hi team — quick update on our site submits…").
3. Click Send.
4. **Expect:** success message, modal auto-closes after ~1.5 sec.
5. Check the broker's Gmail Sent folder — the message exists.
6. Check the recipient's inbox — message arrived.
7. Verify the BCC: the broker's own address received a copy.
8. Verify CC: other brokers in `client_broker` for this client are CC'd.
9. Verify in DB:
   ```sql
   SELECT direction, scope, recipients, cc, subject, status, provider_message_id
   FROM portal_email_send
   WHERE client_id = '<id>' ORDER BY sent_at DESC LIMIT 1;
   ```
   **Expect:** new row, `status = 'sent'`, `provider = 'gmail'`, `provider_message_id` populated.
10. Verify activity rows are now flagged sent:
    ```sql
    SELECT id, included_in_send_id FROM site_submit_activity
    WHERE site_submit_id = '<id>' ORDER BY created_at DESC LIMIT 5;
    ```
    **Expect:** the rows that were in the preview now have `included_in_send_id` set.

### C8. Re-open after send
1. Click bell again immediately.
2. **Expect:** "Only since last send" option is now visible (because there's a prior send today). Preview should be empty (everything has been sent).

### C9. Broker without Gmail connection
1. Sign in as a broker who hasn't connected Gmail.
2. Try to send a digest.
3. **Expect:** error in modal: "No active Gmail connection for this broker. Connect Gmail first."

---

## Section D — Resend client→broker alert (cron-driven)

### D1. End-to-end debounce
1. Ensure **Test Client has at least one broker** in the `client_broker` table with a real, deliverable email.
2. Log in as a portal user, post a client-visible comment on a site submit.
3. **Expect (immediately):** queue row appears (verified in A3).
4. **Wait 20 minutes** (the debounce window).
5. **Within the next 5 min** (cron interval), check:
   ```sql
   SELECT * FROM pending_client_comment_email WHERE site_submit_id = '<id>';
   ```
   **Expect:** zero rows (drained).
6. Check the broker's inbox.
7. **Expect:** an email from `<RESEND_FROM_EMAIL>` with subject like "<Client> commented on <Site Submit>" containing the comment text.
8. Verify Reply-To: hitting reply in the email client should populate the **portal user's email** as the reply target, not the OVIS address.
9. Verify in DB:
   ```sql
   SELECT direction, recipients, subject, status, provider, provider_message_id
   FROM portal_email_send
   WHERE direction = 'client_to_broker' AND client_id = '<id>'
   ORDER BY sent_at DESC LIMIT 1;
   ```
   **Expect:** row with `provider = 'resend'`, `status = 'sent'`.

### D2. Multiple comments collapse into one email
1. Post **3 comments** as portal user within the 20-min window (e.g. 0 min, 5 min, 10 min apart).
2. After each, verify queue row updates rather than multiplying:
   ```sql
   SELECT comment_count, first_comment_at, last_comment_at
   FROM pending_client_comment_email WHERE site_submit_id = '<id>';
   ```
3. Wait 20 min after the **last** comment.
4. **Expect (after next cron):** one email with **all three** comments listed.

### D3. No brokers on client
1. Remove all brokers from a test client.
2. Have a portal user comment.
3. After debounce + cron: check queue.
4. **Expect:** queue cleared but no email sent (no recipients). Log row in `portal_email_send` is **not** created (the function bails with "No active brokers"). Queue row is deleted to avoid retry loops.

### D4. Manual cron invocation (faster testing)
You don't have to wait 5 min — invoke directly:
```bash
curl -X POST "https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/send-portal-comment-alert" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" -d '{}'
```
**Expect:** JSON response with `sent` count and per-row results.

For testing, you can shorten the debounce by temporarily editing the queue row:
```sql
-- Make a queue row immediately eligible
UPDATE pending_client_comment_email
SET last_comment_at = NOW() - INTERVAL '21 minutes'
WHERE site_submit_id = '<id>';
```
Then invoke the function manually.

### D5. Resend logs check
- Log in to Resend dashboard → Sent emails. Confirm the message and check for any bounce/complaint feedback.

---

## Section E — Recent Changes pipeline tab

### E1. Tab visible
1. Navigate to the portal pipeline page (`/portal/pipeline`).
2. **Expect:** "Recent Changes" tab button to the right of "All Sites".

### E2. Empty state
1. Pick a client with no activity in the last 7 days.
2. Click Recent Changes.
3. **Expect:** "No changes in the last 7 days." message.

### E3. Populated view
1. Generate activity (post a comment, share a file, change a stage — see Section A).
2. Click Recent Changes.
3. **Expect:** table with one row per site submit that has activity. Columns: Site Submit, Last Change (relative time), What Changed (icons + counts), Details.
4. The most recently active site submit appears first.
5. Icons reflect actual activity: 💬 for comments, 📎 for files, 🔄 for status changes.

### E4. Row click
1. Click a row.
2. **Expect:** site submit sidebar opens (same behavior as other tabs).

### E5. Switch tabs
1. Switch back to "All Sites" or a stage tab.
2. **Expect:** normal table renders, no errors.

---

## Section F — Regression checks

Smoke tests to make sure the new code didn't break anything else:

- [ ] Open an existing site submit — page renders, autosave works, all old buttons (Verify Location, Copy Portal Link, Submit Site, Convert to Deal, Delete) work.
- [ ] Create a new site submit — bell button is **not** rendered (only on existing).
- [ ] Open the client edit page — Portal Users section still works.
- [ ] Open the broker pipeline page — existing stage tabs (Submitted-Reviewing, LOI, etc.) still load and filter correctly.
- [ ] Switch from Recent Changes back to a stage tab — sort/filter still works.
- [ ] Critical date emails still send (existing Resend usage unaffected).
- [ ] Portal invite emails still send (existing Gmail usage unaffected).

---

## Failure modes to deliberately exercise

These confirm error handling rather than the happy path.

| Scenario | Setup | Expected behavior |
|---|---|---|
| Resend API down | Temporarily set `RESEND_API_KEY` to garbage | Function returns 200 but logs the failed send to `portal_email_send` with `status='failed'`; queue row is **kept** for retry on next cron tick |
| Gmail token expired | Wait until `gmail_connection.token_expires_at < NOW()` | Function refreshes silently before sending; new token saved to `gmail_connection` |
| Site submit deleted mid-debounce | Delete a site submit while a queue row exists for it | Cron tick deletes the orphaned queue row, logs the skip |
| Portal user opted out | `email_alerts_opt_in = false` | Excluded from digest recipients |
| Stage change to same value | `UPDATE site_submit SET submit_stage_id = submit_stage_id` | No activity row, no history row (trigger condition `IS DISTINCT FROM`) |

---

## Cleanup after testing

```sql
-- Wipe activity / sends for the test client (be careful with the WHERE clause!)
DELETE FROM site_submit_activity WHERE client_id = '<test-client-id>';
DELETE FROM portal_email_send WHERE client_id = '<test-client-id>';
DELETE FROM pending_client_comment_email WHERE client_id = '<test-client-id>';
DELETE FROM site_submit_stage_history WHERE client_id = '<test-client-id>';
```

(Stage history can also be left in place — it's useful audit data even after testing.)
