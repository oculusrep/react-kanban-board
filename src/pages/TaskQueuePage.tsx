import { useCallback, useEffect, useMemo, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../contexts/AuthContext';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import { BRAND, INPUT_LABEL, InputKey, shortDate } from '../lib/packageTracker';
import {
  HeldSlide, QueueOwner, QueueTask, fetchHeldSlides, fetchPackageNames, fetchQueue, fetchQueueOwners,
  saveQueueOrder, setQueueTaskStatus,
} from '../lib/taskQueue';

// Tasks queue (Package Tracker Phase 3, spec §7). One ordered list of a person's
// open tasks — package slides and everything else Mike assigns. Mike sets the
// order by drag and drop; the owner checks tasks off (a package task's slide
// moves by trigger). Package slides whose inputs aren't in yet are listed as
// held — they become tasks automatically when the input arrives.
// Noree (VA) lands here by default. Admins can open anyone's queue.

const HANDOFF_HINT: Record<string, string> = {
  approve: 'goes to Mike for approval',
  finish: 'Mike finishes after your setup',
  none: '',
};

export default function TaskQueuePage() {
  const { userTableId, userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const [owners, setOwners] = useState<QueueOwner[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [held, setHeld] = useState<HeldSlide[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<{ siteSubmitId: string | null; dealId: string | null } | null>(null);
  const [showHeld, setShowHeld] = useState(false);

  // Default: your own queue. Admins open on the VA's (Noree's) queue — ordering
  // it is why Mike comes here; the picker switches to anyone else's.
  useEffect(() => {
    if (!userTableId) return;
    fetchQueueOwners()
      .then((list) => {
        setOwners(list);
        const va = list.find((o) => o.role === 'va');
        setOwnerId((cur) => cur ?? (isAdmin && va ? va.id : userTableId));
      })
      .catch((e) => setErr(e?.message ?? 'Failed to load people'));
  }, [userTableId, isAdmin]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const [q, h] = await Promise.all([fetchQueue(ownerId), fetchHeldSlides(ownerId)]);
      setTasks(q);
      setHeld(h);
      setNames(await fetchPackageNames([...new Set(h.map((s) => s.package_id))]));
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  const canReorder = isAdmin || ownerId === userTableId;
  const ownerName = owners.find((o) => o.id === ownerId)?.name ?? '';

  const onDragEnd = async (r: DropResult) => {
    if (!r.destination || r.destination.index === r.source.index) return;
    const next = [...tasks];
    const [moved] = next.splice(r.source.index, 1);
    next.splice(r.destination.index, 0, moved);
    const before = tasks;
    setTasks(next);
    try {
      await saveQueueOrder(next.map((t) => t.id));
    } catch (e: any) {
      setTasks(before);
      setErr(e?.message ?? 'Could not save the order');
    }
  };

  const setStatus = async (t: QueueTask, status: 'open' | 'in_progress' | 'completed') => {
    setBusy(t.id);
    try {
      await setQueueTaskStatus(t.id, status);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not update the task');
    } finally {
      setBusy(null);
    }
  };

  const heldByInput = useMemo(() => {
    const m = new Map<InputKey, HeldSlide[]>();
    for (const s of held) for (const k of s.missing_inputs) m.set(k, [...(m.get(k) ?? []), s]);
    return [...m.entries()];
  }, [held]);

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: BRAND.page }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end justify-between mb-4 gap-4">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: BRAND.navy }}>
              {ownerId === userTableId ? 'My Tasks' : `${ownerName}’s Tasks`}
            </h1>
            <p className="text-sm" style={{ color: BRAND.steel }}>
              {tasks.length} open{held.length ? ` · ${held.length} package slides held until inputs arrive` : ''}
              {canReorder ? ' · drag to set the order' : ''}
            </p>
          </div>
          {isAdmin && owners.length > 0 && (
            <select
              value={ownerId ?? ''}
              onChange={(e) => setOwnerId(e.target.value)}
              className="text-sm px-2 py-1 rounded bg-white"
              style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy }}
            >
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        {err && <p className="text-sm mb-3" style={{ color: BRAND.terracotta }}>{err}</p>}

        <div className="bg-white rounded" style={{ border: `1px solid ${BRAND.slate}` }}>
          {loading && tasks.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: BRAND.steel }}>Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="p-4 text-sm" style={{ color: BRAND.steel }}>Nothing open.</p>
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="task-queue" isDropDisabled={!canReorder}>
                {(drop) => (
                  <ul ref={drop.innerRef} {...drop.droppableProps}>
                    {tasks.map((t, i) => (
                      <Draggable key={t.id} draggableId={t.id} index={i} isDragDisabled={!canReorder}>
                        {(drag) => (
                          <li
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            className="flex items-start gap-3 px-3 py-2.5 bg-white"
                            style={{ borderBottom: `1px solid ${BRAND.page}`, ...drag.draggableProps.style }}
                          >
                            <span
                              {...drag.dragHandleProps}
                              className="pt-0.5 select-none"
                              style={{ color: canReorder ? BRAND.slate : 'transparent', cursor: canReorder ? 'grab' : 'default' }}
                              aria-label="Drag to reorder"
                            >⋮⋮</span>
                            <span className="pt-0.5 w-5 text-right text-xs" style={{ color: BRAND.slate }}>{i + 1}</span>
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={false}
                              disabled={busy === t.id}
                              onChange={() => setStatus(t, 'completed')}
                              aria-label="Check off"
                            />
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => (t.site_submit_id || t.deal_id) && setSidebar({ siteSubmitId: t.site_submit_id, dealId: t.deal_id })}
                            >
                              <div className="text-sm" style={{ color: BRAND.navy }}>{t.subject}</div>
                              <div className="flex flex-wrap gap-x-3 text-xs" style={{ color: BRAND.steel }}>
                                {t.slide && HANDOFF_HINT[t.slide.handoff] && <span>Then: {HANDOFF_HINT[t.slide.handoff]}</span>}
                                {t.due_at && <span>Due {shortDate(t.due_at)}</span>}
                                {t.status === 'in_progress' && <span style={{ color: BRAND.navy }}>In progress</span>}
                              </div>
                            </div>
                            {t.status === 'open' && (
                              <button
                                type="button"
                                disabled={busy === t.id}
                                onClick={() => setStatus(t, 'in_progress')}
                                className="text-xs px-2 py-0.5 rounded disabled:opacity-60"
                                style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}
                              >
                                Start
                              </button>
                            )}
                          </li>
                        )}
                      </Draggable>
                    ))}
                    {drop.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>

        {held.length > 0 && (
          <div className="mt-4 bg-white rounded" style={{ border: `1px dashed ${BRAND.slate}` }}>
            <button
              type="button"
              onClick={() => setShowHeld((v) => !v)}
              className="w-full text-left px-3 py-2 text-sm"
              style={{ color: BRAND.steel }}
              aria-expanded={showHeld}
            >
              Held until inputs arrive ({held.length}) {showHeld ? '▴' : '▾'}
            </button>
            {showHeld && (
              <div className="px-3 pb-3 text-xs space-y-2" style={{ color: BRAND.navy }}>
                {heldByInput.map(([input, slides]) => (
                  <div key={input}>
                    <div className="font-semibold mb-0.5" style={{ color: BRAND.terracotta }}>Waiting on {INPUT_LABEL[input]}</div>
                    <ul className="space-y-0.5">
                      {slides.map((s) => (
                        <li key={`${input}-${s.id}`} className="cursor-pointer hover:underline"
                            onClick={() => setSidebar({ siteSubmitId: s.site_submit_id, dealId: s.deal_id })}>
                          {s.label} — {names[s.package_id] ?? 'package'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <SiteSubmitSidebar
        siteSubmitId={sidebar?.siteSubmitId ?? null}
        dealId={sidebar?.dealId ?? null}
        isOpen={sidebar !== null}
        onClose={() => setSidebar(null)}
        context="deal"
        onDataUpdate={() => load()}
      />
    </div>
  );
}
