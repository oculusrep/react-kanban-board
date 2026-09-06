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

**Tranche 6 LOADED** (41 clauses; landlord_work deferred — its LCW base is blocked). Loader/validator
gained `_topup`/`_resource` (merge into an existing clause+variant) and `_blocked` (skip; deferred
base). Structural re-keys as a replayable migration (`_tranche6_restructure`): TR0/TR1/TR2
alternatives → modifiers riding the trash base (emit_order 10/20/30, is_default cleared),
`trash_recycling` re-bucketed coded-position → standing-default (uncoded base primary), Audit Right
re-sourced ecdt → national-template-drop (immutable body, so delete + reload). Claude's changes to
Mike's file: letter_shell 6 rank-0 alternatives → 1 position/6 segments; early_termination firing_mode
`standing` → `standing-acknowledged`; landlord_work marked `_blocked`. (Flagged: the tenants-in-common
modifier described for letter_shell wasn't in the file.)

**Auto-coverage after tranche 6** (proxy; definitive test needs Mike's sweep manifest): 9 uncovered
non-trivial paragraphs — 6 blocked (R0/R1 + LCW), **3 candidate gaps: contaminated-sites hazmat gate
(para 162), and the CLOSING/signature frame (paras 226/229 — "Store Development Manager", "Accepted
and agreed…") which the opening-only letter shell doesn't cover.** Next: Mike's authoritative sweep
manifest → commit as the permanent completeness test; check the 3 candidates.

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

**COMPLETENESS TEST COMMITTED against the authoritative sweep manifest (2026-09-01).**
`LOI_sweep_manifest.json` is Mike's 236-paragraph sweep: a dict `{template, template_paragraphs,
assignments}` where `assignments` is keyed by paragraph index → `{category, clause, note, text_head}`.
Categories are `primary` / `addon` / `instruction` / `letter_shell` / `blocked` / `empty` (NOT the
earlier `primary_position`/`add_on_modifier` guess). `completeness_test.py` was adapted to that schema
and asserts Mike's three rules: (1) every paragraph 0..N-1 carries a valid category; (2) every
`primary`/`addon` maps to a LOADED canonical body — **clause-level** (the manifest carries only
`clause`, no brace_code/segment_key, so the finest achievable check is "the clause is loaded and has
≥1 canonical body"); (3) nothing unassigned. A clause marked `_blocked` in the tranches
(`landlord_work`) is a tracked **DEFERRED** bucket — the two Landlord-Work add-on paras (114, 116) are
reported as deferred (visible, counted), not a silent pass or a false failure; they flip to covered
when LCW unblocks. Optional docx cross-check (auto-discovers `templates/*.docx`) asserts paragraph
count and per-paragraph `text_head` prefix — the **template-transition detector**. **Runs green: 236
assigned, histogram primary 49 / addon 27 / instruction 12 / letter_shell 16 / blocked 26 / empty 106;
74 content paragraphs covered, 2 deferred.**

**TRANCHE 7 LOADED (2026-09-01) — closes the last three coverage candidates.**
- **Closing frame** — always-emitting modifier on `letter_shell` (emit_order 100), three segments in
  document order: closing statement, Starbucks signature block, Landlord signature block. The opening
  shell covered the top of the letter; this covers the bottom.
- **Tenants-in-common** modifier re-sent (lost in the tranche-6 patch). The patch had left an
  **orphan** `tenants_in_common` canonical body (old param `ls_open_blank_6`, no position referencing
  it; null brace_code means the collision guard does not catch a duplicate). Deleted the orphan (param
  cascades) and reloaded so the body is wired via its position with param `tic_point_of_contact`.
- **Contaminated sites (para 162)** — a body-less `modifier` on `hazardous_materials`: 0
  `position_bodies`, 3 `attachment_requirements`, `firing_mode: on-deviation`, approval-flagged, gated
  `applies_when deal_field site_potentially_contaminated = true`. **Confirmed loadable as-is** — no DB
  constraint forces a position to carry a body. It emits nothing; OVIS raises the three tasks.
- **Metadata fix to Mike's seed:** closing-frame modifier `is_default true → false`. A modifier can't
  be the variant default (that is the opening-frame alternative); `is_default: true` collided with
  `loi_position_default_uk` (`UNIQUE(variant_id) WHERE is_default`).

**CLOSING-STATEMENT L0/L1 GATE — resolved shape (para 218) for Mike to re-key.** The
`[DELETE PRECEDING SENTENCE IF NOT USING STARBUCKS STANDARD FORM LEASE]` instruction governs exactly
one mid-paragraph sentence: *"This LOI is subject to approval by Starbucks senior leadership, and
there may be significant delays between the date the letter of intent is signed and the date the first
draft of a lease is generated by Starbucks."* It drops when the landlord's form (**L1**) is used
instead of the Starbucks standard form (**L0**). Because `applies_when` is **position-level, not
segment-level**, the gate cannot ride a `position_body` — so the gated sentence must be **promoted to
its own modifier position** on `letter_shell`. Split the current single `closing_statement` body into
three canonical bodies: sentence-1 (always) + this gated sentence + the remaining sentences (always);
the two "always" fragments stay as segments on the always-emitting closing-frame position, the gated
fragment is its own modifier position carrying:
```json
"applies_when": [{
  "condition_group": 0,
  "ref_kind": "position_selection",
  "ref_clause_key": "lease",
  "ref_brace_code": "L0",
  "operator": "is_selected"
}]
```
`lease` L0 is the default alternative (rank 0), so the sentence emits by default and drops only when
L1 is explicitly selected — the correct DELETE-when-not-standard-form semantics. Chosen over an inline
`choose_one`-with-omit param because the L0/L1 dependency is a **cross-clause** condition, which the
locked design (§C/§F) requires to live in `applies_when`, not in OVIS-side param resolution.

**ARCHITECTURE RULE — same-paragraph fragment concatenation (Mike, accepted 2026-09-01).** When two
or more positions/segments compose ONE template paragraph (as the three closing-statement fragments
compose para 218), the assembler MUST concatenate them in document order into a single paragraph — NOT
emit them as separate paragraphs. This is a standing assembler architecture rule, not a one-off note:
gating a mid-paragraph fragment on `applies_when` (which is position-level) is the general mechanism,
so the assembler needs first-class support for "these positions belong to one paragraph, join them in
order." Emitting separate paragraphs would fail the formatting acceptance test. Mike owes the three
re-split closing-statement canonical bodies (blocked until he has the template in front of him again);
do not load the closing-statement split until they land.

**Signature block — RESOLVED (Mike, 2026-09-01); does NOT block the acceptance test.** There is no
Oculus standing default. `sig_tenant_title` is a **required deal-level parameter with NO default** —
the wizard asks on every deal. Two values, NEITHER a deviation (no approval trigger either way):
`Broker` → "Representative Name / Title: Broker" with the Store Development Manager cc'd; and
`Store Development Manager` → the template's own block. For the **Powder Springs acceptance test** the
value comes from the deal record (= `Broker`), supplied as a required param — not from a default.
- **Open modeling note for the re-key (flagged, Mike owns the body):** the current tranche-7 shape is a
  single `fill` on the title line. "Required param, two enumerated values" reads more like a
  `choose_one` (two options, no preferred/fallback) than a free `fill`. And the `Broker` rendering adds
  a **cc line** (SDM cc'd), which a title-line fill can't produce — if that cc is a separate line, the
  signature body needs a small conditional segment, not just a title string. The acceptance test needs
  the `Broker` rendering (cc included) to match Powder Springs, so this belongs in the owed body work.
  The stale note on `sig_tenant_title` ("confirm which form is the Oculus standing default") is now
  answered — left for Mike's re-send rather than patched under him.

**Manifest granularity — clause-level now, per-body upgrade PLANNED (Mike, 2026-09-01).** Rule 2
(every `primary`/`addon` maps to a loaded canonical body) is checked at **clause level** because the
manifest carries only `clause`. Mike will add `brace_code` (and `segment_key` where the paragraph maps
to one) to the `assignments` entries and re-send; then rule 2 tightens to "this EXACT body is loaded"
(catches a clause loaded with the wrong brace_code or a missing segment, which clause-level passes).
**Do NOT build the tightened rule yet** — Mike will flag when the re-send lands, at which point
`completeness_test.py` upgrades to per-body resolution against the tranches.

## Clause supersession + loi_clause_exclusion (BUILT — 2026-09-01)

**Standing decision: Transfer of the Property SUPERSEDES Sale of Property.** Verbatim comparison —
Transfer (2026 national para 196, national-template-drop) is strictly stronger than Sale (Southeast
para 301): later trigger (Rent Commencement follows delivery+acceptance), three conditions vs two, a
30-day tail Sale lacks, and broader conduct ("sell, transfer, or assign the property" vs "transfer
its interest in this lease"). **Carrying both is a liability, not extra coverage** — two clauses
governing the same conduct under different triggers hands landlord's counsel a conflict to argue.
Powder Springs contains both; treat as a historical artifact, not a pattern.

**Modeling gap now closed.** The schema expressed "modifier requires position" (`position_selection`)
and "alternatives mutually exclusive within a variant" (rank / selector partition), but NOT "these two
independently selectable things are substitutes and must not both emit."

### What shipped — `20260901120000_loi_tool_clause_exclusion.sql`

**`loi_clause_exclusion`** — a pairwise exclusion between two clauses OR two positions.
- Members are **homogeneous** (clause-vs-clause or position-vs-position, never mixed): the pylon pair
  is two *positions inside one clause*, so a clause-only table could not have expressed it. A mixed
  pair has no coherent meaning — "this clause excludes one position of itself" is an `applies_when`
  gate, not an exclusion. Typed nullable FK columns + a shape CHECK, the same pattern
  `loi_negotiable_item` uses; no polymorphic id, no JSONB.
- Direction rides the A/B ordering plus `exclusion_kind`:
  - `supersedes` — A wins; if both are selected, **B is dropped** deterministically.
  - `mutually-exclusive` — no winner; a **deal fact** decides, so the assembler **halts** and asks.
- Guards: no self-exclusion; **no reversed duplicate** — a unique index on
  `(LEAST(a,b), GREATEST(a,b))` stops `(A,B)` and `(B,A)` coexisting and silently disagreeing about
  the winner.

**`is_active` / `inactive_reason` on `loi_clause` AND `loi_position`** — retire content without
deleting it. Canonical bodies are immutable and must be **retained**: Phase 2 has to recognise a
superseded clause if a landlord proposes it. A CHECK forces a reason on every de-activation (audit
record, not a feature flag). Two levels because retirement happens at both — a whole clause, or one
position inside a live clause.

**Enforcement is at ASSEMBLY, not in a DB constraint** — the library is legal; a particular
*selection* is what can be illegal. `loi_exclusion_violations(uuid[])` takes the selected position
ids and returns each violated exclusion with `resolution` = `drop-b` (+ `drop_position_id`) or
`halt`. Clause-level exclusions resolve down to the exact positions in play, so the caller is never
told merely "some clause conflicts."

**`loi_selectable_position`** — the assembler's selectable set, applying BOTH levels of `is_active` in
one place so no caller re-derives that join. **Assembler contract: select from this view, never from
`loi_position` directly.**

### The two members (Mike, 2026-09-01 — TWO, not three)

1. **`transfer_supersedes_sale`** (clause, `supersedes`). `sale_of_property` **de-activated**: clause
   and its one position inactive, `deviation_rationale` = "Superseded by Transfer of the Property.",
   body retained as an orphan. Deal-type independent — not in freestanding either. Corroborated by the
   sweep manifest: para 196 is `transfer_of_property`; **`sale_of_property` has no manifest paragraph
   at all**, i.e. the national template carries TRANSFER only. Douglasville emits TRANSFER; Powder
   Springs emits SALE OF PROPERTY.
2. **`pylon_panel_existing_xor_new`** (position, `mutually-exclusive`). The two signage add-ons —
   "PANEL ON EXISTING pylon or monument" vs "PANEL ON to-be-constructed pylon or monument" — differ on
   who pays fabrication/installation, and the second adds a Landlord construction obligation. A pylon
   either exists or it doesn't. Both are uncoded modifiers riding `signage`, keyed by their bodies'
   `segment_key` (`panel_existing_pylon` / `panel_new_pylon`). Powder Springs used to-be-constructed.

### ROFR / ROFO — DROPPED, not built (Mike, 2026-09-01)

No exclusion exists between them. **ROFO appears nowhere** in the template or either send. **ROFR
appears only in Douglasville, sitting ADJACENT TO Transfer of the Property with BOTH emitted** — they
are companions, not alternatives. The earlier "likely alternatives, verify during tranche 6" guess is
withdrawn. Test P5 asserts exactly two exclusions exist, so this stays deliberate rather than drifting
back in.

**FLAGGED for the library (not this build): Douglasville's RIGHT OF FIRST REFUSAL is not in the
national template.** Bucket 1 (custom-owned) is supposed to be empty — every clause traces to a
Starbucks source. Either ROFR traces to the Southeast doc / handbook, or **Bucket 1 is not actually
empty**. Needs provenance before ROFR gets a clause key.

### Validation

`supabase/dev-only/loi_negative_tests_v9.sql` — **13/13 pass**. P1 transfer+sale → one `drop-b`
naming the sale position; P2 both pylon panels → `halt` with no drop target; P3 legal selection →
zero violations; P4 sale retired but body retained; P5 exactly two exclusions (ROFR/ROFO absent);
N1 mixed member kind; N2 one-sided pair; N3 self-exclusion; N4 reversed duplicate; N5/N6 de-activation
without a reason; P6/P7 well-formed pair + inactive clause hides its positions. Migration applied to
`loi-tool-dev` and **replayed clean** (second run: 0 inserts, 0 updates, load guard green).
`completeness_test.py` still PASSES unchanged (74 covered / 2 deferred).

## Tranche 8 — closing-frame restructure (LOADED 2026-09-05)

Tranche 8 supersedes the tranche-7 closing frame: template para 218 splits three ways (one fragment
gated on the Starbucks standard lease), and the tenant signature block becomes a three-way alternative
set. Mike flagged two decisions as Claude Code's. Both are answered here, plus a third the schema
forced.

### (a) Paragraph grouping — `template_paragraph` ACCEPTED as proposed

Mike's proposal (a nullable integer on the position) is the right mechanism and is built.

**Why a field is needed at all:** `applies_when` is position-level, so the one mid-paragraph sentence
governed by "[DELETE PRECEDING SENTENCE IF NOT USING STARBUCKS STANDARD FORM LEASE]" *has* to be its
own position. That leaves three positions composing one paragraph and nothing in the schema saying so.

**Why not emit_order adjacency** (Mike's own objection, and it is correct): adjacency is a derived
signal that silently breaks the first time a fourth fragment or a following block lands between them.
Grouping must be stated, not inferred.

**GROUPING RULE (assembler contract):** positions sharing a non-null `(clause_id, template_paragraph)`
are concatenated, in `emit_order`, into ONE emitted paragraph. A group of one emits normally. NULL
means "not paragraph-anchored" and never groups — not even with other NULLs.

**One wrinkle worth naming.** The field does two related jobs. For para 218 it *groups* three
fragments into one paragraph. For the signature blocks it *anchors* a block whose single body already
spans several template paragraphs (220–226; the breaks live inside `body_text`). Both reduce to the
same rule — an anchor is just a group of one — so one field covers both, and a second `paragraph_group`
field would be redundant. Flagged so the double duty is a decision rather than a surprise.

**Versioning:** the value is an index into the template version pinned in `loi_config`, taken straight
from the sweep manifest. A template transition renumbers it; `completeness_test.py` already detects
transitions, which is what makes it safe to key on.

### (b) SIG0/SIG1/SIG2 provisional brace codes — KEPT as minted

Three reasons:
1. **Precedent already exists.** `brace_code='L1'` is carried with `code_status='provisional'` for the
   same class of anomaly (a code out of convention with the template). This is what the `code_status`
   axis is for — identity we assert but have not confirmed against Starbucks.
2. **Without codes the three are indistinguishable.** All three bodies share `segment_key`
   `tenant_signature_block` and differ only by `source`. `loi_position_label()` falls back to
   `segment_key`, so all three would render as the same string in exclusion output, the audit record,
   and the wizard.
3. **The docx-marking objection is now covered.** The worry with a minted code is that the assembler's
   skeleton mapping has no `{SIG0}` marker to anchor to — but `template_paragraph` 220 supplies the
   anchor directly, so the code never has to carry that load.

`code_status='provisional'` + Mike's `provisional_note` keep the "we minted this" fact queryable, and
confirmation stays a field update rather than a re-seed.

### (c) SIG re-homed into its own clause — CLAUDE CODE CHANGE, forced by the schema

Tranche 8 encoded SIG0/1/2 as `position_kind='alternative'` riding `letter_shell` with `emit_order`,
`modifies_clause_id` and `selector_value` set. **That shape cannot load** — six separate violations:
- `loi_position_kind_shape` forbids an `alternative` carrying `emit_order`, `modifies_clause_id`, or
  `selector_value` (those three are the modifier / conditional-alternative axes).
- `loi_position_variant_rank_uk` — `letter_shell`'s variant already holds a rank-0 alternative (the
  six-segment letter frame), so SIG0 at rank 0 collides.
- `loi_position_default_uk` — that same letter frame already holds the variant's single `is_default`.

A ranked ladder needs its own variant; a variant is deal-type scoping and two variants with identical
`deal_type_scope` would be ambiguous at selection time. So the set needs its own clause:
**`tenant_signature_block`** (bucket `coded-position`, one variant, SIG0/1/2 at ranks 0/1/2, SIG0
default). Emission placement is preserved by `template_paragraph` 220, not by clause membership, which
is precisely what that field buys.

The considered alternative — keeping them on `letter_shell` as modifiers with mutually-exclusive
`applies_when` gates, the TR0/1/2 pattern from tranche 6 — was rejected: it enforces "exactly one" by
gate rather than by rank, and gives no default. Mike called this a three-way *alternative set*, and a
ranked ladder is the shape that actually means that.

Manifest note: paras 220–226 are categorised `letter_shell` in the sweep manifest. Category
`letter_shell` is not checked against loaded bodies, so the completeness test is unaffected — but the
`clause` field on those entries is now stale and should say `tenant_signature_block` in the re-send.

### Other changes made to Mike's tranche-8 file (all reported)

- **`authority` values.** `national-template-drop` (SIG0) is a *source*, not an authority; set to
  `national-handbook`. `oculus-practice` (SIG1/SIG2) is not in the authority CHECK; set to
  `self-authored`, which is the existing bucket for Oculus-originated governance. `source` still
  carries the real provenance, so nothing is lost.
- **Two new `source` values added** (migration): `completed-loi-powder-springs`,
  `completed-loi-douglasville`. An executed LOI is a genuine document-of-origin — it is how we know
  what Oculus actually sent, as against what the template drafts.
- **The re-referenced landlord body** is declared `_existing` so the loader resolves it by identity
  instead of re-inserting it (canonical bodies are immutable). New loader mechanism.
- **Loader gap closed:** it did not reject an `alternative` carrying `emit_order`, so tranche 8
  validated four of the six violations above and would have failed at the DB. Now caught up front.

### Validation

`supabase/dev-only/loi_negative_tests_v10.sql` — **8/8 pass**: para 218 is three positions at
emit_order 100/101/102 with exactly one gated; the gate is `lease`/`L0` `is_selected`; the tranche-7
frame and its two superseded bodies are gone (deleted, not orphaned); the landlord body survived with
exactly one body and one reference; the SIG ladder is three ranked alternatives over three distinct
sources with SIG0 default; **Powder Springs resolves to SIG1**. Negatives: a negative
`template_paragraph` and an `alternative` carrying `emit_order` are both rejected. v9 still 13/13;
`completeness_test.py` still green (74 covered / 2 deferred).

## Manifest patch v2 merged + rule 2 tightened (2026-09-06)

Mike's `LOI_manifest_patch_v2.json` MERGED onto the repo's `LOI_sweep_manifest.json` — merged, not
replaced. The patch deliberately omits `text_head` and `template_paragraphs`; retyping 236 `text_head`
values would risk the template-transition detector, which must stay byte-exact. Verified after the
merge: **0 `text_head` changed, 0 `category` changed**, 4 `clause` + 4 `note` changed (the repoint),
92 `bodies` arrays added, and no other key introduced anywhere.

**`bodies` is an ARRAY — accepted as sent, no re-key.** Seven paragraphs carry more than one canonical
body (15, 81, 218, 220, 223, 225, 226), so a scalar `brace_code` + `segment_key` pair would drop bodies
silently, which is the exact failure the tightened rule exists to catch. A one-element array is the
common case and costs nothing.

**Rule 2 semantics, as Mike specified:** the array is what MAY occupy the paragraph, not what a deal
selects. Alternatives (SIG0/1/2, EU1/EU2, L0/L1) are all listed; exactly one emits. The rule asserts
every listed body RESOLVES to a loaded canonical body — never that they all emit.

### Paras 69 / 71 / 73 — CONFIRMED, Mike's mapping is correct

He flagged that 69 and 73 were inferred from names and could be reversed. Read both `body_text` values
against the template rather than reasoning from the names:
- **69 → `force_majeure`** — template para 69 opens "In the event any Force Majeure Event, act by
  Landlord or act of any governmental authority…", matching the `force_majeure` body verbatim. It also
  defines the Alternative Rent Period term, which is what made the name ambiguous.
- **71 → `election_notice`** — "Tenant shall provide Landlord notice of its election…". Verbatim.
- **73 → `alternative_rent_period`** — "In the event the Alternative Rent Period continues for more
  than one hundred twenty (120) [Fallback: ninety (90)] days…", matching the `arp_days` body.

Not reversed. Verified by text, not by name.

### Rule 2 tightened — and a SECOND rule added, because rule 2 alone was weaker than it looked

`completeness_test.py` now resolves each `bodies` entry to an EXACT loaded body on
(clause_key, brace_code, segment_key). A null `clause_key` resolves against declared-but-unreachable
bodies (`CAM1`, `NNN`, and landlord_work's two add-ons — loaded, but no position reaches them). The
seed inventory now also honours a tranche's `_supersedes.canonical_bodies`, so a body a later tranche
DELETED can no longer satisfy a reference.

**Mutation-tested, and rule 2 failed two of three mutations.** Deliberately corrupting the merged
manifest:
| mutation | rule 2 alone | with rule 4 |
|---|---|---|
| swap paras 69 ↔ 73 (the reversal Mike feared) | PASSES | PASSES |
| repoint 81's EU1/main to EU0/main | PASSES | **FAILS** |
| drop 2 of para 218's 3 closing fragments | PASSES | **FAILS** |

Rule 2 only proves a listed body *exists*. A shorter array still resolves, and a sibling body of the
same clause resolves too. So **rule 4 — reverse coverage** was added: every loaded, position-reachable
body must be CLAIMED by at least one paragraph, with `_unjoined_bodies` (carried into the manifest from
the patch) as the documented allowlist. A stale allowlist entry — one that a paragraph later claims —
is also a failure.

**What neither rule can catch: a PERMUTATION.** Swapping two bodies of the same clause between two
paragraphs leaves every reference resolving and every body claimed. Only reading `body_text` against
the template settles it — which is why the 69/71/73 check had to be done by hand, and why Mike was
right to ask rather than let the rule "confirm" it.

Current run: 105 body references resolved across 92 paragraphs, 74/74 content paragraphs body-resolved,
87/94 loaded bodies claimed, 7 documented as unjoined, 2 deferred (114/116 on `landlord_work`).

### FIVE BODIES WITH NO TEMPLATE PARAGRAPH — Mike's finding, and it blocks nothing yet but the assembler

`future_construction/main`, `title_contingency/main`, `recorded_documents/main`,
`third_party_approvals/main`, `other_contingency/main` have no paragraph anywhere in
`LOI_US__7_30_2026_.docx`. They are not deferred, not retired, and not orphaned by a missing position —
the national template simply does not contain them. Payload contract B places content by template
marker, heading, the R1 anchor, or `template_paragraph`, and makes a missing anchor a HARD FAILURE. So
**the assembler as specified cannot emit these five.**

**Recommendation — a SECOND SKELETON, not a template re-ingest.** Re-ingesting cannot help: the four
Contingency Addendum clauses sit under a "STARBUCKS LETTER OF INTENT — CONTINGENCY ADDENDUM" heading
that follows the signature block in both completed LOIs, and that heading is not in the national
template because the addendum is not part of it. A newer Starbucks drop would not contain it either.
The addendum is a genuinely separate document section, so it should get its own versioned skeleton,
appended after the letter, with its own paragraph indices — which keeps B's hard-failure rule intact
rather than weakening it to tolerate anchorless content. `future_construction` is a different case: it
sits mid-letter in the Powder Springs send (between Construction Contingency and Initial Co-Tenancy),
so it needs a paragraph in the LETTER skeleton, not the addendum.

**OPEN — Mike owns the provenance, and it is the ROFR question again.** If these five trace to the
Southeast doc or the handbook, they are ordinary Starbucks-sourced clauses that the national template
happens to omit. If they are Oculus-authored, then **Bucket 1 is not empty** and the "every clause
traces to a Starbucks source" claim needs retiring. Same call outstanding for Douglasville's RIGHT OF
FIRST REFUSAL. Needed before the assembler is built, since the second-skeleton work depends on knowing
what the addendum actually is.

## Powder Springs acceptance test is GATED — and registering `rent` closed a live C failure (2026-09-06)

Mike asked whether regenerating Powder Springs today hits the deferred halt. It does, and checking
turned up something worse than the answer.

**Verified against `fixtures/1_SBUX LOI - Powder Springs Rd + EWC.docx`:**
- Table 0 is 11x4 with a **Per Square Foot** column → the deal needs **R1**, not R0.
- Para 49: "Landlord will, at its expense, perform the work described on the attached Landlord
  Workletter. Landlord will also provide Tenant an improvement allowance of $75,000" → **LCW0**.

Both are deferred, so a faithful run HALTS. **The acceptance test is gated on the rent-table
column-insert / allowance contract, not on the assembler.** The assembler can be built and unit-tested;
it just cannot be acceptance-tested end-to-end on Powder Springs until R0/R1 + LCW0/1/2 load.
`LOI_RESUME_HERE.md` said "nothing blocks it", which implied the test was reachable. Corrected.

**THE LIVE FAILURE.** The halt only worked for one of the two. `landlord_work` was registered as a
deferred clause; the RENT SCHEDULE was registered **nowhere** — there was no `rent` row in `loi_clause`
at all. The sweep manifest assigns paras 36–47 and 49–61 to clause `rent`, but nothing in the library
ever declared it, so `loi_deferred_clause` did not list it and OVIS could not halt on it. Under C the
assembler would have **stripped the entire rent schedule and shipped a clean-looking LOI with no rent
table** — precisely the "reaches a landlord looking clean" failure C was amended to prevent, one clause
away from being live.

Registered in migration `20260906140000`. **My earlier sequencing note was wrong**: I wrote that R0/R1
were "a position-level gap, register them with the column-insert contract." The halt has to exist
BEFORE the assembler, not alongside the work that lifts it. Registering costs nothing and is undone by
the same field update that will un-defer it. Test P3b asserts both gaps stay discoverable.

**Expected, explainable diff:** Powder Springs carries SALE OF PROPERTY at its own para 95. That clause
is `retired`, so it strips silently and correctly — a historical artifact, not a regression, and the
acceptance test should show it as a deliberate difference.

## cam_basis CLOSED — axis challenged, checked against source, confirmed as keyed (2026-09-06)

**No migration. Enum unchanged.** `nn_multi_tenant` / `nn_single_tenant_building` / `nnn` stay exactly
as loaded.

The axis was challenged on the Marietta pad: if CAM0 vs CAM1 turned on whether a shared denominator
exists, a single-tenant pad with no pool looked mis-keyed. Checked against the **Aug 2026 handbook**,
and the discriminator is **who maintains**, not whether a denominator exists:
- **CAM0** — all sites except single-tenant buildings.
- **CAM1** — single-tenant buildings, which **retain a pro-rata share by design**.
- **NNN** — only where Starbucks gets a rent reduction for self-maintaining the Parcel.

Mike confirmed the **Landlord** maintains the Marietta pad, so Marietta is **CAM0** — consistent with
it having been keyed CAM0 verbatim. The proposed `shared_cam_pool` / `sole_cam_burden` replacement axis
is **WITHDRAWN and must not be built.**

Recorded because the challenge was worth making and the answer is worth not re-deriving: a pro-rata
share surviving on a single-tenant building is not an anomaly, it is the CAM1 design.

## Freestanding — NNN drafting standards from the Aug 2026 handbook (2026-09-06)

These are **standards, not bodies.** The CAM1 / NNN body text still comes from the template; these
constrain what the assembled document may say and do:
1. **Never use "NNN" or "Triple Net" in LOI text.** (Testable — see below.)
2. **Starbucks cannot accept direct payment of Real Property Taxes.** Bills stay in Landlord's name;
   Starbucks reimburses.
3. **Starbucks cannot assign insurance proceeds.**
4. **Landlord keeps latent defects and reconstruction.**

**OWED (agreed with Mike, 2026-09-06): a forbidden-substring check for "NNN" and "Triple Net" in
emitted text.** Same shape as the existing "zero brackets, zero codes" acceptance rule. **Do not build
it until freestanding is scoped and there is a fixture to run it against** — a rule with no fixture is
unverified by construction, which is the lesson the rule-2 mutation test paid for. Recorded so it is
not rediscovered from the handbook a third time.

**Freestanding is down to two blockers:** (1) Contingency Addendum provenance, (2) the R0 annual
schedule shape, which rides the column-insert contract.

## LCW1 — CLOSED: key all three rungs (2026-09-06)

**Decision: the LCW ladder is THREE rungs. Key LCW0 / LCW1 / LCW2 when `landlord_work` is extracted.**

The Aug 2026 handbook deletes LCW1; the template still carries it. Two signals disagreed, so the
standing rule decides: **body text comes from the TEMPLATE.** The template carries all three.

### My "decisive test" was not decisive — the premise did not hold

I proposed checking whether the ≥$200,000 irrevocable-standby-letter-of-credit language survives in
the Aug 2026 handbook, reasoning that if it did, LCW1's substance had been relocated (deliberate
retirement), and if it had not, the deletion had also destroyed Starbucks' own protection on large
allowances (error in the drop).

Mike ran it. **The language is in the Aug 2026 handbook** — RENT / TIA section, with LC-required
thresholds, "LCs require Automatic Conditional Approval from RECOMM", Elements of a Conforming LC, LC
due at lease execution or 70 days before possession, and the escrow comparison table. **But it is in
the July 2025 handbook's RENT section identically.** It never lived only in LCW1, so finding it
elsewhere demonstrates nothing about relocation.

My error was narrow and worth naming: "LCW1's body is the only place in the TEMPLATE carrying that
language" is true, and I inferred from it that the handbook's copy must therefore have come from LCW1.
It did not — the handbook had its own copy all along, in both editions. **A uniqueness claim scoped to
one document does not survive being carried into another.**

**What the test did settle:** deleting LCW1 did not delete the protection. The "too substantive to
happen silently" argument is off the table.

**What it did not settle:** the structural hole is real. "Allowance, no work" has no rung in the Aug
2026 handbook — LCW0 requires work, LCW2 forbids both. The template partitions cleanly on what the
Landlord provides:

| Rung | Landlord Work | Allowance |
|---|---|---|
| **LCW0** | yes | yes — "IF LANDLORD IS PAYING ALLOWANCE **IN ADDITION TO** LANDLORD WORK" |
| **LCW1** | **no** | yes — "FALLBACK – IF LANDLORD IS PAYING ALLOWANCE **AS A SUBSTITUTE FOR** LANDLORD'S WORK" |
| **LCW2** | no | no — "ALTERNATIVE – IF LANDLORD IS DELIVERING PREMISES IN CURRENT CONDITION AND NOT PROVIDING WORK" |

### Owed at extraction — LCW1's `provisional_note`, verbatim

> Present in the template and in the July 2025 handbook; absent from the Aug 2026 handbook. The
> ≥$200,000 letter-of-credit standard that LCW1's body implements survives in the Aug 2026 RENT / TIA
> section, so the deletion did not remove the protection. Keyed from the template per the standing
> rule that body text comes from the template. REVISIT if a future template drop also drops it.

**Revisit trigger, stated so it is not misread:** template AND handbook both dropping LCW1 is the
signal for deliberate retirement. **One source dropping it is not.**

## Powder Springs acceptance test is GATED — and registering `rent` closed a live C failure (2026-09-06)

Mike asked whether regenerating Powder Springs today hits the deferred halt. It does, and checking
turned up something worse than the answer.

**Verified against `fixtures/1_SBUX LOI - Powder Springs Rd + EWC.docx`:**
- Table 0 is 11x4 with a **Per Square Foot** column → the deal needs **R1**, not R0.
- Para 49: "Landlord will, at its expense, perform the work described on the attached Landlord
  Workletter. Landlord will also provide Tenant an improvement allowance of $75,000" → **LCW0**.

Both are deferred, so a faithful run HALTS. **The acceptance test is gated on the rent-table
column-insert / allowance contract, not on the assembler.** The assembler can be built and unit-tested;
it just cannot be acceptance-tested end-to-end on Powder Springs until R0/R1 + LCW0/1/2 load.
`LOI_RESUME_HERE.md` said "nothing blocks it", which implied the test was reachable. Corrected.

**THE LIVE FAILURE.** The halt only worked for one of the two. `landlord_work` was registered as a
deferred clause; the RENT SCHEDULE was registered **nowhere** — there was no `rent` row in `loi_clause`
at all. The sweep manifest assigns paras 36–47 and 49–61 to clause `rent`, but nothing in the library
ever declared it, so `loi_deferred_clause` did not list it and OVIS could not halt on it. Under C the
assembler would have **stripped the entire rent schedule and shipped a clean-looking LOI with no rent
table** — precisely the "reaches a landlord looking clean" failure C was amended to prevent, one clause
away from being live.

Registered in migration `20260906140000`. **My earlier sequencing note was wrong**: I wrote that R0/R1
were "a position-level gap, register them with the column-insert contract." The halt has to exist
BEFORE the assembler, not alongside the work that lifts it. Registering costs nothing and is undone by
the same field update that will un-defer it. Test P3b asserts both gaps stay discoverable.

**Expected, explainable diff:** Powder Springs carries SALE OF PROPERTY at its own para 95. That clause
is `retired`, so it strips silently and correctly — a historical artifact, not a regression, and the
acceptance test should show it as a deliberate difference.

## cam_basis CLOSED — axis challenged, checked against source, confirmed as keyed (2026-09-06)

**No migration. Enum unchanged.** `nn_multi_tenant` / `nn_single_tenant_building` / `nnn` stay exactly
as loaded.

The axis was challenged on the Marietta pad: if CAM0 vs CAM1 turned on whether a shared denominator
exists, a single-tenant pad with no pool looked mis-keyed. Checked against the **Aug 2026 handbook**,
and the discriminator is **who maintains**, not whether a denominator exists:
- **CAM0** — all sites except single-tenant buildings.
- **CAM1** — single-tenant buildings, which **retain a pro-rata share by design**.
- **NNN** — only where Starbucks gets a rent reduction for self-maintaining the Parcel.

Mike confirmed the **Landlord** maintains the Marietta pad, so Marietta is **CAM0** — consistent with
it having been keyed CAM0 verbatim. The proposed `shared_cam_pool` / `sole_cam_burden` replacement axis
is **WITHDRAWN and must not be built.**

Recorded because the challenge was worth making and the answer is worth not re-deriving: a pro-rata
share surviving on a single-tenant building is not an anomaly, it is the CAM1 design.

## Freestanding — NNN drafting standards from the Aug 2026 handbook (2026-09-06)

These are **standards, not bodies.** The CAM1 / NNN body text still comes from the template; these
constrain what the assembled document may say and do:
1. **Never use "NNN" or "Triple Net" in LOI text.** (Testable — see below.)
2. **Starbucks cannot accept direct payment of Real Property Taxes.** Bills stay in Landlord's name;
   Starbucks reimburses.
3. **Starbucks cannot assign insurance proceeds.**
4. **Landlord keeps latent defects and reconstruction.**

**OWED (agreed with Mike, 2026-09-06): a forbidden-substring check for "NNN" and "Triple Net" in
emitted text.** Same shape as the existing "zero brackets, zero codes" acceptance rule. **Do not build
it until freestanding is scoped and there is a fixture to run it against** — a rule with no fixture is
unverified by construction, which is the lesson the rule-2 mutation test paid for. Recorded so it is
not rediscovered from the handbook a third time.

**Freestanding is down to two blockers:** (1) Contingency Addendum provenance, (2) the R0 annual
schedule shape, which rides the column-insert contract.

## LCW1 — OPEN, and it must be settled BEFORE the LCW bodies are extracted

The Aug 2026 handbook **deletes LCW1**; the template still carries it. If it was retired, the ladder is
**two rungs, not three**, and that changes what gets keyed. Nothing is at risk meanwhile — `rent` and
`landlord_work` are both registered deferred, so any deal needing an allowance clause halts.

**What the template actually says** (paras 107 / 109–110 / 112) — the three rungs partition cleanly on
*what the Landlord provides*:
| Rung | Landlord Work | Allowance |
|---|---|---|
| **LCW0** | yes | yes — "IF LANDLORD IS PAYING ALLOWANCE **IN ADDITION TO** LANDLORD WORK" |
| **LCW1** | **no** | yes — "FALLBACK – IF LANDLORD IS PAYING ALLOWANCE **AS A SUBSTITUTE FOR** LANDLORD'S WORK" |
| **LCW2** | no | no — "ALTERNATIVE – IF LANDLORD IS DELIVERING PREMISES IN CURRENT CONDITION AND NOT PROVIDING WORK" |

That is exhaustive and non-overlapping: work+money / money only / neither. **Deleting LCW1 leaves a
real hole** — "Landlord pays an allowance but performs no work" has no other rung, since LCW0 requires
work and LCW2 forbids both. That is structural support for "dropped in error", though not proof: a
deliberate retirement would be Starbucks saying it no longer accepts an allowance-only deal.

**THE DECISIVE TEST, and it is one lookup in the handbook.** LCW1's body (para 110) is the **only**
place in the template carrying the ≥$200,000 security language — *"Landlord, at its sole cost and
expense, shall secure its obligation to pay the Allowance by way of an irrevocable standby letter of
credit or other security as approved by Tenant"*, for allowances of $200,000+ that cannot be offset
within 24 months or where Tenant has no offset rights. **LCW0 does not contain it.** So:
- **If the Aug 2026 handbook still carries that letter-of-credit / security language somewhere** →
  LCW1's substance was relocated, and the deletion is a deliberate reorganization. Ladder is two rungs.
- **If that language is gone entirely** → deleting LCW1 also deleted Starbucks' own protection on large
  allowances. That is too substantive to happen silently, so it points at an error in the drop — or a
  real policy change Mike would recognize as one. Ladder stays three rungs, LCW1 keyed from the
  template with the discrepancy recorded in `provisional_note`.

Cheap to settle now: `landlord_work` is `_blocked` and unextracted, so there is no re-key cost yet —
which is exactly why Mike is right that it comes before extraction, not after.

## Payload contract A–F (SIGNED OFF 2026-09-06)

Mike signed off on **B, D, E as written**; **A and C carry amendments**; and **F was missing entirely**.
All six are now agreed. Previously this section existed only as a one-line summary per item, which is
not something anyone can approve.

The payload is the single object OVIS hands the assembler service. It is **self-contained** (the
assembler reads no database), **text-in** (it carries resolved body text, not ids to look up),
**triple-version-pinned** (library version, template version, assembler version), and **persisted
verbatim** as the operation log — the audit answer to "why does this LOI say that" is the payload,
not a re-derivation.

### A — Tokens stay in `body_text`; param values ride alongside (AMENDED)

`body_text` arrives exactly as stored, `{{param:key}}` tokens intact. Alongside it the payload carries
an explicit map of `param_key → entry` for every token in that body. The assembler substitutes
mechanically: find token, replace, no lookups and no defaulting.

- Every token MUST have an entry. **Absence is a hard error**, never an empty string — silently
  emitting a blank is how a document goes out with a hole in it.
- Which value won (preferred vs fallback vs free fill) is decided in OVIS, where the concession record
  lives. The assembler is not told there was a choice.

**AMENDMENT (Mike, 2026-09-06) — the landlord-fill sentinel.** A flat `key → string` map contradicted
the acceptance test, which allows *zero unresolved brackets EXCEPT declared landlord-fill*. Several
params are deliberately completed by the landlord after we send — `sig_day`, `sig_month`, `sig_year`,
`sig_ll_line`, `sig_ll_name`, `sig_ll_title`, `tic_point_of_contact` — and those must emit as the blank
rule, not fail the run. **Empty string is not the sentinel: it is indistinguishable from a bug.**

So a payload param entry is a TYPED OBJECT with exactly three kinds:

```json
"sig_tenant_name":      {"kind": "value",         "value": "Jane Doe"}
"sig_ll_name":          {"kind": "landlord_fill", "render": "_______________________"}
"some_optional_phrase": {"kind": "omit"}
```

- `value` — substitute `value`. It MUST be non-empty; a deliberate blank is `omit`, never `""`.
- `landlord_fill` — emit `render` verbatim, and the token **counts as RESOLVED** for the acceptance
  test. This is the sentinel, and it is explicit by construction: no string value can be mistaken for
  it, and no absence can be mistaken for it either.
- `omit` — the library's `is_omit` option was chosen; emits the empty string DELIBERATELY. OVIS marks
  it so surrounding whitespace is OVIS's problem, not a stray double space.
- Absence of the key entirely — hard error, unchanged.

**Library support built** (migration `20260906120000`): `param_kind` gains a fourth value
`landlord_fill`, plus `landlord_fill_render TEXT`, present iff the kind is `landlord_fill` and never
empty. A fourth *kind* rather than a boolean beside `fill`, because `param_kind` already answers "how
does this resolve" and these resolve by a rule nobody supplies a value for — a boolean would make two
fields answer one question and force every consumer to check both.

The seven params Mike named are re-keyed. Their `note` fields already said "LANDLORD COMPLETES" in
prose; this promotes that prose to the rigid spine, so the acceptance-test exception finally has a
*declaration* to point at instead of a naming convention. Renders are the template's own underscore
runs, verbatim and per-param (`______` vs `_______________` vs `______________________________`),
verified against `LOI_US_7_30_2026.docx` paras 15 and 229–235 — the widths differ and are not
guessable.

**RESOLVED (Mike, 2026-09-06): BOTH sets are landlord-fill.** Source evidence from the SENT Powder
Springs LOI — all of them shipped blank carrying Mike's own landlord instruction: "LL insert estimated
taxes" / "LL insert insurance" / "LL insert CAM" on the three per-square-foot runs, and "LL please
insert" on the pro-rata percentages. Re-keyed in migration `20260906130000`.

**My "reads as caps we negotiate" was the wrong read.** The word *cap* in those notes was collapsing
two different blanks:
- `cam0_tax_psf` / `cam0_insurance_psf` / `cam0_cam_psf` — the landlord's ESTIMATED $/SF costs. The
  sentence they sit in caps those charges, but the numbers are the landlord's estimates.
  **landlord_fill.** Notes rewritten so the word no longer misleads.
- `cam0_cap_pct` — the ESCALATION percentage we DO negotiate ("will not increase by more than
  {{cam0_cap_pct}}, on a non-cumulative basis"). Untouched, and test P2c pins it so a future sweep
  cannot pull it in with its neighbours.

*Correction for the record:* Mike described `cam0_cap_pct` as staying "an ordinary `fill`". It is
actually a `concession`, preferred 3% / fallback 5% — which is precisely the "Oculus opens at 3%,
falls back to national 5%" he described, and a stronger encoding than `fill`. No change made.

**Mapping was confirmed against the loaded rows before re-keying**, as Mike asked (he had inferred it
from param names). `cam/main` reads "…${{cam0_tax_psf}} per square foot for real estate taxes,
${{cam0_insurance_psf}} for insurance and ${{cam0_cam_psf}} for common area maintenance…", so the
three names do point at the three per-square-foot runs.

**One key differed from his list.** He described the `"Not to exceed ____%"` run and its "LL please
insert" comment under the `prs_*` keys, but that blank actually lives on `pro_rata_share/main` as
`pro_rata_share_blank_2`. Same blank, same evidence, different key — re-keyed as the seventh param in
this batch. The three `prs_*` keys are the `"Estimated to be _____%"` runs, exactly as he said.

**Widths are per-param and verbatim, never normalized** — the template genuinely differs and Powder
Springs preserved the difference. Verified against `LOI_US_7_30_2026.docx` paras 164 (CAM0), 174, 178,
180, 182: `$______` taxes / `$_____` insurance / `$______` CAM; `_____` for the three "Estimated to
be" runs; `____` for "Not to exceed". Test P2b asserts the three CAM widths are NOT all equal, so a
future tidy-up cannot quietly flatten them.

**Fourteen landlord-fill params total** (7 signature/TIC + 7 here).

*Rejected alternative:* pre-substituting in OVIS and shipping finished text. That would make the
emitted text unattributable to a canonical body, breaking Phase-2 redline matching.

### B — Skeleton mapping by the template's own markers

The assembler places content into the versioned template by, in priority order: (1) the template's own
`[{CODE}]` markers, which are separate runs and are stripped after use; (2) section headings for
uncoded content; (3) the R1 instruction anchor for the rent table; and now (4) `template_paragraph`
for paragraph-anchored positions such as the closing frame and the signature blocks.

- Brace codes are NEVER emitted. Stripping the marker run is part of placement.
- An anchor that cannot be found is a hard failure. The assembler never guesses a location.

**RECORDED DEPENDENCY (Mike, 2026-09-06).** Tier (2), section-heading matching for uncoded content, is
the fragile tier: a template drop that merely REWORDS a heading breaks it **silently** — the anchor is
simply not found, and the failure looks like a placement bug rather than a template change. What
catches that is the docx cross-check in `completeness_test.py` (the template-transition detector,
which compares `text_head` after `lstrip` for every paragraph). **That cross-check is load-bearing for
tier 2. Do not "simplify" or drop the heading matcher, and do not weaken the transition detector,
without replacing the guard first.**

### C — Strip by default, but HALT on absence (AMENDED)

Anything in the template not claimed by a payload entry is REMOVED: unfired instructions, unselected
alternatives, leftover bracketed guidance. The default is deletion, not retention.

- This is what makes the acceptance test meaningful: emitted output with **zero brackets and zero
  codes** (landlord-fill renders excepted, per A), or fail.
- It also means an omission bug produces a visibly missing clause rather than a template artifact
  quietly shipping to a landlord.

**AMENDMENT (Mike, 2026-09-06).** Strip-by-default is right; the failure mode as originally written
was not. "Anything not claimed is removed" does not distinguish content the payload **deliberately did
not claim** from content it **could not claim because the library does not have it yet**. Today
`landlord_work` (LCW0/1/2) and R0/R1 are deferred and unloaded. Under C as first written, a deal
needing an allowance clause would emit a document with the Landlord Contribution section silently
deleted — and it would reach a landlord looking clean.

> **If a deal's facts require a clause that is deferred, blocked, or not loaded, the run HALTS. It
> does not strip. Deletion is legal only for content the payload CHOSE not to claim; never for content
> the library cannot yet supply.**

This is the same principle as the exclusion `halt`: the assembler stops rather than guessing, applied
to **absence** instead of **conflict**.

**Library support built** (migration `20260906120000`). `is_active = false` previously meant one thing;
it now has to mean two opposite things, so the flag is split by `unavailable_kind`:
- `retired` — decided; never emits again (`sale_of_property`, superseded by Transfer). A deal that
  would have used it is fine; strip and continue.
- `deferred` — a known library gap (`landlord_work`). A deal whose facts require it **halts**.

A CHECK ties the two together: an inactive clause must declare which kind, an active one must carry
neither. `landlord_work` is now REGISTERED as a deferred clause with no positions and no bodies —
the point is precisely that it is absent, but **OVIS cannot halt on a clause it has never heard of**,
and "not loaded" is unrepresentable as silence. View `loi_deferred_clause` is the assembler's
"may I proceed" question in one place: OVIS intersects it with the deal's required clauses and halts
on any overlap.

R0/R1 sit inside clauses that ARE loaded, so they are a position-level gap rather than a clause-level
one. Registering them the same way is deferred until the rent-schedule column-insert contract is
built, since that is the work that resolves them.

### D — `modified` is OVIS-computed metadata; `body_text` is authoritative

Each payload entry may carry a `modified` flag and a rationale, for the audit record and the Starbucks
deviation story. The assembler ignores both for emission — it renders `body_text` and nothing else.

- Prevents two sources of truth. If `modified` said one thing and the text another, the text wins,
  because the text is what the landlord reads.
- `deviation_rationale` and approval flags travel for the audit record; they never alter output.

### E — Rent rows arrive precomputed; the assembler does zero math

OVIS runs the rent engine and puts finished rows in the payload — period labels, per-SF, yearly,
monthly, already rounded per the locked convention (compound unrounded $/SF; yearly = unrounded × sqft
rounded to cents; monthly = yearly / 12). The assembler renders the table per
`docs/LOI_RENT_TABLE_RENDER_CONTRACT.md` and computes nothing.

- One rent engine, in OVIS, shared with the commission engine — two consumers, one implementation.
- A rounding change is an OVIS change and cannot drift between the LOI and the commission record.
- The assembler cannot produce a number that OVIS has not already stored and shown.

**Open question on E:** the `$/SF` final-period drop rule is deferred by choice (Mike strips that
column by hand pre-execution). If the payload carries a per-SF column at all, the assembler renders
what it is given — the protective rule stays out of scope until Mike asks for it.

### F — OVIS enforces exclusions; the assembler does NOT re-check (ADDED)

**Mike, 2026-09-06: this was missing from all five and is now explicit.** The selection contract built
with `loi_clause_exclusion` — select from `loi_selectable_position`, run `loi_exclusion_violations()`
before emitting — never said WHERE it runs. Left unsaid it would be done twice or done nowhere.

> **OVIS runs the exclusion check and builds the payload from an already-legal selection. The
> assembler does not re-check.**

- It could not do it properly anyway: A–E make the assembler self-contained and database-free, and
  `loi_exclusion_violations()` is a database function over the library.
- So the payload is a *post-validation artifact*. By the time it exists, `supersedes` has already been
  resolved (the superseded position dropped) and `mutually-exclusive` has already halted the run in
  OVIS, where a human can answer the deal-fact question.
- Same ownership for the C halt: OVIS checks `loi_deferred_clause` against the deal's required clauses
  and refuses to build a payload at all. The assembler never sees a run it should have stopped.
- Consequence for the operation log: because the payload is persisted verbatim, it records a selection
  that was legal at assembly time. A later library change cannot retroactively make a shipped LOI look
  invalid — the exclusions that applied are the ones the payload was built under.

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
