# LOI Tool — RESUME HERE (handoff, 2026-09-01)

Pick up the Starbucks LOI tool build. Full design record: `docs/STARBUCKS_LOI_TOOL_DECISIONS.md`.
All work is on branch `feature/starbucks-loi-tool`, in the **worktree** at
`/Users/mike/Documents/GitHub/react-kanban-board-loi` (NOT the main repo tree — Mike runs a parallel
session on `main`; do all LOI work in the worktree). Last committed: `0e609e8c` (tranche 6 loaded).

## Environment
- Dev DB (throwaway, NOT prod): `postgresql://postgres:CfYcl6tHwl3Pl2u@db.lntfzvzycshncqxecuob.supabase.co:5432/postgres`
- No local Docker; drive the dev DB with `psql` directly. `python-docx` is installed.
- Loader/validator: `supabase/seeds/loi/load_seed.py` (`python3 load_seed.py <file>` validates;
  `--load` emits INSERT SQL to pipe into psql). Rent engine: `rent_engine.py` (Powder Springs
  byte-exact). Docx emitter: `emit_rent_table.py`. Completeness harness: `completeness_test.py`.
- Repo gotcha: `.gitignore` has blanket `*.sql`; only `supabase/migrations/*.sql` and
  `supabase/dev-only/*.sql` are un-ignored.

## State
- **Clause library: 41 clauses loaded** (tranches 1–6). `landlord_work` deferred (`_blocked`; its
  LCW base is blocked on the rent-schedule column-insert contract). Still blocked: R0/R1 rent
  schedules, LCW0/1/2 primaries, Southeast CO back-ups, freestanding CAM variant.
- Rent engine reproduces Powder Springs byte-exact; end-cap rent-table emission spike passed
  (matches worked ECDT). Render contract: `docs/LOI_RENT_TABLE_RENDER_CONTRACT.md`.
- Phase-2 foundation built: `loi_economic_term` catalog + unified `loi_negotiable_item` (3 kinds:
  clause_position / economic_term / body_parameter).
- Ownership rule locked; economic direction_of_favor set; CAM = `cam_basis` composite selector with
  deal-type subdomain (`loi_variant_selector_value`).

## UNCOMMITTED / IN-FLIGHT (in the worktree, untracked; also in Mike's Downloads)
Two files were received but NOT yet loaded/committed:
- `supabase/seeds/loi/LOI_sweep_manifest.json` — the authoritative 236-paragraph sweep. Schema is a
  dict `{template, template_paragraphs, _README, assignments}`; `assignments` is the list. Categories:
  primary(49)/addon(27)/instruction(12)/letter_shell(16)/blocked(26)/empty(106). (My guessed schema
  was wrong — inspect `assignments` entries directly; some entries stringify oddly, handle that.)
- `supabase/seeds/loi/loi_seed_tranche7.json` — three items (closing frame, tenants-in-common
  modifier, contaminated-sites).

## NEXT ACTIONS (in order)
1. **Commit the permanent completeness test.** Adapt `completeness_test.py` to the manifest's
   `assignments` schema and assert Mike's THREE things: (a) every non-empty paragraph has a category;
   (b) every `primary`/`addon` paragraph maps to a LOADED canonical body (check against the DB or the
   seed tranches); (c) nothing unassigned. Run it green. It doubles as the template-transition detector.
2. **Load tranche 7** (validate then `--load`). Three items:
   - Closing frame: always-emitting modifier on `letter_shell`, 3 segments (closing statement, SBUX
     signature block, Landlord signature block).
   - Tenants-in-common modifier (re-sent; was lost in the tranche-6 patch).
   - Contaminated-sites (para 162): a body-less position raising 3 attachment/task requirements,
     `firing_mode: on-deviation`, approval flagged.
3. **Answer Mike's two questions** (he'll re-key against the answers):
   - **Closing-statement L1/L0 dependency:** the "[DELETE PRECEDING SENTENCE IF NOT USING STARBUCKS
     STANDARD FORM LEASE]" sentence drops when L1 is selected. RECOMMENDED SHAPE: make that sentence
     its **own modifier position** on letter_shell (so it can carry a gate — applies_when is
     position-level, not segment-level), with `applies_when: {ref_kind:'position_selection',
     ref_clause_key:'lease', ref_brace_code:'L0', operator:'is_selected'}`. The rest of the closing
     (signature blocks) stays an ungated always-emitting modifier.
   - **Body-less contaminated-sites position: LOADABLE as-is.** No DB constraint forces a position to
     have a body; model it as a `modifier` (brace optional) with 0 `position_bodies` + 3
     `attachment_requirements`, `firing_mode: on-deviation`. It emits nothing; OVIS raises the tasks.
     No need to invent a body or downgrade to guidance+director-question.
4. **After the library is fully closed:** build `loi_clause_exclusion` (members: transfer_of_property
   ⊃ sale_of_property, the pylon-panel signage pair, plus de-activate `sale_of_property`) → confirm
   payload contract A–E (in the decisions doc) → build the assembler → minimal wizard → **Powder
   Springs acceptance test** (regenerate end-to-end from deal terms, diff vs `fixtures/`, every
   difference explainable).

## OPEN QUESTIONS FOR MIKE (flagged, need his answer)
- **Signature block: "Store Development Manager" vs "Representative Name / Title: Broker" (SDM cc'd).**
  Powder Springs + Douglasville use the Broker form. Which is the Oculus standing default? Blocks the
  acceptance test.
- CAM0 cap already resolved (3% standing default). ETR omitted by design.

## GOTCHAS
- v1–v5 negative tests are empty-schema unit tests; they collide with the loaded library by fixture
  key (not a regression). v6/v7/v8 green + the full load validate the current schema.
- Body text is Mike's — patch shape/metadata freely, but if `body_text` needs changing, tell him.
- Report every change made against Mike's seed files (he holds the extraction).
