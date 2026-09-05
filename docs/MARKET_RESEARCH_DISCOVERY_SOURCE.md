# `discovery_source` — field reference

Companion to the free-text `source` citation on market-research records. Records **which research phase actually found a record**, so phase-level "is this worth keeping?" questions have a real answer.

Motivated by [MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md](MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md), which established that `source` cannot answer that question — 46% of records cite two or more source types in one string, so any bucketing of it is an artifact of citation ordering.

Added across five migrations:

| Migration | What |
|---|---|
| [`20260901120000_research_run_cost_tracking.sql`](../supabase/migrations/20260901120000_research_run_cost_tracking.sql) | `research_run` cost/token columns |
| [`20260901120100_discovery_source.sql`](../supabase/migrations/20260901120100_discovery_source.sql) | the column, constraint, normalizer, RPC + UI threading |
| [`20260901140000_discovery_source_raw.sql`](../supabase/migrations/20260901140000_discovery_source_raw.sql) | `discovery_source_raw` + taxonomy-gap view |
| [`20260901160000_reject_reason.sql`](../supabase/migrations/20260901160000_reject_reason.sql) | reject reason / who / when; bulk reject requiring a reason |
| [`20260904120000_staging_cross_run_dedupe.sql`](../supabase/migrations/20260904120000_staging_cross_run_dedupe.sql) | cross-run staging duplicate probe |

`source` is **unchanged and still required**. All of this is additive.

---

## The taxonomy

| Value | Means |
|---|---|
| `pz_agenda` | P&Z / planning commission / BOC / council agendas and minutes |
| `news` | News articles, press coverage, press releases |
| `permit_portal` | Citizens Portal / Accela / EnerGov permit lookups |
| `activity_pdf` | Monthly permit-activity report PDFs |
| `builder_site` | Builder or developer websites and listings |
| `econ_dev` | Econ-dev pages or open-records email attachments |
| `other` | None of the above |
| `NULL` | **Not reported** — the agent did not say |

`NULL` is not a value; it is the absence of one. It is **deliberately not defaulted**. A default would manufacture attribution that was never observed, which is precisely the failure this column exists to fix.

Present on `municipal_project_staging` and `municipal_project`, exposed through `municipal_project_v` and `get_sweep_staging`.

---

## Constrained *and* normalized — why both

A CHECK constraint enforces the closed set on both tables. But the constraint alone would be actively dangerous.

`submit_research_report` stages an entire run's candidates in **one INSERT statement**. A single unrecognized string from the agent would violate the constraint and abort the whole batch — losing every record in that run. This is the same failure class as the 2026-07-13 malformed-number incident that the defensive numeric casts were added to prevent.

So `normalize_discovery_source(text)` runs first and guarantees the RPC can never violate the constraint:

- Recognized value (case- and hyphen-insensitive: `"PZ-Agenda"` → `pz_agenda`) → that value
- Blank / whitespace → `NULL`
- **Anything else → `'other'`**

The constraint then serves as schema-level documentation and a guard against direct writes that bypass the RPC.

---

## `discovery_source_raw` — the coercion is lossy, so preserve the original

Coercing to `'other'` keeps batches safe but destroys information:

> A legitimate new source type we haven't added to the taxonomy — "county newsletter", "school board capacity study" — is indistinguishable from garbage. Both land on `'other'`, and **nothing would ever tell us the seven values should be eight.** The taxonomy could be wrong for years and every report would look clean.

`discovery_source_raw` fixes that. It stores the agent's original string **only when the value was not recognized**:

| Agent sent | `discovery_source` | `discovery_source_raw` |
|---|---|---|
| `"permit_portal"` | `permit_portal` | `NULL` |
| `"  PZ-Agenda  "` | `pz_agenda` | `NULL` |
| `"other"` | `other` | `NULL` |
| `"county newsletter"` | `other` | `county newsletter` |
| *(absent)* | `NULL` | `NULL` |

Because it's populated only on coercion, it is not a duplicate of `discovery_source` — it is exactly and only the taxonomy-gap signal.

**A column rather than a logged warning, deliberately.** A `NOTICE` or `console.warn` is gone the moment nobody is tailing logs, and this signal is only useful if it accumulates over months. It has to be durable and queryable.

### Finding taxonomy gaps

```sql
SELECT * FROM discovery_source_taxonomy_gap;
```

| Column | |
|---|---|
| `raw_value` | the unrecognized string |
| `occurrences` | total across staged + committed |
| `staged_rows` / `committed_rows` | split |
| `first_seen` / `last_seen` | |

**An empty view means the taxonomy is currently adequate.** A value recurring here is evidence the allowed set should grow — add it to the CHECK constraints, `normalize_discovery_source()`, `DISCOVERY_SOURCE_OPTIONS` in the approval modal, `DISCOVERY_SOURCE_LABELS` in the slideout, and the MCP tool enum.

`discovery_source_raw` **survives a reviewer reclassifying the row.** It records what the *agent* reported; a reviewer deciding the record is really `builder_site` doesn't change the fact that the agent emitted something outside the taxonomy, and that fact is the signal being accumulated.

---

## ⚠️ Override semantics: `discovery_source` differs from every other field

**This is a trap. Read it before touching `approve_research_staging_rows`.**

The approval path now has **two different override semantics**, deliberately:

| Fields | Semantics | Behavior on explicit null |
|---|---|---|
| `location_description`, `parcel_boundary_notes`, `address`, `project_name`, `source`, `notes`, `builder_developer`, `permit_url`, unit counts… | `COALESCE(override, staged)` | Falls back to the staged value |
| **`discovery_source`** | **key-presence test** | **Clears to NULL** |

```sql
-- Every other field:
COALESCE(v_row->>'location_description', v_staging.location_description)

-- discovery_source:
CASE WHEN v_row ? 'discovery_source'
     THEN normalize_discovery_source(v_row->>'discovery_source')
     ELSE v_staging.discovery_source
END
```

### Why they differ

Under `COALESCE`, an explicit null falls back to the staged value — so a reviewer **cannot clear a wrong value back to "not reported."**

For `location_description` that's harmless: the field is a free-text hint, blanking it is rare, and the staged value is better than nothing.

For `discovery_source` it defeats the column's purpose. If the agent misattributes a record, the reviewer must be able to retract that attribution rather than being forced to pick some other wrong value. An un-retractable bad attribution silently corrupts exactly the phase-level statistics this column exists to produce — and it would corrupt them *invisibly*, which is worse than having no column at all.

So: **absent key = no override, present-but-null = deliberate clear.**

The UI cooperates: the dropdown's blank option (`— not reported —`) submits `discovery_source: null` with the key present, and the modal only includes a key at all when the reviewer actually edited that field.

`discovery_source_raw` is a third case — **never overridable**, always taken from staging, for the reason in the previous section.

If you add another field where a reviewer needs to be able to clear a value, use the key-presence form and add it to the table above.

---

## Two findings that revise the attribution picture

Both surfaced while triaging runs `a14c3e7b` / `ee1be095` on 2026-09-01. Recorded here because they change how the next cut decision should be read.

### `permit_portal`'s 645 units may never have been permit-derived

The [attribution analysis](MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md) credited `permit_portal` with 3 records / 645 units — its entire measured yield. On inspection that credit is weaker than it looked:

- **All three records have `permit_url = NULL`.** The Accela permit numbers (`HSUB23-0007`, `HSUB23-0008`, `HSUB24-0001`) appear only inside the free-text `source`; no URL was ever captured.
- **The unit counts came from elsewhere.** Clark Farms' 365 lots came from a Trulia listing for an adjacent property; Ponderosa Farms' 156 from a Chafin Communities site map; Union Heights' 124 from Century Communities' close-out inventory. The permit records are Subdivision Final Plats — they establish that a plat was filed, not how many units it covers.

So the permit portal plausibly contributed *existence and timing* while builder sites contributed the *numbers* the yield figure is built from. **`permit_portal`'s apparent 645-unit yield is probably overstated, and `builder_site`'s understated.**

This revises the phase-yield picture **downward** for the one phase that looked like a plausible cut candidate on volume grounds. It does not make the cut decision easier — it makes the old numbers less trustworthy in a second, independent way, on top of the ordering artifact. Do not cut `permit_portal` on yield until `discovery_source` has produced real data.

A cheap improvement while we're here: the agent should populate `permit_url` for permit-portal records, not just cite the permit number in prose. Without a URL these records cannot be re-verified without a manual portal search. *(Agent-prompt change — not made here.)*

### Same-window re-runs are a dedupe gap

Runs `a14c3e7b` (20:39) and `ee1be095` (20:45) — six minutes apart, same evening, same Hall County scope — independently staged **the same four BOC agenda items**:

| Agenda item | `a14c3e7b` | `ee1be095` |
|---|---|---|
| `item/2730` | 1731 Friendship Rd Mixed-Use (Denied), 185 | 1731 Friendship Road Multi-Family, 185 |
| `item/2468` | Haselton On Lanier Phase 1, 216 | Haselton on Lanier Phase 2, 216 |
| `item/2512` | Buffington Farm Road New PRD, 121 | Haselton on Lanier Phase 3, 121 |
| `item/2579` | Avilla Friendship Trails, **129** | Thompsons Mill Road Rental, **133** |

**None of it was caught.** `matched_existing_id` was false on all 14 rows, and the soft proximity dedupe did not flag them either. The reasons are structural:

1. **The dup probes only look at committed `municipal_project` rows** — never at other *staging* rows. Two runs staged concurrently are invisible to each other by construction.
2. The `(project_name, address)` probe fails because the agent named the same project differently across runs, and the addresses differ in formatting and in which parcel of a multi-parcel item they cite.
3. The `permit_url` probe — which *would* have matched, since all four share a URL — also only queries committed rows.

Approving both would have created four duplicate `municipal_project` rows, and the `ON CONFLICT (municipality_id, address, project_name, phase_label)` key would not have stopped them, because both name and address differ.

**FIXED 2026-09-04** — [`20260904120000_staging_cross_run_dedupe.sql`](../supabase/migrations/20260904120000_staging_cross_run_dedupe.sql).

`submit_research_report` now runs a second duplicate probe against **other runs' pending staging rows**, using the same two signals in the same order (`permit_url`, then municipality + name + address). It writes `municipal_project_staging.duplicate_of_staging_id`.

Design points worth knowing before changing it:

- **A new column, not a reuse of `matched_existing_id`.** That column suppresses the commit at approval; overloading it would make cross-run duplicates silently vanish instead of reaching a human. The new flag is **advisory** — it changes nothing about approval and only surfaces the collision. The reviewer resolves it with the existing keep-one control.
- **`ON DELETE SET NULL` is required, not tidiness.** `submit_research_report` deletes a run's pending rows on resubmit; under the default `RESTRICT`, another run's pointer would block that delete and break every agent retry on an overlapping window.
- **Scoped on resolved municipality OR boundary municipality.** Scoping on `municipality_id` alone silently disables the name/address probe, because that column stays NULL until a municipality row is created at approval — i.e. it would have been dead in exactly the new-territory sweep it protects. Including `boundary_municipality_id` also catches the city-inside-county case (a Grovetown row against a Columbia County row for the same project).
- Oldest pending match wins, so the first-staged row reads as the keeper.

Surfaced as a **⚠ DUP ACROSS RUNS** badge (with the other row's sweep chunk) in the approval modal, and as a standing `staging_cross_run_duplicate` view for checking a sweep without opening the UI. Verified by replaying the actual 2026-08-10 incident: the `permit_url` probe catches the differing-name/address case that previously slipped through.

Rows staged before 2026-09-04 have `duplicate_of_staging_id` NULL and will not appear — the probe runs at staging time and is not retroactive.

**PREVENTED 2026-09-05** — [`20260905120000_one_live_run_per_site.sql`](../supabase/migrations/20260905120000_one_live_run_per_site.sql).

The probe above *detects* the collision after both runs have staged. This stops the second run from starting at all: `create_research_run_with_checklist` now refuses to create a run for a site that already has a non-terminal one, under a per-site advisory lock, and `ovis-research-trigger` returns HTTP 409 so the UI says "already running" rather than "server error".

The two layers are complementary, not redundant — the guard cannot help rows already staged, and it is per-site, so a genuine cross-site collision still needs the probe.

A run is only a live claim if nothing has already declared it dead: a run whose sweep chunk has reached `done`/`failed` is treated as disowned and does not block. Without that carve-out, a sweep whose orphan cleanup half-completed would block its own next chunk and turn a wait into a spurious coverage gap.

---

## Agent contract (MCP)

`submit_research_report` — `candidate_records[].discovery_source`, optional:

```jsonc
{
  "boundary_municipality_id": "…",
  "project_name": "…",
  "address": "…",
  "source": "Columbia County PC agenda 2024-11-21 (event 2062); Augusta Press …",
  "discovery_source": "pz_agenda"   // optional, single value
}
```

**Omit or null when unsure — do not guess.** A guessed value is the unreliable attribution this column replaced. Unrecognized values are coerced to `'other'` and the original is preserved.

### Run-level usage (same call)

```jsonc
{
  "research_run_id": "…",
  "candidate_records": [ … ],
  "estimated_cost_cents": 1843,     // INTEGER CENTS, not dollars
  "input_tokens": 2140338,
  "output_tokens": 51204
}
```

All three optional. Omitting them leaves the run's cost columns `NULL` ("not measured", never "free"). **Nothing on the OVIS side can derive these** — `ovis-research-trigger` reads back only `openclaw_run_id`, and token counts live in the agent's own LLM responses. They must come from OpenClaw.

---

## Deployment record

**`ovis-research-mcp` deployed 2026-09-01** — version 12, `ACTIVE`. Deployed *before* the OpenClaw payload change so the tool schema advertising `discovery_source` and the usage fields is live first; an agent sending them now will have them accepted rather than silently dropped.

Verified: unauthenticated POST returns 401 (new bundle live, auth gate intact).

Backward compatibility held throughout. `20260901120000` dropped the 4-arg `submit_research_report` overload and replaced it with a 7-arg signature whose last three params default to NULL — a 4-named-arg call from the previously deployed function resolves to it cleanly. This was verified before deploying, so there was no window where the old function was broken.

`municipal_project_v` is **dropped and recreated** in migrations `120100` and `140000`. This is required, not cosmetic: the view was created with `mp.*`, which Postgres expands to a fixed column list at creation time. A new column on `municipal_project` does *not* appear in the view until it is recreated. Both recreations were rebuilt from the live `pg_get_viewdef` output — which carries `effective_stage_line_color`, a column added after the `20260629170000` migration and absent from that file. Rebuilding from the old migration file would have silently dropped it.

---

## Migration procedure warning

**`supabase db push` does not currently work in this repo.** Use the psql fallback. See [SUPABASE_MIGRATION_DRIFT.md](SUPABASE_MIGRATION_DRIFT.md) — all three migrations here were applied that way.

---

## Verification

Each migration was round-trip verified inside a transaction that was rolled back — no test data ever persisted. Covered: normalization of every input shape, staging → approval → committed promotion, reviewer override, explicit clear vs. no-override, raw preservation surviving reclassification, the taxonomy-gap view, view exposure, CHECK constraint enforcement, resubmit-without-usage not blanking recorded figures, and the non-negative cost guard.

Test scripts were scratch-only and are not committed; the queries are reproduced in [MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md](MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md#reproducing).

---

## Where it's threaded

| Layer | |
|---|---|
| Tables | `municipal_project_staging`, `municipal_project` |
| View | `municipal_project_v`, `discovery_source_taxonomy_gap` |
| Functions | `normalize_discovery_source`, `discovery_source_unrecognized`, `submit_research_report`, `approve_research_staging_rows`, `get_sweep_staging` |
| Edge | `supabase/functions/ovis-research-mcp/index.ts` (tool schema + handler) |
| UI | `ResearchRunApprovalModal.tsx` (dropdown + raw hint), `MunicipalProjectSlideout.tsx` ("Found via"), `MunicipalProjectLayer.tsx` (row type) |
| Types | `database-schema.ts` |

Once populated, the whole ad-hoc regex classifier from the attribution analysis collapses to `GROUP BY discovery_source` — which is the point.
