import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Shared stacking manager for right-side map overlays / slideouts.
 *
 * The map can show several slideouts at once (pin details, Merchants,
 * demographics, target area, municipal, Starbucks, ...). Historically each
 * hardcoded its own z-index, so a newly opened slideout could render *behind*
 * one opened earlier — stacking was decided by DOM render order, not recency.
 * This matters especially because the pin sidebars are rendered in a *later*
 * DOM subtree than the map-anchored panels, so any z-index tie is silently won
 * by the pin sidebar.
 *
 * This hook gives every opted-in overlay a strictly-increasing z-index driven
 * by open/click recency: the most recently opened — or clicked — overlay is
 * always on top, like windows on a desktop. Because each raise gets a value
 * strictly greater than every prior one, there are never ties, so DOM order
 * never decides.
 *
 * Bounding: a shared open-counter resets the running value back to BASE_Z once
 * every overlay has closed, so the numbers can't climb without end across a
 * session. The managed band stays low (BASE_Z .. BASE_Z + a handful) and below
 * the app's ~10010+ "always-on-top" tier (true modals, toasts).
 *
 * IMPORTANT — do not re-render on a no-op raise. `bringToFront` runs on the
 * overlay root's `onMouseDown`. If it called setState unconditionally, EVERY
 * mousedown would re-render the overlay; a re-render mid-mousedown can swap out
 * inline-defined child components (their DOM node is replaced), so the ensuing
 * click lands on a different node and the browser never fires it — silently
 * breaking clicks like the field-edit pencils. So `bringToFront` is a no-op
 * (no setState, no re-render) when this overlay is already on top.
 * See memory: feedback_mousedown_rerender_swallows_clicks.
 *
 * Usage:
 *   const { zIndex, bringToFront } = useOverlayStack(isOpen);
 *   <div style={{ zIndex }} onMouseDown={bringToFront}> ... </div>
 *
 * Pass `isOpen` for overlays that stay mounted and animate via a prop; pass
 * nothing (defaults to true) for overlays that mount only while visible. Call
 * the hook before any early `return null`, per the Rules of Hooks.
 */

const BASE_Z = 10001;

// Running high-water mark handed out on each raise, and a count of how many
// overlays are currently open so we can reset the mark back to the floor when
// the map is clear.
let topZ = BASE_Z;
let openCount = 0;

function nextZ(): number {
  topZ += 1;
  return topZ;
}

export function useOverlayStack(isOpen: boolean = true) {
  const [zIndex, setZIndex] = useState(BASE_Z);
  const countedRef = useRef(false);

  // Raise to the front — but ONLY if not already on top. When this overlay's
  // z already equals the high-water mark it is the top-most, so we return the
  // same value and React bails out of the re-render. This keeps a mousedown on
  // the focused overlay side-effect-free (see the note above about swallowed clicks).
  const bringToFront = useCallback(() => {
    setZIndex((z) => (z >= topZ ? z : nextZ()));
  }, []);

  useLayoutEffect(() => {
    // Track this instance's contribution to the open count so we can reset the
    // shared high-water mark once nothing is open anymore.
    const release = () => {
      if (countedRef.current) {
        countedRef.current = false;
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) topZ = BASE_Z;
      }
    };

    if (isOpen) {
      if (!countedRef.current) {
        countedRef.current = true;
        openCount += 1;
      }
      setZIndex(nextZ());
    } else {
      release();
    }
    return release;
  }, [isOpen]);

  return { zIndex, bringToFront };
}
