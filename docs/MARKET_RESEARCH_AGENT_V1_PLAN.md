# Market Research Agent — v1 Implementation Plan

**Branch:** `feature/market-research-agent` (off `main`)
**Companion spec:** [`market-research-agent-spec.md`](market-research-agent-spec.md)
**Owner:** Mike Minihan

## Phase progress

| Phase | Status | Reference |
|---|---|---|
| **A — Boundary dataset** | ✅ Shipped 2026-06-06 (live: 159 GA counties + 538 places) | [`MARKET_RESEARCH_AGENT_PHASE_A.md`](MARKET_RESEARCH_AGENT_PHASE_A.md) |
| **B — research_run + checklist + staging schema** | ✅ Shipped 2026-06-06 | [`MARKET_RESEARCH_AGENT_PHASE_B.md`](MARKET_RESEARCH_AGENT_PHASE_B.md) |
| **C — MCP edge function + backing RPCs** | ✅ Shipped 2026-06-08 (deployed at `/functions/v1/ovis-research-mcp`) | [`MARKET_RESEARCH_AGENT_PHASE_C.md`](MARKET_RESEARCH_AGENT_PHASE_C.md) |
| **D — "Start Research" trigger UI** | ✅ Shipped 2026-06-08, refined 2026-06-08 with preview + per-muni checkbox flow ("orchestration pivot" — OVIS creates the run, OpenClaw researches a frozen scope; layer-3 SQL guard rejects off-checklist findings) | [`MARKET_RESEARCH_AGENT_PHASE_D.md`](MARKET_RESEARCH_AGENT_PHASE_D.md) |
| **E — Approval modal + promotion RPC + auto-create municipality** | ✅ Shipped 2026-06-08 (RPCs verified end-to-end; UI typechecks clean) | [`MARKET_RESEARCH_AGENT_PHASE_E.md`](MARKET_RESEARCH_AGENT_PHASE_E.md) |
| **F — Wire OpenClaw end-to-end** | ⏳ Blocked on OpenClaw URL/token | — |

**Related work:** [`MIGRATION_HISTORY_CLEANUP_PLAN.md`](MIGRATION_HISTORY_CLEANUP_PLAN.md) (on branch `chore/migration-history-cleanup-plan`) — planning-only doc for the pre-May `schema_migrations` backlog that's still blocking `supabase db push` on this branch. Doesn't block any market-research phase; psql is the practical migration path until the cleanup runs.

---

## Scope

OVIS-side build only. The OpenClaw subagent is a separate deliverable that consumes the MCP tools defined here. v1 ships when the loop works end-to-end on a Starbucks site_submit using a real OpenClaw trigger.

---

## Decisions locked (confirmed 2026-06-06)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Boundary entities returned by `get_municipalities_in_radius` | **Cities + counties as separate checklist items** | Cities run their own permit portals; counties cover unincorporated land. Both belong on the checklist. |
| 2 | Email-inbox-reading (§5) | **Fast-follow (v1.1)** | v1 sends from the alias but does not read replies. Highest-leverage piece deferred until rest of loop is stable. |
| 3 | Staging strategy (§6 Step 6 of the workflow) | **Separate `municipal_project_staging` table** | Clean audit trail; map/importer never see un-approved rows; rollback is `DELETE FROM staging`. |
| 4 | MCP service hosting | **Supabase Edge Function speaking MCP-over-HTTP** | Matches the existing `bookkeeper-query` / `cfo-query` / `hunter-trigger-run` pattern. Zero new infra. |
| 5 | Re-research semantics | **Each click = new `research_run` row** | Audit trail of how the trade area evolves. Mirrors `municipal_import` per-CSV row pattern. |
| 6 | Boundary backfill scope | **GA only** | Smallest viable backfill; matches all four test cases (§10). Re-runnable for other states later. |
| 7 | Trigger UI scope | **Starbucks site_submits, admin + broker roles** | §4 protocol is genuinely Starbucks-tuned. Limits surface area. |
| 8 | OpenClaw status | **Deployed gateway** | Real URL + token configured via env. End-to-end test possible on day one. |
| 9 | Radius semantics | **Per-run, picked at trigger time** | Modal presets: 3 / 5 / 10 / 15 mi (default 10). Urban-area override addresses the metro-Atlanta blowup problem (10mi pulls in 15–25 cities). |
| 10 | `municipality` row bridging on promote (added 2026-06-07) | **Auto-create on Approve & Commit (option A)** | When a staging row has `municipality_id IS NULL`, Phase E's promotion RPC find-or-creates a `municipality` row by case-insensitive name match against `boundary_municipality.name`. Names follow the existing convention: counties = `"Barrow County"`, cities = `"Winder"` (no `" city"` suffix) — already what `boundary_municipality.name` stores, so the promotion is a verbatim copy. |

---

## Build order (dependency-ordered)

### Phase A — Boundary dataset (PREREQUISITE)

**Migration:** new table `boundary_municipality`.

```sql
CREATE TABLE boundary_municipality (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('county','city')),
  state       text NOT NULL,                      -- 'GA'
  fips_state  text NOT NULL,                      -- '13'
  geoid       text NOT NULL,                      -- Census GEOID
  name        text NOT NULL,                      -- 'Winder' | 'Barrow County'
  population  int,                                -- nullable; from ACS
  geometry    geometry(MultiPolygon, 4326) NOT NULL,
  centroid    geometry(Point, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, state, geoid)
);
CREATE INDEX boundary_municipality_geometry_gix  ON boundary_municipality USING GIST (geometry);
CREATE INDEX boundary_municipality_centroid_gix  ON boundary_municipality USING GIST (centroid);
CREATE INDEX boundary_municipality_state_kind_idx ON boundary_municipality (state, kind);
```

**Backfill script** (one-shot, idempotent, runs as a Node script with service-role key):
- Counties: TIGER `/State_County/MapServer/1/query?where=STATE='13'&returnGeometry=true&outSR=4326&f=geojson`
- Cities: TIGER `/Places_CouSub_ConCity_SubMCD/MapServer/...` filtered to `CLASSFP='C1'` (incorporated only — excludes CDPs which have no government).
- Compute `centroid = ST_Centroid(geometry)`.
- Population: enrich from Census ACS API in a second pass (separate concern; nullable column means v1 ships even if ACS step fails).

**Acceptance:** `SELECT name FROM boundary_municipality WHERE state='GA' AND kind='city'` returns ~535 rows. Querying `ST_DWithin` from a Winder, GA lat/long at 10mi radius returns Winder + Barrow County + neighbors.

**RLS:** Read = authenticated. Write = service-role only (backfill / future re-syncs).

---

### Phase B — Research run + checklist + staging schema

**Migrations:**

```sql
-- One row per "Start Research" click. Lives forever for audit.
CREATE TABLE research_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id  uuid NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  triggered_by    uuid REFERENCES "user"(id),
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  radius_miles    int NOT NULL DEFAULT 10,
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','running','awaiting_review','approved','archived','failed')),
  needs_review    text,                                -- §7 free-text, agent-written, user-editable
  alt_avenues     text,                                -- §4 "note alternative avenues taken"
  openclaw_run_id text,                                -- correlation ID returned by OpenClaw on trigger
  completed_at    timestamptz
);
CREATE INDEX research_run_site_idx ON research_run (site_submit_id, triggered_at DESC);

-- One row per municipality on the per-run checklist.
CREATE TABLE research_checklist_item (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id           uuid NOT NULL REFERENCES research_run(id) ON DELETE CASCADE,
  boundary_municipality_id  uuid NOT NULL REFERENCES boundary_municipality(id),
  priority                  int NOT NULL,             -- 1 = closest to site
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','in_progress','complete','skipped','blocked')),
  notes                     text,                     -- agent's per-muni notes
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (research_run_id, boundary_municipality_id)
);

-- Mirror of municipal_project + agent fields + approval workflow.
CREATE TABLE municipal_project_staging (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id                 uuid NOT NULL REFERENCES research_run(id) ON DELETE CASCADE,
  boundary_municipality_id        uuid REFERENCES boundary_municipality(id),
  municipality_id                 uuid REFERENCES municipality(id),  -- existing OVIS muni, set on promote
  -- mirror of municipal_project (see MUNICIPAL_PROJECT_IMPORTER_SPEC.md)
  project_name                    text,
  address                         text,
  phase_label                     text NOT NULL DEFAULT '',
  parcel_numbers                  text[] NOT NULL DEFAULT '{}',
  single_family_lots              int,
  townhouse_units                 int,
  duplex_units                    int,
  apt_units                       int,
  cottage_units                   int,
  total_housing_units             int,
  zoning                          text,
  zoning_approval_date            date,
  notes                           text,
  raw_stages                      jsonb NOT NULL DEFAULT '{}',
  status_stage_id                 uuid REFERENCES project_stage(id),
  -- §7 agent-added fields
  builder_developer               text,
  permit_url                      text,
  permit_application_date         date,
  source                          text NOT NULL,                -- §7 required, free-text
  -- approval workflow
  matched_existing_id             uuid REFERENCES municipal_project(id),  -- server-side dup detection
  approval_state                  text NOT NULL DEFAULT 'pending'
                                    CHECK (approval_state IN ('pending','approved','rejected')),
  approved_at                     timestamptz,
  approved_municipal_project_id   uuid REFERENCES municipal_project(id),
  created_at                      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX municipal_project_staging_run_idx ON municipal_project_staging (research_run_id);
CREATE INDEX municipal_project_staging_state_idx ON municipal_project_staging (approval_state);

-- Add agent fields to canonical table so promoted rows have a home.
ALTER TABLE municipal_project
  ADD COLUMN source                    text,
  ADD COLUMN builder_developer         text,
  ADD COLUMN permit_url                text,
  ADD COLUMN permit_application_date   date,
  ADD COLUMN source_research_run_id    uuid REFERENCES research_run(id);
```

**RLS:** Read = admin + broker. Write = service-role only (MCP edge function) for `research_run`, `research_checklist_item`, `municipal_project_staging`. Approval action (server-side promote) also runs with service-role from a separate edge function or RPC.

---

### Phase C — MCP edge function

**Location:** `supabase/functions/ovis-research-mcp/index.ts`

**Transport:** MCP Streamable-HTTP (POST /mcp). Auth via bearer token in `Authorization` header (token in env: `OVIS_MCP_BEARER_TOKEN`).

**Tools exposed (§8):**

1. **`get_municipalities_in_radius(site_id, radius_miles)`**
   - Looks up site_submit's lat/long.
   - `SELECT id, kind, name, ST_Distance(centroid, $site_point) AS distance_mi FROM boundary_municipality WHERE state='GA' AND ST_DWithin(centroid, $site_point, $radius_meters) ORDER BY distance_mi`
   - Returns ordered list with distance + boundary_municipality_id.

2. **`create_research_checklist(site_id, radius_miles, municipalities[])`**
   - Creates a `research_run` row (state='running').
   - Bulk inserts `research_checklist_item` rows with priority = order in the municipalities array.
   - Returns `research_run_id`.

3. **`update_checklist_status(research_run_id, boundary_municipality_id, status, notes?)`**
   - Updates one row in `research_checklist_item`.
   - Idempotent.

4. **`submit_research_report(research_run_id, candidate_records[], needs_review, alt_avenues?)`**
   - Single batched write (§8 explicit anti-chatty design).
   - Inserts staging rows.
   - **Server-side dup detection:** for each candidate, normalize (project_name, address) and look up existing `municipal_project` rows for the same municipality_id; populate `matched_existing_id` if found.
   - Updates `research_run.state = 'awaiting_review'`, `needs_review`, `alt_avenues`, `completed_at`.

**Service-role key:** `SUPABASE_SERVICE_ROLE_KEY` (already in edge function env across this repo).

---

### Phase D — Trigger UI

**Where:** "Start Research" button on the site_submit sidebar, gated by:
- `site_submit.client_id` → Starbucks (resolved via existing client lookup)
- User role ∈ {admin, broker}

**Modal on click:**
- Site address (read-only)
- Radius picker: 3 / 5 / 10 / 15 mi, default 10
- "Start" button → POST to `OPENCLAW_TRIGGER_URL` with bearer `OPENCLAW_TRIGGER_TOKEN`:
  ```json
  { "site_id": "...", "lat": 33.99, "lng": -83.72, "radius_miles": 10 }
  ```
- OVIS records the request locally (research_run row created in `pending` state with `openclaw_run_id` populated when OpenClaw responds).
- Toast: "Research started — you'll get a Telegram message when it's ready for review."

**Past runs visible** on the site_submit sidebar as a list (latest first), each linking to its approval view.

---

### Phase E — Approval UI

**Per CLAUDE.md overlay-first principle:** the approval UI is a slideout on the site_submit, not a standalone page.

**Layout:**
- Header: site name, run date, radius used, state badge.
- **Checklist section** (collapsible): every `research_checklist_item` with status badge.
- **Staged records section:** grouped by municipality.
  - Per row: editable fields (project_name, address, units, builder_developer, permit_url, permit_application_date, source, notes), per-row checkbox (default: checked unless `matched_existing_id IS NOT NULL`).
  - Badge: `NEW` / `MATCHES EXISTING` / `REJECTED`.
  - Delete button = mark `approval_state='rejected'` (kept for audit, not hard-deleted).
- **Needs-review section:** free-text editable, defaults to agent-written content.
- **Footer:** "Approve & Commit Selected" → for each checked row, INSERT into `municipal_project` and set staging row's `approval_state='approved'`, `approved_at=now()`, `approved_municipal_project_id`. Updates `research_run.state='approved'`.

**Scale flag:** if a run produces >50 staged rows, the slideout may need pagination or municipality-level filtering. Not blocking v1 — fix when first run exceeds the threshold.

---

### Phase F — Wire OpenClaw

**Env (production + staging):**
- `OPENCLAW_TRIGGER_URL` — placeholder until shared
- `OPENCLAW_TRIGGER_TOKEN` — placeholder until shared
- `OVIS_MCP_BEARER_TOKEN` — generated, shared with OpenClaw operator

**End-to-end smoke test (using §10 test cases):**
1. Trigger research on a Starbucks site_submit near Winder, GA, radius 10mi.
2. Confirm checklist contains Winder + Barrow County + Hoschton + nearby Jackson County.
3. Wait for OpenClaw to complete the run.
4. Receive Telegram notification.
5. Open approval slideout, verify records, click Approve & Commit on a subset.
6. Confirm promoted rows appear on the existing municipal-projects map layer.

---

## Defaulted without asking (flag in PR)

These are choices I'm making without burning more clarification turns. Surface them in the PR description so you can reverse any of them in review.

- **Cross-border sites:** GA-only backfill means a site within ~10mi of SC/AL/FL/TN/NC silently misses out-of-state munis. v1 emits a console warning + UI banner when site_submit lat/lng is within 15mi of the GA border; full neighbor-state backfill is a v1.x option (already costed by the boundary-scope question).
- **Telegram routing:** OpenClaw owns all Telegram messaging. OVIS has no Telegram code in v1 — the only OVIS-side notification surface is the research_run state badge on the site_submit sidebar.
- **Dup detection:** runs server-side inside `submit_research_report`. Matches on normalized `(municipality_id, lower(trim(project_name)), lower(trim(address)))`. Sets `matched_existing_id` on the staging row; approval UI shows a "MATCHES EXISTING" badge.
- **Needs-review storage:** lives on `research_run.needs_review`. Past runs visible on the site_submit sidebar; not copied to a sticky site_submit field.
- **"Source" field shape:** free-text on each record. Agent comma-separates if multiple sources contributed.
- **Permit URL:** single text field. Multiple permits → agent picks the most authoritative one and notes others in `notes`.
- **Add-row affordance in approval UI:** out of scope for v1. Mike can only edit / reject staged rows. Anything the agent missed gets captured in `needs_review` free-text.
- **Auto-density radius suggestion** ("you're in a metro, consider 5mi"): v1.1.
- **Rejected staging rows:** kept forever (`approval_state='rejected'`) for audit. Never hard-deleted from staging.
- **Bulk approval controls:** "select all NEW", "deselect all MATCHES EXISTING", "approve selected". No "approve everything" one-click — explicit selection only.

---

## Open items still to resolve

1. **OpenClaw URL/token** — placeholders until you share. Plumbing ready.
2. **Population data source** — TIGER Places attribute vs. separate Census ACS pass. Confirm during Phase A backfill. Doesn't block v1; column is nullable.
3. **Status normalization (§7)** — "Approved / Under Construction / Recently Completed / Pending" vs. the existing `project_stage` table. v1 will reuse `project_stage` (`status_stage_id` on staging) and seed any missing canonical stages.
4. **Approval UI in slideout vs. dedicated page** — defaulting to slideout per CLAUDE.md overlay-first principle. Will revisit if scale forces a dedicated page (>50 rows per run).

---

## Test cases (from spec §10)

Mike already has solid growth-story research in OVIS for these — v1 acceptance is "the agent's output for these matches or improves on what's already there":

- Winder, GA
- Jackson County, GA
- Barrow County, GA
- Hoschton, GA

---

## Out of scope for v1 (explicit non-goals)

- Email inbox reading + attachment parsing (v1.1; highest-priority fast-follow)
- States other than GA
- Non-Starbucks clients
- Add-new-row in approval UI
- Auto-density radius suggestion
- Pagination of approval slideout
- Polygon drawing on staged records (Phase 3 of the importer spec covers this for canonical `municipal_project`; v1 ignores)
- Map layer changes to show staged-vs-approved records differently
- Per-municipality re-research (currently re-running re-research the whole site)
