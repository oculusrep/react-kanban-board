# Column-Insert / Allowance Contract

**STATUS (2026-09-06): reviewed. Q1, Q2, Q5, Q6 RESOLVED by Mike; Q2's mechanism is BUILT. Q3, Q4, Q7
remain.** Body text is still Mike's; schema and assembler are mine.

This is the critical path. `rent` (R0/R1) and `landlord_work` (LCW0/1/2) are both registered DEFERRED,
so regenerating Powder Springs HALTS under payload contract C. The acceptance test cannot run until
they load, and they cannot load until this contract settles how their tables and lists are produced.

Everything below marked **VERIFIED** was checked against the template and the three worked examples in
`supabase/seeds/loi/fixtures/`. Everything marked **OPEN** needs Mike.

---

## Part 1 — Rent side

### 1.1 Two blocks, one survives, the other is DELETED

The template carries two complete, parallel blocks:

| block | paras | shape |
|---|---|---|
| **R0** | 36–47 | marker 36; tab-delimited **3-column** rows 38–46; trailing blank 47 |
| **R1** | 49–61 | marker 49; tab-delimited **4-column** rows 51–59; blank 60; remeasurement note 61 |

Para 48 is a blank separator belonging to neither. Para 34 (`RENT:` intro) is shared and always kept.

**Rule (from contract C, strip-by-default):** selecting one block DELETES the other in full — marker
paragraph, every row paragraph, and its trailing blank. Not skipped, not left empty. The marker
paragraphs (36, 49) are pure instruction and never emit under any selection.

**VERIFIED against all three worked examples:** no marker text survives anywhere — neither
`SET ANNUAL AMOUNT` nor `TIED TO SQUARE FOOTAGE` appears in Powder Springs, the worked ECDT, or the
worked Freestanding.

**Blank normalisation — VERIFIED, and it is not free.** Powder Springs emits exactly **one** blank
paragraph between `RENT:` and the table, and **two** blanks between the table and `PERCENTAGE RENT:`.
Naive deletion of the R0 block would leave the 35 + 48 blanks adjacent and produce two before the
table. So: **after block removal, collapse runs of consecutive empty paragraphs to ONE before the
table; the two-blank gap after the table is what the ECDT shows and is preserved by the spike's
insertion point.** Stated explicitly because it is a byte-diff-affecting decision that no rule
currently covers.

### 1.2 RESOLVED — the R1 remeasurement note EMITS on every R1 deal

> *"[{R1} The rent schedule is based on Landlord's estimate of the ground floor area of the Premises,
> excluding mezzanine, basement and storage space, if any, and the rent will be adjusted if the actual
> number of square feet of the Premises is less than Landlord's estimate.]"*

**It does not appear in Powder Springs, the worked ECDT, or the worked Freestanding.** Three for three.

That is very likely because the whole paragraph is wrapped in `[ … ]` and a human stripping bracketed
instructions deleted the paragraph along with its brackets. But **the content is substantive lease
language, not an instruction** — it is the clause that adjusts rent downward if the Premises measure
smaller than Landlord's estimate, which protects Starbucks. Dropping it is a **concession**, not a
formatting choice.

Structurally it is strippable without loss: the runs separate cleanly — run 0 is `[{R1}`, run 5 is the
closing `]`, and the body text sits in runs 2–4 — so the assembler CAN emit the sentence with markers
removed, exactly as it does for `EXCLUSIVE USE`.

**RESOLVED BY HANDBOOK (Mike, 2026-09-06): it EMITS.** The paragraph appears verbatim in the
"Provision in LOI" block of **both** handbook editions — standard provision text, not commentary — and
the Negotiation Tips reinforce it: *"make sure that the rent adjustment will only be made if the actual
number of square feet is lower than what appears in the Letter of Intent."*

So **all three worked examples dropped a tenant-protective clause**, and they did share one origin: the
bracket-wrapped paragraph went out with the brackets. Mike has been told, because that is a live
negotiating point rather than a build detail. Strippable as `[{R1}` / body / `]`, exactly as EXCLUSIVE
USE. **Emit on every R1 deal.**

**Acceptance-test consequence:** a SECOND expected diff, and a deliberate one — we will emit a sentence
Powder Springs omitted. Expected diffs are now: SALE OF PROPERTY strips, and the R1 remeasurement note
appears.

### 1.3 Row count is VARIABLE — the template understates it

**VERIFIED.** The template shows 2 base rows + 4 option rows. Powder Springs has **8 data rows through
36–40**, and its `TERM:` reads *"Ten (10) years plus six (6) consecutive five (5)-year unconditional…"*
— ten-year base, **six** options, corroborating the table independently.

**Rule.** The table is not a fixed 11×4. Its shape is:

```
row 0            header
rows 1..B        base-term rows        (engine: end_year <= base_term_years)
row B+1          blank spacer          (all cells empty)
row B+2          "Extension Options:"  (col 0 only)
rows B+3..B+2+P  option-period rows    (engine: start_year > base_term_years)
```
Total rows = `B + P + 3`. Powder Springs: B=2, P=6 → 11. The template's own 6-row block is B=2, P=4;
it is a **placeholder, not a maximum**.

The separator pair (blank + `Extension Options:`) sits immediately before the **first** option row,
always — never at a fixed index.

**OPEN:** what if `P = 0` (no extension options)? No worked example. Proposal: omit the blank and label
rows entirely, giving `B + 1` rows. Needs confirmation, and it is cheap to state now.

### 1.4 The Per Square Foot column

Template header cell is `[{R1}Per Square Foot]`; each R1 data cell is `[{R1}$\t\t]`. **Brace codes
never emit** (standing rule), so after stripping:
- Under **R1**: the column exists, header text `Per Square Foot`, cells `${x:,.2f}`. Four columns.
- Under **R0**: the column does not exist. Three columns.

**The manual $/SF drop is NOT the assembler's job.** Mike strips that column by hand before execution.
Generation ALWAYS produces it under R1; the deferred protective rule stays deferred, and the assembler
must not implement it. Stated because "generation produces a column that is later removed" looks like a
bug to anyone who does not know the history.

### 1.5 What the spike already established — formalised, not re-derived

`docs/LOI_RENT_TABLE_RENDER_CONTRACT.md` is the verified contract for the **R1 / end-cap** table and
stands as written: table CREATION (the template has 0 tables), style `Normal Table`, `autofit=False`,
no borders, column widths `[2080, 1380, 1500, 1660]` twips on both `w:tblGrid/w:gridCol` and each cell's
`w:tcW`, fonts inherited, insertion by `anchor._p.addnext(table._tbl)` after the R1 anchor paragraph.
Zero structural diff against the worked ECDT.

Two things that contract explicitly did **not** cover and this one must:
- **R0 removal.** The spike left the R0 block in place; it is not part of the render contract. §1.1 covers it.
- **Column widths for 3 columns.** The verified widths are for a 4-column table. R0's widths are unknown.

### 1.6 OPEN — R0's render shape is UNPROVEN, and no worked example proves it

**VERIFIED and important:** the worked Freestanding LOI carries the R0 block as **tab-delimited
paragraphs, unfilled** — `$` placeholders still empty, rows unchanged from the template. It was never
filled in. So **no artifact anywhere shows a completed R0 schedule**, and we do not know whether a
filled R0 is a Word table (like R1) or stays tab-delimited paragraphs.

This is exactly the freestanding blocker Mike already identified, and it is NOT resolvable by
inference. It needs a worked or executed freestanding LOI with a filled rent schedule. **Until then R0
should stay deferred even after R1 loads** — which is fine, because Powder Springs and the acceptance
test need only R1.

**RESOLVED (Mike): split the deferral. Load R1, keep R0 deferred. MECHANISM BUILT** — migration
`20260906210000`.

`loi_clause.unavailable_kind` is clause-level, and `rent` is one clause holding two positions. Once R1
loads the clause must go active or R1 can never be selected — at which point R0 would become
**silently absent**, the exact failure contract C was amended to prevent. Position-level `is_active`
cannot help either: R0 has no row to deactivate. **A gap has to be declarable before the thing
exists.**

So `loi_deferred_position (clause_key, brace_code, reason, blocked_on)`, mirroring
`loi_deferred_clause`, with a trigger that REFUSES to register a position that is actually loaded — a
stale registry would halt a deal on something that works, the mirror image of the stale-allowlist
failure rule 4 catches. `loi_deferred_item` unions both granularities into one "may I proceed?" query,
because a caller who must remember to check two places will eventually check one.

**R0 is registered NOW**, while `rent` is still clause-deferred, so the later tranche that loads R1 and
flips the clause active cannot leave R0 silently absent — the declaration is already there and does not
depend on anyone remembering. Test P3 in `loi_negative_tests_v12.sql` simulates exactly that flip and
asserts R0 survives it.

---

## Part 2 — Allowance side

### 2.1 The allowance list is VARIABLE-LENGTH, not a fixed pair

LCW0 (template para 107) and LCW1 (110) both carry:

> *"…an improvement allowance of $\_\_\_\_ toward the cost of Tenant's improvements [plus a restroom
> allowance of $\_\_\_\_ and a sewer branch line allowance of $\_\_\_\_ as described in the attached
> Landlord Workletter [INCLUDE ANY OTHER ALLOWANCES] ([collectively] the "Allowance")…"*

`[INCLUDE ANY OTHER ALLOWANCES]` means the count is **open**. Restroom and sewer are examples, not a
schema. **VERIFIED:** Powder Springs emitted a single improvement allowance of $75,000 and dropped the
entire bracketed block.

Three ways to model it:

- **(a) A repeating-group construct in the library** — a new `loi_body_list` table with an item
  template. Most expressive, most machinery, and nothing else in the library needs it.
- **(b) OVIS composes the phrase; the body carries ONE param. ← RECOMMENDED.** The payload delivers the
  finished text, e.g. *"plus a restroom allowance of $5,000 and a sewer branch line allowance of
  $2,500 as described in the attached Landlord Workletter"*, or the omit branch.
- **(c) A fixed set of optional params** (restroom, sewer, +N generic) — **rejected**: the count is
  open by the template's own words, so any fixed N is wrong eventually.

**Why (b).** Contract A makes the assembler a substituter that computes nothing, and contract E already
puts composition upstream for exactly this reason (rent rows are precomputed). A variable-length list
is composition. (b) keeps the assembler dumb and needs no new library machinery.

**The auditability objection, and its answer.** Under (b) the individual allowance amounts are not
separately visible as params, which Phase 2 needs — "conceded restroom allowance 5,000 → 3,000" must be
a tracked concession. Answer: model each allowance as an **economic term** upstream
(`loi_economic_term` + `loi_negotiable_item`, both already built), and let the body param carry only
the RENDERED phrase. Auditability lives where the negotiation lives; the document gets text. This is
the ownership rule already locked: *economic_term owns computation-driving values, body_parameter owns
inline doc values.*

### 2.2 The "collectively" grammar dependency — same class as the article defect

`([collectively] the "Allowance")`. **VERIFIED:** Powder Springs, with one allowance, emitted
`(the "Allowance")` — no "collectively". The word is value-dependent on the **count** of allowances,
exactly as `a`/`an` was value-dependent on the following sound. Mike is right that catching it now is
cheap and catching it after keying is not.

**KEYED BY MIKE (2026-09-06), as proposed.** A `choose_one` derived by OVIS from the allowance
count, like `audit_article`. **The spacing needs care, and the article incident is the reason.** Folding
grammar into a value broke the second position last time; here there is only one position, but the
hazard is different — an omit branch would leave `( the "Allowance")` with a stray space, and a
trailing-space option value (`"collectively "`) is invisible in review and trivially lost.

So: **two complete, non-empty options rather than a value plus an omit branch.**

```
body:    …as described in the attached Landlord Workletter ({{param:lcw_allowance_ref}} "Allowance")…
options: "collectively the"   |   "the"
```

Both branches render correctly with ordinary single spaces, nothing depends on invisible whitespace,
and the `>= 2 options` rule is satisfied without an `is_omit` row. **Powder Springs is the fixture for
the one-allowance branch** — a single $75,000 allowance emitting `(the "Allowance")`.

### 2.3 Instructions and attachments in the same sentence

`[ATTACH AND COMPLETE EXHIBIT]` and `[INCLUDE ANY OTHER ALLOWANCES]` are instructions — stripped, never
emitted. The Landlord Workletter reference is an **attachment obligation** and belongs in
`loi_attachment_requirement` / `loi_attachment_task`, the mechanism already built for U1's exclusives
list and OS0's site plan. No new machinery.

---

## Part 3 — Open questions, consolidated

| # | Question | Owner | Blocks |
|---|---|---|---|
| 1 | ~~R1 remeasurement note~~ **RESOLVED: it EMITS.** Verbatim in both handbook editions' "Provision in LOI" block. | — | — |
| 2 | ~~Split the `rent` deferral~~ **RESOLVED and BUILT** (`loi_deferred_position`, migration 20260906210000). | — | — |
| 3 | **R0 render shape** — table or tab-delimited paragraphs? No artifact shows a filled R0. | needs a worked/executed freestanding LOI | freestanding only |
| 4 | **`P = 0` (no extension options)** — omit the blank + label rows? | Mike | edge case |
| 5 | ~~Allowance modelling~~ **RESOLVED: (b)** — OVIS composes the phrase, amounts tracked as economic terms upstream. | — | — |
| 6 | ~~`lcw_allowance_ref` wording~~ **RESOLVED and keyed by Mike:** `"collectively the"` / `"the"`. | — | — |
| 7 | **3-column table widths** for R0, if R0 turns out to be a table at all. | falls out of #3 | freestanding only |

**Remaining: Q3 (R0 render shape — needs an artifact, freestanding only), Q4 (`P = 0` edge case), Q7
(3-column widths, falls out of Q3).** None blocks the acceptance test. What blocks it now is body text:
see `docs/LOI_BODY_TEXT_OWED.md`.
