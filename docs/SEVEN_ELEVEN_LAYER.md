# 7-Eleven / Speedway map layer

A toggle in the map's Layers menu ("7-Eleven / Speedway", ⛽) showing 7-Eleven and Speedway
store locations in Georgia. Built 2026-11-13 for the 7-Eleven account.

## Who can see it

One predicate, `public.user_has_seven_eleven_access()`, used for both the UI toggle and the
data (RLS on `seven_eleven_store`). True when **either**:

1. `can_view_7eleven_layer` is on for the user (user override, else role default). It's in the
   **Map Layer** permission matrix as "7-Eleven / Speedway", default off.
2. The user is an **active broker on the 7-Eleven client** (`client_broker`, client matched by
   `client_name = '7-Eleven'`, so renaming the client breaks this path).

Portal users are not included. The frontend calls the RPC via `useSevenElevenAccess()`, so the
toggle and the rows can't disagree.

Verified by impersonation (2026-11-13): Greg (7-Eleven broker) sees rows; Arty sees 0 until the
permission is set; `authenticated` can't write; `anon` gets permission denied.

## Data

Table `seven_eleven_store` (migration `20261113065919_seven_eleven_store_layer`): brand
(`7-Eleven` | `Speedway`), `google_place_id` (unique), name, address, lat/lng,
`verified_latitude/longitude` (unused so far, reserved for hand corrections), business_status.

Loaded 2026-11-13: **19 Speedway + 4 7-Eleven**. This is a separate table from the
Merchants cache (`merchant_location`) on purpose: merchant rows are readable by every
authenticated user, so they can't be permission-gated.

### How it was searched

`scripts/sevenElevenPlacesIngest.py`: Places Text Search (REST) over a 0.3° grid clipped to a
coarse Georgia polygon (203 cells), one query per brand per cell, subdividing any cell that returns
a full page of 20. A single statewide search is **not** enough: Google returns only its top
results for a state-sized rectangle (it found the same 19/4 here only by luck of ranking; don't
rely on that for denser brands).

Filters on the results: state = GA from `addressComponents`, the brand name contained in the display name
(alphanumeric-normalised, so "Speed Way" passes), and type `gas_station` or `convenience_store`.

Excluded on purpose: listings named like `3307 Cagle Rd #7-11`. Those are suite numbers, not
7-Eleven stores.

Cost: 406 requests on 2026-11-13, logged in `google_places_api_log`.

### Refreshing

Re-run the script, then upsert on `google_place_id` (update name/address/lat/lng/status and
`last_fetched_at`; **never touch `verified_*`**). Stores that disappear from Google are not
removed automatically.
