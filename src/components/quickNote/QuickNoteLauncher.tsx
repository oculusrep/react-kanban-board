import React, { useCallback, useEffect, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '../../lib/supabaseClient';
import { QuickNote, useQuickNotes } from './useQuickNotes';

// Personal quick-capture list: a floating button (bottom right by default, on
// every internal page) that opens a panel next to it, over the current view.
// The button is draggable — drag it anywhere (bottom middle, left edge, …)
// when it covers something, and the position persists per browser; the panel
// re-anchors to it (above/below, right/left-aligned) and sizes to the space
// available (max 70vh, then the list scrolls). Keyboard: Alt+Q (Option+Q on
// Mac) toggles it. The panel stays open until explicitly closed (X button,
// Alt+Q, or Esc while focus is inside the panel).

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
} as const;

// Above map slideouts (useOverlayStack band starts at 10001), below the
// ~10010+ always-on-top tier (true modals, toasts).
const Z_FAB = 10006;
const Z_PANEL = 10007;

// Launcher geometry / drag persistence.
const FAB_SIZE = 48; // h-12 w-12
const GUTTER = 24; // default inset from the viewport edges (was bottom-6 right-6)
const EDGE = 8; // how close to an edge a drag may park the button
const GAP = 12; // launcher-to-panel gap
const PANEL_WIDTH = 384; // sm:w-96
const POS_KEY = 'quickNote.fabPos';
const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag, not a click

interface Pos {
  left: number;
  top: number;
}

function defaultPos(): Pos {
  return {
    left: Math.max(EDGE, window.innerWidth - GUTTER - FAB_SIZE),
    top: Math.max(EDGE, window.innerHeight - GUTTER - FAB_SIZE),
  };
}

// Keeps the button fully on screen (also re-applied on resize, so a position
// saved on a big monitor doesn't strand the button off a laptop viewport).
function clampPos(p: Pos): Pos {
  const maxLeft = Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE);
  const maxTop = Math.max(EDGE, window.innerHeight - FAB_SIZE - EDGE);
  return {
    left: Math.min(Math.max(EDGE, p.left), maxLeft),
    top: Math.min(Math.max(EDGE, p.top), maxTop),
  };
}

function readPos(): Pos {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
        return clampPos(parsed);
      }
    }
  } catch {
    // storage unavailable / corrupt — fall through to the default corner
  }
  return defaultPos();
}

/**
 * Panel box derived from where the launcher currently sits: flipped above the
 * button when it's in the lower half of the screen, below it otherwise, and
 * right-aligned to the button unless that would push it off screen.
 */
function panelBox(pos: Pos, vw: number, vh: number): React.CSSProperties {
  const width = Math.min(PANEL_WIDTH, Math.max(240, vw - 2 * GUTTER));
  const left = Math.min(Math.max(EDGE + 4, pos.left + FAB_SIZE - width), Math.max(EDGE + 4, vw - width - EDGE - 4));
  const above = pos.top + FAB_SIZE / 2 > vh / 2;
  const room = above ? pos.top - GAP - EDGE : vh - (pos.top + FAB_SIZE + GAP) - EDGE;
  const maxHeight = Math.max(180, Math.min(vh * 0.7, room));

  return above
    ? { left, bottom: vh - pos.top + GAP, width, maxHeight }
    : { left, top: pos.top + FAB_SIZE + GAP, width, maxHeight };
}

interface DealContext {
  dealId: string;
  dealName: string | null;
}

/**
 * Deal to auto-tag new notes with, derived from the current route:
 * /deal/:dealId, or /site-submit/:siteSubmitId → that site submit's deal_id.
 */
function useCurrentDealContext(): DealContext | null {
  const { pathname } = useLocation();
  const [ctx, setCtx] = useState<DealContext | null>(null);

  const dealId = matchPath('/deal/:dealId', pathname)?.params.dealId;
  const siteSubmitId = matchPath('/site-submit/:siteSubmitId', pathname)?.params.siteSubmitId;

  useEffect(() => {
    let cancelled = false;
    setCtx(null);

    const load = async () => {
      let resolvedDealId: string | null = null;
      if (dealId && dealId !== 'new') {
        resolvedDealId = dealId;
      } else if (siteSubmitId && siteSubmitId !== 'new') {
        const { data } = await supabase
          .from('site_submit')
          .select('deal_id')
          .eq('id', siteSubmitId)
          .maybeSingle();
        resolvedDealId = data?.deal_id ?? null;
      }
      if (!resolvedDealId) return;

      const { data: deal } = await supabase
        .from('deal')
        .select('id, deal_name')
        .eq('id', resolvedDealId)
        .maybeSingle();
      if (!cancelled && deal) setCtx({ dealId: deal.id, dealName: deal.deal_name });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dealId, siteSubmitId]);

  return ctx;
}

const DealLabel: React.FC<{ name: string | null }> = ({ name }) => (
  <span
    className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight align-middle"
    style={{ color: COLORS.steel, border: `1px solid ${COLORS.slate}`, backgroundColor: COLORS.bg }}
    title={name ?? 'Deal'}
  >
    {name || 'Deal'}
  </span>
);

// Only the checkbox toggles done. The row itself is the drag handle, and a
// click-on-row toggle fired on the mouseup that ends a short drag.
const DoneCheckbox: React.FC<{ note: QuickNote; onToggle: (id: string) => void }> = ({ note, onToggle }) => (
  <button
    type="button"
    onClick={() => onToggle(note.id)}
    disabled={!!note.pending}
    className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full focus:outline-none focus:ring-2"
    style={{
      border: `1.5px solid ${note.done ? COLORS.steel : COLORS.slate}`,
      backgroundColor: note.done ? COLORS.steel : 'transparent',
    }}
    aria-label={note.done ? 'Mark not done' : 'Mark done'}
    title={note.done ? 'Mark not done' : 'Mark done'}
  >
    {note.done && (
      <svg className="h-2.5 w-2.5" fill="none" stroke={COLORS.white} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    )}
  </button>
);

const NoteBody: React.FC<{ note: QuickNote }> = ({ note }) => (
  <div className="min-w-0 flex-1">
    <p
      className="text-sm break-words whitespace-pre-wrap"
      style={{
        color: note.done ? COLORS.slate : COLORS.midnight,
        textDecoration: note.done ? 'line-through' : undefined,
      }}
    >
      {note.text}
    </p>
    {note.deal_id && (
      <div className="mt-1">
        <DealLabel name={note.deal?.deal_name ?? null} />
      </div>
    )}
  </div>
);

const NoteRow: React.FC<{ note: QuickNote; index: number; onToggle: (id: string) => void }> = ({
  note,
  index,
  onToggle,
}) => (
  <Draggable draggableId={note.id} index={index} isDragDisabled={!!note.pending}>
    {(provided, snapshot) => (
      <li
        ref={provided.innerRef}
        {...provided.draggableProps}
        {...provided.dragHandleProps}
        className="flex items-start gap-2 rounded-md px-2 py-2 cursor-grab select-none"
        style={{
          ...provided.draggableProps.style,
          backgroundColor: COLORS.white,
          border: `1px solid ${snapshot.isDragging ? COLORS.steel : '#E2E8F0'}`,
          boxShadow: snapshot.isDragging ? '0 4px 12px rgba(0,33,71,0.15)' : undefined,
          opacity: note.pending ? 0.6 : 1,
        }}
        title="Drag to reorder"
      >
        <DoneCheckbox note={note} onToggle={onToggle} />
        <NoteBody note={note} />
      </li>
    )}
  </Draggable>
);

const CompletedRow: React.FC<{ note: QuickNote; onToggle: (id: string) => void }> = ({ note, onToggle }) => (
  <li
    className="flex items-start gap-2 rounded-md px-2 py-2"
    style={{ backgroundColor: COLORS.white, border: '1px solid #E2E8F0' }}
  >
    <DoneCheckbox note={note} onToggle={onToggle} />
    <NoteBody note={note} />
  </li>
);

const COMPLETE_COLLAPSED_KEY = 'quickNote.completeCollapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COMPLETE_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export const QuickNoteLauncher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dealCtx = useCurrentDealContext();
  const { notes, loading, error, refetch, addNote, toggleDone, reorder } = useQuickNotes();

  const [completeCollapsed, setCompleteCollapsed] = useState(readCollapsed);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  // --- Draggable launcher -------------------------------------------------
  const [pos, setPos] = useState<Pos>(readPos);
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
      setPos((p) => clampPos(p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist once the drag settles (not on every move).
  useEffect(() => {
    if (dragging) return;
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      // storage unavailable — position just won't persist
    }
  }, [pos, dragging]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampPos({ left: e.clientX - drag.dx, top: e.clientY - drag.dy });
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

  const onLauncherClick = () => {
    // The click that ends a drag shouldn't also open the panel.
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    toggle();
  };

  const toggleCompleteCollapsed = () => {
    setCompleteCollapsed((c) => {
      try {
        window.localStorage.setItem(COMPLETE_COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // storage unavailable — collapse state just won't persist
      }
      return !c;
    });
  };

  // Global shortcut. e.code so Option+Q on Mac (which types "œ") still matches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyQ') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Load once on mount so the launcher badge has a count before first open.
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Refresh + focus on open. Expired rows drop out on each refresh.
  useEffect(() => {
    if (!open) return;
    refetch();
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, refetch]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    addNote(text, dealCtx?.dealId ?? null, dealCtx?.dealName ?? null);
    inputRef.current?.focus();
  };

  const nowIso = new Date().toISOString();
  const openNotes = notes.filter((n) => !n.done);
  const completedNotes = notes.filter((n) => n.done);
  const openCount = openNotes.filter((n) => n.expires_at > nowIso).length;

  // Only open notes are draggable; completed ones sit below in their own section.
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorder(openNotes, result.source.index, result.destination.index);
  };

  return (
    <>
      <button
        type="button"
        onClick={onLauncherClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`fixed flex h-12 w-12 items-center justify-center rounded-full shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          dragging ? '' : 'transition-transform hover:scale-105'
        }`}
        style={{
          left: pos.left,
          top: pos.top,
          backgroundColor: COLORS.midnight,
          color: COLORS.white,
          zIndex: Z_FAB,
          cursor: dragging ? 'grabbing' : 'pointer',
          touchAction: 'none', // let a touch drag move the button instead of scrolling
        }}
        title={open ? 'Close quick notes (Alt+Q) · drag to move' : 'Quick note (Alt+Q) · drag to move'}
        aria-label={
          open ? 'Close quick notes' : `Open quick notes${openCount ? ` (${openCount} open)` : ''}`
        }
        aria-expanded={open}
      >
        <svg
          className="h-6 w-6 transition-transform duration-200"
          style={{ transform: open ? 'rotate(45deg)' : undefined }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {openCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none"
            style={{ backgroundColor: COLORS.white, color: COLORS.midnight, border: `1.5px solid ${COLORS.midnight}` }}
            aria-hidden
          >
            {openCount > 99 ? '99+' : openCount}
          </span>
        )}
      </button>

      <aside
        // Positioned off the (movable) launcher: see panelBox().
        className={`fixed flex flex-col overflow-hidden rounded-lg transition-[opacity,transform] duration-150 ease-out ${
          open ? 'shadow-2xl' : 'pointer-events-none invisible opacity-0'
        }`}
        style={{
          ...panelBox(pos, viewport.w, viewport.h),
          backgroundColor: COLORS.bg,
          border: `1px solid ${COLORS.slate}`,
          zIndex: Z_PANEL,
          // 'none' (not translateY(0)) when open: a transformed ancestor becomes
          // the containing block for the dragged row's position:fixed and
          // offsets it from the cursor.
          transform: open ? 'none' : 'translateY(8px)',
        }}
        aria-hidden={!open}
        aria-label="Quick notes"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <header
          className="flex flex-shrink-0 items-center justify-between px-4 py-3"
          style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
        >
          <div>
            <h2 className="text-sm font-semibold">Quick Notes</h2>
            <p className="text-[11px]" style={{ color: COLORS.slate }}>
              Private to you · hidden after 7 days
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Close quick notes"
            title="Close (Alt+Q)"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={submit} className="flex-shrink-0 px-4 pt-3 pb-2" style={{ backgroundColor: COLORS.white }}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a note, press Enter…"
            tabIndex={open ? 0 : -1}
            className="w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ border: `1px solid ${COLORS.slate}`, color: COLORS.midnight }}
          />
          <div className="mt-1.5 min-h-[18px] text-[11px]" style={{ color: COLORS.steel }}>
            {dealCtx && (
              <span className="flex items-center gap-1 min-w-0">
                <span className="flex-shrink-0">Tagging:</span>
                <DealLabel name={dealCtx.dealName} />
              </span>
            )}
          </div>
        </form>

        {error && (
          <div
            className="mx-4 mt-2 flex-shrink-0 rounded px-2 py-1 text-xs"
            style={{ color: '#A27B5C', border: '1px solid #A27B5C', backgroundColor: COLORS.white }}
          >
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" style={{ borderTop: `1px solid ${COLORS.slate}` }}>
          {notes.length === 0 ? (
            <p className="py-2 text-center text-sm" style={{ color: COLORS.slate }}>
              {loading ? 'Loading…' : 'Nothing captured yet.'}
            </p>
          ) : (
            <>
              {openNotes.length === 0 ? (
                <p className="py-2 text-center text-sm" style={{ color: COLORS.slate }}>
                  All done.
                </p>
              ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="quick-notes">
                    {(provided) => (
                      <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                        {openNotes.map((note, i) => (
                          <NoteRow key={note.id} note={note} index={i} onToggle={toggleDone} />
                        ))}
                        {provided.placeholder}
                      </ul>
                    )}
                  </Droppable>
                </DragDropContext>
              )}

              {completedNotes.length > 0 && (
                <section className="mt-3 pt-2" style={{ borderTop: '1px solid #E2E8F0' }}>
                  <button
                    type="button"
                    onClick={toggleCompleteCollapsed}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-xs font-semibold hover:bg-white"
                    style={{ color: COLORS.steel }}
                    aria-expanded={!completeCollapsed}
                  >
                    <svg
                      className="h-3 w-3 transition-transform duration-150"
                      style={{ transform: completeCollapsed ? 'rotate(-90deg)' : undefined }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                    Complete ({completedNotes.length})
                  </button>
                  {!completeCollapsed && (
                    <ul className="mt-1.5 space-y-1.5">
                      {completedNotes.map((note) => (
                        <CompletedRow key={note.id} note={note} onToggle={toggleDone} />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};
