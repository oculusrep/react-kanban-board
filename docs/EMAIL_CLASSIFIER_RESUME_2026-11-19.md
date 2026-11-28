# Email classifier resume check — 2026-11-19

Context: Gemini credits topped up 2026-11-19. Ask: confirm labelling resumed, then backfill
unlabelled mail received since 2026-11-16.

## Status

**Labelling has resumed (seen in Gmail only).**
- 12:44 UTC "Google Cloud Platform & APIs: Auto-reload is on" → `OVIS/Unsorted`
- 12:55 UTC "Google: We've received your payment" → `OVIS/Junk`
- 13:00 and 13:02 UTC arrivals had no label when checked. That is within normal lag
  (about 4 min from arrival to classification, plus the 5-min label tick), so it is not yet a failure.
- Mail from the evening of 11/18 and earlier is bare, which fits the outage.

**Schedule note:** `label-inbox-tick` runs at `4-59/5` (every 5 min, two minutes behind triage),
not every 15 min. The `*/15` jobs are the health checks (`email-classifier-health-check` at `2-59/15`).
Not checked: `cron.job_run_details`, `email_label`, `email_classifier_alert`. This session has no DB access.

## Backfill — NOT RUN

Scope: `after:2026/11/16 -in:sent` with no OVIS-Linked or OVIS/* label. The Gmail estimate is
about 200+ threads; it is not an exact message count.

Blocked: this container has no `.env`, `DATABASE_URL`, Supabase service key or Gemini key, so I
could not invoke `email-triage` / `label-inbox` or read `email_label`.

Labels were deliberately not applied by hand through the Gmail connector. `label-watcher` treats
OVIS/* labels that have no matching `email_label` row as owner corrections. Hand-applied labels
would therefore be learned as corrections, and they would skip the classifier entirely.

## To finish (needs credentials)
1. Check that `email_classifier_alert` resolved and that `cron.job_run_details` shows `label-inbox-tick` succeeding.
2. Re-queue the emails stuck/abandoned during the outage for `email-triage` (received_at >= 2026-11-16 ET),
   in batches sized to the Gemini rate limit, logging failures.
3. Let `label-inbox` apply labels. Inbox mail and archived mail within its 30-day window are both covered.
4. Re-run the Gmail query above. Any remaining hits are the real misses.
