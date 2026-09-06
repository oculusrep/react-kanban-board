# Column-Insert / Allowance Contract — DRAFT FOR REVIEW

**STATUS: DRAFT. Nothing keyed, nothing loaded, no migration written.** Mike reviews first; anything
that turns out to be body text is his.

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

### 1.2 OPEN — the R1 remeasurement note (para 61) is absent from ALL THREE worked examples

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

**Mike's ruling needed, and it is not a formatting question:**
- **(a)** The note is real R1 content and SHOULD emit. Then all three worked examples dropped it in
  error, and the acceptance test gains a second expected diff (a deliberate one — we would be emitting
  something Powder Springs omitted).
- **(b)** The note is genuinely optional / never used in practice. Then it is keyed as a non-default
  position or omitted from the library, and the sends are correct.

I recommend NOT deciding this from the three sends alone: they may share one origin. The Aug 2026
handbook is the tiebreaker and only Mike can read it.

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

**Recommendation: split the deferral.** Load R1 now and keep R0 deferred, rather than treating `rent`
as one all-or-nothing gap. That unblocks the acceptance test without inventing an R0 shape. Requires a
position-level rather than clause-level deferral — see §3.

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

**Proposed shape — but the body text is Mike's.** A `choose_one` derived by OVIS from the allowance
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
and the `>= 2 options` rule is satisfied without an `is_omit` row. **Mike owns the body text** — this is
a proposal, not a change.

### 2.3 Instructions and attachments in the same sentence

`[ATTACH AND COMPLETE EXHIBIT]` and `[INCLUDE ANY OTHER ALLOWANCES]` are instructions — stripped, never
emitted. The Landlord Workletter reference is an **attachment obligation** and belongs in
`loi_attachment_requirement` / `loi_attachment_task`, the mechanism already built for U1's exclusives
list and OS0's site plan. No new machinery.

---

## Part 3 — Open questions, consolidated

| # | Question | Owner | Blocks |
|---|---|---|---|
| 1 | **Does the R1 remeasurement note emit?** Absent from all three worked examples, but it is substantive tenant-protective language. Handbook is the tiebreaker. | Mike | R1 keying |
| 2 | **Split the `rent` deferral?** Load R1, keep R0 deferred. Needs position-level deferral, since `loi_clause.unavailable_kind` is clause-level today. | Mike (call), me (mechanism) | acceptance test |
| 3 | **R0 render shape** — table or tab-delimited paragraphs? No artifact shows a filled R0. | needs a worked/executed freestanding LOI | freestanding only |
| 4 | **`P = 0` (no extension options)** — omit the blank + label rows? | Mike | edge case |
| 5 | **Allowance modelling (b)** — OVIS composes the phrase, amounts tracked as economic terms. | Mike | LCW keying |
| 6 | **`lcw_allowance_ref` wording** — `"collectively the"` / `"the"`. Body text. | Mike | LCW keying |
| 7 | **3-column table widths** for R0, if R0 turns out to be a table at all. | falls out of #3 | freestanding only |

**Nothing in this draft is keyed.** Question 2 is the one that decides whether the acceptance test can
run soon: R1 is fully specified by the spike and §1.1–1.5, while R0 is not specified at all, and today
they share one deferral.
