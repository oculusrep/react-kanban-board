# OVIS Legal Orchestration Module — V1 Spec

**Status:** Implementation kicked off. Schema migration drafted, **not yet applied** (paused mid-step due to claude.ai outage on 2026-04-28).
**V1 Scope:** Starbucks LOIs only. Other clients in V2.

---

## ⏸ Resume here after the outage

**Branch:** `feat/legal-orchestration-v1` (already pushed to origin).
**Last completed:** Schema migration drafted at [supabase/migrations/20260428_legal_orchestration_schema.sql](../supabase/migrations/20260428_legal_orchestration_schema.sql) and committed to the branch.
**Next action when resumed:** Apply the migration via Supabase MCP (`mcp__supabase__apply_migration`).

### ⚠️ Critical safety context for whoever resumes

**Mike's Supabase database is the same for production and dev.** There is no separate dev environment. Applying the migration writes to production. Re-confirm this with Mike before running `apply_migration`.

The migration is purely additive (no DROPs, no column type changes, no destructive operations on existing data) so risk is low — but production-grade caution still applies. Run during a quiet window, watch the result.

### Open questions to surface on resume

1. **`deal.landlord_entity_id` vs `deal.landlord_name`?** Migration as drafted uses `landlord_name TEXT` (V1 simplification). Spec called for `landlord_entity_id` FK but didn't pin down what it FK'd to. Mike to confirm whether to keep TEXT for V1 or add a structured `landlord` table now.
2. **Migration review.** Mike hadn't reviewed the schema before the outage interrupted. Walk him through the review notes (in the kickoff message that's in the conversation history) before applying.

### After the migration applies

Per the 6-week roadmap (in this doc, "Implementation roadmap" section):

- **Week 1 (continued):** Build `supabase/functions/_shared/claude.ts` (mirroring `gemini.ts` pattern). Then build the **handbook ingestion script** — a one-time Edge Function call using Opus 4.7 that reads the LOI Handbook PDF and populates `clause_type` + `legal_playbook` + `legal_playbook_position` rows for `client_id = Starbucks`. This is the highest-value Week 1 deliverable.
- **Week 2:** Clause-boundary parser. Inbound clause matching (heading → fuzzy → semantic).
- **Week 3:** Tracked-changes XML generator (the genuinely hard part).
- Continue per roadmap.

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

### Tier 1 (must-add for V1)

**On `deal` table:**
- `landlord_entity_id` — FK to a landlord entity (today `property.landlord` is text-only)
- `lease_initial_term_years` — numeric
- `rent_type` — enum (`fixed_annual` / `per_sqft` / `hybrid`)
- `tia_amount` — numeric (mirrors `site_submit.ti` for clarity)
- `rent_commencement_type` — enum + `rent_commencement_days` int
- `use_clause_type` — enum + `use_clause_notes` text
- `landlord_lease_status` — enum (`fee_owner` / `ground_lessee` / `under_contract`)

**New tables:**
- `clause_type` — universal taxonomy (`Term`, `Rent`, `Use`, …)
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

| Week | Deliverable |
|---|---|
| 1 | Schema migration (Tier 1) + `claude.ts` shared module + handbook ingestion script (Opus 4.7, one-time, populates `legal_playbook` + `legal_playbook_position`) |
| 2 | Clause-boundary parser. Section identification on inbound docs (heading match → fuzzy → semantic). |
| 3 | Tracked-changes XML generator (the hard part). Comments injection. Round-trip fidelity tests against the master `.docx`. |
| 4 | Reasoning layer (decide-position Edge Function with Sonnet/Opus routing). Override logging. Citation Q&A. |
| 5 | Function B wizard (two-phase). Field extraction for inbound LOI → deal sync. |
| 6 | UI polish, OVIS nav integration, end-to-end test with a real Starbucks LOI redline. |

---

## Notes for builders

- Stack: React/Vite/Supabase/Tailwind. Brand colors: `#002147` / `#4A6B94` / `#8FA9C8`. Eastern Time for all dates (per CLAUDE.md).
- Director of Real Estate is offline escalation (no system feature in V1).
- Multi-client is on the roadmap. Schema must anticipate it (`client_id` on playbook tables — already designed in).
- Always paginate Supabase queries that may return >1000 rows (per CLAUDE.md).
