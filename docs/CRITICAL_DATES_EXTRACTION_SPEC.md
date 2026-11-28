# Critical Dates Extraction — Spec

Status: **spec only, no code.** Build starts the week of 2026-11-16. Branch `feature/critical-dates`.
Written 2026-11-10 from a read of the live database and the code on `main`.

Goal: read a deal's LOI, lease/PSA, amendments and commission agreement, propose its critical dates
and commission terms with the page and quote they came from, have a human confirm them, and drive
`payment.payment_date_estimated` from the confirmed dates.

Related: [CASH_FLOW_DASHBOARD_AUDIT.md](CASH_FLOW_DASHBOARD_AUDIT.md) ("Phase v2 (deferred)" — nudges,
`last_reviewed_at`, critical dates → payment dates), [DEAL_FORECASTING_SYSTEM.md](DEAL_FORECASTING_SYSTEM.md)
(velocity payment estimates), [CRITICAL_DATES_EMAIL_SYSTEM.md](CRITICAL_DATES_EMAIL_SYSTEM.md),
[KNOWLEDGE_CAPTURE.md](KNOWLEDGE_CAPTURE.md) (document reader this reuses).

---

## 0. What exists today (findings)

These change the shape of the request, so they come first.

**A `critical_date` table already exists and is heavily used: 8,084 rows on 812 deals.**
- Columns: `deal_id`, `subject` (free text), `critical_date`, `description`, `send_email`,
  `send_email_days_prior`, `sent_at`, `is_default`, `is_timeline_linked`, `deal_field_name`, audit columns.
- 4,060 rows are timeline rows mirrored from deal columns (`is_timeline_linked`, kept in sync by
  `trigger_sync_deal_timeline_to_critical_dates` — LOI X Date, Effective Date (Contract X), Booked,
  Closed, Target Close).
- The rest are default/manual subjects: Rent Commencement Date (660), Estimated Open Date (658),
  Delivery Date (656), Lease / PSA Effective Date (654), Contingency Date Expiration (644), plus ~40
  one-off subjects ("Inspection Period Ext Option 1", "Permit Deadline", …).
- Only 1,768 of the 8,084 rows actually have a date.
- It already drives email reminders (`send_email`, `send_email_days_prior`) and has deal-team RLS
  (operations roles + broker-lite deal-team policy).
- UI: `CriticalDatesTab` and `CriticalDateSidebar` on the full deal page (`DealDetailsPage`). Not in
  the deal slideout.

**Payment dates already have a source system.**
- `payment.payment_date_estimated`, `payment_date_auto_calculated`, `payment_date_source`. Values in
  use: `auto` (316), `broker_override` (60). The value `critical_date` is planned but never used.
- `calculate_payment_estimates(deal_id)` / `calculate_deal_payment_dates(deal_id)` derive dates from
  stage velocity:
  - Lease installment 1 = execution + `contingency_period_days`.
  - Lease installment 2 = + `rent_commencement_days`.
  - Purchase = execution + DD + closing days.
- `trigger_recalculate_payment_dates` re-runs it on deal changes. `track_payment_date_source` marks a
  manual edit as `broker_override`.
- **Bug found while reading it:** `calculate_payment_estimates` compares the stage label to
  `'At Lease / PSA'` (spaces), but the live `deal_stage.label` is `'At Lease/PSA'`. Deals at that stage
  get no velocity estimate (the function returns early). Fix as part of item 4.

**Deal documents.**
- **Dropbox is the store.** Each deal has a folder at `/Salesforce Documents/Opportunities/<deal name>`,
  recorded in `dropbox_mapping` (`entity_type = 'deal'`, `entity_id`, `dropbox_folder_path`).
  - 287 deal mappings in total.
  - **97 of 123 open deals have a mapped folder.** By stage:

    | Stage | Open deals | Folder mapped |
    |---|---|---|
    | Pre-Submittal | 34 | 17 |
    | Submitted-Reviewing | 9 | 3 |
    | Negotiating LOI | 37 | 34 |
    | At Lease/PSA | 10 | 10 |
    | Under Contract / Contingent | 5 | 5 |
    | Booked | 13 | 13 |
    | Executed Payable | 15 | 15 |

  - The browser reaches Dropbox only through the `dropbox-proxy` edge function (since 2026-10-16), via
    `DropboxService` / `useDropboxFiles`. `DropboxService.createFolderForEntity` creates a missing deal
    folder under `Opportunities/`. Edge functions use `_shared/dropbox.ts`.
- **No table says which file in a folder is the executed lease or LOI.** Nothing classifies deal
  documents today.
- Other document tables, none of which is a deal-document registry:

  | Table | Rows | What it is |
  |---|---|---|
  | `attachment` | 0 | Has `deal_id` but is unused |
  | `email_attachments` | 12,914 | Email-linked attachments; no deal link |
  | `document_handoff` | 158 | Who holds the LOI (117) / Lease (41) — custody tracking, not files |
  | `legal_loi_*` | 0 | Starbucks LOI tool sessions, keyed by deal |
  | `knowledge_entry_file` | 3 | Knowledge Capture's file registry: Dropbox path, page count, read/OCR cursors, status — the closest existing pattern |

**Reading documents is already solved.**
- `_shared/knowledge-capture/readers.ts` reads PDF text layers (unpdf), .docx (mammoth) and
  spreadsheets (SheetJS), and OCRs scanned PDF pages with Claude. It's resumable (cursors, locks,
  attempts).
- Reuse it; don't build a second reader.

**"Model-agnostic per OVIS rules"** means the existing pattern:
- One `config.ts` names the model, overridable by a Supabase secret.
- Business logic gets a `CreateFn` and never names a model.
- Outputs are strict JSON validated in code.
- See `_shared/site-research/model.ts` and `_shared/knowledge-capture/config.ts`.

---

## 1. Inputs

**Document types:**
- `loi`
- `lease`
- `psa` (purchase deals; same role as lease)
- `amendment` (lease or PSA)
- `commission_agreement`
- `other` (ignored for extraction)

**Two ways in:**
1. **Upload on the deal.** It goes to the deal's Dropbox folder (creating it if missing, via the
   existing `createFolderForEntity`), into a `Leases & LOIs/` subfolder. Dropbox stays the single store;
   no Supabase Storage copy.
2. **Pulled from the deal's Dropbox folder.**
   - A scan lists PDF and .docx files recursively (depth 3) under the mapped folder.
   - Each file is classified by filename first ("LOI", "Lease", "PSA", "Amendment", "Commission",
     "Exec", "Signed", "Draft", "redline", version suffixes).
   - Then the model classifies it from the first 2 pages: type, executed vs draft, document date and
     parties.
   - The scan runs on demand ("Find documents" on the deal) and in the backfill. No background polling.

**New table `deal_document`** (with the CLAUDE.md grants block; RLS mirrors `critical_date`):
- Columns: `id`, `deal_id`, `doc_type`, `dropbox_path`, `content_hash` (sha256 of the bytes), `filename`,
  `page_count`, `executed` (`true` / `false` / null = unknown), `document_date`, `classified_by`
  (`filename` | `model` | `human`).
- Read status: `pending` | `read` | `extracted` | `failed`, plus `status_note`.
- Provenance: `source` (`upload` | `dropbox_scan`), `superseded_by` (a later amendment or newer
  version), `created_by`, timestamps.
- `content_hash` dedupes the same file found twice and lets a changed file be re-extracted.
- The reading cursors (`read_cursor`, `ocr_cursor`, `scanned_pages`, `lock_until`, `attempts`) reuse
  Knowledge Capture's shape. Alternatively, generalize `knowledge_entry_file` into a shared
  `document_file` table — a decision for the builder; don't do both.

**Executed beats draft:**
- Dates from a draft are proposed with a "from a draft" warning.
- When an executed version of the same document type exists, draft-sourced proposals are hidden.

---

## 2. Extraction

**Where it runs.**
- A new edge function `deal-document-extract`, using `_shared/critical-dates/`:
  - `config.ts` — the only file that names a model. Env `CRITICAL_DATES_MODEL`, default the current
    Opus. Also `CRITICAL_DATES_MAX_TOKENS` and `CRITICAL_DATES_EFFORT`.
  - `extract.ts` — the logic, which receives a `CreateFn`.
- Invoked per document, admin / operations roles only, never from the browser with a secret key.

**Prompt input.**
- Page-tagged text: `=== PAGE n ===` blocks from the reader (OCR pages included).
- Long leases (60–120 pages) go in whole. A ~100-page lease is roughly 60–80k tokens, inside one
  request. Chunking is only needed above ~300 pages.

**Output: strict JSON, schema-validated.** Every item must carry `page` and `quote`.

```jsonc
{
  "document": { "type": "lease", "executed": true, "document_date": "2026-05-12",
                "parties": { "landlord": "...", "tenant": "..." } },
  "critical_dates": [
    { "date_type": "dd_expiration",          // controlled list below
      "date": "2026-08-10" | null,           // absolute date if stated or computable
      "rule": "120 days after the Effective Date" | null,   // relative wording, verbatim-ish
      "anchor_type": "effective_date" | null, "offset_days": 120 | null,
      "offset_basis": "calendar" | "business" | null,
      "page": 7, "quote": "Tenant shall have one hundred twenty (120) days after the Effective Date ...",
      "confidence": "high" | "medium" | "low",
      "notes": "two 30-day extensions, see extension_option rows" }
  ],
  "commission_terms": [
    { "installment": 1, "trigger_date_type": "lease_execution", "lag_days": 0,
      "percent_of_total": 50, "amount": null, "payer": "landlord",
      "invoice_timing": "due within 30 days of invoice",
      "page": 22, "quote": "...", "confidence": "high" }
  ]
}
```

**Controlled `date_type` list.** Each one maps to an existing `critical_date.subject`, so the current
UI and email reminders keep working:

| date_type | Existing subject |
|---|---|
| `loi_execution` | LOI X Date |
| `lease_execution` / `psa_execution` | Effective Date (Contract X) / Lease / PSA Effective Date |
| `dd_expiration` (incl. inspection) | Contingency Date Expiration |
| `contingency_expiration` (other: financing, approvals) | Contingency Date Expiration |
| `permit_period_expiration` | Permit Contingency Date Expiration |
| `delivery` / `outside_delivery` | Delivery Date / Outside Delivery Date |
| `opening` | Estimated Open Date |
| `rent_commencement` | Rent Commencement Date |
| `closing` | Closing Deadline |
| `outside_termination` | new subject "Outside / Termination Date" |
| `extension_option` (one row per option; `notes` = length + notice) | e.g. "Inspection Period Ext Option 1" |

**Relative dates are the norm** ("120 days after the Effective Date", "earlier of opening or 180 days
after delivery").
- Store the rule (`anchor_type`, `offset_days`, `offset_basis`) even when the date can't be computed yet.
- When the anchor date is confirmed, OVIS computes the dependent date in code, not the model, and
  re-proposes it. It stays proposed until a human confirms it.
- "Earlier/later of" rules: store both legs in `notes`, compute only when both anchors are known, and
  flag them for the reviewer.

**Guards in code, not the prompt.**
- **Quote verification.** A whitespace- and case-normalized `quote` must appear on the stated `page`'s
  text.
  - If it doesn't, the item is kept but marked `unverified_quote` and shown in amber.
  - Expect OCR pages to fail exact match more often, so search ±1 page before flagging.
- **No invented dates.** A `date` that isn't on the quoted page and isn't computable from a stated rule
  plus a known anchor is dropped to `date: null` with the rule kept.
- **Amendments supersede.** Per `date_type`, the latest executed document wins. Earlier values stay
  visible as history.
- **Commission terms are matched to existing payments.**
  - `installment` → `payment.payment_sequence`.
  - If the extracted installment count differs from `deal.number_of_payments`, raise a review flag.
    Never create or delete payments automatically.

**Run log `critical_date_extraction_run`** (grants block):
- `id`, `deal_id`, `document_id`, `model` (as reported by the provider), `prompt_version`, input/output
  tokens, `cost_usd`, `status`, `error`, `raw_output` (jsonb), `created_at`.
- Re-running is idempotent per (`document_id`, `content_hash`, `prompt_version`).

---

## 3. Storage

**Decision for Mike: extend `critical_date`, or add a separate `deal_critical_date` table.**

**Recommendation: extend `critical_date`.** A separate table would leave two places holding a deal's
"Contingency Date Expiration", with email reminders and the timeline sync reading only the old one.
The request's fields map one-for-one:

| Requested field | On `critical_date` |
|---|---|
| type | new `date_type` (controlled list above); `subject` stays the display label |
| date | existing `critical_date` |
| source_doc | new `source_document_id` → `deal_document` |
| page / quote | new `source_page`, `source_quote`, `quote_verified` |
| status proposed \| confirmed | new `status`: `proposed` \| `confirmed` \| `rejected` \| `manual` |
| confirmed_by | new `confirmed_by` (→ `user.auth_user_id`), `confirmed_at` |
| — | new `rule_anchor_type`, `rule_offset_days`, `rule_offset_basis`, `extraction_run_id`, `confidence`, `superseded_by` |

- **Existing 8,084 rows become `manual`.** Human-entered, so they count as confirmed for every
  downstream use.
- **A proposed row never overwrites a manual or confirmed row.**
  - It sits beside it as a separate `proposed` row.
  - The UI shows "document says X, current value Y".
  - Confirming the proposal supersedes the old row (`superseded_by`); it isn't deleted.
- **Timeline-linked rows** (`is_timeline_linked`) keep syncing from deal columns.
  - Confirming `lease_execution` writes `deal.contract_signed_date`.
  - Confirming `loi_execution` writes `deal.loi_signed_date`.
  - The existing sync trigger then updates the mirror row.
- **Reminder emails** (`send_email`) only fire for `manual` / `confirmed` rows. The reminder job needs
  a one-line `status` filter.
- If Mike prefers a separate `deal_critical_date` table anyway: same columns, plus a view that unions
  both for the UI and the email job. Cost: about +1 day, and two sources of truth to keep in step.

**New table `commission_trigger`** (one row per installment rule; grants block; RLS mirrors `payment`):
- `id`, `deal_id`, `payment_id` (nullable until matched), `installment` (= `payment_sequence`).
- `trigger_date_type` (from the list above), `lag_days`, `lag_basis` (`calendar` | `business`).
- `percent_of_total`, `amount`, `payer` (`landlord` | `tenant` | `seller` | `buyer` | `other`),
  `invoice_timing` (text).
- `source_document_id`, `source_page`, `source_quote`, `quote_verified`.
- `status` (`proposed` | `confirmed` | `rejected` | `manual`), `confirmed_by`, `confirmed_at`.
- Manual rules are allowed. For a deal with no commission agreement, Mike can set "installment 2 =
  opening + 30 days" by hand.

---

## 4. Payment dates

**Precedence**, recorded in `payment_date_source`:
1. `broker_override` — a manual edit. Unchanged: still wins and is never overwritten.
2. `critical_date` — the payment has a **confirmed** `commission_trigger` and the trigger's
   `date_type` has a confirmed/manual critical date.
   `payment_date_estimated = critical date + lag_days` (business-day lag skips weekends; holidays out
   of scope).
3. `auto` — today's velocity estimate.

**Implementation.**
- Change `calculate_payment_estimates` / `calculate_deal_payment_dates`, pulling the **current** live
  definitions first (`pg_get_functiondef`), per CLAUDE.md; don't rebuild from an old migration.
- Same change: fix the `'At Lease / PSA'` vs `'At Lease/PSA'` label mismatch.
- `payment_date_auto_calculated` keeps holding what the system would choose (critical-date or
  velocity), so `track_payment_date_source` keeps detecting overrides unchanged.
- Recalculate on:
  - confirm, edit or reject of a critical date (new trigger on `critical_date`, guarded to `status`
    and date changes);
  - confirm or edit of a `commission_trigger`.
- Proposed (unconfirmed) dates never move a payment date.

**Default triggers when no commission agreement is found.** Same mapping the v2 plan recorded:
- Lease: installment 1 = `contingency_expiration` (fallback `lease_execution`); installment 2 =
  `opening` (fallback `rent_commencement`).
- Purchase: installment 1 = `closing`.
- These are created as `proposed` default rules for one-click confirm, not applied silently.

---

## 5. Review UI

**Placement.**
- A **"Dates to confirm"** panel inline at the top of the deal slideout's Overview tab, shown only when
  proposals exist.
- Not a new tab: the slideout already has five, and tab strips shouldn't scroll.
- The component takes `dealId` (overlay-first rule), so the same panel mounts on `DealDetailsPage`'s
  Critical Dates tab and in the cash tab's Needs-attention list.

**Each proposed row shows:**
- type, proposed date (or the rule, if it's relative and the anchor isn't confirmed);
- source document name + page (opens the Dropbox file at that page through `dropbox-proxy`);
- the quote, with an amber marker if unverified or if it came from a draft;
- the current value, if one exists ("document says Aug 10, current Aug 1").

**One click per row: Confirm · Edit · Reject.**
- Confirm sets `status = confirmed`, `confirmed_by`, `confirmed_at`.
- Edit opens the date (and lag, for commission rules) inline, then confirms.
- Reject keeps the row as `rejected` so a re-extraction of the same document doesn't propose it again.
- Commission rules are listed under the dates as "Installment 1 — 50% — lease execution + 0 days —
  landlord pays — quote".

**Nothing becomes confirmed without a human.**
- No auto-confirm at any confidence.
- No bulk "confirm all" in v1. Revisit after a few weeks of real use if review is slow.

---

## 6. Stage gate

Moving a deal **into Under Contract / Contingent** requires confirmed (or manual) dates:
- Lease: `contingency_expiration` (or `dd_expiration`) **and** `opening` (fallback
  `rent_commencement`).
- Purchase: `dd_expiration` **and** `closing`.

**Enforcement.**
- **In the database**: a `BEFORE UPDATE OF stage_id` trigger on `deal`. Stage changes happen from the
  kanban, the deal form, the slideout, the ovis-mcp `update_deal` tool and syncs, and only the
  database sees all of them.
  - It raises a clear error naming the missing date types.
  - Admin bypass through a session setting (`set local ovis.skip_stage_gate = on`) for data fixes,
    logged.
- **In the UI**, a pre-check gives a friendly message and opens the Dates to confirm panel instead of
  a raw error.
- Only the transition is gated. The 5 deals already Under Contract aren't blocked, but they appear in a
  Needs-attention group "Under Contract without confirmed dates".

---

## 7. Ties into v2 nudges and `last_reviewed_at`

Unblocks items already specified in CASH_FLOW_DASHBOARD_AUDIT.md "Phase v2 (deferred)":
- **`last_reviewed_at`**: confirming, editing or rejecting a critical date or commission rule counts as
  a human edit and sets `deal.last_reviewed_at = now()` (app path, not a trigger, per the v2 rule).
  This needs the v2 column migration first, if it hasn't shipped.
- **Nudges** (still behind `NUDGES_ENABLED = false`, still drafts for Mike to approve, never
  auto-sent), with new triggers from this work:
  - Proposed dates waiting more than 7 days for confirmation → nudge the deal team.
  - Contingency (or DD) date passed with no stage change → the existing v2 "contingency passed" rule,
    now based on a confirmed date.
  - Payment-due windows (30/14/7) use the critical-date-derived payment date when the source is
    `critical_date`.
- **Cash tab, Needs attention**: new groups "Dates to confirm" (deals with proposed rows) and "Under
  Contract without confirmed dates". The cash calendar needs no change; it already reads
  `payment_date_estimated`.

---

## 8. Backfill

**Scope.**
- Open deals at Negotiating LOI or later: **80 deals**; 77 have a mapped Dropbox folder (3 Negotiating
  LOI deals don't).
- Pre-Submittal and Submitted-Reviewing deals are skipped; they have no LOI yet.

**Steps.**
1. **Scan (dry run, no model calls for extraction).** List files in each mapped folder and classify
   by filename plus a first-2-pages model call.
   - Output: per deal, documents found by type, executed/draft, and pages.
   - Includes **"no documents found"** (folder empty or nothing classifiable) and **"no folder
     mapped"** lists.
   - Written to `docs/CRITICAL_DATES_BACKFILL_REPORT.md` and shown on an admin page.
   - Mike reviews this before step 2.
2. **Cost estimate** from total pages before any extraction, shown as a range.
   - Rough expectation: ~2–4 documents per deal, an LOI at ~5 pages and a lease at 40–120 pages.
   - ≈ 80 deals × ~70 pages ≈ 5–6k pages ≈ 3.5–4.5M input tokens.
   - About **$25–60** at current Opus input pricing, more if many pages need OCR. Confirm against the
     real page count.
3. **Extraction run** in batches of 10 deals, latest-stage deals first (Executed Payable → Booked →
   Under Contract → At Lease/PSA → Negotiating LOI). Everything lands as `proposed`.
4. **Review.** Proposals appear in "Dates to confirm". Payment dates move only as Mike or the deal team
   confirm.
5. **Report back:**
   - deals with no documents found;
   - deals whose extracted installment count disagrees with their payments;
   - deals where the document dates contradict current manual dates (the most useful list for cleanup).

---

## Effort (build days, one developer + Claude)

| # | Item | Days |
|---|---|---|
| 1 | Inputs: `deal_document`, Dropbox scan + classify, upload to deal folder | 2–3 |
| 2 | Extraction: edge function, `_shared/critical-dates` (config/extract), reader reuse, schema validation, quote verification, relative-date rules, amendment precedence, run log | 3–4 |
| 3 | Storage: extend `critical_date` + `commission_trigger` + migrations/grants/RLS, reminder-job status filter | 1–1.5 (+1 if separate table) |
| 4 | Payment dates: change live `calculate_payment_estimates` / `calculate_deal_payment_dates`, recalc triggers, stage-label bug fix, default trigger proposals | 1.5–2 |
| 5 | Review UI: Dates to confirm panel (slideout + deal page + cash tab), confirm/edit/reject, source link to page | 2–3 |
| 6 | Stage gate: DB trigger + bypass + UI pre-check + "Under Contract without dates" group | 1 |
| 7 | v2 tie-in: `last_reviewed_at` writes from review actions, nudge triggers wired (nudge engine itself is v2, est. 3–4 more) | 0.5–1 |
| 8 | Backfill: scan report, cost estimate, batched run, report | 1–2 (+ Mike's review time) |
| | **Total** | **≈ 12.5–17.5 days** |

**Suggested build order:** 3 → 1 → 2 → 5 → 8 (scan only) → 4 → 6 → 8 (extract) → 7.

Storage first, so extraction has somewhere to write. The review UI comes before payment dates, so
nothing moves money dates until a human has confirmed something.

## Open decisions for Mike

1. **Storage:** extend `critical_date` (recommended) or add a separate `deal_critical_date`?
2. **Business-day lags:** weekends only, or also US bank holidays?
3. **Who can confirm:** admin only, or deal-team brokers too? The current `critical_date` write policy
   allows admin, broker_full, va and broker-lite on their deals.
4. **Stage gate for purchases:** DD expiration + closing — confirm that's right.
5. **Uploads:** OK to create a `Leases & LOIs/` subfolder in each deal's Dropbox folder?
