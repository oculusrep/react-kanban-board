# Site Research — Background Runs (Design)

**Status: DESIGN, for review. Nothing built.** Written 2026-09-15.

## Why

Every v4 and v5 Step 1 run has returned `504 IDLE_TIMEOUT` to the browser:

| Run | Request | 504 at | Loop finished | Result |
|---|---|---|---|---|
| Johnson Ferry (v4) | 2026-09-14 17:00:45 | 150,278 ms | 17:03:17 (~152 s) | saved after the 504 |
| Macon (v5) | 2026-09-15 13:15:41 | 150,221 ms | 13:18:43 (~182 s) | saved after the 504 |

Both survived only because the worker kept running after the connection closed. A run past the
**400 s wall-clock limit** would be killed mid-loop: the thread stays `active` with no report and
the `failed` handler never runs.

## Core idea

Reuse the Deep-Sweep engine's shape (DB state machine + transactional advance/claim RPCs + a
per-minute cron tick with a vault-secret-authenticated edge call + a reaper), with one
simplification that our situation earns:

- **One model iteration per invocation.** Each invocation claims the run, sends one model request,
  executes that response's tool calls, persists everything, and self-chains the next invocation.
  An iteration measured ~60 s on Macon (3 iterations in ~182 s), far below both the 150 s idle
  timeout and the 400 s wall clock, so no invocation ever lives long enough to be killed. A worker
  that does die loses at most the one iteration in flight.
- **Death is provable here, so no quarantine/cooldown.** The sweep quarantines a silent chunk
  because an OpenClaw agent may still be alive and OVIS cannot observe it. Our worker is our own
  edge function, which the platform hard-kills at 400 s. A run whose lease has expired (400 s + a
  margin) has no live worker, by construction. The tick re-kicks it from its last persisted state.
- **The cron tick is the backstop, not the driver.** Workers self-chain for speed (no one-minute
  gaps between iterations). The tick exists to re-kick runs whose chain broke and to reap runs that
  can't recover.

The same engine runs `create_thread`, follow-up turns (`send_turn` has the same 504 exposure once
tools are involved), and Step 2's deep pass (as a run kind with phases).

## Functions

| Function | Auth | Does |
|---|---|---|
| `ovis-site-research` (existing) | User JWT (unchanged posture) | Validates, freezes `pinned_context`, inserts the thread and a `queued` run, returns **202** `{thread_id, run_id}`, kicks the worker. `send_turn` likewise inserts the user message + a run. |
| `ovis-site-research-worker` (new) | `verify_jwt` off; `X-Worker-Secret` compared against a vault secret via RPC — the exact `ovis-sweep-tick` / `get_sweep_tick_secret` pattern | `advance_run {run_id}`: claim → one iteration → persist → self-chain or finalize. `tick`: re-kick + reap. |

`loop.ts`, `tools.ts`, `nces-config.ts` move to `supabase/functions/_shared/site-research/` so both
functions import them. The worker responds 202 immediately and does the iteration inside
`EdgeRuntime.waitUntil`, so the caller (the public function or the tick) never waits on it.

A separate cron job `ovis-site-research-tick` (every minute) with its own vault secret. Not folded
into `ovis-sweep-tick` — same mechanism, unrelated feature.

## State machines

**`research_thread_run.state`** (new table — the precise state):

```
queued ──claim──▶ running ──loop done──▶ complete
   ▲                 │  │
   │   lease expired │  └──unrecoverable error / attempts exhausted──▶ failed
   └──(tick re-kick)─┘
queued|running ──user cancel──▶ cancelled
```

**`research_thread.state`** (existing column, extended) — what the UI keys on:

`queued` → `running` → `complete` | `failed`, plus `archived`. It mirrors the thread's live run:
`running` while any run is live; when a run ends, `complete` if the thread has a seq-0 report,
otherwise `failed`. A failed *follow-up* turn leaves the thread `complete` — its report is still
valid — and the turn's error is on the run. Existing `active` rows (all have reports) backfill to
`complete`.

## Schema (one migration)

```sql
-- research_thread.state: queued | running | complete | failed | archived  ('active' -> 'complete')

CREATE TABLE research_thread_run (
  id                   uuid PK,
  thread_id            uuid NOT NULL REFERENCES research_thread ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('archetype','turn','deep_pass')),
  target_seq           int  NOT NULL,          -- the message seq this run will write
  prompt_template_id   uuid REFERENCES prompt_template,
  state                text NOT NULL CHECK (state IN ('queued','running','complete','failed','cancelled')),
  phase                text,                   -- 'setup' | 'researching' | 'writing' | (deep pass phases later)
  iteration            int  NOT NULL DEFAULT 0,
  convo                jsonb NOT NULL,         -- full message history incl. assistant blocks verbatim
  search_budget        int  NOT NULL,
  web_search_requests  int  NOT NULL DEFAULT 0,
  input_tokens bigint, output_tokens bigint,
  cost_usd             numeric(10,6) NOT NULL DEFAULT 0,  -- tokens + search fees
  lease_owner          uuid,
  lease_expires_at     timestamptz,
  heartbeat_at         timestamptz,
  attempts             int  NOT NULL DEFAULT 0, -- consecutive failed attempts at the current iteration
  max_attempts         int  NOT NULL DEFAULT 3,
  error                text,
  created_by uuid, created_at, started_at, finished_at timestamptz
);
-- one live run per thread (mirrors one_live_run_per_site)
CREATE UNIQUE INDEX ... ON research_thread_run (thread_id) WHERE state IN ('queued','running');

CREATE TABLE research_thread_run_step (       -- per-iteration log (item 4)
  run_id uuid REFERENCES research_thread_run ON DELETE CASCADE,
  iteration int, attempt int,
  started_at, finished_at timestamptz,
  stop_reason text, client_tool_calls int, web_search_requests int,
  input_tokens bigint, output_tokens bigint, cost_usd numeric(10,6),
  error text,
  UNIQUE (run_id, iteration, attempt)
);

CREATE TABLE research_thread_tool_result (    -- D1 (item 5)
  id uuid PK,
  thread_id uuid REFERENCES research_thread ON DELETE CASCADE,
  run_id    uuid REFERENCES research_thread_run ON DELETE CASCADE,
  iteration int,
  tool_use_id text NOT NULL,
  tool_name text NOT NULL,
  input jsonb NOT NULL, output jsonb, is_error boolean NOT NULL DEFAULT false,
  created_at timestamptz,
  UNIQUE (run_id, tool_use_id)                -- a resumed iteration upserts, never duplicates
);

-- research_thread_message: + web_search_requests int  (the count, not just the dollars)
```

RLS as the existing research tables: `SELECT` to authenticated, no write policies, writes via
service role. Add `research_thread`, `research_thread_run`, `research_thread_message` to the
`supabase_realtime` publication (see "Realtime" below).

## RPCs

- **`claim_thread_run(p_run_id, p_owner uuid, p_lease_seconds int)`** — per-run advisory lock;
  claims only if `state IN ('queued','running')` and the lease is null or expired; sets
  `state='running'`, `lease_owner`, `lease_expires_at`, `heartbeat_at`, increments `attempts`.
  Returns the run row or null. The lease is the idempotency guard: a self-chain and a tick re-kick
  arriving together cannot both run an iteration.
- **`complete_thread_step(...)`** — in one transaction: append the response to `convo`, bump
  `iteration`, add usage/cost/search counts, reset `attempts`, write the step row, extend
  `heartbeat_at`, release the lease. (Tool results are written as each tool returns, before this.)
- **`finalize_thread_run(...)`** — insert the message at `target_seq`, parsed archetype columns
  (kind `archetype` / revised in `turn`), `state='complete'`, thread state recomputed.
- **`fail_thread_run(p_run_id, p_error)`** — terminal failure; thread state recomputed.
- **`advance_thread_runs()`** (tick) — returns runs to re-kick: `queued` with no lease older than
  1 min, or `running` with `lease_expires_at < now()` and `attempts < max_attempts`. Runs with an
  expired lease and `attempts >= max_attempts` → `fail_thread_run` ("worker died N times at
  iteration k").
- **`reap_stalled_thread_runs(p_idle_minutes DEFAULT 20)`** (item 2) — any `queued|running` run with
  `heartbeat_at` (or `created_at`) older than the threshold → failed. The backstop for anything the
  re-kick logic can't see (cron itself down, a bug). Same name/shape as
  `reap_orphaned_research_runs`.

## Thresholds

| Setting | Value | Why |
|---|---|---|
| Lease | 7 min | 400 s hard wall clock + 3 min margin: past this, no worker can still be holding it. |
| Max attempts per iteration | 3 | A resumed iteration re-sends one model request (re-billed); caps the damage of a repeatable crash. |
| Reaper idle | 20 min | Well past lease (7) × a missed tick or two; never fires on a healthy run, whose heartbeat moves every ~60 s. |
| Model loop ceiling | unchanged, 15 iterations | now counted across invocations via `iteration`. |
| Search budget | unchanged, 12 (Step 1) | now counted from the persisted `web_search_requests`, so it survives worker restarts. |

## Resume safety

- Died **during the model request**: the tick re-kicks; the same request is re-sent. Re-billed, but
  nothing persisted twice.
- Died **after the response, during tool execution**: the response was not yet committed to
  `convo`, so the iteration re-runs the model request. Tools are read-only; any tool results already
  written are upserted on `(run_id, tool_use_id)`. A re-sent request may produce different
  `tool_use_id`s — those are new rows for the same iteration, distinguished by `attempt`.
- Died **during finalize**: `UNIQUE (thread_id, seq)` on the message makes the retry a no-op.
- Assistant content is stored **verbatim** in `convo` (thinking blocks, `server_tool_use`,
  `web_search_tool_result` with `encrypted_content`), because the API requires them passed back
  unchanged.

## Per-iteration logging (item 4)

Each iteration writes a `research_thread_run_step` row and logs at start and end:

```
[site-research] run=<id> iter=3 attempt=1 start
[site-research] run=<id> iter=3 end stop=tool_use tools=2 searches=4 (run 11/12) tokens=… ms=58210
```

The Macon question ("which iteration at 150 s?") becomes a query over `research_thread_run_step`.

## UI (item 3)

`SiteStoryPanel`:

- **Create**: call returns 202 with `thread_id`; the thread appears in the list immediately as
  **Queued** and opens.
- **Subscribe** via `postgres_changes` on `research_thread` (filter `site_submit_id`),
  `research_thread_run` and `research_thread_message` (filter `thread_id`), **plus a 10 s poll while
  a run is non-terminal** — realtime can fail silently, which is exactly the PortalChatTab bug below.
- **Show**: Queued → **Running** (phase — *researching* / *writing report* — iteration n, tool calls
  and searches so far, elapsed time) → **Done** (report renders) or **Failed** (the run's `error`,
  plus "Retry", which enqueues a new run on the same thread).
- **Follow-up turns** render the user message immediately and a "thinking" row driven by the same
  run state.
- A run keeps going if the sidebar closes; reopening shows its live state.

## Alerts

Telegram on `failed` runs only (reaped or attempts exhausted), same helper as the sweep tick. No
alert on normal completion.

## Found while designing — not in this scope

**PortalChatTab live updates do not work.** It subscribes to `postgres_changes` on
`site_submit_comment`, but that table is not in the `supabase_realtime` publication (published today:
`critical_date`, `deal`, `deal_activity_state`, `map_layer_shape`, `site_submit`), and the tab has no
polling fallback. New comments appear only on refetch. Fix is one `ALTER PUBLICATION` (precedent:
9137b33c for `site_submit`) — flagged, not included.

## Build order

1. Migration: tables, state backfill, RPCs, vault secret + cron job, publication.
2. Move shared modules to `_shared/site-research/`; worker function; per-iteration step logging.
3. `create_thread` / `send_turn` enqueue and return 202.
4. `SiteStoryPanel`: subscribe + poll + progress states + retry.
5. Verify: a real run end to end; kill test (force a worker to throw mid-iteration and confirm the
   tick resumes from the persisted state); reaper test on a synthetic stuck run in a rolled-back
   transaction.
