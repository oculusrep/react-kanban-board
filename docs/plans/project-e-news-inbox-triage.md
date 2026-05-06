# Project E — News + Inbox Triage Briefing Agent

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.E](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

A spoken (or readable) summary, once or twice a day, covering:
1. **Industry news** you need to know
2. **Inbox triage** — what's urgent vs. can wait

## Current State

Nothing built. Manual scanning of news + inbox today.

## Target Architecture

OpenClaw agent, scheduled 1–2× daily, also triggerable on-demand via voice ("brief me").

### News Component
- Scrapes industry news sources (CRE feeds, market news)
- Summarizes 3–5 items relevant to your deals/markets
- Llama candidate for the summarization (repetitive, structured)

### Inbox Triage Component
- Scans Gmail inboxes (multiple folders)
- Classifies each email: **urgent today / this week / FYI / can ignore**
- Returns prioritized list with one-line rationale per item
- Does NOT draft replies — that's a separate agent if/when wanted

## Cost Profile

Lightweight — few seconds of agent reasoning per run. ~$1–2/week.

## Dependencies

- **Project A (voice interface)** — for the spoken delivery; otherwise email/Telegram delivery
- Gmail API access already in place for OVIS? — to confirm
- News source list — needs to be defined and stored somewhere structured

## Open Questions for Interview

1. **News sources:** Which feeds/sites? Curated list, or RSS aggregator? Do they overlap with Hunter's watchlist?
2. **Relevance signal:** What makes a news item "relevant to your deals/markets" — geographic match against active deals? Tenant name match? Manual interest tags?
3. **Inbox scope:** Which Gmail accounts/folders? All inboxes or curated subset?
4. **Classification rules:** What signals make an email "urgent today"? (Sender importance? Keywords? Time references in body?)
5. **Schedule:** 1× or 2× daily? Times? Different cadence weekday vs. weekend?
6. **Delivery mode:** Voice-only, email digest, both? Telegram push for urgent items between briefings?
7. **Reply drafting:** Truly out of scope, or a phase-2?
8. **Privacy:** Any inbox content that should be excluded (legal, HR, personal)?
9. **Sender allowlist/denylist:** Should certain senders always be flagged urgent (key clients) or always ignored (newsletters)?
10. **Action items from email:** Does the agent surface tasks (e.g., "X asked you to send the LOI") into the task system, or just summarize?

## Build Effort Estimate

~1 week for the agent itself once news sources and Gmail access are settled.
