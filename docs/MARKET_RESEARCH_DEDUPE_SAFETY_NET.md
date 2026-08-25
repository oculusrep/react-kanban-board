# Market Research — Dedupe Safety Net

Branch: `feature/research-dedupe-safety-net`

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
