# Project C — Hunter AI Refactor (OVIS → OpenClaw)

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.C](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

Move the Hunter prospecting agent out of the OVIS Claude codebase and onto OpenClaw as an autonomous, scheduled prospecting agent. Stop burning tokens on OVIS-codebase-context reloads.

## Current State

Hunter lives inside the OVIS Claude codebase. It scrapes websites, finds prospects, generates outreach emails, and populates lists in OVIS. The architecture doc flags it as inefficient — token-heavy because every run reloads OVIS context.

## Target State

- Hunter runs autonomously on OpenClaw (likely overnight on the Mac Mini for residential IP)
- Pulls watchlist + outreach criteria from OVIS via tools
- Scrapes target sites, analyzes content, generates outreach drafts
- Pushes results back to OVIS as prospect records + draft emails

## OVIS Tools to Build

- `get_hunter_target_sites` — watchlist of sites to scrape
- `get_outreach_criteria` — filters and ICP definition
- `create_prospect(data)` — write new prospect record
- `attach_outreach_draft(prospect_id, draft_email)` — link draft to prospect

## Architecture Decisions to Validate

- **Mixed-model approach:** Llama for bulk scraping/categorization (cheap, repetitive), Claude for nuanced outreach drafting. To be confirmed in interview.
- **Local execution:** Best run on the Mac Mini (Project H) for residential IP — many target sites block cloud data center IPs.
- **Schedule:** Overnight autonomous loop, results reviewed in the morning.

## Cost Profile

Should drop materially vs. current state. Codebase-loading overhead disappears; bulk work potentially shifts to local Llama.

## Dependencies

- **Project H (Mac Mini)** — strongly recommended for residential IP advantage on scraping
- Existing OVIS prospect schema and review UI need to handle agent-created records gracefully
- ICP / criteria definition needs to live somewhere structured (currently in code? prompts? a config?)

## Open Questions for Interview

1. **Current Hunter scope:** What sites does it scrape today? What does the watchlist look like?
2. **ICP definition:** Where do criteria live now? Does the move require formalizing them?
3. **Output volume:** How many prospects/day is the target? (Drives cost and review-load planning)
4. **Review workflow:** Do you review each draft before send, or is approval bulk?
5. **Outreach send:** Does Hunter also send, or only draft? Where does send happen?
6. **Llama feasibility:** Have you experimented with local Llama for any of this yet, or is that a fresh decision?
7. **Existing code reuse:** How much of the current Hunter code is portable vs. needs rewrite for OpenClaw?
8. **Failure handling:** When a scrape fails (block, layout change, etc.), what's the right behavior — log and skip, alert, retry tomorrow?
9. **Deduplication:** How does Hunter avoid re-prospecting contacts already in OVIS?
10. **Compliance:** Any robots.txt / ToS / CAN-SPAM considerations baked in today?

## Build Effort Estimate

Tooling in OVIS: ~3–5 days.
OpenClaw rewrite: ~1–2 weeks depending on how much current logic is reusable.
