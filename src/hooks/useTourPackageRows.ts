import { useEffect, useMemo, useState } from 'react';
import { isParked, isToClassify } from '../lib/starbucksBoard';
import { ProgressRow, fetchResearchInputs, paceOf } from '../lib/packageTracker';
import { TourStopSite, fetchTourStopSites, isClosedStage } from '../lib/packageTours';
import usePackagesDashboard, { PackageRowView, ResearchInputs, missingInputs } from './usePackagesDashboard';

// Tour view of the Packages dashboard (decisions 2026-10-30): one row per tour
// stop, in stop order, packaged or not and in any stage. Package data comes from
// the dashboard hook, so the tour rows refresh on the same package events, sidebar
// close and tab focus.

export interface TourRowView extends PackageRowView {
  stopLabel: string;
  closed: boolean;   // Pass / Lost / Use Declined / Not Available: dimmed, last, no Start
}

export interface TourSummary {
  sites: number;       // active (non-closed) stops
  tourReady: number;
  notStarted: number;
  closed: number;
}

type Dashboard = ReturnType<typeof usePackagesDashboard>;

export default function useTourPackageRows(tourId: string | null, dash: Dashboard) {
  const [stops, setStops] = useState<TourStopSite[] | null>(null);
  const [research, setResearch] = useState<ResearchInputs | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-read with the dashboard (dash.version bumps on package writes, focus, close).
  useEffect(() => {
    if (!tourId) { setStops(null); setResearch(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchTourStopSites(tourId);
        const r = await fetchResearchInputs(s.map((x) => x.siteSubmitId));
        if (cancelled) return;
        setStops(s);
        setResearch(r);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load the tour');
      }
    })();
    return () => { cancelled = true; };
  }, [tourId, dash.version]);

  // A tour switch clears the old tour's rows at once rather than showing them under the new name.
  useEffect(() => { setStops(null); }, [tourId]);

  const rows: TourRowView[] = useMemo(() => {
    if (!stops) return [];
    const out = stops.map((s): TourRowView => {
      const boardCard = dash.boardCardBySite.get(s.siteSubmitId) ?? null;
      const closed = isClosedStage(s.stageName);
      const card = boardCard ?? {
        id: `stop-${s.stopId}`,
        name: s.name,
        city: s.city,
        accountToken: '',
        dealId: s.dealId,
        siteSubmitId: s.siteSubmitId,
        stageLabel: s.stageName ?? '—',
      };
      const p: ProgressRow | null = dash.progressFor(s.siteSubmitId, s.dealId);
      return {
        card,
        progress: p,
        pace: p ? paceOf(p) : null,
        // To-classify is a board rule; off-board stops can start unless closed.
        toClassify: boardCard ? isToClassify(boardCard) : false,
        parked: boardCard ? isParked(boardCard) : false,
        missing: missingInputs(p, s.siteSubmitId, research),
        stopLabel: s.stopLabel,
        closed,
      };
    });
    // Stop order, closed stops moved to the bottom (stable within each group).
    return [...out.filter((r) => !r.closed), ...out.filter((r) => r.closed)];
  }, [stops, research, dash.boardCardBySite, dash.progressFor]);

  const summary: TourSummary = useMemo(() => {
    const active = rows.filter((r) => !r.closed);
    return {
      sites: active.length,
      tourReady: active.filter((r) => r.progress?.tour_ready).length,
      notStarted: active.filter((r) => !r.progress).length,
      closed: rows.length - active.length,
    };
  }, [rows]);

  return { rows, summary, loading: !!tourId && stops === null, error };
}
