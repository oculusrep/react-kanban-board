# Email classifier recovery + backfill, 2026-11-19

Gemini prepayment credits ran out (classifier calls returned `402 "Your prepayment credits are
depleted"`). Credits were topped up on 2026-11-19. This note records how the classifier was
confirmed working again and how mail received from 2026-11-16 onwards was backfilled.

## 1. Is the pipeline running?

Yes. Checked at 13:09 UTC (08:09 ET):

- `email-triage` is running every ~5 min: cron at :x0/:x5, plus runs triggered by `gmail-sync`
  at :x2/:x7. It is not on a 15-min schedule. Rows were moving to `classified` with
  `model_done` outcomes, with no 402s after the top-up.
- `label-inbox` writes `email_labeler_health` every 5 min with verdict `healthy` (e.g.
  `347/347 labelled; 0 bare_stale; 160 awaiting triage`). New `email_label` rows were being
  applied to Gmail with no `apply_error`.
- `gmail_connection.last_sync_at` was current for both mailboxes.

pg_cron state (`cron.job`, `cron.job_run_details`) could not be read: the Postgres pooler is
not reachable from the cloud session, which only had REST access. The evidence above comes from
row timestamps instead.

## 2. Backfill

Scope: mike@oculusrep.com, mail received since 2026-11-16 (Gmail `after:2026/11/16`) with no
`OVIS-Linked` or `OVIS/*` label.

Starting state (rows received ≥ 2026-11-16 05:00 UTC):
`classified 492 · pending 267 · failed 129`. All 129 failures were the 402. Of those, 77 sat at
attempt 5, so one more failure would have abandoned them. Their next retry was up to 24h away.

Steps:
1. Reset the 129 rows that had failed with a 402 to
   `pending / attempts 0 / next_attempt null / error null`. They were billing failures, not
   message-specific ones, so the attempt count was meaningless.
2. Called `email-triage` (5 emails per call, ~30 s each) from a driver script, timed to start
   only between the cron and sync ticks so it never overlapped a scheduled run, because there is
   no row claim or lock. Each call ran one at a time, roughly 3 calls per 5 min, about 11 Gemini
   calls per batch. No rate-limit errors occurred.
3. `label-inbox` (the 5-min cron) applied Gmail labels from the new classifications.

Result:
- Driver: 19 calls, **80 emails classified**. The cron classified the rest of the queue
  alongside it. Owner mailbox since Nov 16: 568 of 569 inbound rows are `classified`.
- All 129 rows that were reset: 92 `model_done`, 36 `model_no_verdict`, 1 `failed`.
- Labels applied since the backfill started (live, not dry-run, no apply errors):
  Junk 27, Property 11, Reading 11, Unsorted 11, Business 10, Personal 10, Events 1.
- Owner mailbox labels on mail received since Nov 16 (all live labels):
  Business 105, Junk 79, Property 59, Unsorted 38, Reading 32, Personal 14, Events 3.
- Labeler health afterwards: `434/434 labelled; 0 bare_stale; 1 awaiting triage`.

Errors:
- 1 classification failure: `Re: 🍗 November Listings Added …` (riverwoodproperties.com):
  `Gemini returned no content (finishReason=MALFORMED_FUNCTION_CALL)`. It is on normal backoff
  and will be retried automatically. This is the only message in the inbox still without a label.
- No HTTP, 402 or 429 errors on any driver call.

## Not covered: open items

- **Archived mail stays bare by design.** `label-inbox` labels the INBOX. Its 30-day archived
  window only *reconciles* messages that already carry a live label. A message that was never in
  the inbox, such as newsletters a Gmail filter skips past the inbox, is classified in the
  database but never labelled in Gmail. Since Nov 16, about 238 classified inbound rows have no
  live label. Gmail shows about 19–38 unlabelled threads; that search is thread-level, so it
  undercounts. Labelling them needs a design change to the labeler, not a re-run.
- **asantos@oculusrep.com: 269 rows pending.** `email-triage` only classifies the owner
  connection's mailbox, so these are not processed. This predates the outage and was not changed.
- The `email-triage` cron cadence is 5 min. If a 15-min cadence was intended, the cron job needs
  changing.
- **`email-triage` has no row claim.** Concurrent runs (cron + gmail-sync-triggered) can pick
  the same 5 rows.
