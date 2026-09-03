# Merchant pins: global removal + favorite sharing

Two related additions to the map's Merchants layer, 2026-09-03.

## 1. Right-click → remove a wrong merchant pin, for everyone

**Problem.** `merchant_location` is a cache of Google Places results, and Places
regularly puts the wrong business at an address — a bike shop rendered as a
burrito chain, an ATM listed as its own storefront. Anyone who spots one needs
to remove it, and the removal has to hold for every user, not just their tab.

**Mechanism — soft delete, not `DELETE`.** The ingest path
(`merchantIngestService.upsertMerchantLocation`) keys on `google_place_id`, so a
hard-deleted row is re-created on the very next ingestion of that brand. Instead
the row is flagged and the map filters it out; ingest keeps refreshing the row's
fields and it stays invisible. It also leaves an audit trail.

Migration: [`20260903110422_merchant_location_exclusion.sql`](../supabase/migrations/20260903110422_merchant_location_exclusion.sql)

| Column | Meaning |
|---|---|
| `merchant_location.excluded_at` | Set = hidden from the map for everyone. Nullable, never defaulted; NULL means "not excluded". |
| `merchant_location.excluded_by` | `"user".id` who removed it. |
| `merchant_location.exclusion_reason` | Optional free text from the confirm dialog. |

**Why an RPC and not wider RLS.** `merchant_location`'s UPDATE policy is
admin-only and should stay that way — it guards coordinates, business status and
brand assignment. Removing a bogus pin is a data-quality action every signed-in
user should be able to take, so it goes through a narrow `SECURITY DEFINER`
function that can only touch the three exclusion columns:

- `merchant_location_exclude(p_location_id uuid, p_reason text default null)` —
  any authenticated user. Idempotent: re-excluding an already-excluded row is a
  no-op, so the first reporter's who/when/why survives.
- `merchant_location_restore(p_location_id uuid)` — **admin only**. Restoring is
  the corrective action for a bad removal; letting any user un-hide a pin
  someone else deliberately removed is an edit war this feature doesn't need.
  There is no UI for it yet — an admin calls the RPC directly.

Both were verified against production inside a transaction + `ROLLBACK`:
exclusion succeeds as a non-admin and stamps the right user; restore raises
`42501` for a non-admin.

**Front end.**

- [MerchantLayer.tsx](../src/components/mapping/layers/MerchantLayer.tsx) adds
  `.is('excluded_at', null)` to the viewport query, plus a `refreshToken` prop —
  the parent bumps it after a removal to force an immediate re-fetch.
- [MerchantContextMenu.tsx](../src/components/mapping/MerchantContextMenu.tsx)
  gains a red "Remove this pin (wrong merchant)" item that expands into a
  confirm panel with an optional reason. Two steps, deliberately: the action
  applies to every user and the actor can't undo it themselves.
- [MappingPageNew.tsx](../src/pages/MappingPageNew.tsx) — merchant right-click
  is now wired for **all** users. Pin-drag verification inside the menu stays
  gated on `can_verify_restaurant_locations` (via the new `canVerify` prop); it
  is simply hidden for users without it.

While in this file, the clusterer teardown switched from `clearMarkers()` to
`setMap(null)` — `clearMarkers()`'s re-render is projection-guarded and leaves
stale cluster glyphs behind, which the removal path would otherwise hit on every
pin removal.

## 2. Sharing favorites between users

The database side already existed and was unused: `merchant_favorite_share`
(`favorite_id`, `user_id`, `permission ∈ {view, edit}`) with RLS that lets
recipients read a favorite and its brand links, lets `edit` recipients update
the brand set, and restricts share/unshare and delete to the owner. **No
migration was needed for this half — it is UI only.**

- New [ShareMerchantFavoriteModal.tsx](../src/components/mapping/ShareMerchantFavoriteModal.tsx):
  lists active users (owner excluded), a checkbox per user and a view/edit
  select. Saving diffs against the current share rows rather than
  delete-all + re-insert, so `shared_at` doesn't churn on every save.
- [MerchantsDrawer.tsx](../src/components/mapping/MerchantsDrawer.tsx) loads
  `owner_user_id` and the visible share rows with each favorite and derives an
  `access` value of `owner | edit | view`. The row menu mirrors the RLS rules:
  Edit/rename for owner + `edit` recipients, Share… and Delete for the owner
  only, and no ⋯ button at all for view-only recipients. A `shared` badge marks
  favorites shared *with* you; `↗n` marks your own favorites shared *out*.

Note the pre-existing separate mechanism: `merchant_favorite.is_default` flags
one org-wide favorite readable by everyone and auto-applied on first drawer
open. Sharing does not touch it — see
[`20260725163843_merchant_favorite_org_default.sql`](../supabase/migrations/20260725163843_merchant_favorite_org_default.sql).

## Follow-ups not built

- No admin screen for excluded pins (list / restore / see reasons). The data and
  the restore RPC are there; the Merchant admin page has no tab for it yet.
- `merchant_closure_alert` rows are still generated for excluded locations, and
  the Closure Alerts tab doesn't filter them out.
