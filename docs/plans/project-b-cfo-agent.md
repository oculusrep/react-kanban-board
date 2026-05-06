# Project B — CFO Agent (Weekly Financial Insights)

**Status:** Planning scaffold — pending detailed interview
**Priority:** Highest near-term — directly addresses active cash flow crunch
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.B](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

A weekly AI CFO that knows current cash position, predicts shortfalls, and recommends actions (line of credit paydowns, AP timing, etc.). Available for ad-hoc voice queries between scheduled runs.

## Why Urgent

Active cash flow crunch. Need predicted-expenses-vs-cash visibility now.

## Current State

Bookkeeper agent already lives in OVIS (transactional categorization/reconciliation work — stays put). No CFO-level analytical agent exists. Cash visibility is manual today.

## Target Architecture

**Split:**
- **Bookkeeper stays in OVIS** — close to the data, transactional, synchronous
- **CFO moves out to OpenClaw** — autonomous schedule, analytical reasoning

CFO agent reads from OVIS + QuickBooks via tools, doesn't write back (read-only analyst).

## OVIS Tools to Build

Per the architecture doc:
- `get_current_cash_balance` — real-time balance across accounts
- `get_predicted_expenses(window_days)` — upcoming AP, recurring expenses, payroll
- `get_accounts_payable_aging` — what's due when
- `get_predicted_revenue(window_days)` — pipeline-weighted commission forecasts
- `get_line_of_credit_status` — balance, available credit, accruing interest
- `generate_cash_flow_forecast(weeks)` — assembled forecast output
- `send_email_report(recipient, content)` — for emailing reports on demand

## Agent Behavior

- Cron-triggered weekly (timing TBD — pre-meeting)
- Generates structured agenda + insights before the meeting
- Flags warnings: cash below threshold, LOC payment due, revenue gap vs. forecast
- Available ad-hoc via voice ("email me a 3-month cash flow forecast")

## Cost Profile

A few dollars per week. One scheduled run + occasional voice queries.

## Dependencies

- QuickBooks integration (exists? extent? read-only API access?)
- OVIS deal/commission pipeline data quality (forecast accuracy depends on it)
- Project A unlocks the voice ad-hoc path (but email/Telegram delivery works without it)

## Open Questions for Interview

1. **Forecast horizon:** What windows matter? (2 weeks / 4 weeks / 13 weeks / quarterly?)
2. **Cash threshold:** What's the "warn me" line? Single threshold, or tiered (yellow/red)?
3. **Pipeline weighting:** How are commissions weighted by deal stage today? Does that logic exist anywhere or does it need to be defined?
4. **Recurring expenses source:** Where does the agent learn about recurring AP (rent, payroll, subscriptions)? QB recurring schedules? Manual list in OVIS?
5. **Meeting cadence:** Weekly? What day/time? Briefing delivered how — email, Telegram, voice, or all three?
6. **Recommendation scope:** Read-only analyst, or can the agent take actions (e.g., schedule LOC paydown, send AP reminder)?
7. **QuickBooks access:** Direct API, intermediate sync table in OVIS, or read from QB exports?
8. **Multi-entity:** One CFO per entity, or consolidated across all the operating entities?
9. **History/trend:** Does the agent need to see weekly trend (cash 4 weeks ago vs. now) or is each run a snapshot?
10. **Authority for recommendations:** Should it cite source data (e.g., "deal X expected to close week of Y") or just summarize?

## Build Effort Estimate

OVIS tools: ~1 week if QB integration is straightforward, longer if not.
OpenClaw agent: ~2–3 days once tools exist.
