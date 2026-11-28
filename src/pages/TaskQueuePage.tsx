import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import { CardTag, QueueTaskCard } from '../components/tasks/QueueTaskCard';
import { PackageQueueCard } from '../components/tasks/PackageQueueCard';
import { TaskChatPanel } from '../components/tasks/TaskChatPanel';
import { PackageChatPanel } from '../components/tasks/PackageChatPanel';
import { supabase } from '../lib/supabaseClient';
import {
  BRAND, INPUT_LABEL, InputKey, PACE_LABEL, ProgressRow, currentGate, fetchAllPackageProgress, localDate, paceOf,
  pausePackage, resumePackage, shortDate,
} from '../lib/packageTracker';
import {
  HeldSlide, Place, QueueItem, QueueOwner, QueueTask, WaitingSlide, fetchDoneThisWeek, fetchHeldCardRanks, fetchHeldSlides,
  fetchPackageNames, fetchPlaces, fetchQueue, fetchQueueOwners, fetchWaitingOnMike, saveQueueOrder, setQueueTaskStatus,
} from '../lib/taskQueue';
import { TourOption, fetchTourOptions, fetchTourStopSites } from '../lib/packageTours';
import { fetchUnreadTaskIds } from '../lib/taskChat';
import { GENERAL, fetchPackageUnread } from '../lib/packageChat';

// Tasks command center (/tasks/queue; Package Tracker Phase 3, spec §7, redesigned
// 2026-11-02). One ordered list of a person's open tasks — package slides and
// everything else Mike assigns — shown as a "Now" lane (top 3) and "Up next".
// Mike sets the order by drag and drop; the owner checks tasks off (a package
// task's slide moves by trigger). The rail shows slides handed to Mike and slides
// held until their inputs arrive. Each package has one chat thread (package_comment,
// messages tagged to a slide or General); ordinary tasks have their own (task_comment).
// Neither touches the board clock or the deal / property chat.
// Noree (VA) lands here by default. Admins can open anyone's queue.
//
// 2026-11-03: a package whose slides for this owner are all held still gets a card
// (greyed, rankable, "Waiting on …"); its rank lives in package_queue_rank and the
// whole order saves through set_queue_order. A tour filter (?tour=) narrows to the
// tour's stops' package cards, each labelled with its stop. Pause parks a package:
// its tasks go to status 'paused' and drop out of every queue until Resume.

const NOW_COUNT = 3;
const UNDO_MS = 6000; // how long the "Marked done / Paused … Undo" toast stays
const FILTER_KEY = 'ovis.taskQueue.filter';
const NO_UNREAD: Set<string> = new Set();
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
// A package with only held slides for this owner ranks by package_queue_rank.
type QueueCard =
  | { kind: 'task'; key: string; task: QueueTask; rank: number | null }
  | { kind: 'package'; key: string; packageId: string; tasks: QueueTask[]; site_submit_id: string | null; deal_id: string | null; rank: number | null };
type PackageCard = Extract<QueueCard, { kind: 'package' }>;

function buildCards(tasks: QueueTask[], held: HeldSlide[], heldRanks: Map<string, number>): QueueCard[] {
  const cards: QueueCard[] = [];
  const byPkg = new Map<string, PackageCard>();
  for (const t of tasks) {
    const pkg = t.slide?.package_id;
    if (!pkg) { cards.push({ kind: 'task', key: `t:${t.id}`, task: t, rank: t.queue_rank }); continue; }
    let c = byPkg.get(pkg);
    if (!c) {
      c = { kind: 'package', key: `p:${pkg}`, packageId: pkg, tasks: [], site_submit_id: t.site_submit_id, deal_id: t.deal_id, rank: t.queue_rank };
      byPkg.set(pkg, c);
      cards.push(c);
    }
    c.tasks.push(t);
  }
  for (const c of byPkg.values()) c.tasks.sort((a, b) => (a.slide?.position ?? 0) - (b.slide?.position ?? 0));
  for (const s of held) {
    if (byPkg.has(s.package_id)) continue;
    const c: PackageCard = { kind: 'package', key: `p:${s.package_id}`, packageId: s.package_id, tasks: [],
      site_submit_id: s.site_submit_id, deal_id: s.deal_id, rank: heldRanks.get(s.package_id) ?? null };
    byPkg.set(s.package_id, c);
    cards.push(c);
  }
  // Stable: ties and unranked cards keep their order; unranked last.
  const r = (c: QueueCard) => c.rank ?? Number.POSITIVE_INFINITY;
  return cards.sort((a, b) => r(a) - r(b));
}

// Ranked cards → the list set_queue_order stores: each package card's own rank ('p:',
// where its next released task starts), then its tasks in template order.
const toItems = (cards: QueueCard[]): QueueItem[] => cards.flatMap((c): QueueItem[] =>
  c.kind === 'task' ? [`t:${c.task.id}`] : [`p:${c.packageId}`, ...c.tasks.map((t): QueueItem => `t:${t.id}`)]);

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
  const [heldRanks, setHeldRanks] = useState<Map<string, number>>(new Map());
  const [waiting, setWaiting] = useState<WaitingSlide[]>([]);
  const [doneWeek, setDoneWeek] = useState<number | null>(null);
  const [progress, setProgress] = useState<Map<string, ProgressRow>>(new Map());
  const [pkgNames, setPkgNames] = useState<Record<string, string>>({});
  const [places, setPlaces] = useState<{ sites: Record<string, Place>; deals: Record<string, Place> }>({ sites: {}, deals: {} });
  const [unread, setUnread] = useState<Set<string>>(new Set());          // ordinary task ids
  const [pkgUnread, setPkgUnread] = useState<Map<string, Set<string>>>(new Map()); // package → slide ids / GENERAL
  const [pkgChat, setPkgChat] = useState<{ packageId: string; slideId: string | null } | null>(null);
  const pkgChatRef = useRef(pkgChat);
  pkgChatRef.current = pkgChat;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilterState] = useState<Filter>(readFilter);
  const [sidebar, setSidebar] = useState<{ siteSubmitId: string | null; dealId: string | null } | null>(null);
  const [chatTaskId, setChatTaskId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // Up next cards opened inline
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  // Toast after a check-off or a pause; Undo reopens the task (and restores the queue
  // order it had) or resumes the package.
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const undoTimer = useRef<number | null>(null);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);
  const chatOpenRef = useRef<string | null>(null);
  chatOpenRef.current = chatTaskId;

  const setFilter = (f: Filter) => {
    setFilterState(f);
    try { localStorage.setItem(FILTER_KEY, f); } catch { /* per-viewer convenience only */ }
  };

  // Tour filter, in the URL (?tour=) like /reports/starbucks-packages, same tours and order.
  const [params, setParams] = useSearchParams();
  const tourId = params.get('tour');
  const [tours, setTours] = useState<TourOption[]>([]);
  const [tourStops, setTourStops] = useState<{ bySite: Map<string, string>; byDeal: Map<string, string> } | null>(null);
  useEffect(() => { fetchTourOptions().then(setTours).catch(() => setTours([])); }, []);
  useEffect(() => {
    setTourStops(null);
    if (!tourId) return;
    let cancelled = false;
    fetchTourStopSites(tourId)
      .then((stops) => {
        if (cancelled) return;
        const bySite = new Map<string, string>();
        const byDeal = new Map<string, string>();
        for (const s of stops) {
          if (!bySite.has(s.siteSubmitId)) bySite.set(s.siteSubmitId, s.stopLabel);
          if (s.dealId && !byDeal.has(s.dealId)) byDeal.set(s.dealId, s.stopLabel);
        }
        setTourStops({ bySite, byDeal });
      })
      .catch((e) => { if (!cancelled) setErr(e?.message ?? 'Could not load the tour'); });
    return () => { cancelled = true; };
  }, [tourId]);
  const setTour = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('tour', id); else next.delete('tour');
    setParams(next, { replace: true });
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
      const [q, h, w, dw, prog, hr] = await Promise.all([
        fetchQueue(ownerId), fetchHeldSlides(ownerId), fetchWaitingOnMike(ownerId), fetchDoneThisWeek(ownerId),
        fetchAllPackageProgress(), fetchHeldCardRanks(ownerId),
      ]);
      setTasks(q);
      setHeld(h);
      setHeldRanks(hr);
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
      const [names, pl, un, pun] = await Promise.all([
        fetchPackageNames(pkgIds),
        fetchPlaces(siteIds, dealIds),
        userTableId ? fetchUnreadTaskIds(q.filter((t) => !t.slide).map((t) => t.id), userTableId) : Promise.resolve(new Set<string>()),
        userTableId ? fetchPackageUnread(pkgIds, userTableId) : Promise.resolve(new Map<string, Set<string>>()),
      ]);
      setPkgNames(names);
      setPlaces(pl);
      setUnread(un);
      setPkgUnread(pun);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'package_comment' }, (payload) => {
        const row = payload.new as { package_id: string; slide_id: string | null; author_id: string };
        if (row.author_id === userTableId) return;
        const open = pkgChatRef.current;  // the panel marks what it shows as read
        if (open?.packageId === row.package_id && (open.slideId === null || open.slideId === row.slide_id)) return;
        setPkgUnread((prev) => {
          const n = new Map(prev);
          n.set(row.package_id, new Set(prev.get(row.package_id) ?? []).add(row.slide_id ?? GENERAL));
          return n;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userTableId]);

  const canReorder = isAdmin || ownerId === userTableId;
  const ownerName = owners.find((o) => o.id === ownerId)?.name ?? '';
  const nameById = useMemo(() => Object.fromEntries(owners.map((o) => [o.id, o.name])), [owners]);

  const cards = useMemo(() => buildCards(tasks, held, heldRanks), [tasks, held, heldRanks]);
  // The package card's stop on the selected tour ("D1·3"), matched by site, else deal.
  const stopOf = (c: QueueCard): string | null => {
    if (!tourStops || c.kind !== 'package') return null;
    const site = c.site_submit_id ?? progress.get(c.packageId)?.site_submit_id ?? null;
    const deal = c.deal_id ?? progress.get(c.packageId)?.deal_id ?? null;
    return (site && tourStops.bySite.get(site)) || (deal && tourStops.byDeal.get(deal)) || null;
  };
  const visible = useMemo(() => {
    if (tourId) return tourStops ? cards.filter((c) => stopOf(c) !== null) : [];
    return filter === 'package' ? cards.filter((c) => c.kind === 'package') : cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, filter, tourId, tourStops, progress]);
  const filtered = visible.length !== cards.length;
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
  // between them reorders the cards. With a filter on (package-only or a tour), the
  // shown cards keep the slots they held in the full list, so hidden cards don't
  // move. The whole order is saved through set_queue_order (task and held-card ranks).
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
    if (!filtered) nextCards = reordered;
    else {
      const slots = new Set(visible.map((c) => c.key));
      let i = 0;
      nextCards = cards.map((c) => (slots.has(c.key) ? reordered[i++] : c));
    }
    const items = toItems(nextCards);
    const before = { tasks, heldRanks };
    applyOrder(items);
    try {
      if (ownerId) await saveQueueOrder(ownerId, items);
    } catch (e: any) {
      setTasks(before.tasks);
      setHeldRanks(before.heldRanks);
      setErr(e?.message ?? 'Could not save the order');
    }
  };

  // Optimistic: the ranks set_queue_order is about to store.
  const applyOrder = (items: QueueItem[]) => {
    const rank = new Map(items.map((it, i) => [it, (i + 1) * 1000]));
    const r = (t: QueueTask) => rank.get(`t:${t.id}`) ?? t.queue_rank ?? Number.POSITIVE_INFINITY;
    setTasks((prev) => prev.map((t) => ({ ...t, queue_rank: rank.get(`t:${t.id}`) ?? t.queue_rank })).sort((a, b) => r(a) - r(b)));
    setHeldRanks((prev) => {
      const m = new Map(prev);
      for (const [it, v] of rank) if (it.startsWith('p:')) m.set(it.slice(2), v);
      return m;
    });
  };

  const showToast = (text: string, run: () => Promise<void>) => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setUndo({ text, run });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  };
  const runUndo = async () => {
    if (!undo) return;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    const { run } = undo;
    setUndo(null);
    try { await run(); } catch (e: any) { setErr(e?.message ?? 'Could not undo'); }
  };

  // Pause hides the package's open tasks from every queue (status 'paused', ranks kept)
  // and holds back releases; Resume restores both. Neither moves the board clock.
  const pause = async (c: PackageCard) => {
    const name = packageName(c);
    if (!window.confirm(`Pause ${name}? Its open tasks leave every queue and nothing is released until it's resumed. Slides and progress stay as they are.`)) return;
    const dealId = c.deal_id ?? progress.get(c.packageId)?.deal_id ?? null;
    setBusy(c.key);
    try {
      await pausePackage(c.packageId, dealId);
      showToast(`Paused: ${name}`, async () => { await resumePackage(c.packageId, dealId); await load(); });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not pause the package');
    } finally {
      setBusy(null);
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
    const order = toItems(cards);
    const site = placeOf(t)?.name ?? (t.slide ? pkgNames[t.slide.package_id] : null);
    const text = [t.slide?.label ?? t.subject, site].filter(Boolean).join(' · ');
    setBusy(t.id);
    try {
      await setQueueTaskStatus(t.id, 'completed');
      if (chatTaskId === t.id) setChatTaskId(null);
      showToast(`Marked done: ${text}`, () => undoComplete(t, order));
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
  const undoComplete = async (t: QueueTask, order: QueueItem[]) => {
    if (!ownerId) return;
    setBusy(t.id);
    try {
      await setQueueTaskStatus(t.id, 'open');
      if (t.status === 'in_progress') await setQueueTaskStatus(t.id, 'in_progress');
      if (canReorder) {
        // Back to the order before the check-off; tasks new since go after.
        const now = (await fetchQueue(ownerId)).map((x): QueueItem => `t:${x.id}`);
        const present = new Set<QueueItem>(now);
        const kept = order.filter((it) => it.startsWith('p:') || present.has(it));
        const keptSet = new Set(kept);
        await saveQueueOrder(ownerId, [...kept, ...now.filter((it) => !keptSet.has(it))]);
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
    setPkgChat(null);
    setSidebar({ siteSubmitId: x.site_submit_id, dealId: x.deal_id });
  };
  const openChat = (t: QueueTask) => {
    setSidebar(null);
    setPkgChat(null);
    setChatTaskId(t.id);
    setUnread((prev) => { const n = new Set(prev); n.delete(t.id); return n; });
  };
  const closeChat = useCallback(() => setChatTaskId(null), []);
  const openPackageChat = (packageId: string, slideId: string | null) => {
    setSidebar(null);
    setChatTaskId(null);
    setPkgChat({ packageId, slideId });
  };
  const closePackageChat = useCallback(() => setPkgChat(null), []);
  const filterPackageChat = useCallback((slideId: string | null) =>
    setPkgChat((cur) => (cur ? { ...cur, slideId } : cur)), []);
  // Whole thread read clears the package; a slide view clears that slide.
  const onPackageRead = useCallback((packageId: string, slideId: string | null) => {
    setPkgUnread((prev) => {
      const cur = prev.get(packageId);
      if (!cur) return prev;
      const n = new Map(prev);
      if (slideId === null) n.delete(packageId);
      else {
        const k = new Set(cur); k.delete(slideId);
        if (k.size) n.set(packageId, k); else n.delete(packageId);
      }
      return n;
    });
  }, []);
  const onChatRead = useCallback((id: string) => {
    setUnread((prev) => { if (!prev.has(id)) return prev; const n = new Set(prev); n.delete(id); return n; });
  }, []);

  const chatTask = tasks.find((t) => t.id === chatTaskId) ?? null;
  const slideSiteName = (s: { package_id: string; site_submit_id: string | null; deal_id: string | null }) =>
    placeOf(s)?.name ?? pkgNames[s.package_id] ?? 'package';

  const firstName = ownerName.split(' ')[0] || ownerName;
  function packageName(c: PackageCard): string {
    return placeOf(c)?.name ?? pkgNames[c.packageId] ?? (c.tasks[0]?.subject.split(' — ').slice(1).join(' — ') || 'Package');
  }
  const chatPkgCard = pkgChat ? cards.find((c): c is PackageCard =>
    c.kind === 'package' && c.packageId === pkgChat.packageId) ?? null : null;
  const renderCard = (c: QueueCard, position: number, variant: 'large' | 'compact', index: number) => (
    <Draggable key={c.key} draggableId={c.key} index={index} isDragDisabled={!canReorder}>
      {(drag) => (
        <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}
             className={variant === 'large' ? (isWide ? 'min-w-0 flex-1 basis-0' : 'mb-2') : 'mb-1.5'}>
          {c.kind === 'package' ? (
            <PackageQueueCard
              position={position}
              name={packageName(c)}
              city={placeOf(c)?.city ?? null}
              ownerName={firstName}
              tasks={c.tasks}
              held={heldByPkg.get(c.packageId) ?? []}
              progress={progress.get(c.packageId) ?? null}
              pace={progress.get(c.packageId) ? paceOf(progress.get(c.packageId)!) : null}
              tags={packageTags(progress.get(c.packageId) ?? null)}
              unread={pkgUnread.get(c.packageId) ?? NO_UNREAD}
              stopLabel={stopOf(c)}
              pausing={busy === c.key}
              onPause={() => pause(c)}
              busyTaskId={busy}
              canReorder={canReorder}
              dragHandle={drag.dragHandleProps}
              variant={variant}
              expanded={expanded.has(c.key)}
              onToggle={() => toggleExpanded(c.key)}
              onOpen={c.site_submit_id || c.deal_id ? () => openSidebar(c) : null}
              onCheck={complete}
              onStart={(t) => setStatus(t, 'in_progress')}
              onChat={(slideId) => openPackageChat(c.packageId, slideId)}
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
            <select value={tourId ?? ''} onChange={(e) => setTour(e.target.value)}
                    className="rounded-md bg-white px-2 py-1.5 text-sm"
                    style={{ border: `1px solid ${tourId ? BRAND.navy : BRAND.slate}`, color: BRAND.navy }} aria-label="Tour">
              <option value="">Any tour</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>{t.tour_name}{t.is_archived ? ' (archived)' : ''}</option>
              ))}
            </select>
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
            {loading && cards.length === 0 ? (
              <div className="rounded-lg bg-white px-4 py-10 text-center text-sm" style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div className="rounded-lg bg-white px-4 py-10 text-center text-sm" style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>
                {tourId
                  ? (tourStops ? 'No packages in the queue for this tour’s stops.' : 'Loading the tour…')
                  : filter === 'package' && cards.length ? 'No package tasks in the queue.' : 'Nothing in the queue.'}
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

      <PackageChatPanel
        packageId={pkgChat?.packageId ?? null}
        slideId={pkgChat?.slideId ?? null}
        title={chatPkgCard ? packageName(chatPkgCard) : pkgChat ? pkgNames[pkgChat.packageId] : undefined}
        subtitle={chatPkgCard ? placeOf(chatPkgCard)?.city ?? undefined : undefined}
        currentUserId={userTableId}
        names={nameById}
        onClose={closePackageChat}
        onFilter={filterPackageChat}
        onRead={onPackageRead}
      />

      {undo && (
        <div role="status" aria-live="polite"
             className="fixed bottom-6 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-white px-4 py-2 text-sm shadow-lg"
             style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy }}>
          <span className="min-w-0 truncate">{undo.text}</span>
          <button type="button" onClick={runUndo} className="shrink-0 font-semibold hover:underline" style={{ color: BRAND.steel }}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
