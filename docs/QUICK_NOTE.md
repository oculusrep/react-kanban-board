# Quick Note (personal quick-capture list)

**Status (2026-09-17):** shipped to prod — `e939215d` (initial), `de4c89ff` (content-sized panel + launcher badge). Branch `feature/quick-note`, worktree `../react-kanban-board-quick-note`. Typechecks and builds; **not yet exercised in a real browser session** — the first person to use it should confirm drag, Alt+Q, and the badge.

Floating button, bottom right on every internal page (not portal, not `?embedded=true`). Opens a panel anchored in the bottom-right corner just above the button, over the current view; no navigation.

## Behavior
- **Launcher badge:** count of open notes (not done, not expired); hidden at zero. Notes load on mount so the badge is populated before first open.
- **Panel size:** width 384px (`sm:w-96`; viewport minus gutters on phones). Height fits the content and grows with the list up to 70vh, then the list scrolls. Header and input stay pinned at the top.
- **Open/close:** FAB click (toggles; its + rotates to ×), or **Alt+Q** (Option+Q on Mac) toggles. Closes only on an explicit action: X button, Alt+Q, or Esc while focus is inside the panel. No backdrop, no click-outside close.
- **Capture:** type + Enter. Input clears and keeps focus, so you can enter several lines in a row. Inserts are optimistic.
- **List:** newest at top; drag to reorder; click a row to toggle done (struck through, stays in the list). No priorities.
- **Deal tag:** captured on `/deal/:dealId` → that deal; on `/site-submit/:siteSubmitId` → the site submit's `deal_id` (if any). Shown as a small label on the row, and as "Tagging: …" under the input.
- **Expiry:** rows past `expires_at` are filtered out of the panel query. They are never deleted.

## Data
Table `public.quick_note` — migration `supabase/migrations/20260917083811_quick_note.sql` (applied to prod + recorded 2026-09-17).

| column | notes |
|---|---|
| `user_id` | `auth.users.id`, defaults to `auth.uid()` |
| `deal_id` | nullable, `ON DELETE SET NULL` |
| `sort_order` | double precision, ascending = display order. New rows go above the current top; drag writes the midpoint of the new neighbours |
| `done` | bool |
| `expires_at` | always `created_at + 7 days`, set by a BEFORE trigger (a generated column isn't possible because `timestamptz + interval` is only STABLE) |

RLS: select/insert/update/delete all require `user_id = auth.uid()`. Verified by impersonating two users: the second sees 0 rows, updates hit 0 rows, and inserting with the first user's `user_id` is rejected.

## Code
- `src/components/quickNote/QuickNoteLauncher.tsx` — FAB, panel, shortcut, route → deal context
- `src/components/quickNote/useQuickNotes.ts` — fetch / add / toggle / reorder
- Mounted in `ProtectedLayout` in `src/App.tsx`

## Implementation notes (read before editing)
- **Order is `sort_order` ascending, not `created_at`.** "Newest at top" is an effect of insert: `addNote` writes `min(currentTop - 1, -Date.now()/1000)`. The DB default (`-extract(epoch from clock_timestamp())`) gives the same property for inserts that omit it. Don't add a `created_at` sort — it would silently undo manual reordering.
- **Reorder writes one row.** Midpoint of the new neighbours in the *visible* list (±1 at the ends). Hidden expired rows are ignored; that's fine because they never render. Double precision gives ~50 bisections at one spot before collisions — no renormalization exists; add one if that ever matters.
- **Optimistic state lives in `notesRef`** (mirrors `notes`) so rapid back-to-back Enter presses each stack above the previous one without waiting for a render. Pending rows have `pending-<uuid>` ids, can't be dragged or toggled, and are swapped for the real row when the insert returns (key changes → remount, expected).
- **Panel transform must be `'none'` when open.** `@hello-pangea/dnd` positions the dragged row with `position: fixed`; any `transform` on an ancestor (even `translateY(0)`) becomes its containing block and the row jumps away from the cursor. Closed state uses `translateY(8px)` + `opacity-0 invisible`.
- **Height:** the `<aside>` is `flex-col` with `maxHeight: 70vh` and no fixed height; header/form/error are `flex-shrink-0`, the list is `min-h-0 flex-1 overflow-y-auto`. Removing `min-h-0` stops the list from scrolling and lets it overflow the panel.
- **Placement:** panel `bottom-[84px] right-6` = launcher `bottom-6` (24px) + `h-12` (48px) + 12px gap. Change them together.
- **z-index:** launcher 10006, panel 10007 — above the map slideout band (`useOverlayStack` starts at 10001), below the ~10010+ modal/toast tier. See docs/OVERLAY_STACKING.md.
- **Badge** counts `!done && expires_at > now` from the same `notes` state; notes are fetched on mount (for the badge) and again on every open. There's no realtime subscription, so a note added in another tab shows up after the next open/reload.
- **Shortcut** matches `e.code === 'KeyQ'` (not `e.key`) so Option+Q on Mac, which types "œ", still works. Esc handling is on the panel's `onKeyDown` with `stopPropagation`, so it only closes when focus is inside the panel and doesn't also close a map slideout.
- **Expiry is display-only.** The query filters `expires_at > now()`; nothing deletes rows. There's no UI to see expired notes.
- **User id** is `auth.users.id` (`auth.uid()`), not the `public.user` table id (`useAuth().userTableId`). RLS compares against `auth.uid()` directly — no join to `auth.users`.

## Explicitly out of scope
- Voice input — do not build (original requirement).
- Priority levels.
- Deleting notes / viewing expired notes (not requested).

## Known gaps
- Auto-tagging only reads the URL. Deal/site-submit **slideouts** (kanban card, map pin) don't change the route, so notes captured there aren't tagged. Fixing this needs a shared "current object" context that overlays publish to (see docs/OVIS_OVERLAY_UX.md).
- The deal label is plain text, not a link.
