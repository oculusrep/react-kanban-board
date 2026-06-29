# Market Research Agent — 2026-06-29 Session Log

**Branch:** `feature/market-research-agent`
**Companion docs:** [`MARKET_RESEARCH_AGENT_V1_PLAN.md`](MARKET_RESEARCH_AGENT_V1_PLAN.md) and Phase A–F docs

Five distinct fixes shipped today during the first real end-to-end runs against a live OpenClaw deployment. Captured here in one place so a future session can absorb today's state without re-reading every commit.

---

## 1. Tailscale Funnel → Supabase Edge: TLS handshake EOF

**Symptom:** Trigger button click returned 502 with `error: openclaw_unreachable, detail: "tls handshake eof"` against the Tailscale Funnel URL `https://macmini-openclaw.tail657e6a.ts.net/hooks/ovis-research`.

**Diagnosis:** External curl from outside the tailnet reached the Funnel cleanly with a valid Let's Encrypt cert (200 with 404 for unmapped paths, 401 for the hook with a wrong token — proving the route works). But the Supabase Edge runtime can't complete a TLS handshake to `*.ts.net`. Confirmed asymmetric — works from open internet, fails from Supabase.

**Fix path:** swap to Cloudflare quick-tunnel (`*.trycloudflare.com`). Proved with a one-off diagnostic edge function (`supabase/functions/cf-tunnel-probe/index.ts`) that posted to the Cloudflare URL with the real `OPENCLAW_TRIGGER_TOKEN` and got back `200` in 317ms with a clean handshake. Then `supabase secrets set OPENCLAW_TRIGGER_URL=https://<funnel>.trycloudflare.com/hooks/ovis-research` — no code change to the trigger function, no redeploy.

**Status:** Working. The cf-tunnel-probe function is still deployed but marked as throwaway in its source — delete when you're confident the path is stable.

---

## 2. Cancel button for hung research runs

**Need:** A run got stuck in `state='running'` (OpenClaw never came back), no UI affordance to clear it.

**Migration:** [`20260629140000_cancel_research_run_rpc.sql`](../supabase/migrations/20260629140000_cancel_research_run_rpc.sql)
- Adds `'cancelled'` to `research_run.state` CHECK constraint. Distinct from `'failed'` (agent error path) so forensics can separate "user gave up" from "agent crashed".
- SECURITY DEFINER RPC `cancel_research_run(p_run_id uuid)` — admin/broker role-gated. Idempotent (cancelling already-terminal runs returns `{ cancelled: false, prior_state }`).

**UI:** Cancel button on `PastResearchRunsPanel` rows where state is `pending` or `running`. Click → confirm dialog → RPC → toast → panel refresh. Stops event propagation so it doesn't also open the approval modal.

**Known caveat:** Cancellation is best-effort. If OpenClaw is mid-run when you cancel and eventually calls `submit_research_report`, the run flips back to `awaiting_review`. Adding a state guard on the submit RPC would close this — small follow-up if it bites.

---

## 3. Approve RPC + modal write `centroid`

**Symptom:** Approved 9 staged records on the Hiram Village run. None appeared on the Municipal Projects map layer.

**Root cause:** The Phase E `approve_research_staging_rows` RPC inserted into `municipal_project` with NULL `centroid` and NULL `geocoded_address`. The map layer renders pins from `centroid` → no centroid, no pin. The CSV importer geocodes pre-insert; the approve RPC quietly skipped that step.

**Three fixes:**

a. [`scripts/backfillMunicipalProjectCentroids.ts`](../scripts/backfillMunicipalProjectCentroids.ts) — one-off backfill script. Reads rows with NULL centroid, calls Google Geocoding (`VITE_GOOGLE_GEOCODING_API_KEY` with fallback to `VITE_GOOGLE_MAPS_API_KEY`), updates `centroid` (as `SRID=4326;POINT(...)` WKT) + `geocoded_address`. Idempotent — only touches NULL rows. Already ran against the 9 invisible Hiram rows.

b. [`20260629150000_approve_writes_centroid.sql`](../supabase/migrations/20260629150000_approve_writes_centroid.sql) — `approve_research_staging_rows` now accepts `latitude`, `longitude`, and `geocoded_address` per row in the JSONB payload. When provided, the INSERT computes `centroid = ST_SetSRID(ST_MakePoint(lng, lat), 4326)`. Backward-compatible: rows submitted without lat/lng still land (just with NULL centroid, backfillable).

c. `ResearchRunApprovalModal.tsx` now calls `geocodingService.geocodeAddress(finalAddress)` for each selected row before calling the approve RPC, passing the resolved coordinates through. Failed geocodes are logged as a console warning but don't block the batch — the row still lands so you don't lose the approval, just without a centroid.

**Verified:** SQL smoke test passed lat=33.9916, lng=-83.7236 through the RPC; the resulting `municipal_project` row has `has_centroid=true`, `ST_Y(centroid)=33.9916` exactly (no precision loss), `geocoded_address` round-tripped.

---

## 4. `municipal_project_v` view picks up Phase B agent fields

**Why:** The map layer reads from `municipal_project_v` (a convenience view with computed centroid lat/lng + joined municipality/stage fields). The view was created with `SELECT mp.*` BEFORE Phase B added the agent columns. Postgres views materialize their column list at creation time — columns ALTER'd onto the base table later don't appear in the view until it's dropped and recreated.

**Migration:** [`20260629160000_municipal_project_v_pickup_agent_fields.sql`](../supabase/migrations/20260629160000_municipal_project_v_pickup_agent_fields.sql)
DROP + recreate the view with the same SELECT shape. Now exposes `source`, `builder_developer`, `permit_url`, `permit_application_date`, `source_research_run_id`, `created_at`, `updated_at` (plus `source_import_id`, `source_row_number` which were already through).

---

## 5. "Source" section + provenance footer on Municipal Project slideout

**What it does:** the click-a-pin slideout now shows the four agent-discovered fields when populated, plus a one-line footer at the bottom of the body telling you where the row came from.

**Source section** (only renders if at least one field is populated):
- **Builder** — `builder_developer`
- **Permit app** — `permit_application_date`
- **Permit URL** — `permit_url`, rendered as a clickable link (opens in a new tab)
- **Origin** — `source` (free-text provenance like "Citizens Portal permit #LDP-2025-0087")

Importer + manually-created rows usually have all four NULL, so the section quietly hides itself — no clutter for non-agent rows.

**Provenance footer** (always renders):
- `source_research_run_id IS NOT NULL` → "Found by the market research agent"
- `source_import_id IS NOT NULL` → "Imported via municipal-project CSV"
- Otherwise → "Manually created"
- Plus the creation date (Eastern Time, per the project convention).

**Files touched:**
- [`src/components/mapping/layers/MunicipalProjectLayer.tsx`](../src/components/mapping/layers/MunicipalProjectLayer.tsx) — added 7 fields to the `MunicipalProjectMapRow` type
- [`src/components/mapping/slideouts/MunicipalProjectSlideout.tsx`](../src/components/mapping/slideouts/MunicipalProjectSlideout.tsx) — new section + footer

No new TypeScript errors introduced (pre-existing `google` namespace errors unchanged).

---

## Other things observed today, not yet fixed

- **Dedup misses real duplicates with builder suffixes.** The 11:58 AM Hiram run's "Pickens Bluff (UnionMain Homes)", "Easton Park (Fischer Homes) - 55+ Active Adult", and "Old Mill Preserve (David Weekley Homes/Encore) - 55+ Active Adult" all match existing `municipal_project` rows ("Pickens Bluff", "Easton Park", "Old Mill Preserve") but the exact-match dedup didn't catch them — different street addresses + builder-suffixed project_name. **Next:** ship `pg_trgm` similarity on `project_name` within muni-adjacent scope. Real false negatives are now confirmed in production data; the fix is justified.
- **Modal lets users approve known dups by accident.** I caught this for Mike before the click — he unchecked the 3 known dups manually. The default-deselect logic only kicks in when `matched_existing_id IS NOT NULL`. The fuzzy dedup above is the structural fix.
- **No debounce on the Start Research modal's submit button.** Two rapid clicks would fire two trigger POSTs. Mike likely double-clicked once today (12:01 PM Hiram run was identical to the 11:58 AM one — could have been intentional, could have been a duplicate click). Worth a small follow-up.
- **OpenClaw correlation IDs (`openclaw_run_id`) are not being stored.** All recent runs have it NULL even after OpenClaw replies. Either OpenClaw isn't returning the field in the expected shape (`{ "openclaw_run_id": "..." }`) or the trigger function's parse path missed it. Worth a 5-minute diagnostic.

---

## What's now true end-to-end

Today the full loop ran for the first time:

1. Click Start Research on the Hiram Village Starbucks site_submit → modal previewed munis → committed with 3 selected at 5mi.
2. OVIS POSTed `{ message: "..." }` to Cloudflare tunnel → OpenClaw → agent researched.
3. Agent called back via MCP `submit_research_report` with 9 candidate developments → OVIS staged them, transitioned run to `awaiting_review`.
4. User opened approval modal → reviewed → unchecked 3 known dups → clicked Approve & Commit.
5. Each selected row geocoded client-side → approve RPC inserted into `municipal_project` with `centroid` populated.
6. Pins appear on the Municipal Projects map layer with the new "Source" section + provenance footer visible on click.

**v1 of the OVIS market research loop is operationally proven** (one full real-world run end-to-end with real findings). Remaining work is polish (pg_trgm dedup, debounce, OpenClaw correlation parsing) plus the OVIS-wide coordinate-priority audit ([`COORDINATE_RESOLUTION_AUDIT.md`](COORDINATE_RESOLUTION_AUDIT.md)) and the eventual UI ship to production (merge `feature/market-research-agent` → main → Vercel auto-deploys).
