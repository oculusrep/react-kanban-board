# Commitment layer — step 1 (table + extraction), 2026-10-10

Spec: [email-triage-spec.md](email-triage-spec.md) §4. Branch `feature/commitments`.
Scope was **table + extraction only** — no UI, no Gmail writes, no deal-board wiring.

## What shipped

| piece | state |
|---|---|
| `supabase/migrations/20261008090141_commitment.sql` | **applied** to prod and recorded; 20 columns, RLS on, `anon` has nothing |
| `supabase/functions/extract-commitments` | **deployed**, `verify_jwt = false` + `caller-auth.ts` as the real gate |
| first full run over the 14-day window | **done** 2026-10-10, 209 commitments across 202 threads, **$1.27** |

Reads **`ANTHROPIC_API_KEY_TRIAGE` only** and returns a 500 naming the secret if it
is absent. There is deliberately **no fallback to `ANTHROPIC_API_KEY`**: a silent
fallback would bill the wrong key while looking like it worked.

## Identity, and the trade-off in it

Upsert key is **`(gmail_thread_id, ball)`**. The spec proposed `(thread, what)`, but
`what` is model prose — re-extraction rewords it, so that key would duplicate on
every run, which is the exact failure the constraint exists to prevent.

Cost: two genuinely distinct obligations in the **same direction** on one thread
collapse into one row and the later run overwrites `what`. Accepted for v1.

## Exclusions, all before any model call

Measured on the window: **2,294 threads, 1,785 excluded, 509 eligible** — the
function's count matched an independent SQL count exactly.

| reason | threads |
|---|---|
| tier-1 stub on any message | 1,250 |
| `OVIS/Junk` | 344 |
| `OVIS/Reading` | 81 |
| `OVIS/Personal` | 75 |
| `OVIS/Events` | 35 |

## Result

| | |
|---|---|
| threads attempted | 509 |
| model calls / errors / parse errors | 509 / 0 / 0 |
| commitments | **160 `them`**, **49 `me`**, 0 `neither` |
| threads with zero commitments | 307 (60%) |
| with a `deal_id` | 34 of 209 (16%) |
| with a `promised_date` | 32 |
| cost | $0.88 for the pass, **$1.27 total** (see the waste note), cap was $10 |

`neither` is never emitted — the model returns `[]` instead, which is the same
judgement by a different route. If `neither` is meant to carry a row, the prompt
has to ask for it explicitly.

## Two defects found by reading the output

### 1. Relative time phrasing is wrong, and `speakable_reason` IS the product

The model is never told the current date, so it phrases ages from thread content.
**18 rows say "today" on a thread whose last message is ≥2 days old**; 3 say
"yesterday" at ≥3 days; 48 of 209 use a relative phrase at all. Example: *"Shirley
Gouffon asked you three days ago…"* on a thread last touched **12 days** ago.

This is not cosmetic — the whole point of the column is to be read aloud, and an
aloud line that misstates the age is worse than no line. Fix is cheap: pass today's
date and each message's age, and forbid relative phrasing the model cannot verify.

### 2. Ball inversion on "they promised" threads

`ball` is sometimes `me` when the thread says the **counterparty** owes. Clear cases:

- *"Mark told Mike he'd shoot over the updated civil concept plan…"* → recorded `me`
- *"Noree committed to updating the SOPs and hasn't confirmed completion"* → `me`
- *"Max said he can send an invite for the 11am meeting and hasn't sent it yet"* → `me`

**5 of 49 `me` rows** match phrasing that describes the counterparty owing. That
count is a regex indication, not a hand-verified rate — the true rate needs a manual
pass over all 49. A likely contributor: both mailboxes are in the owner set, so a
message from `asantos@` is also marked `(OWNER)`, and "Mike" appears in the body as
a third party.

## Two process notes worth not rediscovering

- **The first version was killed with `WORKER_RESOURCE_LIMIT`.** It selected
  `body_text` for all 2,836 messages in the window and then ran two queries per
  thread (4,590 round trips). The window pass now reads metadata only, exclusions
  resolve in bulk, and bodies are fetched one eligible thread at a time.
- **200 Message-IDs in `in.(…)` breaks the request.** They are long enough that the
  URL died with an http2 "unspecific protocol error" — note it reported as a
  *network* error, not a 414. Windowed reads of `email_tier1_stub`, intersected
  locally, replaced it. UUID chunks of 200 are fine.
- **$0.38 of the $1.27 was waste caused by the driving loop, not the function.**
  Python printed `None` where the loop tested for `"null"`, so a batch was sent with
  invalid JSON; the function fell back to its defaults (`offset: 0`) and re-ran the
  first 200 threads. The upsert key meant no data damage. A loop that drives a
  resumable function must treat "no next offset" as a value, not a string.

## Not done, and deliberately so

- `status` / `skip_count` / `next_surface_date` / `sync_state` are written only at
  their defaults. Nothing decays, snoozes or syncs yet (steps 2–3).
- `would_set_ball_in_court` is populated and **never acted on**. But the system is
  not a clean shadow: triage's own `email_object_link` / `activity` /
  `ball_in_court_since` writes continue, so the board is **not** an independent
  baseline for comparison. Stated in the migration header too.
- No cron. The function is invoked by hand; batches are resumable via
  `offset` → `next_offset`, carrying `usd_spent` so the cap applies to the run.
