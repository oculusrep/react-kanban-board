import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStarbucksBoard from './useStarbucksBoard';
import { ACCOUNT_ALL, BoardDeal, isParked, isToClassify } from '../lib/starbucksBoard';
import {
  InputKey, Pace, ProgressRow, SlideRow, fetchAllPackageProgress, fetchAllSlides, fetchResearchInputs,
  localEffective, onAnyPackageChanged, paceOf, setSlideDone,
} from '../lib/packageTracker';
import { supabase } from '../lib/supabaseClient';

// Packages dashboard (decisions 2026-10-22): every board card in Pre-Submittal,
// Submitted-Reviewing and Negotiating LOI, packaged or not. Card membership is
// the board's own (useStarbucksBoard), so the dashboard can never disagree with
// the board about which sites exist.

export const DASHBOARD_STAGES = ['Pre-Submittal', 'Submitted-Reviewing', 'Negotiating LOI'] as const;

// The card fields a dashboard row renders. Board cards satisfy it; tour stops that
// aren't on the board get one built from the site (packageTours).
export type RowCard = Pick<BoardDeal, 'id' | 'name' | 'city' | 'accountToken' | 'dealId' | 'siteSubmitId' | 'stageLabel'>;

export interface PackageRowView {
  card: RowCard;
  progress: ProgressRow | null;     // null = not started
  pace: Pace | null;                // null when not started
  toClassify: boolean;              // Start Package not offered (decision 3)
  parked: boolean;
  missing: InputKey[];              // packaged: from the view; not started: research inputs only
}

export type ResearchInputs = { marketResearch: Set<string>; siteStory: Set<string> };

// Packaged: the view's missing_inputs. Not started: the two research inputs only.
export function missingInputs(p: ProgressRow | null, siteSubmitId: string | null, research: ResearchInputs | null): InputKey[] {
  if (p) return p.missing_inputs ?? [];
  if (!siteSubmitId) return ['market_research', 'site_story']; // no site: the research inputs can never be met
  const missing: InputKey[] = [];
  if (research) {
    if (!research.marketResearch.has(siteSubmitId)) missing.push('market_research');
    if (!research.siteStory.has(siteSubmitId)) missing.push('site_story');
  }
  return missing;
}

const PACE_RANK: Record<Pace, number> = { late: 0, behind: 1, unknown: 2, on_pace: 3 };

export default function usePackagesDashboard() {
  const board = useStarbucksBoard(ACCOUNT_ALL);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [research, setResearch] = useState<ResearchInputs | null>(null);
  const [slides, setSlides] = useState<Map<string, SlideRow[]>>(new Map());
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // First names for slide owners / done-by (internal users only — a small table).
  useEffect(() => {
    supabase.from('user').select('id, first_name, name').in('ovis_role', ['admin', 'broker_full', 'broker_lite', 'va'])
      .then(({ data }) => {
        const m: Record<string, string> = {};
        for (const u of (data as { id: string; first_name: string | null; name: string | null }[]) ?? []) m[u.id] = u.first_name || u.name || '';
        setNames(m);
      });
  }, []);

  const cards = useMemo(() => {
    const byId = new Map<string, BoardDeal>();
    for (const d of [...board.columns.flatMap((c) => c.deals), ...board.ready, ...board.toClassify, ...board.parked]) {
      if ((DASHBOARD_STAGES as readonly string[]).includes(d.stageLabel)) byId.set(d.id, d);
    }
    return [...byId.values()];
  }, [board.columns, board.ready, board.toClassify, board.parked]);

  const siteKey = useMemo(() => cards.map((c) => c.siteSubmitId).filter(Boolean).sort().join(','), [cards]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prog, res, sl] = await Promise.all([
          fetchAllPackageProgress(),
          fetchResearchInputs(siteKey ? siteKey.split(',') : []),
          fetchAllSlides(),
        ]);
        if (cancelled) return;
        setProgress(prog);
        setResearch(res);
        setSlides(sl);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load packages');
      }
    })();
    return () => { cancelled = true; };
  }, [siteKey, nonce]);

  const progressFor = useMemo(() => {
    const bySite = new Map<string, ProgressRow>();
    const byDeal = new Map<string, ProgressRow>();
    for (const p of progress) {
      if (p.site_submit_id) bySite.set(p.site_submit_id, p);
      if (p.deal_id) byDeal.set(p.deal_id, p);
    }
    return (siteSubmitId: string | null, dealId: string | null): ProgressRow | null =>
      (siteSubmitId && bySite.get(siteSubmitId)) || (dealId && byDeal.get(dealId)) || null;
  }, [progress]);

  // Every board card in any stage, by site (the tour view reuses a stop's card).
  const boardCardBySite = useMemo(() => {
    const m = new Map<string, BoardDeal>();
    for (const d of [...board.columns.flatMap((c) => c.deals), ...board.ready, ...board.toClassify, ...board.parked]) {
      if (d.siteSubmitId) m.set(d.siteSubmitId, d);
    }
    return m;
  }, [board.columns, board.ready, board.toClassify, board.parked]);

  const rows: PackageRowView[] = useMemo(() => {
    const out = cards.map((card): PackageRowView => {
      const p = progressFor(card.siteSubmitId, card.dealId);
      return {
        card,
        progress: p,
        pace: p ? paceOf(p) : null,
        toClassify: isToClassify(card),
        parked: isParked(card),
        missing: missingInputs(p, card.siteSubmitId, research),
      };
    });
    // Not started first; then late → behind → unknown → on pace; then name.
    return out.sort((a, b) => {
      if (!!a.progress !== !!b.progress) return a.progress ? 1 : -1;
      if (a.pace && b.pace && a.pace !== b.pace) return PACE_RANK[a.pace] - PACE_RANK[b.pace];
      return a.card.name.localeCompare(b.card.name);
    });
  }, [cards, progressFor, research]);

  const boardRefresh = board.refresh;
  const refresh = useCallback(() => { boardRefresh(); setNonce((n) => n + 1); }, [boardRefresh]);

  // Stay current without Realtime: any package write in the app (the sidebar
  // panel opened from a row, a badge, this page's own Done boxes) re-reads the
  // package data as soon as it succeeds; returning to the tab re-reads everything.
  useEffect(() => onAnyPackageChanged(() => setNonce((n) => n + 1)), []);
  const lastFocusRefresh = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefresh.current < 2000) return; // focus + visibilitychange both fire
      lastFocusRefresh.current = now;
      refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  // Quick-complete from an expanded row: update the slide and the row's counts
  // locally at once, write through the RPC, then re-read the package's truth.
  const toggleDone = useCallback(async (packageId: string, slideId: string, done: boolean) => {
    const before = { slides, progress };
    const nextSlides = (slides.get(packageId) ?? []).map((s) => {
      if (s.id !== slideId) return s;
      const status = done ? 'done' : 'not_started';
      const ns: SlideRow = { ...s, status, done_at: done ? new Date().toISOString() : null, owner_done_at: done ? s.owner_done_at : null };
      return { ...ns, effective_status: localEffective(ns) };
    });
    const m = new Map(slides); m.set(packageId, nextSlides); setSlides(m);
    setProgress((ps) => ps.map((p) => p.package_id !== packageId ? p : {
      ...p,
      applicable: nextSlides.filter((s) => s.effective_status !== 'na').length,
      done: nextSlides.filter((s) => s.effective_status === 'done').length,
      waiting_on_mike: nextSlides.filter((s) => s.effective_status === 'waiting_on_mike').length,
      tour_ready_done: nextSlides.filter((s) => ['market_aerial', 'demo_map', 'site_plan'].includes(s.template_key) && s.effective_status === 'done').length,
      any_started: p.any_started || done,
    }));
    try {
      await setSlideDone(progress.find((p) => p.package_id === packageId)?.deal_id ?? null, slideId, done);
      // setSlideDone announces the change → the listener above re-reads server
      // truth (gates, pace, tour-ready, done_by).
    } catch (e: any) {
      setSlides(before.slides);
      setProgress(before.progress);
      setError(e?.message ?? 'Could not update the slide');
    }
  }, [slides, progress]);

  return {
    rows, slides, names, toggleDone, progressFor, boardCardBySite, version: nonce,
    loading: board.loading || research === null, error: error ?? board.error, refresh,
  };
}
