# Google Maps API Keys & Required APIs

OVIS uses **two** Google API keys, each scoped to different APIs. If a map feature
returns `REQUEST_DENIED` ("this API key is not authorized to use this service or API"),
it's almost always because the API is missing from that **key's API-restriction allow-list**
— note that enabling an API *project-wide* is not enough; the key must also allow it.

## The two keys

| App env var | GCP key name | Used for | Required API restrictions |
|---|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` (…`DKpxHQ`) | **New Maps API** | Maps JavaScript API load, markers, Places autocomplete, Distance Matrix, **Directions (route line, drive times, tour Optimize)** | Maps JavaScript API, Places API, Places API (New), Distance Matrix API, **Directions API** |
| `VITE_GOOGLE_GEOCODING_API_KEY` (…`cUq3vA`) | **New Geocoding API** | Address → lat/lng (tour Start/End address lookup, address search, batch geocoding) | Geocoding API only |

- **Application restrictions** on the Maps key are HTTP-referrer ("Websites") and must include:
  `https://ovis.oculusrep.com/*`, `https://*.vercel.app/*`, `http://localhost/*`, `localhost:*`,
  `127.0.0.1:*`, and the GitHub Codespaces `*.app.github.dev/*` hosts.
- The keys are resolved at runtime: `geocodingService` uses `VITE_GOOGLE_GEOCODING_API_KEY`
  and falls back to `VITE_GOOGLE_MAPS_API_KEY` if unset.

## Landmine: Vite bakes keys at BUILD time

`VITE_*` values are inlined into the JS bundle when Vercel builds. So **rotating a key
requires updating the value in Vercel → Settings → Environment Variables AND redeploying**
— the live site keeps using the old baked-in value until the next build. After any key
rotation, reconcile: GCP key value == Vercel env == local `.env`, then redeploy.
(As of 2026-08, all three are in sync: Maps …`DKpxHQ`, Geocoding …`cUq3vA`.)

## Tour routing depends on the Directions API

The tour map (`/tours/:id/map`, `TourMapPage`) uses `google.maps.DirectionsService` for:
- the road-following **route polyline**,
- per-leg **drive times** (the arrival/finish schedule), and
- the per-day **Optimize** button (`optimizeWaypoints`).

If **Directions API** is not on the Maps key's allow-list, all three silently degrade:
the route falls back to straight geodesic lines, the schedule shows **"Drive n/a"**, and
**Optimize hard-fails** with `DIRECTIONS_ROUTE: REQUEST_DENIED`. Fix: add **Directions API**
to the `…DKpxHQ` key's API restrictions → Save → wait ~2–5 min for propagation. No redeploy
needed (the key value is unchanged).

## Deprecation note (future)

The console warns `google.maps.DirectionsService` is deprecated as of **Feb 25 2026** in
favor of the newer **Routes API** (`google.maps.routes.Route.computeRoutes`). DirectionsService
still receives fixes and has 12+ months of support, so no urgent action. Migrate the tour-map
routing to the Routes API when convenient (or if Google ever blocks classic Directions for this
project) — that path enables **Routes API** in GCP and changes the request/response code in
`TourMapPage`. The heavier **Route Optimization API** (`routeoptimization.googleapis.com`, a
server-side fleet optimizer with hard time-window/service-time constraints) is a separate,
optional upgrade for tours with >25 stops/day or must-fit-in-hours scheduling — see the tour
plan's Phase 4.
