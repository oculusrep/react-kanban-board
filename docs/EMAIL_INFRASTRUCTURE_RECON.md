# Email Infrastructure Recon — 2026-09-05

Read-only investigation of OVIS email ingestion, matching, Gmail OAuth/labels, and the
relationship to deal state. No writes, no migrations, no deploys. Prod project
`rqbvcvwbziilnycqtmnc`. All counts as of 2026-09-05 ~17:15 UTC.

> ## ⚠️ READ THIS FIRST — much of what follows has been FIXED
>
> This document is the **recon snapshot of 2026-09-05**, kept as the evidence base and the record
> of how each problem was found. It is **not** current-state. Six dependencies were built against
> it and merged to `main` on 2026-09-07.
>
> **Current state: [`email-triage-spec.md`](email-triage-spec.md) → STATUS.**
>
> | Finding below | Now |
> |---|---|
> | 18 of 63 board tiles lying; email resets `ball_in_court_since` | **fixed** — `20260905172258`, board is email-blind |
> | Corrections dead since 2026-01-30; agent reads the starved table | **fixed** — 6 write sites redirected, 15 rows backfilled (63 → 78) |
> | `searchDeals` gated to 5 stages, 69 of 771 deals visible | **fixed** — 7 stages, 95 visible |
> | Thread inheritance copies at flat 0.95, propagating false positives | **fixed** — floor 0.80 on the seed, propagate `min(seed, 0.90)` |
> | Bulk mail hard-DELETEd after a paid model call (2,603/30d) | **partly** — delete→demote enforced; tier-1 pre-insert filter is built but in `log_only`, filtering nothing until 09-13 |
> | ~25% of label applies 404 | **instrumented, not fixed** — cause is being measured before the migration |
> | `OVIS-Linked` applying? scopes granted? | **answered** in Addendum 4 — yes and yes (`gmail.modify` held on both) |
> | "No UI shows emails on a deal page" | **that claim was wrong** — see the spec's silo section |
>
> Still true and still unfixed: the ingestion crons authenticate with the legacy anon JWT;
> `deal-synopsis` is live-but-empty on retired `gemini-1.5-pro`; `cfo-query` and `bookkeeper-query`
> run deprecated `claude-sonnet-4-20250514`; three dead `gemini-1.5-*` call sites remain.

**Headline:** email ingestion is live and healthy (5-min cron, ~590 emails/7d), AI linking is
live, Gmail labeling code exists and holds the right scope. The assumption "email is ingested,
linked to deals, and Gmail-tagged today" is **broadly true** — with three caveats:
only **10.7%** of emails get a *deal* link, Gmail-label success is **unrecorded anywhere**
(fire-and-forget, no DB column, no read-back), and `deal_activity_state.ball_in_court_since`
**is already being written by inbound email** via a trigger chain nobody labeled as an email path.

---

## 1. Schema

### Tables

| Table | Rows | First | Last | 7d | 30d |
|---|---|---|---|---|---|
| `emails` | 22,286 | 2025-12-11 | **2026-09-05 17:10** | 587 | 2,736 |
| `email_object_link` | 36,426 | 2025-12-12 | 2026-09-04 20:45 | 1,410 | 5,194 |
| `email_visibility` | 26,481 | 2025-12-11 | **2026-09-05 17:10** | 712 | 3,278 |
| `processed_message_ids` | 22,948 | 2025-12-12 | 2026-09-05 15:45 | 616 | 2,629 |
| `email_attachments` | 104 | 2025-12-15 | **2025-12-15** | 0 | 0 |
| `unmatched_email_queue` | **0** | — | — | 0 | 0 |
| `gmail_connection` | 2 | 2025-12-11 | 2026-01-12 | — | — |
| `email_template` | 2 | — | — | — | — |
| `user_email_signature` | 2 | — | — | — | — |
| `portal_email_send` | 56,150 | 2026-04-26 | 2026-08-20 | 0 | 7,942 |
| `pending_client_comment_email` | 0 | — | — | 0 | 0 |
| `thread_message` | **0** | — | — | 0 | 0 |
| `deal_synopsis` | **0** | — | — | 0 | 0 |

`emails.received_at` tracks `created_at` within one row over 30d — ingestion is real-time, not backfilled.

### Column shapes (abridged)

- **`emails`** (19 cols): `message_id` (RFC), `gmail_id`, `thread_id`, `in_reply_to`,
  `references_header`, `direction`, `subject`, `body_text`, `body_html`, `snippet`,
  `sender_email`, `sender_name`, `recipient_list` jsonb, `received_at`, `ai_processed`,
  `ai_processed_at`, `agent_reasoning_log` jsonb.
  **No `deal_id` column** — linking is polymorphic via `email_object_link`.
- **`email_object_link`** (9): `email_id`, `object_type` varchar, `object_id` uuid,
  `link_source` varchar, `confidence_score` numeric, `created_by_user_id`, `reasoning_log`.
  `object_id` is **untyped/polymorphic — no FK to deal, contact, client, or property.**
- **`email_visibility`** (7): per-user fan-out. `folder_label` (INBOX/SENT only), `is_read`.
- **`unmatched_email_queue`** (18): full human-review queue schema — `suggested_contact_name`,
  `matched_object_type/id/name`, `match_reason`, `status`, `reviewed_by_user_id`. **Empty; dead.**
- **`gmail_connection`** (13): `access_token`, `refresh_token`, `token_expires_at`,
  `last_history_id`, `last_sync_at`, `is_active`, `sync_error`, `sync_error_at`.
  Tokens stored **plaintext** in the table (no vault, no pgsodium).

### FKs

Real FKs **into** `emails`:
- `activity.email_id → emails.id` ← **the only bridge from email into deal state**
- `agent_corrections.email_id`, `ai_correction_log.email_id`
- `email_attachments.email_id`, `email_object_link.email_id`, `email_visibility.email_id`,
  `unmatched_email_queue.email_id`

FKs out: `email_visibility.user_id → user`, `email_visibility.gmail_connection_id`,
`gmail_connection.user_id → user`, `email_object_link.created_by_user_id → user`,
`processed_message_ids.gmail_connection_id`, `unmatched_email_queue.reviewed_by_user_id`.

**Absent:** no FK from any email table to `deal`, `contact`, `client`, `property`, `note`, or
`note_object_link`. The deal association exists only as an uncheckable uuid in
`email_object_link.object_id`, plus the `activity` row that triage writes.

### Broken / absent

- `email_attachments` stopped 2025-12-15 — one backfill run, nothing since, despite
  `gmail-sync` containing live attachment-insert code (see §2).
- `unmatched_email_queue`, `thread_message`, `deal_synopsis` are all empty schema.

---

## 2. Edge functions

| Function | Deployed | Ver | Last deploy | What it does |
|---|---|---|---|---|
| `gmail-connect` | ACTIVE | 46 | 2025-12 | Builds Google OAuth consent URL |
| `gmail-callback` | ACTIVE | 50 | 2025-12 | Exchanges code, upserts `gmail_connection` |
| `gmail-disconnect` | ACTIVE | 42 | 2025-12 | Revokes token |
| `gmail-sync` | ACTIVE | 55 | 2025-12 | **Cron.** Pulls Gmail → `emails` + `email_visibility` |
| `email-triage` | ACTIVE | 80 | **2026-08** | **Cron.** Gemini agent links emails, writes `activity`, applies Gmail label |
| `email-correction` | ACTIVE | 42 | 2025-12 | User add/remove tag; logs to correction tables |
| `deal-synopsis` | ACTIVE | 42 | 2025-12 | Gemini summary of a deal's email activity → `deal_synopsis` |
| `backfill-gmail-labels` | ACTIVE | 42 | 2025-12 | One-shot: apply `OVIS-Linked` to already-linked emails |
| `backfill-attachments` | ACTIVE | 40 | 2025-12 | One-shot attachment metadata backfill |
| `get-attachment` | ACTIVE | 40 | 2025-12 | Streams an attachment from Gmail on demand |

Non-ingestion email *senders* (separate concern, not part of this pipeline):
`send-site-submit-email`, `send-critical-date-email`, `send-critical-date-reminders-cron`,
`send-portal-invite`, `send-portal-digest`, `send-portal-comment-alert`, `friday-cfo-email`,
`hunter-send-briefing`, `hunter-send-outreach`.

### External APIs

- `gmail-sync`, `email-triage`, `backfill-gmail-labels`, `get-attachment` → **Gmail REST v1**
  (`users.messages.list/get`, `users.history.list`, `users.labels.*`, `users.messages.modify`)
  and **Google OAuth2 token endpoint**.
- `email-triage`, `deal-synopsis` → **Gemini** (`generativelanguage.googleapis.com/v1beta`),
  function-calling loop, max 5 iterations, batch of 5 emails/tick.

### Tables read/written

- `gmail-sync` — reads `gmail_connection`, `processed_message_ids`, `emails`;
  writes `emails`, `email_visibility`, `email_attachments`, `gmail_connection`
  (token/history/last_sync).
- `email-triage` — reads `emails` (`ai_processed=false`), `email_visibility`, `activity_type`,
  `agent_rule*`, `deal`/`contact`/`client`/`property` (search tools), `email_object_link`
  (thread inheritance), `gmail_connection`; writes `email_object_link`, **`activity`**,
  `emails.ai_processed`, `processed_message_ids`, `gmail_connection` (refreshed token),
  and **DELETEs `emails` rows** the agent judges non-business.
- `email-correction` — writes `email_object_link`, `agent_corrections` / `ai_correction_log`.
- `deal-synopsis` — reads `activity`; writes `deal_synopsis`.

### Cron

| Job | Schedule | Active | Last succeeded | Notes |
|---|---|---|---|---|
| `gmail-sync-job` (id 1) | `*/5 * * * *` | ✅ | 2026-09-05 17:10 | 576/576 succeeded in last 48h, zero failures |
| `email-triage-job` (id 2) | `2-57/5 * * * *` | ✅ | 2026-09-05 17:07 | 576/576 succeeded, offset 2 min behind sync |

Both call the function with a **hardcoded legacy `anon` JWT** in the cron body (not a vault
secret). Per the 2025-10-23 legacy-key disablement this *should* fail auth — it does not;
`cron.job_run_details` shows 100% success and rows keep landing, so the legacy anon JWT is
still accepted for edge-function invocation on this project. Fragile, but working.

No cron for `deal-synopsis`, `backfill-gmail-labels`, `backfill-attachments`, `get-attachment`,
`email-correction` — all on-demand.

### `deal-synopsis` — NOT dead, but non-functional

- **Referenced:** `src/components/DealSynopsis.tsx:73` POSTs to it; rendered at
  `src/pages/DealDetailsPage.tsx:595` on every deal detail page.
- **Deployed:** ACTIVE, version 42, never redeployed since 2025-12-11.
- **But `deal_synopsis` has 0 rows** despite the function upserting on every successful run.
  So either the component never fires in practice, or every invocation errors before the
  upsert. Cannot distinguish from the DB alone.
- Its `ball_in_court` / `ball_in_court_type` are **a different concept** from
  `deal_activity_state.ball_in_court*` — see §6.

### Broken / absent

- No webhook / Gmail push (`users.watch`); polling only, 5-min floor on latency.
- Full-sync fallback caps at 50 messages (`listMessages(accessToken, 50)`) — a >50-message gap
  during a `historyId` expiry is silently dropped.
- `email-triage` **hard-deletes** email rows on the agent's `action: 'delete'` verdict. No
  soft-delete, no audit row beyond `processed_message_ids.action='deleted'`. Irreversible.

---

## 3. Email → deal matching

### Where

- Orchestrator: `supabase/functions/email-triage/index.ts`
- Algorithm: `supabase/functions/_shared/gemini-agent.ts` (`runEmailTriageAgent`, line 934)

### Algorithm, in order

1. **Rule hard-override** (before any AI). `searchRules(sender_email, subject_keywords)` matches
   user-defined rows in the agent-rule table on sender address, sender *domain*, or subject
   keywords >3 chars.
   - `rule_type='exclusion'` → mark irrelevant, `action='delete'`, **return immediately**.
   - rule with `target_object_type` + `target_object_id` → link at confidence **1.00**, return.
2. **Thread inheritance.** If `thread_id` matches any other email that already has
   `email_object_link` rows, copy every distinct `(object_type, object_id)` onto this email at
   confidence **0.95**, reason `"Thread inheritance: Same conversation as tagged email"`.
   This is the single largest source of deal links in practice.
3. **Gemini agent loop** (max 5 tool-calling iterations) with these tools:
   - `searchDeals(query)` — `deal.deal_name ILIKE %query%`, **restricted to 5 active stages**
     (Negotiating LOI, At Lease/PSA, Under Contract / Contingent, Booked, Executed Payable),
     limit 10.
   - `searchContacts(query)` — ILIKE across `first_name, last_name, email, company`, limit 10.
   - `searchClients(query)` — `client_name ILIKE`, `is_active_client=true`, limit 10.
   - `searchProperties(query)` — ILIKE across `property_name, address, city`, limit 10.
   - `getDealParticipants`, `getRelevantCorrections` (past user corrections fed back into the
     prompt), `linkObject`, `flagForReview`.
   - A `PUBLIC_EMAIL_DOMAINS` blocklist stops gmail.com/yahoo.com-style domains from being
     treated as company identity.
   - The model chooses the search strings and the final links; it writes its own
     `reasoning_log` and `confidence_score` per link.
4. **Post-link side effects** (in `email-triage/index.ts`): for **each** deal tag, insert an
   `activity` row (`activity_type='Email'`, `sf_status='Completed'`, `email_id`, `deal_id`,
   plus first contact/property tag). If there are no deal tags but there is a contact or
   property tag, insert one activity without `deal_id`.
5. Mark `ai_processed=true`; if ≥1 link was created, apply the `OVIS-Linked` Gmail label (§5).

**It is not sender-domain matching and not subject parsing** — it is (a) manual rules,
(b) thread-continuity propagation, (c) an LLM doing ILIKE searches over CRM names and deciding.

### Coverage

| Metric | Count | % of 22,286 |
|---|---|---|
| Emails with **any** link | 12,056 | **54.1%** |
| Emails with a **deal** link | 2,376 | **10.7%** |
| Emails with no link at all | 10,230 | 45.9% |
| `ai_processed = true` | 22,286 | **100%** (zero backlog) |
| Deal-linked, last 30d | 471 / 2,735 | **17.2%** |

Links by type and source:

| object_type | source | links | distinct emails | last |
|---|---|---|---|---|
| contact | ai_agent | 20,885 | 11,370 | 2026-09-04 |
| client | ai_agent | 10,974 | 7,891 | 2026-09-04 |
| **deal** | ai_agent | 2,690 | 2,342 | 2026-09-04 |
| property | ai_agent | 1,821 | 1,373 | 2026-09-04 |
| deal | **manual** | 35 | 35 | **2026-01-15** |
| contact | manual | 10 | 10 | 2026-01-27 |
| client | manual | 7 | 7 | 2026-01-12 |
| property | manual | 4 | 4 | 2026-01-30 |

Manual correction stopped ~Jan 2026 — 56 lifetime manual links, none in 7 months. The
`email-correction` path exists but is effectively unused; `ai_correction_log` has 191 rows and
`agent_corrections` 63, also historical.

### Sample — 10 deal-matched (most recent)

| sender | subject | deal | conf | reason |
|---|---|---|---|---|
| dwarkesh1624@gmail.com | Re: [EXTERNAL] Re: BWW Lease Draft - Taylors, SC (Hampton Village…) | BWWGo - Hampton Village - Taylors, SC | 0.95 | name matches subject/body keywords |
| tyler@streetviewcommercial.com | Re: SBUX LOI - Powder Springs Rd & EWC | SBUX - Powder Springs Rd & EW Connector | 0.95 | subject + body discuss this LOI |
| asantos@oculusrep.com | Re: Barrio Burrito x Barrett Corners | **Poke House - Dean Wang - Barrett Corners - Phase 3** | 0.95 | thread inheritance |
| asantos@oculusrep.com | Re: Barrio Burrito x Barrett Corners | **Poke House - Dean Wang - Barrett Corners - Phase 3** | 0.95 | thread inheritance |
| asantos@oculusrep.com | Re: [EXTERNAL] Re: BWW Lease Draft - Taylors, SC | BWWGo - Hampton Village - Taylors, SC | 0.95 | thread inheritance |
| asantos@oculusrep.com | Re: [EXTERNAL] Re: BWW Lease Draft - Taylors, SC | BWWGo - Hampton Village - Taylors, SC | 0.95 | thread inheritance |
| asantos@oculusrep.com | Re: [EXTERNAL] Re: BWW Lease Draft - Taylors, SC | BWWGo - Hampton Village - Taylors, SC | 0.95 | subject/body explicit |
| asantos@oculusrep.com | Re: [EXTERNAL] Re: BWW Lease Draft - Taylors, SC | BWWGo - Hampton Village - Taylors, SC | **1.00** | deal name matches subject |
| lexi@riverwoodproperties.com | RE: Barrio Burrito x Barrett Corners | **Poke House - Dean Wang - Barrett Corners - Phase 3** | 0.80 | "Deal is related to Barrett Corners" |
| asantos@oculusrep.com | Re: [EXTERNAL] Re: BWW Lease Draft - Taylors, SC | BWWGo - Hampton Village - Taylors, SC | 0.95 | subject/body directly discuss |

Eyeball verdict: BWW and SBUX matches look correct. **"Barrio Burrito x Barrett Corners" →
"Poke House - Dean Wang - Barrett Corners - Phase 3" is a location-collision false positive** —
matched on shared shopping center, wrong tenant. It then propagated to 2 more emails by thread
inheritance at 0.95. That's the failure mode the design invites: `searchDeals` only ILIKEs
`deal_name`, so a deal name that embeds a center name will attract any email about that center
regardless of tenant, and step 2 then locks it in for the whole thread.

Also note the same email appears 4× above — `email_object_link` has **no unique constraint on
`(email_id, object_type, object_id)` being enforced against re-linking**; one email carries
multiple deal links with different confidences and reasons (2,690 deal links across only 2,342
distinct emails; 36,426 links across 12,056 emails ≈ 3.0 links/email).

### Sample — 10 unmatched (most recent)

| sender | subject |
|---|---|
| bryan@capital.usrccapital.com | August 2026 Capital Markets Update |
| newsletter@divenewsletter.com | Weekender: Kroger taps Walmart tech veteran… |
| newsletter@divenewsletter.com | Weekender: It's official: Yum has sold Pizza Hut for $1.5B |
| noreply@uschedulenotifications.com | Appointment Reminder for STUDIO Fwy/Hyb Fitting |
| no-reply@mailchimp.com | Mailchimp Order |
| nationalnetlease@srsrealestatepartners.com | New 7 Brew Coffee in Birmingham AL \| 20 Yr GL |
| googlealerts-noreply@google.com | Google Alert - Medical Cannabis Georgia |
| googlealerts-noreply@google.com | Google Alert - Medical Marijuana Georgia |
| tenantrep@leetemecula.com | Del Taco - Seeking Sites |
| noreply@bottomline.com | Enroll in Paymode for Fast, Secure Payment |

Unmatched set is almost entirely newsletters, alerts, and cold broker blasts — correct
non-matches. The 45.9% unlinked figure is not a precision failure; it's inbox noise the agent
declined to link (and, for some, declined to delete).

### Broken / absent

- **`searchDeals` is stage-gated.** A deal in any stage outside those five (e.g. Prospecting,
  Pre-Submittal, Lost, Closed) is **invisible to the matcher**. Emails about early-stage deals
  can never be deal-linked by the AI path.
- No confidence threshold gate — a 0.80 guess is stored identically to a 1.00 rule match, and
  both then propagate at 0.95 through the thread.
- `unmatched_email_queue` is the designed human-review escape hatch and **nothing writes to it**.
  `flagForReview` exists as a tool; the queue table stayed empty.

---

## 4. Gmail OAuth

### Scopes — **go for archive + label**

Requested at `supabase/functions/gmail-connect/index.ts:22-26`:

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/userinfo.email
```

- **`gmail.modify` is held** — that is read + add/remove labels + archive (removing `INBOX`
  is a label modify). **Not read-only.** A later archive+label phase is a **GO** on scope
  grounds, no re-consent needed *provided* the two existing grants were issued under this
  scope set.
- `gmail.send` also held (used by `hunter-send-outreach` / `sendEmail`).
- **Caveat:** the granted scopes are **not stored** — `gmail_connection` has no `scope`
  column and the callback doesn't persist the token response's `scope` field. The two live
  connections were created 2025-12-11 and 2026-01-12; whether they consented to the current
  scope list or an earlier one cannot be verified from the DB. The fact that
  `applyLabelToMessage` has a live `403 → "gmail.modify scope required"` fallback path
  (`_shared/gmail.ts:677`) suggests this was a real failure mode at some point.

### Tokens

- Stored **plaintext** in `public.gmail_connection.access_token` / `.refresh_token`
  (refresh tokens 103 chars, i.e. real Google refresh tokens, not encrypted blobs).
- Refresh **is working**, both connections:

| google_email | active | token_expires_at | last_sync_at | last_history_id | sync_error |
|---|---|---|---|---|---|
| mike@oculusrep.com | ✅ | 2026-09-05 17:45 | 2026-09-05 17:10 | 21736204 | null |
| asantos@oculusrep.com | ✅ | 2026-09-05 18:00 | 2026-09-05 17:10 | 8082558 | null |

Both tokens are in the future, both synced within the last 5 minutes, zero sync errors.
Refresh happens lazily in `gmail-sync` and again in `email-triage` before label application
(`isTokenExpired` → `refreshAccessToken` → write back).

### Broken / absent

- No `scope` column → cannot audit what was actually granted; a silently-downgraded grant
  would only surface as a 403 in edge logs.
- Tokens unencrypted at rest in a regular public-schema table.
- Only 2 connections. Any deal correspondence flowing through a third employee's inbox is
  invisible to OVIS.

---

## 5. Gmail labels

### Labels OVIS writes

**Exactly one: `OVIS-Linked`.**

Defined twice as a constant:
- `supabase/functions/email-triage/index.ts:34`
- `supabase/functions/backfill-gmail-labels/index.ts:24`

Machinery in `_shared/gmail.ts`: `listLabels`, `getLabel`, `createLabel`, `findLabelByName`,
`getOrCreateLabel`, `modifyMessageLabels` (line 637, `users.messages.modify`),
`applyLabelToMessage` (line 661).

### Trigger logic

- **`email-triage`** (`index.ts:259-312`), per email, after processing:
  applies `OVIS-Linked` **iff** `agentResult.links_created > 0` **AND** `email.gmail_id` is
  present **AND** a `gmail_connection_id` was resolved from `email_visibility`.
  Refreshes the token first if expired. Wrapped in try/catch — **a label failure never fails
  the triage**, it's logged and counted in the response only.
  Note: `links_created > 0` means *any* link — a contact-only link labels the email too. The
  label does not mean "deal-linked".
- **`backfill-gmail-labels`** — one-shot, no cron. Selects already-linked emails and applies
  the same label. Last deployed 2025-12-15.

### Feedback path — **none**

- Nothing reads user-applied Gmail labels back into OVIS. `gmail-sync` inspects `labelIds`
  for exactly two things: `SENT` vs `INBOX` (→ `email_visibility.folder_label`) and `UNREAD`
  (→ `email_visibility.is_read`). Every other label, including `OVIS-Linked` itself, is
  discarded.
- There is **no column anywhere** recording whether the label was applied. `gmail_label_applied`
  exists only in the edge function's HTTP response body, which the cron discards.
  **Whether labeling is currently working is unverifiable from the database** — it would
  require reading edge-function logs or the Gmail account itself.
- No archive logic exists. `modifyMessageLabels` only ever adds; nothing removes `INBOX`.

### Broken / absent

- No label removal, no archive, no per-user or per-deal labels, no label taxonomy beyond
  the single flag.
- No round-trip: a human labeling a message in Gmail cannot teach OVIS anything.

---

## 6. Relationship to deal state

### Graph position

Email is a **partially-connected silo** with exactly one bridge into the deal graph:

```
Gmail ──gmail-sync──> emails ──┬── email_visibility (per-user)
                               ├── email_attachments (stalled)
                               ├── email_object_link ── object_id (uuid, NO FK) ──> deal/contact/client/property
                               └── activity.email_id ──> activity.deal_id ──> [TRIGGER] ──> deal_activity_state
```

- **vs `note` / `note_object_link`: completely separate silo.** `note` has 1,613 rows,
  `note_object_link` 3,325 (303 with `deal_id`). Neither table has any email-referencing
  column (verified: 0 columns matching `%email%`), no FK either direction, and nothing
  converts an email into a note. Notes use a *typed* link table (`note_object_link.deal_id` is
  a real column); emails use an *untyped* polymorphic one. Two parallel, non-interoperable
  linking designs.
- **vs `activity`: same graph, one-way.** `activity.email_id → emails.id` is the join.
  12,379 activity rows carry an `email_id` (2,827 of them with a `deal_id`); 419 created in
  the last 7 days. This is written exclusively by `email-triage`.

### Does anything write email data into `deal_activity_state.ball_in_court_since`?

**Yes — indirectly, today, in production, on every deal-linked email.**

Complete writer trace for that column:

| # | Writer | Path | Value | Email-driven? |
|---|---|---|---|---|
| 1 | `reset_deal_activity_clock()` — the **only** DB function referencing the column | trigger `trg_reset_clock_on_activity_insert` — `AFTER INSERT ON activity WHEN (new.deal_id IS NOT NULL)` | `NOW()` | **YES** — `email-triage` inserts exactly such rows |
| 2 | same function | trigger `trg_reset_clock_on_note_link` — `AFTER INSERT ON note_object_link WHEN (new.deal_id IS NOT NULL)` | `NOW()` | no |
| 3 | `ClassifyControls.tsx:106` (deal-board worktree) | client upsert on ball-in-court classify | `new Date()` | no |
| 4 | `ParkControl.tsx:49` (worktree) | park a deal | park review date | no |
| 5 | `ParkControl.tsx:68` (worktree) | un-park | `new Date()` | no |
| 6 | `20260826120000_deal_activity_state_backfill.sql` | one-time backfill | historical | no |

`reset_deal_activity_clock()` is `SECURITY DEFINER`, does
`INSERT … ON CONFLICT (deal_id) DO UPDATE SET ball_in_court_since = NOW(), seeded_fallback = FALSE`.

Evidence it is firing from email right now:
- 186 activity rows with **both** `email_id` and `deal_id` created in the last 7 days.
- **All 186** target deals that have a `deal_activity_state` row.
- `deal_activity_state`: 63 rows, 37 with `ball_in_court_since` inside the last 7 days,
  3 within the last 24 hours.

**This contradicts the mental model that email is not yet wired into deal state.** It is —
just not deliberately. And the semantics are wrong in a specific way: the trigger fires on
*any* activity insert with a `deal_id`, so an **inbound** email from the counterparty resets
the neglect clock identically to an outbound one. A deal where the other side keeps emailing
and we never reply reads as freshly-touched on the board.

Secondary note: `deal_synopsis.ball_in_court` / `ball_in_court_type` (varchar, AI-derived,
values like `landlord`/`tenant`/`us`/`them`) is a **different, older, unrelated** concept from
`deal_activity_state.ball_in_court*`. The `deal_synopsis` version was the 2025-12 Gemini design
and has 0 rows. Don't conflate them.

### Schema-drift flag

`deal_activity_state` and its triggers **are live in production** but the migrations that
created them live only in the `react-kanban-board-deal-board` worktree
(`20260825190000_deal_activity_state.sql` … `20260831170000_deal_activity_state_urgent.sql`,
10 files) — **none are in `main`'s `supabase/migrations/`**. This is exactly the shared-prod-DB
drift CLAUDE.md warns about: prod schema is ahead of `main`.

One anomaly: `max(ball_in_court_since)` = **2026-10-01**, ~26 days in the future. Explained —
1 deal is parked (`parked_until` not null) and `ParkControl` deliberately sets
`ball_in_court_since` to the future review date. Not a bug, but any consumer computing
"days neglected" from this column gets a negative number for parked deals.

---

## 7. MCP

**Yes — OVIS exposes exactly one MCP server today.**

- `supabase/functions/ovis-research-mcp/index.ts` — MCP over HTTP, JSON-RPC 2.0,
  `SERVER_INFO = { name: 'ovis-research-mcp', version: '0.1.0' }`,
  `MCP_PROTOCOL_VERSION = '2025-03-26'`.
- Deployed ACTIVE, version 12, last updated 2026-08-31 (most recently touched MCP artifact).
- `supabase/config.toml`: `[functions.ovis-research-mcp] verify_jwt = false` — auth is a
  bearer token validated in-function against `OVIS_MCP_BEARER_TOKEN`.
- Four tools, all market-research scoped: `get_municipalities_in_radius`,
  `create_research_checklist`, `update_checklist_status`, `submit_research_report`.
  Writes go through SECURITY DEFINER RPCs from
  `20260607120000_market_research_mcp_rpcs.sql`.
- Consumer is the external OpenClaw market-research subagent.

**Absent:**
- No MCP dependency in `package.json` (no `@modelcontextprotocol/*`) — the server is
  hand-rolled JSON-RPC in Deno, not the SDK.
- **Zero MCP references anywhere in `src/`** — no frontend routes, no client, no config.
- **No email/deal/CRM MCP surface at all.** Nothing exposes `emails`, `email_object_link`,
  `deal`, `activity`, or `deal_activity_state` over MCP. An email-aware agent would need a
  new server or new tools on this one.

---

## Could not determine

1. **Whether the `OVIS-Linked` Gmail label is actually being applied today.** No DB column
   records it; the result lives only in the edge-function HTTP response, which pg_cron
   discards. Needs edge-function logs or a look at the Gmail account.
2. **The scopes actually granted** to the two live `gmail_connection` rows. The callback
   doesn't persist the token response's `scope`; there's no column for it. Code *requests*
   `gmail.modify`, but a grant issued before that constant was added would not show up here.
   Verifiable only via Google Account → third-party access, or a live `users.messages.modify`
   probe (a write — out of scope for this pass).
3. **Why `deal_synopsis` has 0 rows** despite the function being deployed and the UI component
   mounted on every deal detail page. Needs edge logs or a browser-network trace.
4. **Why `email_attachments` stopped 2025-12-15** while `gmail-sync` still contains live
   attachment-insert code. Could be that no synced email since then had attachments (unlikely
   over 22k emails) or a silent failure in the insert path. Needs logs.
5. **True matching precision.** Verified one clear false positive (Barrio Burrito → Poke House)
   by inspection of 10 rows; a real precision/recall number needs a labeled sample.
6. **How the legacy `anon` JWT in cron jobs 1 and 2 still authenticates** after the
   2025-10-23 legacy-key disablement. Empirically it works (576/576 successes, rows landing),
   but the mechanism is unexplained and is a latent single point of failure for the entire
   ingestion pipeline.

---

## Flags against "email is ingested, linked to deals, and Gmail-tagged today"

| Assumption | Reality |
|---|---|
| Ingested | ✅ True. Live, 5-min cron, 100% cron success, zero triage backlog, both tokens fresh. |
| Linked to deals | ⚠️ Partly. 54% get *some* link; only **10.7% get a deal link** (17% over the last 30d). Deal search is **hard-gated to 5 active stages** — early-stage and closed deals are unmatchable. At least one confirmed location-collision false positive that thread-inheritance then amplified across a conversation. |
| Gmail-tagged | ⚠️ Unverifiable. Code exists, scope is right, but **nothing records success anywhere** and there is **no read-back path**. Fire-and-forget with a swallowed catch. |
| *(implicit)* Email doesn't touch deal state yet | ❌ **False.** Inbound email already resets `deal_activity_state.ball_in_court_since` via `activity` → `trg_reset_clock_on_activity_insert`, 186 times in the last 7 days — and it does so for inbound mail the same as outbound. |
| *(implicit)* `deal-synopsis` is dead | ❌ **False** — it's deployed and wired into `DealDetailsPage`. But its table is empty, so it's non-functional rather than unreferenced. |
| *(implicit)* Human review catches misses | ❌ **False.** `unmatched_email_queue` is empty; manual links stopped in Jan 2026 (56 lifetime). |

---

# Addendum — Inbound/Outbound split of the clock resets (2026-09-05)

Read-only follow-up. Direction is taken from **`emails.sender_email ∈ gmail_connection.google_email`**,
not `emails.direction`: the stored `direction` column is computed per-connection at parse time
against whichever connection synced the message first, so it mislabels 30 of 670 rows in the
last 30 days (29 of them `INBOUND` on messages we actually sent). `email_visibility.folder_label`
is also unreliable — 217 outbound-by-sender rows carry only an `INBOX` visibility row, because
the copy that got synced was the *recipient* colleague's.

## 1. Activity rows with `email_id` + `deal_id`, last 30 days

| Direction (by sender) | Rows | % |
|---|---|---|
| **Outbound** (sender is mike@ or asantos@) | 398 | **59.4%** |
| **Inbound** (external sender) | 272 | **40.6%** |
| Total | 670 | 100% |

For comparison, the stored `emails.direction` column says 368 / 302 (54.9% / 45.1%) — off by 30.

Caveat: "outbound" includes intra-firm mail (mike→asantos and vice versa), which cools a tile
without anything having gone to the counterparty.

## 2. The 63 `deal_activity_state` rows — what last fired `reset_deal_activity_clock()`

Method: match `ball_in_court_since` to within 2s of an `activity.created_at` or
`note_object_link.created_at` on the same deal (the trigger stamps `NOW()` inside the inserting
transaction, so the match is exact). Non-matching rows attributed to `parked_until`,
`seeded_fallback`, or the backfill's `MAX(activity_date)` seed (which yields 00:00:00 UTC stamps).

| Source | Count |
|---|---|
| Email — **INBOUND** | **18** |
| Email — OUTBOUND | 10 |
| Note link | 1 |
| Manual UI (classify burst) | 10 |
| Manual UI (park) | 1 |
| Backfill seed — `NOW()` fallback (`seeded_fallback=true`) | 16 |
| Backfill seed — from `MAX(activity_date)` | 7 |
| **Total** | **63** |

**28 of 63 (44%) of the current clocks were last set by an email. 18 of 63 (29%) by an inbound one.**

| # | Deal | ball_in_court_since | Source | Dir |
|---|---|---|---|---|
| 1 | SBUX - Jasper - NWC 515 & Philadelphia Rd | 2026-10-01 04:00 | manual:park | — |
| 2 | BWWGo - Hampton Village - Taylors, SC | 2026-09-04 20:45 | email | **IN** |
| 3 | SBUX - Powder Springs Rd & EW Connector | 2026-09-04 19:50 | email | **IN** |
| 4 | Poke House - Dean Wang - Barrett Corners - P3 | 2026-09-04 19:10 | email | OUT |
| 5 | SBUX - Dallas - Villa Rica Hwy | 2026-09-04 15:10 | email | **IN** |
| 6 | SBUX - Hoschton - Rob Forrest | 2026-09-04 15:10 | email | **IN** |
| 7 | SBUX - Capital City Bank Macon | 2026-09-04 13:15 | email | OUT |
| 8 | SBUX - Winder, GA | 2026-09-04 13:05 | email | OUT |
| 9 | SBUX - E Cobb - Johnson Ferry ECDT | 2026-09-04 12:25 | email | OUT |
| 10 | Starbucks - Cedartown - Hwy 27 & Davis Road | 2026-09-04 07:20 | email | **IN** |
| 11 | Starbucks - Publix at Riverbrook Marketplace | 2026-09-04 07:20 | email | **IN** |
| 12 | Starbucks - Culpepper Douglasville Pads | 2026-09-04 07:20 | email | **IN** |
| 13 | Starbucks - 853 Thorton RD | 2026-09-04 07:20 | email | **IN** |
| 14 | Ellianos - Hinesville | 2026-09-03 22:30 | email | **IN** |
| 15 | Giggletown - Collection at Forsyth | 2026-09-03 18:55 | email | **IN** |
| 16 | JJ - Amos - Kroger Marketplace - Perry | 2026-09-03 18:00 | email | OUT |
| 17 | JJ - Perry Parkway Building D | 2026-09-03 18:00 | email | OUT |
| 18 | LCF - The Peach - Buckhead | 2026-09-03 17:05 | email | **IN** |
| 19 | BWW GO - Manish - Lawrenceburg Plaza | 2026-09-03 15:55 | email | **IN** |
| 20 | JBR - The Exchange at Ptree Corners | 2026-09-03 14:20 | email | **IN** |
| 21 | HM - Parmer - Fayetteville | 2026-09-02 14:15 | email | **IN** |
| 22 | JBR - Hammond Exchange - Whole Foods | 2026-09-02 10:50 | email | **IN** |
| 23 | CM - Parkside Shops | 2026-09-02 10:50 | email | **IN** |
| 24 | JBR - Crabapple Kroger | 2026-09-02 02:40 | email | **IN** |
| 25 | HB - Loganville | 2026-09-01 17:40 | email | OUT |
| 26 | SBUX - Big Chicken - 994 Roswell St & 25 Dodd | 2026-09-01 17:15 | email | OUT |
| 27 | Starbucks - JW (Coastal GA) - Culpeper Aiken | 2026-09-01 12:47 | manual UI | — |
| 28 | Starbucks - Multi-Tenant ECDT - Temple | 2026-09-01 12:47 | manual UI | — |
| 29 | SBUX - 1516 Bass Rd - Macon | 2026-09-01 12:47 | manual UI | — |
| 30 | SBUX - Ellenwood - Anvilblock Rd | 2026-09-01 12:47 | manual UI | — |
| 31 | SBUX - Lionsgate Pad site Starbucks site | 2026-09-01 12:46 | manual UI | — |
| 32 | SBUX - Riverdale Hwy 85 | 2026-09-01 12:46 | manual UI | — |
| 33 | SBUX - Senoia - Hwy 16 | 2026-09-01 12:46 | manual UI | — |
| 34 | Starbucks - D&G Grovetown Pads | 2026-09-01 12:46 | manual UI | — |
| 35 | JJ - Brookstone Village | 2026-08-31 19:30 | email | OUT |
| 36 | SBUX - Cumming - Mashburn Village | 2026-08-31 16:11 | manual UI | — |
| 37 | Starbucks - Dublin - Beef O'Brady Strip | 2026-08-31 16:10 | manual UI | — |
| 38 | Starbucks - KFC - Dublin - Garret LaBlanc | 2026-08-28 14:57 | note_link | — |
| 39 | Foxtail - CS Ventures - Lulah Hills - Edens | 2026-08-27 22:45 | email | OUT |
| 40 | CM - The Beacon at East Roswell | 2026-08-27 00:35 | email | **IN** |
| 41 | Starbucks - Five Forks Trickum Carve-Out Pad | 2026-08-26 20:26 | backfill (fallback) | — |
| 42 | SBUX - Stockbridge - Kroger Outparcel | 2026-08-26 20:26 | backfill (fallback) | — |
| 43 | SBUX - Newnan - Arbor Springs | 2026-08-26 20:26 | backfill (fallback) | — |
| 44 | SBUX - Waynesboro - Trackwest | 2026-08-26 20:26 | backfill (fallback) | — |
| 45 | Starbucks - Trackwest Pads - Rockmart | 2026-08-26 20:26 | backfill (fallback) | — |
| 46 | SBUX - Perimeter Square Carve Out | 2026-08-26 20:26 | backfill (fallback) | — |
| 47 | Starbucks - JW (Coastal GA) - The Village at… | 2026-08-26 20:26 | backfill (fallback) | — |
| 48 | Starbucks - ECDT Development - Calhoun | 2026-08-26 20:26 | backfill (fallback) | — |
| 49 | SBUX - SRS - 7Brew Chipotle Pad | 2026-08-26 20:26 | backfill (fallback) | — |
| 50 | SBUX - Senoia - Partners | 2026-08-26 20:26 | backfill (fallback) | — |
| 51 | Starbucks - Retail Strip - Brixworx | 2026-08-26 20:26 | backfill (fallback) | — |
| 52 | Starbucks - JW (Coastal GA) - Publix OP - Vi… | 2026-08-26 20:26 | backfill (fallback) | — |
| 53 | SBUX - Hardee's - Abernathy Square | 2026-08-26 20:26 | backfill (fallback) | — |
| 54 | Starbucks - Ola Publix Phase II pads | 2026-08-26 20:26 | backfill (fallback) | — |
| 55 | SBUX - Forsyth CFA pads | 2026-08-26 20:26 | backfill (fallback) | — |
| 56 | SBUX - Cumming - Taylor Morrison | 2026-08-26 20:26 | backfill (fallback) | — |
| 57 | SBUX - Hiram TRD - Westport | 2026-08-26 00:00 | backfill (activity_date) | — |
| 58 | Starbucks - Shops at Elberton | 2026-08-25 00:00 | backfill (activity_date) | — |
| 59 | SBUX - Peachtree City - Sullivan Wickley | 2026-08-17 00:00 | backfill (activity_date) | — |
| 60 | Starbucks - Hoschton Chipotle Pad | 2026-08-17 00:00 | backfill (activity_date) | — |
| 61 | Starbucks - Valdosta and I75 Pad | 2026-08-07 00:00 | backfill (activity_date) | — |
| 62 | Starbucks - Fayetteville - Cornerstone West | 2026-06-19 00:00 | backfill (activity_date) | — |
| 63 | Starbucks - Brownsville Road pad site | 2026-06-19 00:00 | backfill (activity_date) | — |

## 3. The lying set — 18 of 63 (29%)

Clocks whose most recent cause was an **inbound** email, with **no outbound email on that deal
after it**. These tiles read as "recently touched" when in fact the counterparty spoke last and
we have not replied. `days_shown` = what the board displays; `days_since_our_reply` = the truth.

| Deal | bics | days shown | Inbound from | Our last reply | **days since our reply** |
|---|---|---|---|---|---|
| Giggletown - Collection at Forsyth | 09-04 18:55 | 2 | maryashley.meadows@franklinst.com | 2026-02-23 | **194** |
| Ellianos - Hinesville | 09-03 22:30 | 2 | debi@ellianos.com | 2026-08-11 | **26** |
| CM - The Beacon at East Roswell | 08-27 00:35 | 10 | nickipatel90@gmail.com | 2026-08-24 | 12 |
| LCF - The Peach - Buckhead | 09-03 17:05 | 2 | jmarcusgriffin@gmail.com | 2026-08-28 | 8 |
| Starbucks - Cedartown - Hwy 27 & Davis Road | 09-04 07:20 | 1 | chat-noreply@google.com | 2026-09-01 | 4 |
| Starbucks - Publix at Riverbrook Marketplace | 09-04 07:20 | 1 | chat-noreply@google.com | 2026-09-01 | 4 |
| Starbucks - Culpepper Douglasville Pads | 09-04 07:20 | 1 | chat-noreply@google.com | 2026-09-01 | 4 |
| Starbucks - 853 Thorton RD | 09-04 07:20 | 1 | chat-noreply@google.com | 2026-09-01 | 4 |
| JBR - Hammond Exchange - Whole Foods | 09-02 10:50 | 3 | atlantanewsroom@connect.media | 2026-09-01 | 4 |
| JBR - Crabapple Kroger | 09-02 02:40 | 4 | krishnapaliwal@hotmail.com | 2026-09-01 | 4 |
| BWW GO - Manish - Lawrenceburg Plaza | 09-03 15:55 | 2 | lcowden@bcwoodproperties.com | 2026-09-02 | 3 |
| JBR - The Exchange at Ptree Corners | 09-03 14:20 | 2 | adrienne.crawford@matthews.com | 2026-09-02 | 3 |
| HM - Parmer - Fayetteville | 09-02 14:15 | 3 | jzuckerman@rockproperties.us | 2026-09-02 | 3 |
| SBUX - Dallas - Villa Rica Hwy | 09-04 15:10 | 1 | rob@forrplaces.com | 2026-09-04 | 1 |
| SBUX - Hoschton - Rob Forrest | 09-04 15:10 | 1 | rob@forrplaces.com | 2026-09-04 | 1 |
| BWWGo - Hampton Village - Taylors, SC | 09-04 20:45 | 1 | dwarkesh1624@gmail.com | 2026-09-04 | 1 |
| SBUX - Powder Springs Rd & EW Connector | 09-04 19:50 | 1 | tyler@streetviewcommercial.com | **never** | — |
| CM - Parkside Shops | 09-02 10:50 | 3 | atlantanewsroom@connect.media | **never** | — |

**Worst offenders:** Giggletown (board says 2 days, we last wrote **194 days ago**), Ellianos
Hinesville (2 vs 26), CM Beacon (10 vs 12), LCF The Peach (2 vs 8).

**Two deals have never had an outbound email linked at all** — SBUX Powder Springs and
CM Parkside Shops — yet both show a fresh clock.

**Six of the 18 were cooled by mail that is not correspondence at all:**
- 4 Starbucks deals cooled by a **Google Chat notification** (`chat-noreply@google.com`,
  "Noree Corias messaged you"). One notification, tagged onto four deals.
- 2 deals (JBR Hammond Exchange, CM Parkside Shops) cooled by a **real-estate news blast**
  (`atlantanewsroom@connect.media`, "Jamestown Inks $72M Financing…").

The backfill migration's own header anticipated a narrower version of this
("If Salesforce→OVIS sync inserts activity rows automatically, that would cool a tile
spuriously; guard with `AND NEW.sf_id IS NULL` if that turns out to matter. Revisit for v2.").
The actual spurious writer turned out to be `email-triage`, which did not exist in that
migration's field of view.

---

# Addendum 2 — Correction / feedback tables (2026-09-05)

Read-only. Three tables in the email-triage feedback loop, plus one unrelated (`hunter_feedback`,
Hunter outreach domain — listed for completeness, not part of email triage).

## 1. Schema

### `agent_corrections` — per-email link corrections, READ BY THE AGENT

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | uuid | NO | `gen_random_uuid()` |
| 2 | email_id | uuid | **NO** | — |
| 3 | incorrect_link_id | uuid | YES | — |
| 4 | incorrect_object_type | varchar(50) | YES | — |
| 5 | incorrect_object_id | uuid | YES | — |
| 6 | correct_object_type | varchar(50) | **NO** | — |
| 7 | correct_object_id | uuid | **NO** | — |
| 8 | feedback_text | text | YES | — |
| 9 | sender_email | varchar(255) | YES | — |
| 10 | email_subject | text | YES | — |
| 11 | created_at | timestamptz | YES | `now()` |
| 12 | created_by_user_id | uuid | YES | — |

FKs: `email_id → emails(id) ON DELETE CASCADE`, `created_by_user_id → user(id)`. PK on id.
**No CHECK constraints, no unique constraints, no enum types.**

### `ai_correction_log` — per-email audit log, NOT read by the agent

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | uuid | NO | `gen_random_uuid()` |
| 2 | user_id | uuid | **NO** | — |
| 3 | email_id | uuid | YES | — |
| 4 | correction_type | varchar(50) | **NO** | — |
| 5 | object_type | varchar(50) | YES | — |
| 6 | incorrect_object_id | uuid | YES | — |
| 7 | correct_object_id | uuid | YES | — |
| 8 | email_snippet | text | YES | — |
| 9 | sender_email | varchar(255) | YES | — |
| 10 | reasoning_hint | text | YES | — |
| 11 | created_at | timestamptz | YES | `now()` |

FKs: `email_id → emails(id) ON DELETE SET NULL`, `user_id → user(id)`. PK on id.
**No CHECK on `correction_type`** — free varchar.

### `agent_rules` — standing rules, READ BY THE AGENT

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | uuid | NO | `gen_random_uuid()` |
| 2 | rule_text | text | **NO** | — |
| 3 | rule_type | varchar(50) | **NO** | `'general'` |
| 4 | match_pattern | text | YES | — |
| 5 | target_object_type | varchar(50) | YES | — |
| 6 | target_object_id | uuid | YES | — |
| 7 | priority | integer | YES | `0` |
| 8 | is_active | boolean | YES | `true` |
| 9 | created_by | uuid | YES | — |
| 10 | created_at | timestamptz | YES | `now()` |
| 11 | updated_at | timestamptz | YES | `now()` |

FK: `created_by → auth.users(id)` (note: `auth.users`, not `public.user` — inconsistent with the
other two tables). PK on id. **No CHECK on `rule_type`, no FK on `target_object_id`** (polymorphic).

### `hunter_feedback` — separate domain (Hunter lead outreach), 5 rows

12 cols, FKs to `target`, `hunter_outreach_draft`, `hunter_signal`, `user`. It is the **only** one
of the four with a real CHECK constraint on its type column (10 allowed `feedback_type` values) and
the only one with explicit `original_value` / `corrected_value` columns. Not wired to email triage.

## 2. Volume and staleness

| Table | Rows | First | Last | 7d | 30d | 90d |
|---|---|---|---|---|---|---|
| `ai_correction_log` | 191 | 2025-12-15 | 2026-08-12 | 0 | 8 | 8 |
| `agent_corrections` | 63 | 2025-12-12 | **2026-01-30** | 0 | **0** | **0** |
| `agent_rules` | 24 | 2025-12-12 | **2025-12-15** | 0 | **0** | **0** |
| `hunter_feedback` | 5 | 2025-12-19 | 2026-02-27 | 0 | 0 | 0 |

- **`agent_corrections` — the only table the agent learns from — has had no new row in 7 months.**
- **`agent_rules` was written in a single 3-day burst in Dec 2025 and never touched again** (9 months).
- `ai_correction_log`'s 8 recent rows are all from one session on 2026-08-12; before that, nothing
  since 2026-05-16.

Breakdown:

| Field | Value | Count | Last |
|---|---|---|---|
| `ai_correction_log.correction_type` | reviewed | 83 | 2026-02-13 |
| | feedback | 50 | 2026-01-15 |
| | not_business | 43 | 2026-02-13 |
| | removed_tag | 12 | 2026-08-12 |
| | added_tag | 3 | 2026-01-12 |
| `agent_rules.rule_type` | **exclusion (all 24)** | 24 | 2025-12-15 |
| `agent_rules.is_active` | true (all 24) | 24 | — |
| `agent_rules` with `target_object_id` | **0 of 24** | — | — |

## 3. Single email vs. rule — the distinction exists, but not the one you asked for

**Yes, per-email vs. standing rule is expressible**, and the columns that encode it are:

- `agent_corrections.email_id uuid NOT NULL` and `ai_correction_log.email_id uuid` — a correction
  is **bound to one email**. There is no way to write a scope-free correction.
- `agent_rules` has **no `email_id` at all**. Its scope columns are
  `rule_text text NOT NULL` + `match_pattern text` — matched in `searchRules`
  (`_shared/gemini-agent.ts:430`) by **substring/regex against the sender address, the sender
  domain, and subject keywords**. Scope is therefore encoded as prose inside `rule_text`, not as a
  structured sender/domain column.

**"Never rank this sender high" cannot be expressed — there is no ranking anywhere.**
No priority, score, rank, or importance column exists on `emails`, `email_object_link`, or any
correction table. `agent_rules.priority integer` is **rule evaluation order only** (used as
`.order('priority', {ascending:false})` to decide which rule wins), not email priority.

What a rule *can* say, per `runEmailTriageAgent` (lines 962-1020):
- `rule_type = 'exclusion'` → mark irrelevant and **hard-delete the email**, skip the AI entirely.
- `target_object_type` + `target_object_id` set → force-link to that object at confidence 1.00,
  skip the AI. **Never used: 0 of 24 rules populate these.**

So in practice the rule table is a 24-entry killfile and nothing else.

## 4. What is stored per correction

**Both** original and corrected value, via sentinels rather than nulls:

- `agent_corrections`: `incorrect_object_type`/`incorrect_object_id` = what the AI did;
  `correct_object_type`/`correct_object_id` = what it should have done. Because
  `correct_object_*` is `NOT NULL`, a pure removal is encoded as the string `'none'` plus the zero
  UUID `00000000-0000-0000-0000-000000000000`, and a pure addition as
  `incorrect_object_type = 'none'`. Both sentinels are hardcoded in the reader
  (`gemini-agent.ts:588-597`) and in `formatCorrectionsForPrompt` (line 673).
- `ai_correction_log`: `incorrect_object_id` / `correct_object_id`, plus `correction_type`.
  For `removed_tag` rows only `incorrect_object_id` is set.

**Free text: yes, two fields — but both are machine-generated templates, not human input.**
`agent_corrections.feedback_text` is populated on 63/63 rows and
`ai_correction_log.reasoning_hint` on 191/191, and every observed value follows a fixed template
(`AI missed linking to <type> "<name>" - user manually added this link`,
`User removed AI tag to <type> "<name>"`). There is no evidence of a free-text box the user
actually types into.

### 10 rows — `ai_correction_log` (most recent)

| ts | type | object_type | incorrect? | correct? | sender | reasoning_hint |
|---|---|---|---|---|---|---|
| 2026-08-12 17:24 | removed_tag | property | ✓ | — | mike@oculusrep.com | User removed AI tag to property "432 Lewiston Road" |
| 2026-08-12 17:24 | removed_tag | contact | ✓ | — | mike@oculusrep.com | User removed AI tag to contact "Dexter Patterson" |
| 2026-08-12 17:13 | removed_tag | property | ✓ | — | mike@oculusrep.com | User removed AI tag to property "Waffle House Pad" |
| 2026-08-12 17:13 | removed_tag | client | ✓ | — | mike@oculusrep.com | User removed AI tag to client "Starbucks" |
| 2026-08-12 17:13 | removed_tag | client | ✓ | — | matt.demeyers@magazinest.com | User removed AI tag to client "Starbucks" |
| 2026-08-12 17:13 | removed_tag | contact | ✓ | — | matt.demeyers@magazinest.com | User removed AI tag to contact "Dexter Patterson" |
| 2026-08-12 17:12 | removed_tag | property | ✓ | — | matt.demeyers@magazinest.com | User removed AI tag to property "432 Lewiston Road" |
| 2026-08-12 17:12 | removed_tag | property | ✓ | — | matt.demeyers@magazinest.com | User removed AI tag to property "Waffle House Pad" |
| 2026-05-16 15:38 | removed_tag | property | ✓ | — | asantos@oculusrep.com | User removed AI tag to property "SBUX is Vertical Here" |
| 2026-05-16 15:38 | removed_tag | deal | ✓ | — | asantos@oculusrep.com | User removed AI tag to deal "Starbucks - Cori Cianci Pad - SBUX" |

### 10 rows — `agent_corrections` (most recent — note the 7-month-old dates)

| ts | incorrect | correct | sender | feedback_text |
|---|---|---|---|---|
| 2026-01-30 | none | property | mike@oculusrep.com | AI missed linking to property "Temp Closed Hardee's - Danielsville" |
| 2026-01-27 | none | contact | kglenn@rmrgroup.com | AI missed linking to contact "Kelley Glenn" |
| 2026-01-27 | none | property | kglenn@rmrgroup.com | AI missed linking to property "Dark Hardees - Griffin" |
| 2026-01-15 | none | deal | asantos@oculusrep.com | AI missed linking to deal "JBR - Crabapple Kroger" |
| 2026-01-15 | client | none | asantos@oculusrep.com | AI incorrectly linked to client "Another Broken Egg - Cox" |
| 2026-01-15 | none | deal | d.montanes@vividcgroup.com | AI missed linking to deal "JBR - Crabapple Kroger" |
| 2026-01-15 | client | none | d.montanes@vividcgroup.com | AI incorrectly linked to client "Another Broken Egg - Cox" |
| 2026-01-15 | none | property | mike@oculusrep.com | AI missed linking to property "Carollton Pads Across from Birches" |
| 2026-01-15 | deal | none | mike@oculusrep.com | AI incorrectly linked to deal "HM - Parmer - Culpepper - Carrollton Pad" |
| 2026-01-15 | deal | none | mike@oculusrep.com | AI incorrectly linked to deal "JJ - Milledgeville - Amos" |

No row in either table has both a real `incorrect_object_id` and a real `correct_object_id` — every
correction is a pure add or a pure remove. The "AI picked X, should be Y" branch in
`formatCorrectionsForPrompt` (line 683) has never been exercised.

## 5. Who reads these tables

| Table | Read by | What it does with the data |
|---|---|---|
| **`agent_corrections`** | `_shared/gemini-agent.ts:487` `getRelevantCorrections()`, called at line 1238 inside `runEmailTriageAgent` | Retrieves ≤5 corrections by (1) exact `sender_email` match, (2) `ILIKE %@domain` for non-public domains, (3) top-3 distinctive subject keywords vs `email_subject`. Resolves object ids to names, then `formatCorrectionsForPrompt` (line 658) renders them as a `### RELEVANT PAST CORRECTIONS (USER FEEDBACK)` block **interpolated directly into the Gemini system prompt** at line 1253. **This is a live, functioning learning loop.** |
| | `src/pages/EmailClassificationReviewPage.tsx:182` | Reads email_ids to grey out already-reviewed emails in the admin UI. |
| **`agent_rules`** | `_shared/gemini-agent.ts:430` `searchRules()` | Called twice: (a) line 974, a **pre-AI hard override** — an exclusion match deletes the email before Gemini is invoked; (b) line 898, exposed to the model as the `search_rules` tool, which the system prompt instructs it to "ALWAYS call FIRST". |
| | `src/pages/AgentRulesPage.tsx` (`/admin/agent-rules`) | CRUD UI. |
| | `EmailClassificationReviewPage.tsx:682`, `FlaggedEmailQueuePage.tsx:301`, `SuggestedContactsPage.tsx:362` | Create exclusion rules from the review UIs. |
| **`ai_correction_log`** | `src/pages/EmailClassificationReviewPage.tsx:176` — **the only reader in the entire repo** | Selects email_ids to filter out already-reviewed emails from the review list. A UI dedupe filter, nothing more. |
| `hunter_feedback` | — | Not read by email triage. |

**`ai_correction_log` is write-only as far as the AI is concerned.** Five distinct writers
(`email-correction/index.ts:104,161`; `EmailDetailModal.tsx:258,350`;
`SuggestedContactsPage.tsx:293`; `FlaggedEmailQueuePage.tsx:226`;
`EmailClassificationReviewPage.tsx:718,763,817,914`) feed 191 rows into it, and **no edge function
ever reads it**. Its 12 `removed_tag` rows from Aug 2026 — the most recent correction signal in the
system — never reach the agent, because the agent only reads `agent_corrections`, and the UI paths
that write `removed_tag` to `ai_correction_log` do **not** also write `agent_corrections`
(last row there: 2026-01-30).

### Reach of the loop that does work

Despite 63 rows across only **20 distinct corrected senders**, retrieval fires often:

| | Count | of 2,713 emails in last 30d |
|---|---|---|
| Emails whose sender exactly matches a corrected sender | 781 | **28.8%** |
| Emails whose sender domain matches | 968 | **35.7%** |

But **31 of the 63 corrections have `sender_email` = our own address** (mike@ / asantos@), so the
domain branch pulls `@oculusrep.com` corrections into every internal thread regardless of topic.

## Findings

- **What exists:** a real, live active-learning loop — `agent_corrections` → prompt injection — and
  a 24-rule exclusion killfile that hard-deletes email pre-AI.
- **What's broken:** `ai_correction_log` is a dead-end audit table that no agent reads, yet it is
  where the most recent 8 months of correction signal landed. The two tables are written by
  different UI paths and never cross-populate.
- **What's absent:** any notion of email priority or ranking; any CHECK constraint on
  `correction_type` or `rule_type`; any structured sender/domain scope on rules (it's prose
  matching); any use of the `target_object_*` "always link to X" rule branch (0/24); any
  human-authored free text (both text fields are templated).

---

# Addendum 3 — "I disabled triage in January" — I can't find any evidence it was ever off (2026-09-05)

Read-only. Question: triage was believed disabled in Jan 2026 to stop Gemini spend, yet 2,710
emails were processed and 2,603 deleted in the last 30 days.

## 1. Cron jobs (pg_cron; no Supabase Schedules, no GitHub Actions — `.github/workflows` does not exist)

| jobid | name | schedule | active | last run | last status | runs/30d |
|---|---|---|---|---|---|---|
| **1** | **gmail-sync-job** | `*/5 * * * *` | **true** | 2026-09-05 19:35 | succeeded | 8,640 |
| **2** | **email-triage-job** | `2-57/5 * * * *` | **true** | 2026-09-05 19:37 | succeeded | 8,640 |
| 3 | hunter-daily-run | `0 11 * * *` | **false** | 2026-07-30 | succeeded | 0 |
| 7 | daily-behind-schedule-check | `0 10 * * *` | true | 2026-09-05 | succeeded | 30 |
| 8 | portal-comment-alert-drain | `*/5 * * * *` | true | 2026-09-05 | succeeded | 8,640 |
| 10 | gcal-sync-tick | `*/5 * * * *` | true | 2026-09-05 | succeeded | 8,640 |
| 12 | merchant-logo-refresh-daily | `0 8 * * *` | true | 2026-09-05 | succeeded | 30 |
| 13 | ovis-sweep-tick | `* * * * *` | true | 2026-09-05 | succeeded | 43,200 |
| 14 | pgnet-response-vacuum-hourly | `17 * * * *` | true | 2026-09-05 | succeeded | 702 |

Both email jobs are `active = true`. Job 3 (`hunter-daily-run`) shows what a deliberately
disabled job looks like in this database: `active = false`, 0 runs. Neither email job matches
that shape.

## 2. Callers of `email-triage` — there are three, not one

| # | Caller | Trigger | Auth |
|---|---|---|---|
| 1 | pg_cron job 2 | every 5 min at `:02,:07,…` | hardcoded legacy anon JWT in the cron body |
| 2 | **`gmail-sync/index.ts:314-336`** | **fire-and-forget `fetch()` on every sync where `totalNew > 0`** | `SUPABASE_SERVICE_ROLE_KEY` |
| 3 | `src/pages/EmailClassificationReviewPage.tsx:418` | `supabase.functions.invoke('email-triage')` — manual "re-process" button | user JWT |

**Caller 2 is the one that matters.** `gmail-sync` (job 1, `*/5`, also active) calls
`email-triage` directly whenever it ingests a new email. Disabling cron job 2 would **not** have
stopped triage — gmail-sync would keep invoking it, with a service-role key, on every tick that
brings mail. Two independent paths must both be stopped.

## 3. Kill switch — none exists

- `email-triage/index.ts` reads exactly five env vars: `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **No enable/disable flag.**
- No `*_ENABLED` / `*_DISABLED` / `KILL_SWITCH` / `PAUSED` constant in `email-triage`,
  `gmail-sync`, or `_shared/gemini-agent.ts`.
- No row in `app_settings` (or any feature-flag table) gates triage.
- Contrast: Hunter has both a deactivated cron *and* a `HUNTER_POLLING_ENABLED` env guard.
  Triage has neither.

**There is no "off" position to have been set.** The only ways to stop it are: set cron job 2
`active = false` **and** remove the gmail-sync fan-out (or stop job 1), or unset `GEMINI_API_KEY`
(which would make it error, not skip).

## 4. Git history since 2026-01-01

Exactly one commit touches the triage path all year:

```
3e99d8e8  2026-08-07  fix(email-triage): stop selecting nonexistent email_object_link.reason
```

Nothing touches `gmail-sync` or `_shared/gemini-agent.ts`. No migration since Jan 2026 mentions
`email-triage` or `email_triage`; the only `cron.unschedule` migration in the repo is
`20260626093537_unschedule_friday_cfo_email_cron.sql`, which targets `friday-cfo-email`.
No commit in Jan–Mar 2026 mentions triage, disabling, pausing, cost, or Gemini.

## 5. Run history proves it never stopped

`cron.job_run_details` is retained back to 2025-12-12 — the whole life of the job. Job 2:

| Month | Runs | Succeeded | Days with runs | Runs/day |
|---|---|---|---|---|
| 2025-12 (from 12th) | 5,504 | 5,504 | 20 | 275.2 |
| **2026-01** | **8,928** | **8,928** | **31** | **288.0** |
| **2026-02** | **8,064** | **8,064** | **28** | **288.0** |
| 2026-03 | 8,928 | 8,928 | 31 | 288.0 |
| 2026-04 | 8,640 | 8,640 | 30 | 288.0 |
| 2026-05 | 8,928 | 8,928 | 31 | 288.0 |
| 2026-06 | 8,640 | 8,640 | 30 | 288.0 |
| 2026-07 | 8,928 | 8,926 | 31 | 288.0 |
| 2026-08 | 8,928 | 8,922 | 31 | 288.0 |
| 2026-09 (to 5th) | 1,388 | 1,388 | 5 | 277.6 |

`2-57/5` fires 12×/hour = **288/day**, and every full month hits exactly 288.0/day on every
single calendar day. **Zero gaps, zero skipped days, 8 total failures out of 76,876 runs.**

Emails actually processed per month confirms it independently:

| Month | Processed |
|---|---|
| 2025-12 | 482 |
| 2026-01 | 2,337 |
| 2026-02 | 2,470 |
| 2026-03 | 2,808 |
| 2026-04 | 2,928 |
| 2026-05 | 2,519 |
| 2026-06 | 2,782 |
| 2026-07 | 2,630 |
| 2026-08 | 2,860 |
| 2026-09 (to 5th) | 470 |

There is no January dip. Throughput has been flat at ~2,500–2,900 emails/month since the month
the belief says it was turned off, and the running 30-day rate (2,710) is normal for the series,
not elevated.

## Conclusion

Triage has run continuously since 2025-12-12 and has never been disabled, in cron or in code.
Whatever was done in January 2026 did not reach either invocation path — and there was no flag it
could have been written to. **~8 months of Gemini spend at ~177 agent runs/day is unbroken.**

What I could not determine: what the January action actually was. Nothing in git, the migrations,
the cron table, or the run history records an attempt — so it may have been a Console/dashboard
change that didn't persist, a change to a different job, or an intent never carried out. The
Supabase dashboard's own audit log (not queryable from here) is the only remaining place that
would show it.
