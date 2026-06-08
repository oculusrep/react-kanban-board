# Market Research Agent — Phase D: Trigger UI

**Branch:** `feature/market-research-agent`
**Companion docs:** [`MARKET_RESEARCH_AGENT_V1_PLAN.md`](MARKET_RESEARCH_AGENT_V1_PLAN.md) (Phase D), [`market-research-agent-spec.md`](market-research-agent-spec.md) §8 (trigger endpoint)

Phase D ships the user-facing trigger surface: the "Start Research" button on the Starbucks site_submit sidebar, the radius-picker modal, the "Past Research Runs" panel, and the edge function that proxies the click to OpenClaw with the bearer token kept server-side.

---

## What this phase adds

| File | Purpose |
|---|---|
| `supabase/functions/ovis-research-trigger/index.ts` | Browser-facing trigger. Validates the click (Starbucks, admin/broker, has lat/lng), then POSTs to OpenClaw with `OPENCLAW_TRIGGER_TOKEN` in `Authorization`. Returns OpenClaw's response. |
| `src/components/shared/StartResearchModal.tsx` | Radius-picker modal (3 / 5 / 10 / 15 mi, default 10) using OVIS brand palette. Calls the edge function via `supabase.functions.invoke`. |
| `src/components/shared/PastResearchRunsPanel.tsx` | Lists all `research_run` rows for the current site_submit, newest first, with state badges + checklist/staging counts. |
| `src/components/shared/SiteSubmitSidebar.tsx` (edited) | Imports the two new components, adds the icon button to the existing action bar (Starbucks + admin/broker + has-lat/lng gated), renders the modal and the panel. |

No backing migration or schema changes — Phase D uses Phase B's `research_run` table as-is.

---

## How it looks

The site_submit sidebar's existing icon-button row gains a new entry between "Convert to Deal" and "Delete", styled with the Deep Midnight Blue brand color (`#002147`). The icon is a clipboard-with-checkmark. It only renders when **all three** of these are true:

- `siteSubmit.client_id === '39933b5b-3e8c-438d-be2f-e48cd9228c00'` (Starbucks)
- `userRole ∈ {admin, broker}` (from `useAuth()`)
- The property has any of `verified_latitude` / `latitude` (so the radius query has something to work with)

Below the data tab, a new "Market research runs" section renders the past-runs panel — visible whenever the action is visible, so users see history alongside the trigger.

---

## Apply + deploy

```bash
supabase functions deploy ovis-research-trigger
```

No `--no-verify-jwt` flag — the function intentionally requires a valid Supabase user JWT (the user is the trigger source, identity matters).

No config.toml edit — `verify_jwt = true` is the default, which is what we want here. (Compare to the MCP function in Phase C which explicitly disables it because OpenClaw isn't a Supabase user.)

Deployed on 2026-06-08 at:
```
POST https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-research-trigger
```

### Setting the OpenClaw env secrets (when ready)

The function gracefully 503s with `openclaw_not_configured` until both secrets are set. To wire OpenClaw in:

```bash
supabase secrets set OPENCLAW_TRIGGER_URL=https://<your-openclaw-host>/api/research/start
supabase secrets set OPENCLAW_TRIGGER_TOKEN=<openclaw-bearer-token>
```

No code change or redeploy needed after setting secrets — the function reads `Deno.env.get(...)` per request.

**Forward payload to OpenClaw** (what the gateway will receive):

```json
{
  "ovis_site_submit_id": "uuid",
  "lat": 33.99,
  "lng": -83.72,
  "radius_miles": 10,
  "triggered_by_user_id": "uuid"
}
```

OpenClaw should respond with at least HTTP 2xx; the body is forwarded verbatim to the browser. Conventional reply would be `{ "openclaw_run_id": "..." }` for correlation.

---

## Smoke test results (2026-06-08)

| # | Test | Expected | Got |
|---|---|---|---|
| 1 | POST with no `Authorization` header | 401 from Supabase boundary | `401 UNAUTHORIZED_NO_AUTH_HEADER` ✓ |
| 2 | POST with anon JWT (no user identity) | 401 from inside function (`invalid_jwt`) | ✓ |
| 3 | OPTIONS preflight | 200 + CORS headers | ✓ |
| 4 | GET | 401 from Supabase boundary | ✓ |

**End-to-end test (button click in browser)** requires a logged-in admin/broker session and is deferred to manual verification. Expected flow with OpenClaw env unset:

1. Sign into OVIS as admin/broker.
2. Open a Starbucks site_submit (e.g. one in Cedartown GA).
3. Confirm the clipboard icon appears in the sidebar action bar.
4. Click → modal appears with 4 radius preset buttons (10 mi pre-selected).
5. Click "Start Research (10 mi)" → toast: "Research started — OpenClaw is working on it." OR error toast surfacing `openclaw_not_configured` (depending on whether env is set).
6. "Market research runs" panel below the data tab refreshes; new run appears with state badge once OpenClaw eventually calls MCP `create_research_checklist`.

---

## Design decisions locked in

### Inline icon button, not a 7th tab
The site_submit sidebar already has 5 tabs (data / chat / files / contacts / tasks). Per the `feedback_slideout_tab_overflow` memory note ("slideout tab strips shouldn't horizontally scroll"), the trigger goes in the existing icon button row in the header — same pattern as Email / Notify Client / Convert to Deal / Delete.

### Server-side trigger proxy, not direct browser → OpenClaw
The OpenClaw bearer token can NEVER touch the browser. Browser → OVIS edge function (auth: Supabase JWT) → OpenClaw (auth: bearer token from server env). This is the only sane shape.

### Identity flows through, role-gated server-side
The browser sends the user's Supabase JWT. The function:
1. Verifies the JWT via the anon client's `auth.getUser`.
2. Reads the user's `ovis_role` via the service-role client.
3. Rejects with 403 if role is not admin or broker.
4. Forwards the user id to OpenClaw as `triggered_by_user_id` so the agent's downstream artifacts can be attributed.

This is a real defence-in-depth pattern: the UI hides the button when ineligible, AND the server rejects ineligible callers (a curl-equipped attacker can't bypass).

### Starbucks gate via hardcoded client_id
`STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00'` is duplicated in:
- `supabase/functions/ovis-research-trigger/index.ts` (server gate)
- `src/components/shared/SiteSubmitSidebar.tsx` (UI gate)

Both reference the constant explicitly. If Starbucks is ever renamed/replaced in the DB, both sites need updating. Alternative would be a per-client `enable_market_research` flag on the `client` table — out of scope for v1 but flagged for a future generalization pass.

### OVIS brand palette in the modal + panel
Modal and panel use only the four brand colors per CLAUDE.md:
- Deep Midnight Blue `#002147` for primary action (Start button, selected radius preset)
- Steel Blue `#4A6B94` for secondary text + run details
- Light Slate Blue `#8FA9C8` for borders, inactive states, "no runs yet" placeholder
- Pure White `#FFFFFF` for surfaces
- Terracotta `#A27B5C` for "Awaiting review" + error messaging (warning indicator, border-style emphasis)

### Past Runs panel renders only when the action is available
If you can't trigger, you can't see history either. Keeps the data tab clean for non-Starbucks site_submits. Adjustable if Mike wants the history visible to read-only viewers later.

### Past Runs panel does its own counting
Two cheap follow-up queries (`research_checklist_item` + `municipal_project_staging`) tally counts per run. Not a view because the counts are visible only in one place — building a view for one consumer would be premature.

---

## Defaulted without asking (flag in PR review)

- **Run row click navigation:** the past-runs panel doesn't yet navigate anywhere on click. The approval slideout / detail view is Phase E; until then, the rows are display-only.
- **Polling vs. realtime:** the panel re-fetches only when `refreshTrigger` changes (after a successful trigger click) or when the sidebar opens. No live updates. If a run transitions states while the sidebar is open, the user has to manually re-open or trigger a new run to see the change. If this is annoying in practice, add a Supabase Realtime subscription on `research_run` filtered by site_submit_id.
- **No "in-flight" busy indicator on the action button** — the disabled-while-submitting state lives inside the modal. The icon button itself doesn't show a spinner if a run is currently `pending` or `running`. Could add later.
- **Modal radius help text mentions 10–15 mi for rural sites** — V1 plan's CHECK constraint allows 1..50; the modal only presets 3/5/10/15. If someone needs 20 mi they'd need a different UI affordance. Not building it until someone asks.
- **Toast says "OpenClaw is working on it."** even if env isn't configured — the error path surfaces the 503 detail as the error toast instead. Two different toasts depending on outcome.
- **No write to `research_run` from the trigger function** — the agent creates the run via MCP `create_research_checklist`. This means there's a small window (trigger click → agent ack) where the user sees no row in the Past Runs panel. Acceptable for v1; if it confuses users, add a placeholder `pending` row written by the trigger function (and modify the MCP tool to attach checklist to existing run rather than create a new one).

---

## What this phase deliberately does NOT do

- No promotion RPC, no approval slideout, no Approve & Commit flow — Phase E.
- No auto-create-`municipality`-row logic — Phase E (decision #10 in V1 plan).
- No `OPENCLAW_TRIGGER_URL` / `OPENCLAW_TRIGGER_TOKEN` set — those land via `supabase secrets set` when OpenClaw is ready.
- No client-side TypeScript types generated from the new Phase B/C tables. The UI uses inline interface shapes that mirror what the queries actually return.
- No state-transition cron for stuck runs.
- No telemetry / per-trigger logging beyond Supabase function logs.

---

## Open items for Phase E

1. **Promotion RPC** — given an approved staging row, INSERT into `municipal_project` and update staging.approval_state. With auto-create-`municipality` (find-or-create by case-insensitive name match against `boundary_municipality.name`) per locked decision #10.
2. **Approval slideout/overlay** — per CLAUDE.md overlay-first principle. Lists checklist + grouped staging records + needs_review free-text + the Approve & Commit footer.
3. **"Click on past run row → open approval view"** — depends on what the approval surface ends up looking like.
4. **OpenClaw URL/token wiring** — out-of-band. Set the two Supabase secrets and the trigger works end-to-end.
