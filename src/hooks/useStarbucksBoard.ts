// Starbucks Deal Board — data hook.
// Fetches Starbucks deals + their deal_activity_state, assembles the four
// columns (with Pre-Submittal blocker subheads), computes heat client-side,
// and the daily "need attention" number. Mirrors the useState/useEffect +
// visibilitychange pattern of useKanbanData (no React Query in this repo).
// Realtime is spec step 6 — not here yet.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  BoardDeal,
  BoardStage,
  BOARD_STAGES,
  BLOCKED_ON_ORDER,
  BLOCKED_ON_LABEL,
  BallInCourt,
  BlockedOn,
  compareDeals,
  computeHeat,
  daysSince,
  needsAttention,
  PRE_SUBMITTAL,
} from '../lib/starbucksBoard';

export interface BoardSubhead {
  key: string;                 // blocked_on value or 'null'
  label: string;
  deals: BoardDeal[];
}

export interface BoardColumn {
  stage: BoardStage;
  count: number;
  deals: BoardDeal[];          // flat, sorted (used by non-Pre-Submittal columns)
  subheads: BoardSubhead[] | null; // present only for Pre-Submittal
}

export interface DailyNumber {
  attention: number;    // warm + hot
  yours: number;        // warm/hot where court is us or none
  theirs: number;       // warm/hot where court is them
  unclassified: number; // court not set yet (has a clock)
  noHistory: number;    // seeded_fallback / no touch data
}

export interface BoardData {
  columns: BoardColumn[];
  daily: DailyNumber;
  loading: boolean;
  error: string | null;
  lastSynced: Date | null;
  refresh: () => void;
}

// PostgREST embeds can arrive as an object (1:1) or a single-element array
// depending on version — normalize to the first/only value.
function embed<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface RawRow {
  id: string;
  deal_name: string | null;
  stage: { label: string | null; sort_order: number | null } | { label: string | null; sort_order: number | null }[] | null;
  property: { property_name: string | null; city: string | null } | { property_name: string | null; city: string | null }[] | null;
  site_submit: { site_submit_name: string | null } | { site_submit_name: string | null }[] | null;
  activity_state:
    | {
        ball_in_court: BallInCourt | null;
        ball_in_court_party: string | null;
        ball_in_court_since: string | null;
        blocked_on: BlockedOn | null;
        on_agenda: boolean | null;
        seeded_fallback: boolean | null;
      }
    | any[]
    | null;
}

function toBoardDeal(row: RawRow): BoardDeal | null {
  const stage = embed(row.stage);
  const stageLabel = stage?.label ?? null;
  if (!stageLabel || !(BOARD_STAGES as readonly string[]).includes(stageLabel)) {
    return null; // off-board stage (Lost, paid/terminal, etc.)
  }
  const property = embed(row.property);
  const siteSubmit = embed(row.site_submit);
  const st = embed(row.activity_state);

  const name =
    property?.property_name ||
    siteSubmit?.site_submit_name ||
    row.deal_name ||
    'Untitled site';

  // No activity_state row → treat as "no history" (spec §3.3.1).
  // Court null = unclassified — do NOT default to 'none' (spec §5.1).
  const ballInCourt: BallInCourt | null = st?.ball_in_court ?? null;
  const ballInCourtSince = st?.ball_in_court_since ?? null;
  const blockedOn: BlockedOn | null = st?.blocked_on ?? null;
  const onAgenda = st?.on_agenda ?? false;
  const seededFallback = st ? st.seeded_fallback ?? false : true;

  const days = daysSince(ballInCourtSince);
  const partial = { seededFallback, blockedOn, ballInCourt, days };

  return {
    id: row.id,
    name,
    city: property?.city ?? null,
    stageLabel,
    stageSortOrder: stage?.sort_order ?? 0,
    ballInCourt,
    ballInCourtParty: st?.ball_in_court_party ?? null,
    ballInCourtSince,
    blockedOn,
    onAgenda,
    seededFallback,
    days,
    heat: computeHeat(partial),
  };
}

function assembleColumns(deals: BoardDeal[]): BoardColumn[] {
  return BOARD_STAGES.map((stage) => {
    const inStage = deals.filter((d) => d.stageLabel === stage).sort(compareDeals);

    if (stage === PRE_SUBMITTAL) {
      const subheads: BoardSubhead[] = BLOCKED_ON_ORDER.map((b) => {
        const key = b ?? 'null';
        const groupDeals = inStage
          .filter((d) => (d.blockedOn ?? null) === b)
          .sort(compareDeals);
        return { key, label: BLOCKED_ON_LABEL[key as keyof typeof BLOCKED_ON_LABEL], deals: groupDeals };
      });
      return { stage, count: inStage.length, deals: inStage, subheads };
    }

    return { stage, count: inStage.length, deals: inStage, subheads: null };
  });
}

function computeDaily(deals: BoardDeal[]): DailyNumber {
  let attention = 0;
  let yours = 0;
  let theirs = 0;
  let unclassified = 0;
  let noHistory = 0;
  for (const d of deals) {
    if (d.heat === 'no_history') {
      noHistory++;
      continue;
    }
    if (d.heat === 'unclassified') {
      unclassified++;
      continue;
    }
    if (needsAttention(d)) {
      attention++;
      if (d.ballInCourt === 'them') theirs++;
      else yours++; // us + none (none is treated as your problem — spec §3.2, §9)
    }
  }
  return { attention, yours, theirs, unclassified, noHistory };
}

const SELECT = `
  id,
  deal_name,
  client:client_id!inner ( starbucks_layer_enabled ),
  stage:stage_id ( label, sort_order ),
  property:property_id ( property_name, city ),
  site_submit:site_submit_id ( site_submit_name ),
  activity_state:deal_activity_state (
    ball_in_court, ball_in_court_party, ball_in_court_since,
    blocked_on, on_agenda, seeded_fallback
  )
`;

export default function useStarbucksBoard(): BoardData {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [daily, setDaily] = useState<DailyNumber>({ attention: 0, yours: 0, theirs: 0, unclassified: 0, noHistory: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => setRefreshTrigger((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchBoard() {
      try {
        setError(null);
        const { data, error: qErr } = await supabase
          .from('deal')
          .select(SELECT)
          .eq('client.starbucks_layer_enabled', true);

        if (qErr) throw qErr;
        if (cancelled) return;

        const deals = (data as RawRow[] | null ?? [])
          .map(toBoardDeal)
          .filter((d): d is BoardDeal => d !== null);

        setColumns(assembleColumns(deals));
        setDaily(computeDaily(deals));
        setLastSynced(new Date());
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load board');
        // eslint-disable-next-line no-console
        console.error('useStarbucksBoard:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBoard();

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchBoard();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshTrigger]);

  return { columns, daily, loading, error, lastSynced, refresh };
}
