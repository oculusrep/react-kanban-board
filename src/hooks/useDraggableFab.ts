import React, { useEffect, useRef, useState } from 'react';

// Drag-anywhere floating action button, shared by the Quick Notes and Intel
// launchers. Drag the button wherever it's out of the way; the position persists
// per browser in localStorage and is clamped back into view on load and on resize
// (so a spot saved on a big monitor doesn't strand the button off a laptop).
// A press that moves less than DRAG_THRESHOLD px is still a click; the click that
// ends a real drag is swallowed so it doesn't also toggle the panel.

export const FAB_SIZE = 48; // h-12 w-12
export const FAB_EDGE = 8; // how close to an edge a drag may park the button
const DRAG_THRESHOLD = 4;

export interface FabPos {
  left: number;
  top: number;
}

/** Keeps the button fully on screen. */
export function clampFabPos(p: FabPos): FabPos {
  const maxLeft = Math.max(FAB_EDGE, window.innerWidth - FAB_SIZE - FAB_EDGE);
  const maxTop = Math.max(FAB_EDGE, window.innerHeight - FAB_SIZE - FAB_EDGE);
  return {
    left: Math.min(Math.max(FAB_EDGE, p.left), maxLeft),
    top: Math.min(Math.max(FAB_EDGE, p.top), maxTop),
  };
}

/** Default spot, as insets of the button's right/bottom edges from the viewport's. */
export interface FabCorner {
  right: number;
  bottom: number;
}

function cornerPos(corner: FabCorner): FabPos {
  return {
    left: Math.max(FAB_EDGE, window.innerWidth - corner.right - FAB_SIZE),
    top: Math.max(FAB_EDGE, window.innerHeight - corner.bottom - FAB_SIZE),
  };
}

function readPos(storageKey: string, corner: FabCorner): FabPos {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
        return clampFabPos(parsed);
      }
    }
  } catch {
    // storage unavailable / corrupt — fall through to the default corner
  }
  return cornerPos(corner);
}

export function useDraggableFab(storageKey: string, corner: FabCorner) {
  const [pos, setPos] = useState<FabPos>(() => readPos(storageKey, corner));
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // Pointer offset within the button + whether this press has become a drag.
  // Held in a ref so pointerdown never triggers a re-render (a re-render on
  // press can otherwise swallow the click entirely).
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setPos((p) => clampFabPos(p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist once the drag settles (not on every move).
  useEffect(() => {
    if (dragging) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pos));
    } catch {
      // storage unavailable — position just won't persist
    }
  }, [storageKey, pos, dragging]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampFabPos({ left: e.clientX - drag.dx, top: e.clientY - drag.dy });
    if (!drag.moved) {
      if (
        Math.abs(next.left - pos.left) < DRAG_THRESHOLD &&
        Math.abs(next.top - pos.top) < DRAG_THRESHOLD
      ) {
        return;
      }
      drag.moved = true;
      suppressClick.current = true;
      setDragging(true);
    }
    setPos(next);
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) setDragging(false);
  };

  /** Wraps the launcher's click so the click that ends a drag doesn't fire it. */
  const clickUnlessDragged = (onClick: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onClick();
  };

  return {
    pos,
    dragging,
    viewport,
    clickUnlessDragged,
    /** Spread onto the launcher <button>. */
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
