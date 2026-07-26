import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Shared stacking manager for right-side map overlays / slideouts.
 *
 * The map can show several slideouts at once (pin details, Merchants,
 * demographics, target area, municipal, Starbucks, ...). Historically each
 * hardcoded its own z-index, so a newly opened slideout could render *behind*
 * one opened earlier — stacking was decided by DOM render order, not by what
 * the user opened last.
 *
 * This hook gives every opted-in overlay an incrementing z-index driven by
 * open/click *recency*: the most recently opened — or clicked — overlay is
 * always on top, like windows on a desktop.
 *
 * Implementation: a module-level ordered list of the currently-open overlays.
 * z-index = BASE_Z + position-in-list, so the range stays bounded to roughly
 * BASE_Z .. BASE_Z + (open overlays). We deliberately keep the ceiling below
 * the app's ~10010+ "always-on-top" tier (modals, toasts, top-level dropdowns)
 * so those still cover the slideouts. Each overlay root is position:fixed/absolute
 * with an explicit z-index, so it forms its own stacking context and its
 * children (in-panel dropdowns, toasts) are isolated from this ordering.
 *
 * Usage:
 *   const { zIndex, bringToFront } = useOverlayStack(isOpen);
 *   <div style={{ zIndex }} onMouseDown={bringToFront}> ... </div>
 *
 * Pass `isOpen` for overlays that stay mounted and animate via a prop; pass
 * nothing (defaults to true) for overlays that mount only while visible.
 */

const BASE_Z = 10001;

// Ordered list of open overlay ids — last element is the top-most.
let openOrder: number[] = [];
let nextOverlayId = 1;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

function raise(id: number) {
  const i = openOrder.indexOf(id);
  if (i === openOrder.length - 1) return; // already on top (also covers the empty case)
  if (i !== -1) openOrder.splice(i, 1);
  openOrder.push(id);
  notify();
}

function remove(id: number) {
  const i = openOrder.indexOf(id);
  if (i === -1) return;
  openOrder.splice(i, 1);
  notify();
}

export function useOverlayStack(isOpen: boolean = true) {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextOverlayId++;
  const id = idRef.current;

  // Re-render this overlay whenever the shared stacking order changes.
  const [, forceRender] = useState(0);
  useEffect(() => {
    const fn = () => forceRender((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  // Raise to the front when opened; drop out of the stack when closed/unmounted.
  useLayoutEffect(() => {
    if (isOpen) raise(id);
    else remove(id);
    return () => remove(id);
  }, [isOpen, id]);

  const bringToFront = useCallback(() => raise(id), [id]);

  const index = openOrder.indexOf(id);
  const zIndex = index === -1 ? BASE_Z : BASE_Z + index;

  return { zIndex, bringToFront };
}
