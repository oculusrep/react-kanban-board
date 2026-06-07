# Market Research Agent — Phase A: Boundary Dataset

**Branch:** `feature/market-research-agent`
**Companion docs:** [`MARKET_RESEARCH_AGENT_V1_PLAN.md`](MARKET_RESEARCH_AGENT_V1_PLAN.md) (Phase A section), [`market-research-agent-spec.md`](market-research-agent-spec.md) §6

This is the prerequisite for everything else. The MCP tool `get_municipalities_in_radius(site_id, radius_miles)` is a single PostGIS query against the table this phase builds. Nothing else can ship until Phase A is applied + backfilled.

---

## What this phase adds

| File | Purpose |
|---|---|
| `supabase/migrations/20260606120000_create_boundary_municipality.sql` | Table + indexes + RLS + helper RPC. |
| `scripts/backfillBoundaryMunicipality.ts` | One-shot TIGER → Postgres backfill (counties + incorporated places). Idempotent. |

No app-side TS or UI changes in this phase. Approval UI, MCP edge function, and trigger button all land in later phases.

---

## Preconditions (verified on Supabase project `rqbvcvwbziilnycqtmnc`, 2026-06-06)

- PostGIS 3.3.7 enabled ✓
- `pgcrypto` 1.3 enabled (for `gen_random_uuid()`) ✓
- `public.update_updated_at_column()` exists (existing convention) ✓
- `public.boundary_municipality` does not exist yet ✓

---

## Apply the migration

Follow the established workflow (per `reference_supabase_migration_workflow` memory — `supabase db push` is broken on this project):

```bash
# 1) Apply the SQL
psql "$DATABASE_URL" \
  -f supabase/migrations/20260606120000_create_boundary_municipality.sql

# 2) Record it as applied
psql "$DATABASE_URL" \
  -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20260606120000','create_boundary_municipality');"
```

The migration is additive only — creates one table, three indexes, one RLS policy, one trigger, one RPC. It does not touch any existing tables.

---

## Run the backfill

```bash
# GA (default scope), counties + incorporated places, real write
bun scripts/backfillBoundaryMunicipality.ts

# dry-run first if you want to inspect the transform without writing
bun scripts/backfillBoundaryMunicipality.ts --dry-run

# subset re-runs (safe — idempotent on (kind, state, geoid))
bun scripts/backfillBoundaryMunicipality.ts --kind counties
bun scripts/backfillBoundaryMunicipality.ts --kind cities

# tune chunk size if a 50-row upsert payload is too large for your network
bun scripts/backfillBoundaryMunicipality.ts --chunk 25
```

Requires `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in env (already set in `.env` per existing scripts like `ingestStarbucks.ts`). Dry-run mode does not need these.

The script calls a single SECURITY DEFINER RPC (`upsert_boundary_municipalities`) that converts each row's GeoJSON to a `MultiPolygon` and computes the centroid via `ST_PointOnSurface` server-side. Rerunning the backfill updates existing rows in place — never duplicates.

---

## Acceptance criteria

After applying the migration + running the backfill against GA:

```sql
-- Row counts (verifies completeness)
SELECT kind, COUNT(*)
  FROM boundary_municipality
 WHERE state = 'GA'
 GROUP BY kind;
-- Expect: county = 159, city = 538

-- Sample lookup (verifies name normalization)
SELECT geoid, name, raw_name, lsadc
  FROM boundary_municipality
 WHERE state = 'GA' AND name = 'Winder';
-- Expect: 1 row, raw_name = 'Winder city', lsadc = '25'

-- Spec §10 test case: 10mi radius around Winder, GA centroid (~33.99, -83.72)
-- ordered by distance, closest first. Should return Winder + Barrow County + nearby
-- cities, with Winder itself at distance ≈ 0.
SELECT
  kind, name,
  ROUND((ST_Distance(
    centroid::geography,
    ST_SetSRID(ST_MakePoint(-83.7236, 33.9916), 4326)::geography
  ) / 1609.344)::numeric, 2) AS distance_mi
FROM boundary_municipality
WHERE state = 'GA'
  AND ST_DWithin(
        centroid::geography,
        ST_SetSRID(ST_MakePoint(-83.7236, 33.9916), 4326)::geography,
        10 * 1609.344
      )
ORDER BY distance_mi;
-- Expect: Winder + Barrow County at the top, then ~10–20 more cities + neighboring counties.
```

If the 10mi-radius query returns Winder, Barrow County, and a sensible ring of neighbors, Phase A is done and you can move on to Phase B (research_run + checklist + staging schema).

---

## Defaulted without asking (flag in PR review)

- **Centroid strategy:** `ST_PointOnSurface(geometry)`, not `ST_Centroid(geometry)`. PointOnSurface always falls inside the polygon — matters for concave shapes (some GA cities have non-trivial geometry). Trade-off: PointOnSurface is slower at insert time, but it's a one-time cost.
- **CDPs excluded:** Layer 4 is "Incorporated Places" — Census Designated Places (CDPs) live on layer 5 and are NOT loaded. CDPs have no government, so they're useless as open-records targets per the agent's research protocol.
- **Geometry stored as MultiPolygon, not Polygon:** even single-ring places get wrapped via `ST_Multi()` so the column type is uniform. Lets `boundary_municipality.geometry` be queried with a single type assumption downstream.
- **Population column nullable:** populated by a v1.x ACS enrichment pass (deferred — the spec's "skip cities under 1,000 population" radius-suggestion idea is a v1.1 feature, not a v1 blocker).
- **`source_year = 2025`:** layer 4 / layer 1 are "current vintage" on TIGERweb. If you later want a specific year for compliance/audit, switch to one of the year-stamped layers (e.g. layer 18 = "Incorporated Places (Census 2020)").
- **Idempotent rerun strategy:** `ON CONFLICT (kind, state, geoid) DO UPDATE` — rerunning rewrites the row including geometry. If you want to detect TIGER drift between years, dump `boundary_municipality` to a snapshot table before rerunning.
- **No `municipality` table linkage in Phase A:** the existing `municipality` table (from the importer spec, `(name, state)` unique) is intentionally NOT joined to `boundary_municipality`. Phase B's staging schema joins both — staging carries a `boundary_municipality_id` (where the agent found it) AND a nullable `municipality_id` (the OVIS muni, set on promote). This keeps boundary data clean reference data and OVIS-side records as the operational layer.

---

## Open items still flagged for Phase A

None blocking. Two minor things worth noting:

1. **TIGER endpoint stability:** the layer indices (counties = MapServer/1, places = MapServer/4) are what TIGERweb publishes today. If Census ever renumbers the layers, the script's constants need updating — flag in PR if rerunning the backfill ever returns 0 rows.
2. **Population enrichment timing:** if you want population available before the v1.1 radius-suggestion feature, the second pass (TIGER ACS layer 6 or Census ACS API) can be added as a `--enrich population` flag on the same script. Not building it in Phase A.
