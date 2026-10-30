# Voice-triage tools on the OVIS MCP server

Eleven tools that let a spoken agent work Mike's commitment desk — the `/triage`
panel's job, without a screen. They live in the existing `ovis-mcp` edge
function (`supabase/functions/ovis-mcp/`), alongside the NNN listing-intake
tools, and are reached the same two ways: the claude.ai connector (OAuth) or the
static `OVIS_MCP_INTAKE_TOKEN` for scripts.

Status: **built and merged 2026-10-30**, server version `0.4.0`.

| File | What it holds |
|---|---|
| `voice_triage.ts` | Tool definitions, the tool bodies, and all the decisions (ranking, validation, scoping) |
| `voice_triage_store.ts` | The one PostgREST implementation of `TriageStore` |
| `voice_triage_test.ts` | 48 tests, all of it driven through fakes — no network, no Gmail, no model spend |
| `index.ts` | Registers the tools and builds one `Ctx` per call |

## The tools

| Tool | Reads / writes | Wraps |
|---|---|---|
| `get_triage_list` | reads | `commitment` + `emails` + `commitment_unknown_counterparties` |
| `run_triage(mode)` | writes (spends) | `extract-commitments` |
| `triage_run_status(run_id)` | reads | `commitment_extraction_run` |
| `triage_action(id, action)` | writes (+ Gmail) | `commitment-action` |
| `find_deal(query)` | reads | `deal` / `client` / `property` |
| `create_contact(…)` | writes | `contact` + `deal_contact`, prefilled by `ovis-knowledge-capture` |
| `log_deal_note(deal_id, note)` | writes | `note` + `note_object_link` |
| `update_deal(deal_id, fields)` | writes | `deal` (whitelist) |
| `create_watch` / `list_watches` / `cancel_watch` | writes / reads / writes | `mcp_thread_watch` |

Nothing re-implements a decision the desk already makes. Extraction is
`extract-commitments`; the verdicts are `commitment-action` (and so Handled
still archives in Gmail, Flag still applies `OVIS/Flagged`, and neither reports
success until Gmail confirms it); the contact prefill is the same
`lookup_email_signature` the Intel form uses; the ranking is the panel's own.

**There are no email-sending tools, deliberately.** Drafts come from the Gmail
connector; OVIS is not in that path.

## Things that are easy to get wrong here

**A login maps to a person through `user.auth_user_id`, not `user.id`.** Only
one of the four OVIS users has them equal (Mike's). Scoping by `id` silently
resolves nothing for everyone else.

**Scope comes from the caller, never from the arguments.** Every tool resolves
one `gmail_connection` and filters by it; `triage_action` and `create_watch`
re-check that the commitment belongs to it, so a guessed id from another mailbox
is refused before any write. Verified live against a real row of the other
mailbox.

**The static token has no person behind it,** so the email lookup (gated on
`auth.uid()`) cannot run for it, and it says so instead of silently skipping. It
acts for `OVIS_MCP_OWNER_EMAIL`, default `mike@oculusrep.com` — the same owner
the panel hardcodes.

**`speakable_reason` carries a stale age.** `extract-commitments` composes
`"<reason>, 11 days ago."` in code at write time. Days later that clause is
false, and a voice agent would read it out as fact — one real row said "11 days
ago" with a last message 30 days old. `withoutStaleAge()` strips the clause, and
the recomputed `age` is the only statement about time. A promise sentence after
it is kept: a promised date is a date, not an age.

**Money is not writable from `update_deal`.** `fee`, `commission_percent`,
`deal_value` and the rest drive commission and payment-recalculation triggers; a
spoken "make it sixty thousand" has no business in that chain. The whitelist is
stage, deal_name, the dates, probability, loss_reason, sizes and landlord_name.
Changing the stage fires `deal_stage_history` and syncs the linked site submit —
the tool returns those as `side_effects` rather than letting them surprise
anyone.

**Every write attempt is logged to `mcp_audit_log`, including refusals** —
"it tried to set the fee and was told no" is exactly what a log with no screen
behind it is for. So argument validation happens *inside* the audited wrapper.
Reads are not logged.

**`run_triage` makes exactly one `extract-commitments` invocation per call.**
That function drains until its own 110-second deadline and hands back
`next_offset`, so a second round trip cannot fit inside one MCP call anyway, and
a loop here would spin forever against an extractor that stopped advancing. An
unfinished pass is reported as unfinished, with the `run_id` to continue from.

## Watches are pull, not push

`create_watch` records a thread, the whole conversation's thread ids, and a
baseline: the newest message at that moment. `list_watches` then asks whether
any message in those threads arrived after the baseline from someone other than
the owner — his own follow-up is not the answer he asked to be told about.

**Nothing fires on its own.** There is no trigger and no cron: a reply is
noticed the next time the agent calls `list_watches`, which is why the tool
description tells it to check at the start of a session. The upside is that
nothing can be silently lost when a job is paused; the limit is that a voice
agent is told about a reply when it next asks, not when the reply lands. A push
path (web push, a Telegram ping) would be a separate piece of work.

A firing is recorded on the row (`status`, `fired_at`, `fired_email_id`,
`fired_sender`, `fired_subject`), so one reply is reported once. A partial unique
index keeps one active watch per thread per person, because an agent asked twice
("watch that one" / "tell me if he replies") must not report one reply twice.

## Schema

Migration `20261030170535_mcp_voice_triage.sql` adds exactly two tables:

- `mcp_audit_log` — tool, caller (`user` / `static`), the acting user, the
  arguments, ok, result or error.
- `mcp_thread_watch` — the watch rows described above.

Both: anon revoked, `SELECT` to `authenticated` behind RLS (`mcp_thread_watch`
is your own rows only), writes to `service_role` alone.

## What was verified, and how

48 unit tests cover every tool through fakes. Beyond that, the function was run
locally under plain `deno run` against the production database (no Docker here,
so no `supabase functions serve`) and driven over real JSON-RPC:

- `tools/list` → 15 tools; `get_triage_list` → the real desk, ages recomputed
- `find_deal "hoschton"` → 6 deals, matched on name *and* property
- `triage_action` / `create_watch` on another mailbox's commitment → refused,
  no write attempted
- `create_watch` → `list_watches` → fired on a real inbound reply after the
  baseline was backdated → `cancel_watch`; test rows deleted afterwards
- `triage_action skip` on a real row → status/skip_count/next_surface_date
  written, then restored
- `log_deal_note` → note + link + `created_by_id` stamped as Mike (the secret
  key has no `auth.uid()`), then deleted
- `update_deal` → money refused and logged; `landlord_name` set and reverted
- `create_contact` + deal attach → verified, then deleted
- `run_triage incremental` → a real pass: 46 conversations, 13 new, $0.19, 42s;
  `triage_run_status` read it back

Not exercised from here: the OAuth caller path (needs Mike's own token, so the
email-lookup prefill is unit-tested only), and `triage_action handled` / `flag`,
which write to Gmail — `skip` was used instead to prove the wiring without
touching the mailbox.
