# Project D — Task Management Dashboard + Morning Briefing Agent

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.D](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

Two pieces:
1. A real OVIS task management UI — time blocking, prioritization, task list views, linked to OVIS records.
2. An OpenClaw agent that delivers a daily morning briefing (in the car) and accepts voice reprioritization.

## Current State

Task System v2 Phase 1 is live on `feat/task-system-v2` — 253 v1 tasks migrated, `/tasks` page serves the new UI, v1 retired (see memory `project_task_system_v2.md`). The dashboard work in this project likely *extends* v2 rather than starts from scratch — to confirm in interview.

## Target State

**OVIS dashboard:**
- Time-blocking view (calendar-style)
- Priority view
- Task list with filters
- Tasks linked to OVIS records (deals, properties, contacts)

**OVIS tools (called by the agent, not reasoned through by it):**
- `generate_daily_briefing(date)` — applies prioritization logic, returns structured summary
- `reprioritize_day(instructions)` — natural-language reorder
- `get_tasks_by_date(date)`
- `get_calendar_events(date)`

**OpenClaw agent:**
- Cron-triggered ~7 AM weekdays (or on-demand via voice)
- Calls `generate_daily_briefing` — agent does NOT reason through prioritization
- Reads briefing aloud via TTS
- Accepts follow-up voice commands ("move Crumbl call to 2pm") that route back to OVIS tools

## Key Architectural Principle

**Logic lives in the OVIS tool, not the agent.** Reasoning through prioritization from scratch every morning burns tokens and produces inconsistent results. Build the prioritization once in OVIS, agent just calls it.

## Dependencies

- **Project A (voice interface)** — required for the in-car briefing experience; dashboard ships independently
- Existing Task System v2 schema and UI patterns
- Calendar integration (Google Calendar — already wired? extent of access?)

## Open Questions for Interview

1. **Build on v2 or extend separately:** Does this project sit *inside* the Task System v2 work, or is it a sibling effort?
2. **Prioritization logic:** What rules define "what's most important" on a given day? (Due date, deal value, manual flag, age, dependency chains?)
3. **Time blocking:** Auto-suggested blocks based on duration estimates, or pure manual drag-and-drop?
4. **Calendar integration:** Read-only Google Calendar, or two-way sync (agent moves things on the calendar)?
5. **Briefing format:** What does an ideal morning briefing sound like — high-level "3 things matter today" or full task-by-task walkthrough?
6. **Trigger time:** Fixed 7 AM, or based on when you start driving (geofence/Bluetooth)?
7. **Reprioritization scope:** Voice commands change today only, or can they affect future days?
8. **Conflict handling:** What happens when reprioritization creates a calendar conflict?
9. **Mobile UI:** Does the dashboard need a usable mobile view, or desktop-only?
10. **Tasks created by other agents:** When Hunter or CFO surface action items, do those land as tasks here?

## Build Effort Estimate

Dashboard UI: 2–3 weeks.
OVIS tools (briefing, reprioritize): ~1 week.
OpenClaw briefing agent: ~3 days once Project A plumbing exists.
