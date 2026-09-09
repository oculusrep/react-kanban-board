# Custom Deep runs are chunked, not sampled

Status: **shipped** (2026-09-08). Touches `src/components/shared/StartResearchModal.tsx`
and the `onSweepStarted` callback in `src/components/shared/SiteSubmitSidebar.tsx`.
**No migration, no edge-function change, no new tables.**

## The problem

The agent has an enumeration cliff at roughly six months of window. Past that it
stops enumerating and starts **sampling** — while still reporting as a Deep pass.
It completes 4/4 and 10/10 hearings, but stops around 7 when told to enumerate
~72. No prompt wording fixes this; only slice size does.

The Custom tier accepted arbitrary window bounds and fired them as a single
`research_run`, so a long Custom Deep window produced a sampled run wearing a
deep-mode label.

### Live evidence

`research_run` `8183d6a2-5325-4262-a0fe-bd38205ab37f` (2026-09-08), Johnson Ferry
& Shallowford, Cobb County, radius 3, Custom Deep, window **2024-09-09 →
2026-09-08** (24 months). It returned **1 record**, and its own coverage report
admitted:

> "Sept 2024–Jan 2026 meeting agendas not individually opened (covered by news
> search + ECCA instead)."

~17 of the 24 months were never enumerated. Labelled deep; sampled in fact.

## What the inspection found

The chunking loop **already accepted caller-supplied bounds** — nothing needed to
be generalized:

| Piece | Where | Windows come from |
|---|---|---|
| `create_sweep_with_chunks(p_site_id, p_radius_miles, p_boundary_muni_ids, **p_windows jsonb**)` | `20260718134802_sweep_rpcs.sql` | caller — an arbitrary-length array of `{window_start, window_end}` |
| `advance_sweep` / `ovis-sweep-tick` | engine | reads `research_sweep_chunk` rows; no date math at all |
| The 3yr / 6-chunk range | **`StartResearchModal.tsx` only** | `sweepWindows` useMemo |

So the "3-year sweep" was never a property of the engine — it was six hardcoded
constants in one client memo. The fix is entirely client-side: compute a
different window array and hand it to the same RPC. **No second chunking path
was built.**

Everything downstream was already correct for this: each chunk gets its own
`research_run`, firing is sequential (`advance_sweep` allows at most one
non-terminal chunk), the stall guard and orphan reaper are live,
`get_sweep_gaps` / `rerun_sweep_gaps` recover a dead chunk, and
`get_research_coverage`'s sweep-line stitches the segments.

## The rule

> A **Custom** run with `research_mode = 'deep'` and a window longer than
> **6 months** is never fired as one run. It is split into `ceil(months / 6)`
> sequential chunks and run through the Deep Sweep machinery.

**Not optional.** There is no "would you like to split this?" prompt and no
un-split path in the UI. A skippable guard eventually gets skipped, and the
failure mode is silent — a sampled run that claims to be complete.
`handleStart` (the single-run path) additionally carries a hard guard that
refuses a long Deep window, so a later refactor of the footer cannot reopen the
hole.

Exactly 6 months still fires as one run — that is the documented Custom use case.

### Remainder rule: whole months, internal boundaries only

**Internal boundaries snap to month edges; the outer edges stay exactly as the
user typed them.** Chunk *i* ends on the last day of a month and chunk *i+1*
starts on the 1st of the next. A 26-month window is 5 chunks of ~5 whole months,
never `6+6+6+6+2` — a runt chunk pays the same fixed per-run overhead (~$3–$5,
~25 min) for a fraction of the range.

The first cut at equal-width *day* slices was wrong for two reasons, both real:

1. **A split month gets enumerated twice.** A boundary at 2026-04-03 puts Apr 1–3
   in one chunk and Apr 3–30 in the next. An agent told to search "Apr 3 → Sep 8"
   opens the whole April agenda set, and so does the chunk ending Apr 3. The
   approval modal's cross-run dedupe catches the duplicate *records*, but the
   second pass is paid for.
2. **A shared boundary day was double-counted.** Windows were inclusive on both
   sides, so every boundary produced a phantom 1-day `pass_count = 2` segment in
   `get_research_coverage`. This was **already shipped behavior in the Deep
   Sweep**, not something chunking introduced — verified on the live Grovetown
   sweep `ec45f5f1`, where **20 of 44** coverage rows were 1-day slivers:

   | segment | days | pass_count |
   |---|---|---|
   | 2023-08-13 → 2024-02-12 | 184 | 1 |
   | **2024-02-13 → 2024-02-13** | **1** | **2** |
   | 2024-02-14 → 2024-08-12 | 181 | 1 |

   Month-aligned boundaries fix this outright: the coverage RPC builds half-open
   `[wstart, wend + 1)` intervals, so Mar 31 / Apr 1 stitches into **one**
   continuous segment rather than two plus a sliver.

The chunk count still comes from the **elapsed span** (`monthSpan`), not from
months touched — that is what keeps a 6-month window at one run and the 24-month
Cobb window at 4 chunks. `MAX_SLICE_DAYS = 210` (~7 months) is the only escape
hatch: if month-snapping pushed a slice past it, `chunkPlanFor` adds a chunk and
rebuilds.

Verified invariants (`chunkPlanFor` / `buildWindows`):

| Window | Span | Chunks | Slice days |
|---|---|---|---|
| 2024-09-09 → 2026-09-08 (the live Cobb run) | 24 mo | **4** | 172–191 |
| 2026-03-08 → 2026-09-08 | 6 mo | **1** (no split) | — |
| 2026-03-07 → 2026-09-08 | 7 mo | 2 | 85–99 |
| 2025-07-08 → 2026-09-08 | 14 mo | 3 | 130–150 |
| 2024-07-09 → 2026-09-09 | 26 mo | 5 | 144–181 |
| 2023-09-09 → 2026-09-09 (Deep Sweep) | 36 mo | 6 | 173–192 |
| 2025-01-31 → 2026-09-09 (start on the 31st) | 20 mo | 4 | 120–161 |

In every case: outer edges verbatim, chunks contiguous with **no shared day**
(`window_end[i] + 1 day == window_start[i-1]`), and every internal boundary on a
month start.

The 26-month plan:

```
2026-04-01→2026-09-09 | 2025-11-01→2026-03-31 | 2025-06-01→2025-10-31
| 2024-12-01→2025-05-31 | 2024-07-09→2024-11-30
```

## The four-field window contract

`research_run` carries **four** bounds — `pz_window_start/end` and
`permit_window_start/end` — and chunking must slice both consistently.

**Confirmed: Custom cannot make them differ.** The Custom tier has exactly one
`From`/`to` date pair, and `plan` assigns that same pair to all four fields
("Applied to both P&Z and permit searches"). The P&Z and permit spans are equal
by construction, so a single chunk count is well-defined and each chunk fires
with `pz_window == permit_window == slice` — the same mapping `ovis-sweep-tick`
already uses.

Asymmetric windows exist only on the **Quick** tier (P&Z 3yr / permits 2yr), which
is never chunked.

⚠️ **If Custom ever grows separate P&Z and permit date inputs, this breaks.** Two
windows of different length have no single chunk count. That would need either
two counts (two chunk series) or slicing their union. There is a comment at the
`customSpanMonths` memo saying so; revisit before such a change lands.

## Confirmation dialog

The dialog shows the **computed chunk count and a cost range**, never a flat
figure:

```
24 months → 4 sequential chunks (≤6 months each) · ~$12–$20
Mar 2026–Sep 2026 · Sep 2025–Mar 2026 · Mar 2025–Sep 2025 · Sep 2024–Mar 2025
[ Confirm — fire 4 chunks (~$12–$20) ]
```

Cost model: **$3–$5 per chunk**. $3 is the floor already used by
`PER_CHUNK_COST_USD` in `ResearchRunApprovalModal`; the Aug 10 six-chunk Hall
County sweep came in near **~$27** (~$4.5/chunk on a dense county), which is why
a point estimate was wrong.

The confirm step is reset whenever the tier, mode, dates, or radius change, so the
screen can never quote a plan that is no longer current.

### Two changes to Deep Sweep

Deep Sweep's **count and range are untouched** — still 6 chunks over the last 36
months, still fired the same way. Two things did change:

1. **It shares `buildWindows`**, so there is exactly one boundary convention in
   the modal. Its boundary dates are now month-aligned, which stops it emitting
   the phantom 1-day segments documented above. Old sweeps' coverage rows are
   unaffected; only new runs are clean.
2. **Its cost label** uses the same range helper (`~$18` → `~$18–$30`), because
   leaving two contradictory cost models in one modal is worse than the queued
   estimate fix it anticipates.

**Quick is untouched.** Only a Deep enumeration makes a completeness claim, so
only Deep has a claim to falsify by sampling.

---

# Related: the Mableton report does not reproduce

The Cobb run's coverage report claimed City of Mableton was in-radius but absent
from the frozen municipality list, so its zoning was never searched. **That claim
is false on both halves**, and no fix is warranted.

**Mableton is in `boundary_municipality`** — `kind='city'`, GEOID `1348288`,
`raw_name='Mableton city'`, `lsadc='25'`, `source_year=2025`. It was loaded in the
original backfill on 2026-06-07, months before this run.

**It was not in radius.** The run used `radius_miles = 3`. Mableton's boundary is
**13.84 mi** from the site (Johnson Ferry & Shallowford is East Cobb; Mableton is
West Cobb). The run's frozen list was correctly a single entry, Cobb County — the
nearest 3-mile neighbours are Roswell (1.26 mi) and Fulton County (1.26 mi), and
no Cobb city other than the county itself is within 3 miles. Mableton would not
appear until roughly a 14-mile radius.

So this is the **agent asserting a coverage gap that does not exist**, not a data
gap. Worth noting as an agent-accuracy signal in the same report that
under-claimed its own enumeration.

## Post-2020 GA incorporations: all present

The dataset is **TIGER/Line vintage 2025** (`source_year = 2025` on all 697 rows;
159 counties + 538 incorporated places, CDPs excluded), so it already includes
every GA incorporation through 2025. Spot-checked and present:

| City | Incorporated | In table |
|---|---|---|
| Mableton (Cobb) | Dec 2022 | ✅ `1348288` |
| Mulberry (Gwinnett) | 2024 | ✅ `1353706` |
| South Fulton | 2017 | ✅ `1372122` |
| Stonecrest | 2017 | ✅ `1373784` |
| Tucker | 2016 | ✅ `1377652` |

`upsert_boundary_municipalities` is idempotent on `(kind, state, geoid)`, so
re-running the backfill against a newer TIGER vintage is the maintenance path when
a future incorporation lands.

---

# Open items

## 1. No chunked run has actually executed (verification gap)

The slicing math is verified against nine window shapes (contiguity, month
alignment, no shared day, exact outer coverage) and the repo typechecks unchanged.
**The live path has not been exercised.** Nothing here has run
Custom → `create_sweep_with_chunks` → `ovis-sweep-tick` → OpenClaw end to end.

The exposure is low — it is the same RPC and the same tick engine the Deep Sweep
button already uses in prod, handed a different window array — but that is a claim
from reading code, not from a green run. First real test costs ~$12–$20.

A **free** partial check: open a site submit → Start Research → **Custom** → **Deep**
→ set a range past six months. The split notice and chunk list should render and
the button should read "Review — N sequential chunks" rather than firing a single
run. Only pressing Confirm spends anything.

## 2. Run `8183d6a2` is still bad data

The Cobb run that motivated all of this sits at `awaiting_review` with 1 record
and ~17 unenumerated months. The fix is not retroactive, and because the run is
standalone (`sweep_id IS NULL`) neither `get_sweep_gaps` nor `rerun_sweep_gaps`
can reach it.

To clear it: reject the run so its thin coverage stops stitching into
`get_research_coverage` as a covered segment, then re-run the site as a Custom
Deep 2024-09 → 2026-09, which now splits into 4 chunks.

## 3. Historical sweeps keep their phantom sliver segments

Month alignment only cleans up **new** runs. Sweeps already in the database keep
their 1-day `pass_count = 2` rows — 20 of 44 on the Grovetown sweep alone, and
every pre-existing sweep has them at each of its 5 boundaries.

If those slivers become annoying in the coverage UI, the cheap fix is a filter in
`get_research_coverage` rather than a data backfill: a 1-day segment whose depth
is exactly one higher than both neighbours is a boundary artifact, not real
double coverage. Not done here — it changes a shipped RPC's output for historical
data, which deserves its own decision.

## 4. The cost range is an estimate, not a measurement

`research_run.estimated_cost_cents`, `input_tokens` and `output_tokens` exist
(migration `20260901120000`) but are **NULL on all 62 runs** — the write path is
there, the agent side that would populate it is not, so nothing in OVIS knows what
a run actually cost.

So the `$3–$5` per chunk in the confirmation dialog is hand-derived: $3 from
`PER_CHUNK_COST_USD` in `ResearchRunApprovalModal`, ~$4.5 from the Aug 10 Hall
County sweep's ~$27 over 6 chunks. **Once the agent reports usage, replace the
constants with a query over recent `estimated_cost_cents` instead of widening the
hardcoded band.**
