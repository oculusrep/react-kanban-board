# LOI Tool — RESUME HERE (handoff, 2026-09-08)

**Next session: write the spec for the ASSEMBLER and the WIZARD.** The library is closed; nothing
else blocks that work. Read this file, then §"Where to start" at the bottom.

Full design record: `docs/STARBUCKS_LOI_TOOL_DECISIONS.md` (1,893 lines — the authority, not this
file). Branch `feature/starbucks-loi-tool`, in the **worktree** at
`/Users/mike/Documents/GitHub/react-kanban-board-loi` — NOT the main tree, where Mike runs a parallel
session on `main`. Last committed: `1b4522b9` (tranche 14).

## Environment

- Dev DB (throwaway, NOT prod):
  `postgresql://postgres:CfYcl6tHwl3Pl2u@db.lntfzvzycshncqxecuob.supabase.co:5432/postgres`
- No local Docker; drive the dev DB with `psql`. `python-docx` installed.
- Loader/validator: `supabase/seeds/loi/load_seed.py` — `python3 load_seed.py <file>` validates,
  `--load` emits INSERT SQL to pipe into psql.
- Completeness: `python3 completeness_test.py LOI_sweep_manifest.json LOI_addendum_manifest.json`
  (takes N manifests).
- Constraint suites: `supabase/dev-only/loi_negative_tests_v9..v12.sql`.
- Rent engine `rent_engine.py` (Powder Springs byte-exact); docx emitter `emit_rent_table.py`.
- **Repo gotcha:** `.gitignore` has a blanket `*.sql`; only `supabase/migrations/*.sql` and
  `supabase/dev-only/*.sql` are un-ignored.

## State — the library is CLOSED

| | |
|---|---|
| clauses | 44 |
| canonical bodies | 103 |
| content paragraphs | **80/80 covered, ZERO deferred** |
| body references | 110 across 96 paragraphs |
| tests | v9 13/13 · v10 8/8 · v11 13/13 · v12 6/6 · completeness green |
| **the only remaining gap** | **`rent`/`R0`**, registered in `loi_deferred_position` |

Two skeletons: the letter (`LOI_sweep_manifest.json`, 236 paras, transition detector ON) and the
Contingency Addendum (`LOI_addendum_manifest.json`, 17 paras, PROVISIONAL, detector OFF with a stated
exit condition — no authoritative .docx exists).

**R0 is deferred because its render shape has no artifact anywhere.** The worked Freestanding LOI
carries the R0 block as tab-delimited paragraphs with the `$` placeholders still EMPTY — it was never
filled in. An R0 deal correctly HALTS. Powder Springs is R1, so this does not block the acceptance
test. Unblocking needs a worked or executed freestanding LOI with a FILLED R0 schedule.

## The contracts the assembler must implement

Written out in full in the decisions doc; this is the index.

- **A** — tokens stay in `body_text`; param values ride alongside. Entries are TYPED:
  `{kind: value|landlord_fill|omit}`. Absence is a hard error; empty string is never the sentinel.
  With option-templating, "every token" means every token in the body **or in the SELECTED option**.
- **B** — placement by (1) the template's `[{CODE}]` marker runs, (2) section headings, (3) the R1
  anchor, (4) `template_paragraph`. A missing anchor is a HARD FAILURE. **Tier 2 is the fragile one**
  — a reworded heading breaks it silently, and the docx cross-check in `completeness_test.py` is what
  catches that. Do not weaken either without replacing the guard.
- **B4** — **headings are TEMPLATE-OWNED.** The assembler preserves the heading run and replaces only
  the content after it, exactly as it strips the code marker. Never emitted from a body, never
  duplicated.
- **C** — strip by default, **but HALT on absence.** Deletion is legal only for content the payload
  CHOSE not to claim; never for content the library cannot yet supply. `loi_deferred_item` is the
  single "may I proceed?" query, spanning clause- and position-level gaps.
- **D** — `modified` is OVIS metadata; `body_text` is authoritative.
- **E** — rent rows arrive precomputed. **The assembler does zero math.**
- **F** — **OVIS runs the exclusion check and the deferred halt; the assembler does NOT re-check** —
  and cannot, being database-free. The payload is a post-validation artifact.
- **G** — whitespace around an omitted param: delete the token plus exactly ONE immediately-preceding
  space if present, else one following space, else the token alone. **Not global normalisation** —
  tranche 10 deliberately keeps the space before the period in both pylon bodies.

Plus two structural rules:
- **Paragraph grouping:** positions sharing a non-null `(clause_id, template_paragraph)` concatenate
  into ONE emitted paragraph, ordered by `(COALESCE(emit_order, -1), rank)` — a position with no
  `emit_order` sorts first, since alternatives may not carry one. NULL never groups.
- **`computed_table`:** skeleton-owned paragraphs the engine fills. Carries `table` and
  `gated_by {selector_field, selector_value}`; no two tables may share a gate.

## Assembler — LOCKED decisions, do not reopen

- A **separate deterministic service**, not inside OVIS. Direct OVIS→service HTTP job call with an
  idempotency key. **Never MCP.** In-place surgery on the real template `.docx`.
- Why it cannot move into OVIS: contract F depends on the renderer being **database-free**. Give it
  database access and F stops being coherent.
- Pure function of the payload, triple version-pinned (library, template, assembler). The payload is
  persisted verbatim as the operation log.
- Acceptance test: emitted output has **zero brackets and zero codes** (landlord-fill renders
  excepted), or it fails.

## Acceptance test (Powder Springs) — two EXPECTED diffs

Both explainable, neither a regression:
1. **SALE OF PROPERTY strips** — retired by `transfer_supersedes_sale`; Powder Springs carrying it at
   its para 95 is a historical artifact.
2. **The R1 remeasurement note APPEARS** — deliberate. All three sent LOIs dropped it (the
   bracket-wrapped paragraph went out with the brackets), but it is verbatim in the "Provision in LOI"
   block of BOTH handbook editions and is tenant-protective.

**COVERAGE CAVEAT, to state in the test's own notes.** In the Powder Springs signage paragraph both
blanks are landlord-fill and empty and the choose takes the "monument or pylon" branch, so that
paragraph exercises almost none of the signage clause — the article fix in particular is never
exercised. **The test proves the assembler reproduces the send; it does not prove the clause is
correct.**

## Open, none blocking the spec

- **R0 render shape** — needs a filled-R0 artifact. Freestanding only.
- **`P = 0`** (no extension options) — omit the blank + label rows? No fixture. Mike's call.
- **3-column table widths** — falls out of R0.
- **`future_construction` letter paragraph** — pending; leaves `_unjoined_bodies` when it lands.
- **`other_contingency`** — awaiting a send that uses it. `_unjoined_bodies` ends at exactly
  `sale_of_property/main`, `early_termination/placeholder`, `other_contingency/main`.
- **Forbidden-substring check** for "NNN"/"Triple Net" — OWED, but do NOT build until freestanding is
  scoped and a fixture exists. A rule with no fixture is unverified by construction.
- **Contingency Addendum second skeleton** — provenance closed (Starbucks-issued, Bucket 1 IS empty);
  the skeleton build itself has not started.

## Standing rules learned the hard way — start from these

1. **Monitor the artifact, not the run.** Status signals report that a step RAN, never that it
   PRODUCED anything. Before trusting a check, name the input that would make it fail and confirm that
   input can reach it. Four instances cost real time: `LIKE '%_%'` matching every row; a scan reading
   only `body_text` while 3 of 5 defects lived in option values; a dump whose `string_agg` swallowed
   every `is_omit` row and produced two false design questions; and 432 green cron runs through an
   8-hour outage.
2. **Mutation-test every new assertion before trusting it.** Rule 2 alone passed two of three
   deliberate corruptions, which is what produced rule 4.
3. **A migration guard asserts what ITS OWN change is responsible for — a total is never that.** Two
   landlord-fill migrations asserted library-wide counts and would have failed on replay.
4. **SEEDS own structure; MIGRATIONS own state transitions seeds cannot express.** Building structure
   in a migration made `completeness_test` fail — its inventory reads tranche files.
5. **Body text is Mike's.** Patch shape and metadata freely, report every change; if `body_text` needs
   changing, ask.
6. **An unexpected emission is not automatically a defect.** "monument or pylon" was one step from
   being recorded as a permanent fixture defect; it was a legitimate third state nobody had modelled.
7. **"In the project" means chat can read it, not that it is on disk.** Search once, then ask for the
   path or a paste.

## Where to start next session

**Write the spec for the assembler and the wizard.** Suggested shape, mirroring
`LOI_COLUMN_INSERT_ALLOWANCE_CONTRACT.md`: what is settled (contracts A–G, the render contract, the
grouping and `computed_table` rules), what is open, and what needs Mike — with every claim marked
VERIFIED or OPEN.

Questions worth resolving early, none yet decided:
- **Payload schema, concretely.** A–G define the semantics; nothing has written the JSON shape.
- **Wizard question order and gating.** `applies_when` is position-level; the wizard needs a
  traversal that asks the fewest questions and never asks one whose answer is already implied.
- **"Not decided yet" is a real state at LOI time** — proven by Powder Springs. The sign-type case was
  solved in the LIBRARY (a third option carrying the emitted words), not as a wizard setting. Expect
  more of these, and prefer the same answer.
- **Where deal facts come from.** The wizard asks some; OVIS already holds others (sqft, term,
  rent basis). Asking for something OVIS knows is a defect, not a convenience.
- **Idempotency key semantics** — what makes two assembly requests "the same job".
