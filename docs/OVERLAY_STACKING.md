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

A module-level ordered list holds the currently-open overlay ids (last = top).
`z-index = BASE_Z (10001) + position-in-list`. This keeps the whole managed group
bounded to roughly `10001 .. 10001 + (open overlays)` — realistically `< 10010`.

That ceiling is deliberate: the app's **always-on-top** tier lives at `10010+`
(true modals, toasts at max-int, some top-level dropdowns). Managed slideouts must
stay below it. Each overlay root is `position: fixed/absolute` **with an explicit
z-index**, so it forms its own stacking context and its children (in-panel
dropdowns, toasts) are isolated from this ordering.

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
