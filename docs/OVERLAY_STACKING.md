# Map Overlay Stacking (`useOverlayStack`)

## Problem

The map can show several right-side slideouts/panels at once — pin details
(property / site submit / restaurant), Merchants, cached demographics, target
area, municipal project, Starbucks, boundary builder, closed-business search,
shape editor. Historically each hardcoded its own z-index, in two broken buckets:

- The pin sidebars **and** the Merchants drawer all shared `z-[10001]`, so
  stacking was decided by fixed DOM render order — **not** by what the user
  opened last. A newly opened panel could render *behind* one opened earlier.
- The demographics / target-area / municipal / Starbucks panels sat far lower
  (`z-[50]`/`z-[60]`), so a pin sidebar always covered them regardless of order.

There was no shared manager; the only coordination was the offset-based
side-by-side scheme in [SLIDEOUT_STACKING_IMPLEMENTATION.md](SLIDEOUT_STACKING_IMPLEMENTATION.md)
(that doc's z-index values are now stale — the current tier is `10001`, not `z-50`).

## Solution

[`src/hooks/useOverlayStack.ts`](../src/hooks/useOverlayStack.ts) — a tiny shared
stacking manager. Every opted-in overlay gets a z-index driven by open/click
**recency**: the most recently opened *or clicked* overlay is always on top, like
windows on a desktop.

```ts
const { zIndex, bringToFront } = useOverlayStack(isOpen);
// root element:
<div style={{ zIndex }} onMouseDown={bringToFront}> ... </div>
```

- Pass `isOpen` for overlays that stay mounted and animate via a prop
  (PinDetailsSlideout, SiteSubmitSidebar, MerchantsDrawer, Demographics,
  MunicipalProject, TargetArea, BoundaryBuilder, ClosedBusinessSearch, ShapeEditor).
- Pass nothing (defaults to `true`) for overlays that mount only while visible
  (RestaurantSlideout, StarbucksSlideout).
- Call the hook **before** any early `return null`, per the Rules of Hooks.
- For a panel with a backdrop (TargetArea), give the backdrop `zIndex - 1`.

### How it works / the z-index contract

A module-level high-water mark (`topZ`, starting at `BASE_Z = 10001`) is bumped on
every open/click; that overlay takes the new value. Because each raise is strictly
greater than every prior one, **there are never ties**, so DOM order never decides
the winner. This is important here: the pin sidebars are rendered in a *later* DOM
subtree than the map-anchored panels (Merchants, demographics — see the
`{/* Sidebars - Rendered outside map container ... */}` block in `MappingPageNew`),
so under any tie the pin sidebar would silently win. Strictly-increasing values
remove the tie entirely.

Bounding: a shared open-counter resets `topZ` back to `BASE_Z` once every overlay
has closed, so values can't climb without end across a session. The managed band
stays low (`10001 .. 10001 + a handful`) and below the app's **always-on-top** tier
at `10010+` (true modals, toasts at max-int, some top-level dropdowns).

Each overlay root is `position: fixed/absolute` **with an explicit z-index**, so it
forms its own stacking context and its children (in-panel dropdowns, toasts) are
isolated from this ordering. Note the Merchants drawer is `position: absolute`
inside the map wrapper (all others are `fixed`); this works because no ancestor of
the map wrapper forms a stacking context in normal mode, so it still competes in
the root context by z-index. If a transform/filter/will-change ancestor is ever
added over the map, the drawer would need to move to `fixed` or be portaled to
`document.body` to keep competing.

### Not included (intentionally)

- **ContactFormModal** — a shared, cross-app component that already uses the
  side-by-side `rightOffset` scheme on the map (so it isn't buried). Pulling it
  into the map stack would change its z-tier app-wide. Left as-is.

## Adding a new map overlay

1. Call `useOverlayStack(isOpen?)` at the top of the component (before early returns).
2. Put `zIndex` on the root's inline `style` and remove any hardcoded `z-[...]`
   class / `zIndex:` literal from that root.
3. Wire `onMouseDown={bringToFront}` on the root so clicking raises it.
4. Keep the root `position: fixed` (or `absolute`) so it forms a stacking context.
5. If the overlay genuinely must sit above *everything* (a modal), don't use this
   hook — use the `10010+` tier instead.

## History / troubleshooting

### v1 — offset/hardcoded z-index (before this work)
Each slideout hardcoded its own z-index in two broken buckets: pin sidebars +
Merchants tied at `10001` (DOM order decided, not recency); demographics / target /
municipal / Starbucks down at `50`/`60` and always buried under a pin sidebar. The
only coordination was the offset-based side-by-side scheme in
[SLIDEOUT_STACKING_IMPLEMENTATION.md](SLIDEOUT_STACKING_IMPLEMENTATION.md).

### v2 — array-index stacking (first cut of this hook)
Introduced `useOverlayStack` with `z-index = BASE_Z + position-in-open-list`. Bounded
and recency-ordered for most cases, **but the bottom overlay sat at exactly `BASE_Z`**,
so a tie was still possible.

**Symptom:** with a property/site-submit sidebar already open, clicking **Merchants**
left the drawer *behind* the sidebar.

**Root cause:** the pin sidebars are rendered *outside and after* the map container
(see the `{/* Sidebars - Rendered outside map container ... */}` block in
`MappingPageNew.tsx`), i.e. in a later DOM subtree than the map-anchored panels. CSS
breaks a z-index tie by DOM order, so whenever the drawer and the sidebar both resolved
to `BASE_Z`, the later-rendered sidebar won. (Ruled out a stacking-context trap first:
no `transform`/`filter`/`will-change`/`isolation` ancestor exists over the map wrapper
in normal mode, so the `position: absolute` Merchants drawer does compete in the root
context — the failure was the tie, not confinement.)

### v3 — monotonic high-water mark (current)
Every open/click takes a value **strictly greater** than all prior ones, so ties are
impossible and DOM order never decides. A shared open-counter resets the mark to
`BASE_Z` once all overlays close, keeping the band bounded. See the current
[useOverlayStack.ts](../src/hooks/useOverlayStack.ts).

**If Merchants (or any `absolute` overlay) is *still* buried after v3:** that means a
stacking-context-forming ancestor (`transform`/`filter`/`will-change`/`contain`/
`perspective`) was added over the map wrapper, confining the drawer's context below the
root. Fix by switching the drawer to `position: fixed` **and** portaling it to
`document.body` so it re-joins the root stacking context.
