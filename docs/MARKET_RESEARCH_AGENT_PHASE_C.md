# Market Research Agent — Phase C: MCP Edge Function

**Branch:** `feature/market-research-agent`
**Companion docs:** [`MARKET_RESEARCH_AGENT_V1_PLAN.md`](MARKET_RESEARCH_AGENT_V1_PLAN.md) (Phase C), [`market-research-agent-spec.md`](market-research-agent-spec.md) §8

Phase C ships the live MCP server that OpenClaw calls. The four tools defined in spec §8 are now reachable over MCP-over-HTTP. End-to-end smoke test (`initialize` → `tools/list` → all four `tools/call`) passed against the deployed function on 2026-06-08.

---

## What this phase adds

| File | Purpose |
|---|---|
| `supabase/migrations/20260607120000_market_research_mcp_rpcs.sql` | Three SECURITY DEFINER RPCs that back the heavier tools. Lockd down to `service_role`. |
| `supabase/functions/ovis-research-mcp/index.ts` | The edge function: JSON-RPC 2.0 dispatcher + 4 MCP tools + bearer-token auth. |
| `supabase/config.toml` (edited) | `[functions.ovis-research-mcp] verify_jwt = false` — auth is bearer-token, not Supabase JWT. |

---

## Endpoint

```
POST https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-research-mcp
```

Headers OpenClaw sends:
```
Authorization: Bearer <OVIS_MCP_BEARER_TOKEN>
Content-Type: application/json
```

Body: standard JSON-RPC 2.0. Supports single requests AND batched arrays. Notifications (no `id`) get `202 No Content`.

`GET /` returns `{ serverInfo, protocolVersion, transport }` for health-check; the tool list itself is auth-gated and only available via `tools/list`.

---

## The four tools

| Tool | Backing | Atomicity |
|---|---|---|
| `get_municipalities_in_radius` | RPC `get_municipalities_in_radius_for_site` | read-only; resolves site lat/lng via `COALESCE(verified, sf_property)` then ST_DWithin |
| `create_research_checklist` | RPC `create_research_run_with_checklist` | atomic — research_run + N checklist items in one transaction |
| `update_checklist_status` | direct supabase-js update | single-row UPDATE; idempotent |
| `submit_research_report` | RPC `submit_research_report` | atomic batched write + server-side dup detection + state transition to `awaiting_review` |

Tool input schemas live in `TOOLS` array in [supabase/functions/ovis-research-mcp/index.ts](supabase/functions/ovis-research-mcp/index.ts). Each is a proper JSON Schema the agent's MCP client can read via `tools/list`.

### Dup detection (spec §7 + V1 plan)

`submit_research_report` runs dup detection server-side as part of the batched INSERT, so the agent never has to know about existing rows. The match key is:

```
(municipality_id, lower(btrim(project_name)), lower(btrim(address)))
```

where `municipality_id` is resolved by case-insensitive name match against `municipality` (via `boundary_municipality.name`). If a match is found, `municipal_project_staging.matched_existing_id` is populated; the approval UI (Phase E) will show a "MATCHES EXISTING" badge.

If no `municipality` row exists for that boundary yet (likely for any city other than Winder/Hoschton/Barrow County/Jackson County/Carrollton currently), `matched_existing_id` stays NULL — promotion (Phase E) will auto-create the municipality at Approve & Commit time per the locked-in decision.

---

## Apply + deploy

```bash
# 1) Migration (RPCs)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260607120000_market_research_mcp_rpcs.sql
psql "$DATABASE_URL" \
  -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20260607120000','market_research_mcp_rpcs');"

# 2) Set the bearer token secret (one-time)
supabase secrets set OVIS_MCP_BEARER_TOKEN=<generated_token>

# 3) Deploy
supabase functions deploy ovis-research-mcp --no-verify-jwt
```

Applied + deployed on 2026-06-08. Token was generated via `openssl rand -hex 32` and shared with you separately for OpenClaw config. To rotate: regenerate, `supabase secrets set OVIS_MCP_BEARER_TOKEN=<new>`, update OpenClaw, no code change or redeploy needed.

---

## Smoke test results (2026-06-08)

All seven gates passed:

| # | Test | Result |
|---|---|---|
| 1 | `POST /` with no `Authorization` header | `401 Unauthorized` ✓ |
| 2 | `initialize` | `protocolVersion: "2025-03-26"`, `serverInfo.name: ovis-research-mcp` ✓ |
| 3 | `tools/list` | All 4 tool names returned ✓ |
| 4 | `tools/call get_municipalities_in_radius` (site_id=3900fe70…, radius=10) | 3 munis: Cedartown 0.15mi → Polk County 4.28mi → Cave Spring 7.92mi ✓ |
| 5 | `tools/call create_research_checklist` | research_run inserted, 3 checklist items, state=`running` ✓ |
| 6 | `tools/call update_checklist_status` | First checklist item → `in_progress`, notes saved ✓ |
| 7 | `tools/call submit_research_report` | 1 staging row inserted, run → `awaiting_review`, needs_review + alt_avenues saved ✓ |

Test run was cascade-deleted afterward; `research_run` table is back at 0 rows.

---

## Design decisions locked in

### MCP error handling: tool failures are `result.isError=true`, not JSON-RPC errors
Per MCP convention, an error executing a tool (e.g., site not found, bad arguments) comes back as a normal `tools/call` response with `result.isError = true` and the error message inside `result.content[0].text`. JSON-RPC `error` is reserved for protocol-level failures (unknown method, bad params at the dispatcher level). This lets the agent reason about a tool failure (retry, fall back, escalate) rather than have its MCP client abort the run.

### Server-side dup detection (not agent-side)
The agent never queries `municipal_project` directly. All dup-detection logic lives inside `submit_research_report`. Three reasons:
1. Saves agent tokens — the matching list could be hundreds of rows.
2. Lets us tune the match algorithm (currently exact normalized match; future `pg_trgm` similarity) without changing the agent.
3. Atomic — staging rows can never end up in an inconsistent "we already had this" state vs. what's in `municipal_project`.

### `verify_jwt = false`
The MCP server intentionally skips Supabase JWT verification. Auth is the bearer token alone, validated inside the function. OpenClaw is a server-to-server caller, not a logged-in user — minting a Supabase user JWT for it would be ceremony for no security gain. The bearer token, stored as a Supabase secret + scoped to one function, IS the security boundary.

### Service-role for writes
The edge function uses `SUPABASE_SERVICE_ROLE_KEY` and writes bypass RLS. Acceptable because:
1. The function is only callable with the bearer token.
2. The RPCs are `SECURITY DEFINER` with `GRANT EXECUTE ... TO service_role` only — no other path to invoke them.
3. All writes are constrained by `CHECK`s, FK references, and explicit column lists in the RPC SQL — there's no general "INSERT anything" capability exposed.

### v1 limit: GA-only inside `get_municipalities_in_radius_for_site`
The RPC has `WHERE bm.state = 'GA'` hardcoded. Matches Phase A's boundary backfill scope. When you backfill other states, drop the WHERE clause or parameterize it — single one-line change.

### Single batched write at end-of-run
`submit_research_report` accepts the entire `candidate_records` array in one call. This is explicit in spec §8 ("the single batched write — one call, not one-per-record"). The RPC processes the entire batch as one CTE chain inside one INSERT, so even 100+ records is one round-trip + one transaction.

---

## Defaulted without asking (flag in PR review)

- **MCP protocol version `2025-03-26`** — the version Anthropic's SDK currently advertises. If OpenClaw is on a different version, the handshake still works (versions are informational, not strict) but worth noting.
- **`update_checklist_status` does NOT silently insert** when no matching row exists. It returns an error from the supabase-js `.single()` call. This is intentional — if the agent calls this without first creating the checklist, that's a bug worth surfacing.
- **`update_checklist_status` does NOT touch `created_at`** — only `status` (and optional `notes`). The trigger handles `updated_at`.
- **`submit_research_report` is single-shot per run** — calling it twice on the same `research_run_id` would insert duplicate staging rows and re-fire the state transition (idempotency was not designed in). The agent's contract is one submit per run. If we ever want resubmit, gate on `research_run.state IN ('running')`.
- **Tool input schemas are descriptive but loose** — most numeric fields accept `null` so the agent doesn't have to omit keys for "data not found." String fields like `permit_url` are `string`/`null` rather than strict URI format because the agent will sometimes record "verbal only — see meeting minutes".
- **No streaming responses** — the JSON-RPC over plain HTTP path. MCP Streamable HTTP supports SSE for long-running tools, but our tools are all sub-second. Trivial to add if a future tool needs it.
- **The function does NOT log requests** beyond standard Supabase edge function logs. If you want a per-call audit log (for billing OpenClaw or debugging), add a `mcp_request_log` table in a follow-up.

---

## What this phase deliberately does NOT do

- **No promotion RPC** (`approve_research_staging_row` / auto-create-municipality logic). That's Phase E.
- **No trigger UI** — the "Start Research" button on the site_submit sidebar that POSTs to OpenClaw's `/api/research/start`. That's Phase D.
- **No approval UI / slideout.** Phase E.
- **No Telegram routing.** OpenClaw owns all Telegram messaging.
- **No retry / backoff** on supabase-js calls inside the function. Edge functions don't get many transient failures against the local Postgres; if one happens, the JSON-RPC error surface is enough for OpenClaw to reason about.

---

## Open items for Phase D + E

1. **OpenClaw URL / token wiring.** When Mike provides `OPENCLAW_TRIGGER_URL` + `OPENCLAW_TRIGGER_TOKEN`, Phase D's "Start Research" button POSTs to it.
2. **Sharing `OVIS_MCP_BEARER_TOKEN` with the OpenClaw operator.** It's in Supabase secrets; the operator needs the value for OpenClaw's MCP client config. Out-of-band share, one-time.
3. **`pg_trgm` similarity for dup detection.** v1 ships with exact normalized match. If first real run shows false negatives ("Winder Crossing" vs "Winder Crossing Subdivision"), add `pg_trgm` `<%>` similarity to `submit_research_report`'s match query.
4. **Run lifecycle cleanup.** Runs stuck in `pending`/`running` after N hours should auto-`failed`. Phase F or a small cron job.
