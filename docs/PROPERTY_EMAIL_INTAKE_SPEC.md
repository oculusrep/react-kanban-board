# Property Email Intake — Spec

Status: **Phase 1 specced, not built.** Branch `feature/property-email-intake`.
Scope of all phases: Mike's mailbox (`mike@oculusrep.com`) only.

| Phase | What | Status |
|---|---|---|
| 1 | OVIS/Property state filter: keep GA/SC (or undeterminable) listings, move out-of-state listings aside, return non-listings to routing | This document |
| 2 | Ingest + dedupe + geocode backfill of the 1,428 un-geocoded properties | Placeholder |
| 3 | Client criteria matching | Placeholder, blocked |

---

## Phase 1 — OVIS/Property state filter

### 1.1 Goal

After Phase 1, the Gmail label `OVIS/Property` holds only these messages:

- listings for at least one property in **GA or SC**, and
- listings whose state **cannot be determined**.

Everything else leaves the label:

- **Out-of-state listings** move to a new label, `OVIS/Property-OOS`, and are archived.
- **Non-listings** go back to normal `label-inbox` routing (Business / Events / Junk / Unsorted).

**The design bias is that a wrong `out_of_state` costs more than a wrong `unknown`.** An archived GA listing is a missed deal. An unfiltered Ohio blast costs one glance. When the evidence is short of certain, the answer is `unknown`.

### 1.2 Facts this spec is built on (prod, 2026-11-06)

| Fact | Value | Source |
|---|---|---|
| Live `OVIS/Property` labels (applied, not removed) | 856, all on Mike's connection `8c9382e5…`; asantos has 0 | `email_label` |
| Inflow | ~20/day (862 rows since 2026-09-25) | `email_label.created_at` |
| What applies the label | `label-inbox` `decide()` ([label-inbox/index.ts](../supabase/functions/label-inbox/index.ts)), cron `label-inbox-tick` `4-59/5 * * * *` | code + `cron.job` |
| Why messages got it | 666 from the subject regex `LISTING_RE`, 196 from approved sender rules (`shared1.ccsend.com` domain + 4 addresses) | `email_label.source_verdict` |
| Live labels older than the 30-day archived window | 366 | `email_label.created_at` |
| Body available | `body_html` on all; `body_text` > 200 chars on 783/867; median `body_text` 1,341 chars | `emails` |
| PDF attachments indexed on live Property mail | **23 messages** (25 PDFs) | `email_attachments` |
| Server-side Gmail attachment fetch | **None.** `get-attachment` needs the user's login and streams to the browser | [get-attachment/index.ts](../supabase/functions/get-attachment/index.ts) |
| PDF text reader already in repo | `pdfPages()` (unpdf / pdf.js text layer) | [_shared/knowledge-capture/readers.ts](../supabase/functions/_shared/knowledge-capture/readers.ts) |
| Haiku model already in repo | `claude-haiku-4-5` | [extract-commitments/index.ts](../supabase/functions/extract-commitments/index.ts) |

The PDF figure sets expectations. Most listing blasts here are Constant Contact or Mailchimp HTML with image flyers and links, not PDF attachments. **For ~97% of messages, the body decides the state.** The PDF path is built because the user asked for it, but it will rarely be the deciding input.

### 1.3 Components

| # | Piece | Kind | Notes |
|---|---|---|---|
| A | `property_email_filter` | table (migration) | Decision log + Gmail sync state machine |
| B | `property-email-filter` | new edge function | Classifier, Gmail writes, backlog, restore |
| C | `fetchGmailAttachment()`, `modifyMessageLabels()`, `getMessageLabelIds()` | `_shared/gmail.ts` additions | Server-side, service-role, connection-token auth |
| D | `decide()` change | `label-inbox` edit | Honors filter decisions; adds the `OVIS/Property-OOS` label |
| E | Attribution change | `label-watcher` edit | Credits the filter's INBOX removal to OVIS, not to Mike |
| F | `property-email-filter-tick` | cron | `1-59/5 * * * *`, two minutes after `label-inbox-tick`; via `cron_http_post_verified` |

### 1.4 Input selection

**Steady state (each tick).** A message is processed when all of the following hold:
- `email_label.label = 'OVIS/Property'`, `applied_at IS NOT NULL` and `removed_at IS NULL`;
- `gmail_connection_id` is Mike's connection, looked up by user email and not hardcoded;
- it has no `property_email_filter` row yet.

Order oldest first, up to `MAX_PER_RUN` (default 25). Runs are resumable because each processed message gets a row.

**Backlog (one time).** The same function with `{ mode: "backlog" }` loops over the same selection until it is empty, in batches, so the ~856 messages drain over a few invocations. There is no dry run, by instruction. Section 1.10 still makes the result checkable after the fact.

**Gmail id.** Use `email_label.gmail_id`, not `emails.gmail_id`. The `email_label` id came from `messages.list` on Mike's mailbox, so it is correct for that mailbox by construction. `emails.gmail_id` carries the known per-mailbox id defect behind `email-triage`'s ~25% 404 rate.

**Web links.** Not followed in Phase 1.

### 1.5 What the classifier reads

The model receives these, in order, each capped:

1. **Subject.**
2. **Sender** name and address. These are context only; the sender's location is not evidence of the property's state.
3. **Body.** Use `body_text` when it is over 200 characters. Otherwise use `body_html` reduced to text: strip tags, decode entities, collapse whitespace. Cap at 12,000 characters, keeping the head. Record whether the cap truncated anything.
4. **PDF text.** Covers each `email_attachments` row on the message with `mime_type ILIKE '%pdf%'` and `size_bytes <= 10 MB`, up to 3 PDFs.
   - Fetch the bytes with `fetchGmailAttachment()` (section 1.6).
   - Read the text layer with `pdfPages()`: first 3 pages, capped at 6,000 characters per PDF.
   - Phase 1 does no OCR. A scanned PDF yields no text and is recorded as `pdf_status = 'no_text_layer'`.

Every input the model saw is listed in the row's `inputs` column: body length, truncation, and per-PDF status (`read` / `no_text_layer` / `too_large` / `fetch_failed`). That way an `unknown` caused by a missing input can be told apart from an `unknown` caused by an ambiguous email.

**The email is untrusted input.** It goes in a delimited user block and never in the system prompt. Code enforces the decision rules (section 1.7.2), so the model's own `decision` field is advisory. The worst a hostile email can do is mark itself `unknown`.

### 1.6 Server-side Gmail helpers (`_shared/gmail.ts`)

These run inside the edge function with the service client. They authenticate with Mike's `gmail_connection` token, refreshed the way `label-inbox` refreshes it (`isTokenExpired` / `refreshAccessToken`). They do not touch `get-attachment`, which stays user-scoped.

| Helper | Gmail call | Notes |
|---|---|---|
| `fetchGmailAttachment(token, gmailId, filename, size)` | `messages.get(format=full)`, then `messages.attachments.get` | Re-reads the message parts at fetch time and matches the part by filename + size. The stored `gmail_attachment_id` is not guaranteed stable across fetches, so it is a hint, not the key. Returns bytes, or a typed failure. |
| `modifyMessageLabels(token, gmailId, add[], remove[])` | `messages.modify` | **One call** for add + remove, so a message is never half-moved: OOS added but Property still on, or the reverse. |
| `getMessageLabelIds(token, gmailId)` | `messages.get(format=minimal)` | Confirms a write. 5 quota units. |

Docs: [messages.attachments.get](https://developers.google.com/gmail/api/reference/rest/v1/users.messages.attachments/get), [messages.modify](https://developers.google.com/gmail/api/reference/rest/v1/users.messages/modify). Per CLAUDE.md, confirm the response shapes with one minimal live call before writing the parsing code.

`getOrCreateLabel('OVIS/Property-OOS')` creates the label on first use. Label ids, not names, go into `modify`.

### 1.7 Classifier

**Model.** `claude-haiku-4-5`, the tier named in the brief and the model `extract-commitments` already uses. It is a `MODEL` constant, stored on every row. See open question Q1 on `claude-haiku-5-5`.

**Call.** One Messages API request per email, using structured output (`output_config.format`, JSON schema), with `max_tokens` around 1,024. `PROMPT_VERSION` is a constant, starting at `pe-filter-v1`, and is stored on every row.

#### 1.7.1 Output schema (model)

```json
{
  "is_listing": true,
  "properties": [
    { "address": "1234 Main St", "city": "Macon", "state": "GA", "confidence": "high" }
  ],
  "decision": "in_state",
  "evidence": "1234 Main St, Macon, GA 31201"
}
```

- `is_listing` is true when the email offers **one or more specific properties** for lease, sale, sublease or ground lease, including multi-property blasts. Market reports, newsletters, event invitations, firm announcements and job postings are `false`. "Just sold / just leased" tombstones are an open question (Q2); until Mike answers, the prompt treats them as listings.
- `properties[]` lists each distinct property the email offers.
  - `state` is a two-letter USPS code, or `null`. Code normalizes full names ("Georgia" → `GA`) and rejects anything that isn't a US state code.
  - `confidence` is one of `high` / `medium` / `low`. `high` means the state is written in the email or flyer: an explicit state, a ZIP code, or a city named together with its state. A state inferred from a city name alone is at most `medium`.
- `decision` is one of `not_listing` / `out_of_state` / `in_state` / `unknown`. It is advisory and stored as `model_decision`.
- `evidence` is a verbatim snippet, at most 200 characters, that supports the state call.

#### 1.7.2 Final decision (code, not model)

The stored `decision` is computed by code from the model's fields, in this order:

1. If `is_listing = false`, the decision is **`not_listing`**.
2. If any property has `state ∈ {GA, SC}`, at any confidence, the decision is **`in_state`**. Mixed emails keep the label.
3. The decision is **`out_of_state`** only when **all** of the following hold:
   - `properties` is non-empty;
   - every property has a non-null `state` outside `{GA, SC}`;
   - every property has `confidence = 'high'`;
   - `evidence` appears verbatim in the input text (whitespace- and case-normalized substring check);
   - the independent text scan (section 1.7.3) finds no GA or SC signal.
4. Otherwise, the decision is **`unknown`**.

When the code's decision differs from `model_decision`, the row records `downgrade_reason` (for example `evidence_not_in_source`, `low_confidence_property`, `ga_sc_signal_in_text`). These are the rows to review when tuning the prompt.

#### 1.7.3 Independent GA/SC text scan

This is a deterministic regex over the same text the model saw. Any hit blocks `out_of_state`:

- the words "Georgia" or "South Carolina";
- `\b(GA|SC)\b` next to a 5-digit ZIP code;
- a ZIP code in GA (`30xxx`, `31xxx`, `398xx`, `399xx`) or SC (`29xxx`).

The scan is deliberately crude. It can only make the filter more conservative. Its hits are stored (`text_scan_hits`) so a false block is visible.

### 1.8 Actions per decision

| Decision | Gmail | `email_label` | Who re-routes |
|---|---|---|---|
| `in_state` | none | none | nobody |
| `unknown` | none | none | nobody |
| `not_listing` | remove `OVIS/Property` | Property row `removed_at` stamped | `label-inbox` on its next tick, for messages in the inbox or the 30-day window; the filter itself for older messages (section 1.9.3) |
| `out_of_state` | one `modify`: add `OVIS/Property-OOS`, remove `OVIS/Property` + `INBOX` | OOS row written **before** the call (`applied_at` null), then stamped; Property row `removed_at` stamped | nobody; `decide()` returns OOS from then on |

**Write order follows `label-inbox`'s rule: intent row first, Gmail second, stamp third.** Writing first keeps the watcher from crediting the filter's own change to Mike as a correction.

**Not done until Gmail confirms.** `gmail_sync_state` stays `pending` until `getMessageLabelIds()` shows the intended end state:

| Decision | Confirmed end state |
|---|---|
| `out_of_state` | OOS present, Property absent, INBOX absent |
| `not_listing` | Property absent |
| `in_state` / `unknown` | no change needed; the row is `synced` as soon as it is written |

- A failed or unconfirmed write sets `failed` with `last_error`, `attempts++` and `next_attempt_at`, using backoff of 5 min, then 30 min, then 2 h.
- After 5 attempts the row stays `failed` and shows up in verification.
- A Gmail 404 (message deleted) is `failed` with `last_error = 'gone'`, and is not retried.

### 1.9 Changes to existing functions

#### 1.9.1 `label-inbox` `decide()`

`decide()` gains one input, `filter`, which is the message's `property_email_filter` row or null. It is loaded in both the inbox pass and the archived-window pass with one `IN` query per chunk, keyed on `message_id`.

- `filter.decision = 'out_of_state'` returns `OVIS/Property-OOS`, with `sourceVerdict = 'property_filter:out_of_state'`. It sits immediately after the personal ladder.
- `filter.decision = 'not_listing'`:
  - **skips the `LISTING_RE` branch**;
  - **skips an approved rule whose label is `OVIS/Property`**. Without this, the 196 rule-labeled messages would be re-labeled by their sender rule. Rules for other labels still apply.
  - Everything else falls through as today: link → Business, events, exclusion → Junk, demoted → Junk, else Unsorted.
- `filter.decision = 'owner_restored'` returns `OVIS/Property` (section 1.11).
- `in_state`, `unknown` or no row: no change.

`LABEL` gains `propertyOOS: 'OVIS/Property-OOS'`. Why `out_of_state` must be handled in `decide()` and not left to the filter alone: the 30-day archived-window pass recomputes `decide()` for archived mail. Without this branch it would remove OOS, because OOS is not the current decision, and put `OVIS/Property` back.

**Deploy order: D (label-inbox) before B (filter) goes live.** If the filter runs first, `label-inbox` re-applies `OVIS/Property` within 5 minutes. Verification check 4 (section 1.10) would then catch it.

#### 1.9.2 `label-watcher` attribution

- `OVIS/Property` removals and `OVIS/Property-OOS` adds are attributed correctly with no change, because the filter writes `email_label` intent rows (section 1.8).
- **`INBOX` removal is not.** Today any INBOX event is attributed `owner`, which marks the filter's archive as Mike's `handled` gesture.
- **Change:** an `INBOX` `removed` event on a message with `property_email_filter.archived_at` within `OVIS_MATCH_WINDOW_MINUTES` is attributed `ovis`, with note `property-email-filter archive`.

#### 1.9.3 The 366 messages outside the 30-day window

`label-inbox` only re-decides inbox mail and the last 30 days of archived mail. A `not_listing` decision on one of the 366 older live messages would remove `OVIS/Property` and leave the message with **no OVIS label**.

The fix:
- Move `decide()` into `_shared/labelDecide.ts`, with the code moved unchanged and `label-inbox` importing it.
- For a `not_listing` message older than the window, the filter computes the replacement label with the shared `decide()` and applies it in the same `modify` call. It writes the `email_label` row with `source_verdict = 'property_filter:reroute:<verdict>'`.
- For messages inside the window, the filter leaves the re-route to `label-inbox`, as briefed.

### 1.10 Table `property_email_filter`

```
id                    uuid pk default gen_random_uuid()
message_id            text not null unique        -- RFC Message-ID; idempotency key
gmail_id              text not null               -- from email_label (mailbox-correct)
gmail_connection_id   uuid not null references gmail_connection(id) on delete cascade
email_id              uuid references emails(id) on delete set null
decision              text not null check (decision in
                        ('not_listing','out_of_state','in_state','unknown','owner_restored'))
model_decision        text                        -- what the model said
downgrade_reason      text
is_listing            boolean
states_found          text[] not null default '{}' -- distinct USPS codes from properties[]
properties            jsonb not null default '[]'
evidence              text
evidence_in_source    boolean
text_scan_hits        text[] not null default '{}'
inputs                jsonb not null default '{}' -- body len/truncated, per-PDF status
model                 text not null
prompt_version        text not null
input_tokens          int
output_tokens         int
gmail_sync_state      text not null default 'pending'
                        check (gmail_sync_state in ('pending','synced','failed'))
gmail_synced_at       timestamptz
archived_at           timestamptz                 -- INBOX removal confirmed (watcher match)
attempts              int not null default 0
next_attempt_at       timestamptz
last_error            text
restored_at           timestamptz
restored_by           text                        -- 'gmail_relabel' | 'restore_action'
prior_decision        text                        -- decision before owner_restored
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

- **Idempotency.** `INSERT … ON CONFLICT (message_id) DO NOTHING` at classification time, so a message is classified once. Re-running the backlog is a no-op. Reclassifying under a new `PROMPT_VERSION` would be an explicit, separate operation; it is not part of Phase 1.
- **Indexes:**
  - `(gmail_sync_state, next_attempt_at)` WHERE state <> 'synced';
  - `(decision, created_at desc)`;
  - `(gmail_connection_id, gmail_id)`.
- **RLS:** enabled. SELECT policy `is_internal_user()`.
- **Grants block (required by CLAUDE.md):**

  ```sql
  REVOKE ALL ON public.property_email_filter FROM anon, authenticated;
  GRANT SELECT ON public.property_email_filter TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON public.property_email_filter TO service_role;
  ```

- **Migration path:** file first, psql `--single-transaction`, then an explicit `schema_migrations` INSERT using the filename version. Round-trip it inside a transaction and `ROLLBACK` before applying.

### 1.11 Undo

**Path 1 — Mike relabels in Gmail.** Mike moves a message from `OVIS/Property-OOS` back to `OVIS/Property`.

1. The watcher records an `owner` add of `OVIS/Property` (and usually an `owner` removal of OOS).
2. On each tick, before new work, the filter scans `gmail_label_event` for owner-attributed events on messages it decided `out_of_state` or `not_listing`:
   - an `OVIS/Property` add;
   - an OOS removal;
   - an INBOX add.
3. For each such message it sets `prior_decision = decision`, `decision = 'owner_restored'`, `restored_at = now()` and `restored_by = 'gmail_relabel'`.
4. It does **not** re-archive and does not touch the labels Mike set.

From then on `decide()` returns `OVIS/Property` (section 1.9.1), so neither reconcile pass fights Mike. The relabel still reaches the watcher as a `correction` gesture, which is the right training signal: the filter was wrong.

**Path 2 — explicit restore.** `property-email-filter` accepts `{ action: "restore", message_id }`. It is authorized like `label-inbox` (cron secret or internal-user JWT).

1. One `modify`: add `OVIS/Property` + `INBOX`, remove `OVIS/Property-OOS`.
2. Confirm with `getMessageLabelIds()`.
3. Upsert the Property `email_label` row (applied) and stamp the OOS row `removed_at`.
4. Set `decision = 'owner_restored'` and `restored_by = 'restore_action'`.

The same action works on `not_listing` rows. `label-inbox` then removes the re-routed label on its next pass, because `decide()` now returns Property.

`{ action: "restore_all", decisions: [...], since }` runs the same path over a set of rows (section 1.12).

### 1.12 Rollback plan

| Step | Action | Effect |
|---|---|---|
| 1 | `select cron.alter_job(<id>, active := false)` on `property-email-filter-tick` | Stops new decisions. Existing ones keep holding through `decide()`. |
| 2 | `restore_all` over `out_of_state` + `not_listing` rows | Puts `OVIS/Property` and INBOX back. Re-inboxes every archived OOS message, so it is noisy by design. |
| 3 | Revert `label-inbox` to the pre-filter `decide()` and deploy from main | Only **after** step 2; otherwise `decide()` stops returning OOS while OOS labels are live, and the window pass would strip OOS without restoring Property on messages >30d. |
| 4 | Leave `property_email_filter` in place | It is the audit trail of what was undone. Drop it only by a later migration. |

A partial rollback, such as un-archiving only, is `restore_all` with a decision filter.

### 1.13 Verification

Each check states how it could fail. A check that cannot fail is reported as **"could not fail — not passed"**, not as a pass. That is the same rule `label-inbox`'s health check uses.

| # | Check | Method | Pass | Can fail because… / precondition |
|---|---|---|---|---|
| 1 | Count by decision after backlog | `select decision, gmail_sync_state, count(*) … group by 1,2` | Every live-at-start Property message has a row: rows = 856 ± arrivals, 0 `pending`, `failed` listed by `last_error` | A missed batch or a selection bug leaves messages without rows. Compare against the `email_label` count snapshotted before the run. |
| 2 | OOS end state in Gmail | `getMessageLabelIds()` on **every** `out_of_state` row (not a sample; at 5 units each the whole set costs less than one `label-inbox` tick) | OOS present, Property absent, INBOX absent on all | Reads Gmail, not our table. A `modify` that silently no-ops, or a later re-label, shows up here. Precondition: ≥ 1 `out_of_state` row, otherwise "could not fail". |
| 3 | No GA/SC inside `out_of_state` | (a) SQL: `out_of_state` rows where `states_found && '{GA,SC}'` or any `properties[].state` ∈ {GA,SC}. (b) Re-run the section 1.7.3 text scan **against the stored source text**, not the model output | (a) = 0 and (b) = 0 | (a) alone is close to tautological, because code enforces it. (b) is the real check: it reads the email, not the classifier. Precondition: ≥ 1 `out_of_state` row. |
| 4 | Not-listing stays off Property | Wait for ≥ 2 `label-inbox` ticks after the last `not_listing` decision, then check three things: (a) `email_label` rows with label `OVIS/Property` applied after `property_email_filter.created_at` for `not_listing` messages; (b) `gmail_label_event` `added OVIS/Property` after the decision; (c) `getMessageLabelIds()` on all `not_listing` rows | All three = 0 | Precondition: at least one `not_listing` message is in the inbox or the 30-day window, **and** a `label-inbox` run completed after the decision (check its run log timestamp). Without both, `label-inbox` never had the chance to re-apply, so the check could not fail. |
| 5 | Watcher attribution | `gmail_label_event` rows for filter-touched messages (Property removed, OOS added, INBOX removed) after the backlog run | All `attribution = 'ovis'`; zero `owner` `correction` or `handled` gestures from the filter's own writes | A missing intent row or a wrong archive-matching window shows up as `owner`. |
| 6 | Human spot check (not a gate) | Mike reviews 20 random `out_of_state` + 20 random `not_listing` + 10 `unknown` | Wrong `out_of_state` = 0 | This is the only check on classifier **accuracy**; 1–5 check plumbing. One wrong OOS means tightening the prompt before the next version. |

### 1.14 Cost estimate

Per message:
- **Input:** system prompt ~800 tokens, plus body (median ~1,341 characters; cap 12k ≈ 3k tokens), plus PDF text (rare; cap ≈ 1.5k tokens per PDF). Typical ~2.5k tokens, ceiling ~6k.
- **Output:** ~250 tokens.

| | Typical / msg | Backlog (856) | Steady (~20/day) |
|---|---|---|---|
| `claude-haiku-4-5` ($1 / $5 per MTok) | ~$0.004 | **~$3.40** (ceiling ~$6.50) | **~$0.08/day ≈ $2.50/month** |
| `claude-haiku-5-5` ($0.10 / $0.50 per MTok; adaptive thinking bills extra output) | ~$0.0005–0.001 | < $1 | < $0.50/month |

- Gmail API quota per message: `messages.get` + `modify` + confirming `get` ≈ 20 units, plus attachments. This is negligible.
- Edge function compute is negligible.
- Pricing was checked against the Claude API reference on 2026-11-06.

### 1.15 Open questions

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Use `claude-haiku-5-5` instead of `claude-haiku-4-5`? It is the current Haiku, at about a tenth of the price, but its thinking/effort defaults differ and it would need its own prompt check. | `claude-haiku-4-5` (as briefed) |
| Q2 | Are "just sold / just leased" tombstones listings? They name a property but offer nothing; they may matter for comps. | Treated as listings (kept) |
| Q3 | Should `not_listing` on a message from an approved `OVIS/Property` sender rule also count against that rule (rule stats / auto-disable)? | No. Decision only; rule untouched. |
| Q4 | Image-only flyers (inline JPG/PNG): read them with vision in Phase 1? Body-only gives `unknown` for these, which is safe but leaves them in Property. | No (Phase 1 is text + PDF text layer) |
| Q5 | Should `out_of_state` messages stay findable by state, for example a per-state label (`OVIS/Property-OOS/TX`)? | No; one OOS label, states in the table |
| Q6 | Should the OOS label sit nested under Property (`OVIS/Property/OOS`) rather than beside it? | `OVIS/Property-OOS` as briefed |
| Q7 | When a new `PROMPT_VERSION` ships, re-run old `unknown` rows? | No automatic re-run; separate decision per version |

### 1.16 Deviations from the brief

These are deliberate and called out so they can be reversed:

1. **`decide()` is moved to `_shared/` and the filter re-routes messages older than 30 days itself** (section 1.9.3). The brief said to let `label-inbox` re-route, but `label-inbox` cannot reach 366 of the 856 messages.
2. **`decide()` also handles `out_of_state` and `owner_restored`**, not only `not_listing` (section 1.9.1). Without that, the 30-day reconcile would undo OOS moves and fight Mike's undos.
3. **`label-watcher` gets a change** (section 1.9.2), so the filter's archive isn't recorded as Mike's gesture.
4. **Verification check 2 reads every OOS message, not a sample**, because the full set is cheap.
5. **Added `owner_restored` as a decision value**, to make undo stick.

---

## Phase 2 — Ingest + dedupe + geocode backfill

_Placeholder._ Covers ingesting in-state listings into OVIS, dedupe against `property`, and the geocode backfill of the 1,428 properties without coordinates.

## Phase 3 — Client criteria matching

_Placeholder. Blocked:_ `assignment.site_criteria` is free text, populated on 29 of 202 assignments. It needs a structured criteria model before matching can be specced.
