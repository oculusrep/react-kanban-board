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

---

# Rerun after the fixes — 2026-10-10

Migration `20261010101725_commitment_per_connection.sql` (applied + recorded) and
commit `892810af`. Both mailboxes, 627 thread-instances, **$1.18 of a $5 cap**,
**0 model errors, 0 parse errors**.

## What changed

1. **The model may not mention time at all.** It returns a time-free `reason`,
   stored in the new `reason_core` column. `speakable_reason` is composed in code:
   `reason_core` + an age computed in Eastern Time from the thread's last message
   **for that mailbox** + a promised date rendered from `promised_date`. Today's
   date and per-message timestamps still go into the prompt, but only so
   `promised_date` can be extracted. A time word in `reason_core` triggers one
   repair call and is counted.
2. **One mailbox per invocation, owner named in the prompt.** `connection_id` or
   `connection_email` is required; a run without one is a 400 that lists the
   connections. "Mine" is that connection's `google_email` alone, and threads are
   scoped through `email_visibility`.
3. **New exclusions:** `onboarding@resend.dev`, and calendar notices by subject
   prefix **and** by a `text/calendar` part — the subject test alone catches 37
   window threads where the attachment catches 45.
4. **Rerun replacement:** an `open` row this extraction no longer claims is
   deleted; `handled` / `flagged` / `skipped` are never deleted. 103 stale rows
   were removed on this run.

`gmail_connection_id` **is** `owner_connection_id` now that extraction runs per
connection — confirmed, no separate column added.

## Results

| | mike@ | asantos@ |
|---|---|---|
| threads for mailbox / eligible | 1,738 / **397** | 727 / **230** |
| `them` rows | **92** | **66** |
| `me` rows | **51** | **45** |
| zero-commitment threads | 256 | 122 |
| with a `deal_id` | 26 | 21 |

254 rows over 188 distinct threads (61 threads carry rows in both mailboxes).
10 repair calls fired across 637 model calls.

### Time words: 0

`reason_core` matching `today|yesterday|ago|last week`: **0 of 254**. All 254
composed `speakable_reason` values carry a code-computed age phrase.

### The 5 suspected inversions: 4 flipped, 1 became a miss

Four now read `them`, correctly — Tripp on the lease, Nick Addison on LOI
comments, Noree on the SOPs, Max on the booth invite.

The fifth (`1a0ee05817d1db72`, *"Mark told Mike he'd shoot over the updated civil
concept plan"*) now has **no row at all**. It was eligible and attempted — one
`OVIS/Business` message, no stub, no calendar part — so the model returned zero
commitments rather than flipping the direction. The promise is conditional ("as
soon as he receives it from their civil team"), which may be why, but this is a
**false negative, not a fix**, and it is unresolved.

## Measured: the same-ball collapse is 15%, not a corner case

300 successful upserts produced 254 rows with 0 duplicate keys. 106 run-1 rows
survived and were all updated in place, 148 rows were new, so **46 extracted
obligations were collapsed into a row that already held that thread+mailbox+ball**.
That is the `(gmail_thread_id, gmail_connection_id, ball)` trade-off the migration
documents, now with a number against it: ~15% of what the model finds is being
merged away, and the later one overwrites `what`. If that matters, identity needs
a stable per-obligation key, not a direction.

**Not** caused by the moving 14-day window: only 2 threads sit within ±20 minutes
of the boundary and 0 dropped out during the run, and attempted (627) reconciles
exactly with 378 zero-commitment threads + 249 thread-instances holding rows.

## Driving-loop note

The run-1 waste ($0.38 from a `None`-vs-`"null"` comparison) did not recur; the
driver is now Python and treats "no next offset" as a value, not a string.

---

# Three fixes + identity, and what the rerun actually did — 2026-10-10 (later)

Migration `20261010185945_commitment_identity_by_id.sql` (applied + recorded),
commits `fc573fcf` and the gate follow-up. Four full runs, **$3.18 total**,
0 model errors, 0 parse errors, 0 time words in `reason_core` throughout.

## Identity: it had not shipped

No `existing_id` existed anywhere in the repo and the unique index was still
live, so this was done first. **There is no written spec for it** — the brief
referenced one that isn't in the repo or in session history — so what shipped is
the obvious reading: the unique key `(gmail_thread_id, gmail_connection_id, ball)`
is dropped, each conversation's open rows go into the prompt with their ids, the
model returns `existing_id`, matches are UPDATEd by id and the rest INSERTed. An
unrecognised id is counted (`bad_existing_id`) and treated as new, never as a
blind write. Across four runs: **1 bad id out of 640 matched rows.**

## 1. Prior-contact filter — works, but needed a second fix to reach the data

A conversation with no owner message **and** no prior owner→counterparty contact
gets no model call: **159 (mike@) + 38 (asantos@)** skipped. `me` is additionally
suppressed where there is no prior contact: ~10 per run.

**The first version silently did nothing to existing rows.** All 10 rated pitch
rows were still present and untouched after the rerun, because skipping the model
call also skips the replacement rule — which only runs on conversations that get
extracted. Skipping the model is not the same as having no opinion. Gated
conversations now retire their open rows: **44 rows retired, at $0.00 and zero
model calls.**

**One false positive, and it cost a real row.** Rated row #24 (Noree, Generator
Slide) arrived as a single **`chat-noreply@google.com`** Google Chat notification.
Mike has never sent mail to that address, so the conversation was gated as a pitch
and the row retired. Notification senders are structurally indistinguishable from
cold outreach under this rule. 5 such messages are in the window.

## 2. Conversation grouping — works

Union-find over Message-ID / In-Reply-To / References, merged with `thread_id`.
`emails.thread_id` is never mutated; `commitment.conversation_thread_ids` records
what merged.

**105 conversations merged 2+ thread_ids** in the 14-day window — 59 for mike@
(124 thread_ids) and 46 for asantos@ (98). Rated rows **#6, #10 and #16 now each
span 2 thread_ids and contain Mike's reply** (10-07, 09-29, 10-07), which
`thread_id` alone could not see.

## 3. Calendar — the exclusion changed, the goal was not reached

Inbound notices are dropped per message (**31 per run**) instead of killing the
conversation, and owner-sent invitations are rendered as subject + date +
attendees with no body.

**`owner_invites_kept` is 0 on every run.** The invites exist — #19's "Invitation:
SBUX Port Went / Hendon & Oculus" and #25's "Invitation: Crosland/ Oculus" were
both sent — but a Google invite carries no `In-Reply-To`/`References` pointing at
the conversation, so union-find cannot reach it. #19's conversation still has
**0 owner messages**. Linking an invite needs a different signal (subject,
attendees, time proximity) and is not built.

## 4. Rerun results

mike@ `ball='me'`: **51 before → 19 after.** All rows: 254 → 174.
Final: mike@ 75 `them` / 19 `me`; asantos@ 50 `them` / 30 `me`.

Second run immediately after: **3 inserted, 6 deleted** of 174 rows (run 3 was
9 / 7). Not zero — about 5% churn per run from model non-determinism on
borderline conversations, with `existing_id` holding the other 164 rows steady.

### The 25 rated rows

| expectation | result |
|---|---|
| pitches #2,3,5,9,11,13,15,17,18,21 gone | **10 of 10 gone** |
| #6, #10 gone | now `them`, not gone — no longer claims Mike owes anything |
| #16, #19 gone | **still `me`** |
| #25 gone | **gone** |
| #14 flips to `them` | **gone entirely** |
| #22, #24 still present | **#22 flipped to `them`, #24 gone** |

**Both rows Mike rated "real and open" were lost.** #24 to the gate false
positive above. #22 is a substitution, not a flip: the conversation holds two
obligations, and the model now reports Arty's ("told the broker he would push for
feedback") while dropping the one Mike cares about (propose an alternative on the
Tejal guaranty). Dropping the unique key made room for both rows; the model
returned only one.

#16 is defensible as `me` — Mike's own 10-07 message in the merged conversation
says the LOI "has not been addressed yet". #19 is the calendar gap.
