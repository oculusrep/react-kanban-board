# Project F — UX Audit Agent

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.F](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

An autonomous agent that uses OVIS *as a real user would*, finds friction points, and recommends UX fixes. **Does not touch the codebase.**

## Why No Codebase Access

Deliberate separation of concerns: the UX agent stays naive on purpose so its perspective matches a real user's. Reading code dilutes that view. Findings hand off to coding agents (Claude Code) which decide *how* to fix.

## Current State

Nothing built. UX feedback today is ad-hoc / from your own usage.

## Target Architecture

OpenClaw agent, possibly using Claude with vision or Gemini for screenshot analysis.

**Flow:**
1. Logs into OVIS as a test user
2. Walks through key flows: deal entry, task creation, prospect lookup, etc.
3. Captures screenshots at each step
4. Identifies friction (broken layouts, confusing UX, dead ends, slow loads)
5. Produces a structured findings report
6. Hands off to coding agents for implementation

## Cost Profile

Heavier than briefing agents — longer reasoning loops, screenshot analysis. Run weekly or on-demand. **~$5–10 per audit run.**

## Dependencies

- A test-user account with safe-to-mutate data (or sandbox/staging environment)
- Browser automation runtime (Playwright? Computer Use?)
- A defined list of "key flows" to walk through

## Open Questions for Interview

1. **Browser automation choice:** Playwright + vision model? Claude Computer Use? Browserbase?
2. **Test data isolation:** Does the agent operate against prod with a flagged test user, or against a staging environment?
3. **Flow inventory:** What are "the key flows"? (Deal entry, task creation, prospect lookup were named — full list?)
4. **Findings format:** Markdown report? Structured JSON? Tickets created directly in the task system?
5. **Severity scoring:** Should findings be graded (blocker / annoyance / nitpick)?
6. **Cadence:** Weekly? Per-PR? On-demand only?
7. **Regression catching:** Should it remember past findings and re-check that they're fixed?
8. **Screenshot retention:** Where do screenshots live? Privacy concerns with real-ish data in screenshots?
9. **Hand-off to coding agent:** Manual review step between UX audit findings and code changes, or auto-pipeline?
10. **Scope boundary:** Pure UX, or also functional bugs (broken buttons, 500s)? Risk of overlap with Project G (data audit).

## Build Effort Estimate

~1–2 weeks. Browser-automation plumbing is the bulk; agent logic is straightforward once it can drive the browser.
