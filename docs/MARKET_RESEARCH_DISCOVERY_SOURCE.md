# `discovery_source` — field reference

Companion to the free-text `source` citation on market-research records. Records **which research phase actually found a record**, so phase-level "is this worth keeping?" questions have a real answer.

Motivated by [MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md](MARKET_RESEARCH_SOURCE_ATTRIBUTION_2026_09_01.md), which established that `source` cannot answer that question — 46% of records cite two or more source types in one string, so any bucketing of it is an artifact of citation ordering.

Added 2026-09-01 across three migrations:

| Migration | What |
|---|---|
| [`20260901120000_research_run_cost_tracking.sql`](../supabase/migrations/20260901120000_research_run_cost_tracking.sql) | `research_run` cost/token columns |
| [`20260901120100_discovery_source.sql`](../supabase/migrations/20260901120100_discovery_source.sql) | the column, constraint, normalizer, RPC + UI threading |
| [`20260901140000_discovery_source_raw.sql`](../supabase/migrations/20260901140000_discovery_source_raw.sql) | `discovery_source_raw` + taxonomy-gap view |

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
