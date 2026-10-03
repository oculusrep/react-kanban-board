# Email triage — findings logged 2026-09-25, not acted on

Recorded during the inbox-labelling work. **None of these has been changed.** Each is here so it
is not rediscovered, and so the decision to act is deliberate.

---

## 1. DEFECT, LIVE TODAY — the Gmail Settings "X" disconnects the caller, not the row clicked

Independent of triage. Anyone with two connections visible can disconnect the wrong account.

`GmailSettingsPage.tsx:734-762` sends only `{delete_emails:false}`; the `connectionId` argument is
used for the spinner and the confirm text and is **never transmitted**. `gmail-disconnect`
(`index.ts:34-36, 81-99, 137-146`) resolves the connection from the **caller's own JWT**
(`.eq('user_id', user.id)`).

So if mike clicks X on asantos' row, **mike's own connection is revoked**. It also overwrites
`access_token` / `refresh_token` with the literal `'[REVOKED]'` and revokes them at Google, which
permanently breaks attachment downloads and label applies for every email whose `email_visibility`
row points at that connection — `get-attachment`, email-triage's label apply and both backfills look
the connection up **by id with no `is_active` check**.

**Consequence:** never deactivate a mailbox from the UI. A SQL
`UPDATE gmail_connection SET is_active = false WHERE google_email = '...'` is far less destructive,
because the tokens stay valid for historical lookups.

## 2. Ingestion for asantos@ stays ON — sending as him breaks in five places

Deactivating the connection would break, not degrade:

| function | effect |
|---|---|
| `send-site-submit-email/index.ts:108-122` | 400 `Gmail not connected` |
| `hunter-send-outreach/index.ts:87-95` | error |
| `send-portal-digest/index.ts:75-84` | `GMAIL_NOT_CONNECTED` |
| `_shared/bookkeeper-tools.ts:1080-1088` | commission email fails |
| `process-arty-commission/index.ts:559-563` | **silently no-ops** the email |

Two more would change sender silently: `hunter-send-briefing` picks the *oldest* active connection
(`index.ts:69-77`) and `send-portal-invite` falls back to any active one (`:99-108`).

## 3. LANDMINE — the 404 probe filters on `is_active`, so one connection misreports every 404

`email-triage/index.ts:437-467` looks for other mailboxes with `.neq('id', ...).eq('is_active', true)`
and, finding none, records `gone:no-other-mailbox`.

With a single active connection that branch is unreachable, so **every 404 is reported as permanently
gone**, including retryable wrong-mailbox failures. The instrumentation would keep producing verdicts
and they would all be wrong — worse than no instrumentation, because the verdicts look measured.
Fix the probe before any single-mailbox change.

## 4. Deleting a `gmail_connection` row destroys data — deactivating does not

| referencing table | on delete |
|---|---|
| `email_label.gmail_connection_id` | **CASCADE** — the entire label audit trail |
| `email_visibility` / `unmatched_email_queue` / `processed_message_ids` / `email_tier1_stub` | SET NULL |

The NULLs are not benign: `unmatched_email_queue_select` and `email_tier1_stub_select` filter
*through* `gmail_connection_id`, and `NULL IN (subquery)` is never true, so those rows become
invisible to every authenticated user while still existing. Attachment fetch breaks permanently for
that mailbox's historical mail, because reconnecting mints a new connection id and nothing re-links
old rows.

RLS on `emails` itself is keyed on `email_visibility.user_id → user.auth_user_id`
(`20260921100439_email_rls_lockdown.sql:30-45`), so **no email becomes invisible** from deactivating.

## 5. asantos@ inbox holds 23,503 messages OVIS has never seen

Measured 2026-09-25 by enumerating from Gmail: inbox 28,539, known to OVIS 5,036.

That mailbox has never been archived, and ingestion began 2025-12-11 with a 50-message-per-sync cap,
so the backlog predates OVIS entirely. It is **not** attributable to the history-pagination bug fixed
the same day (that bug needs >50 messages in one 5-minute window; the observed peak is 38).

Labelling it would write ~3,600 labels and leave 87% unsorted. Logged; not acted on.

## 6. Personal (ladder B) stores everything today, because tier 1 is log-only

Worth stating plainly, because the design intent reads the other way. `buildTier1Stub`
(`_shared/tier1.ts:182-206`) writes a personal stub carrying **only** `message_id`,
`gmail_connection_id` and `processed_at` — no sender, no reason, enforced by the CHECK constraint
`pmi_personal_stub_carries_no_sender`.

But `TIER1_MODE = 'log_only'`, and the enforce branch is what skips the insert
(`gmail-sync/index.ts:207-210`). In log_only the email **falls through and is stored in full** —
body, sender, subject — and is classified by the model like anything else. The privacy property
belongs to `enforce`, which has never been on. Personal mail is being read by a model today; the
TeamSnap example in `tier1.ts:110-113` records the same finding from 2026-09-06.

---

## 7. 2026-09-29 — the watcher's first real batch, and what it changed

**The watcher recorded nothing for three days.** Its unique index was on
`COALESCE(history_id,'')` while the upsert named the plain columns, so every insert raised 42P10;
the error was counted, never logged, and the watermark advanced on *reading* rather than on
*recording*. 1,046 "successful" cron runs, 0 rows. Recovered by rewinding the cursor —
**1,396 events**, nothing lost but the original timestamps. Written up as the sixth §15 instance in
the spec, and the first this project built rather than found.

Three classification errors that only real data exposed, all fixed:

| symptom | cause | fix |
|---|---|---|
| 93 events credited to the owner | `OVIS-Linked` predates the `OVIS/` namespace | attributed to OVIS |
| 854 `INBOX` removals would pair as corrections | archiving is not a category change | own disposition; foreign labels → `noise` |
| 122 rows "ambiguous" | OVIS applied a label, never removed it, yet it came off — that is the OWNER, not uncertainty | attributed to the owner; 0 ambiguous now |

### The workflow is tag-and-archive, not clear-the-queue

Of 865 dispositions, **854 are `INBOX` removals and 11 are label removals**. The design assumption —
open a label, handle the mail, empty the list — is not what happens. Archiving is the gesture that
means done. This is what put archive-on-arrival off the table (decision recorded in the spec).

### Corrections split by what OVIS knew

| kind | n | meaning |
|---|---|---|
| `silent` | 142 | OVIS had no label; the owner supplied one |
| `wrong` | 119 | OVIS had a verdict and was overridden |

Recorded in `gmail_label_event.correction_kind`, additive: `gesture` stays `correction` for both, so
earlier analysis stays reproducible, and the value is derivable from `email_label` at any time.

### Never build a sender rule on the owner's own address

`mike@oculusrep.com` contradicts itself 8 times (5 Business, 3 Personal) and that is **correct**: his
sent mail genuinely is both. No sender rule can separate them; thread context can.

**Coverage check of the personal-thread rule:** 20 outbound messages sit in 8 school threads, so the
rule reaches them — but of the 3 messages he tagged Personal himself, only **2** are in a school
thread. The third is `Re: Maintenance Renewal` with `wadeheating.com`: personal-life admin that no
school domain and no thread rule will ever catch. Ladder B covers the school half, not the whole of
personal.

Any rule proposer must exclude `INTERNAL_EMAIL_DOMAINS` senders from sender-level rules outright.
