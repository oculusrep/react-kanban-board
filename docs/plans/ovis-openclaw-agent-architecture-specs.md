
# OVIS + OpenClaw Agent Architecture — Specs & Project List

Working document from the voice conversation on May 5, 2026. Captures the architectural framework, individual project specs, infrastructure plan, and cost strategy.

---

## 1. Architectural Principles (the decision framework)

The core question every time you build something new: **does this belong in OVIS, in OpenClaw, or in Claude Code direct?**

**Lives in OVIS:**
- Tools and API endpoints (deal queries, task creation, email send, financial data fetchers)
- User-facing dashboards and UIs
- Data model and business logic
- Synchronous workflows that respond to user actions
- Tightly-coupled, transactional agents (e.g., bookkeeper doing categorization/reconciliation)

**Lives in OpenClaw:**
- Autonomous agents that run on schedules (cron-triggered loops)
- Multi-agent orchestration where agents coordinate with each other
- Agents that need persistent state across sessions
- Anything that should run while you're asleep or driving
- Agents that treat OVIS as a black-box tool layer (e.g., UX audit, prospecting, CFO analysis)

**Stays in Claude Code (Max subscription):**
- Feature development for OVIS
- Bug fixes
- Codebase auditing
- Interactive, guided coding work
- One-off scripts and analysis

**Cost rule of thumb:** OpenClaw runs on the Claude API and burns tokens fast on continuous loops (you saw $50–$60 in a few hours). Claude Max covers most interactive work under a flat subscription. Be deliberate about what gets autonomous loops — schedule them, don't leave them running hot.

---

## 2. Project List

### Project A — Master Voice Interface ("Hey OVIS")

**Goal:** Talk to your agents from the car via iPhone. One tap, voice in, voice out.

**Architecture:**
1. iOS Shortcut on your iPhone — single tap launches voice recorder
2. Audio gets transcribed via Whisper API
3. Transcribed text hits your OpenClaw master agent via API call
4. Master agent reasons about intent, routes to the right sub-agent (CFO, Hunter, task manager, etc.)
5. Sub-agent calls OVIS tools as needed, returns structured response
6. Response sent back to Shortcut, played aloud via TTS (ElevenLabs or Google Cloud TTS)

**Why no Telegram in this path:** Direct API call from Shortcut → OpenClaw is faster and cleaner. Telegram is reserved for scheduled briefings (CFO weekly report, etc.).

**Cost profile:**
- Whisper transcription: pennies per query
- OpenClaw agent reasoning: standard Claude API token cost per call (no idle loops)
- TTS playback: fraction of a cent per thousand characters
- No monthly TTS quota — pure pay-as-you-go. Set spending alerts.

**Components to build:**
- iOS Shortcut (built in Apple Shortcuts app, not code)
- Master orchestrator agent on OpenClaw with routing logic
- Whisper integration
- TTS integration
- Logging — OpenClaw stores JSONL transcripts by default; optionally surface in OVIS dashboard

**Build effort:** ~1–2 weeks of focused work using Claude Code for the backend.

---

### Project B — CFO Agent (Weekly Financial Insights)

**Goal:** Run a weekly meeting with an AI CFO that knows your cash position, predicts shortfalls, and recommends actions (e.g., line of credit paydowns).

**Why this is urgent:** Active cash flow crunch. Need visibility into predicted expenses vs. cash balance.

**Architecture:** Lives on OpenClaw, pulls from OVIS + QuickBooks data via tools.

**Tools to build in OVIS (Claude Code work):**
- `get_current_cash_balance` — real-time balance across accounts
- `get_predicted_expenses(window_days)` — upcoming AP, recurring expenses, payroll
- `get_accounts_payable_aging` — what's due when
- `get_predicted_revenue(window_days)` — pipeline-weighted commission forecasts
- `get_line_of_credit_status` — balance, available credit, interest accruing
- `generate_cash_flow_forecast(weeks)` — assembled forecast output
- `send_email_report(recipient, content)` — for emailing reports on demand

**Agent behavior:**
- Runs once a week on schedule (cron)
- Generates structured agenda + insights before your meeting
- Flags warnings (cash dipping below threshold, line of credit due, revenue gaps)
- Available for ad-hoc queries via voice ("email me a 3-month cash flow forecast")

**Cost profile:** Few dollars per week max — single weekly run + occasional voice queries.

**Note:** Bookkeeper stays embedded in OVIS (transaction categorization, reconciliation — close to data state). CFO comes out to OpenClaw (analysis, strategy — needs autonomous schedule).

---

### Project C — Hunter AI Refactor (OVIS → OpenClaw)

**Goal:** Move Hunter prospecting agent out of OVIS codebase and onto OpenClaw as an autonomous prospecting agent.

**Current state:** Hunter lives inside OVIS Claude codebase. Scrapes websites, finds prospects, generates outreach emails, populates lists in OVIS. Inefficient — burning tokens on OVIS context reloads.

**Target state:**
- Hunter runs autonomously on OpenClaw on a schedule (e.g., overnight)
- Pulls list of target sites and outreach criteria from OVIS via tool
- Scrapes, analyzes articles, generates outreach drafts
- Pushes prospect records back into OVIS via tool: `create_prospect`, `attach_outreach_draft`

**Tools needed in OVIS:**
- `get_hunter_target_sites` — your watchlist of sites to scrape
- `get_outreach_criteria` — your filters and ICP definition
- `create_prospect(data)` — write new prospect record
- `attach_outreach_draft(prospect_id, draft_email)` — link draft to prospect

**Considerations:**
- Could potentially run on Llama for the bulk scraping/categorization work (cheaper, repetitive task) and use Claude only for the final outreach email drafting (needs nuance)
- Best run on the local Mac Mini (see Project H) for residential-IP scraping advantage

---

### Project D — Task Management Dashboard + Morning Briefing Agent

**Goal:** Build the OVIS task management UI for time blocking, prioritizing, task management. Add an OpenClaw agent that gives you a daily morning briefing in the car.

**OVIS components (Claude Code work):**
- Task dashboard UI: time blocking view, priority view, task list
- Tasks linked to OVIS records (deals, properties, contacts)
- Tool: `generate_daily_briefing` — takes calendar + tasks, applies your prioritization logic, returns structured summary
- Tool: `reprioritize_day(instructions)` — accepts natural language instructions, reorders tasks
- Tool: `get_tasks_by_date(date)` and `get_calendar_events(date)`

**OpenClaw agent:**
- Triggered automatically at, say, 7 AM weekdays — or on-demand via voice
- Calls `generate_daily_briefing` (the heavy lifting happens in the OVIS tool, not in agent reasoning — keeps tokens down)
- Reads briefing aloud via TTS during your commute
- Accepts follow-up commands: "reprioritize my day," "move the Crumbl call to 2pm," etc., which call back into OVIS tools

**Why the logic lives in OVIS not the agent:** If the agent reasons through prioritization from scratch every morning, you burn tokens. Build the prioritization tool in OVIS once, agent just calls it. Way cheaper, more consistent.

---

### Project E — News + Inbox Triage Briefing Agent

**Goal:** Spoken summary in the car of (1) industry news you need to know and (2) email triage — what's urgent vs. can wait.

**Architecture:** OpenClaw agent, runs once or twice daily.

**News component:**
- Scrapes industry news sources (CRE-specific feeds, market news)
- Summarizes 3–5 key items relevant to your deals/markets
- Possibly use Llama for the summarization (repetitive, structured)

**Inbox triage component:**
- Scans Gmail inboxes (multiple folders)
- Classifies each email: urgent today / this week / FYI / can ignore
- Returns prioritized list with one-line rationale per item
- Does NOT draft replies (that's a separate agent if wanted)

**Cost profile:** Lightweight — few seconds of agent reasoning per run, maybe $1–2/week.

**Integration with voice interface:** Triggered via Shortcut on demand ("brief me") or scheduled at 7 AM.

---

### Project F — UX Audit Agent

**Goal:** Autonomous agent that uses OVIS as a real user would, finds friction points, recommends UX fixes — but does NOT touch the codebase itself.

**Architecture:** OpenClaw agent, possibly using Gemini or Claude with vision/screenshot capability.

**Behavior:**
- Logs into OVIS as a test user
- Clicks through key flows: deal entry, task creation, prospect lookup, etc.
- Captures screenshots, identifies friction (broken layouts, confusing UX, dead ends)
- Produces structured findings report
- Hands off findings to your coding agents (Claude Code) which decide *how* to fix

**Why no codebase access:** Keeps the UX agent's perspective fresh — it sees what a user sees. Mixing in code reading dilutes that. Separation of concerns: UX agent observes, coding agent implements.

**Cost profile:** Heavier than briefing agents (longer reasoning loops, screenshots), but only run weekly or on-demand. Maybe $5–10 per audit run.

---

### Project G — Data Audit Agent

**Goal:** Different from UX audit. This one checks OVIS *data integrity* — orphaned records, broken relationships, overdue tasks, deal pipeline inconsistencies.

**Architecture:** OpenClaw agent, scheduled weekly.

**Tools needed in OVIS:**
- `find_orphaned_records(table)` — records without expected parent relationships
- `find_overdue_tasks` — past-due, unflagged
- `find_pipeline_inconsistencies` — deals in weird states
- `find_data_quality_issues` — missing required fields on key records

**Output:** Email or dashboard report of findings + suggested cleanup actions.

---

## 3. Infrastructure — Local Mac Mini OpenClaw Server

**Goal:** Run OpenClaw on a Mac Mini at the office, always-on, residential IP.

**Why local:**
- Residential IP helps with scraping sites that block cloud data center IPs
- For sites that require login (like that news site you couldn't access from cloud), you can wrap your working terminal command as an OpenClaw tool that executes locally
- The Mac Mini executes the scrape from your residential IP even though you trigger it remotely via OpenClaw API
- Always-on availability without keeping your laptop running

**Caveat:** Local IP isn't a silver bullet. Sites that fingerprint behavior (headers, request patterns, rate limits) will still block you regardless of IP. Plan on:
- Rotating user-agent headers
- Request throttling / human-like timing
- Session/cookie management for logged-in scraping

**Setup checklist:**
- Mac Mini with sufficient RAM for OpenClaw + any local Llama instances
- Static local network setup or Tailscale for remote access
- OpenClaw installed with persistent session config (tmux or similar)
- API endpoint exposed (via Tailscale or similar — don't expose to public internet)
- Optional: local Llama model for cheap repetitive tasks

---

## 4. Cost Strategy — Claude Max vs. OpenClaw vs. Llama

**Claude Max ($X/month flat):**
- Use for: feature dev, bug fixes, OVIS codebase work, interactive design sessions with me
- Lesson learned: yesterday's $50–60 OpenClaw burn was likely feature work that should've been Claude Max
- Rule: if you're guiding the work step-by-step, stay in Claude Max

**OpenClaw / Claude API (token-priced):**
- Use for: autonomous scheduled agents (CFO, Hunter, briefings, audits)
- Use for: master voice orchestrator (only runs when you talk to it)
- AVOID for: feature development, overnight coding runs (burns tokens fast on long task lists)
- Schedule discipline: most agents run once daily or weekly, not continuously

**Local Llama (one-time hardware cost, no token cost):**
- Good for: repetitive structured work — Hunter's bulk scraping/categorization, bookkeeper categorization, news summarization
- NOT good for: nuanced reasoning, voice agent intent routing, CFO strategic analysis
- Mix-and-match within a single agent is fine: Llama does the bulk, Claude does the smart parts

**Decision rule for each new agent:**
1. Does it need to run autonomously on a schedule? → OpenClaw
2. Does it do mostly repetitive structured work? → Consider Llama for the bulk
3. Does it need nuanced reasoning or voice context? → Claude API
4. Am I building it interactively right now? → Claude Code on Max

---

## 5. Build Order Recommendation

If I were sequencing these for maximum near-term value given the cash flow crunch:

1. **CFO agent + financial tools** (Project B) — directly addresses the cash visibility problem
2. **Master voice interface** (Project A) — unlocks all the other voice use cases
3. **Task management dashboard + morning briefing** (Project D) — daily productivity lift
4. **Hunter refactor** (Project C) — stop burning tokens on the existing setup
5. **News + inbox triage** (Project E) — nice-to-have, layers onto voice interface
6. **Mac Mini OpenClaw setup** (Project H) — enables the scraping-heavy stuff
7. **UX + data audit agents** (Projects F, G) — quality/maintenance work, can wait

---

## 6. Open Questions / Decisions to Make

- TTS provider: ElevenLabs (better voice quality, more expensive) vs. Google Cloud TTS (cheaper, decent quality)?
- Whisper: OpenAI hosted vs. local Whisper on the Mac Mini?
- Should the master voice agent have its own conversation memory across queries, or treat each Shortcut invocation as standalone?
- Llama deployment: which model size, where (Mac Mini local, or separate hardware)?
- Telegram still useful for: scheduled push briefings (CFO weekly summary), or fully replaced by voice?

---

*This doc is the working spec. As we build each project, we'll create more detailed implementation docs per agent.*
