import React, { useCallback, useEffect, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '../../lib/supabaseClient';
import { QuickNote, useQuickNotes } from './useQuickNotes';

// Personal quick-capture list: a floating button (bottom right, every internal
// page) that opens a slide-out panel over the current view. Keyboard: Alt+Q
// (Option+Q on Mac) toggles it. The panel stays open until explicitly closed
// (X button, Alt+Q, or Esc while focus is inside the panel).

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
        onClick={() => onToggle(note.id)}
        className="flex items-start gap-2 rounded-md px-2 py-2 cursor-pointer select-none"
        style={{
          ...provided.draggableProps.style,
          backgroundColor: COLORS.white,
          border: `1px solid ${snapshot.isDragging ? COLORS.steel : '#E2E8F0'}`,
          boxShadow: snapshot.isDragging ? '0 4px 12px rgba(0,33,71,0.15)' : undefined,
          opacity: note.pending ? 0.6 : 1,
        }}
        title={note.done ? 'Click to mark not done · drag to reorder' : 'Click to mark done · drag to reorder'}
      >
        <span
          className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            border: `1.5px solid ${note.done ? COLORS.steel : COLORS.slate}`,
            backgroundColor: note.done ? COLORS.steel : 'transparent',
          }}
          aria-hidden
        >
          {note.done && (
            <svg className="h-2.5 w-2.5" fill="none" stroke={COLORS.white} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
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
      </li>
    )}
  </Draggable>
);

export const QuickNoteLauncher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dealCtx = useCurrentDealContext();
  const { notes, loading, error, refetch, addNote, toggleDone, reorder } = useQuickNotes();

  const toggle = useCallback(() => setOpen((o) => !o), []);

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

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorder(result.source.index, result.destination.index);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ backgroundColor: COLORS.midnight, color: COLORS.white, zIndex: Z_FAB }}
          title="Quick note (Alt+Q)"
          aria-label="Open quick notes"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      <aside
        className={`fixed inset-y-0 right-0 flex w-full sm:w-96 flex-col transition-transform duration-200 ease-out ${
          open ? 'shadow-2xl' : 'pointer-events-none'
        }`}
        style={{
          backgroundColor: COLORS.bg,
          borderLeft: `1px solid ${COLORS.slate}`,
          zIndex: Z_PANEL,
          // 'none' (not translateX(0)) when open: a transformed ancestor becomes
          // the containing block for the dragged row's position:fixed and
          // offsets it from the cursor.
          transform: open ? 'none' : 'translateX(100%)',
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
          className="flex items-center justify-between px-4 py-3"
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

        <form onSubmit={submit} className="px-4 pt-3 pb-2" style={{ backgroundColor: COLORS.white }}>
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
            className="mx-4 mt-2 rounded px-2 py-1 text-xs"
            style={{ color: '#A27B5C', border: '1px solid #A27B5C', backgroundColor: COLORS.white }}
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ borderTop: `1px solid ${COLORS.slate}` }}>
          {notes.length === 0 ? (
            <p className="mt-6 text-center text-sm" style={{ color: COLORS.slate }}>
              {loading ? 'Loading…' : 'Nothing captured yet.'}
            </p>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="quick-notes">
                {(provided) => (
                  <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                    {notes.map((note, i) => (
                      <NoteRow key={note.id} note={note} index={i} onToggle={toggleDone} />
                    ))}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </aside>
    </>
  );
};
