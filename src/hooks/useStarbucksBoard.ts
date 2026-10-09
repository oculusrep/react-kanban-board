// Starbucks Deal Board — data hook.
// Fetches Starbucks site_submits (deal joined in when one exists) + their
// deal_activity_state, assembles the seven
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
  isUrgent,
  needsAttention,
  readyToSubmit as computeReadyToSubmit,
  SUBMIT_STAGE_TO_BOARD_STAGE,
} from '../lib/starbucksBoard';

const PAGE_SIZE = 1000;

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

interface StateRow {
  ball_in_court: BallInCourt | null;
  ball_in_court_party: string | null;
  ball_in_court_since: string | null;
  blocked_on: BlockedOn | null;
  needs_pricing: boolean | null;
  needs_site_plan: boolean | null;
  on_agenda: boolean | null;
  seeded_fallback: boolean | null;
  parked_until: string | null;
  urgent_until: string | null;
}

type One<T> = T | T[] | null;
interface ClientRow { id: string | null; client_name: string | null; starbucks_board_enabled: boolean | null }

interface RawDeal {
  id: string;
  deal_name: string | null;
  client: One<ClientRow>;
  stage: One<{ label: string | null; sort_order: number | null }>;
  property?: One<{ property_name: string | null; city: string | null }>;
  state: One<StateRow>;
}

// The board unit (decisions §2.27): one row per site_submit, deal joined in.
interface RawSiteSubmit {
  id: string;
  site_submit_name: string | null;
  client: One<ClientRow>;
  submit_stage: One<{ name: string | null }>;
  property: One<{ property_name: string | null; city: string | null }>;
  deal: One<RawDeal>;
  site_state: One<StateRow>;
}

interface CardInput {
  siteSubmitId: string | null;
  siteSubmitName: string | null;
  submitStage: string | null;
  property: { property_name: string | null; city: string | null } | null;
  client: ClientRow | null;
  deal: RawDeal | null;
  state: StateRow | null; // the card's deal_activity_state row, if any
}

// Column stage for a card: the deal stage wins when a deal exists; otherwise
// the site_submit stage decides (§2.27). Null = off-board.
function cardStage(c: CardInput): { label: string; sortOrder: number } | null {
  if (c.deal) {
    const stage = embed(c.deal.stage);
    const label = stage?.label ?? null;
    if (!label || !(BOARD_STAGES as readonly string[]).includes(label)) return null; // Lost, paid/terminal…
    // A deal on a dead site is off the board regardless of deal stage (§2.22).
    if (c.submitStage && DEAD_SUBMIT_STAGES.has(c.submitStage)) return null;
    return { label, sortOrder: stage?.sort_order ?? 0 };
  }
  const label = c.submitStage ? SUBMIT_STAGE_TO_BOARD_STAGE[c.submitStage] : undefined;
  if (!label) return null; // Pursuing Ownership, Monitor, Store Open, dead stages…
  return { label, sortOrder: BOARD_STAGES.indexOf(label) };
}

function toBoardDeal(c: CardInput): BoardDeal | null {
  // Scope (§2.14): only board-enabled clients — on the site_submit AND, when
  // there is one, on the deal. The server filter covers the first; this
  // covers the second.
  if (c.deal && !embed(c.deal.client)?.starbucks_board_enabled) return null;
  const stage = cardStage(c);
  if (!stage) return null;
  const stageLabel = stage.label;

  const st = c.state;
  const clientId = c.client?.id ?? null;
  const clientName = c.client?.client_name ?? null;

  const name =
    c.property?.property_name ||
    c.siteSubmitName ||
    c.deal?.deal_name ||
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
    id: c.siteSubmitId ?? c.deal!.id,
    dealId: c.deal?.id ?? null,
    name,
    city: c.property?.city ?? null,
    clientId,
    clientName,
    accountToken: accountFor(clientId, clientName).token,
    siteSubmitId: c.siteSubmitId,
    stageLabel,
    stageSortOrder: stage.sortOrder,
    ballInCourt,
    ballInCourtParty: st?.ball_in_court_party ?? null,
    ballInCourtSince,
    blockedOn,
    needsPricing: st?.needs_pricing ?? false,
    needsSitePlan: st?.needs_site_plan ?? false,
    onAgenda,
    seededFallback,
    parkedUntil: st?.parked_until ?? null,
    urgentUntil: st?.urgent_until ?? null,
    days,
    readyToSubmit: ready,
    urgent: isUrgent({ urgentUntil: st?.urgent_until ?? null }),
    heat,
  };
}

function fromSiteSubmit(row: RawSiteSubmit): BoardDeal | null {
  const deal = embed(row.deal);
  return toBoardDeal({
    siteSubmitId: row.id,
    siteSubmitName: row.site_submit_name,
    submitStage: embed(row.submit_stage)?.name ?? null,
    property: embed(row.property),
    client: embed(row.client),
    deal,
    // Deal-backed card reads the deal's state row; site_submit-only reads the
    // site's (the attach trigger moves it onto the deal when one is linked).
    state: deal ? embed(deal.state) : embed(row.site_state),
  });
}

// A deal with no site_submit at all is kept (nothing declared it dead, §2.22).
function fromOrphanDeal(row: RawDeal): BoardDeal | null {
  return toBoardDeal({
    siteSubmitId: null,
    siteSubmitName: null,
    submitStage: null,
    property: embed(row.property ?? null),
    client: embed(row.client),
    deal: row,
    state: embed(row.state),
  });
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

const STATE_COLS = `
  ball_in_court, ball_in_court_party, ball_in_court_since,
  blocked_on, needs_pricing, needs_site_plan, on_agenda, seeded_fallback, parked_until, urgent_until
`;

// Membership (decisions §2.14, §2.27): every site_submit of a board-enabled
// client, deal joined in. Embeds name their FK explicitly — deal_activity_state
// references both deal and site_submit, so unhinted embeds are ambiguous.
const SITE_SUBMIT_SELECT = `
  id,
  site_submit_name,
  client:client!site_submit_client_id_fkey!inner ( id, client_name, starbucks_board_enabled ),
  submit_stage:submit_stage!site_submit_submit_stage_id_fkey ( name ),
  property:property!site_submit_property_id_fkey ( property_name, city ),
  deal:deal!deal_site_submit_fk (
    id, deal_name,
    client:client_id ( id, client_name, starbucks_board_enabled ),
    stage:stage_id ( label, sort_order ),
    state:deal_activity_state!deal_activity_state_deal_id_fkey ( ${STATE_COLS} )
  ),
  site_state:deal_activity_state!deal_activity_state_site_submit_id_fkey ( ${STATE_COLS} )
`;

const ORPHAN_DEAL_SELECT = `
  id, deal_name,
  client:client_id!inner ( id, client_name, starbucks_board_enabled ),
  stage:stage_id ( label, sort_order ),
  property:property_id ( property_name, city ),
  state:deal_activity_state!deal_activity_state_deal_id_fkey ( ${STATE_COLS} )
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
        // site_submit can exceed 1000 rows pipeline-wide, but the client filter
        // keeps this to the two Starbucks accounts (~200). Paginate anyway.
        const siteRows: RawSiteSubmit[] = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error: qErr } = await supabase
            .from('site_submit')
            .select(SITE_SUBMIT_SELECT)
            .eq('client.starbucks_board_enabled', true)
            .order('id')
            .range(offset, offset + PAGE_SIZE - 1);
          if (qErr) throw qErr;
          siteRows.push(...((data as unknown as RawSiteSubmit[]) ?? []));
          if (!data || data.length < PAGE_SIZE) break;
        }
        const { data: orphanRows, error: oErr } = await supabase
          .from('deal')
          .select(ORPHAN_DEAL_SELECT)
          .is('site_submit_id', null)
          .eq('client.starbucks_board_enabled', true);
        if (oErr) throw oErr;
        if (cancelled) return;

        const deals = [
          ...siteRows.map(fromSiteSubmit),
          ...((orphanRows as unknown as RawDeal[]) ?? []).map(fromOrphanDeal),
        ].filter((d): d is BoardDeal => d !== null);

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
