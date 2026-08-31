# Starbucks LOI Tool — Locked Design Decisions

**Status:** Section 8 interview complete (2026-08). Schema not yet written.
**Branch:** `feature/starbucks-loi-tool`
**Source briefing:** `LOI_tool_build_briefing.md` (Sections 1–7A locked there; not restated in full here).

This document records the resolutions to the Section 8 open questions plus the
schema consequences that fell out of them. It is the design record the schema
must satisfy. The clause library (39 clause records) is a separate artifact that
populates the schema once it exists.

---

## Locked context (from briefing, summarized)

- **Two phases.** Phase 1 = deterministic LOI Assembler (no AI). Phase 2 =
  negotiation loop (clause positions + event stream → Starbucks audit record / LRM).
- **OVIS is system of record + front door.** All data in one Supabase. Assembler
  is a separate deterministic service. AI agents call in via MCP for fuzzy work only.
- **Clause-as-object.** Atomic unit is the VARIANT (ranked position), not the clause.
  Never key on section numbers. Starbucks curly-brace POSITION CODES are the identifiers.
  Every selectable position carries a brace code (audit requirement).
- **Direction, not source.** SE-more-aggressive → accept; SE-softer → deviation/flag;
  pure addition → custom clause; placement-only → accept but map.
- **Approval-required = flag, not gate.** Note and surface; never block.
- **Three-bucket Position 1.** (1) custom-owned clauses, (2) coded positions
  selected/modified, (3) standing house defaults. Each clause record carries a
  bucket tag + deal-type scope.

---

## Section 8 resolutions

### A — Schema prescriptiveness: RIGID SPINE, SOFT EDGES

Rule: **anything we'll ever count, filter, or assert in the audit record is a real
typed column; everything else is prose.** JSONB is allowed for Phase-2 event
payloads only — never for the clause library.

Real typed columns (the spine), on top of clause→variant→position/brace-code/rank:
- `code_status` enum: `confirmed | provisional`. (Must be able to query what's unconfirmed.)
- `authority` enum: `national-handbook | southeast-regional | self-authored`. Never
  collapsed — may map to different Starbucks codes later.
- Approval flag as **three fields**: boolean + authority + swappable display label.
- **Canonical body text** stored immutably and versioned alongside the document
  skeleton (word-for-word-vs-modified computes against it). See C for the key.
- `rule_status` (added in D), `firing_mode` (added in F).

**Modifiers that attach without occupying a rank (NNN → CAM):**
Model as exclusivity, not a second table. Position row gains:
- `position_kind` enum: `alternative` (ranked, mutually exclusive within a variant)
  | `modifier` (additive, conditional add-on, co-occurs with the chosen rung).
- `rank` INT **nullable**: required for `alternative`, null for `modifier`.
  Partial unique index: `UNIQUE (variant_id, rank) WHERE position_kind = 'alternative'`.
- `modifies_clause_id` FK: null for alternatives; on a modifier points at the clause
  it rides (clause-level, e.g. NNN → CAM). CHECK: non-null iff `position_kind='modifier'`.
- `emit_order` INT: deterministic emission order for co-riding modifiers on one clause.
  Required for modifiers (same CHECK style) so emission order is never undefined.
- `applies_when`: structured trigger condition for the add-on. **Must be able to
  reference other clauses and fields, not just deal attributes** (see C, F).

NNN keeps its brace code, stays selectable and auditable, but never fakes a rank.

### B — OVIS ↔ Assembler contract: PURE FUNCTION, SELF-CONTAINED

- **Inbound payload is self-contained.** OVIS resolves everything; the service does
  zero mid-run library reads (a mid-run read = same deal assembles differently on
  different days = reproducibility dead).
  - **Text in, no resolution.** Payload carries resolved canonical body text, not
    codes-to-be-looked-up. Codes ride along for the audit record only.
  - **Payload persisted verbatim = the operation log = Phase-2 baseline.** Same
    payload replayed must produce a byte-identical document.
  - **Triple version-pin:** skeleton version + clause library version + assembler
    version, all stamped into the payload.
  - **Corollary:** guardrails and approval flags fire in OVIS, not the assembler.
    Assembler validates structural integrity and refuses malformed input, makes no decisions.
- **Outbound:** `.docx` (with real Word comments + Landlord Workletter scope matrix)
  + a **render manifest** (three pinned versions, content hash of the docx, per-position
  emission provenance as structured data — not scraped from the Word file).
- **LRM is an OVIS projection, not an assembler output.** Assembler emits docx +
  manifest only. LRM depends on Phase-2 events that don't exist at assembly time.
  - **Frozen LRM at close** is a **separate render job**: OVIS computes the projection,
    hands finished content to a renderer. Same pattern — OVIS decides, service renders —
    but not the document-assembly code path.
- **Transport:** direct OVIS→service **job call** (HTTP), not MCP. MCP stays the
  agent-facing fuzzy channel; the assembler never touches it. Assembly ALWAYS routes
  through OVIS resolution; never agent→assembler. Agent-triggered assembly (if ever)
  is agent→OVIS→service.
  - **Idempotency key** on the job call (same key + payload = same result, no dup renders).
  - **Sync by default; job-with-polling** fallback if the workletter matrix is slow.

### C — Continuous Operation ladder (premise corrected against source)

CO1 is **not** missing/ambiguous — the national drop carries `[{CO1 FALLBACK}]` with
full body. Southeast runs a **four-rung ladder**; top two are coded:

| Rank | Code | code_status | Content |
|------|------|-------------|---------|
| 0 | CO0 | confirmed | no continuous-operation covenant (preferred) |
| 1 | CO1 FALLBACK | confirmed | 180-day cessation reducible to ≥60; FM/casualty/condemnation/inventory/renovation/remodeling/assignment carve-outs; LL recapture on 30 days' notice unless tenant resumes |
| 2 | CO-SE-BU2 | provisional | conditional recapture, triggered only if LL delivers with LL work complete within 60 days of Scheduled Delivery Date |
| 3 | CO-SE-BU3 | provisional | opening covenant: open one day fully stocked/staffed within 180 days of rent commencement, conditioned on delivery within 30 days of Scheduled Delivery Date; "should be rare" |

- Placeholder codes in **visibly non-Starbucks form** (`CO-SE-BU2`, `CO-SE-BU3`) so a
  real code can land later without collision. Both provisional rungs are selectable
  but marked provisional in **both** the docx and the audit record.
- **Confirmation = field update** (`code_status`→confirmed + real code), not a re-seed.
- **Schema consequence — canonical body identity keys on (code + source + version),
  NOT code alone.** SE's CO1 prepends "Beginning 180 days following the Rent
  Commencement Date" — not byte-identical to national CO1 (accepted under
  direction-not-source). Two canonical texts share one code.
  - **`source` (document-of-origin: national-template-drop | national-handbook |
    southeast-doc) is a DISTINCT field from `authority`.** Canonical-body key uses
    `source`; `authority` drives governance/approval mapping.
- **Flags carried:** CO-SE-BU3 approval flag set provisionally (opening covenant is a
  materially larger give; "should be rare" reads as an approval trigger). CO-SE-BU2/BU3
  both condition on Landlord delivery performance → **cross-clause dependency on
  Scheduled Delivery Date**, represented in `applies_when`, not prose.
- **ACTION — collision sweep:** before finalizing, check every other brace code for the
  same (one code, two canonical texts) split across national vs southeast.
- **Director question:** do BU2/BU3 have real Starbucks codes, and is the SE CO1
  variant sanctioned or a regional rewrite?

### D — Two provisional axes + director-question table

- **Two distinct fields:** `code_status` = "do we know this position's identity"
  (marks the docx when provisional). `rule_status` = "do we know how it behaves"
  (`confirmed | provisional-pending-director`; surfaces in audit record + blocked-on-
  Director query; **never marks the emitted body**). Separate rendering paths.
  This is what makes the SE-CO1 state representable: confirmed code, unconfirmed sanctioning.
- **`director_question` is a first-class table:** id, text, status, date-asked,
  date-answered, answer text. Positions carry an FK. One question blocks many positions
  across many clauses (premises measurement → Premises clause + Workletter scope);
  answering flips every dependent position in one update; the open set is Mike's
  meeting artifact.

### E — Approval-label lookup keyed by authority

- **`approval_label` lookup table keyed by `authority`.** Rows currently render
  "approval required"; real acronym(s) land as a one-/two-row update. Lets corporate
  vs regional labels diverge later without touching position rows.
- **Lookup drives LIVE projections only.** The **frozen LRM resolves the label at
  freeze time and stores the resolved string** on the frozen record — a frozen audit
  artifact must not silently change wording later. Same principle as version-pinning.

### F — Exit strategy is derived; ETR is never in Position 1

- **ETR (early termination right) is NEVER in Position 1.** Seeded as a **Bucket 3
  standing default**: ETR omitted, `authority = self-authored`, rationale recorded.
  Handbook's director/VP/Real Estate Committee trigger recorded as a **standing
  acknowledged deviation**, not a per-deal firing.
- **Schema addition — `firing_mode`** on deviation/approval flags:
  `per-deal` (fires fresh each deal) | `standing-acknowledged` (owned once-decided
  deviation; renders in the audit record as a standing decision, not a fresh alert).
  A flag that fires 100% of the time is noise. Distinct from `rule_status` — firing
  mode is *how a confirmed flag presents*, not whether it's confirmed.
- **Exit strategy = derived cross-clause status**, computed from
  {A&S unmodified + Use=U0, ETR presence (always absent), CO rung}. Consumer of the
  cross-clause `applies_when` machinery.
  - Strategy (2) ETR permanently unavailable → coverage rests on (1) unmodified A&S
    with Use={U0} and (3) no minimum-operations requirement.
  - **CO ladder is load-bearing:** CO1 / CO-SE-BU2 / CO-SE-BU3 each impose an
    opening/min-ops covenant → each eliminates strategy (3), collapsing coverage to
    (1) A&S alone.
  - **Selection-time warning in OVIS:** choosing any CO rung below CO0 warns that
    exit-strategy coverage drops to A&S alone. (Fires in OVIS, per B guardrail invariant.)
- **`exit_strategy_threshold`** = named, versioned config value with
  `rule_status = provisional`. Not a magic number in code.
- **Director question:** with no ETR in play, is exit strategy satisfied by A&S alone,
  or must A&S and no-minimum-operations both hold? (LRM's "2 of 3" likely just
  reflected (1) and (3) both holding once (2) was off the table.)

### G — Custom clause catalog: Georgia scope, deal-type scope only

**ATTRIBUTION CORRECTION (tranche 3): Bucket 1 (custom-owned / self-authored) is EMPTY for the
end-cap drive-thru deal type.** The earlier list below was based on reading Powder Springs' *filled*
Broker's Commission clause as Mike-authored — it wasn't; that was a completed blank. All seven
"custom" clauses trace back to Starbucks source, so every clause now has a Starbucks baseline to
diff against (nothing renders un-diffable). Corrected attribution:
- **Broker's Commission** — Starbucks clause with a payee blank ("pay a brokerage commission to
  ______"); Powder Springs filled it with Oculus. Seeded `standing-default`, `national-handbook`,
  payee as a `fill` param. The clause is Starbucks'; only the fill value is Mike's.
- **Future Construction, Sale of Property** — verbatim in the Southeast doc → `southeast-doc` /
  `southeast-regional`. Southeast-only additions, no national counterpart, but Starbucks-sourced.
- **Audit Right, Title Contingency, Recorded Documents** — in the July 2025 ECDT template only →
  **`source = national-template-ecdt`** (new value; a distinct Starbucks doc from the national drop,
  so provenance and the collision guard stay honest across the transition).

**Seeded in tranche 4:**
- **Other Contingency** — the optional wizard-offered clause: `standing-default`, `is_default=false`,
  gated by opt-in `applies_when deal_field include_other_contingency=true`, body = single
  `fill:other_contingency_text` (the whole deal-specific text). Heading is a deliberate blank in
  every source; nothing fabricated.
- **Third-Party Use and Development Approvals** — source-checked: Starbucks language in the July ECDT
  and the Freestanding 10-yr NN template, absent from the national drop → `national-template-ecdt`.
  The ECDT "consents [from ___]" phrase (which the Freestanding version omits) seeded as a `fill`.
  Bucket 1 stays empty.

**ROFO: dropped** (Florida-only). Not catalogued, not scope-gated. Returns as a fresh
seed if GA ever needs it — no dead Florida-only rows.

**Scope axis:** **deal-type scope only** for now (end-cap drive-thru) — load-bearing
for Bucket 3 defaults and the wizard's preload-vs-prompt logic. Geography/jurisdiction
scope **deferred** until real multi-state content exists (nullable column later, not a
migration risk).

---

## Open items pending the Southeast Director (build provisional; flip by field update)

1. CO ladder — real codes for BU2/BU3; is SE CO1 sanctioned or a regional rewrite? (C)
2. The five director questions (D): premises measurement, A&S ("secondarily liable
   unless released"), continuous-operation back-up, delivery-date delays, permit contingency.
3. Exit strategy threshold — A&S alone vs A&S + no-min-ops, with ETR off the table. (F)
4. Real Starbucks acronym(s) for the approval label. (E)

## Standing action items

- **Reproduce Powder Springs Rd v1 LOI** (incl. Word comments + Workletter scope matrix)
  from a wizard run — the acceptance test.
- **Emitted output must contain ZERO residual template constructs. Three assertions:**
  1. Zero `[...]` square-bracket instructions/fills.
  2. Zero `{...}` curly constructs of ANY kind — `{CODE}` markers **and** curly-brace non-code forms
     like `{Choose: Building or Shopping Center}` (tranche 2, Ongoing Co-Tenancy). This form is
     neither `[...]` nor a `{CODE}` pattern, so it needs its own assertion. **Sweep the drop for
     other curly-brace constructs before Powder Springs runs.**
  3. Zero leftover underscore-blank runs (`____`) — every template blank is a tokenized `fill`, so an
     un-filled blank means an unresolved parameter.
  Any residual → **fail assembly, do not ship.** (Real justification: the Powder Springs LOI shipped
  with an unresolved `[Property/Shopping Center]` — the exact leak this exists to prevent.)
- **Approval firing modes render distinctly in the audit:** `per-deal` (fires on selecting this
  position — coded fallback rungs), `standing-acknowledged` (a once-decided owned deviation, e.g. ETR
  omission), and **`on-deviation`** (fires only if a standing default is emitted MODIFIED — e.g.
  Hazardous Materials, which has no fallback). `on-deviation` combines with word-for-word-vs-modified
  so approval is flagged only when the position actually deviates.

## Pass-one build contract

- **Migrations:** SQL files matching the existing `supabase/migrations` convention,
  targeting a **sandbox/branch DB**. Nothing near prod until the Powder Springs
  acceptance test passes.
- **Pass-one tables only:** `clause`, `variant`, `position`, `canonical_body`,
  `director_question`, `approval_label`, `config`. Phase-2 event tables and the
  OVIS↔service payload contract are held for pass two.
- **Collision sweep is a DB-ENFORCED CONSTRAINT, not a to-do.** Canonical body keys on
  `(code + source + version)`; assert **uniqueness on that tuple** so a second distinct
  CO1 body under the same source+version FAILS at load time rather than silently
  overwriting. This catches the national-vs-Southeast CO1 class of problem at load, not audit.
- **Clause library handoff = JSON seed files.** Not CSV — canonical body text carries
  brace codes, square brackets, and internal line structure CSV quoting mangles;
  byte-fidelity is the entire basis of word-for-word-vs-modified; records nest
  (positions under variants, modifiers carrying `applies_when`); `applies_when` is
  structured, not scalar. Mike extracts the real 39 records against the schema; Claude
  does not populate directly and does not invent bodies.
- **Deliverable owed once schema exists:** a **sample seed file for one clause**, fully
  populated with dummy content, showing every field, every enum value, every nesting
  level, and an `applies_when` example with a cross-clause reference. Mike extracts the
  real records against that shape.

---

## Proof-of-shape revisions (migrations _v2 + _selector_domain_versioning)

A proof-of-shape pass on Exclusive Use + CAM against the national drop (LOI_US__2_.docx)
and Powder Springs surfaced four things the first schema couldn't hold:

1. **One brace code emits at multiple insertion points with different bodies (intra-source).**
   `{NNN}` appears twice in the national drop (CAM-section body vs Premises-area parcel add-on),
   both legitimate. Fix: `loi_canonical_body` gains **`segment_key`** as a 4th key component
   (`UNIQUE(brace_code, source, version, segment_key)` — collision guard now per-segment); a
   position carries **one-to-many bodies** via the new **`loi_position_body`** join (replaces the
   single `position.canonical_body_id`). Audit reports "NNN word-for-word" iff all segments match.
2. **Chained modifiers (EU2 requires EU1).** applies_when gains **`position_selection`** ref_kind
   + `ref_brace_code`; EU2's condition = position_selection on (exclusive_use, EU1). OVIS enforces
   "can't select EU2 without EU1" at selection time.
3. **EU definitions defect** (gourmet/brand-identified used by EU1, defined in the EU2 bracket) —
   handled by #1: EU1 carries the definitions as a second body segment. Flagged in `internal_note`
   for the Director.
4. **CAM0/CAM1/NNN are building-type-selected, not a rank ladder.** New
   **`position_kind = 'conditional_alternative'`**: rank NULL, mutually exclusive, selected by a
   **typed enumerated selector** (`loi_variant.selector_field` + `loi_position.selector_value` +
   `loi_selector_domain`). Exclusivity = partial unique index; **exhaustiveness = deferred
   constraint trigger** (exact partition of the domain, enforced at LOAD, not assembly). Resolver
   **hard-errors on zero match** (never silent no-emit — CAM always renders something). Plus
   `loi_variant.replaces_base` for the Southeast "replace in entirety" instruction.

**Selector-domain versioning + staleness.** Domain changes are **versioned, never in-place edits**
(`loi_selector.current_version` + `loi_selector_domain.version`; PK `(selector_field, version, value)`).
Each variant **pins** the version it partitioned against (`loi_variant.selector_version`); write-time
validates against the pinned version. A domain bump leaves existing variants **stale, never silently
backfilled**; staleness is a queryable **work list** (`loi_stale_selector_variant` view) and is a
**hard error at BOTH assembly and the LRM freeze** (a frozen audit artifact on a stale partition is
worse than a stale draft). Pre-seed the domain is free to correct as v1 (nothing pins it yet).

## CAM resolved + deal-type-restricted subdomain (migration _variant_selector_subdomain)

**CAM's axis is LEASE STRUCTURE, not building type** (resolved by Mike from practice). A derived
composite selector **`cam_basis`** partitions: `nn_multi_tenant → CAM0`, `nn_single_tenant_building →
CAM1`, `nnn → NNN`. NNN is not a peer of CAM0/CAM1 — it substitutes for the whole clause. `cam_basis`
is derived from two deal facts the wizard already needs: `lease_structure` (nn/nnn) + `building_type`
(multi/single-tenant). The template's "FALLBACK FOR SINGLE TENANT…" label describes which deals are
typically NNN; it is NOT the selection rule (that was the apparent-overlap source). **End-cap
drive-thru is ALWAYS `nn_multi_tenant → CAM0`** (never NNN).

**Deal-type-restricted subdomain** (`loi_variant_selector_value`): a selector-bearing variant may
declare a **subdomain** — the subset of its selector's domain reachable for that variant's deal type
— and exhaustiveness is checked against the subdomain, not the full domain. So the **ECDT CAM variant
declares subdomain `{nn_multi_tenant}` and is valid with just CAM0**; CAM1/NNN belong to the
freestanding variant and are not forced in. Variants with no declared subdomain still require
full-domain coverage (`rent_structure`, `landlord_work_structure` unchanged). Seed field:
`selector_subdomain: [...]` on the variant. The empty provisional **`building_type` selector is
retired**; `building_type` remains a deal FIELD feeding the `cam_basis` derivation.

## Economic terms as concessions + rent as computed data (BUILT — migration _economic_terms_negotiable_item)

**Rent is structured deal terms; the schedule, commission, and pipeline value are DERIVED. No
rendered rent row is ever the source of truth** — if a value is only recoverable by reading the
emitted document, it's stored wrong. The deal record holds base rent, escalation rate, escalation
period, measurement basis, and term length; everything else recomputes from those. R0/R1 is "which
schedule **shape** to render," not a column threaded through tab stops.

**Rent engine (OVIS-side; assembler does zero math), built BIDIRECTIONAL:**
- Forward: terms → computed schedule rows (Years / Monthly / Yearly / Per SF). Business rules:
  **freestanding (NN/NNN) escalates on annual rent; end-cap drive-thru escalates on rent per SF**
  (shown every period). Escalation pattern is a per-deal input, not a constant.
- **Rounding convention (LOCKED as an assertion, reproduces Powder Springs byte-exact):** escalations
  compound on **unrounded** $/SF (never re-escalate from a rounded value); displayed $/SF rounded 2dp
  for display only; **Yearly = unrounded $/SF × sqft, rounded to cents**; Monthly = Yearly ÷ 12,
  rounded to cents. (Using the rounded $/SF diverges — e.g. period 21-25: $185,267.21 correct vs
  $185,275.65 wrong, and it widens each period.) `rent_engine.py` asserts all 8 Powder Springs rows.
- **$/SF-drop rule — DEFERRED BY CHOICE (not building it).** Powder Springs carries $/SF through ALL
  periods, so it's not schedule-generation. Mike strips the Per Square Foot column **manually** when a
  deal is ready to execute — a one-time step at the end of the document lifecycle, outside LOI
  generation. **Rationale preserved (matters if ever automated):** the per-SF *basis* is stripped
  pre-execution so the executed lease can't recompute rent from a remeasured square footage — which
  is why the column exists in every LOI but must not survive into the lease. Deferred by choice, not
  an open question.
- **Schedule render shape (DECIDED + SPIKE VERIFIED — two shapes, tracking R0/R1):** the end-cap
  emission spike ran green — a computed Powder Springs 11×4 table created at the R1 insertion point in
  the real template matches the worked ECDT byte-for-byte (cells, dims, col widths, "Normal Table"
  style, no borders, inherited fonts, placement, surrounding styles). Full render contract in
  `docs/LOI_RENT_TABLE_RENDER_CONTRACT.md`. Inspected all four docs. End-cap
  drive-thru → emit a **real Word table, 11×4**, matching the two worked ECDT deals (Powder Springs
  and worked ECDT carry the identical 11×4 rent block: headers Years / Monthly / Yearly / Per Square
  Foot, base-term rows, a blank spacer row, an "Extension Options:" label row, then the option
  periods). The blank template has **zero tables**, so this is **table CREATION at a known insertion
  point, not editing** — preserve surrounding paragraph styles; the created table's borders, fonts,
  and column widths must match the worked ECDT output. Freestanding renders differently (worked
  Freestanding has no rent table) — **do NOT generalize**; freestanding gets its own shape decision
  when that deal type comes into scope. Spike is scoped to **end-cap only**.
- Backward (landlord counters): a landlord's counter arrives as a fully rewritten table (output, not
  input) → **fit terms to their rows**. Three outcomes: **clean fit** → record as term deltas
  ("escalation 10%/5yr → 8%/5yr", not a cell diff); **fit-with-exceptions** → report exactly which
  periods deviate and by how much (usually the landlord's arithmetic error — the highest-value
  automation); **no regular fit** → irregular by intent, require Mike to confirm, store explicit
  periods. Distinguishing exception-from-error vs irregular-by-intent is the core requirement.
  Fitting is deterministic OVIS arithmetic; only extracting the table from the redlined .docx is an
  LLM step. **Rounding convention (round $/SF before or after ×sqft, and precision) must match Mike's
  Excel exactly** — discovered by reproducing Powder Springs, not assumed.
- **Commission engine** derives from the schedule and is built ONCE for two consumers (LOI tool +
  deal module) — designed for both up front so the commission agreement and LOI can't drift.

**Economic terms as trackable concessions (the Phase-2 gating decision):**
- **`loi_economic_term` catalog** (pass-one analog of the clause library): the negotiable economic
  parameters — base_rent, escalation_rate, escalation_period, measurement_basis (derived from deal
  type), term_length, ti_allowance — each with **`value_type`, `unit`, `direction_of_favor`**
  (e.g. lower escalation favors tenant, higher TI favors tenant) so a change reads as a *concession*,
  not just a delta, and **`is_derived`** (measurement_basis, schedule/commission/pipeline are derived
  outputs, never negotiated directly).
- **Unified negotiable item** — a Phase-2 event targets a `loi_negotiable_item` that is *either* a
  clause-position instance *or* an economic-term instance, so the LRM's `provision | status |
  deviation` columns render language and economics uniformly.
- **Opening value captured at Phase-1 assembly for EVERY negotiable item** (language and economic) —
  the LRM's "opened at X, closed at Y" cannot be reconstructed after the fact.

**Ownership rule — a negotiated value has exactly ONE home (resolves the concession-param vs
economic-term conflict; must hold before events FK to negotiable items):**
- **`loi_economic_term`** owns structured, **computation-driving** unit values (base_rent, escalation
  rate/period, term_length, TI, extension options) — never inline body fills.
- **`loi_body_parameter` (kind='concession')** owns **inline document concessions** that do NOT drive
  computation (Rent Commencement 120→90, cure days).
- **`loi_negotiable_item` has three kinds** — `clause_position`, `economic_term`, `body_parameter` —
  so every concession surfaces in the LRM exactly once (no double-count, none missed).
- **`is_derived` terms never become negotiable items** (measurement_basis is derived from deal type,
  not countered).

**direction_of_favor (reviewed):** base_rent / escalation_rate = lower-favors-tenant; ti_allowance /
escalation_period = higher-favors-tenant (longer interval = fewer escalations); **term_length =
lower-favors-tenant** (ETR omitted → thin exit optionality → longer base term is worse for Starbucks);
**extension_option_count / _length = higher-favors-tenant** (added — heavily negotiated, strongly
tenant-favorable; Powder Springs has six unconditional 5-yr options); measurement_basis = neutral +
is_derived.

**RESOLVED: CAM0 cap = 3% Oculus standing default.** Oculus always opens at 3%; national 5% is the
fallback. `cam0_cap_pct` concession param re-keyed to **preferred 3% / fallback 5%** (lower favors
tenant), recorded as a **Bucket 3 standing default** (Mike's standing position, not per-deal). Powder
Springs at 3% is therefore CAM0 at the standing default — NOT a per-deal tightening (so CAM0 emits
word-for-word against the standing baseline, not modified).

## FALLBACK/IF/CHOOSE/OPTION sweep decisions (migration _body_parameters)

A full sweep of the national drop's conditional markers found the schema needed more than one
selector and one new pattern:

- **Multiple selectors, not one.** `rent_structure` (R0/R1) and `landlord_work_structure`
  (LCW0/LCW1/LCW2) are `conditional_alternative` partitions — **re-keyed off rank** (they're
  structure switches, not concession ladders; LCW2 is labelled "ALTERNATIVE", not "FALLBACK").
- **`building_type` is PROVISIONAL/UNRESOLVED.** As drafted it cannot partition (CAM1 = single-tenant
  building; NNN = single-tenant building *or* parcel → overlap the exclusivity index correctly
  rejects). The real axis reads as **net vs triple-net lease structure**, not building shape. Domain
  removed from migrations (now seed-managed, empty pending the Director). CAM is not seeded until
  answered. Director Q: *is CAM1-vs-NNN driven by building type or net-vs-triple-net, and can a
  single-tenant building take NNN?*
- **`premises_type` is a SEPARATE selector.** The Premises `[CHOOSE: in-line / end-cap / multi-tenant
  pad / single-tenant pad]` values are physical configuration — never merged with the CAM structure
  axis. Director Q: *reconcile into one selector or keep two?*
- **`landlord_posture` is NOT a selector.** L1 / SIGN1 / TI2 aren't mutually exclusive and span
  different clauses → independent **`applies_when` `deal_field` predicates**, not a partition.
- **Selector domains are SEED-MANAGED data** (loader upserts `loi_selector` + `loi_selector_domain`),
  versioned and confirmed during extraction — not hardcoded in migrations.
- **Inline fallback parameters → `loi_body_parameter`.** A preferred + fallback value inside one body
  (Rent Commencement "120 [Fallback: 90]") is a parameter, not a position: a `{{param:key}}` token in
  `body_text` + a `loi_body_parameter` row (preferred_value / fallback_value / unit). Audit compares
  the chosen value to preferred → "120, unchanged" vs "conceded 120→90".
- **A modifier's valid target positions = OR-grouped `position_selection` `applies_when` rows** (sign
  program ridable on SIGN0 **or** SIGN1). No new field. If the modifier's *text* differs by target,
  split into separate modifiers. 
- **L1 no-brace anomaly:** `brace_code='L1'`, `code_status='provisional'`, anomaly in
  `provisional_note`. Director Q: *template defect or intentional out-of-convention code?*

## Canonical body vs emitted text + param kinds (migration _param_kinds_and_brace_relax)

- **Brace codes are NEVER emitted.** The `{CODE}` marker is a separate run in the source (verified:
  EXCLUSIVE USE run 0 = `EXCLUSIVE USE:`, run 1 = `\t[{EU0}]`, body runs after). So
  **`canonical_body.body_text` stores CLEAN emitted text only**; the code lives in `brace_code`; the
  assembler strips the marker run. Word-for-word-vs-modified computes against clean text (else every
  position would always read "modified"). Data rule — no schema change.
- **Four bracket types, two needed schema:**
  - `[{EU0}]` code marker → stripped.
  - `[Fallback: 90]` concession → `loi_body_parameter` `param_kind='concession'` (preferred+fallback).
  - `[Property/Shopping Center]` **choose-one fill** → `param_kind='choose_one'` + `loi_body_parameter_option`
    (enumerated options, `is_free_fill` for a `___` blank), resolved to exactly one value; **no**
    preferred/fallback (a deal fact, not a concession). Load-time: choose_one ≥2 options, concession 0
    (deferred constraint trigger).
  - **plain per-deal free-fill** (premises dimensions `___ x ___`, sqft, address) → `param_kind='fill'`
    (added in _param_kind_fill after tranche 1): no preferred/fallback, no options — a labeled blank.
    Every template underscore run is tokenized as a `fill` so the acceptance test can assert **zero
    leftover blanks** alongside zero brackets/codes.
  - `[OPTIONAL: <phrase>]` inline optional phrase → a `choose_one` with an explicit **omit option**
    (`is_omit=true`, no value) — distinguishable from a forgotten value. One omit per param.
- **Attachment requirements** (migration _omit_option_and_attachments): stripped `[ATTACH …]`
  instructions (U1 exclusives list, OS0 site plan) are obligations, not document text →
  `loi_attachment_requirement` (position-level) + `loi_attachment_task` view, surfaced as wizard
  tasks raised by selecting the position. Seed field: `attachment_requirements[]` on the position.
- **Loader/validator:** `supabase/seeds/loi/load_seed.py` validates a tranche against these rules
  (ref resolution, enums, kind/brace shape, partition exhaustiveness, stray `{...}`/`[...]`, and
  **token↔param cross-validation both directions** — a `{{param:key}}` with no declared param would
  emit raw into a landlord doc; a declared param with no token is orphaned) before emitting ordered
  INSERT SQL — catches extraction errors by name, not as raw constraint violations.
  - `[FOR DRIVE-THROUGH…, ADD:]` **instructional gate** → **`applies_when` at extraction** (the gate is
    a condition, not prose; the instruction text is never stored as emittable body). The gated content
    is a position carrying the predicate.
- **Brace-guard relaxed** to house uncoded gated add-ons: `brace_code` **required** for
  `alternative`/`conditional_alternative` under `coded-position` (the "AS1 word-for-word" items),
  **optional** for `modifier` (coded like EU1 or uncoded boilerplate), **forbidden** for `custom-owned`.
  Uncoded add-ons stay `coded-position` clauses (they're Starbucks template language — `custom-owned`
  would misattribute authorship; `standing-default` would misstate why they emit). Two guards:
  - **Audit identity (Guard 1):** uncoded add-ons still appear in the LRM, identified by
    **clause + `segment_key`** (no brace code) — e.g. "Premises drive-through add-on, word-for-word."
    Extraction convention: give uncoded add-on bodies a **descriptive `segment_key`** (not `main`).
  - **Visibility (Guard 2):** `loi_uncoded_modifier` view lists every uncoded template add-on
    (brace-null modifiers, excluding `custom-owned`) — countable/reviewable so the set never becomes
    a silent dumping ground.

## Assembler & document skeleton (LOCKED requirements — build later, per §9 step 2/3)

**Assembler = in-place surgery on the real template .docx, never generate-from-scratch.** Output must
be visually indistinguishable from the Starbucks template — it *is* the template with clause text
substituted. Verified structure of LOI_US__2_.docx: zero tables, zero list numbering, six named
styles (BodyText, BodyText2, BodyTextIndent, Heading3, Normal11pt, Title), 166 tabs carrying a
label-then-body layout. Requirements:
- Preserve each paragraph's **style, run properties, and tab structure** when substituting — the
  `PREMISES:` label run and its tab survive intact; only the body run content changes.
- Leave **header, footer, footnotes, theme, fontTable** untouched.
- **No markdown intermediate, no docx-generation library** rebuilding the document. Real Word comments.
- **Formatting acceptance test:** assemble Powder Springs, then diff the emitted docx against the
  source template — the *only* differences may be substituted clause text and per-deal fills. Any
  style/spacing/tab-stop difference is a bug.

**Document skeleton is stored in the tool, versioned, not uploaded per deal.** Normal LOI flow = Mike
picks a deal type; the wizard resolves against the **current skeleton version** for that type — no file
handling. **Template ingestion is a separate admin path**, used only on a new Starbucks drop: load the
.docx, store as a new skeleton version, reconcile against the clause library, and flag any brace code
that appears / disappears / changes body text vs the prior version. **Old skeleton versions stay
immutable** so in-flight deals keep assembling reproducibly (ties to the triple version-pin in B).

## Completeness gap + permanent completeness test (HALT before assembler/Phase-2)

A full sweep of all 236 template paragraphs found a systematic **add-on-layer gap**: of 117 body
paragraphs, 54 were extracted and 63 not — **30 emittable paragraphs missing or misattributed**. Root
cause: the original extraction matched headings with a "paragraph starts with HEADING:" test, but 19
paragraphs carry their heading at a non-zero offset behind a bracketed instruction, and the
conditional ADD add-on paragraphs between clauses were never enumerated. The clause **spine is
correct and every structural shape is validated** — what's missing is the add-on layer (Trash base
clause para 148, four Exclusive Use add-ons incl. the violation remedy, Premises replat, three
Pro-Rata Share segments, two Landlord Work add-ons, three Signage add-ons, Parking exclusive spaces;
Audit Right is in the 2026 drop at para 212, misattributed). Two (Premises replat, Parking exclusive
spaces) were used in a real deal (Douglasville) — practical proof the gap matters.

**DECISION: no assembler, no Phase-2 on the current library. Tranche 6 re-extraction first.**

**Permanent completeness test** (`supabase/seeds/loi/completeness_test.py`): assign EVERY template
paragraph to exactly one category — `primary_position` / `add_on_modifier` / `instruction` /
`letter_shell` / `blocked` / `empty`. Anything unassigned is a gap BY CONSTRUCTION. The harness
asserts (1) all 236 paragraphs assigned once, (2) content refs (clause_key/brace_code) exist in the
tranches; re-runnable against any future template drop (also part of the template-transition guard).
Tranche 6 supplies the authoritative manifest (`--draft` emits a starting point). Corroborated the
gap: the rough draft fails with 83 unclassified paragraphs.

**Letter shell** (paras 0/8/9/11/13/15: title, `<Insert Name>`, `<Insert Address>`, `RE:`,
salutation, opening paragraph) — not clauses, but the assembler can't emit a document without them.
Modeled as **deal fields feeding a fixed frame** (answers the payload-contract top-block question).
Must exist before the Powder Springs acceptance test can run end-to-end.

## Clause supersession + loi_clause_exclusion (SCOPED — build after tranche 6)

**Standing decision: Transfer of the Property SUPERSEDES Sale of Property.** Verbatim comparison —
Transfer (2026 national para 196, national-template-drop) is strictly stronger than Sale (Southeast
para 301): later trigger (Rent Commencement follows delivery+acceptance), three conditions vs two, a
30-day tail Sale lacks, and broader conduct ("sell, transfer, or assign the property" vs "transfer
its interest in this lease"). **Carrying both is a liability, not extra coverage** — two clauses
governing the same conduct under different triggers hands landlord's counsel a conflict to argue.
Powder Springs contains both; treat as a historical artifact, not a pattern.

**Required end-state (executed with the loi_clause_exclusion build, post-tranche-6; assembler is
halted so no interim harm):**
- `transfer_of_property` stays the active standing default (already loaded, tranche 2).
- `sale_of_property` → **de-activated**: no emitting position; its canonical body **retained as an
  orphan** for provenance + Phase-2 redline matching (Phase 2 must recognize it if a landlord proposes
  it); `deviation_rationale` = "superseded by Transfer of the Property." **Not** in freestanding either
  — the supersession is deal-type independent.

**Modeling gap: clause-level mutual exclusion has no representation.** The schema expresses
"modifier requires position" (`position_selection`) and "alternatives mutually exclusive within a
variant" (rank / selector partition), but NOT "these two separate clauses are substitutes and must
not both emit." Nothing stops a future deal selecting both Transfer and Sale — exactly what Powder
Springs did.

**Scope `loi_clause_exclusion`:** clause A excludes clause B, with a **reason** and a **direction**
(which supersedes which), **enforced at assembly**. Known/candidate members:
- `transfer_of_property` ⊃ `sale_of_property` (confirmed).
- **ROFR vs ROFO** — Southeast doc carries both a Right of First Refusal (para 294) and a Continuing
  Right of First Offer (para 298); likely alternatives, not companions. **Verify during tranche 6.**

**Do NOT build until the tranche-6 completeness re-extraction is done** — that sweep may surface more
exclusion pairs. Recorded now so it isn't discovered during assembly.

## Payload contract (proposed — pending confirmation, on hold until after tranche 6)

Self-contained, text-in, triple-version-pinned, persisted verbatim as the operation log. Proposed
decisions: (A) tokens stay in body_text + explicit param values ride alongside, assembler fills them
mechanically; (B) skeleton mapping by the template's own `[{CODE}]` markers / section headings / R1
instruction anchor; (C) assembler emits what's in the payload and strips everything else; (D)
`modified` is OVIS-computed metadata, `body_text` authoritative; (E) rent rows precomputed, assembler
renders the table with zero math. Confirm A–E when the library is complete.

## Validation status (pass one)

Schema applied to the throwaway `loi-tool-dev` Supabase project via `psql` (no Docker
locally; full-history-from-empty is impossible because base OVIS schema + real
`is_internal_user()` predate tracked migrations — a minimal dev-only bootstrap supplied
the two helper functions instead; see `supabase/dev-only/`).

**LIBRARY COMPLETE — 39 of 39 clauses loaded** (tranches 1–5). CAM = `cam_basis` selector, ECDT
variant subdomain `{nn_multi_tenant}` → CAM0 only, tax-protection modifier, CAM1/NNN bodies ready for
freestanding. Phase-2 foundation built (economic-term catalog + 3-kind negotiable item).

Constraint suite (new-work coverage): v6/v7/v8 green + the full 39-clause load validates every
constraint on real data. (v1–v5 are empty-schema unit tests that collide with the loaded library by
fixture key — a test-isolation artifact, not a regression.) Earlier snapshot, tranches 1–4:
**38 of 39 clauses**, 0 custom-owned, sources 51 national-drop / 5 ECDT / 2 southeast; 19 uncoded
standing-defaults, 3 uncoded add-ons, 2 attachment obligations, Hazmat `on-deviation`, Other
Contingency opt-in.
**Remaining: CAM** (blocked on `cam_selector_axis`), **R0/R1 + LCW** (assembler column-insert
contract), **Southeast CO back-ups**:
- Original 9 (still pass after v2/v3/v4): collision guard, immutability, modifier/alternative
  shape ×3, no-coded-gaps ×2, duplicate rank, applies_when FK.
- v2 negatives (N1–N9): per-segment collision, exhaustiveness, out-of-domain, selector
  exclusivity, conds-without-selector, conditional shape ×2, position_selection FK-shape,
  selector-needs-version.
- v2 positives (P1–P4): multi-segment bodies, exact 3/3 partition, EU2→EU1 dependency,
  one position carrying two body segments.
- v3 (body parameters + multi-target modifier): valid preferred/fallback param, duplicate
  param_key rejected, preferred_value required, OR-grouped position_selection targets,
  building_type domain confirmed seed-managed (removed).
- v4 (param kinds + brace relaxation): uncoded modifier accepted, uncoded alternative still
  rejected, choose_one rejects preferred_value, concession valid, choose_one needs ≥2 options,
  concession rejects options.
- v5 (uncoded-modifier visibility): loi_uncoded_modifier surfaces the add-on by clause+segment
  and excludes custom-owned.
- v6 (param_kind 'fill'): valid free-fill accepted, fill rejects preferred_value, fill rejects options.
- v7 (omit option + attachments): omit rejects a value, valid omit accepted, single omit enforced,
  attachment requires text, attachment surfaces in loi_attachment_task.

**RLS is NOT validated** — `is_internal_user()` was stubbed to `true` for the runs;
row-level access behavior is unverified until tested against the real helper.

Next: Mike extracts the 39 clause records as JSON against `supabase/seeds/loi/_SAMPLE_clause.json`.

## Build order (from briefing §9)

1. Clause library + custom catalog seeded into Supabase.
2. Wizard + deterministic assembly → clean v1 docx.  ← **value lands here**
3. Template-drop ingest/diff (next national drop ~3 months out; not needed to start).
4. Compare engine + response panel.
5. Event capture + audit-record (LRM) export.
6. Precedent retrieval (lightweight intent-matching AI layer).
