// Starbucks Deal Board — data hook.
// Fetches Starbucks deals + their deal_activity_state, assembles the seven
// board columns (Pre-Submittal exploded into blocker columns), computes heat
// client-side, and the daily "need attention" number. Mirrors the
// useState/useEffect + visibilitychange pattern of useKanbanData.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Account,
  ACCOUNT_ALL,
  accountFor,
  BoardDeal,
  BOARD_COLUMNS,
  BOARD_STAGES,
  BallInCourt,
  BlockedOn,
  columnKeyForDeal,
  compareDeals,
  DEAD_SUBMIT_STAGES,
  computeHeat,
  daysSince,
  isParked,
  isToClassify,
  needsAttention,
  readyToSubmit as computeReadyToSubmit,
} from '../lib/starbucksBoard';

export interface BoardColumn {
  key: string;
  label: string;
  group?: string;              // super-label ("Pre-Submittal") over blocker columns
  count: number;
  deals: BoardDeal[];          // flat, sorted
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
  ready: BoardDeal[];        // ready-to-submit band (hot, "Submit it")
  toClassify: BoardDeal[];   // header counter + triage queue (off-board)
  parked: BoardDeal[];       // Parking lot (off-board until review date)
  daily: DailyNumber;
  accounts: Account[];               // available accounts (from ALL data)
  agendaByAccount: Record<string, number>; // clientId → # on_agenda (from ALL data)
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
  client: { id: string | null; client_name: string | null } | { id: string | null; client_name: string | null }[] | null;
  stage: { label: string | null; sort_order: number | null } | { label: string | null; sort_order: number | null }[] | null;
  property: { property_name: string | null; city: string | null } | { property_name: string | null; city: string | null }[] | null;
  site_submit:
    | { id: string | null; site_submit_name: string | null; submit_stage: { name: string | null } | { name: string | null }[] | null }
    | { id: string | null; site_submit_name: string | null; submit_stage: { name: string | null } | { name: string | null }[] | null }[]
    | null;
  activity_state:
    | {
        ball_in_court: BallInCourt | null;
        ball_in_court_party: string | null;
        ball_in_court_since: string | null;
        blocked_on: BlockedOn | null;
        needs_pricing: boolean | null;
        needs_site_plan: boolean | null;
        on_agenda: boolean | null;
        seeded_fallback: boolean | null;
        parked_until: string | null;
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
  // A deal whose linked site_submit is in a dead/declined stage is off the
  // board regardless of deal stage (decisions §2.22). No site_submit → keep.
  const ssStage = embed(siteSubmit?.submit_stage)?.name ?? null;
  if (siteSubmit && ssStage && DEAD_SUBMIT_STAGES.has(ssStage)) return null;
  const st = embed(row.activity_state);
  const client = embed(row.client);
  const clientId = client?.id ?? null;
  const clientName = client?.client_name ?? null;

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
  const ready = computeReadyToSubmit({ stageLabel, blockedOn, ballInCourt });
  const heat = computeHeat({ seededFallback, readyToSubmit: ready, ballInCourt, days });

  return {
    id: row.id,
    name,
    city: property?.city ?? null,
    clientId,
    clientName,
    accountToken: accountFor(clientId, clientName).token,
    siteSubmitId: siteSubmit?.id ?? null,
    stageLabel,
    stageSortOrder: stage?.sort_order ?? 0,
    ballInCourt,
    ballInCourtParty: st?.ball_in_court_party ?? null,
    ballInCourtSince,
    blockedOn,
    needsPricing: st?.needs_pricing ?? false,
    needsSitePlan: st?.needs_site_plan ?? false,
    onAgenda,
    seededFallback,
    parkedUntil: st?.parked_until ?? null,
    days,
    readyToSubmit: ready,
    heat,
  };
}

// Parking lot order: soonest review date first.
function sortByReviewDate(a: BoardDeal, b: BoardDeal): number {
  return (a.parkedUntil ?? '').localeCompare(b.parkedUntil ?? '');
}

function assembleColumns(deals: BoardDeal[]): BoardColumn[] {
  return BOARD_COLUMNS.map((def) => {
    const inCol = deals.filter((d) => columnKeyForDeal(d) === def.key).sort(compareDeals);
    return { key: def.key, label: def.label, group: def.group, count: inCol.length, deals: inCol };
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
  client:client_id!inner ( id, client_name, starbucks_layer_enabled ),
  stage:stage_id ( label, sort_order ),
  property:property_id ( property_name, city ),
  site_submit:site_submit_id ( id, site_submit_name, submit_stage!site_submit_submit_stage_id_fkey ( name ) ),
  activity_state:deal_activity_state (
    ball_in_court, ball_in_court_party, ball_in_court_since,
    blocked_on, needs_pricing, needs_site_plan, on_agenda, seeded_fallback, parked_until
  )
`;

// Distinct accounts present in the data (from the FULL, unfiltered set) — the
// header filter offers "All" + one per account. Generalizes to phase 3.
function deriveAccounts(deals: BoardDeal[]): Account[] {
  const byId = new Map<string, Account>();
  for (const d of deals) {
    if (!d.clientId || byId.has(d.clientId)) continue;
    const labels = accountFor(d.clientId, d.clientName);
    byId.set(d.clientId, { clientId: d.clientId, name: d.clientName ?? labels.filter, token: labels.token, filter: labels.filter });
  }
  return [...byId.values()].sort((a, b) => a.filter.localeCompare(b.filter));
}

export default function useStarbucksBoard(accountFilter: string = ACCOUNT_ALL): BoardData {
  const [allDeals, setAllDeals] = useState<BoardDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => setRefreshTrigger((t) => t + 1), []);

  // Derived per account filter. accounts + agenda counts come from the FULL set
  // (so the filter always shows every account); the board views come from the
  // account-filtered set.
  const accounts = useMemo(() => deriveAccounts(allDeals), [allDeals]);
  const agendaByAccount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of allDeals) if (d.onAgenda && d.clientId) m[d.clientId] = (m[d.clientId] ?? 0) + 1;
    return m;
  }, [allDeals]);

  const filtered = useMemo(
    () => (accountFilter === ACCOUNT_ALL ? allDeals : allDeals.filter((d) => d.clientId === accountFilter)),
    [allDeals, accountFilter]
  );
  // Parked deals are off the board entirely (columns, band, counter, daily) —
  // they live only in the Parking lot until their review date (§2.24).
  const parked = useMemo(() => filtered.filter((d) => isParked(d)).sort(sortByReviewDate), [filtered]);
  const active = useMemo(() => filtered.filter((d) => !isParked(d)), [filtered]);
  const columns = useMemo(() => assembleColumns(active), [active]);
  const ready = useMemo(() => active.filter((d) => d.readyToSubmit).sort(compareDeals), [active]);
  const toClassify = useMemo(() => active.filter((d) => isToClassify(d)).sort(compareDeals), [active]);
  const daily = useMemo(
    () => computeDaily([...active.filter((d) => columnKeyForDeal(d) !== null), ...ready]),
    [active, ready]
  );

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

        setAllDeals(deals);
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

  // Realtime (spec §8): every board write funnels through deal_activity_state
  // (directly or via the reset-clock triggers), and stage moves / new deals hit
  // deal. Both fire OVIS-wide, so we debounce and let the server-filtered
  // refetch (~50 Starbucks rows) decide what actually changed. The board sits
  // open for days — no manual reload.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debouncedRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refresh(), 600);
    };
    const channel = supabase
      .channel('starbucks-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal_activity_state' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deal' }, debouncedRefresh)
      // site_submit stage now affects board membership (dead-site exclusion,
      // §2.22) — reflect a pass/kill done elsewhere (e.g. the map).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_submit' }, debouncedRefresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { columns, ready, toClassify, parked, daily, accounts, agendaByAccount, loading, error, lastSynced, refresh };
}
