# Market research: checkpoint submits and the `final` flag

Shipped 2026-11-10. Migration `20261110213319_research_submit_final_flag.sql`.

## Why

On 2026-11-10 the Senoia Quick run (`01b79c02`) marked all three municipalities complete
(7 projects noted in its checklist), then the agent stopped before its single end-of-run
`submit_research_report`. Nothing reached staging, and the reaper failed the run 90 min later.
All findings were lost.

The fix on the agent side: submit cumulatively after each municipality. That needed two
OVIS-side changes, because every submit used to move the run to `awaiting_review`:

- **The sweep engine fired the next chunk early.** `advance_sweep` treats `awaiting_review` as
  done, so a Deep Sweep chunk's first checkpoint started the next chunk while the agent was
  still running. Two agents running at once is what caused the Hall rate-limit collisions.
- **The run became reviewable mid-flight.** Any approve or reject made every later checkpoint
  fail with `run_already_reviewed`.

## Contract

`submit_research_report(run_id, candidates, needs_review, alt_avenues, cost, in_tok, out_tok, final)`

| Call | Staged rows | Run state |
|---|---|---|
| `final` omitted or false (checkpoint) | replaced by this batch | `running` (pending/failed → running; awaiting_review stays) |
| `final: true` | replaced by this batch | `awaiting_review`, `completed_at = now()` |
| any call on a cancelled / approved / archived run | — | refused: `run_closed` |
| any call after a reviewer acted on a row | — | refused: `run_already_reviewed` |

- **Replace, not append.** Each call deletes the run's `pending` rows and inserts the batch.
  Every call must carry every record found so far.
- **`needs_review` / `alt_avenues` are overwritten** by each call, and a null clears them. Carry
  them cumulatively. Usage figures are COALESCE-with-existing.
- **The default is false on purpose.** A forgotten flag leaves the run open. The reaper fails it
  after 90 min idle and the staged rows survive. That is safer than closing early, which fires
  the next sweep chunk on top of a live agent.
- The edge function only treats a strict boolean `true` as final; `"true"`, `1` and the like are
  checkpoints.
- Each call updates `research_run.updated_at`, so every checkpoint resets both the reaper's idle
  clock and the sweep engine's stall clock (both read `research_run_last_activity`).
- The run row is locked `FOR UPDATE`, which serializes concurrent submits on one run.
- Returns `{staged_count, final, state}` (was a bare int). The MCP tool echoes it to the agent.

## In-flight review guard

Trigger `municipal_project_staging_00_in_flight_guard` (BEFORE UPDATE) raises `run_in_flight` when a
row's run is `pending` or `running`. It covers every review RPC: approve, reject, unreject, merge,
unmerge and not-duplicate. That includes `approve_research_staging_rows`, which never checked run
state and would have set an in-flight run to `approved`.

Updates that only touch `duplicate_of_staging_id` / `merged_into_staging_id` / `updated_at` pass
through. Those are the `ON DELETE SET NULL` cascades fired when another in-flight run's checkpoint
replaces the rows they pointed at. The trigger is named `00_` so it fires before the other
BEFORE UPDATE triggers, and the diff sees only what the statement changed.

UI (`ResearchRunApprovalModal`):
- **Single run:** a `pending`/`running` run opens read-only with an "Agent still running — N
  records saved so far" banner.
- **Sweep:** rows from a chunk whose run is still in flight are held out of the review list, and a
  count is shown.

## Sweep engine: no change needed

`advance_sweep` marks a chunk `done` only when its run is `awaiting_review` / `approved` /
`archived`. A checkpointed run stays `running`, so the engine waits (stall detection still
applies). `approved` / `archived` can't be reached from an in-flight run, because the guard
blocks the approval that would set them. `awaiting_review` is set only by `final: true`. The
other path out of `running` is `failed` / `cancelled` (reaper, orphan, cancel), and the engine
treats that as a failed chunk, as before.

## Verified (rolled-back transaction against prod, 2026-11-10)

1. Checkpoint with `p_final` omitted (named args, as PostgREST calls it) gives `running`, with
   `completed_at` NULL.
2. Raw UPDATE, `approve_research_staging_rows` and `reject_research_staging_row` (impersonated as
   `authenticated`) on the in-flight run are all blocked with `run_in_flight`.
3. A sweep chunk run that checkpoints gives `advance_sweep` → `none` and the chunk stays `running`.
   After `final: true`, the chunk goes `done` and the next chunk fires.
4. An FK SET NULL cascade onto another in-flight run's row is allowed.
5. `final: true` gives `awaiting_review` and the run becomes reviewable. A later checkpoint does not
   regress it. After a review action, a further submit is refused (`run_already_reviewed`).
6. A cancelled run is refused (`run_closed`).
7. Grants: anon/authenticated have no EXECUTE, service_role does, and the old 7-arg signature is gone.

## Known edges

- A reaped (`failed`) run is still a **true gap** to `get_sweep_gaps` even if it holds checkpointed
  rows, so Re-run gaps re-researches that window. Its staged rows remain reviewable in the
  approval modal.
- A late checkpoint on a reaped run revives it to `running`. If that run was a sweep chunk, the
  chunk is already `failed` and the engine has moved on.

## Quick-mode recommendation (2026-11-11)

Migration `20261111084848_research_run_quick_signal.sql`. The Quick run's "is a Deep run worth
it" output used to exist only in the Telegram message. It now lives on `research_run`, and the
approval screen shows it for runs where `research_mode = 'quick'`. Sweeps and Deep runs show
nothing extra.

`submit_research_report` takes five more optional args. They work like `needs_review`: each call
overwrites them, so every checkpoint must carry them, and a call that omits them erases them.

| Tool field / column | Type | Shape |
|---|---|---|
| `signal_strength` | text | exactly `strong` \| `moderate` \| `weak` (CHECK) |
| `signal_rationale` | text | free text |
| `density_estimate` | jsonb array | `{municipality*, meetings_in_window, meetings_sampled, meetings_with_residential, extrapolated_count, not_sampled_reason}` |
| `permit_volume` | jsonb array | `{municipality*, result_count, no_count_reason}` |
| `leads_not_pursued` | jsonb array | `{name*, seen_in*, municipality, note}` |

`*` = required, non-empty string. Counts are non-negative integers or null.

- **Validation rejects; it doesn't coerce.** The edge function checks every field and returns a
  specific error, for example `signal_strength must be exactly one of ... (got "Moderate-to-Strong")`.
  The table CHECKs (one value of three; the detail fields must be arrays) are the backstop. A
  rejected call stages nothing. The previous checkpoint stands.
- **UI:** `ResearchSignalPanel` (`src/components/shared/`) takes the run's five fields as props, so
  it can mount anywhere. Leads are open by default, with Copy all (one line per lead: `name — seen_in
  (municipality) — note`) and a per-name Copy. Density and permits are collapsed.

## Approval screen simplification (2026-11-11)

Display only — every field is still stored, loaded and editable; nothing about commit changed.

- **Recommendation panel:** signal badge; one line `N records · X units` (excludes rejected and
  merged-away rows, since merged units are already summed into the survivor; adds
  `· K with no count` when any live row has no unit count, so the total can't silently
  understate); the rationale's first two sentences (clamped to two lines) with a `more` toggle.
  Leads not pursued is collapsed to its count + names, Copy all stays on the header; each lead's
  "seen in" / note opens on click. Agenda density and permit volume moved under one collapsed
  "Supporting data" section.
- **Record cards (expanded):** project name, address, phase label, **Pin hint**
  (`location_description`), **Polygon hint** (`parcel_boundary_notes`), total units, builder,
  permit URL, source, notes. A per-card "Show all fields" (default collapsed) holds permit date
  and discovery source (still editable) plus read-only municipality, status, zoning, zoning
  approval date, unit breakdown, units basis, amendment and parcel numbers — fetched for that row
  the first time Show all opens, so `get_sweep_staging` is unchanged.
- Always visible, unchanged: the `⚠ CHECK UNITS` badge and units line, and every duplicate /
  proximity warning (matches existing, possible dup within ~Nm, dup across runs, approx. location).

## Leads section — records with no unit count (2026-11-12)

Single-run and sweep review both get a fourth section, "Leads — no unit count found (N)", below
Clean & ready and collapsed by default. A pending row is a lead when `units_needs_review` is set
(null, 0 or placeholder count) or its staged count is null/0. Classification uses the staged
values, so a row doesn't jump sections while the reviewer types a count. Leads skip Needs attention
even when they carry a duplicate/location flag; those badges and conflict panels still render on
the lead card. Location/name duplicate clusters still own their members.

- Lead card: name, municipality, source, notes, warning badges. Clicking the name opens the full
  editor. Leads stay fully approvable; the header has Select all / Deselect all.
- Footer: `Approve & Commit (12 projects + 7 leads)`, counted by what each selected row commits as.
  A lead with a typed positive count counts as a project.
- Default selection is unchanged (every pending row not matching a committed record), so leads
  start selected, as they did when they sat in Needs attention.

## Auto-resolved duplicates (2026-11-12)

Opening any research review first runs `auto_resolve_research_duplicates()` (migration
`20261112202117_research_auto_dedupe.sql`). The review then reads back what changed for its own runs
with `get_research_auto_resolutions(run_ids)` and lists it in **"✓ Auto-resolved duplicates"** at the
top of the list. Each item has an Undo.

**Scope:** every pending row in any run that isn't in flight, not only the run being opened.
Committed records are global, and today's copies sat in separate runs: 141 South was staged by four
Quick runs. A copy can therefore be folded into a kept record that lives in another run's review, and
the list says so.

**Match keys (unambiguous only):**
- the same normalized name *and* phase label (parentheticals dropped, the same rule as the UI's name
  clusters) in the same place, **or**
- the same case number (`Z2026-05`, `REZ25-05`, …) read from the name or zoning field, in the same place.

"Same place" means the places overlap: municipality, boundary municipality, or the city in the address.

**Resolves only when nothing conflicts:**
- **Units:** no two non-zero counts differ.
- **Addresses:** compatible. Different house numbers or different streets fail. A vaguer form of the
  same address passes: "Hwy 16 & Pylant St" vs "SW corner of GA Hwy 16 & Pylant Street".

Anything else stays a cluster for the reviewer.

| Case | Action |
|---|---|
| Pending vs committed, unambiguous | Rejected: *Duplicates committed record "X" (auto-resolved)*. `duplicate_of_project_id` is set. |
| Pending vs committed, units or address differ | Flagged ⚠ MAY DUPLICATE "X", with the reason. Lands in Needs attention, **unselected** by default. |
| Pending vs pending, unambiguous | Merged into the fullest row (`_research_dedupe_merge`). |

**How the merge fills each field:**
- **Text fields:** the longest value; for the address, one with a house number wins.
- **Counts and dates:** the kept row's value if present, otherwise any copy's. **Units are not added**,
  unlike the manual "parts of one project" merge.
- **Sources:** the union, plus any other permit URL as "Also cited: …".
- **Parcel numbers:** the union.

The kept row's prior values sit in `merge_snapshot` (`kind: 'dedupe'`).

**Undo:**
- **Undo merge** calls `unmerge_research_staging_rows`, which now restores every field for a dedupe merge.
- **Undo reject** calls `unreject_research_staging_row`.

Both set `auto_dedupe_skip`, so the resolver never redoes something a reviewer undid. Those rows fall
back to the ordinary manual clusters.

**Dry run on 2026-11-12** (102 pending rows): 5 merges (12 rows), 11 rejected as copies of committed
records, 6 flagged near-misses, 2 case-number groups left for review (unit counts differ). See the
session report for the per-project list.
