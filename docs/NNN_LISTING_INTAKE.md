# NNN Listing Intake (OVIS MCP)

> **Superseded data model.** v1 below used a separate `listing_staging` table, **dropped 2026-10-28**.
> Listings now live in the comp database. See [NNN_LISTING_INTAKE_SPEC_v2.md](NNN_LISTING_INTAKE_SPEC_v2.md) (phase 1 live
> 2026-10-28). **Still current here:** the endpoint, the auth design and the OAuth dashboard steps (§Auth).

## What it does

Claude (claude.ai connector or Claude Code) finds NNN investment listings and records them in OVIS:

1. `upsert_listing` normalizes the address, inserts the listing or bumps `last_seen`, and geocodes new rows onto the map.
   **Since ovis-mcp v0.3.0 (2026-10-30), a new listing also gets its diligence task server-side**, assigned to Noree:
   - It fires only when the result has `is_new = true` (a new comp, or a relist on an existing comp). Re-sightings and price/cap changes never create a task.
   - It uses the same code and RPC as `create_va_task` (due today ET, Inbox, Listing + Comp record links, default checklist) and returns `va_task_id`.
   - If the task fails, the listing is still saved and `va_task_error` is returned; retry with `create_va_task`.
   - **Opt-out (v0.3.1, 2026-10-30):** `upsert_listing` takes an optional boolean `create_va_task`, default `true`.
     With `false`, a new listing is saved normally but gets no task, and the result returns `va_task_skipped: true`.
     Use it **only for bulk backfills**; normal intake leaves it at the default. Updates never create tasks either way.
     Tested live: one listing with `false` and one with the default produced exactly one task. The test rows were deleted.
2. `create_va_task` stays as a standalone tool: an extra or reassigned task, or a retry after `va_task_error`. Don't call it for a listing `upsert_listing` just created, or Noree gets two tasks.
3. `list_recent_listings` lets the agent skip listings it has already captured.
4. `listing_activity` is the daily-summary feed (spec v2 §8.6).
5. **`ovis_url` (v0.6.1, 2026-11-02):** `upsert_listing` results and every `listing_activity` row that names a listing (`new_listings`, `price_changes`, `status_changes`, `possibly_off_market`) carry `ovis_url` = `https://ovis.oculusrep.com/listings/review?listing=<listing_id>`.
   That opens the listing's review panel (timeline, sources, conflicts, broker, link to the comp) over the queue, whatever tab it's on. Built in the edge function; no migration.

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

## Geocoding and the Unmapped queue (2026-10-31, ovis-mcp v0.4.0)

- **Order:** Census first. When Census finds nothing or only an inexact match, Google Geocoding is tried with the
  server key `GOOGLE_GEOCODING_API_KEY` (a Supabase secret, Geocoding-API-only). Google counts only as ROOFTOP or
  RANGE_INTERPOLATED and not `partial_match`. The upsert result carries `geocode_source` (`census` / `google`).
- **Status is stored** on `comp_property` (migration `20261031091217_comp_geocode_status.sql`):
  - `geocode_status`: `placed`, `no_match`, `ambiguous` (only inexact matches, deliberately not pinned) or `manual`;
  - `geocode_source`: `census`, `google` or `manual`;
  - `geocoded_at`.

  A transient error (network, Google `REQUEST_DENIED` / quota) leaves the status alone, and the next sighting retries.
- **"Unmapped" is derived, not stored:** no `verified_*` and no raw `latitude/longitude`, the same test the map layer uses
  to skip a comp. Rejected comps are excluded.
- **Queue UI**, modeled on the municipal "not on map" worklist:
  - `/listings/review` has an **Unmapped** tab (tenant, address, city, source link, why). Its **Place on map** button opens
    `/mapping?place-comp=<id>`.
  - The map's Layers menu → **Comp Database** row has a "N not on map" list (`CompUnplacedPanel`). It shows even with the layer off.
  - The comp slideout shows a **Not on the map** bar with **Drop a pin**. Click the map to drop a pin (drag it, or click
    again to move it), then **Place pin here**.
  - **Place pin here** calls `set_comp_property_pin`, which writes `verified_latitude/longitude` and sets `geocode_status = manual`.
    It is `SECURITY INVOKER`, executable by `authenticated` only, and gated by comp RLS.
  - Pending listings get "Show pending" switched on, so the placed pin is visible.
- Like the municipal worklist, this lives only in the map page's Layers popup, not in `LayerManager`.

## Derived financials (2026-10-31, migration `20261031100649_comp_derived_financials.sql`)

- **Any two of price / cap / NOI give the third** (NOI = price × cap / 100; cap is a percent). A BEFORE INSERT trigger on
  `comp_listing_event` does the calculation, so the MCP sweep, the UI and backfills share one implementation. Derived figures are marked in
  `field_basis` (e.g. `{"noi":"derived"}`); a missing key means stated. A caller's stated value is never overwritten.
  Events are append-only, so a later stated figure arrives as a new event.
- **NOI → lease rent:** on a `bts_nnn` or `ground_lease` lease (ground leases since 2026-11-02, migration `20261102100040`; NOI is the ground rent), the offering's latest NOI fills `lease_comp.annual_base_rent` when it's empty or
  was itself derived, marked `{"annual_base_rent":"derived"}`. Multi-tenant and untyped leases are left alone. Editing the
  rent in the Leases tab makes it stated (the mark is dropped), and NOI never touches it again.
- **UI:** derived figures show a "calc" badge in the listing timeline and the Leases tab.
- **Backfill (2026-10-31):** 30 listing events got a derived NOI (none needed cap or price). 16 `bts_nnn` leases got rent from NOI; 6 ground leases followed on 2026-11-02.

## Sources, field precedence and lease terms (2026-11-02, ovis-mcp v0.5.0, migration `20261102100402_comp_listing_sources_precedence.sql`)

- **Every source is kept.** `comp_listing_source` has one row per offering × source URL, with kind, label, url and first/last seen.
  Each `upsert_listing` call adds or refreshes its own row and never replaces another source's URL.
  - The listing panel lists them all.
  - Noree's task lists OM links in the order CoStar → Crexi → LoopNet → others, with **Showcase last, marked data only**: don't request the OM
    from Showcase brokers (it triggers broker drip emails).
  - A new source on a listing whose task is still open is appended to that task.
- **Source kind** (`comp_source_kind(source, url)`) is decided by the URL domain first, then the source text: `costar`, `crexi`, `loopnet`,
  `showcase`, `om` (a PDF / "offering memorandum"), else `aggregator`. The MCP can never claim `manual`.
- **Precedence** (`comp_source_rank`), highest first:

  | Rank | Source |
  |---|---|
  | 1 | Manual, entered in OVIS |
  | 2 | OM |
  | 3 | Showcase |
  | 4 | Crexi / LoopNet / CoStar |
  | 5 | Aggregators and anything unrecognised |
  | 99 | Derived |

  `comp_merge_fields` applies it to the comp property (zip, APN, building SF, lot acres), the listing (broker name / brokerage / email / phone,
  list date, term and lease type as listed) and the lease (lease type, guarantor, rent, start, expiration, bumps, options):
  - A lower rank fills only empty fields. The result's `fields_kept_higher_source` lists what it couldn't change.
  - An equal or higher rank may update a field. Every change is logged in `comp_field_change` with the old and new value and the old and new source.
  - **`comp_field_change` log (migration `20261102112859`, 2026-11-02).** One row per field event from `upsert_comp_listing`: `table_name`, `record_id`, `field`, `old_value`, `new_value`, `old_source`, `new_source`, `source_url`, `changed_at`, `outcome`.
    - `outcome = 'applied'`: the value changed, including a fill of an empty field (old value and old source null). Hand edits in OVIS log here too, as `new_source = 'manual'`.
    - `outcome = 'blocked'`: a lower-ranked source sent a **different** value and the higher-ranked one was kept. `old_*` is what was kept; `new_*` and `source_url` are what was refused. The same value gets no row.
    - The same refusal again (same field, source, URL, refused value and kept value) isn't logged twice, so a daily re-sighting doesn't add a row a day.
    - A derived value (such as an expiration from `term_left`) losing to a stated one isn't a blocked source and isn't logged.
    - The same migration fixed a piece-2 bug: when a higher-ranked source restated a value a lower one already held, `comp_merge_fields` raised `malformed array literal: "__prov__"` and the whole upsert failed.
  - Null or blank never overwrites a value.
  - Each value's source is stored in `field_source` beside `field_basis` (stated vs derived).
  - **A person editing a tracked field in OVIS** makes it `manual` (via the `comp_mark_manual_fields` trigger), and the sweep can't overwrite it after that.
  - **Legacy values** with no `field_source` count as manual.
    - The 2026-11-02 backfill tagged only the fields the sweep itself writes, with each listing's source.
    - Every sweep row was stamped with Mike's auth id, so a hand edit of one of those specific fields before that date reads as sweep data.
- **Price/cap conflicts.** A different figure from another source that is still live (seen in the last 14 days):
  - is kept as its own event, tagged `source_kind` and `conflict`;
  - **flags the listing** (`price_conflict` + note), which shows on `/listings/review` → **Price conflicts** and adds a checklist line on Noree's task.
  - If the conflicting source ranks lower, its event is `outranked`: kept in the history, but never the current ask.
  - **Mark resolved** in the listing panel clears the flag; both events stay.
- **Lease terms land on `lease_comp`:**
  - `current_rent` → annual base rent (stated, which beats rent derived from NOI);
  - `lease_start` / `lease_expiration`;
  - `bumps` → `rent_bumps_text` plus parsed `escalation_pct` / `rent_bump_frequency`;
  - `options` → `option_periods` plus parsed count and term.

  `term_left` → `lease_expiration_date` = list date (or today) + N years, **marked derived**, so it loses to any stated expiration.

## Upsert semantics

On a repeat sighting, `last_seen` is set to now and any non-null incoming field (price, cap rate, tenant,
lease type, term, source) overwrites the stored one. A price drop is kept, and a blank field never erases data.
`status` is never changed by the tool, so a rejected listing stays rejected.
A `cap_rate` passed as a fraction (`0.0575`) is converted to a percent (`5.75`).

## Auth

Endpoint: `https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-mcp`

### How claude.ai is connected (2026-10-30, 2:03 PM ET): OAuth

claude.ai → Settings → Connectors → custom connector **"OVIS (oAuth)"**: the endpoint URL, the sign-in
option, no client ID/secret and no request header. It is connected per user, and writes are audited as the
signed-in OVIS user.

**How OAuth got unblocked: the JWT signing key was rotated to ES256 on 2026-10-30.**
- claude.ai requests the authorization server's full scope list, including `openid`. While the
  current signing key was the legacy HS256 secret, `/oauth/token` returned **500 "HS256 is not
  supported for ID token signing"**.
- Advertising `scopes_supported` without `openid` doesn't work around it: claude.ai abandons sign-in
  before registering. That was tested three ways; don't re-add it.
- The rotation dialog warned that ~50 `verify_jwt = true` functions might break. **They didn't.**
  Tested live after the rotation:
  - ES256 user tokens got 200 through the gateway on `dropbox-proxy` and `streetlight`.
  - HS256 tokens (the legacy anon JWT in cron/pg_net calls, older sessions) still get 200 on
    `email-triage`, `gmail-sync` and `send-portal-comment-alert`.
  - There were no 401s.
- **Never revoke the previous HS256 key.** The cron/pg_net callers still sign with it.
- **Rollback**, if ever needed: JWT Keys → move the HS256 key back to Standby → Rotate.
- `_shared/jwt.ts` (send-site-submit-email) and `ovis-mcp` verify ES256 in code via JWKS.
- Diagnose with the Management API logs endpoint (`/analytics/endpoints/logs`, unified `logs` table:
  `source = 'auth_logs' | 'edge_logs' | 'function_logs' | 'function_edge_logs'`).

Earlier the same day the connector ran on **No sign-in** with the header
`Authorization: Bearer <OVIS_MCP_INTAKE_TOKEN>`. That still works as a fallback, but writes are
audited as no user. That connector was deleted when OAuth went live.

Two credentials are accepted, both as `Authorization: Bearer …`:

1. **OAuth 2.1** (live; see above). At the time of writing, claude.ai web connectors **could not send a static bearer
   header**. They need OAuth with Dynamic Client Registration and PKCE. The function returns
   `401` + `WWW-Authenticate: Bearer resource_metadata=".../ovis-mcp/.well-known/oauth-protected-resource"`.
   That metadata names Supabase Auth (`/auth/v1`) as the authorization server. Supabase Auth issues the token, and the
   function validates it (`auth.getUser`) and then requires `is_internal_user()` **as that user**. Admin, broker
   and VA accounts pass; portal and coach accounts get 403.
2. **Static token** = secret `OVIS_MCP_INTAKE_TOKEN`, for the claude.ai connector (as a request header), Claude Code and scripts. It acts as no OVIS user
   (`created_by_id` / `assigned_by_id` are NULL). Reset 2026-10-30; the value is in Mike's password manager.
   It is **not** `OVIS_MCP_BEARER_TOKEN` (that one is `ovis-research-mcp` / OpenClaw). To rotate:
   `openssl rand -hex 32`, then `supabase secrets set OVIS_MCP_INTAKE_TOKEN=<value> --project-ref rqbvcvwbziilnycqtmnc`.
   Claude Code: `claude mcp add --transport http ovis <endpoint> --header "Authorization: Bearer <value>"`.

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
- The OAuth path was verified 2026-10-30 after the ES256 rotation: DCR 201, consent 200, `/oauth/token` 200, and ES256 tool calls 200 from Claude-User.
- **Not verified:** the UI in a browser.

## Where we left off (2026-11-02)

Live in prod, all merged to main and deployed from main:
- Pieces 3 (derived financials, ground leases) and 2 (multi-source listings, field precedence, lease terms, VA OM-link order).
- ovis-mcp **v0.6.1**: `ovis_url` on `upsert_listing` results and `listing_activity` rows (main 69775d25).
- `comp_field_change` logging, applied + blocked, plus the `__prov__` crash fix (migration `20261102112859`, main 5e0adb08).
- Unmapped queue and the Census → Google geocoder fallback (main 29c37a49).

Next, in order:
1. **Piece 4: broker contacts.** Approved as proposed, not started. `comp_property_contact` ties a contact to the offering. Create a contact only when there's an email or phone; ambiguous matches go to Noree's task checklist. Merge to main, then deploy from main.
2. **Geocode proxy** (branch `feature/geocode-proxy`, da5290e7, plan in docs/GEOCODE_PROXY_PLAN.md). Built but not merged; waiting on Mike's localhost test as an internal user, a portal user, the coach (expect 403) and anonymous (expect 401).
   - To run it, start the function with `deno run --allow-net --allow-env supabase/functions/geocode/index.ts` (env from .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SECRET_KEY, SUPABASE_ANON_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY, GOOGLE_GEOCODING_API_KEY).
   - Start the app with `VITE_GEOCODE_FUNCTION_URL=http://localhost:8000 npx vite --port 5176`.
   - Then merge, deploy `geocode` from main, and tell Mike it's live so he can delete the browser geocoding key.
3. **Cleanup:**
   - Remove stale OAuth client registrations.
   - Mike revokes the "Claude Code logs" Supabase access token.
   - If claude.ai still shows the old `upsert_listing` fields, start a new chat or disconnect and reconnect "OVIS (oAuth)". The server already serves all 28 fields plus `ovis_url`.

## Open items

- Set a `GOOGLE_GEOCODING_API_KEY` secret (a server key, no referrer restriction) for rooftop-quality pins.
- Render subtasks in the task UI, then switch `create_listing_va_task` to real child tasks.
- Attaching the OM PDF is a manual VA step for now. Wiring the comp **Files** tab to the listing is not built.
