# Truck Stops map layer

A "🚛 Truck Stops" toggle in the map's Layers menu: round brand-logo pins for **Pilot, Flying J, Love's,
TA / Petro, QuikTrip truck stops and Buc-ee's in Georgia**. Built 2026-11-13. **Everyone can view.**

## Verify and remove (internal users)

Click a pin. Internal users (admin, brokers, VA) see two buttons:

- **Verify location**: the pin gets an orange ring and becomes draggable. Drop it on the real
  storefront and it saves (`verified_latitude/longitude`, `verified_at`, `verified_by`); Esc cancels.
  Verified coordinates always win over Google's, and re-imports never touch them.
- **Remove pin**: soft delete (`excluded_at`, `excluded_by`), after a confirm. Hidden for everyone.
  A re-import keyed on `google_place_id` can't bring it back. To restore one, set `excluded_at = NULL`.

Both go through `truck_stop_set_verified_location()` / `truck_stop_exclude()`, SECURITY DEFINER RPCs
that re-check `is_internal_user()`. The browser has SELECT only on the table. Verified 2026-11-13 by
impersonation: Greg can verify/remove; direct UPDATE is denied; a non-internal account can read but
gets "not authorized" from the RPCs; anon is denied everything.

## Data

Table `truck_stop` (migration `20261113085519_truck_stop_layer`). Loaded 2026-11-13: **72 stops**:
Pilot 25, Love's 20, TA / Petro 13, Flying J 7, Buc-ee's 4, QuikTrip 3.

Source: Google Places Text Search over a 0.6° grid clipped to Georgia (56 cells), one query per brand,
with saturated cells subdivided (~420 requests, logged in `google_places_api_log`). Scripts:
`scripts/truckStops/{search,classify,finalize}.py`.

Filtering decisions:
- **Dropped:** ATMs, "TA Truck Service" / "Truck Care" shops, QuikTrip offices / kitchens /
  distribution / under-construction, and Airbnb listings "near Buc-ee's".
- **Dropped:** bare **"Petro"** listings (Columbus, Carrollton, Bowdon, Lakeland, Greensboro). They
  are independent gas stations, not TA's Petro Stopping Centers. Only "Petro Travel Center" /
  "Petro Stopping Center" are kept.
- **QuikTrip "large diesel":** only the stores Google types `truck_stop` (3: Fulton Industrial
  Atlanta, Bloomingdale, Brunswick). Google's typing may undercount QT travel centers. Use
  "Remove pin" / add missing ones if it does.
- **Merged:** listings of the same brand within 500 m. Buc-ee's Brunswick is listed twice ~0.7 km
  apart (6900 GA-99 / 6900 Bucees Blvd); the GA-99 one was dropped by hand.
- Buc-ee's Forsyth (Rumble Rd) is `CLOSED_TEMPORARILY` in Google, most likely not open yet. It
  renders faded, with the status in the popup.

## Logos

Brandfetch **icon** variant, hotlinked (never stored): Pilot `pilotflyingj.com`, Love's `loves.com`,
TA / Petro `ta-petro.com` (the TA mark), QuikTrip `quiktrip.com`, Buc-ee's `buc-ees.com`.
- **Flying J has no Brandfetch logo.** `flyingj.com` and every variant return the 344-byte
  placeholder, so it renders a drawn red/yellow "FJ" circle.
- `petro.com` is Petro Home Services, a different company. Don't use it.

Same licence caveat as the 7-Eleven layer: these domains aren't in `merchant_brand`, so the logo
cron doesn't keep their Brandfetch licence warm.
