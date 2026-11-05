# Email ingestion outage, 2026-11-02 → 2026-11-05

Mail stopped entering OVIS on **2026-11-02 at 19:05 ET** and nothing was tagged in Gmail for
three days. Found because Mike noticed his inbox was untagged — not because anything told him,
which is its own finding (below).

## What broke

Five pg_cron jobs authenticate to the edge-function gateway with the project's **legacy anon
JWT**. The gateway now rejects it:

```
401 {"message":"Legacy API keys are disabled",
     "hint":"Your legacy API keys (anon, service_role) were disabled on 2025-10-23T15:19:33 ..."}
```

| job | function | credential it sent |
|---|---|---|
| `gmail-sync-job` | `gmail-sync` | legacy JWT, inline |
| `email-triage-job` | `email-triage` | legacy JWT, from vault `gateway_anon_jwt` |
| `portal-comment-alert-drain` | `send-portal-comment-alert` | legacy JWT, from vault |
| `merchant-logo-refresh-daily` | `merchant-logo-refresh` | legacy JWT, inline |
| `email-ingestion-alert-dispatch` | `email-ingestion-alert-dispatch` | legacy JWT, inline |

241 of those 401s sat in `net._http_response` in the ~6 hours that table retains — 40/hour,
which is exactly the four sub-hourly jobs above.

`gmail-sync` and `email-triage` keep `verify_jwt = true` deliberately (see the pinned block in
`supabase/config.toml`), so the gateway rejects the call before the function's own
`X-Cron-Secret` check runs. The `label-*` jobs were unaffected: they send **no** Authorization
header at all, and their functions are `verify_jwt = false`.

**A disabled legacy key is worse than no key.** Measured 2026-11-05 against `label-canary`
(`verify_jwt = false`): legacy JWT → **401**, no Authorization header → **200**. So the header
that was supposed to help is the only reason those five calls died.

## Why it went unnoticed for three days

- `cron.job_run_details` showed **864 runs, 0 failures** for `email-triage-job`. pg_cron only
  reports that `net.http_post` *queued* a request. The HTTP status lives in
  `net._http_response`, which nothing was reading for these jobs.
- The staleness alarm **did** fire: `email_ingestion_alert` has a row at **2026-11-03 08:00 ET**
  ("NO EMAIL INGESTED FOR 779.4 MINUTES"), with `notified = false` and `notify_attempts = 0`.
  The dispatcher that emails it is `email-ingestion-alert-dispatch` — one of the five jobs that
  was 401ing. The alerter and the thing it alerts on shared a single point of failure.
- `email_labeler_health` kept reporting **healthy**, correctly: it measures labelling of mail
  that has been ingested and classified, and no new mail had been.

## What changed on 2026-11-02 at 19:05 ET

Not the repo. `gmail-sync` was last deployed 2026-09-25 and `email-triage` 2026-09-22, both
already `verify_jwt = true`, and the cron commands predate that. Ingestion was steady right up
to the minute — hourly counts of 12–38 messages, each ingested within minutes of arrival, with
no backlog burst anywhere, so the legacy key was still being honoured at 19:05 and not at 19:10.
The change was on the key side: the legacy anon JWT stopped being accepted at that moment.

Most probable trigger, **unverified**: the project rotated its JWT signing key to ES256 on
2026-10-30 for the claude.ai connector. The legacy anon/service_role JWTs validate against the
old HS256 secret; once that key stops being served, they fall back to being treated as legacy
API keys — which this project disabled on 2025-10-23. Reading the project's key state needs the
Management API and was not available from the session that diagnosed this. **To confirm:**
Dashboard → Project Settings → API Keys → JWT signing keys, and check whether the previous
HS256 key shows as revoked/removed with a 2026-11-02 timestamp.

## The fix

`supabase/migrations/20261105072413_cron_gateway_publishable_key.sql` rewrites all five jobs to:

1. Send the **publishable key** as the bearer. It is public by design (it ships in the browser
   bundle as `VITE_SUPABASE_PUBLISHABLE_KEY`), so it is written literally in the migration
   rather than stored in the vault. `X-Cron-Secret` remains the thing that authorizes the
   caller, and is now sent on all five jobs.
2. Post through `public.cron_http_post_verified()` instead of bare `net.http_post()`. It reads
   the previous tick's status from `net._http_response` and opens a `cron_http_alert` on any
   non-2xx; `cron-http-alarm` (job 25) then fails every 5 minutes while an alert is open. This
   is the instrument whose absence hid the outage.

Verified by round-trip (applied inside a transaction, all five commands asserted, rolled back).

## Still open

**`gmail-sync`, `merchant-logo-refresh` and `email-ingestion-alert-dispatch` have no caller
check of their own.** Verified 2026-11-05: posting to `gmail-sync` with nothing but the
publishable key synced both mailboxes and triggered triage — and that key is public. Anyone can
drive mailbox syncs and model spend. They each need
`authorizeCaller(req, { allowService: true, allowInternalUser: false })` like
`send-portal-comment-alert`, which is a function deploy (from `main`, per the deploy rule).
This is not new exposure — the legacy anon key was equally public — but it is now the only gate.

**Audit for other jobs that will break the same way:**

```sql
select jobid, jobname,
       (command ~ 'eyJ[A-Za-z0-9._-]{30,}')  as inline_legacy_jwt,
       (command like '%gateway_anon_jwt%')   as vault_legacy_jwt,
       (command like '%cron_http_post_verified%') as verified
from cron.job order by jobid;
```

## Recovery done by hand

- `gmail-sync` invoked twice with the publishable key → 118 messages ingested, both mailboxes
  current (`gmail_connection.last_sync_at`).
- `email-triage` invoked to start draining the classification backlog (5 messages per call).
