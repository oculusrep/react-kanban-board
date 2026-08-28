// Starbucks Deal Board — full-screen wall display (spec: docs/STARBUCKS_DEAL_BOARD_SPEC.md).
// Step 3: static render. Heat is computed client-side from ball_in_court_since;
// tiles are not yet interactive (slide-over is step 5, realtime step 6).
// Renders fixed inset-0 so it covers the app nav — it's a TV surface.

import { useEffect, useMemo, useState } from 'react';
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

export default function StarbucksDealBoardPage() {
  const { columns, daily, loading, error, lastSynced, refresh } = useStarbucksBoard();
  const [agendaOnly, setAgendaOnly] = useState(false);

  useEffect(() => {
    document.title = 'Starbucks Deal Board | OVIS';
  }, []);

  const agendaCount = useMemo(
    () => columns.reduce((n, c) => n + c.deals.filter((d) => d.onAgenda).length, 0),
    [columns]
  );

  const shown = useMemo<BoardColumn[]>(() => {
    if (!agendaOnly) return columns;
    return columns.map((c) => filterColumn(c, (d) => d.onAgenda));
  }, [columns, agendaOnly]);

  return (
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
      />

      {error && (
        <div className="px-6 py-2 text-sm" style={{ color: PALETTE.hot }}>
          Board failed to load: {error}
        </div>
      )}

      <div className="flex-1 grid gap-3 px-4 pb-4 overflow-hidden" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((col) => (
          <Column key={col.stage} col={col} />
        ))}
      </div>

      {loading && columns.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ color: PALETTE.textDim }}>
          Loading…
        </div>
      )}
    </div>
  );
}

// ---- Header: daily number + agenda + last synced (spec §9, §9.1, §8) ------
function Header({
  daily,
  agendaCount,
  agendaOnly,
  onToggleAgenda,
  lastSynced,
  onRefresh,
}: {
  daily: { attention: number; yours: number; theirs: number; unclassified: number; noHistory: number };
  agendaCount: number;
  agendaOnly: boolean;
  onToggleAgenda: () => void;
  lastSynced: Date | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-start justify-between px-6 pt-4 pb-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold tracking-wide" style={{ color: PALETTE.text }}>
          STARBUCKS
        </h1>
        <button
          onClick={onToggleAgenda}
          className="rounded px-3 py-1 text-sm"
          style={{
            border: `1px solid ${agendaOnly ? PALETTE.text : PALETTE.textDim}`,
            color: agendaOnly ? PALETTE.ground : PALETTE.textDim,
            backgroundColor: agendaOnly ? PALETTE.text : 'transparent',
          }}
        >
          {agendaOnly ? '★' : '☆'} Agenda ({agendaCount})
        </button>
      </div>

      <div className="text-right leading-tight">
        <div className="tabular-nums" style={{ fontSize: 40, fontWeight: 600, color: daily.attention > 0 ? PALETTE.text : PALETTE.textDim }}>
          {daily.attention} <span style={{ fontSize: 18, color: PALETTE.textDim }}>need attention</span>
        </div>
        <div className="text-sm" style={{ color: PALETTE.textDim }}>
          {daily.yours} yours · {daily.theirs} theirs · {daily.unclassified} to classify · {daily.noHistory} no history
        </div>
        <button
          onClick={onRefresh}
          className="mt-1 tabular-nums"
          style={{ fontSize: 11, color: PALETTE.textDim }}
          title="Click to refresh"
        >
          {lastSynced ? `synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'syncing…'}
        </button>
      </div>
    </div>
  );
}

// ---- Column (spec §4). Empty renders dim; Pre-Submittal shows subheads. ----
function Column({ col }: { col: BoardColumn }) {
  const empty = col.count === 0;
  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden"
      style={{ backgroundColor: PALETTE.column, opacity: empty ? 0.5 : 1 }}
    >
      <div className="flex items-baseline justify-between px-3 py-2">
        <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: PALETTE.textDim }}>
          {col.stage}
        </span>
        <span className="tabular-nums text-sm" style={{ color: PALETTE.textDim }}>{col.count}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
        {col.subheads
          ? col.subheads.map((sh) => <Subhead key={sh.key} sh={sh} />)
          : col.deals.map((d) => <Tile key={d.id} deal={d} />)}
      </div>
    </div>
  );
}

// ---- Pre-Submittal blocker subhead (spec §4.1) ----------------------------
function Subhead({ sh }: { sh: BoardSubhead }) {
  if (sh.deals.length === 0) return null; // hide empty blocker groups (tune on TV)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1 pt-1">
        <span className="text-xs uppercase tracking-wider" style={{ color: PALETTE.textDim }}>
          {sh.label}
        </span>
        <span className="tabular-nums text-xs" style={{ color: PALETTE.textDim }}>{sh.deals.length}</span>
      </div>
      {sh.deals.map((d) => (
        <Tile key={d.id} deal={d} />
      ))}
    </div>
  );
}

// ---- Tile (spec §6.4) -----------------------------------------------------
function Tile({ deal }: { deal: BoardDeal }) {
  const hs = heatStyle(deal.heat);
  const verb = instruction(deal);

  return (
    <div
      className="relative rounded-md px-3 py-2"
      style={{ backgroundColor: hs.fill, minHeight: 76 }}
    >
      {/* heat bar */}
      <div
        className="absolute left-0 top-0 bottom-0 rounded-l-md"
        style={{
          width: 6,
          backgroundColor: hs.dashed ? 'transparent' : hs.bar,
          borderLeft: hs.dashed ? `3px dashed ${PALETTE.textDim}` : undefined,
        }}
      />

      {/* agenda star (visual only in step 3) */}
      <div
        className="absolute right-2 top-2 text-sm"
        style={{ color: deal.onAgenda ? PALETTE.text : PALETTE.textDim, opacity: deal.onAgenda ? 1 : 0.4 }}
      >
        {deal.onAgenda ? '★' : '☆'}
      </div>

      <div className="pl-2 pr-4">
        <div className="truncate" style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', color: PALETTE.text }}>
          {deal.name}
        </div>
        <div className="truncate" style={{ fontSize: 12, color: PALETTE.textDim }}>
          {deal.city ?? '—'}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
          {deal.heat === 'no_history' ? (
            <span style={{ color: PALETTE.textDim }}>no history</span>
          ) : deal.heat === 'unclassified' ? (
            <>
              <span style={{ color: PALETTE.textDim }} className="tabular-nums">
                {deal.days}d
              </span>
              <span style={{ color: PALETTE.text, fontWeight: 600 }} className="whitespace-nowrap">
                Set the court →
              </span>
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

// filter a column's deals + subheads by a predicate (agenda view)
function filterColumn(col: BoardColumn, pred: (d: BoardDeal) => boolean): BoardColumn {
  const deals = col.deals.filter(pred);
  return {
    ...col,
    deals,
    count: deals.length,
    subheads: col.subheads
      ? col.subheads.map((sh) => ({ ...sh, deals: sh.deals.filter(pred) }))
      : null,
  };
}
