# OVIS + OpenClaw Agent Projects — Index

Entry point for the agent architecture work. To resume planning, read this file plus the architecture spec and per-project planning docs linked below.

**To re-load full context in a future conversation, ask Claude to read this file.**

---

## Architecture Reference

- [ovis-openclaw-agent-architecture-specs.md](ovis-openclaw-agent-architecture-specs.md) — master architectural framework, decision rubric (OVIS vs. OpenClaw vs. Claude Code), cost strategy, build-order recommendation.

## Per-Project Planning Docs

Each is a scaffold awaiting a detailed interview pass to become a full spec.

| # | Project | Status | Priority Hint |
|---|---------|--------|---------------|
| A | [Master Voice Interface ("Hey OVIS")](project-a-master-voice-interface.md) | Scaffold | Unlocks voice for B/D/E |
| B | [CFO Agent (Weekly Financial Insights)](project-b-cfo-agent.md) | Scaffold | **Urgent — cash flow crunch** |
| C | [Hunter AI Refactor (OVIS → OpenClaw)](project-c-hunter-refactor.md) | Scaffold | Stops current token burn |
| D | [Task Dashboard + Morning Briefing](project-d-task-dashboard-morning-briefing.md) | Scaffold | Overlaps live Task System v2 |
| E | [News + Inbox Triage Briefing](project-e-news-inbox-triage.md) | Scaffold | Layers on Project A |
| F | [UX Audit Agent](project-f-ux-audit-agent.md) | Scaffold | Quality work, can wait |
| G | [Data Audit Agent](project-g-data-audit-agent.md) | Scaffold | Quality work, can wait |
| H | [Local Mac Mini OpenClaw Server](project-h-mac-mini-openclaw-server.md) | Scaffold | Enables C/E scraping |

## Suggested Build Order (from architecture spec §5)

1. **B** — CFO agent (cash flow visibility, urgent)
2. **A** — Master voice interface (unlocks downstream voice agents)
3. **D** — Task dashboard + morning briefing (daily productivity lift)
4. **C** — Hunter refactor (stop current token burn)
5. **E** — News + inbox triage (layers on voice)
6. **H** — Mac Mini OpenClaw server (enables scraping-heavy work)
7. **F**, **G** — UX + data audit agents (quality/maintenance)

*Order is not yet locked — pending Mike's prioritization pass.*

## Workflow

1. **Now:** Planning scaffolds exist for all eight.
2. **Next:** Mike prioritizes ordering.
3. **Then:** One project at a time — detailed interview between Mike and Claude turns each scaffold into a full implementation spec.
4. **Finally:** Build, using Claude Code on Max for OVIS-side work and OpenClaw for the agents.

## Key Cross-Cutting Decisions Still Open

These show up in multiple project docs and should likely be settled once, globally:

- **TTS provider:** ElevenLabs vs. Google Cloud TTS
- **Whisper:** OpenAI hosted vs. local on Mac Mini
- **Llama deployment:** model size, location, which projects use it
- **Telegram's residual role:** scheduled push only, or wider?
- **Master voice agent memory:** stateful across queries or standalone per tap?
