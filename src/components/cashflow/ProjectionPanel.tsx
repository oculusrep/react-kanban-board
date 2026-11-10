import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { CashData } from './useCashData';
import { fmt } from './cashEvents';
import { computeProjections } from './projectionData';
import { ProjectionChart, TakeHomeTable, LocActivity } from './ProjectionParts';

interface Props {
  data: CashData;
  today: string;
}

/** 12-month projection + owner take-home (v1.5), on the Cash tab. */
export function ProjectionPanel({ data, today }: Props) {
  const p = useMemo(() => computeProjections(data, today), [data, today]);
  const [showLoc, setShowLoc] = useState(true);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b flex flex-wrap items-start justify-between gap-3" style={{ borderColor: '#8FA9C8' }}>
        <div>
          <h3 className="font-semibold" style={{ color: '#002147' }}>12-month projection &amp; owner take-home</h3>
          <p className="text-xs text-gray-500 max-w-3xl">
            Month by month from the Operating book balance. Cash under the {fmt(p.cushion)} cushion draws on the LOC
            ({fmt(p.locAvailable)} available); cash above it at month end pays the LOC down first, and the rest is the
            owner distribution — assumed taken, so it lowers next month's start. Committed = deals ≥ 90%; with pipeline
            adds lower-probability payments weighted by probability. Outflows are the scheduled payments only (no payroll
            or taxes unless scheduled).
          </p>
        </div>
        <Link
          to="/admin/budget/planner"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-white"
          style={{ backgroundColor: '#002147' }}
        >
          <Printer className="h-4 w-4" /> Planner summary
        </Link>
      </div>
      <div className="p-4 space-y-4">
        <ProjectionChart committed={p.committed} pipeline={p.pipeline} cushion={p.cushion} />
        <TakeHomeTable committed={p.committed} pipeline={p.pipeline} />
        <button onClick={() => setShowLoc(!showLoc)} className="text-xs underline" style={{ color: '#4A6B94' }}>
          {showLoc ? 'Hide' : 'Show'} LOC draws &amp; paydowns
        </button>
        {showLoc && <LocActivity committed={p.committed} pipeline={p.pipeline} />}
      </div>
    </div>
  );
}
