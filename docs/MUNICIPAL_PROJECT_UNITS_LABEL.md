# Municipal Project — Units Label

Compact label shown on the Municipal Projects slideout and in KML exports. Format: `+<total_units> <stage_abbreviation>` (either side dropped if missing). Examples: `+50 UR`, `+50 AP`, `+50`, `UR`.

## Where it lives

- **Formatter:** [`src/utils/municipalProjectUnitsLabel.ts`](../src/utils/municipalProjectUnitsLabel.ts) — `formatUnitsLabel(totalUnits, abbreviation)`
- **Slideout consumer:** [`src/components/mapping/slideouts/MunicipalProjectSlideout.tsx`](../src/components/mapping/slideouts/MunicipalProjectSlideout.tsx) (resolves `effectiveAbbreviation` then calls the formatter)
- **KML consumer:** [`src/services/municipalProjectKmlExport.ts`](../src/services/municipalProjectKmlExport.ts) (joins `project_stage.abbreviation` client-side; emits as `units_label` ExtendedData and in the popup HTML)
- **Per-stage abbreviation editor:** [`src/components/mapping/layers/MunicipalProjectInlineFilters.tsx`](../src/components/mapping/layers/MunicipalProjectInlineFilters.tsx) — “Stage colors & abbreviations” section in the layer panel

## Computed at render/export time — not stored

The Units Label is **never persisted on the `project` row**. It is derived on every render and every KML export from two inputs:

1. `project.total_housing_units` (lives on the project)
2. `project_stage.abbreviation` for the project's effective stage

This means **changing an abbreviation in `project_stage` flows automatically to every project that uses that stage** — slideout, KML popup, KML ExtendedData. **No per-project backfill migration is ever needed when an abbreviation changes.**

Practical implication: editing the abbreviation in the layer panel (or running a one-line `UPDATE project_stage SET abbreviation = '...' WHERE name = '...'`) is the complete change. There is nothing else to update.

## Effective stage resolution

A project's effective stage is `status_override_id` if set, otherwise `status_stage_id` (computed from completed task stages — see [MUNICIPAL_PROJECT_IMPORTER_SPEC.md](MUNICIPAL_PROJECT_IMPORTER_SPEC.md)). The formatter consumes the abbreviation of whichever stage wins. If a project has no effective stage, the label shows only the unit count (or nothing if units are also null).

## Seeded abbreviations

Initial mapping comes from [`supabase/migrations/20260531120000_project_stage_abbreviation.sql`](../supabase/migrations/20260531120000_project_stage_abbreviation.sql):

| Stage name         | Abbreviation |
|--------------------|--------------|
| Planning           | `UR`         |
| Approved           | `AP`         |
| Under Construction | `UC`         |
| Built Out          | `RC`         |

These are editable per-stage in the layer panel and shared across all users. New stages added via the importer have a null abbreviation by default — the Units Label will fall back to units-only until someone sets one.
