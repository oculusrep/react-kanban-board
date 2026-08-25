# Comp Database — Design & Scope

**Status:** Live in production and actively iterated. Phase 1 shipped 2026-07-25; many enhancements
shipped 2026-08-24/25 (see "Enhancements since Phase 1" below).
**Owner:** Mike
**Last updated:** 2026-08-25

## Next steps

**Immediate (validate Phase 1 in prod):**
1. Smoke-test on https://ovis.oculusrep.com — toggle **Comp Database**, right-click → **Add Comp Here**,
   create a comp, add a lease + sale + OM + note, confirm the pin re-colors and counts update.
2. Seed a few real comps around an active Starbucks target so the layer has content to select from.
3. Confirm internal-only RLS behaves (non-internal users shouldn't see comp pins).

**Phase 2 — Bulk ingestion (next build):**
- CoStar / Crexi export (CSV/API) importer → normalize into the schema.
- Dedupe on `source_reference` + address + tenant + dates; add a `comp_import_batch` provenance table.
- Wire the sidebar **Files** tab to `dropbox_mapping` (`entity_type='comp_property'`) for OM PDFs (open item #6).

**Phase 3 — AI-agent research:** agent finds OM sales / in-place leases / expirations online, writes
`source_type='ai_agent'` / `confidence='reported'`, with a human review queue to promote to `verified`;
expose via the OVIS MCP server (see [[project_ai_architecture]]).

**Phase 4 — Trade-area analytics (deferred):** radius rings → drive-time isochrones; the
**expiring-leases-near-target** report (fields already indexed); feed comp evidence into the
[Site Analysis report](STARBUCKS_SITE_ANALYSIS.md).

See the full phase breakdown and open items below.

## Phase 1 — what shipped

- **Migration** `supabase/migrations/20260725180000_comp_database_phase1.sql` — applied to prod
  (tables `comp_property`, `lease_comp`, `sale_comp`, `operating_memorandum`, `comp_note`;
  provenance columns; indexes incl. `lease_comp.lease_expiration_date`; internal-only RLS via
  `is_internal_user()`). Regenerated `database-schema.ts`.
- **Calculators** `src/lib/compCalculators.ts` — cap rate ↔ NOI ↔ price, price/rent/sales PSF,
  all-in & effective rent, months-remaining, GRM (pure, null-safe).
- **Types** `src/lib/compTypes.ts` — hand-written row interfaces + `compCoords()` precedence helper.
- **Map layer** `src/components/mapping/layers/CompDatabaseLayer.tsx` — registered as system layer
  `comp_database` in `LayerManager.tsx` **and** the hardcoded custom-layers menu in `MappingPageNew.tsx`.
  Pins colored by content (sale = steel blue, lease-only = midnight, empty = slate, dashed
  terracotta ring = has OM); clustered; click → sidebar.
- **Sidebar** `src/components/mapping/slideouts/CompDetailSlideout.tsx` — Overview (create/edit the
  comp_property), Leases / Sales / OM tabs (add/edit/delete with live calculators), Notes. Mounted
  independently of the shared `PinDetailsSlideout` state (overlay-first, `useOverlayStack`).
- **Create flow** — right-click map → **Add Comp Here** (`MapContextMenu.onCreateComp`) drops a new
  comp at those coords and opens the sidebar in create mode. Comps are then picked manually off the
  layer for reports (no automated trade-area query yet, per the locked decision).

Deployed: commit `30bf8d78` on `main` (2026-07-25). The DB migration was applied to prod directly via
the Supabase MCP (additive-only new tables) before the frontend push, so schema + UI are in sync.

## Enhancements since Phase 1 (all shipped to prod, 2026-08-24/25)

Migrations `20260824120000` … `20260825160000` (each applied to prod via the Supabase MCP, then the
matching frontend pushed to `main`). The comp sidebar `CompDetailSlideout.tsx` now has tabs:
**Overview · Leases · Sales · OM · Availability · Files · Chat**.

**Sidebar / UX**
- **Black location header** (name / address / city / state / zip / coordinates) — display-only with a
  pencil to edit; mirrors the site-submit/deal header. New comps **reverse-geocode** the dropped
  lat/lng (`geocodingService`) to autofill the address block. Header also shows **provenance badges**,
  **created/modified by + when**, and the **current asking headline** (latest availability record).
- **Modern, unified field styling** across all tabs; numeric fields are always-editable with inline
  `$`/`%` adornments + comma formatting (custom `NumField`, replaced the shared `FormattedField`).
- **Overview**: Property Type / Building SF / Land Acres / Source / Confidence + collapsible
  **More Details** (Year Built, Anchor/Co-tenants, Trade Area, Parcel ID, Source URL/Reference) +
  an **On-market** toggle (drives the amber pin). County removed from the UI.
- **Delete a comp** from the header (cascades to its leases/sales/OMs/availability/notes).

**Leases** (`lease_comp`) — reworked per Mike's field matrix (see
[COMP_LEASE_FIELD_MATRIX.md](COMP_LEASE_FIELD_MATRIX.md)):
- Lease types: **Ground Lease · BTS (NNN) · BTS (NN) · Multi-Tenant**; fields shown gate by type.
- Base Rent & **TI entered as Annual $** (PSF derived); **Lease Term in years**;
  **Expiration auto-derives** from commencement + term (overridable); **Rent Escalation %** +
  **Rent Bumps** (Annual / Every 5 Years / Other); **Number of Options** + **Option Term (years)**.
- **Auto rent-schedule card**: projects each period's rent, current period highlighted, extended
  through the option periods (labeled Option 1/2…). Per-record **Notes** + created/modified audit.
- New columns: `annual_base_rent`(reused), `ti_annual`, `lease_term_years`, `rent_bump_frequency`,
  `option_count`, `option_term_years`, `notes`, `updated_by_id`. `lease_type` CHECK swapped to the new
  values. (`option_periods` free-text + `occupancy_status` retained in DB but dropped from the UI.)

**Sales** (`sale_comp`) — currency inputs; primary fields (Date/Price/NOI/Cap Rate/Source) up top,
collapsible **More Details** (Buyer, Seller, Broker, Occupancy %, Financing, Sale Condition);
per-record **Notes** + `updated_by_id` audit; derived cap-rate / price-PSF calculators.

**OM** (`operating_memorandum`) — separate **Guidance** and **Notes** fields; `updated_by_id` audit.

**Availability** (`comp_availability`, migration `20260825160000`) — **historical asking scenarios**
in their own tab (mirrors Lease/Sale). Each dated record: `as_of_date`, `availability_type`
(For Lease / For Purchase / For Lease or Purchase), `asking_type` (Land / Shopping Center /
Lease Conversion) with **asking fields gated by asking type**, notes, provenance, audit. Newest
record = "current". The comp's `is_available` flag (on `comp_property`) is the manual **on-market**
switch that turns the pin **amber**. (An earlier single-snapshot version lived on `comp_property`;
those columns were migrated into `comp_availability` and dropped.)

**Files** — a **Files tab** mounts the shared `FileManager` (`entityType='comp_property'`), giving one
Dropbox folder per comp at `/Salesforce Documents/Comps/<name or address> - City, ST`. No new UI —
same integration as properties/deals (`useDropboxFiles`, `dropboxService`).

**Chat** — the **Notes tab is now the shared chat** (`PortalChatTab`) used on site submit / deal /
property. Reuses the `site_submit_comment` table via a new nullable `comp_property_id` target column
(mirrors how deals were added); internal RLS already permits it. Any old `comp_note` rows migrated in.

**Map layer**
- **Availability amber pin** (`is_available`) takes precedence over the content-based color.
- **Right-click a pin → Verify Location** → the pin becomes draggable; drop it to save
  `verified_latitude/longitude` (mirrors the municipal-project verify flow). Menu also has
  **Open Details** (`CompContextMenu.tsx`).
- **Hover tooltip** shows the comp name + current asking headline (latest availability record).

**Audit** — `updated_by_id` added to `comp_property`, `lease_comp`, `sale_comp`,
`operating_memorandum`, and `comp_availability`; set on every save. Records show "Created by … · date
— Modified by … · date" via the shared `UserByIdDisplay`.

## Purpose

OVIS needs a best-in-class **comparable ("comp") database** for retail/restaurant real estate. The
strategic driver is **getting Starbucks deals approved**: Starbucks wants to know what every other
tenant in a trade area is paying, when their leases expire, what nearby restaurant properties sold
for, and at what cap rates. A rich, trustworthy comp DB lets us answer those questions on demand and
back our proposed rents/values with local evidence.

The database captures three kinds of comps tied to a physical location:

- **Comparable leases** — what tenants pay (rent PSF, NNN, term, expiration, escalations, TI…).
- **Comparable sales** — transactions (price, price PSF, cap rate, NOI, buyer/seller).
- **Operating Memorandums (OMs)** — broker sale packages (often the *source* of lease + sale data).

Data will be fed over time from **CoStar**, **Crexi**, and eventually **AI-agent web research** that
finds restaurant OM sales, in-place leases, and expirations online. Provenance is a first-class
concern so multi-source, agent-fed data stays trustworthy and de-dupable.

Related work: [STARBUCKS_SITE_ANALYSIS.md](STARBUCKS_SITE_ANALYSIS.md) (Site Analysis report),
[SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md](SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md) (snapshot pattern),
[ADDING_A_SYSTEM_LAYER.md](ADDING_A_SYSTEM_LAYER.md) (two-menu layer registration).

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Comp locations | **Separate `comp_property` table** (optional FK to `property`) | Keeps external CoStar/Crexi/OM comps out of the deal pipeline map, counts, and Dropbox mappings. Link to a real OVIS property only when it matches. |
| Lease granularity | **Tenant-level rent-roll rows** | Answers "what is *each* tenant paying and when do they expire" — the core Starbucks question. |
| First phase | **Manual entry + map layer + sidebar** | Start capturing today; the sidebar schema becomes the target for feeds + agent. |
| Tenant identity | **Link to merchant/brand FK where known, free-text fallback** | Enables "all Chipotle leases" aggregation while tolerating unknown tenants. |
| Trade area | **Manual pick from map now**; radius/drive-time deferred | No automated geo query needed in phase 1 — user selects comps off the map layer for a report. |
| Comp scope | **Retail/restaurant/QSR focus, extensible** | Fields tuned to the Starbucks use case; `property_type` lookup keeps it open. |
| Expiration signal | **Design clean fields + indexes now, wire the report later** | Expiring competitor leases = future Starbucks site opportunities; capture cleanly, build the report in a later phase. |

## Data model

All tables: `uuid` PK (`gen_random_uuid()`), snake_case, standard audit columns
(`created_by_id`, `owner_id`, `created_at`, `updated_at`), RLS following the OVIS peer model
(authenticated read-all; owner/creator write). Provenance columns (below) live on every comp-bearing
table.

### Provenance columns (shared on `comp_property`, `lease_comp`, `sale_comp`, `operating_memorandum`)

| Column | Type | Notes |
|---|---|---|
| `source_type` | text CHECK in (`manual`,`costar`,`crexi`,`om`,`ai_agent`) | Where the row came from |
| `source_url` | text | Listing/document URL |
| `source_reference` | text | External listing/record id (for dedupe) |
| `source_captured_at` | timestamptz | When ingested |
| `confidence` | text CHECK in (`unverified`,`reported`,`verified`) | `reported` = from a source but unconfirmed |
| `verified_by_id` | uuid → user | Human who confirmed |
| `verified_at` | timestamptz | |

### `comp_property` — the map pin (location)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `property_id` | uuid → property NULL | Link when it matches an existing OVIS property |
| `name` | text | Center/property name |
| `address` `city` `state` `zip` `county` | text | |
| `latitude` `longitude` | numeric | Raw |
| `verified_latitude` `verified_longitude` | numeric | Precedence: verified → raw (matches OVIS coord rule) |
| `property_type_id` | uuid → property_type (lookup) | Retail/restaurant/QSR/strip/pad… |
| `building_sqft` | numeric | |
| `land_acres` | numeric | |
| `year_built` | int | |
| `anchor_tenant` | text | Free text (co-tenancy context) |
| `trade_area` | text | |
| `parcel_id` | text | |
| + provenance + audit | | |

### `lease_comp` — a tenant's lease at a location (rent-roll row)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `comp_property_id` | uuid → comp_property NOT NULL | |
| `tenant_name` | text | Free-text fallback |
| `merchant_brand_id` | uuid → (merchant brand) NULL | FK when a known chain — enables per-brand rollups |
| `suite` | text | |
| `tenant_sqft` | numeric | |
| `lease_type` | text CHECK (`nnn`,`gross`,`modified_gross`,`ground`) | |
| `base_rent_psf` | numeric | |
| `annual_base_rent` | numeric | Derivable; store as captured |
| `nnn_psf` | numeric | |
| `all_in_rent_psf` | numeric | base + nnn |
| `lease_commencement_date` | date | |
| `lease_expiration_date` | date | **Indexed** — expiration report |
| `lease_term_months` | int | |
| `escalation_pct` | numeric | Simple annual bump |
| `rent_steps` | jsonb NULL | Detailed step schedule when known |
| `free_rent_months` | numeric | |
| `ti_psf` | numeric | |
| `option_periods` | jsonb NULL | Renewal options |
| `reported_tenant_sales` | numeric | Annual, if known |
| `sales_psf` | numeric | |
| `occupancy_status` | text | occupied / vacant / dark |
| + provenance + audit | | |

Indexes: `comp_property_id`, `lease_expiration_date`, `merchant_brand_id`.

### `sale_comp` — a transaction at a location

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `comp_property_id` | uuid → comp_property NOT NULL | |
| `sale_date` | date | **Indexed** |
| `sale_price` | numeric | |
| `price_psf` | numeric | |
| `cap_rate` | numeric | Store as decimal (e.g. 0.0625) or pct — pick one, document |
| `noi` | numeric | |
| `grm` | numeric | |
| `buyer_name` `seller_name` `broker` | text | |
| `financing` | text | |
| `sale_condition` | text | arms-length / distressed / portfolio |
| `occupancy_at_sale` | numeric | |
| + provenance + audit | | |

### `operating_memorandum` — broker sale package

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `comp_property_id` | uuid → comp_property NOT NULL | |
| `sale_comp_id` | uuid → sale_comp NULL | If it produced a closed sale |
| `title` | text | |
| `broker_name` `brokerage` | text | |
| `list_date` | date | |
| `asking_price` | numeric | |
| `asking_cap_rate` | numeric | |
| `guidance` | text | Free-form marketing notes |
| + provenance + audit | | |
| (PDF) | — | Stored via `dropbox_mapping`, not a DB blob |

### Notes & attachments

- **Notes:** add a dedicated lightweight **`comp_note`** table (mirrors `property_note`:
  `comp_property_id`, `body`, `created_by_id`, timestamps). Simpler than extending
  `note_object_link` with new typed FK columns, and comps may accrue many agent-generated notes.
- **Attachments (incl. OM PDFs):** reuse the **Dropbox pattern** — `dropbox_mapping` with
  `entity_type='comp_property'`, `entity_id=<comp_property.id>`, folder path per comp. No DB file rows.

### Lookups

- Reuse existing **`property_type`** lookup if it has adequate retail/restaurant granularity;
  otherwise add rows (pad/QSR/strip center/free-standing). Confirm during implementation.

## Map layer

Follows [ADDING_A_SYSTEM_LAYER.md](ADDING_A_SYSTEM_LAYER.md) — register in **both** menus
(`LayerManager.tsx` `DEFAULT_LAYERS` + `LayerType`, *and* the hardcoded `showCustomLayersMenu` block in
`MappingPageNew.tsx`). Model after `PropertyLayer` / `SiteSubmitLayer`.

- New layer id: `comp_database`. Component `CompDatabaseLayer.tsx`.
- Fetch `comp_property` rows (paginate — table will exceed 1000), resolve coords verified→raw.
- Marker styling by comp content: distinct pins for **has-lease-comp**, **has-sale-comp**, **has-OM**
  (or a blended badge). Cluster when dense.
- `onPinClick(comp_property)` → opens the comp sidebar.
- Optional filters (later): brand, expiring-within-N-months, property type.

## Pin-detail sidebar

`CompDetailSlideout.tsx`, drop-in per the overlay-first convention (`objectType='comp_property'` +
`objectId`; works mounted in a slideout). Tabs:

1. **Overview** — `comp_property` fields, inline-editable; link to OVIS property if matched.
2. **Leases** — rent-roll table of `lease_comp` rows; add/edit; expiration highlighted.
3. **Sales** — `sale_comp` rows.
4. **OM / Docs** — `operating_memorandum` rows + Dropbox files.
5. **Notes** — `comp_note`.
6. **Files** — Dropbox folder.

**Calculators** (inline in the relevant tabs), as a pure module `src/lib/compCalculators.ts` reused by
UI *and* the future agent:

- Cap rate ↔ NOI ↔ price (any two → third)
- Price PSF, Rent PSF, All-in rent PSF
- Effective/blended rent (free rent + escalations amortized over term)
- Remaining lease term (months to `lease_expiration_date`)
- GRM

## Phasing roadmap

**Phase 1 — Foundation (build now)**
- Migrations: `comp_property`, `lease_comp`, `sale_comp`, `operating_memorandum`, `comp_note`,
  provenance columns, indexes, RLS.
- `CompDatabaseLayer` renders pins (both menus registered).
- `CompDetailSlideout` with all tabs, manual data capture, notes, Dropbox files.
- `compCalculators` module.
- Manual comp selection off the map for reports.

**Phase 2 — Bulk ingestion**
- CoStar / Crexi export (CSV/API) importer → normalize to schema.
- Dedupe on `source_reference` + address + tenant + dates.
- `comp_import_batch` provenance table.

**Phase 3 — AI-agent research**
- Agent finds OM sales / in-place leases / expirations online, extracts to schema, sets
  `source_type='ai_agent'`, `confidence='reported'`.
- Human review queue to promote `reported` → `verified`.
- MCP wrapper so external agents can write comps (per AI architecture note).

**Phase 4 — Trade-area analytics (deferred)**
- Radius rings (1/3/5 mi) then drive-time isochrones.
- **Expiring-leases-near-target** report (fields already indexed) → Starbucks site-opportunity signal.
- Feed comp evidence into the Site Analysis / Starbucks approval report.

## Open questions

Resolved:
1. ~~merchant/brand table~~ → `merchant_brand(id)`; `lease_comp.merchant_brand_id` FKs to it.
2. ~~property_type granularity~~ → reused existing `property_type` lookup; add retail/QSR rows if needed.
3. ~~cap_rate decimal vs percent~~ → **percent** (6.25 = 6.25%), enforced by convention + code comments.
6. ~~Attachments / Files tab~~ → **shipped**: Files tab mounts the shared `FileManager`
   (`entity_type='comp_property'`), one Dropbox folder per comp.

Still open (future phases):
4. Report output: does this feed the existing [Site Analysis report](STARBUCKS_SITE_ANALYSIS.md), or a
   new "Comp Report" export? (Today = manual selection off the map.)
5. Whether `sale_comp` / `lease_comp` should also allow a direct FK to OVIS `property` for comps that
   *are* our own tracked properties (today they attach to `comp_property`, which itself may link to a
   `property`).
7. **Availability-only map filter** + a legend entry for the amber "on-market" pin (suggested next).
