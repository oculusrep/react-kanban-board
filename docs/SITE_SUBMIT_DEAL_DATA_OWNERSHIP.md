# Site Submit / Deal Data Ownership

> **For AI agents:** when editing or fetching economic fields (sqft, acres, lease/purchase price, rent, NNN, TI, delivery timeframe) in a **site submit** or **deal** context, read this first. The intuitive assumption — that these fields live on `property` and are shared — is **wrong as of 2026-05-14**.

## TL;DR

```
property ────(snapshot at create)────► site_submit ────(snapshot at LOI)────► deal
   │                                       │                                    │
   │ marketing data                        │ what was offered to the client     │ negotiated terms
   │ (still editable on property page)     │ (editable in blue sidebar)         │ (editable in green sidebar)
   └─ EDITS NEVER PROPAGATE forward         └─ EDITS NEVER PROPAGATE forward      └─ EDITS NEVER PROPAGATE back
```

The three records each own their own copy of the economics. Snapshots flow forward; edits never flow back.

## The data ownership rule

| Context | Read from | Write to | Sidebar |
|---|---|---|---|
| Property Details page | `property.*` | `property.*` | n/a |
| Site Submit sidebar (pre-LOI, blue header) | `site_submit.*` | `site_submit.*` | [shared/SiteSubmitSidebar.tsx](../src/components/shared/SiteSubmitSidebar.tsx) |
| Deal sidebar (post-LOI, green header) | `deal.deal_*` | `deal.deal_*` | [shared/DealDataTab.tsx](../src/components/shared/DealDataTab.tsx) |

**Never** write to `property.*` from a site-submit-context UI. **Never** write to `site_submit.*` from a deal-context UI. Each record snapshots from the previous one at creation and diverges independently.

## The economic field set

These columns exist on all three tables with parallel meaning (prefix on `deal`, unprefixed on the others):

| Concept | `property` | `site_submit` | `deal` |
|---|---|---|---|
| Available sqft | `available_sqft` | `available_sqft` | `deal_available_sqft` |
| Building sqft | `building_sqft` | `building_sqft` | `deal_building_sqft` |
| Acres | `acres` | `acres` | `deal_acres` |
| Asking / Annual lease price | `asking_lease_price` | `asking_lease_price` | `deal_asking_lease_price` |
| Rent PSF | `rent_psf` | `rent_psf` | `deal_rent_psf` |
| NNN PSF | `nnn_psf` | `nnn_psf` | `deal_nnn_psf` |
| All-in rent | `all_in_rent` | `all_in_rent` | `deal_all_in_rent` |
| Asking purchase price (land) | `asking_purchase_price` | `asking_purchase_price` | `deal_asking_purchase_price` |
| Ground lease price (land) | `asking_lease_price`* | `asking_ground_lease_price` | `deal_asking_ground_lease_price` |
| NNN flat (land) | — | `nnn` | `deal_nnn` |
| TI (tenant improvement) | — | `ti` | `deal_ti` |
| Delivery timeframe | — | `delivery_timeframe` | `deal_delivery_timeframe` |

*`property.asking_lease_price` is reused as the ground-lease source for land deals — there's no separate `asking_ground_lease_price` column on `property`. From `site_submit` onward the two are separate columns.

`property_unit.sqft / rent / nnn` exist for properties with units and are preferred over the property's top-level values when a unit is selected; they snapshot into `site_submit` the same way at creation.

## Snapshot points

### Property → site_submit (at submit creation)

Three creation paths, all do the snapshot:

- [shared/SiteSubmitCreateForm.tsx:253-294](../src/components/shared/SiteSubmitCreateForm.tsx#L253-L294) — main create flow on the map sidebar
- [SiteSubmitFormModal.tsx:445-489](../src/components/SiteSubmitFormModal.tsx#L445-L489) — legacy modal form
- [mapping/slideouts/PinDetailsSlideout.tsx:1600-1645](../src/components/mapping/slideouts/PinDetailsSlideout.tsx#L1600-L1645) — right-click-create on map

Each fetches the property (and the selected unit, if any), prefers unit values for sqft/rent/nnn, falls back to property values, writes both into the new `site_submit` row.

**If you add a fourth creation path, you MUST do the snapshot there too — otherwise the new submit will display blanks in the "Deal Details" panel.**

### Site_submit → deal (at LOI)

[ConvertSiteSubmitToDealModal.tsx:287-377](../src/components/ConvertSiteSubmitToDealModal.tsx#L287-L377) — selects all economic fields from `site_submit` and copies into the new `deal` row's `deal_*` columns. Land vs. building branch determines which fields are populated.

**The deal inherits from `site_submit`, not directly from `property`.** This matters because the site submit may have negotiated values that already differ from property marketing data by the time LOI is signed. If you're tempted to change this back to copy from property — don't. The site submit is the authoritative baseline for what was offered to the client.

## Label conventions in the green deal sidebar

The "Deal Details" panel in [DealDataTab.tsx](../src/components/shared/DealDataTab.tsx) uses different labels from the pre-LOI site submit sidebar, because the deal context implies these are negotiated:

| Field | Site submit label | Deal label |
|---|---|---|
| `asking_lease_price` / `deal_asking_lease_price` | Asking Lease Price | **Annual Lease Price** |
| `asking_purchase_price` / `deal_asking_purchase_price` | Asking Purchase Price | **Purchase Price** |
| `asking_ground_lease_price` / `deal_asking_ground_lease_price` | (not shown) | **Ground Lease Price** |

The "Asking" prefix is intentional only in the pre-LOI panel. Don't unify the labels.

## TypeScript interfaces

Three places define a `SiteSubmitData` interface — all three must stay in sync with the schema:

- [shared/SiteSubmitSidebar.tsx](../src/components/shared/SiteSubmitSidebar.tsx#L28-L132) — primary export, imported by `SiteSubmitDataTab` and `DealDataTab`
- [portal/PortalDataTab.tsx](../src/components/portal/PortalDataTab.tsx) — local copy for portal use
- [portal/PortalDetailSidebar.tsx](../src/components/portal/PortalDetailSidebar.tsx) — local copy for portal sidebar

Same applies to the SELECT queries that fetch site submits. If you add a new economic column to `site_submit`, update all three interfaces AND the SELECT queries in:
- [shared/SiteSubmitSidebar.tsx](../src/components/shared/SiteSubmitSidebar.tsx#L348-L362) (the main map sidebar fetch)
- [portal/PortalDetailSidebar.tsx](../src/components/portal/PortalDetailSidebar.tsx#L161-L184) (portal fetch)
- [shared/SiteSubmitCreateForm.tsx](../src/components/shared/SiteSubmitCreateForm.tsx#L270-L294) (returning row after insert)

`useSiteSubmitEmail.ts` and other consumers using `select('*')` pick up new columns automatically.

## Downstream consumers that read these fields

These read from `site_submit` first (with property fallback for legacy data):

- [utils/siteSubmitEmailTemplate.ts:88-135](../src/utils/siteSubmitEmailTemplate.ts#L88-L135) — outgoing site submit emails to clients
- [portal/PortalDataTab.tsx](../src/components/portal/PortalDataTab.tsx) — client-facing portal "Deal Details" panel
- [shared/DealDataTab.tsx](../src/components/shared/DealDataTab.tsx) "Original Site Submit Values" collapsible — shows the baseline the deal was negotiated from

The Property Details page, `PropertySearchBar`, and other property-context UI continue to read/write `property.*` directly — they're unaffected.

## Migrations

- [supabase/migrations/20260514000000_add_site_submit_economics.sql](../supabase/migrations/20260514000000_add_site_submit_economics.sql) — adds 10 columns to `site_submit`, backfills from property/unit.
- [supabase/migrations/20260514000001_add_deal_ti_delivery_timeframe.sql](../supabase/migrations/20260514000001_add_deal_ti_delivery_timeframe.sql) — adds `deal.deal_ti` and `deal.deal_delivery_timeframe`, backfills from `site_submit`.

Both applied to production on 2026-05-14. 2,716 of 2,946 site submits and 44 of 726 deals had values backfilled (the rest had source data that was null or already had snapshots).

## Common AI-agent mistakes to avoid

1. **"The asking lease price isn't updating!"** — If you're looking at a site submit sidebar and changing the lease price, but the Property Details page still shows the old value, **that's correct behavior**. They're separate columns now. Don't add a sync hack.

2. **"Let me just copy from property when creating the deal."** — No. Copy from `site_submit`. See [ConvertSiteSubmitToDealModal.tsx](../src/components/ConvertSiteSubmitToDealModal.tsx#L287-L377).

3. **"This field doesn't exist on site_submit"** — Check the schema. After 2026-05-14, `site_submit` has `available_sqft`, `building_sqft`, `acres`, `asking_lease_price`, `asking_purchase_price`, `asking_ground_lease_price`, `rent_psf`, `nnn_psf`, `all_in_rent`, `nnn` directly. Don't reach into `site_submit.property.*` for these — use the local column.

4. **"Adding a new creation path for site submits."** — Snapshot the property economics at insert time. See the three existing creation paths for the pattern. Skipping this leaves the new submit with NULL economics that won't render in the sidebar.

5. **"Pencil-editing a field in the green deal sidebar."** — Writes go to `deal.deal_*`, not `site_submit.*` and not `property.*`. The `DealDataTab` handler is hardwired to the `deal` table — see [DealDataTab.tsx:329-350](../src/components/shared/DealDataTab.tsx#L329-L350).
