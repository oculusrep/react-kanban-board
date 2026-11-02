import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../contexts/AuthContext';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import { CardTag, QueueTaskCard } from '../components/tasks/QueueTaskCard';
import { PackageQueueCard } from '../components/tasks/PackageQueueCard';
import { TaskChatPanel } from '../components/tasks/TaskChatPanel';
import { supabase } from '../lib/supabaseClient';
import {
  BRAND, INPUT_LABEL, InputKey, PACE_LABEL, ProgressRow, currentGate, fetchAllPackageProgress, localDate, paceOf, shortDate,
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
const UNDO_MS = 6000; // how long the "Marked done … Undo" toast stays
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

// A queue card: one package (its owner's open slide tasks, grouped) or one ordinary task.
// Cards are ranked; a package card ranks at its best-ranked task (the queue is
// already sorted by queue_rank), so newly released slide tasks join their card.
type QueueCard =
  | { kind: 'task'; key: string; task: QueueTask }
  | { kind: 'package'; key: string; packageId: string; tasks: QueueTask[]; site_submit_id: string | null; deal_id: string | null };

function buildCards(tasks: QueueTask[]): QueueCard[] {
  const cards: QueueCard[] = [];
  const byPkg = new Map<string, Extract<QueueCard, { kind: 'package' }>>();
  for (const t of tasks) {
    const pkg = t.slide?.package_id;
    if (!pkg) { cards.push({ kind: 'task', key: `t:${t.id}`, task: t }); continue; }
    let c = byPkg.get(pkg);
    if (!c) {
      c = { kind: 'package', key: `p:${pkg}`, packageId: pkg, tasks: [], site_submit_id: t.site_submit_id, deal_id: t.deal_id };
      byPkg.set(pkg, c);
      cards.push(c);
    }
    c.tasks.push(t);
  }
  for (const c of byPkg.values()) c.tasks.sort((a, b) => (a.slide?.position ?? 0) - (b.slide?.position ?? 0));
  return cards;
}

// Ranked cards → the task order set_task_queue_order stores (a package's tasks
// contiguous, in template order).
const flatten = (cards: QueueCard[]): QueueTask[] => cards.flatMap((c) => (c.kind === 'task' ? [c.task] : c.tasks));

// Package card tags: current gate (LOI stages) coloured by pace, and tour readiness.
function packageTags(p: ProgressRow | null): CardTag[] {
  if (!p) return [];
  const tags: CardTag[] = [];
  const pace = paceOf(p);
  const gate = ['Negotiating LOI', 'LOI'].includes(p.stage ?? '') ? currentGate(p) : null;
  if (pace === 'late') tags.push({ label: `${gate ? gate.label : 'Package'} · ${PACE_LABEL.late}`, tone: 'urgent' });
  else if (pace === 'behind') tags.push({ label: `${gate ? gate.label : 'Package'} · ${PACE_LABEL.behind}`, tone: 'watch' });
  else if (gate) tags.push({ label: gate.label, tone: gate.unknown ? 'unknown' : 'quiet' });
  tags.push(p.tour_ready ? { label: 'Tour-ready', tone: 'solid' } : { label: `Tour-ready ${p.tour_ready_done}/3`, tone: 'quiet' });
  return tags;
}

// Due date for ordinary tasks.
function tagFor(t: QueueTask): CardTag | null {
  if (!t.due_at) return null;
  const due = localDate(new Date(t.due_at));
  const today = localDate();
  if (due < today) return { label: `Overdue · ${shortDate(t.due_at)}`, tone: 'urgent' };
  if (due === today) return { label: 'Due today', tone: 'watch' };
  return { label: `Due ${shortDate(t.due_at)}`, tone: 'quiet' };
}

function StatTile({ label, value, hint, accent, dashed }: { label: string; value: number | string; hint?: string; accent?: boolean; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-1.5"
         style={{ border: `1px ${dashed ? 'dashed' : 'solid'} ${accent ? BRAND.terracotta : BRAND.slate}` }}>
      <div className="text-4xl font-semibold tabular-nums leading-none" style={{ color: accent ? BRAND.terracotta : BRAND.navy }}>{value}</div>
      <div className="min-w-0 leading-tight">
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND.steel }}>{label}</div>
        {hint && <div className="truncate text-xs" style={{ color: BRAND.slate }}>{hint}</div>}
      </div>
    </div>
  );
}

function RailSection({ title, count, children, defaultOpen, accent }: { title: string; count: number; children: ReactNode; defaultOpen: boolean; accent?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg bg-white" style={{ border: `1px solid ${accent && count ? BRAND.terracotta : BRAND.slate}` }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-sm font-semibold" style={{ color: BRAND.navy }}>{title}</span>
        <span className="flex items-center gap-2 text-sm" style={{ color: BRAND.steel }}>
          <span className="tabular-nums">{count}</span>{open ? '▴' : '▾'}
        </span>
      </button>
      {open && <div className="px-3 pb-2.5">{children}</div>}
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // Up next cards opened inline
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  // Toast after a check-off; Undo reopens the task and restores the queue order it had.
  const [undo, setUndo] = useState<{ task: QueueTask; text: string; order: string[] } | null>(null);
  const undoTimer = useRef<number | null>(null);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);
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
      const pkgIds = [...new Set([...h, ...w, ...q.map((t) => t.slide).filter(Boolean) as { package_id: string }[]]
        .map((s) => s.package_id))];
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

  const cards = useMemo(() => buildCards(tasks), [tasks]);
  const visible = useMemo(() => (filter === 'package' ? cards.filter((c) => c.kind === 'package') : cards), [cards, filter]);
  const nowLane = visible.slice(0, NOW_COUNT);
  const nextLane = visible.slice(NOW_COUNT);
  const heldByPkg = useMemo(() => {
    const m = new Map<string, HeldSlide[]>();
    for (const s of held) m.set(s.package_id, [...(m.get(s.package_id) ?? []), s]);
    return m;
  }, [held]);

  const placeOf = (x: { site_submit_id: string | null; deal_id: string | null }): Place | null =>
    (x.site_submit_id && places.sites[x.site_submit_id]) || (x.deal_id && places.deals[x.deal_id]) || null;

  // Now and Up next are one list of cards split after NOW_COUNT; a drag in or
  // between them reorders the cards. With the package filter on, package cards
  // keep the slots they held in the full list, so hidden cards don't move. The
  // order is stored as task queue_rank (set_task_queue_order, the whole queue).
  const onDragEnd = async (r: DropResult) => {
    if (!r.destination) return;
    const { source, destination } = r;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const lane = (id: string) => (id === 'now' ? nowLane : nextLane);
    const moved = lane(source.droppableId)[source.index];
    if (!moved) return;
    const rest = visible.filter((c) => c.key !== moved.key);
    const destArr = lane(destination.droppableId).filter((c) => c.key !== moved.key);
    let at: number;
    if (destination.index < destArr.length) at = rest.indexOf(destArr[destination.index]);
    else if (destArr.length) at = rest.indexOf(destArr[destArr.length - 1]) + 1;
    else at = destination.droppableId === 'now' ? 0 : rest.length;
    const reordered = [...rest.slice(0, at), moved, ...rest.slice(at)];

    let nextCards: QueueCard[];
    if (filter === 'all') nextCards = reordered;
    else {
      const slots = new Set(visible.map((c) => c.key));
      let i = 0;
      nextCards = cards.map((c) => (slots.has(c.key) ? reordered[i++] : c));
    }
    const next = flatten(nextCards);
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

  const complete = async (t: QueueTask) => {
    const order = tasks.map((x) => x.id);
    const site = placeOf(t)?.name ?? (t.slide ? pkgNames[t.slide.package_id] : null);
    const text = [t.slide?.label ?? t.subject, site].filter(Boolean).join(' · ');
    setBusy(t.id);
    try {
      await setQueueTaskStatus(t.id, 'completed');
      if (chatTaskId === t.id) setChatTaskId(null);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      setUndo({ task: t, text, order });
      undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not update the task');
    } finally {
      setBusy(null);
    }
  };

  // Reopen = status back to open (sync_slide_from_task moves the slide back to in
  // progress), then in_progress again if it had been started. Status and queue_rank
  // writes never touch the board clock (supabase/tests/task_undo_clock_test.sql).
  const undoComplete = async () => {
    if (!undo || !ownerId) return;
    const { task: t, order } = undo;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndo(null);
    setBusy(t.id);
    try {
      await setQueueTaskStatus(t.id, 'open');
      if (t.status === 'in_progress') await setQueueTaskStatus(t.id, 'in_progress');
      if (canReorder) {
        // Back to the order before the check-off; anything new since goes after.
        const now = (await fetchQueue(ownerId)).map((x) => x.id);
        const present = new Set(now);
        const kept = order.filter((id) => present.has(id));
        const keptSet = new Set(kept);
        await saveQueueOrder([...kept, ...now.filter((id) => !keptSet.has(id))]);
      }
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not undo');
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

  const firstName = ownerName.split(' ')[0] || ownerName;
  const renderCard = (c: QueueCard, position: number, variant: 'large' | 'compact', index: number) => (
    <Draggable key={c.key} draggableId={c.key} index={index} isDragDisabled={!canReorder}>
      {(drag) => (
        <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}
             className={variant === 'large' ? (isWide ? 'min-w-0 flex-1 basis-0' : 'mb-2') : 'mb-1.5'}>
          {c.kind === 'package' ? (
            <PackageQueueCard
              position={position}
              name={placeOf(c)?.name ?? pkgNames[c.packageId] ?? (c.tasks[0].subject.split(' — ').slice(1).join(' — ') || 'Package')}
              city={placeOf(c)?.city ?? null}
              ownerName={firstName}
              tasks={c.tasks}
              held={heldByPkg.get(c.packageId) ?? []}
              progress={progress.get(c.packageId) ?? null}
              pace={progress.get(c.packageId) ? paceOf(progress.get(c.packageId)!) : null}
              tags={packageTags(progress.get(c.packageId) ?? null)}
              unread={unread}
              busyTaskId={busy}
              canReorder={canReorder}
              dragHandle={drag.dragHandleProps}
              variant={variant}
              expanded={expanded.has(c.key)}
              onToggle={() => toggleExpanded(c.key)}
              onOpen={c.site_submit_id || c.deal_id ? () => openSidebar(c) : null}
              onCheck={complete}
              onStart={(t) => setStatus(t, 'in_progress')}
              onChat={openChat}
            />
          ) : (
            <QueueTaskCard
              task={c.task}
              position={position}
              siteName={placeOf(c.task)?.name ?? null}
              city={placeOf(c.task)?.city ?? null}
              ownerName={firstName}
              tag={tagFor(c.task)}
              unread={unread.has(c.task.id)}
              busy={busy === c.task.id}
              canReorder={canReorder}
              dragHandle={drag.dragHandleProps}
              variant={variant}
              expanded={expanded.has(c.key)}
              onToggle={() => toggleExpanded(c.key)}
              onCheck={() => complete(c.task)}
              onStart={() => setStatus(c.task, 'in_progress')}
              onOpen={c.task.site_submit_id || c.task.deal_id ? () => openSidebar(c.task) : null}
              onChat={() => openChat(c.task)}
            />
          )}
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
    // pb / pr keep content clear of the floating launchers: Quick Note (48px, 24px inset) with Intel stacked
    // above it reach 132px up and 72px in from the bottom-right corner.
    <div className="min-h-screen px-4 pb-36 pt-4 sm:pl-6 sm:pr-24 2xl:pl-10" style={{ backgroundColor: BRAND.page }}>
      <div className="mx-auto max-w-[1680px]">
        {/* Title + controls */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
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
                        className="rounded px-3 py-1 text-sm font-medium"
                        style={filter === f ? { color: BRAND.navy, boxShadow: `inset 0 0 0 1px ${BRAND.navy}` } : { color: BRAND.steel }}>
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
        <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:gap-3">
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
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
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.steel }}>Now</h2>
                <Droppable droppableId="now" direction={isWide ? 'horizontal' : 'vertical'}>
                  {(drop, snap) => (
                    <div ref={drop.innerRef} {...drop.droppableProps}
                         className={`rounded-xl p-1 ${isWide ? 'flex items-stretch gap-3' : ''}`}
                         style={dropStyle(snap.isDraggingOver, 120)}>
                      {nowLane.map((t, i) => renderCard(t, i + 1, 'large', i))}
                      {drop.placeholder}
                    </div>
                  )}
                </Droppable>

                <h2 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.steel }}>
                  Up next{nextLane.length ? ` · ${nextLane.length}` : ''}
                </h2>
                <Droppable droppableId="next">
                  {(drop, snap) => (
                    <div ref={drop.innerRef} {...drop.droppableProps} className="rounded-xl p-1"
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
          <aside className="space-y-3">
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

      {undo && (
        <div role="status" aria-live="polite"
             className="fixed bottom-6 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-white px-4 py-2 text-sm shadow-lg"
             style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy }}>
          <span className="min-w-0 truncate">Marked done: {undo.text}</span>
          <button type="button" onClick={undoComplete} className="shrink-0 font-semibold hover:underline" style={{ color: BRAND.steel }}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
