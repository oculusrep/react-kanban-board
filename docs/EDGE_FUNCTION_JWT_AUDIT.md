# Edge function JWT audit — 2026-09-27

## What happened

`ovis-site-research-worker` had `verify_jwt` false server-side, set once with `--no-verify-jwt`.
`supabase/config.toml` had no block for it. A plain `supabase functions deploy` applies
config.toml, so the deploy reset the function to the default `true`.

Its two callers — `kickWorker()` and the per-minute `ovis-site-research-tick` cron — send
`X-Worker-Secret` and **no** `Authorization` header. The gateway 401'd both before the function
ran. Every site-research run queued for 80 minutes and was then reaped at the 20-minute mark.

The cron reported **succeeded** the whole time, because `net.http_post` succeeds when the request
is *queued*. Same shape as the 2026-09-07 gmail-sync outage: 432 green runs through an 8-hour
stall. Fixed separately — see "Cron verification" below.

## The rule

**A function that needs `verify_jwt = false` must say so in config.toml.** A server-side
`--no-verify-jwt` is not durable; the next deploy of that function silently reverts it.

## Pinned false, deliberately

| Function | Why it must be public | Its own check |
|---|---|---|
| `quickbooks-callback` | OAuth redirect from Intuit | state/code |
| `gmail-callback` | OAuth redirect from Google | state/code |
| `gcal-callback` | OAuth redirect from Google | state/code |
| `ovis-research-mcp` | OpenClaw calls it without minting a user JWT | `OVIS_MCP_BEARER_TOKEN` |
| `ovis-site-research-worker` | `kickWorker()` + cron, no Authorization header | `X-Worker-Secret` vs vault |
| `ovis-sweep-tick` | cron, no Authorization header | `X-*-Secret` vs vault |
| `gcal-sync` | cron, no Authorization header | `X-*-Secret` vs vault |
| `label-watcher` | cron, no Authorization header | `X-*-Secret` vs vault |

## NOT pinned — and why that is the point

~24 other functions currently sit at `verify_jwt = false` with no config.toml block. They were
**not** pinned. Leaving them unpinned means the next deploy of each flips it to the default
`true`, which is the safe direction: they are called from the browser through supabase-js, which
sends the `Authorization` header automatically.

**Eleven of them have no internal caller check at all** — grep found no secret comparison, no
`auth.getUser`, no service-role assertion. They are open endpoints on the internet right now:

- `quickbooks-delete-invoice`, `quickbooks-sync-customer`, `quickbooks-list-customers`,
  `quickbooks-link-customer`, `quickbooks-reconcile`, `quickbooks-link-invoices`,
  `quickbooks-debug`
- `send-portal-invite` — sends portal invitation emails
- `hunter-send-briefing`, `hunter-zoominfo-enrich` — the latter spends ZoomInfo credits
- `friday-cfo-email` — sends the CFO email

`email-ingestion-alert-dispatch` was in this group, and deploying it during this same session
flipped it from `false` to `true` — the trap firing again, on a second function, within the hour.
That one is **fine**: its cron sends an Authorization header (a legacy anon JWT, which the gateway
still accepts even though those keys no longer authenticate data access), verified at 200 after
the flip. It is now closed to anonymous callers, which is where it should have been. Left
unpinned deliberately.

This is the evidence for the prediction above: the flip is not hypothetical, it happens on the
next deploy of each function, and the direction is safe for everything in this group.

These were not fixed in this pass because flipping them is a behaviour change to billing, email
and portal flows that deserves its own testing, not a drive-by in a site-research commit. They are
listed here so the decision is explicit rather than forgotten.

### Verified end to end

The drain was exercised against a synthetic `cron_http_alert` row with `self_test: true` (which
routes to a deliberately invalid recipient so the failure path runs): the dispatcher found the
row, built the email, attempted the send, recorded `notify_attempts = 1` with the Resend error,
and returned a non-200 so a silently-failing alerter is itself visible. The synthetic row was then
deleted. Actual delivery to the real recipient has not been exercised — that waits for a real
incident, or a deliberate test send.

## Cron verification

`net.http_post` is fire-and-forget: pg_cron records success when the request is queued, never
when it is answered. `cron_http_post_verified()` checks the response to the **previous** call
before making the next one, and opens a row in `cron_http_alert` on a non-2xx or a request that
was never answered.

It deliberately does **not** raise — raising in the same transaction rolls back the alert row it
just wrote (the first cut of this did exactly that, and the record vanished with the error).
A separate job, `cron-http-alarm`, runs every 5 minutes and raises while any alert is open, which
turns that job red in `cron.job_run_details` without touching the committed record.

**Where a failure surfaces:** `email-ingestion-alert-dispatch` (every 15 minutes) drains
`cron_http_alert` alongside the two email alert tables and **emails it via Resend**, one email per
incident plus one when it clears. The alert table alone would be a table nobody reads; the email
is the part that makes it visible. The red cron row is a secondary signal for anyone already
looking at the dashboard.

Currently verified: `ovis-site-research-tick`. Other cron jobs that post HTTP can be moved onto
`cron_http_post_verified()` the same way — pass a job name, url, headers and body.

---

# merchant_location: the three open items (2026-09-28)

Collected here so they are not re-derived. None is fixed; each moves the merchant map, so each is
its own scheduled decision. Background in [SITE_RESEARCH_GENERATORS.md](SITE_RESEARCH_GENERATORS.md).

**1. Re-home ~1,069 mis-filed rows.** Location names that start with a different brand than the one
they are stored under — "Walmart Supercenter" filed under Golf Mart. The rule to use is the strict
one: the normalized name must START WITH the normalized brand, brand ≥ 5 characters, longest match
wins. A loose "contains" match appears to recover 2,536 but invents them (American Eagle →
American Freight, Batteries Plus → AT&T, DSW Designer Shoe Warehouse → Shoe Carnival). Writing
these back makes ~1,069 currently-hidden locations appear as pins on the merchant map.

**2. Delete the 5,787 that match no brand at all.** The 395 florists a "Roses" search returned, and
their kind. They are not chain locations and nothing recovers them.

**3. `nameMatchesBrand` is a CONTAINS test, and it passes things it should not.** Found 2026-09-28
in a live generators export: **"Nikki Bassett, Realtor" is categorised destination_retail because
its normalized name contains "bassett"**, the furniture brand. A realtor, exported as a retail
generator — and drawn on the merchant map today as a Bassett pin, since the map applies the same
test at render.

The prefix rule in item 1 would reject it, so the natural fix is to make the guard's name test a
prefix test rather than a contains test. Two reasons that is not a drive-by change:

- It moves the map. Rows currently passing on a contains match would stop rendering.
- It would reject legitimate names. "SEPHORA at Kohl's" contains but does not start with its
  brand, and a store legitimately prefixed by a centre name ("Shoppes at X — Kroger") would fail.

So it needs its own pass with a reviewed diff of what enters and leaves the map, not a flag flip.
Until then, a contains-match false positive reaches generators.csv unflagged, because the row
passes the stored-brand path and recovery never examines it.
