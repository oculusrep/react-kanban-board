# Parcel Layer — Research & Options (Future Feature)

**Status:** Research only, not implemented. Captured 2026-05-27.

Goal: render parcel shapes + parcel numbers (and ideally lot size / owner / value)
as a toggleable layer on the OVIS map, alongside Google Maps basemap.

## Key fact: Google Maps does NOT provide parcel data

Google Maps stays the basemap (streets, satellite, pins). Parcels come from a
**separate data source** drawn as an overlay. Two realistic paths:

1. **Commercial nationwide feed** (Regrid is the standard; ReportAll is cheaper).
2. **Free county/state GIS ArcGIS REST feeds** (per-county engineering).

Render via vector tiles (MVT, e.g. `deck.gl` MVTLayer) for parcel density;
GeoJSON into the Google Maps Data layer dies above ~5k features. For a single
county viewport, GeoJSON-per-bbox is fine.

## What OVIS already has (ArcGIS plumbing, NOT parcels)

OVIS has two ArcGIS-related integrations today, neither of which is parcel data:

- **ESRI GeoEnrichment** — `supabase/functions/esri-geoenrich/index.ts`, called via
  `src/hooks/usePropertyGeoenrichment.ts`. Auth'd with `ESRI_API_KEY`, hits
  `geoenrich.arcgis.com`. Demographics + Tapestry only. **This key does NOT
  entitle parcels.**
- **Census TIGERweb** — `src/services/boundaryService.ts` (lines ~36-37, 215, 277),
  hits `tigerweb.geo.census.gov/arcgis/rest/...`. Free, no key, county boundaries.

The useful part: `boundaryService.ts` already performs the exact ArcGIS REST
GeoJSON query pattern a parcel layer needs:
```
?where=...&outFields=...&f=geojson&returnGeometry=true&outSR=4326
```
A parcel layer service would be a clone of this pointed at a county FeatureServer.

## Option A — Regrid (commercial)

- Separate API/account from Google Maps. Sign up, get key, add as a new layer toggle.
- Coverage: all US + Canada parcels, one standardized schema.
- **Includes lot size:** `sqft` (county sq ft), `gisacre` (county acres),
  `ll_gisacre` (Regrid-calculated acres, reliable even when county value missing).
  Plus APN, owner, address, zoning, etc.
- Pricing (numbers gated behind login; from public pages + 3rd-party reviews):
  - Self-serve API/tiles: fixed monthly base + overage; reported starting in the
    low hundreds/month for smaller tiers.
  - Enterprise: custom, typically several thousand/yr (bulk download, white-label,
    high volume).
  - 1-week free trial available — cleanest way to get real numbers and test data.
  - Contact: parcels@regrid.com
- Best when: want owner/value/zoning, or many markets without per-county work.

## Option B — Free county ArcGIS feeds (verified for Winder/Barrow County, GA)

**Barrow County parcel layer (open, no token, query enabled):**
```
https://services5.arcgis.com/OVFGXfRTCVcPwl55/arcgis/rest/services/BCGIS_Base_Layers/FeatureServer/120
```
Found via the county GIS Viewer web map
(`arcgis.com` item `7ab7f87122234b5ea04a56b0aafc6934`) →
`BCGIS_Base_Layers` FeatureServer, layer 120 = "Parcel Boundaries".

**Confirmed contents:**
- `esriGeometryPolygon` — real parcel shapes, requestable as GeoJSON (`f=geojson&outSR=4326`)
- `Parcel_no` — parcel number / APN (e.g. `XX055A 010`); also `Map_no`
- `Shape__Area` — geometry-derived area in **square feet** (GA State Plane);
  /43,560 = acres (sample: 13754 → 0.32 ac). No curated "acres of record" field.
- `capabilities: Query,Extract`; `maxRecordCount: 2000`; pagination supported.

**What it does NOT include (the catch vs Regrid):**
- No owner name, mailing/situs address, assessed/market value, sale history.
- Zoning is a *separate* layer (`BCGIS_Zoning_Layers` FeatureServer).
- Assessor attributes live in **qPublic** (tax assessor system) — no clean public
  API; scraping is fragile and likely against ToS. Avoid.

Other GA counties: most expose a similar ArcGIS REST parcel FeatureServer, but
schema/field names vary → a per-county adapter + normalization layer is required.
Effectively building a small GIS ingestion pipeline as coverage expands.

## Decision matrix

| Need | Barrow free layer | Regrid |
|------|-------------------|--------|
| Parcel polygons + parcel # | ✅ | ✅ |
| Lot size | ✅ (derived from geometry) | ✅ (curated) |
| Owner / value / address / zoning / sales | ❌ | ✅ |
| Multi-county coverage | rebuild per county | included |
| Cost | $0 | $ (low hundreds/mo+) |

## Recommendation

- If the near-term need is just **parcel outlines + parcel number + lot size for
  Winder/Barrow**: ship the free layer reusing the `boundaryService.ts` pattern —
  no new vendor, no recurring cost.
- If/when we need **owner / value / zoning**, or coverage across many markets
  without per-county engineering: move to Regrid (start with the free trial to
  validate data quality against known parcels).

## Implementation sketch (when picked up)

1. New service `parcelService.ts` modeled on `boundaryService.ts`; param the
   FeatureServer URL per county so the free path can grow into a county registry.
2. Add a layer toggle following the existing map layer pattern (see municipal
   projects layer / `MunicipalProjectInlineFilters.tsx` and the layer specs in
   `docs/FEATURE_MAP_LAYERS_REQUIREMENTS.md`).
3. Query by current map bounds (`geometry`/`geometryType=esriGeometryEnvelope`,
   `inSR/outSR=4326`) to avoid pulling the whole county; paginate at 2000/page.
4. Render GeoJSON; if density/perf becomes a problem, switch to MVT vector tiles.
5. Show `Parcel_no` as label + lot size (acres) in a click popup / pin slideout.
