# Quick Note (personal quick-capture list)

Floating button, bottom right on every internal page (not portal, not `?embedded=true`). Opens a slide-out panel over the current view; no navigation.

## Behavior
- **Open/close:** FAB click, or **Alt+Q** (Option+Q on Mac) toggles. Closes only on an explicit action: X button, Alt+Q, or Esc while focus is inside the panel. No backdrop, no click-outside close.
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

## Known gaps
- Auto-tagging only reads the URL. Deal/site-submit **slideouts** (kanban card, map pin) don't change the route, so notes captured there aren't tagged. Fixing this needs a shared "current object" context that overlays publish to (see docs/OVIS_OVERLAY_UX.md).
- The deal label is plain text, not a link.
