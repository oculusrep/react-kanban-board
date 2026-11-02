import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../contexts/AuthContext';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import { CardTag, QueueTaskCard } from '../components/tasks/QueueTaskCard';
import { TaskChatPanel } from '../components/tasks/TaskChatPanel';
import { supabase } from '../lib/supabaseClient';
import {
  BRAND, INPUT_LABEL, InputKey, PACE_LABEL, ProgressRow, fetchAllPackageProgress, localDate, paceOf, shortDate,
} from '../lib/packageTracker';
import {
  HeldSlide, Place, QueueOwner, QueueTask, WaitingSlide, fetchDoneThisWeek, fetchHeldSlides, fetchPackageNames,
  fetchPlaces, fetchQueue, fetchQueueOwners, fetchWaitingOnMike, saveQueueOrder, setQueueTaskStatus,
} from '../lib/taskQueue';
import { fetchUnreadTaskIds } from '../lib/taskChat';

// Tasks command center (/tasks/queue; Package Tracker Phase 3, spec §7, redesigned
// 2026-11-02). One ordered list of a person's open tasks — package slides and
// everything else Mike assigns — shown as a "Now" lane (top 3) and "Up next".
// Mike sets the order by drag and drop; the owner checks tasks off (a package
// task's slide moves by trigger). The rail shows slides handed to Mike and slides
// held until their inputs arrive. Each task has its own chat (task_comment), which
// never touches the board clock or the deal / property chat.
// Noree (VA) lands here by default. Admins can open anyone's queue.

const NOW_COUNT = 3;
const FILTER_KEY = 'ovis.taskQueue.filter';
type Filter = 'all' | 'package';

function readFilter(): Filter {
  try { return localStorage.getItem(FILTER_KEY) === 'package' ? 'package' : 'all'; } catch { return 'all'; }
}

function useIsWide(minPx = 1024): boolean {
  const q = `(min-width: ${minPx}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}

// Gate + pace for package tasks; due date for everything else.
function tagFor(t: QueueTask, progress: Map<string, ProgressRow>): CardTag | null {
  if (t.slide) {
    const pace = paceOf(progress.get(t.slide.package_id) ?? null);
    const gate = t.slide.done_by_gate ? `Gate ${t.slide.done_by_gate}` : 'Package';
    if (pace === 'late') return { label: `${gate} · ${PACE_LABEL.late}`, tone: 'urgent' };
    if (pace === 'behind') return { label: `${gate} · ${PACE_LABEL.behind}`, tone: 'watch' };
    if (pace === 'unknown') return { label: `${gate} · date unknown`, tone: 'unknown' };
    return { label: gate, tone: 'quiet' };
  }
  if (!t.due_at) return null;
  const due = localDate(new Date(t.due_at));
  const today = localDate();
  if (due < today) return { label: `Overdue · ${shortDate(t.due_at)}`, tone: 'urgent' };
  if (due === today) return { label: 'Due today', tone: 'watch' };
  return { label: `Due ${shortDate(t.due_at)}`, tone: 'quiet' };
}

function StatTile({ label, value, hint, accent, dashed }: { label: string; value: number | string; hint?: string; accent?: boolean; dashed?: boolean }) {
  return (
    <div className="rounded-lg bg-white px-5 py-4"
         style={{ border: `1px ${dashed ? 'dashed' : 'solid'} ${accent ? BRAND.terracotta : BRAND.slate}` }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND.steel }}>{label}</div>
      <div className="mt-1 text-4xl font-semibold tabular-nums leading-none" style={{ color: accent ? BRAND.terracotta : BRAND.navy }}>{value}</div>
      {hint && <div className="mt-1.5 text-xs" style={{ color: BRAND.slate }}>{hint}</div>}
    </div>
  );
}

function RailSection({ title, count, children, defaultOpen, accent }: { title: string; count: number; children: ReactNode; defaultOpen: boolean; accent?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg bg-white" style={{ border: `1px solid ${accent && count ? BRAND.terracotta : BRAND.slate}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold" style={{ color: BRAND.navy }}>{title}</span>
        <span className="flex items-center gap-2 text-sm" style={{ color: BRAND.steel }}>
          <span className="tabular-nums">{count}</span>{open ? '▴' : '▾'}
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

export default function TaskQueuePage() {
  const { userTableId, userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const isWide = useIsWide();
  const [owners, setOwners] = useState<QueueOwner[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [held, setHeld] = useState<HeldSlide[]>([]);
  const [waiting, setWaiting] = useState<WaitingSlide[]>([]);
  const [doneWeek, setDoneWeek] = useState<number | null>(null);
  const [progress, setProgress] = useState<Map<string, ProgressRow>>(new Map());
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<{ sites: Record<string, Place>; deals: Record<string, Place> }>({ sites: {}, deals: {} });
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilterState] = useState<Filter>(readFilter);
  const [sidebar, setSidebar] = useState<{ siteSubmitId: string | null; dealId: string | null } | null>(null);
  const [chatTaskId, setChatTaskId] = useState<string | null>(null);
  const chatOpenRef = useRef<string | null>(null);
  chatOpenRef.current = chatTaskId;

  const setFilter = (f: Filter) => {
    setFilterState(f);
    try { localStorage.setItem(FILTER_KEY, f); } catch { /* per-viewer convenience only */ }
  };

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
      const [q, h, w, dw, prog] = await Promise.all([
        fetchQueue(ownerId), fetchHeldSlides(ownerId), fetchWaitingOnMike(ownerId), fetchDoneThisWeek(ownerId),
        fetchAllPackageProgress(),
      ]);
      setTasks(q);
      setHeld(h);
      setWaiting(w);
      setDoneWeek(dw);
      setProgress(new Map(prog.map((p) => [p.package_id, p])));
      setErr(null);
      setLoading(false);
      // Secondary reads after the lanes render: names, cities, unread dots.
      const pkgIds = [...new Set([...h, ...w].map((s) => s.package_id))];
      const all = [...q, ...h, ...w];
      const siteIds = [...new Set(all.map((x) => x.site_submit_id).filter(Boolean) as string[])];
      const dealIds = [...new Set(all.filter((x) => !x.site_submit_id && x.deal_id).map((x) => x.deal_id as string))];
      const [names, pl, un] = await Promise.all([
        fetchPackageNames(pkgIds),
        fetchPlaces(siteIds, dealIds),
        userTableId ? fetchUnreadTaskIds(q.map((t) => t.id), userTableId) : Promise.resolve(new Set<string>()),
      ]);
      setPkgNames(names);
      setPlaces(pl);
      setUnread(un);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load queue');
      setLoading(false);
    }
  }, [ownerId, userTableId]);

  useEffect(() => { load(); }, [load]);

  // A message from someone else on one of these tasks lights its dot (unless that chat is open).
  useEffect(() => {
    if (!userTableId) return;
    const channel = supabase
      .channel('task-comment-queue')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comment' }, (payload) => {
        const row = payload.new as { task_id: string; author_id: string };
        if (row.author_id === userTableId || chatOpenRef.current === row.task_id) return;
        setUnread((prev) => new Set(prev).add(row.task_id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userTableId]);

  const canReorder = isAdmin || ownerId === userTableId;
  const ownerName = owners.find((o) => o.id === ownerId)?.name ?? '';
  const nameById = useMemo(() => Object.fromEntries(owners.map((o) => [o.id, o.name])), [owners]);

  const visible = useMemo(() => (filter === 'package' ? tasks.filter((t) => t.package_slide_id) : tasks), [tasks, filter]);
  const nowLane = visible.slice(0, NOW_COUNT);
  const nextLane = visible.slice(NOW_COUNT);

  const placeOf = (x: { site_submit_id: string | null; deal_id: string | null }): Place | null =>
    (x.site_submit_id && places.sites[x.site_submit_id]) || (x.deal_id && places.deals[x.deal_id]) || null;

  // Now and Up next are one list split after NOW_COUNT; a drag in or between them
  // is a reorder of that list. With the package filter on, the filtered tasks keep
  // the slots they held in the full queue, so hidden tasks don't move.
  const onDragEnd = async (r: DropResult) => {
    if (!r.destination) return;
    const { source, destination } = r;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const lane = (id: string) => (id === 'now' ? nowLane : nextLane);
    const moved = lane(source.droppableId)[source.index];
    if (!moved) return;
    const rest = visible.filter((t) => t.id !== moved.id);
    const destArr = lane(destination.droppableId).filter((t) => t.id !== moved.id);
    let at: number;
    if (destination.index < destArr.length) at = rest.indexOf(destArr[destination.index]);
    else if (destArr.length) at = rest.indexOf(destArr[destArr.length - 1]) + 1;
    else at = destination.droppableId === 'now' ? 0 : rest.length;
    const reordered = [...rest.slice(0, at), moved, ...rest.slice(at)];

    let next: QueueTask[];
    if (filter === 'all') next = reordered;
    else {
      const slots = new Set(visible.map((t) => t.id));
      let i = 0;
      next = tasks.map((t) => (slots.has(t.id) ? reordered[i++] : t));
    }
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
      if (status === 'completed' && chatTaskId === t.id) setChatTaskId(null);
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

  const openSidebar = (x: { site_submit_id: string | null; deal_id: string | null }) => {
    if (!x.site_submit_id && !x.deal_id) return;
    setChatTaskId(null);
    setSidebar({ siteSubmitId: x.site_submit_id, dealId: x.deal_id });
  };
  const openChat = (t: QueueTask) => {
    setSidebar(null);
    setChatTaskId(t.id);
    setUnread((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
  };
  const closeChat = useCallback(() => setChatTaskId(null), []);
  const onChatRead = useCallback((id: string) => {
    setUnread((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const chatTask = tasks.find((t) => t.id === chatTaskId) ?? null;
  const slideSiteName = (s: { package_id: string; site_submit_id: string | null; deal_id: string | null }) =>
    placeOf(s)?.name ?? pkgNames[s.package_id] ?? 'package';

  const renderCard = (t: QueueTask, position: number, variant: 'large' | 'compact', index: number) => (
    <Draggable key={t.id} draggableId={t.id} index={index} isDragDisabled={!canReorder}>
      {(drag) => (
        <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}
             className={variant === 'large' ? (isWide ? 'min-w-0 flex-1 basis-0' : 'mb-3') : 'mb-2'}>
          <QueueTaskCard
            task={t}
            position={position}
            siteName={placeOf(t)?.name ?? null}
            city={placeOf(t)?.city ?? null}
            ownerName={ownerName.split(' ')[0] || ownerName}
            tag={tagFor(t, progress)}
            unread={unread.has(t.id)}
            busy={busy === t.id}
            canReorder={canReorder}
            dragHandle={drag.dragHandleProps}
            variant={variant}
            onCheck={() => setStatus(t, 'completed')}
            onStart={() => setStatus(t, 'in_progress')}
            onOpen={t.site_submit_id || t.deal_id ? () => openSidebar(t) : null}
            onChat={() => openChat(t)}
          />
        </div>
      )}
    </Draggable>
  );

  const dropStyle = (over: boolean, minHeight: number) => ({
    minHeight,
    backgroundColor: over ? '#EEF2F7' : 'transparent',
    outline: over ? `2px dashed ${BRAND.slate}` : 'none',
  });

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 2xl:px-10" style={{ backgroundColor: BRAND.page }}>
      <div className="mx-auto max-w-[1680px]">
        {/* Title + controls */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: BRAND.navy }}>
              {ownerId === userTableId ? 'My Tasks' : `${ownerName}’s Tasks`}
            </h1>
            <p className="text-sm" style={{ color: BRAND.steel }}>
              {canReorder ? 'Drag cards to set the order — the top three are Now.' : 'In the order Mike set.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md bg-white p-0.5" style={{ border: `1px solid ${BRAND.slate}` }} role="group" aria-label="Filter tasks">
              {(['all', 'package'] as Filter[]).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                        className="rounded px-3 py-1.5 text-sm font-medium"
                        style={filter === f ? { backgroundColor: BRAND.navy, color: '#FFFFFF' } : { color: BRAND.steel }}>
                  {f === 'all' ? 'All tasks' : 'Package tasks only'}
                </button>
              ))}
            </div>
            {isAdmin && owners.length > 0 && (
              <select value={ownerId ?? ''} onChange={(e) => setOwnerId(e.target.value)}
                      className="rounded-md bg-white px-2 py-1.5 text-sm"
                      style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy }} aria-label="Whose queue">
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Header strip — always the whole queue, not the filtered view */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:gap-4">
          <StatTile label="Open tasks" value={tasks.length} hint={`${tasks.filter((t) => t.package_slide_id).length} package`} />
          <StatTile label="Done this week" value={doneWeek ?? '–'} hint="since Monday" />
          <StatTile label="Waiting on Mike" value={waiting.length} hint="slides handed off" accent={waiting.length > 0} />
          <StatTile label="Held" value={held.length} hint="until inputs arrive" dashed />
        </div>

        {err && (
          <div className="mb-4 rounded bg-white px-3 py-2 text-sm" style={{ border: `1px solid ${BRAND.terracotta}`, color: BRAND.terracotta }}>
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Lanes */}
          <div className="min-w-0">
            {loading && tasks.length === 0 ? (
              <div className="rounded-lg bg-white px-4 py-10 text-center text-sm" style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div className="rounded-lg bg-white px-4 py-10 text-center text-sm" style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>
                {filter === 'package' && tasks.length ? 'No package tasks in the queue.' : 'Nothing in the queue.'}
              </div>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.steel }}>Now</h2>
                <Droppable droppableId="now" direction={isWide ? 'horizontal' : 'vertical'}>
                  {(drop, snap) => (
                    <div ref={drop.innerRef} {...drop.droppableProps}
                         className={`rounded-xl p-2 ${isWide ? 'flex items-stretch gap-4' : ''}`}
                         style={dropStyle(snap.isDraggingOver, 120)}>
                      {nowLane.map((t, i) => renderCard(t, i + 1, 'large', i))}
                      {drop.placeholder}
                    </div>
                  )}
                </Droppable>

                <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.steel }}>
                  Up next{nextLane.length ? ` · ${nextLane.length}` : ''}
                </h2>
                <Droppable droppableId="next">
                  {(drop, snap) => (
                    <div ref={drop.innerRef} {...drop.droppableProps} className="rounded-xl p-2"
                         style={dropStyle(snap.isDraggingOver, 64)}>
                      {nextLane.map((t, i) => renderCard(t, NOW_COUNT + i + 1, 'compact', i))}
                      {drop.placeholder}
                      {nextLane.length === 0 && !snap.isDraggingOver && (
                        <div className="py-4 text-center text-sm" style={{ color: BRAND.slate }}>Nothing after these.</div>
                      )}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          {/* Side rail */}
          <aside className="space-y-4">
            <RailSection title="Waiting on Mike" count={waiting.length} defaultOpen accent>
              {waiting.length === 0 ? (
                <div className="text-sm" style={{ color: BRAND.slate }}>Nothing handed off right now.</div>
              ) : (
                <ul className="space-y-2.5">
                  {waiting.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => openSidebar(s)} className="w-full text-left hover:underline">
                        <div className="text-sm font-medium" style={{ color: BRAND.navy }}>{s.label}</div>
                        <div className="text-xs" style={{ color: BRAND.steel }}>
                          {slideSiteName(s)}{s.owner_done_at ? ` · handed off ${shortDate(s.owner_done_at)}` : ''}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </RailSection>

            <RailSection title="Held until inputs arrive" count={held.length} defaultOpen={false}>
              {held.length === 0 ? (
                <div className="text-sm" style={{ color: BRAND.slate }}>Nothing held.</div>
              ) : (
                <div className="space-y-3">
                  {heldByInput.map(([input, slides]) => (
                    <div key={input}>
                      <div className="mb-1 text-xs font-semibold" style={{ color: BRAND.terracotta }}>
                        Waiting on {INPUT_LABEL[input]} · {slides.length}
                      </div>
                      <ul className="space-y-1">
                        {slides.map((s) => (
                          <li key={`${input}-${s.id}`}>
                            <button type="button" onClick={() => openSidebar(s)} className="text-left text-sm hover:underline" style={{ color: BRAND.navy }}>
                              {s.label} <span style={{ color: BRAND.steel }}>— {slideSiteName(s)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </RailSection>
          </aside>
        </div>
      </div>

      <SiteSubmitSidebar
        siteSubmitId={sidebar?.siteSubmitId ?? null}
        dealId={sidebar?.dealId ?? null}
        isOpen={sidebar !== null}
        onClose={() => setSidebar(null)}
        context="deal"
        onDataUpdate={() => load()}
      />

      <TaskChatPanel
        taskId={chatTaskId}
        title={chatTask ? (placeOf(chatTask)?.name ?? chatTask.subject) : undefined}
        subtitle={chatTask?.slide?.label ?? (chatTask && placeOf(chatTask)?.name ? chatTask.subject : undefined)}
        currentUserId={userTableId}
        names={nameById}
        onClose={closeChat}
        onRead={onChatRead}
      />
    </div>
  );
}
