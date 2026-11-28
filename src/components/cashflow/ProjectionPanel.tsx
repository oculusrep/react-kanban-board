import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { CashData } from './useCashData';
import { computeProjections } from './projectionData';
import { ProjectionChart, TakeHomeTable, LocActivity } from './ProjectionParts';
import { money } from './cfTheme';
import type { ProjectionBundle } from './projectionData';
import type { SteadyPay } from '../../lib/cashProjection';

function steadyText(s: SteadyPay) {
  if (s.amount > 0) return { value: `${money(s.amount)}/mo`, sub: 'every month for 12 months, starting now' };
  if (s.startLabel) return { value: '$0 now', sub: `could start ${s.startLabel} at ${money(s.amountFromStart)}/mo` };
  return { value: '$0', sub: 'no flat amount fits in the next 12 months' };
}

/** Steady monthly owner pay (committed / pipeline), LOC payoff and tax reserve — top of the take-home section. */
export function SteadyPayStrip({ p }: { p: ProjectionBundle }) {
  const c = steadyText(p.committed.steady);
  const w = steadyText(p.pipeline.steady);
  const loc = p.summary.payoffs[0];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-1.5" style={{ borderBottom: '1px solid var(--cf-border)' }}>
      <div className="cf-kpi"><div className="cf-label">Steady owner pay · committed</div><div className="v">{c.value}</div><div className="s">{c.sub}</div></div>
      <div className="cf-kpi"><div className="cf-label">Steady owner pay · pipeline</div><div className="v">{w.value}</div><div className="s">{w.sub}</div></div>
      <div className={`cf-kpi ${loc?.warning ? 'warn' : ''}`}>
        <div className="cf-label">LOC payoff</div>
        <div className="v">{loc ? (loc.payoffDate ? loc.payoffDate.slice(0, 7) : loc.warning ? '—' : '> 12 mo') : '—'}</div>
        <div className="s">
          {loc ? (loc.warning ? loc.warning : `${money(loc.balance ?? 0)} owed · last payment ${loc.lastPayment !== null ? money(loc.lastPayment) : '—'}`) : 'No payoff-linked payment'}
        </div>
      </div>
      <div className="cf-kpi">
        <div className="cf-label">Tax reserve</div>
        <div className="v">{Math.round(p.summary.taxReservePct * 100)}%</div>
        <div className="s">placeholder — confirm with CPA · paid Jan/Apr/Jun/Sep 15</div>
      </div>
    </div>
  );
}

interface Props {
  data: CashData;
  today: string;
}

/** 12-month projection + owner take-home (v1.5), on the Cash tab. */
export function ProjectionPanel({ data, today }: Props) {
  const p = useMemo(() => computeProjections(data, today), [data, today]);
  const [showLoc, setShowLoc] = useState(false);

  return (
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">12-month projection · owner take-home</span>
        <Link to="/admin/budget/planner" className="cf-btn">
          <Printer className="h-3 w-3" /> Planner summary
        </Link>
      </div>
      <SteadyPayStrip p={p} />
      <div className="px-1 pt-1">
        <ProjectionChart committed={p.committed} pipeline={p.pipeline} cushion={p.cushion} height={170} dark />
      </div>
      <div className="cf-scroll" style={{ maxHeight: 340 }}>
        <TakeHomeTable committed={p.committed} pipeline={p.pipeline} dark />
      </div>
      <div className="cf-pb space-y-1.5">
        <button onClick={() => setShowLoc(!showLoc)} className="cf-link" style={{ fontSize: 11 }}>
          {showLoc ? '▾' : '▸'} LOC draws and what repays them
        </button>
        {showLoc && <LocActivity committed={p.committed} pipeline={p.pipeline} />}
        <div className="cf-faint">
          Below the <span className="cf-num">{money(p.cushion)}</span> cushion → LOC draw (<span className="cf-num">{money(p.locAvailable)}</span> available).
          Month-end cash above it repays the LOC first. Take-home = the most that can be taken without any later day in the window
          falling below the cushion (so it is never followed by borrowing); assumed taken. Steady owner pay = the largest flat
          monthly amount with no day below the cushion and no LOC draws; it replaces payroll for Mike. Committed = deals ≥90%;
          pipeline adds lower-probability payments × probability. Arty's draws are recouped from his splits; tax reserve accrues on
          cash in − business expenses.
        </div>
      </div>
    </div>
  );
}
