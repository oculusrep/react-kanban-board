# NNN Listing Intake — Spec v2 (feed the existing Comp Database)

**Status:** DRAFT, awaiting Mike's approval. Nothing in this document is built.
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
- **Seven new columns on existing tables** (§4), plus one optional column on `task`. No new comp tables.
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
| listing lifecycle (active / sold / withdrawn) | partially: `comp_property.is_available` | `is_available` is per property, not per offering. **GAP** on the offering |
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
3. Listing lifecycle (active / sold / withdrawn), on the offering
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

| Table | Column | Type | Purpose |
|---|---|---|---|
| `comp_property` | `review_status` | text NOT NULL DEFAULT `'reviewed'` CHECK in (`pending_review`,`reviewed`,`rejected`) | Gates visibility of sweep-created pins. The default keeps the 29 existing rows unchanged. |
| `comp_property` | `address_norm` | text, **generated stored** from `normalize_listing_address(address, city, state)` | Dedupe key (§5). **Indexed, not unique**: the existing duplicates (Hiram, Macon, two blank rows) would block a unique index. Revisit after they are cleaned up. |
| `lease_comp` | `guarantor_type` | text CHECK in (`corporate`,`franchisee`,`personal`,`other`) NULL | Guarantor belongs to the lease. NULL = unconfirmed. |
| `operating_memorandum` | `listing_status` | text NOT NULL DEFAULT `'active'` CHECK in (`active`,`sold`,`withdrawn`) | Lifecycle of this offering. `sold` links to a `sale_comp` through the existing `sale_comp_id` when a sale price is known. |
| `operating_memorandum` | `first_seen_at` | timestamptz NOT NULL DEFAULT now() | When the offering was first captured. Backfill = `created_at`. |
| `operating_memorandum` | `last_seen_at` | timestamptz NOT NULL DEFAULT now() | Bumped on every re-sighting. Backfill = `updated_at`. |
| `operating_memorandum` | `listed_term_remaining` | text NULL | As-listed snapshot, e.g. "14 years". It belongs on the dated offering, not the lease, because it ages. |
| `operating_memorandum` | `listed_lease_type` | text NULL | As-listed snapshot, e.g. "Absolute NNN". This keeps the absolute vs standard NNN distinction that the `lease_type` enum drops. |
| `task` *(optional, not a comp table)* | `comp_property_id` | uuid → `comp_property` ON DELETE SET NULL | Same pattern as `task.deal_id` / `property_id` / `site_submit_id`. It lets the VA task link and open the comp. Without it, the link is a URL in the description, as in v1. |

**Not proposed:**
- **A NOI column on the offering.** `asking_price × asking_cap_rate` already derives it, through the existing calculators.
- **New `source_type` values.** LoopNet maps to `costar`, and the raw source name goes in `source_reference`.

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
| No match | New `comp_property` (`review_status='pending_review'`, `is_available=true`, `confidence='reported'`, name = tenant, geocoded lat/lng) + `lease_comp` (tenant, mapped `lease_type`, `guarantor_type` if given) + `operating_memorandum` (price, cap, `listing_status='active'`, first/last seen, `listed_*` snapshots, `source_url`) |
| Match, with an **active** offering | Bump `last_seen_at`. If the price or cap changed, update it and append a dated line to the offering's `notes` (e.g. "2026-11-03: asking $2,150,000 → $1,999,000"). No new rows. |
| Match, no active offering (a re-listing) | New `operating_memorandum` (active); set `is_available=true`. Add a `lease_comp` only if none exists for the same tenant name. `review_status` is unchanged, so a reviewed comp stays reviewed. |

---

## 6. What changes

### MCP tools (`supabase/functions/ovis-mcp`)

**`upsert_listing`**
- **Inputs:** same as v1, plus optional `apn`, `zip`, `list_date`, `broker_name`, `brokerage`.
- **Writes:** a single new RPC, `upsert_comp_listing`, which does all §5 logic in one transaction.
- **Returns:** `{comp_property_id, listing_id (the operating_memorandum id), is_new, is_new_property, matched_existing_comp, review_status, ambiguous_match?, skipped?}`.
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
  - **Sold / withdrawn**
  - **Rejected**
- **Row actions:**
  - **Approve** → `reviewed`; the pin appears in the Comp Database layer.
  - **Reject** → `rejected`; hidden, kept for dedupe.
  - **Mark sold / withdrawn** → offering `listing_status` and `is_available=false`. "Sold" optionally prompts for a sale price and date and creates a `sale_comp` linked through `sale_comp_id`.
  - **Open comp** → the existing `CompDetailSlideout`. This is where Noree does the checklist.
- **Promote goes away.** Approve replaces it, because the data is already in the comp tables.
- `ListingDetailPanel` is replaced by `CompDetailSlideout`, plus a small review-actions strip (Approve / Reject / Sold) above it.
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

## 7. Decisions needed from Mike

1. **(b) as recommended, or (a)?**
2. **Optional `task.comp_property_id`:** yes, a real link from the task to the comp, or no, a URL in the description only.
3. **Existing duplicate comps** (Hiram ×2, Macon ×2, two blank-address rows): clean up before v2 ships, so the dedupe key can become unique, or leave them, so matches against them return `ambiguous_match`.
4. **"Sold" → `sale_comp`:** create one only when you enter a sale price (proposed), or always create a shell row.
5. **Absolute vs standard NNN:** is the as-listed snapshot (`listed_lease_type`) enough, or should `lease_comp.lease_type` gain an `absolute_nnn` value? A new value also changes the Leases tab field gating in `compTypes.ts`.
