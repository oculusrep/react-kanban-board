# Market Research Agent + OVIS MCP — Build Spec

> **For:** Claude Code (building the OVIS side + MCP service)
> **Companion build:** OpenClaw market-research subagent (system prompt written separately, after this MCP exists)
> **Owner:** Mike Minihan, Oculus Real Estate Partners
> **Last updated:** June 6, 2026

---

## 1. Purpose

Build an autonomous market research agent that, given a single Starbucks site submit in OVIS, produces a "growth story" for the surrounding trade area — specifically, all residential developments of **25+ units** within a **10-mile radius** of the site. The agent replaces a manual, inconsistent VA process that frequently hits dead-ends and escalates to Mike.

The agent runs as a **subagent of Prime** (the OpenClaw orchestrator) and only runs when explicitly triggered. It is never polling, never running on a heartbeat.

This document specifies what Claude Code needs to build: the OVIS-side data structures, the approval UI, and the MCP service that the OpenClaw agent calls. The OpenClaw agent's system prompt is a separate deliverable that depends on this MCP being defined first.

---

## 2. What counts as a target development

**In scope:** residential developments that increase population —
- Single-family home subdivisions
- Townhome subdivisions
- Apartment / multifamily complexes
- Senior living / 55+ communities

**Threshold:** 25+ units. A single permit for one house is ignored. Master-planned developments count. If a municipality permits one house at a time, the agent may have to aggregate, but the unit of interest is the *development*, not the individual home.

**Timing value ranking:** Planned / permit-applied / approved / under-construction developments are **more valuable** than completed ones. Recently completed (last ~2 years) still has value. Forward-looking growth signals are the whole point — this is what Starbucks' own sales-prediction tools miss.

**Lookback:** Last 2 years for permit searches.

---

## 3. End-to-end workflow

1. **Trigger.** Mike clicks "Start Research" on a site submit in OVIS. (Manual only — never automatic.)
2. **Resolve radius.** Agent determines which counties, cities, and municipalities fall within a 10-mile radius of the site's lat/long, by querying an OVIS boundary dataset (see §6 — built as a separate project, assumed to exist).
3. **Build checklist.** Agent creates a prioritized municipality checklist, linked to the site submit. **Priority order: closest to the site first** — subject city, then its county, then surrounding cities/counties by distance, working outward.
4. **Research each municipality, in priority order.** For each (see §4 for the protocol).
5. **Compile report.** Two sections: (a) structured records ready to write, (b) a free-text "needs review" section for anything that doesn't fit the schema or is incomplete.
6. **Submit to OVIS as PENDING.** Report lands in a staging state — not live records.
7. **Notify.** Agent sends Mike a Telegram message: "Report ready for review on Site X."
8. **Review & edit.** Mike reviews in OVIS, edits/deletes rows inline, tweaks wording.
9. **Approve & Commit.** Mike clicks "Approve & Commit" in OVIS → this promotes staged records to live OVIS records.
10. **Mark complete.** Municipalities marked complete on the checklist as their data is committed.
11. **Next site.** Agent works **one site at a time, sequentially** — finishes a site fully before starting the next. No parallel processing (cost control, auditability).

---

## 4. Per-municipality research protocol

This is a **starting protocol, not a straitjacket.** The agent works autonomously and creatively — if it finds a faster or more effective avenue (a developer association, a county news outlet, a builder forum), it should take it, and **note the alternative avenue in the report.**

**Step A — Low-hanging fruit first (broad announcement search).**
Before any formal database work, run a couple of web searches for recently announced/proposed residential developments in the municipality/county (last ~1 year). News articles, groundbreakings, developer announcements often surface *before* anything hits a permit system. For each hit, capture: project name, builder, builder website, proposed unit count, location (intersection/address/area). These become initial candidate records and give the agent search terms for the formal step.

**Step B — Economic development department.**
- Find the municipality's econ dev department site (sometimes Planning & Zoning, sometimes elsewhere — varies).
- Find contact(s), usually listed on the econ dev site.
- Send an email (open records request) asking for a list of all active residential new-construction projects plus anything permitted / applied-for / approved. Some municipalities have a **formal open records request form** — fill it out if present.
- Email comes from a **dedicated agent email alias** that looks like it's from a person (see §5).
- Often this work is already done on their end and they just send it back — frequently as **Excel, CSV, or PDF.** The agent must be able to parse all three, extract matching data, and turn it into candidate records.

**Step C — Citizens Portal (permit database).**
- Many GA municipalities run on a shared platform called a **"Citizens Portal."** This is the primary permit-search tool to look for.
- Permit *types* vary by municipality and are named inconsistently (land disturbance permit, residential building permit, etc.), selected from a **dropdown**.
- **Escalation rule:** if the agent is unsure which dropdown permit-type options to search, it **pauses and messages Mike via Telegram** with the full list of dropdown options seen, and waits for direction before proceeding. (See §5 — this is a real-time pause, separate from the final report.)
- Lookback: 2 years.

**Step D — Gap-filling (missing fields, especially unit count).**
When a development is found but missing a key field (most often unit count), the agent is **persistent before escalating.** Try, in order:
1. Web search: project name + city + state
2. News articles about the development
3. Builder's website
4. Planning & zoning meeting minutes / agendas (developers often present full details, including unit counts, here)

One or two good searches usually crack it. Only after these come up empty does the agent flag the record as incomplete in the "needs review" section. (Assessor records explicitly NOT worth pursuing.)

---

## 5. Communications & escalation

**Agent email alias.**
- Mike sets up a dedicated email address for the agent. Looks like it's from a person; it's an alias.
- **Ideal capability:** the agent can read replies to that inbox, open attachments (Excel/CSV/PDF), determine whether the contents match what we need, and if so, write the data directly into OVIS via MCP (into the pending/staging state). If contents don't match, flag for manual review.
- This is the highest-value automation in the whole flow — open records responses often contain the entire dataset pre-assembled.

**Telegram escalations (real-time, mid-research).**
- The Citizens Portal dropdown question (Step C) is a real-time pause: agent messages Mike, waits, resumes. The research task just sits paused until Mike answers. **Keep this Telegram-only — OVIS does not need to track a "paused-awaiting-input" state** (keeps OVIS simple). Flag this to Claude Code so a task going quiet mid-run isn't treated as a failure.

**Telegram notifications.**
- When the report is ready, agent sends Mike a Telegram notification pointing him to OVIS.

---

## 6. OVIS boundary dataset (separate project — assumed to exist)

A dataset of GA city/county/municipal boundaries lives in OVIS, queryable via MCP, so the agent does **not** burn tokens computing municipalities on the fly each run. Building this is a **separate project** from this spec, but this agent depends on it. The relevant MCP call (`get_municipalities_in_radius`) assumes it's there.

---

## 7. Record schema (per development)

Most of these fields reportedly already exist in OVIS' municipality/development table; tweak as needed.

| Field | Notes |
|---|---|
| Project name | |
| Status | Normalized set: **Approved / Under Construction / Recently Completed / Pending** |
| Unit count | Total units for the development (25+ to qualify) |
| Permit URL | Direct link into the Citizens Portal permit record, if available — so Mike can click straight to it from OVIS |
| Builder / developer name | |
| Permit application date | |
| Notes | Any extra detail, especially from a municipality-supplied spreadsheet |
| **Source** | Where the agent got this record (e.g. "Citizens Portal permit #12345", "news article — [outlet]", "builder website", "econ dev email attachment"). Required on every record for traceability/validation. |
| Location | Address / intersection / lat-long / area |

**Needs-review items** don't fit this schema by definition — they need a home in OVIS too, probably a free-text report attached to the site submit. Tell Claude Code this is coming so the schema has room for it.

---

## 8. MCP tool contract

Design priority: **minimize token spend.** Batched calls over chatty per-record calls. Mike is new to MCP — keep it simple.

Agent-facing MCP tools:

1. **`get_municipalities_in_radius(site_id)`**
   Returns the counties/cities/municipalities within the 10-mile radius of the site, ideally pre-sorted by distance from the site (closest first) so the agent doesn't compute ordering.

2. **`create_research_checklist(site_id, municipalities[])`**
   Logs the prioritized checklist as a new record type linked to the site submit. Checklist tracks per-municipality status.

3. **`update_checklist_status(checklist_id, municipality, status)`**
   Marks a municipality complete (or in-progress) so Mike can see progress and knows when the site is done.

4. **`submit_research_report(site_id, candidate_records[], needs_review)`**
   The **single batched write.** Lands all structured candidate records into the **PENDING/staging state**, plus the free-text needs-review content. One call, not one-per-record (token cost).

Not agent-facing (OVIS-side):

5. **Approve & Commit action.**
   The OVIS approval screen lets Mike edit/delete/tweak staged rows, then promotes them from staging to live records. This is a build in OVIS, not OpenClaw. Two-phase write: agent stages → Mike commits.

**Trigger endpoint:**
- OVIS POSTs to OpenClaw's gateway at **`/api/research/start`** (site_id + lat/long) when Mike clicks Start Research. **Trigger, not poll** — no periodic polling (token cost).

---

## 9. Architecture split (who builds what)

**Claude Code / OVIS side:**
- Boundary dataset + radius query (separate project, prerequisite)
- Research checklist record type (linked to site submit, per-muni status)
- Staging state for pending records + free-text needs-review storage
- The "Approve & Commit" approval screen (inline edit/delete/tweak)
- The MCP service exposing tools 1–4 above
- Commit logic promoting staged → live

**OpenClaw side (separate deliverable, after MCP exists):**
- Market-research **subagent of Prime**, triggered only via `/api/research/start`
- System prompt encoding the §4 protocol, §5 escalations, and **token-efficiency as a top-level operating principle**:
  - Batch MCP calls; never chatty
  - Reuse already-gathered info instead of re-searching
  - Report dead ends cleanly instead of trying ten more angles
  - "Good enough" data over "perfect" data
  - Prefer cheap search strategies over expensive crawls

---

## 10. Test cases (validate agent output against known-good work)

Municipalities where Mike already has solid growth-story research in OVIS to compare against:
- Winder, GA
- Jackson County, GA
- Barrow County, GA
- Hoschton, GA

---

## 11. Open items to resolve during build

- Confirm which existing OVIS fields map to §7, and which need adding (notably **Source** and the **needs-review** free-text home).
- Decide the exact shape of the `candidate_records[]` payload for `submit_research_report` (field names matching OVIS columns).
- Confirm whether the agent-reads-email-inbox capability is in v1 or a fast follow (it's the highest-value automation, but also the most moving parts — Gmail access, attachment parsing).
- Keep the full design interview transcript saved — it's the source for writing the OpenClaw subagent prompt once this MCP is live.
