# Interstate Exits map layer

"Interstate Exits" toggle in the map's Layers menu: green/white highway-sign badges showing exit
numbers on **I-85 and I-20 in Georgia**. Built 2026-11-13 to read against the Speedway / 7-Eleven
pin maps, whose pin names start with the exit number. **Visible to everyone**: no permission gate.

## Data

- Table `public.interstate_exit` (migration `20261113083610_interstate_exit_layer`): highway, exit_ref,
  lat/lng, `osm_node_ids`, source, fetched_at. RLS SELECT for `authenticated`; no anon access; no
  browser writes.
- Source: **OpenStreetMap** `highway=motorway_junction` nodes on the I-85 / I-20 motorway ways
  within Georgia, fetched via the Overpass API. License ODbL: the layer must keep the
  "© OpenStreetMap contributors" credit, which is shown in the menu row and on badge hover.
- Google has no exit data in any Maps API, which is why this uses OSM.
- Loaded 2026-11-13: **I-85 88 exits, I-20 79 exits**.

OSM maps each exit once per direction of travel (one point where each off-ramp leaves). The import
merges points sharing a highway + exit number within 6 km to their midpoint, i.e. the interchange.
Some ramps leave 2–4 km before the interchange (I-85 21, 72, 86, 96, 104, 109; I-20 67, 74, 196), so
a 2 km radius left double badges. Junctions with no number, plus I-85's "HOV Exit", are skipped.

The Downtown Connector carries I-75 exit numbers (242–249). They load under I-85 because the
road is tagged as both I-75 and I-85.

## Adding highways / refreshing

```bash
python3 -I scripts/interstateExitsImport.py <work_dir> 75 285 > /tmp/exits.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/exits.sql
```

The script reloads only the highways named (DELETE + INSERT per highway). When adding I-75, the
Connector exits will appear under both I-75 and I-85, so either skip one or dedupe on `osm_node_ids`.
Also update the "I-85 · I-20" label in `MappingPageNew.tsx` and the description in `LayerManager.tsx`.

## Rendering

`InterstateExitLayer.tsx`: AdvancedMarkerElement badges, hidden below zoom 10. All ~170 rows load
once per toggle-on.
