# OVIS Email Triage — Project Spec

**Branch:** `feature/email-triage` (worktree `react-kanban-board-email-triage`)
**Written:** 2026-09-05 · **Status:** spec only, nothing built
**Inputs:** `OVIS_Email_Triage_Context.md` (the plan — written from conversation) and
[EMAIL_INFRASTRUCTURE_RECON.md](EMAIL_INFRASTRUCTURE_RECON.md) (recon + 3 addenda).
**Rule:** where plan and recon disagree, recon wins. Contradictions are flagged, not reconciled.

---

## 1. Contradictions — assumption vs actual

| # | Plan assumed | Recon found | What it changes |
|---|---|---|---|
| 1 | "Emails matched/linked to deals in some form" | **10.7% carry a deal link** (54% carry any link). `searchDeals` ILIKEs `deal_name` only, **gated to 5 active stages** (Negotiating LOI, At Lease/PSA, Under Contract/Contingent, Booked, Executed Payable) | Deals outside those stages are **invisible to the matcher** — prospecting and pre-submittal email can never be deal-linked. §2(c) becomes a prerequisite, not a nice-to-have |
| 2 | Matching accuracy unknown, "maybe 80%" | Thread inheritance copies every tag from any same-`thread_id` email at **0.95 confidence**, no re-check. Confirmed false positive: *"Barrio Burrito x Barrett Corners"* → deal *"Poke House - Dean Wang - Barrett Corners - Phase 3"* — right shopping center, **wrong tenant** — then propagated to 2 more emails | A single bad link poisons a whole conversation. Confidence must be capped and inheritance must re-verify. This is the mechanism that would make the board lie |
| 3 | "Filter bulk out at ingest so it never reaches the inbox" | Bulk mail **is fully ingested**, then hard-DELETEd by the agent — **2,603 rows in 30d**, each after a paid Gemini call. Only 24 `exclusion` rules return before the model | The tier-1 filter does not exist. Every newsletter costs a model call today, and deletion is irreversible with no measurable record |
| 4 | "`deal-synopsis` is a dead edge function… don't revive it" | **Not dead.** ACTIVE v42, POSTed from `DealSynopsis.tsx:73`, **mounted at `DealDetailsPage.tsx:595` on every deal page**. Runs retired `gemini-1.5-pro`. `deal_synopsis` table: **0 rows** | It is live-but-broken, not unreferenced. It may be firing and failing on every deal page view. Separate ticket (§12), but "dead" was wrong |
| 5 | Board work is on a branch, prod is clean | **Prod schema is ahead of `main`.** `deal_activity_state` + its triggers are live in production; its **10 migrations exist only in `feature/starbucks-deal-board`** | Anything this branch migrates compounds the drift. One prod DB, no staging |
| 6 | Ingestion crons are conventional | Jobs 1 and 2 authenticate with the **hardcoded legacy anon JWT reportedly disabled 2025-10-23**. Empirically 100% success, 76,876 runs, mechanism unexplained | Undiagnosed single point of failure under the entire pipeline. Do not touch those cron bodies without a tested replacement |
| 7 | "Correction happens by voice… same table the panel writes to" | **Two tables, and the wrong one is wired.** `ai_correction_log` (191 rows, live through 2026-08-12) is read by **nothing but a UI dedupe filter**. `agent_corrections` (63 rows, **dead since 2026-01-30**) is the only one `getRelevantCorrections` reads | The learning loop has been starved for 7 months. §2(b) |
| 8 | "Bidirectional Gmail tagging with some feedback loop" | **One-way, one label.** OVIS writes `OVIS-Linked` only. `gmail-sync` reads `labelIds` for `SENT`/`INBOX`/`UNREAD` and **discards everything else**. No column anywhere records whether a label was applied | There is no feedback loop. There is also months of VA labelling sitting in Gmail and nowhere else — §7 turns that from a gap into an asset |
| 9 | "Six or seven labels in Gmail" | **OVIS writes exactly one.** The rest are the VA's hand-applied tree | The label inventory is a human system, not an OVIS system. Harvest it, don't inherit it |
| 10 | "Do NOT wire triage into the board yet" (shadow mode) | **Already wired, accidentally.** `email-triage` inserts an `activity` row per deal tag → `trg_reset_clock_on_activity_insert` → `reset_deal_activity_clock()` sets `ball_in_court_since = NOW()`. **186 such inserts in 7d.** 18 of 63 board tiles currently show a fresh clock whose last cause was an **inbound** email with no reply after it — worst case reads 2 days when the true figure is **194** | The thing shadow mode exists to prevent is **already happening in production**. See §14 pushback — this is the one place I think the spec is wrong |
| 11 | Triage was disabled in Jan 2026 to stop Gemini spend | **Never disabled.** Job 2 ran exactly 288.0/day every calendar day since 2025-12-12 — zero gaps, 8 failures in 76,876 runs. No kill switch exists in the codebase | ~8 unbroken months of spend. Also means there is no flag to flip; §11 should add one |

---

## 2. Dependencies — build before the commitment table

### (a) Tier-1 short-circuit

| | |
|---|---|
| **Exists** | Rule `exclusion` match returns before the API call ([gemini-agent.ts:985](../supabase/functions/_shared/gemini-agent.ts#L985)). That is the only short-circuit |
| **Must change** | Thread inheritance ([:1023](../supabase/functions/_shared/gemini-agent.ts#L1023)) and sender auto-match ([:1092](../supabase/functions/_shared/gemini-agent.ts#L1092)) both link and then **fall through to the full Gemini loop**. Return after each |
| **New** | Header-based bulk rules. **Blocker:** `List-Unsubscribe` is not stored and not parsed — `parseGmailMessage` extracts only Message-ID, Subject, From, To, Cc, Bcc, In-Reply-To, References, Date. Tier 1 must run **pre-insert inside `gmail-sync`**, or `emails` needs a headers column. Pre-insert is correct: it also satisfies §3 |

Cost effect: today ~177 agent runs/day at ~12–24k input tok each. Short-circuiting inheritance + auto-match + header rules should remove the large majority. Re-measure before quoting a number.

### (b) Correction-table repair — highest leverage

| | |
|---|---|
| **Exists** | `getRelevantCorrections` ([:487](../supabase/functions/_shared/gemini-agent.ts#L487)) — sender → domain → keyword selection, ≤5 results, name resolution, prompt injection at [:1253](../supabase/functions/_shared/gemini-agent.ts#L1253). Well-built. Starved, not broken |
| **Must change** | Point all UI writes at `agent_corrections`. Nine write sites currently target `ai_correction_log` |
| **New** | A backfill — **but not of 191 rows** |

**The spec's "backfill the 191 rows" is not achievable as stated.** Actual composition:

| `correction_type` | Rows | Maps to `agent_corrections`? |
|---|---|---|
| `removed_tag` | 12 | ✅ → `incorrect_*` set, `correct_* = 'none'`/zero-UUID |
| `added_tag` | 3 | ✅ → `correct_*` set, `incorrect_type = 'none'` |
| `feedback` | 50 | ⚠️ ambiguous — needs inspection per row |
| `reviewed` | 83 | ❌ not a link correction |
| `not_business` | 43 | ❌ not a link correction — but see below |

**15 clean, ~50 ambiguous, 126 non-link.** Additionally **52 of the 191 already share an `email_id` with an existing `agent_corrections` row** — dedupe required. `agent_corrections.correct_object_type`/`correct_object_id` are `NOT NULL`, so non-link rows cannot be written there at all.

The 43 `not_business` rows are the **most valuable** of the set and belong somewhere else — they are labelled tier-1 training data (§7), not link corrections.

### (c) Matcher

| | |
|---|---|
| **Must change** | Remove or widen the 5-stage gate in `searchDeals` ([:325](../supabase/functions/_shared/gemini-agent.ts#L325)). Cap thread-inheritance confidence well below the 0.7 link threshold, or require the model to re-confirm an inherited deal tag before it counts |
| **New** | A confidence floor that actually gates writes. Today a 0.80 guess and a 1.00 rule match are stored identically and both propagate at 0.95 |

### (d) Domain-branch scoping

| | |
|---|---|
| **Must change** | Exclude `@oculusrep.com` from the domain branch ([:530](../supabase/functions/_shared/gemini-agent.ts#L530)) |
| **Evidence** | 31 of 63 corrections have mike@ or asantos@ as sender; the domain branch pulls those into **968 of 2,713 emails/30d (35.7%)** regardless of topic |

**Out of scope (per spec):** the deal-board trigger. Recorded, with dissent — §14.

---

## 3. Privacy / ingestion boundary

| | |
|---|---|
| **Exists** | Nothing. All mail is ingested in full — body_text, body_html, snippet — then some is hard-DELETEd post-hoc by the model |
| **Must change** | Deletion stops being the mechanism. Tier 1 decides **before insert**, in `gmail-sync` |
| **New** | Stub row: `message_id`, `sender_email`, `received_at`, `tier1_reason`. **No subject, no body, no snippet.** Applies to every connected account, not just Mike's |

Rules:
- Personal and bulk mail is **never ingested and never sent to a model**.
- Residue that slips past tier 1 gets content-stripped to a stub, not deleted — a deleted row can't be corrected or measured.
- `processed_message_ids` (22,948 rows) is the existing precedent for a content-free stub; extend it rather than inventing a table.

**Open tension:** a stub still records *who* wrote to an employee and *when*. For `! [Personal]` mail that is arguably still personal-correspondence metadata. Decide whether personal-classified mail gets a stub at all, or is dropped to a counter.

---

## 4. Commitment table — the core departure

The organizing object is a **commitment**, not an email. Classify the state of an obligation.

| | |
|---|---|
| **Exists** | Nothing. No priority, score, rank, or commitment concept anywhere. `agent_rules.priority` is rule evaluation order, not email priority |
| **New** | Everything below |

**Directions:** both. What others owe me, and what I owe others. Mine come mostly from **sent** mail — tier 3 extracts from it. `emails.direction` is unreliable for this (mislabels 30/670 rows in 30d); use `sender_email ∈ gmail_connection.google_email`.

**Three ball states:**

| State | Signal | Clock |
|---|---|---|
| Ball with them | acknowledgment, "will have it Thursday" | capture promised date; **clock keeps running** |
| Ball with me | substantive, question, redline | running |
| Neither | CC / FYI | none — Lane 2 |

**Fields:**

| Field | Notes |
|---|---|
| `deal_id` | **optional** — non-deal commitments are first-class |
| `promised_date` | from "Thursday"; nullable |
| `decline_count` | drives decay |
| `next_surface_date` | written by both decay and snooze |
| `speakable_reason` | written to be read aloud — the actual product |
| `shadow_deal_id`, `shadow_ball_in_court` | what it **would** set, without acting |
| `sync_state` | `pending` / `synced` / `failed` |
| `source` | source-agnostic by design so voice capture drops in later |

**Lifespan:** after the second skip an item leaves the spoken queue and joins an aggregate line ("four things still open from last week"). It never disappears. Snooze by voice is the manual override. Both write `next_surface_date`.

**Sync state:** nothing is marked handled in OVIS until Gmail confirms. `failed` goes to a visible retry queue.

⚠️ **"Shadow" is narrower than it reads.** The commitment layer can be shadow-only, but triage's existing writes — `email_object_link`, `activity` rows, and therefore `ball_in_court_since` — continue during shadow mode unless §14 is accepted. Say this explicitly in the build, or the word "shadow" overstates the isolation.

---

## 5. Gmail write-back

| | |
|---|---|
| **Exists** | `gmail.modify` + `gmail.send` requested ([gmail-connect:22](../supabase/functions/gmail-connect/index.ts#L22)). `modifyMessageLabels` ([gmail.ts:637](../supabase/functions/_shared/gmail.ts#L637)) **already takes `removeLabelIds`** — archiving is a thin wrapper, not new plumbing. `getOrCreateLabel`, `findLabelByName`, `createLabel` all exist |
| **Must change** | `applyLabelToMessage` ([:661](../supabase/functions/_shared/gmail.ts#L661)) is add-only; needs a remove/archive sibling. Label results are swallowed by a catch and recorded nowhere — persist outcome to `sync_state` |
| **New** | Disposition label set: `handled` / `flagged` / `snoozed`. **No priority labels** — ranking lives in OVIS. Keep the VA's `[Properties]` sublabels untouched (data-entry pipeline with a real output, tracks work state, not triage) |

**Verified 2026-09-05 (read-only Gmail calls).** Scope confirmed: `gmail.modify` held on both connections. Labelling works — but **not reliably.**

| Finding | Evidence |
|---|---|
| Label exists, both accounts | `Label_326` (mike, 5,104 msgs) · `Label_2` (asantos, 4,466 msgs), both `type: user` |
| Applying **now**, not just at backfill | 12 × `[Gmail Label] Applied "OVIS-Linked"` in logs, 09-04 18:20–20:45 |
| Direct test, 10 recent linked emails | **6 labelled, 4 `404 notFound` in both mailboxes** |
| **Zero 403s** | Every logged failure is `404 notFound` from `modifyMessageLabels` → `applyLabelToMessage` → `email-triage/index.ts:225`. The `403 → gmail.modify required` fallback has never fired in the retained window |

**The 404 is a real defect, ~25% of label attempts.** `email-triage` resolves the mailbox as
`email.email_visibility?.[0]?.gmail_connection_id` — **the first visibility row, arbitrarily
ordered** ([email-triage/index.ts:129](../supabase/functions/email-triage/index.ts#L129)). A Gmail
`gmail_id` is **per-mailbox**, but `emails` stores exactly one, from whichever account synced
first, while `email_visibility` fans out to both. When `[0]` picks the other account, the id is
meaningless there. **125 of 587 emails in the last 7 days (21%) have 2+ visibility rows** — that is
the exposed population. (Second candidate cause for the same symptom: the message was deleted from
Gmail between sync and triage. Both are live; the code defect is provable from the source either
way.)

Fix before archive-on-dismiss ships: select the visibility row whose `gmail_connection_id` owns the
stored `gmail_id`, or store `gmail_id` per visibility row rather than per email. **Archiving the
wrong mailbox — or silently failing to archive — is worse than mislabelling**, because §4 marks the
commitment handled on a call that only *looked* like it succeeded. Persist the outcome to
`sync_state` so a 404 lands in the retry queue instead of a swallowed catch.

---

## 6. Corrections by natural language

| | |
|---|---|
| **Exists** | `email-correction` edge function (add/remove tag, structured args only). `AgentRulesPage` CRUD at `/admin/agent-rules`. Both are forms — which is why correcting stopped in January |
| **Must change** | The 24 existing rules are all `rule_type='exclusion'` and **delete before the model runs**. That path must become demote-only |
| **New** | Sentence in → small model → structured row. Scope disambiguation. A priority/ranking dimension that does not exist in the schema today |

Rules of the mechanism:
- Ambiguous input ("that's not important") **must ask which scope**.
- Default to the **narrowest** scope — this one email — unless told otherwise.
- Rule-scope corrections are **read back for confirmation** before writing.
- Rules **demote, never delete or hide.** Worst case an item drops to the aggregate line. A bad rule costs attention, never the email.
- Rules are listed, reviewable, reversible.

**Genuinely new schema:** ranking corrections cannot be expressed today. No priority column exists on `emails`, `email_object_link`, or any correction table; `agent_rules.priority` is evaluation order. This is net-new, not an extension.

---

## 7. Learning mechanism

The correction table is the asset, not the model. Every call is stateless; learning = accumulating examples and selecting the right ones per call.

| | |
|---|---|
| **Exists** | `getRelevantCorrections` — the selection mechanism, already working. **Extend, don't rebuild** |
| **Must change** | Feed it (§2b) and scope it (§2d) |
| **New** | A one-shot harvest of the VA's Gmail labels as training data |

**Harvest.** `gmail-sync` reads only SENT/INBOX/UNREAD and discards the rest, so months of `! [Mike]` decisions exist in Gmail and nowhere in Supabase. This beats two weeks of parallel running — it is retrospective and free.

| Label | Maps to |
|---|---|
| `! [Mike]` | ball with me. The only priority label — that job moves to OVIS |
| `! DELETE / UNSUBSCRIBE` | tier 1, kill |
| `! Newsletters` | tier 1, keep-for-reference — **keep the split**, kill vs keep is a real distinction |
| `! [Personal]` | the §3 privacy boundary |
| `[Properties]` + sublabels | separate pipeline, stays in Gmail |

Free second signal: **inbox-vs-archived** — she leaves action items in the inbox.

Known gap: her SOP has **no FYI category**, so **Lane 2 is a blind spot** in the harvested data. Lane 2 needs its own labelled set from somewhere else.

**Implementation note:** `backfill-gmail-labels` is the pattern for *writing* labels, not reading them. A harvest needs its own `users.messages.list?q=label:...` walk with pagination — `syncEmailsForConnection`'s full-sync path caps at 50 messages and won't serve.

**Do not adopt her taxonomy as the schema.** Her labels are a filing system — one terminal bucket per email. The commitment model needs orthogonal fields (direction × ball state × deal × date).

**Graduation rule:** when corrections show the same shape repeatedly, promote it from a tier-3 model call to a tier-1/tier-2 rule. Earn automation with evidence.

---

## 8. The pass — desk first, car second

**Three dispositions, not two:**

| Disposition | Effect | Gmail |
|---|---|---|
| **Handled** | closes the commitment | **archives at that moment** (remove `INBOX`) |
| **Flagged for screen** | a decision, not a deferral | stays in inbox, marked |
| **Skipped** | didn't get to it, still needs triage | unchanged; **feeds `decline_count`** |

Flagged captures a short reason when it's cheap to say — *"needs the site plan"* vs *"needs a real reply"* — so the desk knows five minutes from thirty. **This is also the natural draft trigger.**

**Two lanes:**
- **Lane 1 — needs me.** Worked one at a time.
- **Lane 2 — FYI.** Summarized in aggregate, one thirty-second pass, **never read individually**.

**Target:** Gmail is nearly empty at the desk because the pass already emptied it. The aggregate FYI sweep and the tier-1 filter matter as much as the ranking — they are what make the queue finishable.

---

## 9. UI

| Surface | Exists | New |
|---|---|---|
| **Queue page** | — | New page, **not the deal board**. Ranked commitments, `speakable_reason` as visible text. Same table the voice layer reads. Defaults to open; handled on a toggle |
| **Flagged-for-screen list** | — | Short and deliberate. Where drafts live |
| **Rules list** | `AgentRulesPage` at `/admin/agent-rules` | Extend: demote semantics, reversibility, provenance |
| **Corrections** | `EmailClassificationReviewPage` (separate screen — unused since Aug) | **Inline on each item** — one text box or mic button. Not a separate screen |

**Deal-page information architecture** (emails, notes, commitments, synopsis in one place) is the silo problem — recon confirms email and `note`/`note_object_link` are fully disjoint, no FK either direction, two incompatible link designs. **Acknowledged as its own work item. Not solved here.**

---

## 10. Shadow mode — what it measures

| Question | Query |
|---|---|
| Deal-match precision | Hand-label a sample of ~100 deal-linked emails from one week; `select l.confidence_score, l.reasoning_log, e.sender_email, e.subject, d.deal_name from email_object_link l …` — report precision split by `reasoning_log LIKE 'Thread inheritance%'` vs model-reasoned, because those are different failure modes |
| Ball-in-court accuracy | commitment rows where a correction was filed vs not, grouped by `shadow_ball_in_court`. Requires §2(b) first — with no correction stream there is no ground truth |
| Volume through each tier, tier-3 share | counter per tier written at classification time. **New column — nothing records tier today** |
| Shadow vs board divergence | `shadow_ball_in_court` / `shadow_deal_id` vs `deal_activity_state`. **⚠️ Contaminated unless §14 is accepted** — triage already moves `ball_in_court_since`, so the board is not an independent baseline |

Baseline to beat, from recon: **10.7% deal-link coverage**, one confirmed thread-propagated false positive, 18/63 board tiles currently misreporting.

---

## 11. Operations

| | |
|---|---|
| **Exists** | Nothing. `gmail_connection.sync_error` / `sync_error_at` are populated but read by nothing |
| **New** | Staleness monitor, manual firing, and a kill switch |

**Staleness monitor.** `max(emails.received_at)` vs expected volume for the hour; surface in the queue and in the car. Ingestion fails silently — the inbox looks normal and the queue just goes quiet. Wire `sync_error` into the same signal.

**Manual firing.**
- (a) Single-email retriage on demand — so a correction can be tested immediately instead of waiting on the 5-minute cron.
- (b) Batch retriage over a date range — for testing a new rule against last week. **Show email count and cost estimate, confirm before spending.** Use post-§2(a) token numbers, not the current 12–24k/email.

**Kill switch — new, and overdue.** Recon Addendum 3: triage has run 288×/day since 2025-12-12 with no gap, and there is **no flag that could have stopped it**. Cron job 2 is not sufficient on its own — `gmail-sync` also invokes `email-triage` fire-and-forget with the service-role key ([gmail-sync:314-336](../supabase/functions/gmail-sync/index.ts#L314-L336)). A real switch must be read **inside** `email-triage` so both paths honour it. Follow the `HUNTER_POLLING_ENABLED` precedent.

---

## 12. Model

| | |
|---|---|
| **Exists** | `email-triage` → `gemini-2.5-flash` ([gemini-agent.ts:1415](../supabase/functions/_shared/gemini-agent.ts#L1415)). Current, no deprecation issue. `maxOutputTokens: 2048`, `temperature: 0.1`, ≤5 iterations |
| **Keep** | Tier 3 stays on a small model. `claude-haiku-4-5` ($1/$5 per MTok) is the comparable Anthropic tier if a switch is ever wanted; no reason to move today |

**Separate tickets — not part of this work:**

| Function | Model | Status |
|---|---|---|
| `deal-synopsis` | `gemini-1.5-pro` | Retired by Google. Live and mounted on every deal page, 0 rows written |
| `cfo-query` | `claude-sonnet-4-20250514` | Deprecated (alias `claude-sonnet-4-0`, retirement TBD) |
| `bookkeeper-query` | `claude-sonnet-4-20250514` | Deprecated |
| `gemini.ts` :280, :361, :500 | `gemini-1.5-pro` / `-flash` ×2 | Retired **and** unreferenced — dead code |

---

## 13. Build order

| # | Step | Gate |
|---|---|---|
| 1 | Dependencies (§2) | Tier-1 short-circuit measurably drops model calls; corrections flowing to `agent_corrections` |
| 2 | Commitment table in shadow mode (§4) | Rows accumulating, nothing acting |
| 3 | Desk panel — voice + inline corrections (§8, §9) | Queue finishable in one sitting |
| 4 | Car pass — same thing, screen removed | |
| 5 | Board wiring (§4 shadow fields → real) | **Only after a week of clean shadow data** |

**Desk before car:** a voice loop is far easier to debug in a chair than in traffic, and nothing is wasted — same table, same voice layer, same corrections.

**Standing constraint:** migrations hit production directly; there is no staging. Prod is already 10 migrations ahead of `main` (§1.5). Every migration from this branch widens that gap until merge — note them in the PR per CLAUDE.md.

---

## 14. Where I think this spec is wrong

### The deal-board trigger is not out of scope

The spec calls it *"pre-existing bug, does not block shadow mode, separate ten-minute item."* I think two of those three are wrong.

**It blocks the measurement, not the build.** §10's fourth question is "how often would the shadow ball-in-court have differed from what the board shows." But triage **already writes** `ball_in_court_since` — 186 activity inserts in 7 days, all landing on deals present in `deal_activity_state`. The board is not an independent baseline to compare against; it is partly an output of the thing being measured. A week of shadow data answers that question with a contaminated control. Fix the trigger first, or drop that question from §10 and say why.

**"Pre-existing" is true; "harmless until later" is not.** 18 of 63 tiles are lying right now. Giggletown shows 2 days since touch; the last time we wrote was **194 days ago**. Four Starbucks tiles were cooled by a single Google Chat notification, two more by a news blast. That is the exact failure the plan calls unacceptable — *"a stale board is bad; a lying board is worse"* — and it is live today, not a future risk.

**Ten minutes is about right, and that's the argument for doing it.** Direction is already derivable (`sender_email ∈ gmail_connection.google_email`); the trigger needs a direction guard, or triage needs to stop inserting `activity` rows for inbound mail. Deferring a ten-minute fix past a week-long measurement it corrupts is the wrong order.

**Recommendation:** fold it into §2 as dependency (e). If you'd rather not, drop §10's fourth question rather than answer it with bad data.

### Two smaller ones

**"Backfill the 191 rows" overstates the yield by ~10×.** Real composition is 15 clean link corrections, ~50 ambiguous `feedback` rows, 126 non-link rows that `agent_corrections`' NOT NULL columns physically cannot hold — and 52 of the 191 already overlap an existing `agent_corrections` row. Expect **15–65 usable rows, not 191**. The 43 `not_business` rows are worth more than the ones that do fit, but they belong in a tier-1 training set, not this table. Worth restating the goal as "wire the pipe and salvage what fits" rather than a row count.

**§3's stub still leaks a little.** Retaining sender + timestamp for `! [Personal]` mail is a record of an employee's personal correspondents. Defensible for measurement, but it should be a deliberate call rather than a side effect — consider dropping personal-classified mail to a bare counter with no sender.

### One thing the spec gets right that I'd have argued against

Harvesting the VA's labels instead of running her in parallel for two weeks (§7). The plan proposed parallel running; the spec replaced it with a retrospective harvest. That is strictly better — months of data instead of two weeks, free, available today, and no coordination cost. Keep it.

---

## Open questions

1. ~~**Was `OVIS-Linked` ever actually applied?**~~ **RESOLVED 2026-09-05 — yes, and it is working now.** Label exists on both accounts (`Label_326` mike / `Label_2` asantos), carrying **5,104** and **4,466** messages. Most recent labelled message: 2026-09-04. Logs show 12 × `[Gmail Label] Applied "OVIS-Linked"` in the 18:20–20:45 window on 09-04. **But ~25% fail** — see the new §5 finding on 404s.
2. ~~**What scopes were actually granted?**~~ **RESOLVED 2026-09-05 — `gmail.modify` is held on both connections.** Google `tokeninfo` returns, identically for mike@ and asantos@: `email gmail.modify gmail.send userinfo.email openid`. Archive-on-dismiss and disposition labels are a **GO** on scope grounds; no re-consent needed. (A `scope` column is still worth adding so this is auditable without a live API call.)
3. **Exact VA label strings and hierarchy.** §7 works from the names in the spec prompt; I have no Gmail access to enumerate them. Need the literal label IDs before writing a harvest query.
4. **Lane 2 ground truth.** Her SOP has no FYI bucket, so the harvest can't train it. Where does labelled FYI data come from — inbox-vs-archived as a proxy, or a manual pass?
5. **Why `deal_synopsis` has 0 rows** despite being mounted on every deal page. Silently failing on the retired model, or never invoked? Changes whether §12's ticket is a fix or a delete.
6. **Why the legacy anon JWT still authenticates** both ingestion crons after the 2025-10-23 disablement. Unexplained, and the entire pipeline rests on it.
7. **How many of the 2,603 monthly deletions were rule-based (free) vs model-based (paid).** Not distinguishable from the DB — `processed_message_ids.action` is `'deleted'` for both. Sizes the §2(a) saving.
8. **Where the `promised_date` extraction runs.** Parsing "Thursday" from a body is a tier-3 model job, but §4 lists it as a plain field. Confirm it's a model output with a confidence, not a regex.
