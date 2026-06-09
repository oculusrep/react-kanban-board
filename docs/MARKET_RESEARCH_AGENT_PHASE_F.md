# Market Research Agent — Phase F: Wiring OpenClaw

**Branch:** `feature/market-research-agent`
**Companion docs:** all prior Phase A–E docs; the [V1 plan](MARKET_RESEARCH_AGENT_V1_PLAN.md)
**Status:** Awaiting OpenClaw credentials. Everything below is the operator runbook for the moment those creds land.

This is the final wire-up step. With it, the loop runs end-to-end on a real Starbucks site_submit.

---

## What needs to be configured on each side

### OVIS side — two secrets (Mike sets these)

```bash
supabase secrets set OPENCLAW_TRIGGER_URL=https://<your-openclaw-gateway>/api/research/start
supabase secrets set OPENCLAW_TRIGGER_TOKEN=<bearer-token-OVIS-uses-when-calling-OpenClaw>
```

No code change or redeploy needed after — `ovis-research-trigger` reads `Deno.env.get(...)` per request. Within ~30 seconds of `secrets set`, the next click on "Start Research" stops 503'ing and forwards to OpenClaw.

### OpenClaw side — two credentials (share with the OpenClaw operator)

```
OVIS_MCP_URL=https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-research-mcp
OVIS_MCP_BEARER_TOKEN=5dfd09d1dcde8537d904699a3a7106c5d0feff725cca0239aa88d6e74e13ceab
```

The operator configures their MCP client (Anthropic SDK, custom MCP client, etc.) with these. The MCP server accepts `Authorization: Bearer <token>` and ignores any Supabase apikey/JWT (`verify_jwt = false` is set in `supabase/config.toml` specifically for this endpoint).

To rotate the MCP token at any time: `openssl rand -hex 32 | xargs -I{} supabase secrets set OVIS_MCP_BEARER_TOKEN={}` — then update OpenClaw config. No redeploy.

---

## The loop, end to end

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  User clicks "Start Research" on a Starbucks site_submit                    │
│        │                                                                    │
│        ▼                                                                    │
│  OVIS modal: preview shows munis, user (de)selects, clicks Start            │
│        │                                                                    │
│        ▼                                                                    │
│  OVIS edge function `ovis-research-trigger` (mode='commit'):                │
│    1. Validates user is admin/broker on a Starbucks site                    │
│    2. Verifies every requested muni id is in radius                         │
│    3. Creates research_run + research_checklist_item rows                   │
│       (state='running', frozen scope)                                       │
│    4. POSTs to OPENCLAW_TRIGGER_URL with research_run_id + munis ─┐         │
│                                                                  │         │
│                  ┌───────────────────────────────────────────────┘         │
│                  ▼                                                          │
│         OpenClaw gateway: receives trigger, kicks off the                   │
│         market-research subagent of Prime                                   │
│                  │                                                          │
│                  ▼                                                          │
│         Agent loops over municipalities. For each:                          │
│            - econ-dev email request (sent from alias)                       │
│            - Citizens Portal search                                         │
│            - gap-fill via web search / news / builder sites                 │
│            - POST to OVIS MCP `update_checklist_status` as progress         │
│                                                                             │
│         At end of run:                                                      │
│            POST to OVIS MCP `submit_research_report` (ONE call)             │
│                  │                                                          │
│                  ▼                                                          │
│         OVIS runs server-side dup detection, inserts staging rows,          │
│         transitions run.state='awaiting_review'                             │
│                                                                             │
│         OpenClaw sends Mike a Telegram message: "report ready"              │
│                  │                                                          │
│                  ▼                                                          │
│         Mike opens OVIS site_submit sidebar, sees the run in                │
│         "Market research runs" panel, clicks → approval modal opens         │
│         → edits + selects → Approve & Commit → rows land in                 │
│         municipal_project on the existing map layer                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What OpenClaw receives (trigger POST from OVIS)

**Method:** `POST`
**Headers:** `Authorization: Bearer <OPENCLAW_TRIGGER_TOKEN>`, `Content-Type: application/json`
**Body:**
```json
{
  "ovis_site_submit_id": "62493e64-d428-40cc-acaa-d6ac188d4174",
  "research_run_id":     "ab12cd34-...",
  "lat":  33.7521,
  "lng": -84.6512,
  "radius_miles": 10,
  "triggered_by_user_id": "fe6e516f-11e1-4a3b-b914-910d59d9e8df",
  "municipalities": [
    { "boundary_municipality_id": "...uuid1...", "kind": "city",   "name": "Villa Rica",       "geoid": "1379444", "distance_mi": 6.62 },
    { "boundary_municipality_id": "...uuid2...", "kind": "city",   "name": "Dallas",           "geoid": "1321324", "distance_mi": 8.08 },
    { "boundary_municipality_id": "...uuid3...", "kind": "county", "name": "Paulding County",  "geoid": "13223",   "distance_mi": 8.15 },
    { "boundary_municipality_id": "...uuid4...", "kind": "city",   "name": "Hiram",            "geoid": "1338356", "distance_mi": 8.67 }
  ]
}
```

**`municipalities[]` is the FROZEN scope.** OVIS already created `research_checklist_item` rows for each. The agent must not research anything else — see the "Guards" section below.

**Expected response from OpenClaw:** any HTTP 2xx. If the body is JSON with an `openclaw_run_id` string field, OVIS stores it on `research_run.openclaw_run_id` for correlation. Example:

```json
{ "openclaw_run_id": "oc-2026-06-08-abc123" }
```

If OpenClaw returns non-2xx, OVIS marks the run `state='failed'` and surfaces the error to the user via toast + the past-runs panel. No retry from OVIS — the user can click Start Research again.

---

## What OpenClaw needs to call (OVIS MCP)

The OVIS MCP server speaks JSON-RPC 2.0 over HTTP. Anthropic's MCP SDK and most MCP clients handle this natively — you only need the URL + bearer token.

### MCP handshake (every session)

Standard MCP `initialize` → `notifications/initialized` → `tools/list`. Server info returned:
```
{ "name": "ovis-research-mcp", "version": "0.1.0", "protocolVersion": "2025-03-26" }
```

`tools/list` returns four tools, but in the v1 OVIS-driven orchestration only TWO are used:

| Tool | Used in v1? | Why |
|---|---|---|
| `get_municipalities_in_radius` | No | OVIS already did this and passed the result in the trigger payload. |
| `create_research_checklist` | No | OVIS already created the run + checklist. |
| **`update_checklist_status`** | **Yes** | Mark per-muni progress as the agent works. |
| **`submit_research_report`** | **Yes** | Single batched write of all findings at end of run. |

### Tool: `update_checklist_status`

Call this whenever the agent transitions a muni's research state. Idempotent.

**Arguments:**
```json
{
  "research_run_id": "ab12cd34-...",
  "boundary_municipality_id": "...uuid1...",
  "status": "in_progress",
  "notes": "Sent open records request to econ-dev@villaricaga.gov; awaiting reply"
}
```

`status` ∈ `pending | in_progress | complete | skipped | blocked`. `notes` is optional, free-text — useful for capturing per-muni color (alt avenues, dead ends, blocked-on questions).

### Tool: `submit_research_report` (ONCE per run at the end)

**Arguments:**
```json
{
  "research_run_id": "ab12cd34-...",
  "candidate_records": [
    {
      "boundary_municipality_id": "...uuid1...",
      "project_name": "Cedar Ridge Estates",
      "address": "1234 Cedar Ridge Rd, Villa Rica GA",
      "phase_label": "Phase I",
      "total_housing_units": 142,
      "single_family_lots": 142,
      "townhouse_units": null,
      "duplex_units": null,
      "apt_units": null,
      "cottage_units": null,
      "zoning": "R-1",
      "zoning_approval_date": "2025-11-12",
      "builder_developer": "ABC Homes of GA",
      "permit_url": "https://citizens.villaricaga.gov/permits/LDP-2025-0087",
      "permit_application_date": "2025-11-01",
      "source": "Citizens Portal permit #LDP-2025-0087",
      "notes": "Approved; ground-breaking expected Q1 2026",
      "status_name": "Approved"
    }
  ],
  "needs_review": "Found two news articles mentioning a Phase II but no permit yet — flagged for Mike to follow up.",
  "alt_avenues": "Used Paulding County permit portal directly since the city's wasn't returning recent records."
}
```

**Required per candidate:** `boundary_municipality_id`, `project_name`, `address`, `source`. Everything else nullable.

**`status_name`** (recommended): pass the project status by NAME, case-insensitive. Decision rules for the agent — assign one of the four canonical values per record:

- **"Planning"** — announced, proposed, or pre-approval. Use for: news articles about upcoming subdivisions, builder "coming soon" pages, planning-meeting agendas, applications not yet voted on, anything a source labels "Pending."
- **"Approved"** — formal municipal approval (zoning, plat, etc.) issued, but construction has not visibly started. Permits dated but no ground-breaking yet.
- **"Under Construction"** — work is actively underway. Ground broken, infrastructure being installed, homes in framing/finishing. Look for: recent building permits, news of groundbreaking, recent Citizens Portal status changes.
- **"Recently Completed"** — built out within the last ~2 years. Still relevant as a recent population addition. Older than 2 years → OMIT `status_name` (the record is still captured, just without a status).

If unsure, omit `status_name`. NULL is preferable to a guess. Unknown / misspelled values silently resolve to NULL — your batch won't fail, but the row will be missing status until a reviewer fixes it. Names are case-insensitive and whitespace-tolerant.

`status_stage_id` (UUID) is still accepted for callers that already know the UUID — if both are supplied, `status_stage_id` wins.

**Single call per run.** Re-submitting on the same `research_run_id` would insert duplicate staging rows (no idempotency at the RPC level). The agent's contract is: ONE submit at end of run.

---

## Guards — what the MCP will reject

### Off-checklist municipalities (HARD reject, layer-3 SQL guard)

If `submit_research_report` is called with ANY `candidate_records[i].boundary_municipality_id` that isn't on the run's checklist, the whole batch is rejected with:

```
off_checklist_municipalities: 1 candidate(s) reference muni(s) not on this
run's checklist; offending boundary_municipality_ids: {...}
```

Zero staging rows are written. The agent must resubmit a clean payload referencing only the `municipalities[]` IDs it received in the trigger.

**Why this exists:** the user-frozen scope is enforced server-side. If the agent decides to research extra munis off the checklist, it physically cannot write findings into OVIS.

### Missing required fields

`boundary_municipality_id`, `project_name`, `address`, `source` are required. Omitting any will fail the batch with a clear error.

### Wrong auth

- Missing `Authorization: Bearer ...` header → `401 Unauthorized`
- Wrong token value → `401 Unauthorized`
- Mismatched `OVIS_MCP_BEARER_TOKEN` (e.g. rotated server-side but agent still on old) → `401 Unauthorized`

### Server-side dup detection

Not a reject — just metadata. For each candidate, OVIS runs:

```
match_key = (resolved_municipality_id, lower(trim(project_name)), lower(trim(address)))
```

against existing `municipal_project` rows. If a match is found, the staging row gets `matched_existing_id` set, and the approval UI shows a "MATCHES EXISTING" badge. On approve, OVIS skips creating a duplicate row (audit-only).

Currently exact-match only. Fuzzy matching (`pg_trgm` similarity) is a v1.1 enhancement if the first real run shows real false negatives ("Winder Crossing" vs "Winder Crossing Subdivision").

---

## Curl smoke tests the OpenClaw operator can run

Sanity-check the wire BEFORE the first real run.

### 1. MCP server up + auth working

```bash
TOKEN="5dfd09d1dcde8537d904699a3a7106c5d0feff725cca0239aa88d6e74e13ceab"
URL="https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-research-mcp"

# Without auth → expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
# expected: 401

# With auth → expect 200 + server info
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | python3 -m json.tool
# expected: { "result": { "protocolVersion": "...", "serverInfo": { "name": "ovis-research-mcp", ... } } }
```

### 2. tools/list returns the four tools

```bash
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | python3 -c "import sys, json; print([t['name'] for t in json.load(sys.stdin)['result']['tools']])"
# expected: ['get_municipalities_in_radius', 'create_research_checklist', 'update_checklist_status', 'submit_research_report']
```

### 3. (After Mike triggers a real run) update_checklist_status works

The agent will have a real `research_run_id` from the trigger payload. As a smoke test against a fake one to confirm the path:

```bash
curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{"name":"update_checklist_status","arguments":{
      "research_run_id":"00000000-0000-0000-0000-000000000000",
      "boundary_municipality_id":"00000000-0000-0000-0000-000000000000",
      "status":"in_progress"
    }}
  }' | python3 -m json.tool
# expected: { "result": { "content": [{"type":"text", "text":"..."}], "isError": true } }
# isError=true is correct here — the IDs are fake. Real call would isError=false.
```

---

## First real run — verification playbook

Once the two `OPENCLAW_*` secrets are set on Supabase AND OpenClaw is configured with the MCP creds, do one of these end-to-end:

### Quick path — Villa Rica (5 munis at 10mi)

1. Mike: open OVIS, navigate to "Villa Rica Hwy 2 Tenant Building - Starbucks" (`62493e64-d428-40cc-acaa-d6ac188d4174`), click Start Research, select 10mi radius, leave all 5 munis checked, click Start.
2. OVIS toast: "Research started on 5 municipalities — OpenClaw is working on it."
3. Past Runs panel: a new row appears, state badge = `Running`.
4. OpenClaw side: should see the trigger POST land within ~1s. Agent kicks off.
5. Wait. The agent's actual research could take 10–60 minutes depending on the protocol depth.
6. As the agent works, the checklist statuses update (visible if you re-open the approval modal).
7. When the agent is done, the row state changes to `Awaiting review`. Mike receives Telegram notification.
8. Mike clicks the row → approval modal opens. Reviews findings, edits as needed, picks rows, clicks Approve & Commit.
9. Toast: "Approved N new + M already existed". Promoted rows show up on the existing municipal_project map layer.

### Richer test — Braselton (11 munis, hits 4 counties)

Same procedure as above but use site_submit `e93fe5e7-ee8e-49d7-ac69-4be56110a993` (Funari Pads in Braselton). The 11-muni scope covers Barrow, Jackson, Gwinnett, and Hall counties — high-signal test of the spec §10 cases.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Trigger button click → toast: "OPENCLAW_TRIGGER_URL and OPENCLAW_TRIGGER_TOKEN must be set" | OpenClaw secrets not set on Supabase | `supabase secrets set OPENCLAW_TRIGGER_URL=...` and `OPENCLAW_TRIGGER_TOKEN=...` |
| Trigger click → toast: "OpenClaw rejected" with 4xx | OpenClaw bearer token mismatch or payload schema drift | Verify `OPENCLAW_TRIGGER_TOKEN` matches what OpenClaw expects; verify the trigger payload schema matches what OpenClaw parses |
| Trigger click → toast: "OpenClaw unreachable" | DNS / network / OpenClaw down | Test `curl $OPENCLAW_TRIGGER_URL` from anywhere with the token; check OpenClaw gateway logs |
| Past Runs panel: row stuck in `Running` forever | OpenClaw started but never submitted, OR OpenClaw failed silently and didn't update state | Check OpenClaw logs for the `research_run_id`. There's no automatic timeout in v1 — Mike can re-trigger if needed. Future enhancement: a cron job marks runs `failed` after N hours stuck. |
| `submit_research_report` returns `off_checklist_municipalities` | Agent submitted a candidate referencing a muni not in the original trigger payload's `municipalities[]` | Agent code bug. Rebuild the candidate payload using only the boundary_municipality_ids from the trigger input. |
| Approval modal shows "MATCHES EXISTING" for everything | Agent re-discovered already-imported records (CSV-imported developments) | Expected if the agent is doing its job. Mike can deselect them safely — the run still has its audit trail and the canonical table doesn't get duplicated. |
| First real run produces zero findings | Either no permit activity in this radius OR agent's research protocol hitting dead ends consistently | Re-run with a wider radius or different site. Check OpenClaw's per-muni notes in the approval modal — those will explain what the agent tried. |

---

## Defaulted without asking (worth flagging in PR)

- **No retry on OpenClaw failure.** If the POST to OpenClaw fails (DNS, 5xx, timeout), OVIS marks the run `failed` and surfaces the error. The user can re-click Start Research. Auto-retry could be added but adds complexity around dedup of triggers.
- **No idempotency key on the trigger.** Two rapid clicks of "Start Research" would create two `research_run` rows and POST to OpenClaw twice. The orchestration pivot intentionally lets each click be its own audit trail row — desirable for the "research the skipped munis later" pattern. If accidental double-clicks become a problem, debounce in the UI.
- **OpenClaw's response is forwarded verbatim to the browser if non-2xx.** Useful for debugging. Could be sanitized if OpenClaw includes anything sensitive in error bodies.
- **No "test trigger" mode.** Once the secrets are set, every click is real. If you want a dry-run, set `OPENCLAW_TRIGGER_URL=https://httpbin.org/post` temporarily — it 200s back with the echoed payload, and OVIS will store its response as `openclaw_run_id` (will be a non-uuid string, which is fine — the field is text).

---

## After Phase F: the loop is complete

The market research agent has every OVIS-side piece:

- Phase A: boundary dataset (GA counties + cities)
- Phase B: schema for runs, checklists, staging
- Phase C: MCP server (4 tools)
- Phase D: trigger UI + preview/checkbox flow + 3-layer scope freeze
- Phase E: approval modal + promotion RPCs + dup prevention
- **Phase F: OpenClaw wired up + verified end-to-end on a real Starbucks site**

The v1.1 / polish backlog (deferred until first real run flushes them out):
- pg_trgm fuzzy dup matching
- `update_research_run_narrative` RPC for `needs_review` edits
- Tier 1 of [`COORDINATE_RESOLUTION_AUDIT.md`](COORDINATE_RESOLUTION_AUDIT.md) (map layer files)
- Extract `resolveSiteCoords()` helper
- Auto-failed-after-N-hours cron for stuck runs
- Other states beyond GA in the boundary dataset
- Email-inbox reading (v1.1 highest-leverage automation, explicitly deferred per V1 plan decision #2)
