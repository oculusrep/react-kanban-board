// Starbucks Deal Board — full-screen wall display (spec: docs/STARBUCKS_DEAL_BOARD_SPEC.md).
// Steps 3–5: static render + slide-over. Heat is client-side from
// ball_in_court_since. Clicking a tile opens the slide-over; the star toggles
// on_agenda. A live text-scale control (A- / A+, persisted) lets Mike tune
// legibility for his viewing distance — bigger text trades against how many
// dense tiles fit before the fat column scrolls (spec §4.1 tension).
// Renders fixed inset-0 so it covers the app nav — it's a TV surface.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import useStarbucksBoard, {
  BoardColumn,
  BoardSubhead,
} from '../hooks/useStarbucksBoard';
import {
  BoardDeal,
  CONDENSED_STACK,
  courtLabel,
  heatStyle,
  instruction,
  PALETTE,
} from '../lib/starbucksBoard';
import { supabase } from '../lib/supabaseClient';
import DealSlideOver from '../components/starbucksBoard/DealSlideOver';

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

export default function StarbucksDealBoardPage() {
  const { columns, daily, loading, error, lastSynced, refresh } = useStarbucksBoard();
  const [agendaOnly, setAgendaOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const agendaCount = useMemo(
    () => columns.reduce((n, c) => n + c.deals.filter((d) => d.onAgenda).length, 0),
    [columns]
  );

  const shown = useMemo<BoardColumn[]>(() => {
    if (!agendaOnly) return columns;
    return columns.map((c) => filterColumn(c, (d) => d.onAgenda));
  }, [columns, agendaOnly]);

  const selectedDeal = useMemo(
    () => columns.flatMap((c) => c.deals).find((d) => d.id === selectedId) ?? null,
    [columns, selectedId]
  );

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
          agendaCount={agendaCount}
          agendaOnly={agendaOnly}
          onToggleAgenda={() => setAgendaOnly((v) => !v)}
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

        <div className="flex-1 grid gap-3 px-4 pb-4 overflow-hidden" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((col) => (
            <Column key={col.stage} col={col} onOpen={(d) => setSelectedId(d.id)} onToggleStar={toggleStar} />
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
      </div>
    </ScaleCtx.Provider>
  );
}

// ---- Header: daily number + agenda + text scale + last synced --------------
function Header({
  daily,
  agendaCount,
  agendaOnly,
  onToggleAgenda,
  lastSynced,
  onRefresh,
  scale,
  onScale,
}: {
  daily: { attention: number; yours: number; theirs: number; unclassified: number; noHistory: number };
  agendaCount: number;
  agendaOnly: boolean;
  onToggleAgenda: () => void;
  lastSynced: Date | null;
  onRefresh: () => void;
  scale: number;
  onScale: (delta: number) => void;
}) {
  const px = (n: number) => Math.round(n * scale);
  return (
    <div className="flex items-start justify-between px-6 pt-4 pb-3">
      <div className="flex items-center gap-4">
        <h1 className="font-semibold tracking-wide" style={{ color: PALETTE.text, fontSize: px(20) }}>
          STARBUCKS
        </h1>
        <button
          onClick={onToggleAgenda}
          className="rounded px-3 py-1"
          style={{
            fontSize: px(14),
            border: `1px solid ${agendaOnly ? PALETTE.text : PALETTE.textDim}`,
            color: agendaOnly ? PALETTE.ground : PALETTE.textDim,
            backgroundColor: agendaOnly ? PALETTE.text : 'transparent',
          }}
        >
          {agendaOnly ? '★' : '☆'} Agenda ({agendaCount})
        </button>

        {/* text-size control */}
        <div className="flex items-center gap-1" title="Text size">
          <ScaleBtn onClick={() => onScale(-0.1)} label="A−" px={px} />
          <span className="tabular-nums" style={{ fontSize: px(11), color: PALETTE.textDim, minWidth: px(30), textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <ScaleBtn onClick={() => onScale(0.1)} label="A+" px={px} />
        </div>
      </div>

      <div className="text-right leading-tight">
        <div className="tabular-nums" style={{ fontSize: px(44), fontWeight: 600, color: daily.attention > 0 ? PALETTE.text : PALETTE.textDim }}>
          {daily.attention} <span style={{ fontSize: px(18), color: PALETTE.textDim }}>need attention</span>
        </div>
        <div style={{ fontSize: px(15), color: PALETTE.textDim }}>
          {daily.yours} yours · {daily.theirs} theirs · {daily.unclassified} to classify · {daily.noHistory} no history
        </div>
        <button onClick={onRefresh} className="mt-1 tabular-nums" style={{ fontSize: px(12), color: PALETTE.textDim }} title="Click to refresh">
          {lastSynced ? `synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'syncing…'}
        </button>
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

// ---- Column (spec §4). Empty renders dim; Pre-Submittal shows subheads. ----
function Column({ col, onOpen, onToggleStar }: { col: BoardColumn } & TileHandlers) {
  const scale = useScale();
  const px = (n: number) => Math.round(n * scale);
  const empty = col.count === 0;
  const dense = col.deals.length > DENSE_THRESHOLD;
  return (
    <div className="flex flex-col rounded-lg overflow-hidden" style={{ backgroundColor: PALETTE.column, opacity: empty ? 0.5 : 1 }}>
      <div className="flex items-baseline justify-between px-3 py-2">
        <span className="font-semibold uppercase tracking-wide" style={{ color: PALETTE.textDim, fontSize: px(15) }}>
          {col.stage}
        </span>
        <span className="tabular-nums" style={{ color: PALETTE.textDim, fontSize: px(15) }}>{col.count}</span>
      </div>

      <div className={`flex-1 overflow-y-auto px-2 pb-2 flex flex-col ${dense ? 'gap-1' : 'gap-2'}`}>
        {col.subheads ? (
          col.subheads.map((sh) => <Subhead key={sh.key} sh={sh} dense={dense} onOpen={onOpen} onToggleStar={onToggleStar} />)
        ) : dense ? (
          <div className="grid grid-cols-2 gap-1">
            {col.deals.map((d) => <Tile key={d.id} deal={d} dense onOpen={onOpen} onToggleStar={onToggleStar} />)}
          </div>
        ) : (
          col.deals.map((d) => <Tile key={d.id} deal={d} dense={dense} onOpen={onOpen} onToggleStar={onToggleStar} />)
        )}
      </div>
    </div>
  );
}

// ---- Pre-Submittal blocker subhead (spec §4.1) ----------------------------
// When dense, tiles flow into TWO sub-columns so the fat column fits without
// scrolling (decisions §1.1) — the well is ~1/4 of a 1080p screen, wide enough
// for two compact tiles side by side. The subhead header spans both.
function Subhead({ sh, dense, onOpen, onToggleStar }: { sh: BoardSubhead; dense: boolean } & TileHandlers) {
  const scale = useScale();
  const px = (n: number) => Math.round(n * scale);
  if (sh.deals.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between px-1 pt-1">
        <span className="uppercase tracking-wider" style={{ color: PALETTE.textDim, fontSize: px(12) }}>{sh.label}</span>
        <span className="tabular-nums" style={{ color: PALETTE.textDim, fontSize: px(12) }}>{sh.deals.length}</span>
      </div>
      <div className={dense ? 'grid grid-cols-2 gap-1' : 'flex flex-col gap-2'}>
        {sh.deals.map((d) => (
          <Tile key={d.id} deal={d} dense={dense} onOpen={onOpen} onToggleStar={onToggleStar} />
        ))}
      </div>
    </div>
  );
}

// ---- Tile (spec §6.4). Dense variant keeps fat columns compact. -----------
function Tile({ deal, dense, onOpen, onToggleStar }: { deal: BoardDeal; dense: boolean } & TileHandlers) {
  const scale = useScale();
  const px = (n: number) => Math.round(n * scale);
  const hs = heatStyle(deal.heat);

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
        <div className="truncate" style={{ fontSize: px(13), color: PALETTE.textDim }}>
          {deal.city ?? '—'}
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
  return {
    ...col,
    deals,
    count: deals.length,
    subheads: col.subheads ? col.subheads.map((sh) => ({ ...sh, deals: sh.deals.filter(pred) })) : null,
  };
}
