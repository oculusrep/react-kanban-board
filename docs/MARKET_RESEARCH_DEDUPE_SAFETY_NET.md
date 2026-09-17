# Market Research — Dedupe Safety Net

Branch: `feature/research-dedupe-safety-net`

> **This doc is append-only history.** Each dated `#` section below records one
> change in sequence. For "how it works *now*," read the **Current behavior**
> summary immediately below; drop into the historical sections only for the why.

---

## Current behavior (as of 2026-09-17)

All dedupe lives in the review step (`ResearchRunApprovalModal.tsx`); nothing is
auto-rejected — every signal is surfaced for a human decision, and every reject is
reversible (Undo). Committing a staged row is what creates a `municipal_project`.

**Duplicate signals in play**

1. **Hard match** (`matched_existing_id`, computed at submit time) — same
   `permit_url` (municipality-agnostic), or exact-normalized name **and** address
   within the municipality. Shown as **MATCHES EXISTING**; deselected by default.
2. **Possible duplicate vs committed** — staged row geocodes within ~150m of a
   committed `municipal_project` (`find_nearby_municipal_projects` RPC).
3. **In-sweep location cluster** — staged rows within ~150m of *each other*
   (haversine, client-side), grouped into one "keep one" card.
4. **In-sweep name cluster** — staged rows with a fuzzy **name** match
   (Sørensen–Dice) + a unit-count tie-breaker, for rows proximity didn't pair.
5. **Approx-location → name vs committed** — rows whose address is too vague to
   geocode precisely (street-only) get no proximity check; instead they name+unit
   match against the whole committed pool (~242 rows, client-side).

**Geocode-precision guard** — street-only addresses (`GEOMETRIC_CENTER` /
`APPROXIMATE`) collapse every project on a road to one point, so they're excluded
from the proximity checks (2, 3) and flagged **APPROX. LOCATION** instead of
producing false duplicates. That's what routes them to signal 5.

**Matching knobs** (consts in the component): `NAME_STRONG` 0.82 (name-only
group), `NAME_WITH_UNITS` 0.60 (name+unit group), `UNIT_TOLERANCE` 10 (committed
match treats counts within ±10 as equal — they drift between submissions).
`corePhaseless` stops phase-numeral-only names ("Section I" vs "Section II") from
grouping on name alone. Name/committed matching is **unscoped by municipality** on
purpose — the dupes we want cross city/county lines (annexation, city-in-county).

**Review UI (triage)** — rows render compact (one summary line, expand to edit),
sorted into sections:
- **Duplicates to resolve — same location** — in-sweep location clusters with
  three resolutions: **Same project recorded twice** (keep one, reject the rest —
  the default), **Different projects at one address** (keep both; nothing
  rejected), **One project reported in parts** (merge: units summed, every row's
  source kept in notes). See the 2026-09-17 section.
- **Possibly the same — matched by name** — name clusters; keep-one control plus
  break-apart (**✕ separate** a row, or **Not duplicates — keep all**), persisted
  as not-a-duplicate pairs so a broken-apart card stays broken on reload.
- **Needs attention** — hard-match / possible-dup / approx-location rows, each
  showing the **conflicting committed record inline** (name, muni, units, permit
  link, distance/Δunits) so the call is made in place.
- **Clean & ready** (collapsed, bulk-select) and **Decided** (collapsed; rejected
  keep Undo).

---

## Problem

Even with a windowed lookback, P&Z records and news bleed across date and
jurisdiction boundaries. A "deep follow-up" run reaching further back in time
will sometimes surface a project a prior run already staged/committed. Before
this change the staging → approval flow had one dedupe probe (see below) with
real gaps, so the reviewer risked either re-committing a duplicate or manually
eyeballing every candidate against the map.

## What already existed (before this branch)

- **Submit-time hard match** — `submit_research_report` set
  `municipal_project_staging.matched_existing_id` when a candidate's normalized
  `(project_name, address)` matched a committed `municipal_project` **in the same
  resolved municipality**.
- **Review UI** — `ResearchRunApprovalModal` shows a solid **"MATCHES EXISTING"**
  badge on those rows and excludes them from the default selection.
- **Approve-time fold-in** — `approve_research_staging_rows` catches anything that
  slips through via the `UNIQUE (municipality_id, address, project_name,
  phase_label)` constraint (`ON CONFLICT`).

**The gaps:** the hard match is exact-normalized AND municipality-scoped, so it
misses (a) the same project under a slightly different name/address, and (b) the
same project committed under a different municipality (annexation / city vs
unincorporated) — exactly the cross-boundary bleed case.

## What this branch adds

### 1. `permit_url` hard match (municipality-agnostic)

Migration: `20260715173138_submit_research_report_permit_url_match.sql`

`matched_existing_id` is now `COALESCE(permit_url_probe, name_address_probe)`.
`permit_url` is effectively a globally-unique identifier (a link to a specific
permit/application record), so it is matched **without** the municipality scope —
catching the annexation-bleed case the name/address probe cannot. Near-zero
false positives. The original name/address probe is retained verbatim as the
fallback for candidates that have no `permit_url`.

Everything else in `submit_research_report` (off-checklist guard,
idempotency/replace-on-resubmit, defensive casts) is carried forward unchanged.

### 2. Soft proximity signal (centroid within ~150m)

Migration: `20260715173150_find_nearby_municipal_projects_rpc.sql`
Function: `find_nearby_municipal_projects(p_points jsonb, p_radius_meters numeric)`

Read-only, additive, no writes. Takes `[{staging_id, lat, lng}, ...]` and returns
committed `municipal_project` rows whose indexed `centroid` is within the radius
(default 150m), **ignoring municipality**. This is the cheapest strong
same-project signal that survives a different name AND a different address with no
shared `permit_url`. It is deliberately **soft** — surfaced for the reviewer,
never auto-rejected — because dense areas can host genuinely distinct nearby
projects (we chose proximity over name-trigram precisely to avoid the noise of
"Truitt Preserve" vs "Truitt Townhomes" false positives).

### 3. Review UI

`ResearchRunApprovalModal.tsx`:

- On load, a non-blocking effect geocodes each **pending, not-yet-hard-matched**
  row (address present) and calls the RPC. Failures are swallowed with a
  `console.warn` — the dup check can never break approval.
- Rows with a nearby committed project get a dashed **"⚠ POSSIBLE DUPLICATE ·
  ~Nm"** chip (visually distinct from the solid "MATCHES EXISTING" badge). The
  chip `title` lists each nearby project's name, distance, municipality, and
  address so the reviewer can judge without leaving the modal.
- The bulk-controls summary shows a "checking for nearby projects…" indicator and
  an "N possible duplicates nearby" count.
- **Possible-dup rows stay selected by default** (unlike hard matches, which are
  deselected). A ~150m proximity hit is a flag to act on, not a decision — we
  don't want to silently drop a genuinely new project.

## Design notes / tradeoffs

- **Why geocode at review-load rather than persist coords on staging?** Candidates
  aren't geocoded until approval in the normal flow. Rather than add lat/lng
  columns + a write-RPC + refactor the approve path (persist-once, reuse), v1
  keeps this a pure read: geocode the handful of unmatched pending rows at load
  and pass points into the RPC. Cost is a few Google geocodes per modal open. If
  that latency/cost proves annoying, the upgrade is to persist the geocode on
  `municipal_project_staging` and have both the dup check and approve reuse it.
- **Radius** is a parameter (default 150m); tune in the RPC call site if dense
  suburban parcels produce false positives.

## Applying

Migrations are file-only on this branch — not yet pushed to the remote DB. Apply
with `supabase db push` (or the psql fallback) once the branch is validated /
merged. No changes to the submit or approve write paths beyond the
`matched_existing_id` computation, so the new RPC and the permit_url probe can be
applied independently.

## Production apply & rollback

Both migrations are **additive and non-destructive** — no `ALTER TABLE`, no
`UPDATE`/`DELETE`, no dropped columns, no constraint changes, no touch to the
commit path (`approve_research_staging_rows`). Migration A is a `CREATE OR
REPLACE` of `submit_research_report` whose ONLY delta vs the currently-deployed
20260714140000 definition is wrapping `matched_existing_id` in
`COALESCE(permit_url_probe, name_address_probe)` — verified line-for-line
identical everywhere else (all guards, casts, INSERT column list preserved).
Migration B is a brand-new function with no caller until the UI ships, so it is
inert on the DB until then. Both use `CREATE OR REPLACE`, so re-running is safe.

### Rollback

**Migration B** (`find_nearby_municipal_projects`) — drop it:
```sql
DROP FUNCTION IF EXISTS public.find_nearby_municipal_projects(jsonb, numeric);
```

**Migration A** (`submit_research_report` permit_url match) — restore the prior
definition by re-applying the *exact* pre-change body, which is the committed
file `supabase/migrations/20260714140000_submit_research_report_idempotent.sql`.
It's a `CREATE OR REPLACE` with the same signature, so re-running it reverts
`matched_existing_id` to the name/address-only probe. No data is touched — rows
already staged keep whatever `matched_existing_id` they were assigned; only the
computation for *future* submits changes back.
```sql
-- Paste the full body of 20260714140000_submit_research_report_idempotent.sql,
-- or dump it from the repo:
--   git show HEAD:supabase/migrations/20260714140000_submit_research_report_idempotent.sql
```
Neither rollback affects `municipal_project`, `municipal_project_staging`, or any
existing row.

## Not in this branch

Run depth tiers / lookback windowing + per-municipality "researched back to"
coverage is the second, separately-sequenced piece — tracked apart from this
dedupe work.

---

# Review UX follow-up — reversible reject, comparison panels, filters (2026-08-13)

The safety-net work above surfaced the *signals* (hard match, possible-duplicate,
in-sweep-duplicate) but only as **badges with hover tooltips**. In practice the
reviewer still had to scroll every row, couldn't see the competing record next to
the one being judged, and — worst — **reject was a one-way door** with no undo.
This follow-up closes those UX gaps. No change to the dedupe *logic*; it's all in
how the signals are presented and acted on.

Component: `src/components/shared/ResearchRunApprovalModal.tsx`
Migration: `20260813120000_unreject_research_staging_row.sql`

### 1. Reversible reject (Undo)

Rejected staging rows were already soft-deleted (`approval_state='rejected'`, kept
forever for audit — `20260606130000`); there was simply no RPC to flip one back.

- New `unreject_research_staging_row(p_staging_id)` — inverse of
  `reject_research_staging_row`. Moves `rejected → pending` and **re-opens** a run
  that reject had auto-closed: from `archived` **or** `approved` back to
  `awaiting_review` (either terminal state can still carry rejected rows).
- Every rejected row now shows an **↩ Undo** button. It is gated on `canApprove`,
  **not** `isReadOnlyRun`, on purpose: a single run that auto-archived after
  "reject all" is otherwise read-only, which would re-trap the user — Undo is the
  one control that must survive the terminal state (it's what un-terminals it).

### 2. Comparison panels (which record do I reject?)

The competing record now renders **inline** beneath the badges, instead of only in
a tooltip:

- **Possible duplicate** (near a committed project): a panel listing each nearby
  `municipal_project` — name, distance, municipality, address — so the reviewer
  sees exactly what they'd be duplicating on the map.
- **In-sweep duplicate** (sibling staged rows from adjacent chunk windows): a panel
  listing each sibling (name, address, units, chunk, state) plus a
  **"Keep this · reject the other(s)"** one-click resolver (`handleKeepOne`). It
  rejects the still-pending siblings and keeps/selects this row. Each reject is
  reversible via Undo, so it's a fast path, not a commitment.

### 3. Filters — cut the scroll on big sweeps

Filter chips above the list (`focusFlagged`, `hideApproved`, `hideRejected`) plus a
**flagged-first sort** (`sortWeight`: flagged-pending → clean-pending → approved →
rejected) applied per municipality group (`displayGroups`). "⚠ Needs attention"
focus mode hides clean pending rows so only matches / possible / in-sweep dupes
remain. Decided rows stay reachable (so Undo/history remain visible) unless
explicitly hidden.

### Follow-ups deferred

- "View on map" deep-link from a possible-duplicate entry to the committed
  `municipal_project` pin (skipped for now to avoid guessing the map route).
- The nearby/in-sweep check re-geocodes on every `staging` mutation (pre-existing);
  a keep-one action that rejects several siblings triggers several re-geocode
  passes. Fine at current volumes; revisit if sweeps get large.

---

# Geocode-precision guard for in-sweep dedupe (2026-08-22)

Branch: `feature/market-research-dedup-precision`

## The bug this fixes

Validating the review UX on the real Grovetown Deep Sweep (`ec45f5f1`, ~45 pending
rows) exposed a false-positive storm in the in-sweep check. Reproducing the modal's
exact logic against live data produced an **8-cluster** result, including one
**cluster of 9** that lumped together the Tillery Park sections *and* three clearly
distinct developments — Arden Glen, Warriors Walk, Kelarie — all at "~0m".

Root cause (verified against the Google Geocoding API, not assumed): those rows have
**street-only addresses** ("Baker Place Road", "Off Baker Place Road", "William Few
Parkway"). Google resolves a street-only address to the **road centroid** —
`location_type = GEOMETRIC_CENTER`, `types = route` — so *every* project fronting
that road lands on the identical point. The haversine check then sees 0m and flags
them all as the same project. Address-level rows ("409 Whiskey Road", "408
Newmantown Road") resolve `ROOFTOP` and dedupe correctly.

So the 150m proximity signal is only meaningful when both points are address-level.
Clicking "Keep this · reject the others" on that cluster of 9 would have rejected
several legitimate projects (recoverable now via Undo, but still wrong).

## The fix

`geometry.location_type` is the definitive precision tell; it just wasn't being
carried out of the geocoder.

1. **`geocodingService.ts`** — `GeocodeResult` gains an optional `location_type`
   (`ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE`), populated from
   the Google path. Undefined on the OSM fallback (which we treat as usable, so the
   fallback path is unchanged).
2. **`ResearchRunApprovalModal.tsx`** — the dedupe effect marks a geocode
   **low-precision** when `location_type` is `GEOMETRIC_CENTER` or `APPROXIMATE`.
   Low-precision points are **excluded from both** the in-sweep pairwise math and
   the `find_nearby_municipal_projects` (possible-duplicate) RPC call. This is
   conservative on purpose: we only suppress when we have positive evidence of
   imprecision — `ROOFTOP`, `RANGE_INTERPOLATED`, and undefined (OSM) still dedupe.
3. **No silent drop** — excluded rows get an `ℹ APPROX. LOCATION · dup-check
   skipped` badge (tooltip explains why) and count as "needs attention" in
   `isFlagged`, so **focus mode keeps them visible** — the reviewer is told the
   check couldn't run and to compare the address by hand, rather than being shown a
   false "no duplicate" all-clear.

Net effect on Grovetown: the cluster of 9 collapses to the genuine address-level
dupes (409 Whiskey ×2, 408 Newmantown ×2, 210 E Robinson ×2, adjacent phases), and
the street-only rows are surfaced as "check by hand" instead of false duplicates.

## Follow-ups still open

- Optionally add name-similarity as a second signal so two street-only rows with the
  same project name can still be paired (proximity alone can't, by design here).
- The "view on map" deep-link and the re-geocode-per-mutation cost noted above.

---

# Triage redesign of the approval modal (2026-08-24)

The badges/filters/panels above made a single row *judgeable*, but a real Deep
Sweep (~45 rows across 6 chunks) still rendered as one ~20,000px wall: every row
was a fully-expanded 10-field edit form, and duplicate pairs sat far apart in
municipality order. "Is this the best we can do? — it's still hard to follow."

`ResearchRunApprovalModal.tsx` is now organized around **decisions, not rows**.

### Compact rows, expand-to-edit

Each row renders as a one-line summary (`▸ project name · badges` + `muni ·
address · units · chunk`). The full `fieldEditor` only mounts when the reviewer
clicks a row to expand it (`expandedRows` set). This alone cuts the height ~10×.
Render is factored into helpers — `rowCard`, `clusterCard`, `fieldEditor`,
`comparisonPanels`, `rowBadges`, `rowSummaryLine`, `sectionShell` — all plain JSX
functions (not inline component definitions, to avoid the remount/click-swallow
trap in [[feedback_mousedown_rerender_swallows_clicks]]).

### Four triage buckets (was: municipality groups)

`clusters` (union-find over the in-sweep sibling graph among pending rows) +
`triage` (useMemo) split everything into:

1. **Duplicates to resolve** — each in-sweep cluster is ONE `clusterCard`:
   members stacked, a radio picks the keeper (`keeperByCluster`), and one
   "Keep selected · reject the other N" button calls `handleKeepOne`. Replaces the
   old scattered per-row "keep this" panels. Always shown.
2. **Needs attention** — pending rows flagged matches-existing / possible-dup /
   approx-location (not in a cluster). Always shown, compact.
3. **Clean & ready** — unflagged pending rows. Collapsed by default
   (`sectionShell`), with a "Select all N" affordance; they're already selected by
   default so the footer's Approve & Commit still just works.
4. **Decided** — approved + rejected, collapsed by default; rejected rows keep
   their ↩ Undo.

The old municipality grouping, `displayGroups`, `sortWeight`, and the
`focusFlagged`/`hideApproved`/`hideRejected` filter chips are gone — the buckets +
collapse toggles replace them. A summary bar up top gives the counts
("N to review · K duplicate clusters · … · S selected to commit").

No dedupe *logic* changed here — same signals, same RPCs, same precision guard;
purely how they're laid out and acted on.

---

# Name(+unit) in-sweep dedupe signal (2026-08-24)

Until now every dedupe signal was geographic (150m proximity) or an exact
name+address match against committed rows. Nothing caught two staged rows that
are the same project under near-identical names — and crucially the APPROX.
LOCATION rows (proximity disabled) got **zero** dedupe. This adds a fourth,
client-side, in-sweep signal: fuzzy **name** match with **unit count** as a
tie-breaker. It runs on pending rows the geographic check didn't already pair,
including approx-location rows.

Client-only (no SQL): `normalizeProjectName`, `diceCoefficient` (Sørensen–Dice
over char bigrams), `corePhaseless`, and the `nameClusters` useMemo in
`ResearchRunApprovalModal.tsx`.

### Match rule ("Balanced", precision-tuned)

Two pending rows group if **either**:
- unit counts are present and equal AND name similarity ≥ 0.60, **or**
- name similarity ≥ 0.82 AND they don't differ *only* by a phase/section numeral.

That last clause is the key correction. Section/phase names ("Highland Lakes West
Section I" vs "… Section II") score 0.93–0.98 similarity and would falsely group
on name alone. `corePhaseless` strips digit + roman-numeral tokens; if two names
share the same core but differ in the original, they're treated as distinct phases
and only group when unit counts also agree. Verified on the live Grovetown sweep:
the naive rule produced 6 clusters (3 false phase pairs — Highland Lakes I/II,
Tillery III/IIIA, Wrights Farm III/IV); the refined rule produces 3, all
defensible (Greenpoint North Phase 1 / Section 1 @128u; Marshall Mills ×2;
Tillery Park Area 7 ×2 @98u).

### UX — separate section, easy to break apart

Name clusters render in their **own** "Possibly the same — matched by name"
section (terracotta), separate from the confident geographic "same location"
clusters, each labelled with *why* it grouped ("similar name + matching unit
count (128 units)" vs "similar name — confirm these aren't separate phases"). They
reuse the keep-one `clusterCard` but add break-apart controls, because fuzzy
matching WILL occasionally mis-group:
- **✕ separate** on a member (clusters of 3+) pulls one row out.
- **Not duplicates — keep all** dismisses the whole cluster.

Both add the row id(s) to `dismissedNameDup`, which excludes them from
re-clustering so they fall back into the normal flow (selected for approval).
Nothing auto-rejects; every reject stays reversible via Undo.

Thresholds (`NAME_STRONG` 0.82, `NAME_WITH_UNITS` 0.60) are consts at the top of
`nameClusters` — tune there.

---

# Needs-attention: show the conflicting record inline (2026-08-24)

Feedback: the "Needs attention" bucket showed only a badge, so the reviewer still
had to go find the thing being conflicted with — "if it matches an existing, I
want to see the existing details with it … don't want to search elsewhere."

Now every needs-attention row renders its conflict evidence **inline and
always-visible** (not behind expand), via `conflictPanels(r)`:

- **Hard match** — a new effect fetches the referenced committed
  `municipal_project` rows (`committedById`, keyed off `matched_existing_id` and
  the nearby-project ids; RLS `municipal_project_read` = `authenticated/true`,
  embed via the `municipality_id` FK). The panel shows the existing record's name,
  municipality, address, units, builder, and a `permit ↗` link, framed "Duplicate
  of a record already on the map — this row is deselected by default."
- **Possible duplicate** — the nearby committed project(s) now render with full
  detail (units/builder/permit), enriched from `committedById`, with distance.
- **Approx location** — since no scan could run, the panel surfaces the row's own
  `location_description` / `parcel_boundary_notes` placement hints (or says there
  are none) so the reviewer can verify against the map.

`conflictPanels` renders always in `rowCard` (the field editor stays behind
expand); it returns null for unflagged rows, so Clean/Decided are unaffected. The
section header now reads "a conflicting record was found, or the location couldn't
be checked (details on each row)" instead of an opaque count.

Not done: for approx-location rows there's still no *automated* candidate conflict
(proximity is disabled and the name signal only runs staged-vs-staged, not against
committed) — the panel shows placement hints, not a matched committed record. A
name-vs-committed search for those rows is a possible follow-up.

---

# Approx-location: name(+close-unit) match vs committed projects (2026-08-25)

Closes the gap above. A street-only address can't be location-matched, so these
rows now fall back to matching against the **committed** projects by name with a
**close** unit count.

Key decision (from the domain): the match is **unscoped by municipality**. The
same project legitimately appears under different municipalities — a city inside a
county (Grovetown vs Columbia County vs the "Evans" CDP), annexation over time,
boundary-straddling. Scoping to "same municipality" would filter out exactly the
cross-boundary dupes we want (and dodges the `boundary_municipality` vs
`municipality` two-table mismatch). Precision comes from match strength instead.

No RPC/migration: `municipal_project` is small (~242 rows, pg_trgm not enabled), so
`committedPool` is fetched whole (only when `lowPrecisionGeo` is non-empty) and
matched client-side in `committedNameMatches`, reusing `normalizeProjectName` /
`diceCoefficient` / `corePhaseless`.

Match rule (`UNIT_TOLERANCE = 10`): a committed row is a candidate when it isn't a
phase-numeral-only difference AND either
- both unit counts are present and **within ±10** AND name sim ≥ 0.60, or
- a unit count is missing AND name sim ≥ 0.82.

The ±10 tolerance is deliberate — counts drift between P&Z submissions, so exact
equality is too strict. Verified on live data: "Chamblin Road Gateway
Development" [57] correctly matches committed [57]; "Hamilton Grove" staged [36]
is correctly **held back** from committed "Hamilton Grove" [131] (Δ95 > 10) — same
name, but the counts are too far apart to call it the same project. Zero spurious
matches across the staged set.

UX: when hits exist, the approx-location panel turns terracotta and lists the
matched committed record(s) with `ΔN units` / "exact unit match", above the
placement hints. When there are none, it's the prior grey "verify by hand" note.

---

# Keep both / merge on same-location clusters (2026-09-17)

Branch: `feature/research-dedupe-keep-both-merge` · migration
`20260917093017_staging_dedupe_keep_both_merge.sql` (applied to prod + recorded
2026-09-17).

**Status: SHIPPED.** Merged to `main` as `a0b703c5` on 2026-09-17 (deploys
via Vercel). Reviewed and accepted.

**Live test still open:** the Cumming City Center run (`90ac2318…`) is still
pending. Open it, choose **Different projects at one address** on the Garden
District (74) / Overlook (301) card, and commit. Expected result: two separate
`municipal_project` rows at 74 and 301 units, `approved_new` = 2, and no rejected
rows. Don't touch Hall County (Old Winder, hand-resolved at 143).

## Why

The location cluster card only offered "keep one". Proximity fired correctly on
two real pairs where both rows were legitimate, so keep-one threw away real units
and a citation:

- Hall County — "Old Winder Highway Townhome Development" (105) + "Gilliam Old
  Winder Highway Townhome Expansion" (38): two phases, one address. Hand-resolved
  in prod to one committed record at 143 before this shipped.
- Cumming — "Garden District at Cumming City Center" (74) + "Overlook at Cumming
  City Center" (301): two parts of one mixed-use development. Left pending on
  purpose as the live keep-both test.

The name/address hard match can't catch these pairs (normalization can't reconcile
the names), so the fix hangs off the proximity cluster.

## The three resolutions

Wording is based on what the rows *are*, not on convenience. Merge is offered on
real duplicates too, and merging a duplicate by reflex inflates unit counts.

| Option | Label | Effect |
|---|---|---|
| keep one (default) | Same project recorded twice | reject the others (bulk reject, reason recorded) |
| keep both | Different projects at one address | persist not-a-duplicate pairs; every row stays pending + selected |
| merge | One project reported in parts | fold rows into the selected survivor |

Neither new path writes `reject_reason` / `rejected_by_id` / `rejected_at`.

## Schema

`municipal_project_staging` (additive):

- `not_duplicate_of_ids uuid[] NOT NULL DEFAULT '{}'`: symmetric "different
  project" pairs. The client clustering (location + name) skips marked pairs.
- `merged_into_staging_id uuid` (FK to staging, `ON DELETE SET NULL`), set on folded rows.
- `merge_snapshot jsonb` on the survivor: pre-merge unit columns, notes, status,
  permit_url, source, folded_ids. Undo restores from it. (This is a third column
  beyond the two planned; the snapshot needs somewhere to live.)
- `approval_state` CHECK now allows `'merged'`. Every existing consumer filters
  on `= 'pending'` / `<> 'pending'`, so merged rows count as reviewed and are
  excluded from the site-research agent's pending read (no double count).

## RPCs

- `mark_research_staging_not_duplicates(p_rows jsonb, p_anchor_id uuid)`: keep
  both / not duplicates / ✕ separate (anchor = only anchor↔others).
- `clear_research_staging_not_duplicates(p_staging_id)`: Undo keep both.
- `merge_research_staging_rows(p_keep_id, p_fold_ids uuid[])` /
  `unmerge_research_staging_rows(p_keep_id)`: merge and Undo merge.
- `approve_research_staging_rows`: rebuilt from the live definition with two
  additions (marked `ADDED 20260917`): the keep-both collision guard, and stamping
  folded rows with the survivor's committed `approved_municipal_project_id`.
- `get_sweep_staging`: adds `phase_label`, `not_duplicate_of_ids`,
  `merged_into_staging_id`, `is_merge_keeper`.

## Collision guard (the conflict key)

Commit is `INSERT … ON CONFLICT (municipality_id, address, project_name,
phase_label) DO NOTHING`. The key uses exact strings; coordinates aren't part of
it. On a conflict the row is marked approved, pointed at the existing project,
and counted `approved_matched`, and its units are gone with no message. That fold-in
is correct for a row that re-finds an already-committed project. It is wrong for two
rows the reviewer said are different projects.

- Keep both refuses (`keep_both_collision`) if any marked pair would share
  that key, using the reviewer's unsaved name/address/phase edits. The modal
  expands the rows so the new **Phase label** field is right there.
- Approve raises `keep_both_collision` (whole call rolls back) if the
  project a row would fold into was committed from a row marked not-a-duplicate
  of it. This catches edits made *after* keep both.

Neither the Cumming nor the Hall County pair collides (the names differ).

## Merge rules

- Each unit column is summed (NULL only when every row is NULL).
- Notes: a header, then one dated block per row, oldest first:
  `— name · N units · zoning approved / permit applied / staged date —`,
  `Source: …`, `Permit: …`, then the row's own notes. `municipal_project` has one
  `permit_url` and one `source`, so the extra citations live here.
- Status: taken from the row with the most recent dated event (GREATEST of zoning
  approval / permit application date), falling back to staged time. Not staging
  order, which only reflects how the agent searched. Rows with no status are skipped.
- permit_url / source: the survivor's own values, filled from the most recent
  other row only if the survivor has none. Name, address and dates stay the survivor's.
- Before applying, the card shows the sum (`105 + 38 = 143 units`). If two rows
  share a unit count, it warns inline, and clicking Merge requires a confirm ("Both
  rows report 74 units — likely a copy … Merging records 148").
- Refused when: a row isn't pending, a row is already a merge survivor, a row
  hard-matches a committed project (its values would never be written), or a
  member has unsaved edits to units/notes/permit/source.
- Undo merge only works while the survivor is uncommitted. After commit, edit
  the committed project instead.

## Verification

Round-trip in one transaction ending in `ROLLBACK`, impersonating an approver,
run on the Cumming pair: merge (375, dated notes, folded row `merged`, no reject
fields) → double-merge refused → unmerge (74/301 restored) → keep both refused on
a forced same-name collision → accepted once a phase label differs → approve with
colliding edits raises and commits nothing → Undo keep both clears both directions
→ merge + approve stamps the folded row with the committed project → unmerge after
commit refused. Prod apply afterwards left Cumming pending and Hall County (143)
untouched. The modal typechecks clean. It hasn't been clicked through in a browser
yet; the Cumming live test above covers that.

## Files

- `supabase/migrations/20260917093017_staging_dedupe_keep_both_merge.sql`: columns,
  CHECK, the four new RPCs, the rebuilt `approve_research_staging_rows` and
  `get_sweep_staging`
- `src/components/shared/ResearchRunApprovalModal.tsx`: `ClusterResolution` /
  `RESOLUTION_OPTIONS`, `isNotDup` (clustering + inSweep flag), `handleKeepBoth`,
  `handleUndoKeepBoth`, `handleMerge` (edit guard, equal-count confirm),
  `handleUnmerge`, `mergeArithmetic`, `clearMergeFieldEdits`, the resolution chooser in
  `clusterCard`, KEPT SEPARATE / MERGED / MERGED INTO badges with Undo buttons, the
  Phase label field, and merged rows in Decided

## Follow-ups

- Merge only applies to location clusters. Name clusters (e.g. "Section I" /
  "Section II") could want it too; not built.
- Merge leaves the survivor's zoning/permit dates alone while status may come from
  the other row, so the committed record can show a status newer than its dates.
- The "Possible dup vs committed" panel (staged row vs an already-committed
  project) still has only approve/reject. Merging into a committed project isn't
  supported.

