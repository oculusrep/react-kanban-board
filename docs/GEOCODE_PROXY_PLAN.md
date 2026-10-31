# Geocode proxy: plan (not built yet)

Status: **plan, awaiting Mike's OK** (2026-10-31). Branch `feature/geocode-proxy`, worktree `react-kanban-board-geocode-proxy`.

## Why

Browser code calls Google's Geocoding **REST** endpoint directly with `VITE_GOOGLE_GEOCODING_API_KEY`.
Anything `VITE_` is shipped in the public JS bundle, so anyone can lift the key.

Google refuses website-restricted keys on that endpoint ("API keys with referer restrictions cannot be
used with this API"). That was confirmed 2026-10-31, when restricting the key took down every address
lookup in OVIS. So the key can't be locked to our sites; it has to leave the browser.
The interim state (2026-10-31): the browser key is unrestricted by website, limited to the Geocoding API, and has a daily quota cap.

## Design: a `geocode` edge function, modeled on `dropbox-proxy`

- **Auth:**
  - **Gateway:** the gateway checks the JWT (`verify_jwt = true`). ES256 user tokens pass since the 2026-10-30 key rotation.
  - **In code:** `getUser(token)` with the service client, then the caller must be an internal user (`is_internal_user()`)
    **or** a portal user (`portal_user_contact_id()` not null). `PortalMapPage` geocodes portal address searches.
  - **Everyone else** (coach, no OVIS record) gets 403. Anonymous callers get 401.
- **Key:** `GOOGLE_GEOCODING_API_KEY`, already a Supabase secret: a Geocoding-API-only server key.
- **Request:** `POST { address }` or `POST { latlng: "lat,lng" }`. Optional pass-through params: `region`, `components`.
  Nothing else is forwarded, so the function can't be used as an open Google proxy.
- **Response:** Google's JSON body unchanged (`status`, `results`, `error_message`). The callers' parsing then stays
  exactly as it is: they swap the `fetch(url)` for `supabase.functions.invoke('geocode', { body })`.
- **Limits:** per-user cap, e.g. 300 requests/min in memory per isolate. It's a speed bump for a stolen session, not
  billing control. The real ceiling stays Google's daily quota on the server key.
- **CORS:** same headers as `dropbox-proxy`.
- **Logging:** status and user id only, never the address (addresses can be client-confidential).

## Callers to switch (4 REST call sites, 2 files)

| File | Function | Request |
|---|---|---|
| `src/services/geocodingService.ts` | `geocodeWithGoogle` | `address` |
| `src/services/geocodingService.ts` | `validateCityZipCorrespondence` | `address` = zip |
| `src/services/geocodingService.ts` | `reverseGeocodeWithGoogle` | `latlng` |
| `src/services/orientationGeocode.ts` | orientation geocode | `address` |

- The ~22 importers of `geocodingService` are unchanged, because its public API doesn't change.
- The OSM/Nominatim fallback in `geocodeWithOSM` stays as is (keyless).
- `scripts/backfillMunicipalProjectCentroids.ts` already uses the server key.

## Rollout (merge first, then deploy)

1. Build on this branch: function, `config.toml` entry, the 4 call-site swaps, and `VITE_GOOGLE_GEOCODING_API_KEY` removed from
   `vite-env.d.ts` with a "goes through geocode" note, as was done for Dropbox.
2. Typecheck. Then test on localhost: address search, tour start/end lookup, property create geocode, reverse geocode,
   and a portal map search as a portal user. Check by HTTP that anonymous callers get 401 and coaches get 403.
3. **Merge to main, then deploy the function.** The `main` push redeploys the app on Vercel. Order matters: the new frontend needs
   the function, so deploy the function from main right after merging, before Vercel finishes (~1 min). Or deploy the function from
   main first: it's additive and unused until the frontend ships.
4. Verify in prod: geocode calls show 200 in `function_edge_logs`, and nothing in the bundle references `maps.googleapis.com/maps/api/geocode`.
5. **Then Mike deletes the browser geocoding key** in Google Cloud and removes `VITE_GOOGLE_GEOCODING_API_KEY` from Vercel
   (production + preview) and the local `.env` files.
   - `geocodingService.ts:94` falls back to `VITE_GOOGLE_MAPS_API_KEY`. That fallback is removed in step 1, so the restricted Maps key
     is never sent to the REST endpoint (which would fail anyway).

## Not in scope

- The Maps JavaScript API (`VITE_GOOGLE_MAPS_API_KEY`) stays in the browser and stays website-restricted. That API supports it.
- No caching layer in v1. Add a Postgres cache keyed on the normalized address only if the volume warrants it.
