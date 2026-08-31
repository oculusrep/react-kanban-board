// Starbucks Deal Board — full-screen wall display (spec: docs/STARBUCKS_DEAL_BOARD_SPEC.md).
// Steps 3–5: static render + slide-over. Heat is client-side from
// ball_in_court_since. Clicking a tile opens the slide-over; the star toggles
// on_agenda. A live text-scale control (A- / A+, persisted) lets Mike tune
// legibility for his viewing distance — bigger text trades against how many
// dense tiles fit before the fat column scrolls (spec §4.1 tension).
// Renders fixed inset-0 so it covers the app nav — it's a TV surface.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import useStarbucksBoard, { BoardColumn } from '../hooks/useStarbucksBoard';
import {
  Account,
  ACCOUNT_ALL,
  BoardDeal,
  CONDENSED_STACK,
  courtLabel,
  heatStyle,
  instruction,
  landlordTag,
  PALETTE,
} from '../lib/starbucksBoard';
import { supabase } from '../lib/supabaseClient';
import DealSlideOver from '../components/starbucksBoard/DealSlideOver';
import TriageQueue from '../components/starbucksBoard/TriageQueue';
import ParkingLot from '../components/starbucksBoard/ParkingLot';

// A column denser than this many tiles switches to the compact tile (spec §4.1).
const DENSE_THRESHOLD = 12;

// Text scale — read from context; every font size is `px(base)`. Persisted so
// the TV keeps its setting across reloads.
const ScaleCtx = createContext(1);
const useScale = () => useContext(ScaleCtx);
const SCALE_KEY = 'sbBoardScale';
const SCALE_MIN = 0.8;
const SCALE_MAX = 2.4;

function loadScale(): number {
  const v = Number(localStorage.getItem(SCALE_KEY));
  return Number.isFinite(v) && v > 0 ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) : 1.35;
}

const ACCOUNT_KEY = 'sbBoardAccount';

export default function StarbucksDealBoardPage() {
  const [accountFilter, setAccountFilterState] = useState<string>(() => localStorage.getItem(ACCOUNT_KEY) || ACCOUNT_ALL);
  const { columns, ready, toClassify, parked, daily, accounts, agendaByAccount, loading, error, lastSynced, refresh } = useStarbucksBoard(accountFilter);
  const [agendaOnly, setAgendaOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triageOpen, setTriageOpen] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [scale, setScale] = useState<number>(loadScale);

  useEffect(() => {
    document.title = 'Starbucks Deal Board | OVIS';
  }, []);

  function bumpScale(delta: number) {
    setScale((s) => {
      const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((s + delta) * 100) / 100));
      localStorage.setItem(SCALE_KEY, String(next));
      return next;
    });
  }

  // Account filter (persisted). Switching account via the segmented control
  // exits agenda view; clicking an account's agenda chip enters it scoped.
  function setAccountFilter(id: string) {
    setAccountFilterState(id);
    localStorage.setItem(ACCOUNT_KEY, id);
    setAgendaOnly(false);
  }
  function onAgendaChip(clientId: string) {
    if (agendaOnly && accountFilter === clientId) { setAgendaOnly(false); return; }
    setAccountFilterState(clientId);
    localStorage.setItem(ACCOUNT_KEY, clientId);
    setAgendaOnly(true);
  }

  const shown = useMemo<BoardColumn[]>(() => {
    if (!agendaOnly) return columns;
    return columns.map((c) => filterColumn(c, (d) => d.onAgenda));
  }, [columns, agendaOnly]);

  // selectable across columns, the ready band, and the parking lot
  const selectedDeal = useMemo(
    () => [...columns.flatMap((c) => c.deals), ...ready, ...parked].find((d) => d.id === selectedId) ?? null,
    [columns, ready, parked, selectedId]
  );

  // Agenda filter also applies to the ready band.
  const shownReady = useMemo(() => (agendaOnly ? ready.filter((d) => d.onAgenda) : ready), [ready, agendaOnly]);

  // Account token on tiles only carries information in the "All" view with >1
  // account; hide it when a single account is in view (confirmed) — no noise.
  const showToken = accountFilter === ACCOUNT_ALL && accounts.length > 1;

  async function toggleStar(deal: BoardDeal) {
    try {
      await supabase.from('deal_activity_state').update({ on_agenda: !deal.onAgenda }).eq('deal_id', deal.id);
      refresh();
    } catch (e) {
      console.error('toggleStar', e);
    }
  }

  return (
    <ScaleCtx.Provider value={scale}>
      <div
        className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
        style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, fontFamily: CONDENSED_STACK }}
      >
        <Header
          daily={daily}
          toClassifyCount={toClassify.length}
          onOpenTriage={() => setTriageOpen(true)}
          parkedCount={parked.length}
          onOpenParking={() => setParkingOpen(true)}
          accounts={accounts}
          accountFilter={accountFilter}
          onAccountFilter={setAccountFilter}
          agendaByAccount={agendaByAccount}
          agendaActiveClientId={agendaOnly ? accountFilter : null}
          onAgendaChip={onAgendaChip}
          lastSynced={lastSynced}
          onRefresh={refresh}
          scale={scale}
          onScale={bumpScale}
        />

        {error && (
          <div className="px-6 py-2 text-sm" style={{ color: PALETTE.hot }}>
            Board failed to load: {error}
          </div>
        )}

        {/* Ready-to-submit band — hidden entirely when empty (decisions §2.12) */}
        {shownReady.length > 0 && (
          <ReadyBand deals={shownReady} showToken={showToken} onOpen={(d) => setSelectedId(d.id)} onToggleStar={toggleStar} />
        )}

        <div className="flex-1 grid gap-3 px-4 pb-4 overflow-hidden" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((col) => (
            <Column key={col.key} col={col} showToken={showToken} onOpen={(d) => setSelectedId(d.id)} onToggleStar={toggleStar} />
          ))}
        </div>

        {loading && columns.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: PALETTE.textDim }}>
            Loading…
          </div>
        )}

        {selectedDeal && (
          <DealSlideOver deal={selectedDeal} scale={scale} onClose={() => setSelectedId(null)} onChanged={refresh} />
        )}

        {triageOpen && (
          <TriageQueue deals={toClassify} scale={scale} onScale={bumpScale} onClose={() => setTriageOpen(false)} onChanged={refresh} />
        )}

        {parkingOpen && (
          <ParkingLot
            deals={parked}
            scale={scale}
            onOpenDeal={(d) => { setSelectedId(d.id); setParkingOpen(false); }}
            onClose={() => setParkingOpen(false)}
          />
        )}
      </div>
    </ScaleCtx.Provider>
  );
}

// ---- Header: account filter + agenda + to-classify counter + daily + scale --
function Header({
  daily,
  toClassifyCount,
  onOpenTriage,
  parkedCount,
  onOpenParking,
  accounts,
  accountFilter,
  onAccountFilter,
  agendaByAccount,
  agendaActiveClientId,
  onAgendaChip,
  lastSynced,
  onRefresh,
  scale,
  onScale,
}: {
  daily: { attention: number; yours: number; theirs: number; unclassified: number; noHistory: number };
  toClassifyCount: number;
  onOpenTriage: () => void;
  parkedCount: number;
  onOpenParking: () => void;
  accounts: Account[];
  accountFilter: string;
  onAccountFilter: (id: string) => void;
  agendaByAccount: Record<string, number>;
  agendaActiveClientId: string | null;
  onAgendaChip: (clientId: string) => void;
  lastSynced: Date | null;
  onRefresh: () => void;
  scale: number;
  onScale: (delta: number) => void;
}) {
  const px = (n: number) => Math.round(n * scale);
  const seg = (active: boolean) => ({
    fontSize: px(13),
    padding: `${px(2)}px ${px(9)}px`,
    border: `1px solid ${active ? PALETTE.text : PALETTE.textDim}`,
    backgroundColor: active ? PALETTE.text : 'transparent',
    color: active ? PALETTE.ground : PALETTE.textDim,
  });
  return (
    <div className="flex items-start justify-between px-6 pt-4 pb-3">
      <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
        <h1 className="font-semibold tracking-wide" style={{ color: PALETTE.text, fontSize: px(20) }}>
          STARBUCKS
        </h1>

        {/* account filter (only if >1 account) */}
        {accounts.length > 1 && (
          <div className="flex items-center gap-1" title="Account">
            <button className="rounded" style={seg(accountFilter === ACCOUNT_ALL)} onClick={() => onAccountFilter(ACCOUNT_ALL)}>All</button>
            {accounts.map((a) => (
              <button key={a.clientId} className="rounded" style={seg(accountFilter === a.clientId && agendaActiveClientId === null)} onClick={() => onAccountFilter(a.clientId)}>
                {a.filter}
              </button>
            ))}
          </div>
        )}

        {/* per-account agenda chips */}
        {accounts.some((a) => (agendaByAccount[a.clientId] ?? 0) > 0) && (
          <div className="flex items-center gap-2" style={{ fontSize: px(13), color: PALETTE.textDim }}>
            <span>Agenda:</span>
            {accounts.map((a) => {
              const n = agendaByAccount[a.clientId] ?? 0;
              if (n === 0) return null;
              const active = agendaActiveClientId === a.clientId;
              return (
                <button
                  key={a.clientId}
                  onClick={() => onAgendaChip(a.clientId)}
                  className="rounded px-2"
                  style={{ border: `1px solid ${active ? PALETTE.text : PALETTE.textDim}`, backgroundColor: active ? PALETTE.text : 'transparent', color: active ? PALETTE.ground : PALETTE.text, fontSize: px(13) }}
                  title={active ? 'Exit agenda view' : `Agenda for ${a.filter}`}
                >
                  {active ? '★' : '☆'} {a.token} {n}
                </button>
              );
            })}
          </div>
        )}

        {/* text-size control */}
        <div className="flex items-center gap-1" title="Text size">
          <ScaleBtn onClick={() => onScale(-0.1)} label="A−" px={px} />
          <span className="tabular-nums" style={{ fontSize: px(11), color: PALETTE.textDim, minWidth: px(30), textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <ScaleBtn onClick={() => onScale(0.1)} label="A+" px={px} />
        </div>
      </div>

      <div className="flex items-start gap-8">
        {/* Parking lot — quiet (parking shouldn't burn); calm dim counter. Hidden at 0. */}
        {parkedCount > 0 && (
          <button onClick={onOpenParking} className="text-right leading-none self-end" title="Open parking lot">
            <div className="tabular-nums" style={{ fontSize: px(20), fontWeight: 600, color: PALETTE.textDim }}>
              {parkedCount}
            </div>
            <div style={{ fontSize: px(13), color: PALETTE.textDim }}>parking lot →</div>
          </button>
        )}

        {/* to-classify counter — LOUDER than the daily number when non-zero,
            because unclassified deals corrupt every other figure. Hidden at 0. */}
        {toClassifyCount > 0 && (
          <button onClick={onOpenTriage} className="text-right leading-none" title="Open triage queue">
            <div className="tabular-nums" style={{ fontSize: px(60), fontWeight: 700, color: PALETTE.hot }}>
              {toClassifyCount}
            </div>
            <div style={{ fontSize: px(16), fontWeight: 600, color: PALETTE.hot }}>to classify →</div>
          </button>
        )}

        <div className="text-right leading-tight">
          <div className="tabular-nums" style={{ fontSize: px(44), fontWeight: 600, color: daily.attention > 0 ? PALETTE.text : PALETTE.textDim }}>
            {daily.attention} <span style={{ fontSize: px(18), color: PALETTE.textDim }}>need attention</span>
          </div>
          <div style={{ fontSize: px(15), color: PALETTE.textDim }}>
            {daily.yours} yours · {daily.theirs} theirs · {daily.unclassified} no court · {daily.noHistory} no history
          </div>
          <button onClick={onRefresh} className="mt-1 tabular-nums" style={{ fontSize: px(12), color: PALETTE.textDim }} title="Click to refresh">
            {lastSynced ? `synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'syncing…'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScaleBtn({ onClick, label, px }: { onClick: () => void; label: string; px: (n: number) => number }) {
  return (
    <button
      onClick={onClick}
      className="rounded"
      style={{ fontSize: px(13), color: PALETTE.textDim, border: `1px solid ${PALETTE.textDim}`, padding: `${px(1)}px ${px(6)}px` }}
    >
      {label}
    </button>
  );
}

interface TileHandlers {
  onOpen: (d: BoardDeal) => void;
  onToggleStar: (d: BoardDeal) => void;
}

// ---- Ready-to-submit band (decisions §2.12). Full-width, above the columns,
// hot; the loudest thing on the board under the header. Rendered only when
// non-empty (the parent guards this). Tiles flow horizontally and wrap. -------
function ReadyBand({ deals, showToken, onOpen, onToggleStar }: { deals: BoardDeal[]; showToken: boolean } & TileHandlers) {
  const scale = useScale();
  const px = (n: number) => Math.round(n * scale);
  return (
    <div
      className="mx-4 mb-3 rounded-lg px-3 py-2"
      style={{ backgroundColor: 'rgba(214,69,60,0.14)', border: `1px solid ${PALETTE.hot}` }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span className="uppercase tracking-wider font-semibold" style={{ color: PALETTE.hot, fontSize: px(14) }}>
          Ready to submit
        </span>
        <span className="tabular-nums" style={{ color: PALETTE.hot, fontSize: px(14) }}>{deals.length}</span>
        <span style={{ color: PALETTE.textDim, fontSize: px(12) }}>· nothing's blocking these — submit them</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {deals.map((d) => (
          <div
            key={d.id}
            onClick={() => onOpen(d)}
            className="relative rounded-md pl-3 pr-2 py-1 flex items-center gap-2 cursor-pointer"
            style={{ backgroundColor: 'rgba(214,69,60,0.18)', minWidth: px(180), maxWidth: px(320) }}
            title={d.name}
          >
            <div className="absolute left-0 top-0 bottom-0 rounded-l-md" style={{ width: 6, backgroundColor: PALETTE.hot }} />
            <div className="min-w-0 flex-1">
              <div className="truncate" style={{ fontWeight: 600, fontSize: px(16), color: PALETTE.text }}>{d.name}</div>
              <div className="truncate" style={{ fontSize: px(11), color: PALETTE.textDim }}>{d.city ?? '—'}{showToken ? ` · ${d.accountToken}` : ''} · {d.days}d</div>
            </div>
            <span className="whitespace-nowrap" style={{ fontSize: px(12), fontWeight: 600, color: PALETTE.hot }}>Submit it →</span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleStar(d); }}
              style={{ color: d.onAgenda ? PALETTE.text : PALETTE.textDim, opacity: d.onAgenda ? 1 : 0.4, fontSize: px(15) }}
              aria-label={d.onAgenda ? 'Remove from agenda' : 'Add to agenda'}
            >
              {d.onAgenda ? '★' : '☆'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Column (spec §4, decisions §2.12). Pre-Submittal blockers are their own
// columns; a small group super-label ties the four back to one stage. Columns
// over the dense threshold (transiently, e.g. Unset before classification) use
// compact tiles. Empty columns render dim. ------------------------------------
function Column({ col, showToken, onOpen, onToggleStar }: { col: BoardColumn; showToken: boolean } & TileHandlers) {
  const scale = useScale();
  const px = (n: number) => Math.round(n * scale);
  const empty = col.count === 0;
  const dense = col.deals.length > DENSE_THRESHOLD;
  return (
    <div className="flex flex-col rounded-lg overflow-hidden" style={{ backgroundColor: PALETTE.column, opacity: empty ? 0.5 : 1 }}>
      <div className="px-3 pt-2 pb-2">
        {col.group && (
          <div className="uppercase tracking-wider" style={{ color: PALETTE.textDim, fontSize: px(9), opacity: 0.7 }}>{col.group}</div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold uppercase tracking-wide" style={{ color: PALETTE.textDim, fontSize: px(15) }}>
            {col.label}
          </span>
          <span className="tabular-nums" style={{ color: PALETTE.textDim, fontSize: px(15) }}>{col.count}</span>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-2 pb-2 flex flex-col ${dense ? 'gap-1' : 'gap-2'}`}>
        {col.deals.map((d) => (
          <Tile key={d.id} deal={d} dense={dense} showToken={showToken} onOpen={onOpen} onToggleStar={onToggleStar} />
        ))}
      </div>
    </div>
  );
}

// ---- Tile (spec §6.4). Dense variant keeps fat columns compact. -----------
function Tile({ deal, dense, showToken, onOpen, onToggleStar }: { deal: BoardDeal; dense: boolean; showToken: boolean } & TileHandlers) {
  const scale = useScale();
  const px = (n: number) => Math.round(n * scale);
  const hs = heatStyle(deal.heat);
  const tag = landlordTag(deal); // "Pricing" | "Site plan" | "Both" on awaiting_ll tiles

  const tagChip = tag ? (
    <span
      className="rounded whitespace-nowrap"
      style={{ fontSize: px(11), color: PALETTE.textDim, border: `1px solid ${PALETTE.textDim}`, padding: `0 ${px(4)}px` }}
    >
      {tag}
    </span>
  ) : null;

  const star = (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleStar(deal); }}
      style={{ color: deal.onAgenda ? PALETTE.text : PALETTE.textDim, opacity: deal.onAgenda ? 1 : 0.4, fontSize: px(dense ? 15 : 16) }}
      aria-label={deal.onAgenda ? 'Remove from agenda' : 'Add to agenda'}
    >
      {deal.onAgenda ? '★' : '☆'}
    </button>
  );

  const leftBar = (
    <div
      className="absolute left-0 top-0 bottom-0 rounded-l-md"
      style={{
        width: 6,
        backgroundColor: hs.dashed ? 'transparent' : hs.bar,
        borderLeft: hs.dashed ? `3px dashed ${PALETTE.textDim}` : undefined,
      }}
    />
  );

  if (dense) {
    return (
      <div
        onClick={() => onOpen(deal)}
        className="relative rounded-md pl-3 pr-2 flex items-center gap-2 cursor-pointer"
        style={{ backgroundColor: hs.fill, minHeight: px(30), paddingTop: px(2), paddingBottom: px(2) }}
        title={deal.name}
      >
        {leftBar}
        <span className="truncate flex-1 min-w-0" style={{ fontWeight: 600, fontSize: px(17), letterSpacing: '-0.01em', color: PALETTE.text }}>
          {deal.name}
        </span>
        {showToken && <span className="whitespace-nowrap" style={{ fontSize: px(10), color: PALETTE.textDim }}>{deal.accountToken}</span>}
        {tagChip}
        <span className="tabular-nums whitespace-nowrap" style={{ fontSize: px(12), color: denseRightColor(deal) }}>
          {denseRightText(deal)}
        </span>
        {star}
      </div>
    );
  }

  const verb = instruction(deal);
  return (
    <div
      onClick={() => onOpen(deal)}
      className="relative rounded-md px-3 py-2 cursor-pointer"
      style={{ backgroundColor: hs.fill, minHeight: px(76) }}
    >
      {leftBar}
      <div className="absolute right-2 top-2">{star}</div>

      <div className="pl-2 pr-4">
        <div className="truncate" style={{ fontWeight: 600, fontSize: px(20), letterSpacing: '-0.01em', color: PALETTE.text }}>
          {deal.name}
        </div>
        <div className="flex items-center gap-2" style={{ fontSize: px(13), color: PALETTE.textDim }}>
          <span className="truncate">{deal.city ?? '—'}</span>
          {showToken && <span style={{ fontSize: px(11) }}>· {deal.accountToken}</span>}
          {tagChip}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2" style={{ fontSize: px(13) }}>
          {deal.heat === 'no_history' ? (
            <span style={{ color: PALETTE.textDim }}>no history</span>
          ) : deal.heat === 'unclassified' ? (
            <>
              <span style={{ color: PALETTE.textDim }} className="tabular-nums">{deal.days}d</span>
              <span style={{ color: PALETTE.text, fontWeight: 600 }} className="whitespace-nowrap">Set the court →</span>
            </>
          ) : (
            <>
              <span style={{ color: PALETTE.textDim }} className="tabular-nums truncate">
                {courtLabel(deal)} · {deal.days}d
              </span>
              {verb && (
                <span style={{ color: deal.heat === 'hot' ? PALETTE.hot : PALETTE.warm, fontWeight: 600 }} className="whitespace-nowrap">
                  {verb} →
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function denseRightText(d: BoardDeal): string {
  if (d.heat === 'no_history') return '—';
  if (d.heat === 'unclassified') return 'set';
  return `${d.days}d`;
}
function denseRightColor(d: BoardDeal): string {
  if (d.heat === 'hot') return PALETTE.hot;
  if (d.heat === 'warm') return PALETTE.warm;
  return PALETTE.textDim;
}

function filterColumn(col: BoardColumn, pred: (d: BoardDeal) => boolean): BoardColumn {
  const deals = col.deals.filter(pred);
  return { ...col, deals, count: deals.length };
}
