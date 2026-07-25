# Merchant Favorite — Org-Wide Default

## What it does

When a user opens the **Merchants** drawer on the map for the first time in a
session, the merchants layer is turned on (**Show on map**) and the curated
**OREP** favorite's brand set is auto-selected, so branded pins appear on the
map immediately without any clicks.

## Behavior rules

- **First open per session only.** Applied once, guarded by a ref
  (`didApplyDefaultRef`) that survives drawer close/reopen (the component stays
  mounted). Reopening never re-applies, so it can't clobber later edits.
- **Never overrides a deliberate choice.** If the user already has brands
  selected when the drawer first opens, the auto-apply is skipped.
- **Waits for favorites to load.** Gated on `favoritesLoaded` so it doesn't
  burn its one-shot against the empty pre-load array.
- Degrades gracefully: if no default favorite is readable, the drawer opens as
  before (nothing selected, layer off).

## The multi-user problem and the fix

The OREP favorite is owned by a single account. The existing favorite RLS only
exposes a favorite to its **owner** or users it's **explicitly shared** with
(`merchant_favorite_share`), and there is **no public/everyone scope**. So a
default that read OREP from the drawer's RLS-scoped favorites list would work
only for the owner and silently do nothing for everyone else.

Fix — an org-default flag (migration
`20260725163843_merchant_favorite_org_default.sql`):

- `merchant_favorite.is_default boolean not null default false`.
- Partial unique index `uniq_merchant_favorite_single_default` — at most one
  default at a time.
- New SELECT policy **"Anyone can read the default favorite"** — any
  authenticated user can read the flagged favorite row (PERMISSIVE, OR'd with
  the existing own/shared policies, so it only widens visibility for that row).
- `merchants_can_view_favorite()` extended to return true for the default
  favorite, so its `merchant_favorite_brand` links are readable by everyone too.
- Edit/delete stay **owner-only** — non-owners can view and apply the default
  but not modify it.
- OREP (`7bab4ef9-6dd3-47f8-b554-b78e8c488c5a`) is flagged `is_default = true`.

The default favorite therefore also appears in every user's Favorites list in
the drawer (view-only for non-owners), which is the intended org-shared
behavior.

## Changing the default

To point the default at a different favorite:

```sql
UPDATE merchant_favorite SET is_default = false WHERE is_default;
UPDATE merchant_favorite SET is_default = true  WHERE id = '<new-favorite-id>';
```

The unique index makes the two-statement swap safe (never two defaults at once).

## Code

- `src/components/mapping/MerchantsDrawer.tsx` — reads `is_default`, and the
  first-open auto-apply effect.
- `supabase/migrations/20260725163843_merchant_favorite_org_default.sql`
  (recorded prod version `20260725163843`).
