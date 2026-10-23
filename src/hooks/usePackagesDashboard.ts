import { useCallback, useEffect, useMemo, useState } from 'react';
import useStarbucksBoard from './useStarbucksBoard';
import { ACCOUNT_ALL, BoardDeal, isParked, isToClassify } from '../lib/starbucksBoard';
import {
  InputKey, Pace, ProgressRow, fetchAllPackageProgress, fetchResearchInputs, paceOf,
} from '../lib/packageTracker';

// Packages dashboard (decisions 2026-10-22): every board card in Pre-Submittal,
// Submitted-Reviewing and Negotiating LOI, packaged or not. Card membership is
// the board's own (useStarbucksBoard), so the dashboard can never disagree with
// the board about which sites exist.

export const DASHBOARD_STAGES = ['Pre-Submittal', 'Submitted-Reviewing', 'Negotiating LOI'] as const;

export interface PackageRowView {
  card: BoardDeal;
  progress: ProgressRow | null;     // null = not started
  pace: Pace | null;                // null when not started
  toClassify: boolean;              // Start Package not offered (decision 3)
  parked: boolean;
  missing: InputKey[];              // packaged: from the view; not started: research inputs only
}

const PACE_RANK: Record<Pace, number> = { late: 0, behind: 1, unknown: 2, on_pace: 3 };

export default function usePackagesDashboard() {
  const board = useStarbucksBoard(ACCOUNT_ALL);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [research, setResearch] = useState<{ marketResearch: Set<string>; siteStory: Set<string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

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
        const [prog, res] = await Promise.all([
          fetchAllPackageProgress(),
          fetchResearchInputs(siteKey ? siteKey.split(',') : []),
        ]);
        if (cancelled) return;
        setProgress(prog);
        setResearch(res);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load packages');
      }
    })();
    return () => { cancelled = true; };
  }, [siteKey, nonce]);

  const rows: PackageRowView[] = useMemo(() => {
    const bySite = new Map<string, ProgressRow>();
    const byDeal = new Map<string, ProgressRow>();
    for (const p of progress) {
      if (p.site_submit_id) bySite.set(p.site_submit_id, p);
      if (p.deal_id) byDeal.set(p.deal_id, p);
    }
    const out = cards.map((card): PackageRowView => {
      const p = (card.siteSubmitId && bySite.get(card.siteSubmitId)) || (card.dealId && byDeal.get(card.dealId)) || null;
      let missing: InputKey[] = [];
      if (p) missing = p.missing_inputs ?? [];
      else if (research && card.siteSubmitId) {
        if (!research.marketResearch.has(card.siteSubmitId)) missing.push('market_research');
        if (!research.siteStory.has(card.siteSubmitId)) missing.push('site_story');
      } else if (!card.siteSubmitId) {
        missing = ['market_research', 'site_story']; // no site: the research inputs can never be met
      }
      return {
        card,
        progress: p,
        pace: p ? paceOf(p) : null,
        toClassify: isToClassify(card),
        parked: isParked(card),
        missing,
      };
    });
    // Not started first; then late → behind → unknown → on pace; then name.
    return out.sort((a, b) => {
      if (!!a.progress !== !!b.progress) return a.progress ? 1 : -1;
      if (a.pace && b.pace && a.pace !== b.pace) return PACE_RANK[a.pace] - PACE_RANK[b.pace];
      return a.card.name.localeCompare(b.card.name);
    });
  }, [cards, progress, research]);

  const refresh = useCallback(() => { board.refresh(); setNonce((n) => n + 1); }, [board]);

  return { rows, loading: board.loading || research === null, error: error ?? board.error, refresh };
}
