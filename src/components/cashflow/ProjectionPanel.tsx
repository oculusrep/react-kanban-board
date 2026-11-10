import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { CashData } from './useCashData';
import { computeProjections } from './projectionData';
import { ProjectionChart, TakeHomeTable, LocActivity } from './ProjectionParts';
import { money } from './cfTheme';

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
          Month-end cash above it repays the LOC first; the rest is take-home, assumed taken (lowers next month's start).
          Committed = deals ≥90%; pipeline adds lower-probability payments × probability. Outflows = scheduled payments only.
        </div>
      </div>
    </div>
  );
}
