# Parcel adapter — Claude Code prompt template

The **Copy cc prompt** button on a research run or sweep view copies the text
between the two markers below, with the placeholders filled in. The button
appears for each county that has records with parcel IDs but no entry in
`COUNTY_ADAPTERS`. Edit the text freely; the next deploy picks it up and no
code change is needed (it's bundled with Vite `?raw`). Keep the markers and
placeholder names exactly as they are.

Placeholders:

| Placeholder | Filled with |
|---|---|
| `{{COUNTY}}` | e.g. `Newton County` |
| `{{STATE}}` | e.g. `GA` |
| `{{MUNICIPALITIES}}` | the run's municipalities in that county |
| `{{RECORD_COUNT}}` | the run's non-rejected staged records with parcel IDs in that county |
| `{{PARCEL_IDS}}` | up to 3 real parcel IDs from those records, one per line |
| `{{RUN_REF}}` | the run or sweep id the prompt was copied from |

Background: [MUNICIPAL_PROJECT_PLACEMENT.md](MUNICIPAL_PROJECT_PLACEMENT.md)
(Henry, Hall and Coweta adapters) and
[PARCEL_ID_GEOCODING_FEASIBILITY.md](PARCEL_ID_GEOCODING_FEASIBILITY.md).

<!-- PROMPT START -->
Add a parcel adapter for {{COUNTY}}, {{STATE}}, so OVIS can draw project boundaries from parcel IDs there.

Context: research {{RUN_REF}} staged {{RECORD_COUNT}} record(s) with parcel IDs in {{COUNTY}} (municipalities: {{MUNICIPALITIES}}), and `COUNTY_ADAPTERS` in supabase/functions/_shared/parcel-adapters.ts (re-exported by src/services/parcelFabric.ts) has no entry for it. Follow the existing Forsyth / Henry / Hall / Coweta adapters and their write-ups in docs/MUNICIPAL_PROJECT_PLACEMENT.md. Work in a feature branch in a sibling worktree, never on main in the shared checkout.

1. Find the county's public parcel layer.
   - Look on the county's own site and GIS pages, on county-run ArcGIS Servers (these are often NOT in the ArcGIS Online index, which is how Forsyth's was missed), and on Esri-hosted (services*.arcgis.com) layers the county publishes. Don't stop at an ArcGIS Online search.
   - Record the layer URL, the parcel ID field, the ID format as stored (padding, dashes, spaces), and the data's last-edited date.
   - Confirm it answers an anonymous query: no login, no token. Check CORS from a browser origin.

2. Test it with real parcel IDs from our records:
{{PARCEL_IDS}}
   Query each one and report what comes back (found / missing, area, geometry type). A missing ID is usually a re-plat; say which.

3. Add the county's ID format to `extract_parcel_numbers()`.
   - Write a new migration built from the LIVE definition (`pg_get_functiondef`), never an old migration file.
   - Scope the new pattern to {{COUNTY}} records only. Run a regression check over every staged and committed row: there must be zero changes outside {{COUNTY}}, and no row may lose an ID.
   - Follow CLAUDE.md's migration rules: psql apply with `--single-transaction`, then record the version in `schema_migrations`.

4. Add the adapter to `COUNTY_ADAPTERS` (supabase/functions/_shared/parcel-adapters.ts; the browser button and the server post-run fetch both use it) with the standard rules:
   - `matches`: the county name plus the cities inside it. Leave out cities that straddle another county, and note them.
   - `whereFor` via `likeFromRuns`, plus the normalized-ID compare.
   - Acreage validation against the record's stated acres; flag anything out of tolerance.
   - Union multi-parcel records into one MultiPolygon.
   - The pin must sit inside the shape.
   - Draw it dashed until a person reviews it.
   - Never replace an existing boundary.
   - Set a timeout and retry (`timeoutMs` / `retries`) sized to how the server actually behaves.

5. Backfill {{COUNTY}}'s staged and committed records.
   - Superset-only: skip parcel-fetched boundaries and in-flight runs.
   - Report how many records and IDs resolve, how many are missing, and how the acreage checks came out.

6. Typecheck, update docs/MUNICIPAL_PROJECT_PLACEMENT.md with a "{{COUNTY}} adapter" section, merge to main, push and deploy.

If {{COUNTY}} has no public parcel service (login-gated, raster tiles only, or nothing published), say so plainly, with what you checked. Then add it to `COUNTIES_WITHOUT_PARCEL_SERVICE` in supabase/functions/_shared/parcel-adapters.ts with the date and a one-line reason, so OVIS stops flagging the county. Don't build anything else in that case.
<!-- PROMPT END -->
