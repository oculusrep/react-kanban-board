# OVIS Legal Orchestration Module — V1 Spec

**Status:** Weeks 1 + 2 deliverables complete. Inbound LOI processing pipeline (parse → identify clauses → match → silent-acceptance → persist) is end-to-end and deployed. Ready for Week 3 (tracked-changes counter-redline generator).
**V1 Scope:** Starbucks LOIs only. Other clients in V2.

---

## ✅ Build progress (as of 2026-04-29)

### Schema — applied to production
- [supabase/migrations/20260428_legal_orchestration_schema.sql](../supabase/migrations/20260428_legal_orchestration_schema.sql) — 9 new tables, 9 additive `deal` columns, indexes, permissive RLS.
- [supabase/migrations/20260429_legal_orchestration_fk_indexes.sql](../supabase/migrations/20260429_legal_orchestration_fk_indexes.sql) — supplementary FK indexes addressing Supabase performance advisor warnings.
- **Departure from spec:** `deal.landlord_name TEXT` instead of the spec'd `landlord_entity_id` FK. V1 simplification; can graduate to structured FK in V2.

### Universal clause taxonomy — seeded (35 rows)
- [supabase/migrations/20260429_clause_type_taxonomy_seed.sql](../supabase/migrations/20260429_clause_type_taxonomy_seed.sql) — every standard LOI clause from the handbook table of contents, with confidence tiers (HIGH/MEDIUM/LOW).

### Starbucks playbook — top 10 clauses seeded with full text
- [supabase/migrations/20260429_starbucks_playbook_seed_v1.sql](../supabase/migrations/20260429_starbucks_playbook_seed_v1.sql) — 10 highest-stakes clauses × 28 ranked positions, each with full clause text, rationale, default comment text, and approval requirements lifted from the handbook.
- Clauses seeded: Term, Rent, Percentage Rent, Rent Commencement, Use, Exclusive Use, Early Termination, Continuous Operations, Initial Co-Tenancy, Landlord Work and Contribution.

### Claude shared module
- [supabase/functions/_shared/claude.ts](../supabase/functions/_shared/claude.ts) — Sonnet 4.6 default + Opus 4.7 escalation, prompt caching, retry-with-backoff, streaming, `pickModel()` helper. Mirrors the existing `gemini.ts` pattern. SDK pinned at `0.32.1` to match other OVIS Edge Functions.

### Handbook ingestion Edge Function — deployed
- [supabase/functions/legal-ingest-handbook/index.ts](../supabase/functions/legal-ingest-handbook/index.ts) — generic, reusable for any client. Calls Opus 4.7 with adaptive thinking + high effort, parses structured JSON, upserts `legal_playbook` + `legal_playbook_position` rows. Supports `dry_run` for previewing extraction quality before writing.
- Deployed to Supabase as `legal-ingest-handbook` (verify_jwt=true). Available but not yet invoked.

### Week 2: Inbound LOI processing pipeline — deployed

- [supabase/functions/_shared/docx-parser.ts](../supabase/functions/_shared/docx-parser.ts) — Reads `.docx` zip + `word/document.xml`, walks paragraphs, extracts text/tracked-changes/comments. Validated locally against the Starbucks master LOI: parses 401 paragraphs, identifies all tracked-change runs, recovers comment anchors. Uses `npm:jszip` + `npm:fast-xml-parser` via esm.sh.
- [supabase/functions/_shared/clause-parser.ts](../supabase/functions/_shared/clause-parser.ts) — Detects clause boundaries via heading regex (`^[A-Z][A-Z0-9 &/'()-]+:`); groups subsequent paragraphs into clause bodies until the next heading. Captures heading-paragraph + body-paragraphs + insertions/deletions per clause.
- [supabase/functions/_shared/clause-matcher.ts](../supabase/functions/_shared/clause-matcher.ts) — Three-tier match: exact heading → fuzzy heading (Jaccard token overlap) → Claude Sonnet semantic classification. Returns `clause_type_name`, `legal_playbook_id` (if a playbook entry exists), confidence, and matcher tier.
- [supabase/functions/_shared/silent-acceptance.ts](../supabase/functions/_shared/silent-acceptance.ts) — Per-paragraph comparison of prior outbound vs. current inbound. Flags paragraphs where the landlord's baseline differs from your prior outgoing (`fully_accepted` if matches your visible_text; `partial_or_edited` if neither prior view matches).
- [supabase/functions/legal-ingest-loi/index.ts](../supabase/functions/legal-ingest-loi/index.ts) — Edge Function orchestrating the above. Inputs: `{session_id, attachment_id, prior_round_id?, dry_run?}`. Downloads inbound `.docx` from Storage, parses, identifies clauses, matches to playbook, optionally runs silent-acceptance against prior round, persists as `legal_loi_round` + `legal_loi_decision` rows. Deployed as `legal-ingest-loi` (verify_jwt=true).

### Validated end-to-end (local test driver)

Ran the parser + clause boundary identification against the actual Starbucks master LOI (`Screen Shots/8.18.25 SDRC and Mike P Edits - Starbucks Letter of Intent - MASTER.docx`):
- 401 paragraphs parsed
- 58 clause boundaries identified (master template has multiple variants per clause: U0/U1/U2 for Use, EU0/EU1/EU2 for Exclusive Use, etc. — duplicates collapse into single clauses for a real landlord redline)
- Tracked changes correctly captured: e.g., the term clause shows both the original "four (4)" and the inserted "six (6)" options.

Real landlord redlines (Type 1+2 per Q11) are expected to have one heading per clause, so the duplicates seen in the master template will not appear in normal usage.

### Invoking the handbook ingester (for the long tail)

To populate the remaining ~25 clauses for Starbucks:

```bash
HANDBOOK_TEXT=$(pdftotext -layout "Screen Shots/LOI Handbook.pdf" - | jq -Rs .)

curl -X POST "$SUPABASE_URL/functions/v1/legal-ingest-handbook" \
  -H "Authorization: Bearer $YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"39933b5b-3e8c-438d-be2f-e48cd9228c00\",
    \"source_label\": \"LOI Handbook.pdf (Revised October 8, 2024)\",
    \"handbook_text\": $HANDBOOK_TEXT,
    \"dry_run\": true
  }"
```

Run with `dry_run: true` first to inspect Opus's extraction; if quality looks good, set `dry_run: false`. Existing playbook entries (the 10 already seeded) get UPDATEd in place; the rest get INSERTed.

---

## Next up — Week 3 (cont.)

- **Reasoning layer (`legal-decide-positions`) — DEPLOYED**. For a given inbound round, walks each pending decision, queries the playbook, and asks Claude to pick a position rank. Sonnet 4.6 default; Opus 4.7 escalation when the clause is HIGH-stakes or prior confidence is low. Includes recent override history as context (Q8 C). Writes back `ai_position_rank`, `ai_rationale`, `ai_confidence`, `ai_model`, `final_text`, `final_comment_text`, and `status` (`auto_applied` / `pending` / `escalated`). `is_floor` and `requires_approval` positions auto-flag for review. Supports `dry_run`.
- **Tracked-changes counter-redline generator** — given a `legal_loi_round` of inbound + its `legal_loi_decision` rows (with `final_text` populated by the reasoning layer), emit a `.docx` with native `<w:ins>` / `<w:del>` / `<w:commentReference>` markup against the inbound baseline. The genuinely hard part of V1; up next.

---

## Vision

A two-function legal document module inside OVIS:

- **Function A — Redliner.** Ingest a counterparty's redlined `.docx`, compare against the OVIS-stored playbook (extracted from Starbucks' LOI Handbook), and emit a counter-redline with native Word tracked changes + comments. AI picks initial fallback positions; user reviews and adjusts.
- **Function B — Generator.** Two-phase wizard for outbound LOI creation from the Starbucks master template, pre-filled from the OVIS deal record.

The two functions share a playbook, version chain, and rationale library. The user (Mike) is new to Starbucks; the tool doubles as a teacher — every AI suggestion shows the handbook's rationale.

---

## Source documents

- `Screen Shots/LOI Handbook.pdf` — 67 pages, ~30 sections. Fallbacks pre-encoded in the handbook text (`{R0}/{R1}`, "Preferred / Fallback 1 / 2 / 3", etc.). Eliminates playbook-authoring burden.
- `Screen Shots/8.18.25 SDRC and Mike P Edits - Starbucks Letter of Intent - MASTER.docx` — 417 insertions, 347 deletions. Already a tracked-changes doc with `[CHOOSE: X OR Y]`, `[ADD, IF APPLICABLE: …]`, `[FALLBACK: …]` markup.
- `Screen Shots/LOI Southeast- new training doc v6 09.04.24.docx` — Reference (no tracked changes).

---

## Decisions — full record

| # | Topic | Decision |
|---|---|---|
| 2 | Input source | Email attachment, manually uploaded. No email/portal integration in V1. |
| 3 | Workflow today | Mike opens redline in Word, hand-cross-references handbook, runs Word "Compare" against last sent (catches silent acceptances), counter-redlines, runs another Compare, sends back. One round = hours to days. |
| 4 | Interaction model | **AI first pass + free-navigation review.** AI takes a first pass (Position 1 default, falls back when warranted). User sees annotated draft with sidebar queue. Drill into any change to revert / pick different position / custom edit / accept landlord / escalate. Free navigation. |
|   | Comments | Native Word comments. Per-clause × per-position default text auto-generated from handbook "Rationale" sections. User-saved snippets in `comment_templates`. |
|   | Silent acceptance | Side panel flags places landlord's doc differs from Mike's last sent without a tracked change. |
|   | Output | `.docx` with Mike's counter as native tracked changes against the version landlord sent. |
| 5 | Version chain | **Hybrid.** Tool auto-tracks versions when generated through it; manual two-file upload override always available. |
| 6 | OVIS integration | **Deal-scoped + standalone hybrid.** Lives both as own module and as deal-page tab. Most LOIs start from a deal. Loose mode for one-offs. **Bidirectional sync:** wizard updates deal record on submit; inbound LOI uploads run extraction pass with diff preview before writing back. |
| 7 | Clause scope V1 | **All ~30 sections ingested, confidence-tiered.** HIGH / MEDIUM / LOW per clause. AI aggressive on HIGH, conservative on MEDIUM, auto-escalates LOW. |
| 8 | Learning loop | **B + C with citations.** AI proposes new fallbacks after N similar overrides; recent overrides surface as context to AI on new redlines; every suggestion cites specific past deals (clickable expand + chat input for follow-up Qs). |
| 9 | Wizard design | **Two-phase Guided Generation.** Phase 1: quick setup form (parties, property, deal type) — pre-filled from deal, gaps highlighted, writes back to deal on submit, resolves all instructional brackets in template. Phase 2: clause-by-clause walkthrough with handbook context inline, Position 1 pre-applied, alternatives one click away. Live doc-preview pane on right in both phases. |
| 10 | Review queue sort | **Status groups + severity dots.** Default groups: 🚨 Escalated → ⚠️ Needs Review → ✓ Auto-Applied → ⏸ Silent Acceptances. Filter chips on top. Inside each group: doc order + colored severity dots. |
| 11 | Inbound robustness | **Type 1+2, minimal restructuring.** Match: heading match → fuzzy heading → semantic classification → "new content" bucket. 3–5 day engineering effort. |
| 12 | User scope V1 | **Single user (Mike).** Schema designed B-ready: `created_by` user_id from day one. V2: opens to internal OVIS brokers. Starbucks client users **never** get write access. |
| 13 | Version history | **Negotiation timeline.** Vertical per-round timeline on deal page LOI tab. Each "Counter" entry clickable — reopens saved AI-decision session with rationale frozen in time. |
| 14 | Model selection | **Sonnet 4.6 default + Opus 4.7 escalation.** Opus for handbook extraction (one-time) and high-stakes / low-confidence position decisions. Sonnet for everything else. ~$0.50–1.50 per LOI round. |
| 15 | Multi-client schema | **C-relaxed.** Universal `clause_type` taxonomy (shared internal labels) + per-client independent positions. `legal_playbook.display_heading` lets each client name clauses whatever they want in their actual `.docx`. Cross-client analytics work for free. |
| 16 | UI placement | New "Legal" top-nav dropdown + "Legal" tab on deal page (between Files and Critical Dates). Routes: `/legal`, `/legal/loi/:id`, `/legal/loi/:id/round/:n/review`, `/legal/loi/:id/wizard`, `/legal/playbook`. |

---

## V2+ feature ideas (captured but not in V1 scope)

- **Cross-client AI consultation** during redlining — *"How do other clients handle this section?"* Made possible by Q15's shared canonical clause_type taxonomy.
- **Rent calculator** ([docs/rent-calculator-spec.md](rent-calculator-spec.md)) — deal-level, used by all playbooks. V1 ships with manual rent-schedule entry.
- **Multi-broker access** — open to internal OVIS brokers (already schema-ready via `created_by`).
- **Director approval routing** — currently offline-only. Could become an in-system workflow.
- **Starbucks client read+comment access** — much later, never write.
- **Playbook editor UI** — V1 has read-only viewer; V2 lets users edit playbook entries directly.

---

## Architecture

**Stack:** All inside OVIS. Zero new infrastructure.

- **Frontend:** React + Vite + Tailwind (existing). New module under `src/components/legal/` and `src/pages/legal/`.
- **Backend:** Supabase Edge Functions (Deno). New functions under `supabase/functions/legal-*`.
- **AI:** New `supabase/functions/_shared/claude.ts` module mirroring existing `gemini.ts` pattern. Prompt caching enabled for playbook context.
- **Storage:** Generated/uploaded `.docx` files in Supabase Storage `assets/legal/{deal_id}/{loi_id}/round-{n}-{type}.docx`. Each gets an `attachment` row + `legal_loi_round` row.
- **State:** Mike's in-progress review sessions auto-save to `legal_loi_decision` rows continuously. No "save draft" button needed.

### .docx XML manipulation strategy

Tracked-changes generation is OOXML XML surgery, not a library problem. Tools like `docxtemplater` are templating-focused and don't produce `<w:ins>` / `<w:del>` / `<w:commentReference>` elements. We write a focused Deno module that:

1. Unzips the `.docx` (`npm:jszip`)
2. Parses `word/document.xml` (`npm:fast-xml-parser`)
3. Walks paragraphs, applies tracked-change transforms (insert `<w:ins>` / `<w:del>` / `<w:commentReference>` with author=Mike, timestamps, IDs)
4. Updates `word/comments.xml` (created if missing)
5. Re-zips and uploads to Supabase Storage

OOXML spec is well-bounded. ~3-5 days of focused work.

---

## Schema migration plan

### Tier 1 (must-add for V1) — APPLIED

**On `deal` table:**
- `landlord_name` — TEXT (V1 simplification of spec'd `landlord_entity_id` FK)
- `lease_initial_term_years` — numeric
- `rent_type` — enum (`fixed_annual` / `per_sqft` / `hybrid`)
- `tia_amount` — numeric (mirrors `site_submit.ti` for clarity)
- `rent_commencement_type` — enum + `rent_commencement_days` int
- `use_clause_type` — enum + `use_clause_notes` text
- `landlord_lease_status` — enum (`fee_owner` / `ground_lessee` / `under_contract`)

**New tables:**
- `clause_type` — universal taxonomy (`Term`, `Rent`, `Use`, …) — 35 rows seeded
- `legal_playbook` — `client_id` × `clause_type_id` × metadata (`display_heading`, `rationale`, `guidelines`, `confidence_tier`)
- `legal_playbook_position` — ranked positions per playbook entry (`position_rank`, `clause_text`, `default_comment_text`, `requires_approval`)
- `legal_loi_session` — one per deal × LOI thread (`client_id`, `deal_id`, `created_by`, `status`)
- `legal_loi_round` — version history (`session_id`, `round_num`, `direction` (`outbound` / `inbound`), `attachment_id`, `created_at`)
- `legal_loi_decision` — per-change AI decisions + overrides (`round_id`, `clause_type_id`, `landlord_text_excerpt`, `position_used`, `was_override`, `override_source`, `final_text`, `comment_text`)
- `negotiation_logs` — analytics/citations (`client_id`, `deal_id`, `clause_type_id`, `position_used`, `was_override`)
- `comment_templates` — Mike's custom snippets (`client_id`, `clause_type_id`, `template_text`, `created_by`)
- `deal_rent_schedule` — multi-step rent rows (`deal_id`, `step_num`, `year_start`, `year_end`, `annual_amount`, `monthly_amount`, `per_sqft_amount`)

### Tier 2 (post-V1, important but not blocking)

`property_unit.premises_length_ft`, `mezzanine_sqft`, `basement_sqft`, `storage_sqft`; `deal.exclusive_use_types`, `continuous_operations_required`, `early_termination_*`, `cotenancy_threshold_percent`, `restroom_allowance`, `sewer_allowance`; `property.legal_description`; `deal_lease_option` table.

---

## Implementation roadmap (~6 weeks)

| Week | Deliverable | Status |
|---|---|---|
| 1 | Schema migration (Tier 1) + `claude.ts` shared module + handbook ingestion script (Opus 4.7) | ✅ DONE |
| 2 | Clause-boundary parser. Section identification on inbound docs (heading match → fuzzy → semantic). Silent-acceptance detector. `legal-ingest-loi` Edge Function. | ✅ DONE |
| 3 | Tracked-changes XML generator (the hard part). Comments injection. Round-trip fidelity tests against the master `.docx`. Reasoning layer (decide-position). | ⏭ NEXT |
| 4 | Override logging. Citation Q&A. Approval routing. | |
| 5 | Function B wizard (two-phase). Field extraction for inbound LOI → deal sync. | |
| 6 | UI polish, OVIS nav integration, end-to-end test with a real Starbucks LOI redline. | |

---

## Notes for builders

- Stack: React/Vite/Supabase/Tailwind. Brand colors: `#002147` / `#4A6B94` / `#8FA9C8`. Eastern Time for all dates (per CLAUDE.md).
- Director of Real Estate is offline escalation (no system feature in V1).
- Multi-client is on the roadmap. Schema must anticipate it (`client_id` on playbook tables — already designed in).
- Always paginate Supabase queries that may return >1000 rows (per CLAUDE.md).
- **Production database = dev database.** Run migrations during quiet windows; verify additively-only before applying.
