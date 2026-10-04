# Labeler done-set defect, and the removal-attribution defect behind it

Diagnosed 2026-10-03/04. **Read-only investigation — no code, no migration, nothing applied.**
Prompted by `email_labeler_health` reading `unhealthy` with `bare_stale = 3` for ~48 consecutive
runs.

Current state and the open list: [EMAIL_TRIAGE_STATUS_2026-10-03.md](EMAIL_TRIAGE_STATUS_2026-10-03.md).

---

## Root cause

The apply path's "done" set keys on **`applied_at IS NOT NULL` and ignores `removed_at`**
([label-inbox/index.ts:541-551](../supabase/functions/label-inbox/index.ts#L541-L551)):

```ts
.from('email_label')
.select('gmail_id, label')
.eq('gmail_connection_id', connection.id)
.not('applied_at', 'is', null)      // <-- no removed_at filter
.in('gmail_id', chunk)
// key: `${gmail_id}|${label}`
```

So **"ever applied" is read as "currently applied."** Once OVIS removes a label from a message,
that `(gmail_id, label)` pair stays in `done` on every future run, and apply counts it as
`alreadyApplied` and skips it. **A label OVIS has ever removed can never be re-applied to that
message.** It is permanent, not transient: 48 runs reported the identical `bare_stale = 3`.

### How the three zoom.us messages got there

Both paths read the **same** decision source — `decisions`, computed by `decide()` in the same run
with freshly loaded rules (reconcile builds `current` from it at
[:601](../supabase/functions/label-inbox/index.ts#L601), apply iterates it at
[:553](../supabase/functions/label-inbox/index.ts#L553)). **No cached or denormalised decision is
involved**, and disabling a rule propagates to both immediately. The disagreement is that
**reconcile removes on *current* state** (`allLiveLabels`, which correctly filters
`removed_at IS NULL`) **while apply skips on *historical* state.**

| when | what |
|---|---|
| 10-01 12:36 | apply adds `OVIS/Unsorted`, verdict `none` |
| 10-03 21:17:54 | owner approves `no-reply@zoom.us → OVIS/Business` |
| 10-03 21:19:20 | apply adds `OVIS/Business`, verdict `rule:address:no-reply@zoom.us` |
| 10-03 21:19:25 | reconcile removes `OVIS/Unsorted` — correct, decision is now Business |
| 10-03 21:50:28 | owner **disables** the rule |
| 10-03 21:54:15 | reconcile removes `OVIS/Business` — correct, decision is no longer Business |
| 10-03 21:54:16 | **nothing re-adds `OVIS/Unsorted`**; health check fires `unhealthy` |

Zero apply errors, zero remove errors. Every Gmail call succeeded. The end state is wrong because
two individually correct operations leave the message bare.

Current decision for all three: `classified` / `model_no_verdict`, no CRM link, no tier-1 stub, no
listing vocabulary in "X has joined your meeting" → `decide()` returns `OVIS/Unsorted`, verdict
`none`. **The correct end state is reachable; apply simply refuses to reach it.**

## Second defect: removal attribution

**The watcher writes owner removals only to `gmail_label_event`. It never writes `email_label`.**
All three of its `email_label` touches are `.select(…)` for attribution (lines 227, 269, 329). The
only writers of `email_label.removed_at` in the codebase are
[label-inbox:619](../supabase/functions/label-inbox/index.ts#L619) (inbox reconcile) and
[:785](../supabase/functions/label-inbox/index.ts#L785) (archived-window reconcile).

Consequences:

- **`email_label` reads live for 72 labels the owner removed by hand** (all within the last 7 days,
  which is simply when the watcher started recording). Both `email_labeler_health` and reconcile
  believe those labels still exist.
- `bare_stale` cannot see owner removals at all, so it under-reports.
- Reconcile compares a stale "live" row to the decision, finds a match, and leaves it alone.

### `removed_at` is NOT an OVIS-only signature

An earlier read of this concluded it was. **It is not.** Of 178 removed-with-no-live-row pairs, **78
have an owner removal event as well, and in all 78 the owner removed FIRST and OVIS stamped
`removed_at` afterwards.** The mechanism: the owner strips the label by hand; a later reconcile
decides that label is stale, calls Gmail (a no-op, the label is already gone), succeeds, and stamps
`removed_at`.

**Fix B therefore cannot distinguish the two from `email_label` alone — only `gmail_label_event`
knows.** Any fix that treats `removed_at` as "OVIS did it" will re-apply the owner's removals.

## Measured tonight

| measure | value |
|---|---|
| `email_label` pairs with `removed_at` set and no live row of that label | **178** (all within 30 days) |
| …attributed: OVIS reconcile (event confirms) | 90 |
| …attributed: **owner removed first, OVIS stamped after** | **78** |
| …attributed: OVIS removed, no event recorded | 10 |
| messages with **no live label at all** | **4** (8 pairs) |
| …of those, a label the owner removed by hand | **1** (`1a0b0722815c68d2`) |
| owner removals of `OVIS/` labels where `email_label` still reads live (**defect 2**) | **72**, all in the last 7 days |
| rules disabled in the last 24h | 1 — `no-reply@zoom.us → OVIS/Business` |
| messages matching that rule | 155 |
| …(a) bare, **past** grace | **147** |
| …(b) bare, **inside** grace | **0** — nothing is about to go stale |
| …(c) still or again labelled | 8 |

### 3 vs 4 — not a paging artifact

SQL with no pagination and no `.range()` finds **4** messages that are classified, past grace,
previously labelled and now bare. The health check reports **3** because the fourth
(`1a0b0722815c68d2`, received 09-17) **was archived by the owner** (`INBOX` removed), so it is not
in the inbox enumeration. Both numbers are correct for their question.

The more important number is **147**: zoom.us messages with no live label that the health check
cannot see because they are archived. `bare_stale` only covers the inbox, while reconcile covers a
30-day archived window — so reconcile can strip a label somewhere the health check will never look.

---

# Fix A — code, tonight-sized

**Change 1.** Add `.is('removed_at', null)` to the done-set query at
[label-inbox/index.ts:541-551](../supabase/functions/label-inbox/index.ts#L541-L551), so "done"
means *currently applied*.

**Change 2, required in the same commit.** The intent-row upsert sets `applied_at: null` and
**never touches `removed_at`**:

```ts
.upsert({ …, applied_at: null, apply_error: null, dry_run: false },
        { onConflict: 'gmail_id,gmail_connection_id,label' })
```

On re-apply the row would end up with `applied_at` = now and `removed_at` still set — *applied and
removed at once*. `allLiveLabels` would exclude it, reconcile would ignore it, and the next run's
done set would skip it again: **fixed for one run, then silently recurring.** Add
`removed_at: null, remove_error: null` to that upsert.

**Fix A must not ship alone.** It will re-apply labels the owner removed by hand wherever the
decision still equals that label — one message today (`…0722`), and more the moment defect 2's 72
rows are corrected.

# Fix B — spec

1. **Watcher writes the removal.** On an `owner`-attributed removal of an `OVIS/` label, set
   `email_label.removed_at = now()` **and `removed_by = 'owner'`** on the matching live row.
   Reconcile sets `removed_by = 'ovis'`. New column: `text`, nullable, no default.
2. **Owner re-add clears it.** When the watcher sees an `owner`-attributed **add** of an `OVIS/`
   label, clear `removed_at` and `removed_by` on that row, so a label the owner puts back is live
   again and is not permanently excluded by rule 3.
3. **Done set** = `removed_at IS NULL` **OR** `removed_by = 'owner'`. OVIS re-applies what it
   removed; it never re-applies what the owner removed.
4. **`bare_stale` excludes `removed_by = 'owner'`**, and **covers the same 30-day archived window
   reconcile uses**, not just the inbox. A label the owner stripped is a disposition, not a labeler
   failure — and a label reconcile stripped from archived mail is a failure the current check
   cannot see. That turns tonight's hidden 147 into a reported number.
5. **Backfill from `gmail_label_event`**, the only record that distinguishes the two:
   - the **72** rows from defect 2 (owner removal, row still live) → `removed_at` = the event's
     `observed_at`, `removed_by = 'owner'`
   - the **78** pairs where an owner removal precedes the OVIS stamp → `removed_by = 'owner'`
     (the owner's gesture was first and is the real cause)
   - the **90** event-confirmed OVIS removals → `removed_by = 'ovis'`
   - the **10** with no event → leave NULL, and **treat NULL as `'owner'` in the done set**, failing
     safe toward not overriding the owner

## Shipping order — one change, non-negotiable

**migration (`removed_by` column + backfill) → code (done set, upsert, health check) → deploy.**

If Fix A ships first, the 4 bare messages get re-labelled — one against the owner's wishes — and
any later correction of the 72 rows turns those into re-apply candidates too. If the migration
lands first with the code unchanged, nothing happens: `removed_by` is populated and unread. Safe
but inert, which is the correct direction to be wrong in.

## First-run plan

1. `max_applies: 5`, **one manual invoke**, `reconcile: true`, inbox only. Read the response body —
   `applied`, `stale_found`, `removed`, `archived_window_*`. Confirm the three zoom messages get
   `OVIS/Unsorted` and nothing else moves.
2. Then the **full 30-day window** in one manual invoke with a raised `max_applies`. Expect
   **~3 inbox + up to 147 archived** applies. Read the response again; confirm `apply_failed = 0`
   and that no `OVIS/Business` reappears on zoom.us mail.
3. Only then let `label-inbox-tick` (cron 28) resume its normal schedule.

Never verify from `cron.job_run_details`: `pg_net` abandons the response at 5s and `label-inbox`
takes 20–40s, so the cron cannot observe it. `email_labeler_health` is the only observable, and it
should return to `healthy` with `bare_stale = 0`.

## Rollback

| piece | rollback |
|---|---|
| Fix A, both changes | `git revert` + redeploy `label-inbox`. Labels already re-applied **stay** — removing them needs a reconcile pass or hand removal. Forward cost is Gmail writes, not data loss |
| `removed_by` column | `ALTER TABLE public.email_label DROP COLUMN removed_by;` — additive, so dropping restores the prior shape exactly |
| Backfill | not reversible in place (it writes `removed_at` on 72 rows that had NULL). Capture `gmail_id, label, removed_at, removed_by` for every touched row into a scratch table in the same migration, so the inverse is one UPDATE |
| Watcher write path (Fix B 1–2) | `git revert` + redeploy `label-watcher`. `email_label` keeps whatever was written; `gmail_label_event` is unaffected and remains the source of truth |
| `bare_stale` scope change | `git revert` + redeploy. Read-only computation — reverting changes only what is reported |

**`email_label` keeps no history** — one row per `(gmail_id, gmail_connection_id, label)`, upserted
in place. `removed_at` is the only trace of a retraction, which is why the backfill needs its own
scratch copy.
