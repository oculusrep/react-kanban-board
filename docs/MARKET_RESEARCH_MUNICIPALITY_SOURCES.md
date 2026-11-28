# Market Research — municipality source memory

This is the OVIS side of "fix (b)" from the Alcovy Road sweep review
(2026-11-14). Every chunk of that sweep rediscovered the same dead ends: no
Covington portal, blocked CPC agendas, and Oxford minutes missing after 2022.
Chunks also contradicted each other about whether Newton County's portal
exists.

## Table `municipality_source` (migration 20261114070306)

| Column | |
|---|---|
| `boundary_municipality_id` | the municipality, keyed on the same ids the checklist uses |
| `source_type` | `permit_portal` / `minutes` / `agendas` / `plat_records` |
| `url` | NULL only for `none_exists` |
| `status` | `works` / `blocked` / `none_exists` |
| `notes` | how to use it, or why it fails |
| `last_verified`, `verified_by_run_id` | when, and which run, last confirmed it |

- One row per (municipality, source type, URL).
- RLS: internal users can read. Only `service_role` (the MCP) writes.

## MCP tools (`ovis-research-mcp`)

- `get_municipality_sources(municipality_ids[])` returns every entry with
  `effective_status`. A `blocked` or `none_exists` entry older than **90
  days** comes back as `unverified` with `recheck_before_skipping: true`. The
  agent checks it once more before skipping it, then records the result.
- `set_municipality_source(boundary_municipality_id, source_type, url?,
  status, notes?, research_run_id?)` inserts or updates the entry and stamps
  `last_verified = now()`.

The agent prompt (OpenClaw side) needs to call `get_municipality_sources`
before each municipality and `set_municipality_source` whenever it learns
something.

## Seed (from sweep 607d4cc7)

| Municipality | Source | Status | Key fact |
|---|---|---|---|
| Covington | permit portal | none exists | paper / in person only (all 6 chunks agree) |
| Covington | agendas | blocked | CPC PDFs have unguessable filenames, and some months were never posted. Use City Council agendas and minutes instead. |
| Covington | minutes | blocked | CPC minutes only go up to Apr 2023. Council minutes work. |
| Oxford | permit portal | none exists | paper only |
| Oxford | minutes | none exists | PC minutes stop after 2022 |
| Oxford | agendas | works | council e-packets; some are too large or return 404 |
| Newton County | permit portal | **works** | `newtondevelopment.ncboc.com/case_status/`: public, no login, needs a browser |
| Newton County | plat records | works | same portal (PP/FP cases) |
| Newton County | agendas | works | AgendaCenter: plain fetch gets 403 (Cloudflare), firecrawl works, IDs aren't sequential |
| Newton County | minutes | works | BOC minutes, posted with a lag |

**Newton portal contradiction, settled:** it works. Chunks 1, 2, 4 and 5 used
it, and chunk 5 confirms "no login required". On 2026-11-14 both
`/` and `/case_status/` returned HTTP 200. Chunk 0 said "not drivable" because
`web_fetch` can't render its JavaScript, which is a tool limit. Chunk 3 simply
didn't find it.
