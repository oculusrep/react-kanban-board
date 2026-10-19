# Email triage + label pipeline — where this stands, 2026-10-03

Session handoff. Supersedes [EMAIL_TRIAGE_STATUS_2026-09-18.md](EMAIL_TRIAGE_STATUS_2026-09-18.md)
as the current-state doc. Detail lives in:

- [email-triage-spec.md](email-triage-spec.md) — the spec; **§15 is the verification-lessons list**
- [EMAIL_TRIAGE_REVIEW_2026-09-21.md](EMAIL_TRIAGE_REVIEW_2026-09-21.md) — the tier-1 review and the A1 exemption measurement
- [EMAIL_TRIAGE_FINDINGS_2026-09-25.md](EMAIL_TRIAGE_FINDINGS_2026-09-25.md) — findings logged, not acted on
- [SUPABASE_ANON_EXPOSURE_AUDIT.md](SUPABASE_ANON_EXPOSURE_AUDIT.md) — round three covers RPCs
- [sql/label_validation.sql](sql/label_validation.sql) — the same-day instrument test, run it after a labelling session

Everything below is live in production and merged to `main`.

---

## The design, as it now stands

**Gmail is the client. OVIS decides what each message is and writes a label.** It does not
archive and there is no OVIS inbox panel.

| state in Gmail | meaning |
|---|---|
| no label | triage has not run yet |
| `OVIS/Unsorted` | triage ran, no signal |
| any other `OVIS/` label | triage ran and categorised |

Precedence: **personal > rule > business > property > events > reading > junk > unsorted.**
An approved rule outranks every heuristic except ladder B, because the owner said it explicitly.

**DECISION: archive-on-arrival is off the table** (recorded in the spec). Of 865 owner
dispositions measured, 854 were `INBOX` removals and 11 were label removals — the real
habit is *tag and archive*, so archiving is the gesture that means "done". OVIS taking it
over would destroy the only disposition signal there is.

## Running right now

| cron | job | schedule |
|---|---|---|
| 2 | `email-triage-job` | `2-57/5` |
| 15 | `email-ingestion-staleness-check` | `*/15` |
| 16 | `email-ingestion-alert-dispatch` | `5-59/15` |
| 20 | `email-classifier-health-check` | `2-59/15` |
| 23 | `label-watcher-tick` | `*/5` |
| 26 | `label-canary-tick` | `*/5` |
| 28 | `label-inbox-tick` | `4-59/5` (two minutes behind triage) |

Live labels: Business 530 · Junk 432 · Property 299 · Unsorted 134 · Reading 95 ·
Personal 73 · Events 27.
Watcher: 3,342 events, 349 corrections. Rules: **17 active, 4 rejected, 1 disabled.**
Canary: last full cycle 01:20, 0 consecutive failures.

### What each piece is, and what can prove it wrong

- **`label-inbox`** enumerates the inbox **from Gmail** (`email_visibility.folder_label` is a
  write-once snapshot and would answer a different question), derives a label from stored
  verdicts plus approved rules, and applies with `addLabelIds` only. Runs are resumable;
  `reconcile: true` removes labels that are no longer the current decision, scoped to rows
  `email_label` says OVIS applied — a hand-made label has no row and can never be touched.
  A 30-day window also reconciles already-archived mail, so an approved rule reaches the tail.
- **`label-watcher`** reads `labelAdded`/`labelRemoved` on its **own** watermark, attributes
  each event `owner` / `ovis` / `ambiguous`, then classifies the gesture: `handled`
  (disposition), `correction` (training signal, split `silent` vs `wrong`), `superseded`,
  `noise`.
- **`label-canary`** applies and removes a label on one dedicated message and asserts the
  watcher recorded it with the **right attribution and gesture**. Its events are excluded
  from the correction set at record time.
- **`email_labeler_health`** asks of Gmail's inbox how much triaged mail is bare past a 2h
  grace. Verdicts are `healthy` / `unhealthy` / **`inconclusive`** — and inconclusive is not a
  pass: with nothing labellable the check had no way to fail, so it does not claim health.
- **`/admin/label-rules`** proposes a rule per sender at 3+ agreeing corrections (5+ across 2+
  addresses for a domain), unanimous. A proposal that contradicts an OVIS verdict needs a
  `wrong` correction behind it. Approve / reject, with **turn-off from day one**.

## OPEN — in the order I would take them

### 1. BUG, live now: three messages left with no live label

`email_labeler_health` has read **`unhealthy`** since 21:54 (alert fired and was emailed).
`bare_stale = 3`, zero apply errors. The three are `no-reply@zoom.us` "X has joined your
meeting", and each carries **`OVIS/Business(off)` + `OVIS/Unsorted(off)`** — both labels
removed, nothing applied in their place.

This coincides with the one **disabled** rule. The likely mechanism: the rule changed the
decision, reconcile removed the stale label, and the replacement apply never landed — so
reconcile and apply disagree about what the current decision is for those rows. Not
diagnosed further.

Start here: `select … from email_label where gmail_id in (…)` for those three, then one
`label-inbox` run with `reconcile:true` and watch whether `stale_found`/`applied` move. The
health check is doing exactly its job, which is the good news.

### 2. `model_no_verdict` is 35% of model runs and rising (was 29%)

1.5× tokens for no verdict. ~$8/week of model spend, a third of it buying nothing. Suspects
unchanged: the prompt inviting repeated `search_deals`, and `searchDeals`' unranked ILIKE.

### 3. Duplicate per-mailbox rows

The same blast arrives to both mailboxes with different Message-IDs, so it is stored twice
and classified twice — ~3–8/day, and the two copies can disagree.

### 4. `RESEND_FROM_EMAIL` is unset

All alerts send from `onboarding@resend.dev`, which is why they read as External and get
missed. 11 OVIS alerts were delivered and unnoticed. Setting a verified `oculusrep.com`
sender re-versions every edge function (expected, not a deploy).

### 5. Security, still open

- **`supabase_admin` default privileges** — cannot be changed from any session we control;
  see [SUPPORT_TICKET_DRAFT_supabase_admin_default_privileges.md](SUPPORT_TICKET_DRAFT_supabase_admin_default_privileges.md).
  Residual risk low (all 744 such functions are PostGIS) but future objects inherit `anon`
  EXECUTE silently. A watch query is in the audit.
- **22 `authenticated`-callable definer functions with caller checks** — the checks are the
  gate, not the grants. Never swept.
- **`gmail-disconnect` X button disconnects the caller, not the row clicked**, and revokes
  tokens. Live defect, independent of triage.

### 6. Deferred, logged

Daily invite-expiry sweep · tier-1 B enforcement (must follow the watcher) · §4 commitment
table · §11 kill switch · the 23,503 pre-ingestion gap in asantos@'s inbox.

## Facts worth not rediscovering

- **A revoke that printed `REVOKE` is not evidence.** A function is anon-reachable through the
  `PUBLIC` grant *and* an explicit `anon` grant from `ALTER DEFAULT PRIVILEGES`; closing one
  says nothing about the other. Verify with an anonymous HTTP request, never by re-reading
  an ACL.
- **`pg_net` abandons a response after 5s**, and `label-inbox` takes 20–40s. The cron can
  never observe it. `email_labeler_health` is the only observable.
- **PostgREST caps an unpaginated select at 1000 rows** whatever `.limit()` says. A truncated
  read reports health about the part it can see.
- **Inside a `SECURITY DEFINER` function, `current_user` is the owner.** A guard that reads it
  is always true. Read the JWT claim instead.
- **`pg_get_functiondef` emits no trailing semicolon**, and `$function$` appears twice —
  append statements carefully or regenerate the file.
- **Tier-1's privacy guarantee lives entirely in `enforce`**, which has never been on. School
  and family mail is stored in full and modelled today (132 emails, 23 of them 1:1).
