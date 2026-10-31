# NNN listing intake: lease terms, derived financials, broker contacts, source adapters (PLAN)

Status: **plan only, nothing built** (2026-10-31). Branch `feature/nnn-lease-financials`, worktree `react-kanban-board-nnn-lease`.
Context: [NNN_LISTING_INTAKE.md](NNN_LISTING_INTAKE.md), [NNN_LISTING_INTAKE_SPEC_v2.md](NNN_LISTING_INTAKE_SPEC_v2.md).

## 1. Audit: what `upsert_listing` writes today

`listing_staging` no longer exists; it was dropped 2026-10-28. `ovis-mcp` `upsert_listing` calls the `upsert_comp_listing` RPC, which
writes the following (live definition, read 2026-10-31):

| Table | When | Fields written |
|---|---|---|
| `comp_property` | New address/APN | name (= tenant), address, city, state, zip, `parcel_id` (APN), source, `is_available`, `review_status = pending_review`. Fills `parcel_id` on a match if it was empty. |
| `lease_comp` | Tenant given and no matching lease | **Only** tenant_name, merchant_brand_id, lease_type, guarantor_type/name, source. On a match, it fills guarantor only if empty. |
| `operating_memorandum` (= the listing) | New offering | broker_name, brokerage (**plain text**), list_date, `listed_term_remaining` (text, e.g. "14 years"), `listed_lease_type` (text), lease_comp_id |
| `comp_listing_event` | Every new offering / price or cap change | price, cap_rate, noi |
| `sale_comp` | **Never** by the tool | Created only by "Record close" in the UI |
| `comp_availability` | **Never** by the tool | The 1 row is manual |

Comp slideout tabs → tables:

| Tab | Table |
|---|---|
| Overview | `comp_property` |
| Leases | `lease_comp` |
| Sales | `sale_comp` |
| OM / listing timeline | `operating_memorandum` + `comp_listing_event` |
| Availability | `comp_availability` |
| Files | Dropbox |
| Notes | `comp_note` |

**Do current rent and lease terms have a home on a lease record?** Yes, `lease_comp` already has every column needed:
- `annual_base_rent`, `base_rent_psf`;
- `escalation_pct`, `rent_steps` (jsonb), `rent_bump_frequency`;
- `lease_commencement_date`, `lease_expiration_date`, `lease_term_years`;
- `option_count`, `option_term_years`, `option_periods`;
- `guarantor_type` / `guarantor_name`.

**But the intake never fills them.** Of the 35 lease records linked to listings, 0 have rent, 0 have an expiration date and 0 have bumps.
Remaining term lives only as text on the listing, NOI lives only on the listing event, and rent and bumps aren't captured at all.

## 2. Structure: reuse what exists; no new parallel tables

The proposed shape already exists:

```
comp_property (1 per address/APN)
  └─ lease_comp (tenant, rent, term, bumps, options, guarantor, lease type)   ← intake starts writing these
       └─ operating_memorandum (one offering: broker, list date, status)      ← already linked via lease_comp_id
            └─ comp_listing_event (ask price / cap / NOI history)             ← already
                 └─ sale_comp (only on close; om.sale_comp_id)               ← already, via Record close
```

Changes:
- **New `upsert_listing` params, written to `lease_comp`:** `annual_rent`, `rent_psf`, `tenant_sqft`, `lease_start`, `lease_expiration`,
  `escalation_pct`, `bump_frequency` (e.g. "every 5 years"), `rent_steps`, `option_count`, `option_term_years`.
  - Fill-if-empty on an existing lease, the same rule as guarantor today. A listing never overwrites a value a person entered.
  - A changed value from a *new* listing goes into the lease's `notes` with the date, rather than silently replacing the old one.
- **Term:** if only "14 years remaining" is given, derive `lease_expiration_date` ≈ list date + 14y and mark it derived (see §3).
  `listed_term_remaining` stays on the listing as the as-advertised text.
- **Building SF and lot size:** `comp_property.building_sqft` / `land_acres`, fill-if-empty.
- **RPC rebuild:** start from the live `pg_get_functiondef`, never an old migration file. Add the params with defaults so existing callers don't break.

## 3. Derived financials

- **Rule:** any two of price / cap / NOI give the third.
  - NOI = price × cap / 100 (cap is stored as a percent).
  - cap = NOI / price × 100.
  - price = NOI / cap × 100.
  - The calculation runs in the RPC on every write, so the MCP tool, the UI and the backfill share one implementation.
- **Stated vs derived, per field:** a `field_basis jsonb` column on `comp_listing_event` and on `lease_comp`, e.g.
  `{"noi":"derived","lease_expiration_date":"derived"}`.
  - A missing key means stated, or legacy and unknown.
  - The UI shows derived values with a "calc" badge, and a stated value always replaces a derived one.
- **NOI → lease rent:** for an absolute NNN / NNN lease only, `annual_base_rent` = NOI, marked `derived`. For NN or ground leases NOI isn't rent, so it's not copied.
- **Backfill.** Latest listing event per offering, 36 offerings today:
  - 30 get a derived NOI (price + cap known, NOI missing);
  - 0 have NOI stated;
  - 0 can derive price, and 0 can derive cap;
  - 3 have fewer than two figures, so nothing can be derived;
  - 3 have no figures at all.

  The backfill runs as a one-time migration and reports its counts.

## 4. Broker contacts

**Finding: OVIS has no single "contact association" shared across objects.** Properties use `property_contact` (4,664 rows),
deals use `deal_contact`, and the site-submit Contacts tab reads both of those (it has no table of its own). Comps are a separate
table from `property`, so none of these fit.

**Proposal:** a `comp_property_contact` join table that mirrors `property_contact`:
- columns `comp_property_id`, `contact_id`, `role` (`listing_broker`), `operating_memorandum_id` (which offering), `created_at`/`by`;
- unique on (comp_property_id, contact_id, operating_memorandum_id);
- REVOKE/GRANT block (authenticated SELECT/INSERT/DELETE, service_role for the MCP), with RLS `is_internal_user()`.

The broker is tied to the offering, because a relist often has a new broker. The comp's Overview shows "Listing broker(s)" from this table.

Matching in `upsert_listing`, using new params `broker_email`, `broker_phone` plus the existing `broker_name` / `brokerage`:
1. `lower(email)` exact match on `contact.email`. One hit → link. Several hits → ambiguous.
2. If there's no email, or no email match: normalized first + last name **and** company ≈ brokerage. One hit → link. Several → ambiguous.
3. No match, and there's an email or a phone → create a contact with `source_type` set to listing intake and a "NNN listing broker" tag, then link it.
   With only a name and nothing to deduplicate on, **don't create one**: it would be a likely duplicate, so it's treated as ambiguous.
4. Ambiguous → don't link. The candidates (name, company, email) are added as a checklist line on Noree's task for that listing:
   "[ ] Pick the broker contact: A / B / create new".
   - On an update there's no new task. The line goes onto the open listing task if one exists, otherwise it's returned in the tool result.

**Risk to accept:** auto-created contacts land in the main CRM (5,958 contacts). The tag makes them filterable and easy to bulk-review.

## 5. Showcase adapter: recommend NOT building

- **Fetchability:** every automated fetch of showcase.com returned **403**: robots.txt, the homepage, the terms pages, and CoStar's own terms page.
  The block is site-wide, not just on listing pages. I didn't retry with browser-like headers; that would be getting around the block.
  An edge function would most likely get the same 403.
- **Terms:** they couldn't be read automatically, because they're behind the same block, so I can't confirm they allow it. Showcase is CoStar's.
  CoStar is known for litigating over copied listing data (it sued Crexi in 2020 over scraped listings). An unverifiable terms check
  plus an active block is a "no".
- **Alternative that keeps the value without scraping:** you open the Showcase page in your browser and paste the page text or PDF
  into Claude, which calls `upsert_listing` with the extracted fields. After §2, those fields include rent, lease dates, SF, lot size,
  APN and the broker contact. That's the same path as the saved-search email alerts, with no new tool.
- If you want a Showcase adapter anyway: read the terms in a browser first, or ask CoStar for written permission.

## Effort estimates (build + verify; Mike's review is separate)

| Piece | Work | Estimate |
|---|---|---|
| 1. Audit | Done (this doc) | — |
| 2. Lease terms on `lease_comp` | RPC rebuild from the live def + migration; ~11 new tool params; fill-if-empty + change-to-notes; term → expiration; round-trip and live MCP test | **0.5–1 day** |
| 3. Derived financials | `field_basis` columns; derivation in the RPC; backfill migration (30 NOIs); "calc" badge in listing timeline + Leases tab | **0.5 day** |
| 4. Broker contacts | `comp_property_contact` + grants/RLS; matching + create + tag in `ovis-mcp`; ambiguous → VA checklist line; Overview broker list; test cases (email hit, name+company hit, duplicate, name-only) | **1–1.5 days** |
| 5. Showcase | Recommend not building; the paste-in path needs no code after §2 | **0** |

Suggested order: 3 → 2 → 4. Derivation is the smallest and immediately fills 30 NOIs. 2 shares its RPC rebuild.
Rollout per piece: migration (file → psql → record), merge to main, **then** deploy `ovis-mcp` from main.
