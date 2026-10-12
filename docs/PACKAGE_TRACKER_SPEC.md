# Starbucks Package Tracker — Spec

**Status (2026-10-12): Phase 1 (schema) written and round-trip tested. Not applied: waiting on Mike's OK.** Branch `feature/package-tracker`.

Decisions from 2026-10-12 are in the decisions file §2.29. Where this spec still describes the earlier proposal, those decisions override it: colours locked, no access restriction for Noree, and a `DealHeaderBar` mount for deals with no site.

## Build phases (stop for review after each)

| Phase | Scope | State |
|---|---|---|
| 1 | Tables, `deal_court_event` + backfill, task link + clock-trigger fix + test, progress views | Written; round trip passes; **not applied** |
| 2 | Start Package, badge, slide list (SiteSubmitSidebar + DealHeaderBar), once-only gate-date entry, slide-template settings | — |
| 3 | Noree's Tasks queue (drag order, input-gated release), set as her default landing page | — |
| 4 | Board card bar + "N waiting on Mike"; pipeline report shows computed progress | — |

Read `STARBUCKS_DEAL_BOARD_DECISIONS.md` first. Its principles govern this feature too. The locked
package decisions are in its §2.29. This file replaces the board's "Deck completion tracking (phase
2, separate spec)" deferral.

---

## 1. Purpose

Every Starbucks deal needs an 11-slide PowerPoint package. The tracker:

- records the status of each slide on each deal,
- shows % complete on the deal board card,
- flags a package that has fallen behind the deal, so the slides aren't all built at the end.

It does not build slides. It tracks who owes which slide, and whether that matches where the
negotiation is.

---

## 2. The package

- **The package belongs to the deal, not the site_submit.** It can't start until a deal exists.
  Site_submit-only board cards (§2.27) have no package and show no bar.
- **Manual start only.** The deal sidebar has a "Start Package" button. Clicking it creates the
  package, its 11 slide rows and Noree's first tasks. Nothing creates a package automatically.
- **Sidebar badge states:**

  | State | Badge |
  |---|---|
  | No package | `Start Package` button |
  | Started, nothing in progress | `Sent to Noree · Oct 11` |
  | Started, nothing in progress for 3+ days | same text, amber border |
  | Any slide past Not started | progress bar `X of Y · N waiting on Mike` |

  The 3-day stale threshold goes in config (`PACKAGE_STALE_DAYS`), next to the board's heat
  thresholds.

---

## 3. Slides

These are defaults. **Owner, the setup/finish split, approval and inputs are settings Mike edits in
the app**, because they will change as he trains Noree. Nothing below is hard-coded in components.

| # | Slide | Default mode | Inputs | Ordering |
|---|---|---|---|---|
| 1 | Drive Time | Noree completes, Mike approves | — | — |
| 2 | Demo Map | Noree sets up, Mike finishes | Market Research | — |
| 3 | Market Aerial | Noree sets up, Mike finishes | Market Research | after Demo Map |
| 4 | Generators | Noree sets up, Mike finishes | Market Research + Site Story | — |
| 5 | Site Plan | Mike | Site plan received | — |
| 6 | Site Access | Mike | Site plan received | — |
| 7 | Rent Comps | Mike | — | start early |
| 8 | Analogous Store | Mike | — | — |
| 9 | Placer | Noree completes, Mike approves | — | done at package start |
| 10 | Deal Terms | Mike | Final LOI | always last |
| 11 | Road Improvements | Mike | DOT study | can be N/A |

**Modes.** Each slide has one of three modes:

- `mike`: Mike does all of it.
- `noree_approve`: Noree does it and Mike approves.
- `noree_setup_mike_finish`: Noree sets it up and Mike finishes it.

The mode is stored per template slide and **copied onto the package's slide row when the package
starts**. A settings change applies to packages started afterwards. It does not rewrite packages
already in flight, because a slide Noree has finished shouldn't change owner under her.

### Input sources

| Input | Signal | Source |
|---|---|---|
| Market Research | ≥1 `research_run` with `state = 'approved'` for `deal.site_submit_id` | existing |
| Site Story | ≥1 `research_thread_run` with `kind = 'deep_pass'` and `state = 'complete'`, via `research_thread.site_submit_id` | existing |
| Site plan received | package checkbox, with a timestamp | new, on the package |
| DOT study | package checkbox, with a timestamp | new, on the package |
| Final LOI | package checkbox, with a timestamp (this is also Gate 3, §5) | new, on the package |

Both research features key on `site_submit_id`. **A deal with no site_submit can never satisfy the
Market Research or Site Story inputs.** Those slides stay Waiting on Mike, and the UI says why: "no
site linked".

Open on Market Research: should `awaiting_review` count as "run"? The run has finished but Mike
hasn't approved it. The default above is approved-only, because that matches "an input Mike hasn't
produced".

---

## 4. Statuses and % complete

`not_started → in_progress → waiting_on_mike → done`, plus `na`.

- **% complete = done ÷ applicable slides.** N/A slides are excluded. Waiting on Mike is not done.
- **A missing input counts as Waiting on Mike.** This is derived when the package is read, not
  stored. If a slide's inputs aren't all ready, it displays and counts as Waiting on Mike, whatever
  its stored status is. That way it can never be stale: running Market Research releases Demo Map
  without any write.
- **Noree's check-off moves the slide forward:**
  - `noree_approve`: Noree checks it off → waiting on Mike → Mike approves → done.
  - `noree_setup_mike_finish`: Noree checks off her setup → waiting on Mike → Mike finishes → done.
- **N/A** is allowed only where the template allows it. Road Improvements is the only one by
  default.

**"N waiting on Mike"** counts the applicable slides that are stored as `waiting_on_mike`, plus
those blocked on an input.

---

## 5. Gates (pacing)

Gates follow the deal's ball-in-court history in Negotiating LOI.

| Gate | Event | Required by then |
|---|---|---|
| 1 | First LOI draft sent: the first flip to *their* court after the deal entered Negotiating LOI | Drive Time, Placer, Analogous Store done; Road Improvements done, or N/A if the DOT study is in; Rent Comps at least in progress |
| 2 | Landlord's first response: the first flip back to *our* court after Gate 1 | Everything done except Deal Terms |
| 3 | Ready for Adam to sign | 100% |

**Gate dates are the court start date (`ball_in_court_since` at the flip), not the save time.** The
pipeline report's court editor back-dates, and pacing has to follow the real date.

**Recon finding: no structured flip history exists.** See §9 Q1. The spec needs a court-event log
before gates can work. That is the one schema addition this section depends on. It adds no field to
`deal`.

**Gate 3 detection.** Options are in §9 Q6. The recommended option is the package's "Final LOI in"
checkbox, timestamped.

### Pace states

| State | Rule |
|---|---|
| On pace | The current gate hasn't passed, or it passed and everything it requires is met |
| Behind | A gate has passed with required items missing |
| Late | Behind for `PACKAGE_LATE_DAYS` (7, tunable) or more since the gate date |

A deal that hasn't reached Negotiating LOI has no gate yet and is always on pace.

---

## 6. Board display

- **A thin progress bar on deal-backed cards that have a package**, plus `N waiting on Mike` when N
  > 0.
- **Card heat stays ball-in-court only.** Package state never changes heat, sort order or the daily
  number. Pace is shown on the bar only.
- **Bar colours (locked 2026-10-12):** slate when on pace, a terracotta outline (`#A27B5C`) when
  behind, solid terracotta when late. No green (§2.7), and nothing from the heat palette. Unknown
  gate dates render as absence (dashed and dim), never as on pace.
- **§1.1 (the board never scrolls).** Columns already fall back to compact tiles to fit (§5,
  2026-10-09). The bar has to fit inside the existing tile height. Compact tiles get a 2px bar and
  no text.
- Pipeline report: `starbucks_pipeline_report_row.package_status` (free text, "becomes a %
  complete fed by another tool") is replaced by the computed `X of Y` + pace. The column is dropped
  once nothing writes it.

---

## 7. Noree's Tasks screen

- **One queue of everything assigned to Noree:** package slide tasks and the ordinary tasks Mike
  assigns her.
- **Mike sets the order by drag and drop.** The queue order is per owner, using the `quick_note`
  midpoint `double precision` rank pattern.
- **Dependent package tasks appear only once their inputs are ready.** All of Noree's package tasks
  are created at Start Package. The queue then hides any whose slide inputs aren't ready, as a read
  filter. Nothing has to fire when Market Research is approved.
- Noree checks off her part. The slide moves as described in §4.
- **This is Noree's screen, not a task view on Mike's board.** The board's permanent "no separate
  today/task view" rule (§3 of the decisions file) is about Mike's surface and isn't reopened.
  Mike gets the same queue as an editor (to reorder and assign), reached from the package, not
  from the board.

### Reusing `task`

Package work for Noree is stored as ordinary `task` rows (`owner_id` = Noree, `assigned_by_id` =
Mike, `deal_id` + `site_submit_id`), linked to the slide by a new `task.package_slide_id`. Mike's
own slide work does **not** become tasks. It lives on the package.

**Landmine: `task` inserts reset the board clock.** `trg_reset_clock_on_task_insert` fires on any
task carrying `deal_id` or `site_submit_id`. Start Package inserts several, so it would cool the
card. That would let package activity drive heat, which breaks §1.2 and §1.4. The task triggers'
`WHEN` clause must add `AND NEW.package_slide_id IS NULL`, and that has to be tested by inserting
package tasks and confirming `ball_in_court_since` doesn't move. Completing a task (a status
update) doesn't reset the clock today. Only `due_at` changes do.

---

## 8. Access (Noree)

Noree has a user row (`noree@oculusrep.com`), an auth user, and `ovis_role = 'va'`. She is the only
active VA. `va` currently has broker_full-level access in both the UI and RLS
(`is_internal_user()`).

To restrict her to her task screen and package checkboxes:

- **New permission keys** in `src/types/permissions.ts`: `can_view_package_queue`,
  `can_check_package_slides`, `can_manage_package_settings` (admin only), and
  `restricted_to_package_queue`.
- **A route guard modelled on `CoachRoute`.** When `restricted_to_package_queue` is true, every
  route redirects to the queue, and a minimal navbar is shown (as `CoachNavbar` is for coaches).
- **Set the restriction as a user-level override on Noree, not on the `va` role**, so a future VA
  doesn't inherit it.
- **This is UI-only.** At the database level she is still an internal user and can read
  deals/tasks. A real data restriction would mean splitting `is_internal_user()` or adding a role.
  That's a bigger change, and Mike has to decide whether he wants it. Package-table RLS can still
  limit her writes to `status` on slides she owns.
- **User Management needs** the four keys to appear in the permission editor, and the restriction
  toggle to be visible on the user row.

---

## 9. Recon answers (2026-10-11)

**Q1. Flip history.** Only the latest is stored. `deal_activity_state` holds `ball_in_court` /
`ball_in_court_since` and nothing else. Since `20261009172325`, a trigger writes a
`site_submit_comment` row (`origin = 'board_history'`) per court change, but:

- it is free text ("Ball → Them (Landlord) — …"),
- it is stamped at save time, not the back-dated court date,
- it is skipped when `auth.uid()` is null,
- it starts 2026-10-09 (9 rows so far).

The pipeline report reads only the current state.

A second, older history exists: `document_handoff` / view `document_handoff_history` (LOI | Lease,
holder `us` | `ll`, `changed_at`). That is a real flip log. It is shown on the master Kanban and
`DealHeaderBar`, but it covers only **5 of 13** Starbucks deals in Negotiating LOI.

Proposed fix:

- New `deal_court_event` table, written by a trigger on `deal_activity_state` when the court
  changes. Columns: deal / site, court, party, `effective_at` = the new `ball_in_court_since`,
  `recorded_at`, author.
- Gates then read it, bounded by the Negotiating LOI entry date from `deal_stage_history`.
- **The 13 deals already in LOI have no recoverable flip dates.** Backfill from `document_handoff`
  where it exists. For the rest, have Mike enter Gate 1 / 2 dates once, or treat them as "gate date
  unknown". Unknown renders as absence (§1.7), never as on pace.

**Q2. Market Research / Site Story.** Both can be detected, and both key on `site_submit_id`:

- Market Research: `research_run.state`.
- Site Story: `research_thread` → `research_thread_run` (`kind`, `state = 'complete'`).

Today, among the 13 LOI deals, 7 have an approved Market Research run and 2 have a complete deep
pass.

**Q3. Reuse.** Use `task` for Noree's queue. It has `owner_id`, `assigned_by_id`, `deal_id`,
`site_submit_id`, status and completion. It has **no per-user order column**: the only drag rank is
`task_block_scheduled_task.manual_rank`, which orders tasks within a time block. `assignment` is
the client-engagement table, not a work assignment, so it isn't relevant.

**Q4. Deal sidebar.** `/deal/:id` (`DealDetailsPage`) renders `SharedSiteSubmitSidebar`
(`src/components/shared/SiteSubmitSidebar.tsx`) with `context="deal"`.

- **Start Package / badge:** the header row beside `AddToTourButton` (~:1278). The tab strip is
  full, so it can't be a sixth tab.
- **Slide list:** a section in the DATA tab, next to the existing Market Research and Site Story
  sections.
- **Board:** the same component (`PackagePanel dealId=…`, overlay-first) mounts in the board's
  `DealSlideOver`.
- **Gap:** that sidebar takes `siteSubmitId`. A deal with no site_submit needs a fallback mount in
  `DealHeaderBar`.

**Q5. Noree.** See §8.

**Q6. Gate 3 options:**

| Option | Signal | Verdict |
|---|---|---|
| A | "Final LOI in" checkbox on the package, timestamped. This is Deal Terms' input. | **Recommended.** It is the same event that releases Deal Terms, it is set by a human (§1.4) and needs no new concept. |
| B | A separate "Ready for Adam" button on the package / board slide-over | Explicit, but a second click for the same fact as A |
| C | `deal.loi_signed_date` set | Too late: that is after signing |
| D | Stage leaves Negotiating LOI (`deal_stage_history`) | Too late, same reason |
| E | Last court flip before C/D | Can't be detected in advance |

---

## 10. Proposed schema (not applied)

Every new table ends with the CLAUDE.md REVOKE + GRANT block: authenticated only, verbs the app
uses, no anon.

| Migration | Contents |
|---|---|
| `…_package_slide_template.sql` | `package_slide_template`: `key`, `label`, `position`, `mode`, `needs_approval`, `inputs text[]`, `allows_na`, `ordering_after`, `active`. Seeded with the 11 defaults. SELECT for authenticated, UPDATE gated to admin by RLS. |
| `…_deal_package.sql` | `deal_package`: `deal_id` unique, `started_at`, `started_by`, `site_plan_received_at`, `dot_study_received_at`, `final_loi_at`, `gate1_override_at`, `gate2_override_at`. Plus `deal_package_slide`: `package_id`, `template_key`, a snapshot of `mode` / `needs_approval` / `inputs`, `status` (CHECK), `status_changed_at`, `noree_done_at`, `mike_done_at`. RLS is internal-only. |
| `…_deal_court_event.sql` | `deal_court_event` plus an AFTER UPDATE trigger on `deal_activity_state` that writes it when the court changes. Backfill from `document_handoff` for LOI. The trigger function gets `SECURITY DEFINER`, a pinned `search_path` and no EXECUTE for anon/authenticated. |
| `…_task_package_link.sql` | `task.package_slide_id` FK, `task.queue_rank double precision`; the two clock-reset triggers re-created with `AND NEW.package_slide_id IS NULL`. |
| `…_package_progress_view.sql` | `v_deal_package_progress`: per-deal applicable / done / waiting-on-Mike counts with inputs resolved, the current gate and the pace state. `security_invoker`, SELECT for authenticated. |
| *(later)* `…_report_drop_package_status.sql` | Drop `starbucks_pipeline_report_row.package_status` once the report reads the view. |

Permission keys (§8) are JSONB on `role` / `user` and need no migration. They are a data update to
`role.permissions` and to Noree's `user.permissions`.

---

## 11. Phase 1 as built (2026-10-12)

| Migration | Notes |
|---|---|
| `20261012161837_package_tracker_tables.sql` | Template (seeded, owners by `user.id`), `deal_package`, `deal_package_slide`. Template handoff is `none` / `approve` / `finish`. Gate requirements are `done_by_gate` / `started_by_gate`. RLS: internal read/write; template updates are admin only. |
| `20261012161838_deal_court_event.sql` | Trigger: an event on a court change, a correction on a `court_since` back-date, nothing on touches, party edits or parking. `court_log_start()` = apply time. Backfill copies every LOI `document_handoff` turn. **Later handoff entries aren't mirrored.** |
| `20261012161839_task_package_link.sql` | `task.package_slide_id` (unique, cascade) and `task.queue_rank`. Both reset triggers re-created with `AND NEW.package_slide_id IS NULL`. |
| `20261012161840_package_progress_views.sql` | `v_deal_package_slide` (effective status, missing inputs) and `v_deal_package_progress` (counts, gate dates/states, `behind_since`). Pace thresholds live client-side. |

**Gate trust rules:**
- Board events count toward Gate 1 only when the deal entered Negotiating LOI after `court_log_start()`.
- They count toward Gate 2 only when Gate 1 itself falls after `court_log_start()`.
- Handoff turns always count.
- Once Mike saves the once-only form (`gates_confirmed_at`), a blank gate is filled by the first board event recorded after that save.

**Known edge:** a deal that enters LOI with the court already "them" logs no flip when the draft actually goes out. Gate 1 stays not-reached until the court is set to "us" and back to "them".

**Phase 2 notes:**
- `task.category_id` is NOT NULL. Package tasks use the global `pipeline` category.
- Rolled-back dry run with a package on all 17 LOI / At Lease deals:
  - 4 resolve gates from the handoff backfill (Big Chicken, E Cobb, Peachtree City, Grovetown).
  - Cedartown is `not_reached` (its handoff log holds only "us" turns).
  - **11 are `unknown`** and need the once-only entry.
  - With no work done, every fresh package is 4 short at Gate 1: Drive Time, Placer, Analogous Store, Rent Comps. Road Improvements slips to Gate 2 until the DOT study is in.

**Test:** `supabase/tests/package_task_clock_test.sql` runs wrapped in BEGIN / ROLLBACK (the commands are in its header). Passed 9 of 9 in the pre-apply round trip against production, with nothing persisted:
- package task insert, due_at change and completion leave the clock alone;
- an ordinary task still resets it;
- a court flip logs one event;
- a back-date corrects that event;
- a touch or party edit logs nothing;
- the views read correctly when impersonating Mike;
- anon is denied.
