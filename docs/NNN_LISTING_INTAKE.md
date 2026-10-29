# NNN Listing Intake (OVIS MCP)

> **Superseded data model.** v1 below used a separate `listing_staging` table, **dropped 2026-10-28**.
> Listings now live in the comp database. See [NNN_LISTING_INTAKE_SPEC_v2.md](NNN_LISTING_INTAKE_SPEC_v2.md) (phase 1 live
> 2026-10-28). **Still current here:** the endpoint, the auth design and the OAuth dashboard steps (§Auth).

## What it does

Claude (claude.ai connector or Claude Code) finds NNN investment listings and records them in OVIS:

1. `upsert_listing` normalizes the address, inserts the listing or bumps `last_seen`, and geocodes new rows onto the map.
2. `create_va_task` puts a diligence task with a checklist into Noree's task Inbox.
3. `list_recent_listings` lets the agent skip listings it has already captured.

In OVIS, **NNN Listings** (`/listings/review`, also in both navbar menus) is the review queue.
**Promote to comp** creates Comp Database records and links them back.

## Pieces

| Piece | Where |
|---|---|
| Table + RPCs | `supabase/migrations/20261022083335_listing_staging.sql` |
| MCP server | `supabase/functions/ovis-mcp/index.ts` (`verify_jwt = false` in `config.toml`) |
| Review page | `src/pages/ListingReviewPage.tsx`, route `listings/review` |
| Shared detail panel | `src/components/listings/ListingDetailPanel.tsx` (takes `listingId`, works anywhere) |
| Map layer | `src/components/mapping/layers/ListingStagingLayer.tsx`, registered in `LayerManager.tsx` **and** the `MappingPageNew.tsx` popup |
| Map slideout | `src/components/mapping/slideouts/ListingStagingSlideout.tsx` |
| OAuth consent | `src/pages/OAuthConsentPage.tsx`, route `oauth/consent` |
| Client helpers | `src/lib/listingStaging.ts` |

## Deviations from the original spec (deliberate)

- **`investment_comps` / `comp_leases` don't exist.** The comp database is `comp_property` (location),
  `lease_comp` (tenant lease) and `comp_availability` (asking price). The back-link column is
  **`comp_property_id`**, not `investment_comp_id`. Promote creates the following:
  - a `comp_property` with name = tenant, the address and lat/lng, `confidence='reported'`, `is_available` (so the pin is amber unless the listing is sold), and `source_reference='listing_staging:<id>'`;
  - a `lease_comp` with the tenant, a mapped lease type (Absolute NNN/NNN → `bts_nnn`, NN → `bts_nn`, ground → `ground_lease`), and the listed lease type, term left and guarantor in its notes;
  - a `comp_availability` row (`for_purchase`, asking price). `comp_availability` has no cap-rate column, so the asking cap rate goes in its notes.

  Promote is idempotent. It runs `SECURITY INVOKER`, so the comp tables' `is_internal_user()` RLS applies.
- **`address_norm` includes city and state.** "100 Main St" exists in many GA cities, so a street-only
  unique key would merge different listings. Normalization is the SQL function `normalize_listing_address`. It lowercases, strips punctuation and applies USPS suffix/directional abbreviations, e.g. `100 peachtree st nw, atlanta ga`.
- **The checklist lives in the task description, not as subtasks.** Task System v2 has `parent_task_id` in the
  schema, but no UI renders subtasks (there are zero in prod). Eight child tasks would show up as loose
  "Get OM" / "APN" items with no context. One task per listing goes to the assignee's **Inbox**
  (`is_inbox = true`, the same rule as `useTasks.createTask` for cross-user tasks). The description holds the listing
  summary, a link to the review page and `[ ] item` checklist lines. Due date is ET midnight.
- **Geocoding is server-side, but not Google yet.** No Google key exists as a Supabase secret. The browser
  `VITE_` key is referrer-restricted. The function uses Google if a `GOOGLE_GEOCODING_API_KEY` secret is
  set, and otherwise the free **US Census geocoder** (`_shared/site-research/geocode.ts`). Only an exact match is accepted.
  Anything else sets `geocode_status='failed'`. The review page and the map popup show those rows as "not on the map"
  rather than placing a guessed pin. **Retry** in the detail panel re-geocodes with the browser
  `geocodingService` and accepts only ROOFTOP/RANGE_INTERPOLATED precision.
- Added columns not in the spec: `geocode_status`, `va_task_id`, `created_by_id`, `updated_at`.

## Upsert semantics

On a repeat sighting, `last_seen` is set to now and any non-null incoming field (price, cap rate, tenant,
lease type, term, source) overwrites the stored one. A price drop is kept, and a blank field never erases data.
`status` is never changed by the tool, so a rejected listing stays rejected.
A `cap_rate` passed as a fraction (`0.0575`) is converted to a percent (`5.75`).

## Auth

Endpoint: `https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-mcp`

Two credentials are accepted, both as `Authorization: Bearer …`:

1. **OAuth 2.1 (claude.ai custom connector).** claude.ai web connectors **cannot send a static bearer
   header**. They need OAuth with Dynamic Client Registration and PKCE. The function returns
   `401` + `WWW-Authenticate: Bearer resource_metadata=".../ovis-mcp/.well-known/oauth-protected-resource"`.
   That metadata names Supabase Auth (`/auth/v1`) as the authorization server. Supabase Auth issues the token, and the
   function validates it (`auth.getUser`) and then requires `is_internal_user()` **as that user**. Admin, broker
   and VA accounts pass; portal and coach accounts get 403.
2. **Static token** = secret `OVIS_MCP_INTAKE_TOKEN`, for Claude Code and scripts. It acts as no OVIS user
   (`created_by_id` / `assigned_by_id` are NULL).

### To turn on the claude.ai connector (Mike, Supabase dashboard)

1. **Authentication → OAuth Server**: enable the OAuth 2.1 server. Enable **dynamic client
   registration**. Set the **authorization path** to `/oauth/consent`.
2. **Authentication → URL Configuration**: the Site URL must be `https://ovis.oculusrep.com`. The consent
   URL is the Site URL plus the path.
3. Optional, recommended by Supabase for OAuth: asymmetric JWT signing keys (RS256/ES256). This is required only if
   the `openid` scope is requested.
4. In claude.ai, go to Settings → Connectors → Add custom connector and enter the endpoint URL above. Leave the client
   ID/secret empty (DCR). Sign in with your OVIS account and click **Allow** on the OVIS consent page.

Trade-off to know: with DCR on, **any** MCP client can register. Only an internal OVIS user can
complete consent and get a token that passes `is_internal_user()`. Review registered clients
occasionally under Authentication → OAuth Server.

Docs: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication ·
https://supabase.com/docs/guides/auth/oauth-server/getting-started

## Verification done

- The migration was round-tripped in a transaction with ROLLBACK, including an impersonated `authenticated` promote. It was then applied with
  `--single-transaction` and recorded in `schema_migrations`.
- Anonymous HTTP returns 401 / `42501` on the table and all three RPCs. `upsert_listing_staging` and
  `create_listing_va_task` are `service_role`-only. `promote_listing_to_comp` is `authenticated`-only.
- Deployed function checks:
  - no token → 401 with the `WWW-Authenticate` header;
  - bad token → 401;
  - metadata GET, `initialize` and `tools/list` work;
  - upsert returns new, then a duplicate with a variant spelling returns `is_new:false` and refreshes the price;
  - Census geocode places the pin, and a bad address gives `failed`;
  - `list_recent_listings` works;
  - `create_va_task` lands in the Inbox with 8 checklist lines, and an unknown assignee gives `isError`.

  The test rows were deleted.
- **Not verified:** the OAuth path, because it is blocked on the dashboard steps above. Also not verified: the UI in a browser.

## Open items

- Set a `GOOGLE_GEOCODING_API_KEY` secret (a server key, no referrer restriction) for rooftop-quality pins.
- Render subtasks in the task UI, then switch `create_listing_va_task` to real child tasks.
- Attaching the OM PDF is a manual VA step for now. Wiring the comp **Files** tab to the listing is not built.
