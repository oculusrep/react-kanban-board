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

**Bucket 1 Georgia in-scope set** (seed as `authority = self-authored`, no brace code,
preload into every GA Position 1):
- Broker's Commission (Oculus named, references separate commission agreement)
- Future Construction
- Sale of Property
- Shopping Center Use Restrictions
- ROFR
- Storm Water / Roads contribution
- Title Contingency
- Recorded Documents
- Other Contingency

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

- **Collision sweep** across all brace codes for one-code/two-canonical-texts splits (C).
- **Reproduce Powder Springs Rd v1 LOI** (incl. Word comments + Workletter scope matrix)
  from a wizard run — the acceptance test.

---

## Build order (from briefing §9)

1. Clause library + custom catalog seeded into Supabase.
2. Wizard + deterministic assembly → clean v1 docx.  ← **value lands here**
3. Template-drop ingest/diff (next national drop ~3 months out; not needed to start).
4. Compare engine + response panel.
5. Event capture + audit-record (LRM) export.
6. Precedent retrieval (lightweight intent-matching AI layer).
