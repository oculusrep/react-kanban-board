# Starbucks Board — one history with the deal / site-submit chat

**Status:** plan, not built (2026-10-09). Branch `feature/board-unified-history`.
**Goal:** what you log on the board — notes and court / blocker / park changes — shows in the same chat you see on the deal and site-submit sidebars. One history, not two, and always internal only.

---

## Recon

### 1. What each surface reads and writes

| Surface | Reads | Filter |
|---|---|---|
| Site-submit sidebar → Chat (`PortalChatTab`) | `site_submit_comment` | `site_submit_id` (else `deal_id`, else `comp_property_id`) |
| Deal page → right sidebar → Chat (same `SiteSubmitSidebar`, `context="deal"`) | `site_submit_comment` | **`deal.site_submit_id`** when the deal has one; `deal_id` only for deals with no site (BOR) |
| Deal page → Notes tab (`DealNotesTab`) | `note` + `note_object_link` | `object_type='deal'` |
| Deal page → Activity tab | `activity` | `deal_id` |
| Sidebar → Tasks tab (`OpenTasksPanel`) | `task` | keyed on the **site_submit** for a site-backed deal |

| Board writes | Table |
|---|---|
| Log a note, Park / Un-park note, Pass / Mark-lost note | `note` + `note_object_link` (`deal_id`, or `site_submit_id` for a card with no deal) |
| Set next action | `task` with `deal_id` (or `site_submit_id` for a card with no deal) |
| Court, party, blocker, park date, urgent, agenda | `deal_activity_state`: **current state only** |

**The mismatch.** The board writes notes to `note`. The chat reads `site_submit_comment`. Board notes show up only in the deal page's Notes tab, and for a site-only card nowhere outside the board. Board tasks on a deal card go in with `deal_id`, but the sidebar's Tasks tab looks them up by `site_submit_id`, so they're missing there too.

### 2. Internal vs client visibility: yes, and RLS enforces it

`site_submit_comment.visibility` is `internal | client`. RLS:
- Portal SELECT: `visibility = 'client' AND portal_user_can_access_site_submit(site_submit_id, auth.uid())`.
- Portal INSERT: only `visibility = 'client'`.
- Internal users: `is_internal_user()` for SELECT and INSERT.
- UPDATE: author only.

So a portal user can't read an internal row today. The remaining hole: the author (an internal user) can flip a row to `client` with the chat's visibility toggle. Nothing in the database stops a board entry from being made client-visible later.

The client digest emails are built from `site_submit_activity`. The `capture_comment_activity` trigger copies **only client-visible** comments into it, so an internal entry never reaches a client email.

### 3. Is court / blocker / park / urgent history kept? No.

- `deal_activity_state` holds only the current state. Its only trigger is `updated_at`.
- Park, un-park, pass and lost do write a narrative `note` (2 exist).
- Court, party, blocker and urgent changes leave no trace.
- Stage changes do have history, in `deal_stage_history` and `site_submit_stage_history`.

### 4. Site submit → deal today: the chat shows on the deal by *reading*, not by copying

`ConvertSiteSubmitToDealModal` copies contacts, sets `site_submit.deal_id`, and posts a "Deal created" comment on the site. It does **not** copy or relink comments, notes, activity or tasks. Nothing in the database does either.

The site's chat still appears on the deal, because the deal sidebar's chat filters by `deal.site_submit_id`. Real data: Five Forks Trickum has 20 comments, 17 written before the deal existed. All are keyed only to the site, and the deal sidebar shows all 20. The same holds for Locust Grove (11 of 16 written before the deal), Hiram (11 of 21) and Villa Rica (8 of 23).

**What is lost:**
- Comments keyed only by `deal_id` (2 exist) disappear from the chat once the deal has a site.
- The deal's Notes and Activity tabs show nothing from the site.

---

## Plan

### A. Board notes go into the chat
- `insertBoardNote` writes a `site_submit_comment` instead of a `note`, with `visibility='internal'` and `origin='board_note'`.
  - Keyed on `site_submit_id` when the card has one (every Starbucks card does), else `deal_id`.
- This covers Log a note, the park reason, Pass and Mark lost.
- The slide-over's "Recent notes" and triage's "History" read the chat thread (`site_submit_comment` for the card), so the board shows the same history as the sidebars, including messages typed in the sidebar.
- Existing `note` rows stay where they are, in the deal's Notes tab. I won't migrate them: board notes and NoteFormModal notes share the same `manual_` stamp, so the two sources can't be told apart.

### B. Court / blocker / park changes write a history entry (database trigger)
- New `AFTER INSERT OR UPDATE` trigger on `deal_activity_state`.
- It compares the old row with the new one and writes **one** chat row per save.
- The row is `visibility='internal'`, `origin='board_history'`, `author_id = auth.uid()`. The chat shows who and when from the author and `created_at`.
- Example entries:
  - "Ball → Them (Landlord) · blocker: Awaiting landlord (Pricing)"
  - "Ball → Us · ready to submit"
  - "Court cleared (unclassified)"
  - "Blocker cleared"
  - "Parked until Nov 3, 2026: water/sewer feasibility"
  - "Un-parked"
- **Why a trigger:** the slide-over, the triage queue and the blocker auto-clear on stage change all change these fields. A trigger can't be forgotten by any of them (same reasoning as §2.2).
- **Excluded:** urgent and agenda changes. Neither is a change of who owes what, and logging them would flood the chat. I can add them if you want.
- **Park reason:** a new nullable column `deal_activity_state.parked_reason` is written in the same upsert as the park date. The single history entry carries the reason, which replaces the separate park note. The Parking lot can show the reason too.
- **No history row when there's no logged-in user** (SQL or service-role writes); `author_id` can't be null.

### C. Internal-only, enforced in the database
- New column `site_submit_comment.origin` (`NULL | 'board_note' | 'board_history'`).
- `CHECK (origin IS NULL OR visibility = 'internal')`: a board row can never become client-visible, whether through the chat toggle, an edit, or SQL.
- The existing RLS already hides internal rows from portal users, and the digest trigger already skips them.
- The UI hides the visibility toggle on board rows and shows `board_history` rows as compact system lines.

### D. The clock: no double resets, no wrong resets
- New reset trigger on `site_submit_comment`, `AFTER INSERT WHEN origin = 'board_note'`. A board note still cools the tile, exactly as its `note_object_link` insert does today.
  - It reuses `reset_deal_activity_clock()`, which already handles `deal_id` / `site_submit_id`.
- **`board_history` rows never reset.** The save that produced them has already set the clock. Classify sets now or the back-dated date; Park sets the review date.
  - A reset from the history row would overwrite a back-dated clock or a park review date. Excluding it also retires the "note first, then upsert" ordering hack in ParkControl.
- Each board note now goes through one reset path (the comment trigger) instead of the note link, so there's one reset per note.
- **Unchanged on purpose:** other chat messages (sidebar posts by you, portal client messages, "shared a file", "changed status") still don't reset the clock, as today. See open decision 1.

### E. Site submit → deal: one thread, linked not copied
- The deal sidebar chat already reads the site's thread, so nothing needs copying. Visibility is untouched because the rows don't move.
- Close the remaining gap: when a deal has both a site and an id, `PortalChatTab` reads `site_submit_id = X OR deal_id = Y`. Comments keyed only to the deal (BOR-era, or written before the deal was linked) show in the same thread.
- Board notes and history for a site-only card are keyed to the site, so after conversion they appear on the deal automatically.

### F. Tasks
- A task the board creates for a card that has a site gets **both** `site_submit_id` and `deal_id` (no constraint prevents it), so it shows in the sidebar Tasks tab and in deal views.
- The reset trigger already resolves the card from either key, so there's still one reset.

### Verification
- **Rolled-back SQL test as an internal user:**
  - Classify / park / un-park / blocker auto-clear each write one history row, and none moves `ball_in_court_since`.
  - A board note resets the clock once.
  - Flipping a board row to `client` fails the CHECK.
- **HTTP as a portal user:**
  - No portal user currently has access to a Starbucks site (0 of 21), so a Starbucks-only test would pass trivially.
  - Instead, the test temporarily writes a `board_note` and a `board_history` row on a **non-Starbucks site that portal user can access**.
  - Expected result: the portal user sees that site's client comments but 0 board rows, and can't update the board rows.
  - The test rows are deleted afterwards and the portal session is logged out.
- **HTTP as Mike:** board rows visible; the board still works.

### Migration (shown before applying)
- `site_submit_comment.origin` + CHECK constraint.
- `deal_activity_state.parked_reason`.
- `log_board_state_change()` trigger function, `SECURITY DEFINER`, `search_path` pinned, EXECUTE revoked from PUBLIC / anon / authenticated.
- Reset trigger on `site_submit_comment` for `board_note`.
- No new tables, so no grants block is needed. The existing grants on both tables are unchanged.

---

## Open decisions

1. **Should chat messages from internal users reset the clock?** Today only notes, tasks and activity do. A message you type in the sidebar chat doesn't cool the tile, even though it's a human touch. I recommend yes, internal-authored plain messages only (portal messages and system lines stay out), as a separate follow-up because it changes what heat means for existing tiles. It isn't in this plan.
2. **Urgent and agenda in the history?** Left out above.
3. **Existing `note` rows written by the board (≈35 deal notes with the `manual_` stamp, mixed with NoteFormModal notes):** leave them in the Notes tab (recommended), or copy them into the chat?
