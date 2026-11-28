# NNN Listing Intake — Spec v2 (feed the existing Comp Database)

**Status:** **APPROVED 2026-10-22** (decisions in §10). **Phase 1 LIVE 2026-10-28:**
- the migrations are applied;
- `ovis-mcp` v0.2.0 is deployed;
- `listing_staging` is dropped;
- the work is merged to main.

The duplicate decisions are in §12; the rollout log is in §13. The OAuth connector step is Mike's. Phase 2 is not started.
**Date:** 2026-10-22
**Supersedes:** the data model in [NNN_LISTING_INTAKE.md](NNN_LISTING_INTAKE.md) (v1). The v1 MCP endpoint, auth and
OAuth consent design carry over unchanged.

**Requirement:** the NNN listing intake feeds the **existing** comp database. It does not build a parallel structure.

---

## 0. TL;DR

- **Recommend option (b).** Drop `listing_staging`. `upsert_listing` writes straight into `comp_property` +
  `lease_comp` + `operating_memorandum`, gated by a new `comp_property.review_status` flag.
- Each listing becomes an **`operating_memorandum`** row, not a `comp_availability` row.
  - `operating_memorandum` already has `asking_price`, `asking_cap_rate`, `list_date`, `broker_name`, `brokerage`, `source_url` and a `sale_comp_id` link for when it sells.
  - v1 Promote used `comp_availability` and put the cap rate in a notes field. That was the wrong table.
- **Noree's whole checklist already has homes** in `lease_comp`, `comp_property.parcel_id` and the comp **Files** tab, except the guarantor. She can do the diligence in the existing comp slideout. No parallel diligence fields are needed.
- **Seven new columns on existing tables** (§4), plus one optional column on `task`.
- **Committee-readiness gaps** (§7): the must-haves are:
  - a sale → lease-in-place link;
  - expense structure (absolute NNN);
  - concept / drive-thru;
  - guarantor;
  - county / MSA;
  - verification method;
  - per-figure confidence;
  - fact views for the committee table export.
- **One new table**, `comp_listing_event` (§8, pricing history), justified there. It is the only new comp table.
- **v1 has a live defect.** Promote writes `"user".id` into comp `created_by_id` / `updated_by_id`, but those columns reference **`auth.users`**.
  - The two ids are equal for Mike only. Promote would fail with an FK violation for Noree or Arty.
  - It is moot if v2 is approved, because Promote goes away.

---

## 1. Inventory — comp schema in prod (queried 2026-10-22)

### Row counts

| Table | Rows | Notes |
|---|---|---|
| `comp_property` | 29 | 0 have `parcel_id`; 0 linked to `property`; 29 have verified coords; 0 `is_available` |
| `lease_comp` | 16 | 3 `bts_nnn`, 7 `ground_lease`, 5 `multi_tenant`, 1 null |
| `sale_comp` | 11 | 3 with cap rate (5.22–5.65, **percent** units) |
| `operating_memorandum` | 1 | asking $2,091,000 @ 6.5 (percent) |
| `comp_availability` | 1 | `for_lease` / `lease_conversion` |
| `comp_note` | 0 | legacy; superseded by `site_submit_comment.comp_property_id` |
| `site_submit_comment` (comp rows) | 4 | the comp **Chat** tab |
| `dropbox_mapping` (`entity_type='comp_property'`) | 4 | the comp **Files** tab |
| `listing_staging` (v1, this branch) | 0 | live in prod, empty |

### Tables

All comp tables share these conventions:
- **RLS:** `FOR ALL TO authenticated USING (is_internal_user())`.
- **Provenance set:** `source_type` (`manual|costar|crexi|om|ai_agent`), `source_url`, `source_reference`, `source_captured_at`, `confidence` (`unverified|reported|verified`), `verified_by_id`, `verified_at`.
- **Audit:** `created_by_id` and `updated_by_id` → **`auth.users(id)`**; `created_at` and `updated_at` are set by trigger.

**`comp_property`** — the map pin (location)

| Group | Columns |
|---|---|
| Keys | `id` uuid PK; `property_id` → `property` (SET NULL) |
| Location | `name`, `address`, `city`, `state`, `zip`, `county`, `latitude`, `longitude`, `verified_latitude`, `verified_longitude` |
| Property | `property_type_id` → `property_type` (SET NULL), `building_sqft`, `land_acres`, `year_built`, `anchor_tenant`, `trade_area`, `parcel_id` |
| Status | `is_available` bool NOT NULL default false (the on-market switch; makes the pin amber) |
| Other | provenance, audit |

Indexes: `property_id`, `property_type_id`, `(verified_latitude, verified_longitude)`, `(source_type, source_reference)`, partial on `is_available`.

**`lease_comp`** — one tenant's lease. Child of `comp_property` (CASCADE).

| Group | Columns |
|---|---|
| Tenant | `tenant_name`, `merchant_brand_id` → `merchant_brand` (SET NULL), `suite`, `tenant_sqft` |
| Type | `lease_type` CHECK `ground_lease|bts_nnn|bts_nn|multi_tenant` |
| Rent | `base_rent_psf`, `annual_base_rent`, `nnn_psf`, `all_in_rent_psf` |
| Term | `lease_commencement_date`, `lease_expiration_date`, `lease_term_months`, `lease_term_years` |
| Increases | `escalation_pct`, `rent_bump_frequency` CHECK `annual|every_5_years|other`, `rent_steps` jsonb |
| Options | `option_count`, `option_term_years`, `option_periods` text (legacy) |
| Concessions | `free_rent_months`, `ti_psf`, `ti_annual` |
| Sales | `reported_tenant_sales`, `sales_psf` |
| Other | `occupancy_status` CHECK `occupied|vacant|dark`, `notes`, provenance, audit |

Indexes: `comp_property_id`, `lease_expiration_date`, `merchant_brand_id`.

**`sale_comp`** — a closed transaction. Child of `comp_property` (CASCADE).

| Group | Columns |
|---|---|
| Deal | `sale_date`, `sale_price`, `price_psf`, `cap_rate` (percent), `noi`, `grm` |
| Parties | `buyer_name`, `seller_name`, `broker`, `financing` |
| Other | `sale_condition` CHECK, `occupancy_at_sale`, `notes`, provenance, audit |

Indexes: `comp_property_id`, `sale_date`.

**`operating_memorandum`** — a broker sale package, i.e. an **on-market offering**. Child of `comp_property` (CASCADE).

| Group | Columns |
|---|---|
| Keys | `sale_comp_id` → `sale_comp` (SET NULL) |
| Offering | `title`, `broker_name`, `brokerage`, `list_date`, `asking_price`, `asking_cap_rate` (percent), `guidance` |
| Other | `notes`, provenance, audit |

Indexes: `comp_property_id`, `sale_comp_id`.

**`comp_availability`** — dated asking scenarios for lease or purchase. Child of `comp_property` (CASCADE).

| Group | Columns |
|---|---|
| When | `as_of_date` |
| Type | `availability_type` CHECK `for_lease|for_purchase|for_lease_or_purchase`; `asking_type` CHECK `land|shopping_center|lease_conversion` |
| Asking | `asking_purchase_price`, `asking_ground_lease_price`, `asking_rent_psf`, `asking_nnn_psf`, `asking_annual_rent` |
| Other | `notes`, provenance, audit |

There is no cap-rate column. The table is built around land / center / conversion **leasing** asks, not NNN investment sales.

**`comp_note`** — `comp_property_id`, `body`. Legacy. Its rows were migrated into `site_submit_comment`.

### Who reads them

| Table | Screens / code |
|---|---|
| `comp_property` | `CompDatabaseLayer` (map pins), `CompDetailSlideout` (Overview + header), `FileManager` / `useDropboxFiles` / `dropboxService` (Files tab), `MappingPageNew` (verify-location drag, Add Comp Here); v1 branch: `ListingReviewPage` |
| `lease_comp` | `CompDatabaseLayer` (count → pin color), `CompDetailSlideout` Leases tab |
| `sale_comp` | `CompDatabaseLayer` (count), `CompDetailSlideout` Sales tab |
| `operating_memorandum` | `CompDatabaseLayer` (count → dashed terracotta OM ring), `CompDetailSlideout` OM tab (`title`, `broker_name`, `brokerage`, `list_date`, `asking_price`, `asking_cap_rate`, `guidance`, `notes`) |
| `comp_availability` | `CompDatabaseLayer` (latest → hover tooltip), `CompDetailSlideout` Availability tab |
| `site_submit_comment.comp_property_id` | `PortalChatTab` (comp Chat tab) |

No report reads the comp tables yet. Phase 4 (expiring-leases report, Site Analysis feed) is unbuilt. The filter surface for a review flag is therefore three components today.

### Data-quality flags in existing comps

These are flagged only, not fixed. They matter for dedupe in §5.

- `2850 Jimmy Lee Smith Parkway, Hiram` has **2** `comp_property` rows.
- `5811 Zebulon Road, Macon` has **2** rows.
- **2** rows have no address at all.

---

## 2. Field mapping

### Fields the sweep produces

| Sweep field | Existing column | Notes |
|---|---|---|
| `tenant` | `lease_comp.tenant_name`; also `comp_property.name` on a new property | `merchant_brand_id` is set only when the name matches exactly one `merchant_brand` |
| `guarantor_type` | — | **GAP** |
| `address` | `comp_property.address` | |
| `city` | `comp_property.city` | |
| `state` | `comp_property.state` | |
| `price` | `operating_memorandum.asking_price` | |
| `cap_rate` | `operating_memorandum.asking_cap_rate` | Same percent units as `sale_comp.cap_rate` (6.25 = 6.25%) |
| `lease_type` | `lease_comp.lease_type` (mapped) | Absolute NNN / NNN → `bts_nnn`; NN → `bts_nn`; ground → `ground_lease`. The as-listed string has no home: **GAP** (snapshot) |
| `term_left` | — | **GAP**. It is a snapshot that ages; `lease_expiration_date` is only filled when actually known. The sweep must not fabricate an expiration from "14 yrs" |
| `source` | `operating_memorandum.source_type` + `comp_property.source_type` | crexi → `crexi`; LoopNet / CoStar → `costar` (LoopNet is CoStar-owned); else `ai_agent`. The raw site name goes in `source_reference` |
| `source_url` | `operating_memorandum.source_url` | Already exists. Not a gap |
| `first_seen` | `operating_memorandum.source_captured_at` (approximate) | `source_captured_at` means "when ingested", which is close. A dedicated column is proposed so the meaning is unambiguous: **GAP** (soft) |
| `last_seen` | — | **GAP** |
| `lat` / `lng` | `comp_property.latitude` / `longitude` | `verified_*` stay human-set |
| review status | — | **GAP** |
| listing lifecycle (active / under contract / off market / sold) | partially: `comp_property.is_available` | `is_available` is per property, not per offering. **GAP** on the offering |
| normalized address | — | **GAP** (needed for dedupe) |

### Noree's checklist

| Checklist item | Existing column / feature | Where she enters it today |
|---|---|---|
| Get OM | `operating_memorandum` row (the listing itself) | OM tab |
| Attach OM PDF | `dropbox_mapping` (`comp_property`) | Files tab |
| Confirm guarantor (corp vs franchisee) | — | **GAP** |
| Base rent | `lease_comp.annual_base_rent` (and `base_rent_psf`) | Leases tab |
| NOI | Derivable: `asking_price × asking_cap_rate`; for absolute NNN, ≈ `annual_base_rent` | Leases tab / calculators. No column proposed (see §4 note) |
| Increases | `lease_comp.escalation_pct` + `rent_bump_frequency` (+ `rent_steps`) | Leases tab |
| Options | `lease_comp.option_count` + `option_term_years` | Leases tab |
| Lease start / expiry | `lease_comp.lease_commencement_date` / `lease_expiration_date` (expiration auto-derives from term) | Leases tab |
| APN | `comp_property.parcel_id` | Overview → More Details |

### Gaps

1. `guarantor_type`, on the lease
2. Review status, on the property
3. Listing lifecycle (active / under contract / off market / sold), on the offering
4. `last_seen`, on the offering
5. `first_seen`, on the offering (soft: `source_captured_at` is close)
6. As-listed term remaining (snapshot)
7. As-listed lease type (snapshot; also carries absolute vs standard NNN)
8. Normalized address, on the property
9. Task ↔ comp link (optional; on `task`, not a comp table)

---

## 3. Recommendation: **(b)** — drop `listing_staging` and write straight into the comp tables

### Why (b)

1. **Noree's diligence lands in comp fields either way.** Seven of the eight checklist items have a column in `lease_comp` / `comp_property` or a feature in the comp slideout.
   - Under (a), she either fills a staging row that lacks those fields, which grows a parallel structure, or waits for a Promote before she can start.
   - Under (b), the VA task opens the comp, and she works the Leases / Overview / Files tabs that already exist.
2. **Dedupe has to consult `comp_property` anyway.** A sweep listing for a property you already comp'd manually must attach to that comp, not create a second one.
   - Under (a), matching runs against two tables (`listing_staging` and `comp_property`), and the two can disagree.
   - Under (b), there is one table and one key.
3. **Rejection memory.** The sweep must not re-propose a listing you rejected.
   - Under (b), a rejected property stays as a `comp_property` row with `review_status='rejected'`. It is hidden but still matchable.
   - Under (a), that memory lives outside the comp DB.
4. **The filter cost is small now and grows later.** Only `CompDatabaseLayer`, `CompDetailSlideout` and `FileManager` read `comp_property` today, and there are no reports yet. Adding a review filter now is three call sites. After the Phase 4 reports exist, it is more.
5. **The existing provenance model already expects this.** The original comp design ([COMP_DATABASE_DESIGN.md](COMP_DATABASE_DESIGN.md), Phase 3) says agent rows go in the comp tables with `source_type='ai_agent'` / `confidence='reported'` and a human review queue promotes them to `verified`. Option (b) is that plan.

### Cost / risk of (b)

| Risk | Mitigation |
|---|---|
| Unreviewed sweep rows sit in `comp_property`. Any future consumer that forgets the filter shows them. | `review_status` defaults to `'reviewed'`, so all 29 existing rows are unaffected. Future reports read a view, `comp_property_reviewed` (`WHERE review_status = 'reviewed'`), not the base table. |
| A noisy sweep adds rows to the comp DB. | Rejected rows are hidden everywhere except the review screen. They cost a row each and buy dedupe memory. |

### Why not (a)

(a) works, and it is what v1 built. But v1 Promote had two problems:
- It wrote to `comp_availability` instead of `operating_memorandum`.
- It had the `auth.users` FK defect.

Fixing (a) correctly means the staging row and the comp converge on the same fields, and that duplication is the parallel structure we want to avoid.

---

## 4. Proposed columns — on existing tables only

These are the columns the **intake** needs. §7.7 lists the further columns the **committee packages** need, and §8 adds the one new table.

| Table | Column | Type | Purpose |
|---|---|---|---|
| `comp_property` | `review_status` | text NOT NULL DEFAULT `'reviewed'` CHECK in (`pending_review`,`reviewed`,`rejected`) | Gates visibility of sweep-created pins. The default keeps the 29 existing rows unchanged. |
| `comp_property` | `address_norm` | text, **generated stored** from `normalize_listing_address(address, city, state)` | Dedupe key (§5). **Indexed, not unique**: the existing duplicates (Hiram, Macon, two blank rows) would block a unique index. Revisit after they are cleaned up. |
| `lease_comp` | `guarantor_type` | text CHECK in (`corporate`,`franchisee`,`personal`,`other`) NULL | Guarantor belongs to the lease. NULL = unconfirmed. |
| `operating_memorandum` | `listing_status` | text NOT NULL DEFAULT `'active'` CHECK in (`active`,`under_contract`,`off_market`,`sold`) | Lifecycle of this offering. It is **maintained by trigger from the latest status-bearing event** in `comp_listing_event` (§8); it is never written directly. `sold` links to a `sale_comp` through the existing `sale_comp_id`. |
| `operating_memorandum` | `first_seen_at` | timestamptz NOT NULL DEFAULT now() | When the offering was first captured. Backfill = `created_at`. |
| `operating_memorandum` | `last_seen_at` | timestamptz NOT NULL DEFAULT now() | Bumped on every re-sighting. Backfill = `updated_at`. |
| `operating_memorandum` | `listed_term_remaining` | text NULL | As-listed snapshot, e.g. "14 years". It belongs on the dated offering, not the lease, because it ages. |
| `operating_memorandum` | `listed_lease_type` | text NULL | As-listed snapshot, e.g. "Absolute NNN". This keeps the absolute vs standard NNN distinction that the `lease_type` enum drops. |
| `task` *(optional, not a comp table)* | `comp_property_id` | uuid → `comp_property` ON DELETE SET NULL | Same pattern as `task.deal_id` / `property_id` / `site_submit_id`. It lets the VA task link and open the comp. Without it, the link is a URL in the description, as in v1. |

**Not proposed:**
- **A NOI column on the offering.** `asking_price × asking_cap_rate` already derives it, through the existing calculators.
- **New `source_type` values for the intake itself.** LoopNet maps to `costar`, and the raw source name goes in `source_reference`. (§7.5 separately proposes `broker` and `pt61` for committee provenance.)

**Also in the migration:**
- A `comp_property_reviewed` view, with a SELECT grant to `authenticated`.
- The two new `SECURITY DEFINER` RPCs, `service_role` only.
- `DROP` of `listing_staging` and its v1 RPCs (`upsert_listing_staging`, `create_listing_va_task`, `promote_listing_to_comp`). `normalize_listing_address` is kept and reused.

No new comp tables.

---

## 5. Dedupe

### Key

`comp_property.address_norm` = `normalize_listing_address(address, city, state)`. This is the v1 function:
- lowercase;
- strip `.,#`;
- collapse whitespace;
- apply USPS suffix and directional abbreviations, so `boulevard` becomes `blvd` and `northwest` becomes `nw`;
- append `, <city> <state>`.

Including city and state matters, because "100 Main St" exists in many GA cities.

### Match order inside the upsert RPC

1. **APN first, when the sweep supplies one.** Compare normalized `parcel_id` (strip spaces and dashes, uppercase) with the same `state`. Today 0 comps have an APN, so this pays off later, after Noree fills `parcel_id`.
2. **Otherwise match `address_norm` exactly.** All review statuses are considered, including `rejected`.
3. **Multiple matches** (an existing duplicate pair): attach to the best one. Prefer `reviewed` over `pending_review`, then `confidence` `verified` > `reported` > `unverified`, then the oldest. Return `ambiguous_match: true` so the review screen flags it. The duplicates are not merged.
4. **Match is `rejected`:** write nothing except `last_seen_at` on its offering. Return `{skipped: 'rejected'}`.

Suite numbers stay in the key, so "Ste 100" and "Ste 200" are different pads in one center. This is right for multi-tenant centers.

Fuzzy matching (a geocode distance under ~30 m with a different house number) is **not proposed** for v2. Census coordinates are interpolated along the street and cannot support it. Revisit if Google geocoding is enabled.

### What happens on a match vs no match

| Case | Writes |
|---|---|
| No match | New `comp_property` (`review_status='pending_review'`, `is_available=true`, `confidence='reported'`, name = tenant, geocoded lat/lng) + `lease_comp` (tenant, mapped `lease_type` / `expense_structure`, `guarantor_type` if given) + `operating_memorandum` (first/last seen, `listed_*` snapshots, `source_url`) + a `listed` event carrying price and cap (§8) |
| Match, with an **active** offering | Bump `last_seen_at`. If the price or cap differs from the latest event, insert a `price_change` / `cap_change` event (§8). The trigger moves the current ask. Same price = no event. |
| Match, no active offering (a re-listing) | New `operating_memorandum` with a `relisted` event; set `is_available=true`. Add a `lease_comp` only if none exists for the same tenant name. `review_status` is unchanged, so a reviewed comp stays reviewed. |

---

## 6. What changes

### MCP tools (`supabase/functions/ovis-mcp`)

**`upsert_listing`**
- **Inputs:** same as v1, plus optional `apn`, `zip`, `list_date`, `broker_name`, `brokerage`.
- **Writes:** a single new RPC, `upsert_comp_listing`, which does all §5 logic in one transaction.
- **Returns:** `{comp_property_id, listing_id (the operating_memorandum id), is_new, is_new_property, matched_existing_comp, review_status, changed, old?, new?, ambiguous_match?, skipped?}`.
  - `changed` / `old` / `new` report a price or cap change (§8).
  - `is_new` = a new offering. It is the signal to call `create_va_task`.
  - `id` is kept as an alias of `listing_id` for v1 compatibility.
- **Geocoding:** only for a new property with no coords. Same Google-if-keyed, else Census rule.
- **Attribution:** `created_by_id` gets the **auth user id** from the OAuth token, or NULL for the static token. This fixes the FK defect.

**`create_va_task`**
- **Input:** `listing_id` becomes `comp_property_id`; an `operating_memorandum` id is also accepted and resolved.
- **Behavior:**
  - Sets `task.comp_property_id`, if the optional column is approved.
  - The description link becomes `/listings/review?comp=<id>`.
  - Checklist lines say where each item goes, e.g. "[ ] Base rent / NOI → Leases tab".
  - Assignee, Inbox and ET due-date behavior are unchanged.

**`listing_activity`** *(new, 4th tool; §8)* — the day's or window's new listings, price/cap changes, status changes and possibly-off-market flags, reported separately. This is what the daily summary reads.

**`list_recent_listings`**
- **Reads:** `operating_memorandum` joined to `comp_property`, where `first_seen_at >= now() - days`.
- **Returns:** `address_norm`, `tenant` (from `lease_comp`), `first_seen`, `last_seen`, `listing_status`, `review_status`.
- **Rejected rows are included** so the agent knows not to re-report them.

### Review screen (`/listings/review`)

- **Source:** reads `comp_property` + its `operating_memorandum` and `lease_comp`, not `listing_staging`.
- **Tabs:**
  - **Pending review** (`review_status='pending_review'`)
  - **Active listings** (offering `active`, any review status)
  - **Re-listed existing comps** (new offering in the last 30 days on a `reviewed` comp)
  - **Under contract / off market / sold**
  - **Rejected**
- **Row actions:**
  - **Approve** → `reviewed`; the pin appears in the Comp Database layer.
  - **Reject** → `rejected`; hidden, kept for dedupe.
  - **Record status** (under contract / off market / back on market) → writes a `comp_listing_event` (§8). The trigger updates `listing_status`.
  - **Record close** → `record_listing_close` (§8.2). It requires a price, a close date and a verification method (PT-61 / broker confirm / OM-verified), and creates the `sale_comp`.
  - **Open comp** → the existing `CompDetailSlideout`. This is where Noree does the checklist.
- **Promote goes away.** Approve replaces it, because the data is already in the comp tables.
- `ListingDetailPanel` is replaced by `CompDetailSlideout`, plus a small review-actions strip (Approve / Reject / Sold) above it.
- Each listing shows its **price history timeline** (§8).
- An `ambiguous_match` flag and "not on map" (geocode failed) show as row warnings, as in v1.

### Map layer

- **Delete** `ListingStagingLayer`, its slideout, and the "NNN Listings" row in both layer menus (`LayerManager` + `MappingPageNew` popup).
- **`CompDatabaseLayer`** filters `review_status = 'reviewed'` by default.
  - The Comp Database row in the `MappingPageNew` popup gains a **"Show pending listings"** sub-toggle.
  - Pending pins draw with a dashed terracotta outline. Rejected pins are never drawn.
  - On-market listings are already amber (`is_available`), so NNN listings read as amber pins with no new styling.
- **`CompDetailSlideout`:**
  - shows a "Pending review" badge and Approve / Reject in the header when the comp is pending;
  - the OM tab shows `listing_status`, first/last seen and the two `listed_*` snapshots;
  - the Leases tab adds the Guarantor field.

### Also changed / removed

- **Removed** (all built on this branch for v1, nothing on main):
  - Files: `src/lib/listingStaging.ts`, `ListingDetailPanel.tsx`, `ListingStagingLayer.tsx`, `ListingStagingSlideout.tsx`.
  - The v1 RPCs.
- **Unchanged:**
  - The edge function's auth: OAuth 2.1 via Supabase Auth plus the static token.
  - `/oauth/consent`.
  - The dashboard steps in [NNN_LISTING_INTAKE.md](NNN_LISTING_INTAKE.md).
- **Prod state to unwind:** `listing_staging` is live in prod with 0 rows, and `ovis-mcp` is deployed against it. The v2 migration drops the table. The edge function redeploy must ship in the same session, or `upsert_listing` fails in between.

---

## 7. Comp database gap review (committee packages)

**Use case:** the comps feed Starbucks / committee packages, so they must answer three questions:
- What are current rents on comparable leases?
- What are comparable sales trading at?
- What are average cap rates by tenant, market, guarantor type and term remaining?

Below, the existing schema (§1) is reviewed against that use. Fill rates are counts in prod on 2026-10-22: 29 comp properties, 16 leases, 11 sales.

**Legend:** ✅ exists · 🟡 partial / weak · ❌ missing. **P1** = must-have for committee packages · **P2** = nice to have.

### 7.1 The structural gap that blocks most committee queries

**A sale and an offering are not linked to the lease in place.** `sale_comp` and `operating_memorandum` hang off
`comp_property` only. To group a cap rate by tenant, guarantor or term remaining, you need the lease that was in place when the
property sold or was offered.
- For single-tenant NNN that is the property's one `lease_comp`, but nothing enforces "one".
- For a multi-tenant center it is ambiguous.

→ **P1:** add `sale_comp.lease_comp_id` and `operating_memorandum.lease_comp_id` (FK → `lease_comp`, SET NULL).
- The intake sets the offering's link automatically, because it creates the lease.
- Existing sales are backfilled where the property has exactly one lease. The rest are flagged for manual linking.

### 7.2 LEASE (rent comps)

| Requirement | Status | Today | Proposal | Pri |
|---|---|---|---|---|
| Tenant brand | 🟡 | `lease_comp.tenant_name` (free text) + `merchant_brand_id` (11/16 linked) | Keep. Intake sets `merchant_brand_id` on a unique `normalized_name` match. Views group by brand when linked, else by normalized tenant name. | P1 |
| Concept (drive-thru vs inline …) | ❌ | — | `lease_comp.concept` text CHECK (`freestanding_dt`, `endcap_dt`, `inline`, `freestanding_no_dt`, `kiosk`, `other`) | P1 |
| Drive-thru y/n | ❌ | — | `lease_comp.has_drive_thru` boolean. It goes on the lease, not the property: in a center it belongs to the tenant space. It is kept separate from `concept` so "DT vs non-DT" is a one-column filter. | P1 |
| Guarantor type | ❌ | — | `lease_comp.guarantor_type` (§4) | P1 |
| Guarantor entity name | ❌ | — | `lease_comp.guarantor_name` text | P1 |
| Franchisee unit count | ❌ | — | `lease_comp.guarantor_unit_count` int + `guarantor_unit_count_as_of` date (it changes) | P2 |
| Annual base rent | 🟡 | `annual_base_rent` (12/16) | Keep. Add `rent_as_of_date` date: rent steps, so a rent comp must say *when* it was that rent. "Current rent" in views = projected from `rent_steps` / `escalation_pct` to today, labeled projected. | P1 |
| Rent / SF | 🟡 | `base_rent_psf` (6/16), `tenant_sqft` (4/16) | Keep. Views derive PSF from `annual_base_rent / tenant_sqft` when PSF is blank. The weakness is data fill, not schema; the VA checklist adds "building SF". | P1 |
| Building SF | 🟡 | `comp_property.building_sqft` (7/29); `lease_comp.tenant_sqft` | Keep. For single-tenant, views fall back from `tenant_sqft` to `building_sqft`. | P1 |
| Land acres | 🟡 | `comp_property.land_acres` (15/29) | Keep. Ground-lease views show rent per acre. | P1 |
| Ground vs building (fee) lease | ✅ | `lease_type` `ground_lease` vs `bts_*` | Keep. | — |
| Absolute NNN / NNN / NN | 🟡 | `lease_type` `bts_nnn`/`bts_nn`; this conflates construction type with expense structure, and has no absolute | `lease_comp.expense_structure` text CHECK (`absolute_nnn`, `nnn`, `nn`, `modified_gross`, `gross`). `lease_type` keeps meaning ground / BTS / multi-tenant. | P1 |
| Landlord responsibilities | ❌ | — | `lease_comp.landlord_responsibilities` text[] (`roof`, `structure`, `parking_lot`, `hvac`, `capital_repairs`) | P2 |
| Commencement / expiration | ✅ | `lease_commencement_date`, `lease_expiration_date` (13/16 have term) | Keep. | — |
| Primary term | ✅ | `lease_term_years` / `lease_term_months` | Keep. | — |
| Term remaining as of a date | 🟡 | Not stored. That is correct, since it is derived. | Views compute `term_remaining_years` as of a supplied date: today for rent comps, close date for sales, list date for asks. Fall back to `operating_memorandum.listed_term_remaining` (§4) when expiration is unknown, flagged "as listed". | P1 |
| Rent increases (amount + frequency) | ✅ | `escalation_pct` + `rent_bump_frequency` (11/16) + `rent_steps` jsonb | Keep. | — |
| Renewal options (count + length) | ✅ | `option_count`, `option_term_years` | Keep. | — |
| Option rent increases | ❌ | — | `lease_comp.option_escalation_pct` numeric + `option_escalation_note` text | P2 |
| Year built | 🟡 | `comp_property.year_built` (12/29) | Keep. | P2 |
| Year delivered (BTS opening) | ❌ | — | `comp_property.year_delivered` int | P2 |

### 7.3 SALE (sale comps)

| Requirement | Status | Today | Proposal | Pri |
|---|---|---|---|---|
| Asking price / asking cap / list date | ✅ | `operating_memorandum.asking_price`, `asking_cap_rate`, `list_date` | Keep, as a **trigger-maintained mirror of the latest ask event** (§8). | — |
| Price changes with dates | ❌ | — | `comp_listing_event` (§8) | P1 |
| Sold price / sold cap / close date | ✅ | `sale_comp.sale_price`, `cap_rate`, `sale_date` | Keep. | — |
| Buyer / seller | ✅ | `buyer_name`, `seller_name` | Keep. | — |
| Days on market | ❌ | — | Derived in `comp_listing_facts` (§8.4): list date → close / off-market. Needs the existing `operating_memorandum.sale_comp_id` populated, which the close RPC (§8.2) does. | P1 |
| Asking vs closed never blended | 🟡 | Structurally separate (OM vs `sale_comp`), but **nothing prevents** an ask being typed into `sale_comp` | **Rules:** closed figures enter only through a `closed` event with a verification method (§8.2). `sale_comp.cap_rate` stays "closed only" by convention, and the committee views never union asks into sale stats. Asks are reported in their own columns. | P1 |
| NOI behind the cap rate | 🟡 | `sale_comp.noi` (3/11); no NOI on asks | Asks: `noi` on the event (§8). Closed: keep `sale_comp.noi`. Views flag a sale whose cap has no NOI as "cap as reported". | P1 |
| Interest conveyed | ❌ | — | `sale_comp.interest_conveyed` text CHECK (`fee_simple`, `leased_fee_building`, `leased_fee_ground`). A ground-lease sale and a building sale of the same tenant trade at very different caps; averaging them together is wrong. | P1 |
| Sale price / SF | ✅ | `price_psf` (4/11) | Keep; derive when blank. | — |

### 7.4 LOCATION

| Requirement | Status | Today | Proposal | Pri |
|---|---|---|---|---|
| Address / city / lat-lng | ✅ | `comp_property` | Keep. | — |
| County | 🟡 | `comp_property.county` exists, **0/29 filled, and the UI no longer shows it** | Derive on insert/update by point-in-polygon against the 159 GA county polygons already in `boundary_municipality` (`kind='county'`). One-time backfill. | P1 |
| MSA | ❌ | — | `comp_property.msa` text, derived from county. County → CBSA needs a lookup: add `cbsa_code` / `cbsa_name` to the county rows of `boundary_municipality` (one-time load of OMB delineations). That table is owned by Market Research / Planning (decision 6). | P1 |
| Submarket | 🟡 | `comp_property.trade_area` free text (4/29) | Keep it free text. It is a judgment call, not geometry. | P2 |
| APN | 🟡 | `comp_property.parcel_id` (0/29) | Keep. It is on the VA checklist, and the dedupe key (§5) uses it. | P1 (fill) |
| Link to OVIS property | 🟡 | `comp_property.property_id` (0/29 linked) | Keep. The review screen suggests a match by `address_norm` against `property`, with one-click link. A site-submit link is reachable via `property`, so no separate column is needed. | P2 |

### 7.5 DATA QUALITY

| Requirement | Status | Today | Proposal | Pri |
|---|---|---|---|---|
| Source (sweep, OM, CoStar, broker, PT-61) | 🟡 | `source_type` CHECK has `manual`, `costar`, `crexi`, `om`, `ai_agent`; no broker or PT-61 | Extend the CHECK on all comp tables (and the event table) with `broker` and `pt61`. The sweep stays `ai_agent`. | P1 |
| Source URL | ✅ | `source_url` everywhere | Keep. | — |
| OM file | 🟡 | Files tab per `comp_property` (Dropbox); not tied to a specific OM row | `operating_memorandum.om_file_path` text (Dropbox path) so each offering points at its own PDF | P2 |
| Verified flag | ✅ | `confidence` + `verified_by_id` + `verified_at` | Keep. | — |
| How verified | ❌ | — | `verification_method` text CHECK (`om`, `pt61`, `broker_confirm`, `lease_doc`, `costar`, `other`) on `lease_comp`, `sale_comp`, `operating_memorandum` | P1 |
| Data as-of date | 🟡 | `verified_at` = when someone checked, not what date the figure describes | `lease_comp.rent_as_of_date` (§7.2). For sales, `sale_date` is the as-of; for asks, the event date is. | P1 |
| Per-field confidence | ❌ | Row-level `confidence` only | `field_confidence` jsonb on `lease_comp` and `sale_comp`, keyed by the figures committee averages use (`annual_base_rent`, `base_rent_psf`, `cap_rate`, `noi`, `sale_price`, `lease_expiration_date`), value in `unverified`/`reported`/`verified`. A missing key inherits the row's `confidence`. jsonb rather than ~6 columns per table, because only the views read it. | P1 |

**Committee-eligibility rule (proposed):** a figure counts toward a committee average only when its effective confidence is `verified`. Effective confidence is the `field_confidence` key, else the row's `confidence`. Views expose `n_total` and `n_eligible` side by side, so excluded numbers are visible, not silently dropped.

### 7.6 OUTPUTS

**Can we query these today?**
- **Avg/median cap by tenant:** 🟡. Only via `comp_property`, which is ambiguous without §7.1.
- **By guarantor type:** ❌.
- **By term-remaining band:** ❌.
- **By MSA:** ❌.
- **By date range:** ✅ (`sale_date`).
- **Rent/SF range by tenant and market:** 🟡. PSF is sparse and there is no market column.

**Proposed views** (`security_invoker`, SELECT granted to `authenticated` only; comp RLS applies):

| View | Grain | Key columns |
|---|---|---|
| `comp_lease_facts` | one row per lease on a `reviewed` comp | brand, tenant, concept, drive-thru, guarantor type/name, lease_type, expense_structure, annual rent, rent PSF (stated or derived), projected current rent, term remaining today, county, MSA, lat/lng, effective confidence per figure, `committee_eligible_rent` |
| `comp_sale_facts` | one row per closed `sale_comp` | price, cap, NOI, PSF, close date, interest conveyed, **lease in place** (brand, guarantor, expense structure), term remaining at close + band, county, MSA, verification method, `committee_eligible_cap`, plus (if an offering is linked) last ask, DOM, ask-to-close spread |
| `comp_listing_facts` | one row per offering | §8.4 |

**Saved queries** (SQL functions, `GRANT EXECUTE TO authenticated`):

- `comp_cap_stats(p_group_by text, p_since date, p_until date, p_msa text[], p_brand_ids uuid[], p_include_unverified bool default false)`
  - `p_group_by` is one of `brand`, `guarantor_type`, `term_band`, `msa`, `expense_structure`, `interest_conveyed`.
  - Returns `group, n_total, n_eligible, avg_cap, median_cap (percentile_cont), min, max`.
  - Term bands: `<5`, `5–10`, `10–15`, `15+` years.
  - Asks are excluded.
- `comp_rent_stats(p_group_by, p_msa, p_brand_ids, p_include_unverified)` returns the rent/SF range, median and n, by tenant and market.
- `comp_committee_table(p_lat, p_lng, p_radius_mi, p_kind ('lease'|'sale'|'ask'), p_since, p_include_unverified)` returns the committee "comp table" rows in package column order.
  - The export (CSV/Excel from the review screen or the comp layer selection) calls it.
  - Every row carries its confidence and source, so the package footnotes write themselves.

### 7.7 Priorities

**P1 — needed for committee packages**

1. `lease_comp_id` on `sale_comp` + `operating_memorandum` (§7.1)
2. `expense_structure`, `concept`, `has_drive_thru`, `guarantor_type`, `guarantor_name`, `rent_as_of_date` on `lease_comp`
3. `interest_conveyed` on `sale_comp`
4. County derivation + `msa` on `comp_property` (+ CBSA lookup, decision 6)
5. `verification_method` + `field_confidence`; `broker` / `pt61` source types
6. `comp_listing_event` (§8)
7. The three fact views + `comp_cap_stats` / `comp_rent_stats` / `comp_committee_table`
8. Data fill, which is the real weakness behind several 🟡 rows: PSF, building SF, APN and the brand link are mostly blank. These become VA checklist lines.

**P2 — nice to have:** `guarantor_unit_count`, `landlord_responsibilities`, option escalations, `year_delivered`, `om_file_path`, the property-link suggestion, submarket curation.

**New tables:** only `comp_listing_event` (justified in §8.1). Everything else is columns on existing tables. The CBSA lookup is two columns on an existing table, subject to decision 6.

---

## 8. Pricing history

Track every price and status change from first listing to close, **as rows, not notes**.

### 8.1 Table: `comp_listing_event` (new — justified)

No existing table fits:
- `comp_availability` is dated asks, but it is per-property, leasing-oriented, has no cap or NOI, and has no event types.
- The `*_stage_history` tables are for deals and site submits.

An offering has many events, and they need to be filtered and aggregated (reductions, DOM, change feeds). That is a child table of `operating_memorandum`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `operating_memorandum_id` | uuid NOT NULL → `operating_memorandum` ON DELETE CASCADE | the offering; the property is reached through it |
| `event_date` | date NOT NULL | ET calendar date the event happened (or was first observed) |
| `event_type` | text NOT NULL CHECK in (`listed`, `price_change`, `cap_change`, `under_contract`, `back_on_market`, `off_market`, `closed`, `relisted`) | |
| `price` | numeric NULL | the ask carried by this event (NULL for pure status events) |
| `cap_rate` | numeric NULL | percent, same units as everywhere else |
| `noi` | numeric NULL | only if the listing states it |
| `sale_comp_id` | uuid NULL → `sale_comp` | **`closed` only.** The closed price / cap / NOI live on the `sale_comp`; the event holds no figures of its own, so there is one source of truth. |
| `source_type` | text CHECK (comp enum incl. `broker`, `pt61`) | |
| `source_url` | text | |
| `verification_method` | text CHECK (`pt61`, `broker_confirm`, `om_verified`, …) | **required when `event_type='closed'`** (CHECK constraint) |
| `recorded_by_kind` | text NOT NULL CHECK in (`sweep`, `user`) | |
| `recorded_by_id` | uuid NULL → `auth.users` | the person when `user` (VA or Mike); the OAuth user when the sweep runs as one |
| `note` | text | |
| `created_at` | timestamptz default now() | when the row was written (vs `event_date`) |

- **Indexes:** `(operating_memorandum_id, event_date DESC, created_at DESC)`, and `(event_type, created_at)` for the change feed.
- **RLS:** `is_internal_user()`, same as the comp tables.
- **Grants:**
  - `authenticated`: SELECT, INSERT. Users record events from the UI.
  - `authenticated` gets no UPDATE or DELETE. History is append-only, and corrections are new rows with a note.
  - `service_role`: ALL.

### 8.2 Current vs closed

- **Current ask** = latest event of type `listed`, `relisted`, `price_change`, `cap_change` or `back_on_market` that carries a price or cap.
  - A trigger on `comp_listing_event` mirrors it into `operating_memorandum.asking_price` / `asking_cap_rate`, and mirrors the latest status-bearing event into `listing_status`.
  - The OM tab's asking fields become **read-only** and get a "Record price change" button that writes an event. Otherwise a manual edit would be overwritten by the trigger.
- **Closed price/cap only from a `closed` event.** One RPC, `record_listing_close(om_id, close_date, price, cap, noi, verification_method, source…)`, does all of the following in one transaction:
  - creates or updates the `sale_comp` (with `lease_comp_id` from the offering);
  - inserts the `closed` event pointing at it;
  - sets `operating_memorandum.sale_comp_id`;
  - sets `is_available=false` if no other offering on the property is active.

  It **never copies an ask into `sale_comp`**. With no verification method, it refuses.
- **Backfill:** the one existing OM ($2,091,000 @ 6.5) gets a `listed` event from its current values.
- The 11 existing `sale_comp` rows have no offering, so they need no event.

### 8.3 `upsert_listing` behavior

Compare against the **latest ask event** of the active offering:

| Sighting | Action | Return |
|---|---|---|
| Price differs | insert `price_change` (new price + cap as listed) | `changed: true, old: {price, cap}, new: {price, cap}` |
| Only cap differs (NOI restated) | insert `cap_change` | `changed: true, old, new` |
| Same price and cap | update `operating_memorandum.last_seen_at` only | `changed: false` |
| Offering not `active` (under contract / off market) and seen listed again | insert `back_on_market` (or `relisted` if the offering was closed → new offering) | `changed: true` |

**Not seen for X days → flag, don't close.** `possibly_off_market` is **derived, not stored**: `listing_status = 'active' AND last_seen_at < now() - X days`.
- X is proposed at 21 days (decision 8). It must exceed 2× the sweep cadence, or a skipped run flags everything.
- The VA's review actions:
  - **Confirm off market** records an `off_market` event.
  - **Still listed** bumps `last_seen_at` and writes no event.
- Nothing auto-closes.

### 8.4 Derived fields — `comp_listing_facts` view (one row per offering)

| Field | Definition |
|---|---|
| `original_ask` / `original_cap` | first `listed` / `relisted` event of the offering |
| `current_ask` / `current_cap` | latest ask event (= the OM mirror) |
| `total_reduction_pct` | `(original_ask − current_ask) / original_ask`; NULL if either is NULL |
| `price_change_count` | count of `price_change` events |
| `list_date` | `operating_memorandum.list_date` if stated, else the first event's `event_date` |
| `days_on_market` | `list_date` → close date, off-market date, or today (ET) if still active |
| `closed_price` / `closed_cap` | from the linked `sale_comp` (closed event) only |
| `ask_to_close_price_pct` | `(closed_price − last_ask) / last_ask` |
| `ask_to_close_cap_spread_bps` | `(closed_cap − last_ask_cap) × 100` |
| `possibly_off_market` | §8.3 rule |
| `last_seen_at`, `listing_status`, `review_status` | passthrough |

### 8.5 Review screen — timeline

Each listing shows a vertical timeline, newest first. Each event row shows:
- the event-type chip;
- price and cap;
- Δ vs the previous ask, both $ and %;
- `event_date`;
- the source link;
- the recorded-by name (or "sweep");
- the note.

A `closed` row shows the `sale_comp` figures plus its verification method. A **Possibly off market** badge sits on the listing when §8.3 applies, with the Confirm off market / Still listed buttons.

The header shows original → current ask, total reduction and DOM, all from `comp_listing_facts`.

### 8.6 Daily summary

New listings and price changes come from different rows, so they report separately:
- **New listings** = `listed` / `relisted` events created in the window.
- **Price/cap changes** = `price_change` / `cap_change` events in the window, with old → new.
- **Status changes** = `under_contract` / `back_on_market` / `off_market` / `closed`.
- **Possibly off market** = the derived flag, as of now.

These come from one SQL function, `listing_activity(p_since timestamptz, p_until timestamptz)`, which returns the four groups.
- It is exposed as the new MCP tool `listing_activity(since?, date?)` (§6). A daily-summary agent can call it.
- It can also feed a later email digest.
- "Day" = ET midnight to midnight, per the timezone rule.

---

## 9. Decisions needed from Mike

1. **(b) as recommended, or (a)?**
2. **Optional `task.comp_property_id`:** yes, a real link from the task to the comp, or no, a URL in the description only.
3. **Existing duplicate comps** (Hiram ×2, Macon ×2, two blank-address rows): clean up before v2 ships, so the dedupe key can become unique, or leave them, so matches against them return `ambiguous_match`.
4. **Closing a listing:** §8.2 requires a verified close (price + verification method) before a `sale_comp` exists. Is that right? Or should an unverified "sold, price unknown" state exist? Today it would be an `off_market` event with a note.
5. **Absolute vs standard NNN:** §7 now proposes a separate `lease_comp.expense_structure` column rather than a new `lease_type` value. `lease_type` keeps describing ground / BTS / multi-tenant, so the Leases tab field gating in `compTypes.ts` is untouched. Approve, or prefer the enum change?
6. **MSA source:** add `cbsa_code` / `cbsa_name` to the 159 GA county rows of `boundary_municipality` (§7). That table is owned by Market Research / Planning, so this needs their OK. The alternative is a small comp-only lookup table.
7. **Committee-eligibility rule** (§7.4): verified-only by default, or verified + reported with a footnote?
8. **Off-market threshold X** (§8): 21 days proposed. It must exceed 2× the sweep cadence. What cadence will the sweep run at?
9. **Priority (1) scope:** ship all of §7 priority 1 together with v2, or v2 first (intake + history) and the committee gaps second?

---

## 10. Approved decisions (2026-10-22)

1. **Option (b).** Listings write straight into the comp tables, gated by `comp_property.review_status`. Existing rows default to `reviewed`. Offerings live in `operating_memorandum`. `listing_staging` (0 rows) is dropped **after** the new path is live.
2. **MSA:** add CBSA/MSA columns to the county rows of `boundary_municipality` (Mike owns Market Research; approved). Populate them from the OMB CBSA delineation file. This is phase 2.
3. **Committee averages:** report a **verified** average and an **all** average (verified + reported/asking) side by side, each with its n. **Asking and closed figures are never blended in one average.** This is phase 2 (the views and saved queries).
4. **Sweep cadence is daily.** The 21-day "possibly off market" flag is for VA review only. Nothing auto-closes.
5. **Phasing:**
   - **Phase 1 (built):**
     - option (b) intake;
     - `comp_listing_event` + `comp_listing_facts` + timeline;
     - the `listing_activity` MCP tool;
     - the sale/offering → lease-in-place link;
     - guarantor type + name;
     - Noree's checklist on the task;
     - audit columns written with the auth id.
   - **Phase 2 (after):**
     - `expense_structure`, concept/drive-thru, interest conveyed;
     - county/MSA derivation;
     - verification method + per-figure confidence;
     - the three fact views + three saved queries.
- §9 decision 2 (the optional `task.comp_property_id`) was not decided, so phase 1 **does not add it**. The task links to the listing by URL in its description.

## 11. Phase 1 — as built

**Migrations — all applied to prod and recorded in `schema_migrations`:**

| Version | What | Applied |
|---|---|---|
| `20261022083335_listing_staging` | v1 staging table + RPCs (superseded) | 2026-10-22 |
| `20261022105905_comp_listing_intake_phase1` | all of phase 1. Round-trip tested against prod first: every §5 / §8.3 case, Noree impersonated as `authenticated`, anon access checked | 2026-10-28 |
| `20261028082618_comp_duplicate_review_fixes` | §12 address fixes, Hilton delete, Noree's lease-backfill task | 2026-10-28 |
| `20261022110419_drop_listing_staging` | v1 cleanup: drops `listing_staging` and its three RPCs, keeps `normalize_listing_address` | 2026-10-28 |
| `20261030084504_comp_zip_fixes` | Dutch Bros ZIP 31220 → 31210; Hoschton ZIP → 30548 | 2026-10-30 |

**Edge function:** `ovis-mcp` **v0.3.0** is deployed (2026-10-30). v0.3.0 adds the automatic VA task on new listings (§14).

**Code:**
- **Edge function** `ovis-mcp` v0.2.0: `upsert_listing` / `create_va_task` / `list_recent_listings` were rewritten, and `listing_activity` is new. Audit columns are written with the OAuth caller's **auth** id; the static token writes NULL. (v0.3.0, 2026-10-30: `upsert_listing` also creates Noree's VA task for a new listing — §14.)
- **Review page** `/listings/review`: reads `comp_listing_facts`. Its tabs are Pending review, Active, Re-listed existing comps, Possibly off market, Under contract / off market / sold, Rejected and All.
- **`ListingPanel`:**
  - approve / reject;
  - status events;
  - record price change;
  - record close (verified only);
  - timeline;
  - Open comp → `CompDetailSlideout`.
- **`CompDetailSlideout`:**
  - the header shows a Pending/Rejected badge with Approve/Reject;
  - the Leases tab has Guarantor + Guarantor Entity;
  - the Sales and OM tabs have a "Lease in Place" selector;
  - the OM tab shows status, seen dates, the as-listed snapshots and a per-offering price history.
- **Comp Database layer:** rejected comps are never drawn. Pending comps are drawn only with the new "Show pending NNN listings" checkbox, as **hollow pins with a terracotta outline**.
- **Removed:** all v1 UI (the `ListingStaging*` layer and slideout, `ListingDetailPanel`, `lib/listingStaging.ts`) and the "NNN Listings" map-layer row.

**Behaviors decided during the build** (the spec was silent or the tests forced them):

| # | Behavior | Why |
|---|---|---|
| 1 | **A close is terminal.** Once a `closed` event exists, the status is `sold` regardless of event dates. | A close is usually recorded after the fact with an earlier date (PT-61 lag). Ordering by date let a later sweep sighting outrank it. Caught in testing. |
| 2 | **"Under contract" is not flipped back by the sweep.** Only `off_market` → `back_on_market` is automatic. | Contracted listings usually stay posted, and the sweep can't tell the difference. A person records "back on market". |
| 3 | **Closed within 90 days and still posted → no relist.** `upsert_listing` returns `skipped: "recently_closed"` and only bumps `last_seen`. | Listing sites lag a close by weeks. Without this, a stale post would open a new offering. |
| 4 | **`possibly_off_market` applies only to offerings the sweep has recorded at least once** (`tracked_by_sweep`). | Otherwise the one existing manual OM (Temple) would be flagged the day this ships. |
| 5 | **Editing the ask on the OM tab writes a history event** (`listed` / `price_change` / `cap_change`), via a trigger. | It keeps the existing OM form working without letting anything bypass the history. |
| 6 | **The amber pin (`is_available`) follows offerings:** it is on while any offering on the comp is `active`, and it is recomputed on each event. | It is touched only on comps that have offerings, so manual leasing-availability flags elsewhere are left alone. **Visible change:** adding an OM with an asking price in the comp slideout now turns that pin amber. |
| 7 | `comp_listing_event.created_at` uses `clock_timestamp()`, not `now()`. | Several events in one transaction must still order. With `now()` they tied, and the test showed wrong current asks. |
| 8 | **Pending pins are hollow with a terracotta outline,** not dashed. | The dashed terracotta ring already means "has an OM" on this layer. |
| 9 | **The backfill keeps every existing pin's `is_available` exactly as it was.** | The one existing OM got a `listed` event, but its pin colour doesn't change. |
| 10 | **Lease-in-place backfill:** 2 of 11 sales linked. | Only sales whose comp has exactly one lease were linked. 9 sales are on comps with **no lease recorded at all**, so they can't be linked until a lease is entered. |

**Deploy order** — all done 2026-10-28; see §13.

## 12. Duplicate comps — proposals (DECIDED 2026-10-28; applied by `20261028082618`)

**Mike's decisions:**
1. Delete Hilton / Candlewood.
2. 7 Brew → 5890 Zebulon Rd.
3. Douglasville: keep the two comps separate. Set city/state/ZIP. Store **no shared APN**.
4. Hoschton → 3699 Hwy 53.
5. Dutch Bros → 5781 Zebulon Rd.
6. The $950K pair stays as-is; Mike will confirm separately.

**Douglasville parcel finding:** both pins fall inside **one undivided parcel**.
- **Parcel:** Douglas County PIN **0051015C005**, 5955 Hwy 92 – Fairburn Rd.
- **Details:** vacant, 1.60 ac (GIS 2.16 ac), zoned CG, owned by Sahni's Holdings LLC.
- **No split is recorded.** The latest deed is Aug 2017 ($270,000).
- **How it was found:** a point-in-polygon identify on the county's Zoning and Future Land Use polygon layers. The county's Parcels polygon layer refuses queries.
- **Source:** maps.douglascountyga.gov, PIW_PropertyLayers, layers 35/36/60/61.
- **Outcome:** both comps have city/state/ZIP only. APN and street address stay blank until the county splits the parcel, so neither can be matched to the other pad's listing.

Both comps have `year_built` 2028, which fits pads still to be built on vacant land.

**ZIP flags — fixed 2026-10-30** by `20261030084504`: Dutch Bros 31220 → 31210 (5781 Zebulon Rd is in 31210); Hoschton → 30548.

### Original proposals

Each proposal below rests on three checks: every row's child records were inspected, each pin was reverse-geocoded (Google, ROOFTOP precision), and pin-to-pin distances were measured. **None of the pairs is the same property recorded twice.** Each is two different tenants or uses that share an address string, or adjacent pads with no address. So the proposals are mostly **address corrections, not merges**.

| # | Comps | Evidence | Proposal |
|---|---|---|---|
| 1 | **Hiram:** "RaceTrac" (`21e9e9eb`) and "Hilton / Candlewood Purchase" (`8b0e00f5`), both "2850 Jimmy Lee Smith Parkway" | RaceTrac has a sale ($7,079,700 @ 5.65%, NOI $400,003) and its pin reverse-geocodes to **2850**. Hilton/Candlewood has **no** leases, sales, OMs, files or chat. Its pin is ~100 m away and reverse-geocodes to **2856 Jimmy Lee Smith Pkwy**. A gas-station sale and a hotel purchase. | **No merge.** Change the Hilton/Candlewood address to **2856 Jimmy Lee Smith Pkwy**. *Alternative:* delete it if it was a placeholder; it holds no data. |
| 2 | **Macon:** "7 Brew" (`0f3fb39a`) and "Sonny's BBQ - Macon" (`22919daa`), both "5811 Zebulon Road" | Sonny's is a verified 2021-03-02 land sale ($950,000; 1.43 ac; 5,200 SF; built 2022), and its pin reverse-geocodes to 5881 / **5811** Zebulon. 7 Brew is an `ai_agent` row whose chat says it is *"seeking a rezoning of this Resi lot"*. It also has a Dropbox folder. Its pin is ~90 m away and reverse-geocodes to **5890 Zebulon Rd**. A completed land sale vs a rezoning prospect on a residential lot. | **No merge.** Change 7 Brew's address to **5890 Zebulon Rd** (Mike to confirm against the P&Z docs). Keep its chat and files. |
| 3 | **Douglasville:** "Chipotle - Douglasville" (`1d782056`) and "Valvoline - Douglasville" (`b182f082`), both with no address/city/state | Different tenants with separate leases (Chipotle `bts_nnn`, Valvoline `ground_lease`). The pins are ~45 m apart, and Valvoline's anchor tenant is "Chipotle", so they are adjacent pads in one development. **Both pins reverse-geocode to the same development address, 5975 Fairburn Rd**, so the pin can't tell the pads apart. | **No merge** (separate pads, separate leases). Set **city/state/ZIP now** (Douglasville, GA 30134). Fill each street address from its APN (a VA task) rather than giving both "5975 Fairburn Rd", which would create a new same-address pair. *Alternative:* merge into one comp "5975 Fairburn Rd" with two leases, if you treat the development as the comp. |
| 4 | *Not in the original count:* "Chipotle 3 pad Site - Hoschton" (`6be046ec`) has no street address | The pin reverse-geocodes to **3699 Hwy 53, Hoschton** (ROOFTOP). | Fill the address: **3699 Hwy 53**. |
| 5 | *Not in the original count:* "Dutch Bros" (`aa444493`), Macon, has no street address | The pin reverse-geocodes to **5781 Zebulon Rd** (ROOFTOP). | Fill the address: **5781 Zebulon Rd**. |
| 6 | *Possible duplicate **sale** to check:* the Dutch Bros sale and the Sonny's BBQ sale | Both are **$950,000** on Zebulon Rd, Macon. Dutch Bros: no date, seller "Chris Patel", 1.03 ac, note "Dutch Bros Purchased this pad". Sonny's: 2021-03-02, 1.43 ac, note "Sonny's BBQ Land". The pins are ~170 m apart and the acreages differ. | **Not concluded.** It may be one transaction entered twice, or a coincidence. Mike to confirm; no change proposed until then. |

**Effect on the intake:** address-less comps never match a listing. The two shared-address pairs only matter if a sweep listing lands on 2850 Jimmy Lee Smith Pkwy or 5811 Zebulon Rd. In that case it attaches to the best row and the review screen warns "another comp shares this address". The corrections above remove both pairs.

**When approved,** the corrections ship as a small data migration applied with phase 1. That migration sets the addresses, and `address_norm` recomputes because it is a generated column. Nothing is deleted unless the row-1 alternative is chosen.

## 13. Rollout log (2026-10-28)

**Code changes before shipping:**
- **VA tasks carry two links:** "Listing" (`/listings/review?listing=<id>`) and "Comp record" (`/listings/review?comp=<id>`). The second opens the comp slideout over the review queue.
- **Task descriptions are a plain textarea**, so `TaskDetailSlideout` now lists every URL in the description as a clickable link under the field. OVIS links open in-app. This also makes the backfill task's nine links clickable.
- **Noree's backfill task** was created by the data migration: "Backfill leases for 9 sales with no lease recorded".
  - It lists each comp with its sale and a comp-record link.
  - It tells her to note "no lease — land sale" where a lease never existed. Wellstar land, Sonny's land and the Dutch Bros pad are likely cases.

**Steps run:**
1. **Applied to prod and recorded:** `20261022105905` (phase 1) and `20261028082618` (duplicate fixes + backfill task).
   - Both were round-trip tested together first.
   - After applying: 28 comps, all `reviewed`; 1 backfilled event; 2 sales linked to a lease; 0 shared-address pairs.
   - Anonymous HTTP returns 401 / `42501` on `comp_listing_event`, `comp_listing_facts`, `listing_activity` and `record_listing_close`.
2. **`ovis-mcp` v0.2.0 deployed.**
3. **Smoke test — PARTIAL:**
   - **Over HTTPS against the deployed function:**
     - no token gives 401 with `WWW-Authenticate` pointing at the metadata;
     - a bad token gives 401;
     - the protected-resource metadata is served.
   - **The RPC behind each of the four tools, called over HTTPS (PostgREST) with the service key:**
     - **upsert:** new, then a re-sighting with a variant spelling (`changed:false`), then a price drop (`price_change`, old/new returned);
     - **create_va_task:** to Mike, with both links;
     - **list_recent_listings query:** original/current ask and reduction;
     - **listing_activity:** 1 new listing and 1 price change, in separate groups.

     The test rows were deleted.
   - **Not run:** MCP `tools/call` through the function with a real credential. The static token file was lost when the temp folder was cleared. Rotating `OVIS_MCP_INTAKE_TOKEN` was blocked by the session's permission policy (secret-store write). Mike needs to set a new token, or connect via OAuth, to run that check.
4. **`listing_staging` and the v1 RPCs dropped**, and `20261022110419` recorded. `normalize_listing_address` stays, because `address_norm` is generated from it.
5. Merged to main; the production build passed.


## 14. Follow-up (2026-10-30)

1. **End-to-end check passed.** Mike reset `OVIS_MCP_INTAKE_TOKEN` (a separate secret from `OVIS_MCP_BEARER_TOKEN`, which `ovis-research-mcp` / OpenClaw uses). Real MCP `tools/call` requests through the deployed function, with a clearly marked test listing ("ZZ Smoke Test Taco", 9999 Smoketest Pkwy):
   - `upsert_listing`: new → re-sighting with a variant spelling matched it → price drop recorded as `price_change` with old/new;
   - `list_recent_listings`: listing returned with the current ask;
   - `create_va_task`: task with both links and the 8-line checklist; an unknown assignee returns `isError`;
   - `listing_activity`: new listing and price change in separate groups.

   This closes the gap left in §13 step 3. The OAuth path is still unverified (dashboard step pending).
2. **`upsert_listing` creates the VA task server-side (ovis-mcp v0.3.0).**
   - **When:** the result has `is_new = true` — a new comp, or a new offering (relist) on an existing comp. Re-sightings, price/cap changes and skipped results (`rejected`, `recently_closed`) never create one.
   - **How:** the same code path and RPC as the `create_va_task` tool (`create_comp_va_task`): Noree, due today (ET), Inbox, Listing + Comp record links, default checklist.
   - **Result fields:** `va_task_id` and `va_task_assignee`. If the task fails, the listing is still saved and `va_task_error` is returned; the caller retries with `create_va_task`. (A retry of the upsert would be an update and would not create the task.)
   - **`create_va_task` stays** as a standalone tool, for an extra or reassigned task or a retry. Both tool descriptions tell the agent not to call it for a listing `upsert_listing` just created, to avoid a duplicate task.
   - No migration: the change is in the edge function only.
   - **Re-tested** after deploy: new listing → one task for Noree (Inbox, due 2026-10-30 ET, both links); re-sighting and price change → no task; standalone `create_va_task` still works. Test comp, events, offering, lease and both tasks deleted; prod back to 28 comps.
3. **ZIP fixes** applied by `20261030084504` (§12).
