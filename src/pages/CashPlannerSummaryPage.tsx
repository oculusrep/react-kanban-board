import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useCashData } from '../components/cashflow/useCashData';
import { fmt } from '../components/cashflow/cashEvents';
import { computeProjections } from '../components/cashflow/projectionData';
import { ProjectionChart, TakeHomeTable } from '../components/cashflow/ProjectionParts';
import { Projection } from '../lib/cashProjection';
import { todayET } from '../lib/cashCalendar';

const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRA = '#A27B5C';

const PRINT_CSS = `
@media print {
  @page { size: letter portrait; margin: 0.35in; }
  body * { visibility: hidden !important; }
  #planner-summary, #planner-summary * { visibility: visible !important; }
  #planner-summary { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; box-shadow: none !important; }
  .no-print { display: none !important; }
}`;

function formatDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** LOC activity by month for both scenarios (only months with a draw or paydown). */
function LocByMonth({ committed, pipeline }: { committed: Projection; pipeline: Projection }) {
  const rows = committed.months
    .map((c, i) => ({ c, p: pipeline.months[i] }))
    .filter(({ c, p }) => c.locDraw || c.locPaydown || p.locDraw || p.locPaydown);
  if (rows.length === 0) return <p className="text-xs text-gray-500">No LOC draws in either scenario.</p>;
  const cell = (m: Projection['months'][number]) => (
    <>
      {m.locDraw > 0 && <span style={{ color: TERRA }}>draw {fmt(m.locDraw)} </span>}
      {m.locPaydown > 0 && (
        <span style={{ color: STEEL }}>
          repay {fmt(m.locPaydown)}{m.topInflow ? ` from ${m.topInflow.label.split(' — ')[0]}` : ''}{' '}
        </span>
      )}
      <span className="text-gray-500">owed {fmt(m.locDrawnAfter)}</span>
      {m.shortfall > 0 && <span style={{ color: '#B91C1C' }}> · short {fmt(m.shortfall)}</span>}
    </>
  );
  return (
    <table className="min-w-full text-xs">
      <thead>
        <tr style={{ color: STEEL }} className="uppercase tracking-wide">
          <th className="px-2 py-0.5 text-left">Month</th>
          <th className="px-2 py-0.5 text-left">Committed</th>
          <th className="px-2 py-0.5 text-left">With pipeline</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map(({ c, p }) => (
          <tr key={c.month}>
            <td className="px-2 py-0.5 whitespace-nowrap" style={{ color: NAVY }}>{c.label}</td>
            <td className="px-2 py-0.5">{cell(c)}</td>
            <td className="px-2 py-0.5">{cell(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One-page printable planner summary (v1.5). Route: /admin/budget/planner. */
export default function CashPlannerSummaryPage() {
  const { data, loading, error } = useCashData();
  const today = todayET();
  const p = useMemo(() => (data ? computeProjections(data, today) : null), [data, today]);

  if (loading && !data) return <div className="p-6 text-sm text-gray-500">Loading planner…</div>;
  if (error) return <div className="m-6 p-4 rounded bg-red-50 text-red-700 text-sm">{error}</div>;
  if (!data || !p) return null;

  const s = p.summary;
  const asOf = data.balancesFetchedAt
    ? new Date(data.balancesFetchedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
    : 'no QBO balance yet';

  return (
    <div className="min-h-screen py-6" style={{ backgroundColor: '#F8FAFC' }}>
      <style>{PRINT_CSS}</style>
      <div className="no-print max-w-4xl mx-auto px-4 mb-3 flex items-center justify-between">
        <Link to="/admin/budget/forecast?tab=cash" className="inline-flex items-center gap-1 text-sm" style={{ color: STEEL }}>
          <ArrowLeft className="h-4 w-4" /> Cash tab
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-white" style={{ backgroundColor: NAVY }}>
          <Printer className="h-4 w-4" /> Print / save PDF
        </button>
      </div>

      <div id="planner-summary" className="max-w-4xl mx-auto bg-white shadow rounded-lg p-6 space-y-4">
        <div className="flex items-end justify-between border-b pb-2" style={{ borderColor: NAVY }}>
          <div>
            <h1 className="text-xl font-bold" style={{ color: NAVY }}>Oculus — Cash Planner Summary</h1>
            <p className="text-xs text-gray-500">Prepared {formatDay(today)} · QBO balances as of {asOf}</p>
          </div>
          <p className="text-xs text-gray-500">Cushion {fmt(p.cushion)}</p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Operating today', value: s.balanceToday },
            { label: 'Operating after entered items', value: s.startBalance },
            { label: 'Credit available (LOC)', value: p.locAvailable },
            { label: 'Money owed out', value: s.owed.reduce((t, o) => t + o.amount, 0) },
          ].map((k) => (
            <div key={k.label} className="rounded border px-3 py-2" style={{ borderColor: SLATE }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: STEEL }}>{k.label}</p>
              <p className="text-lg font-bold" style={{ color: NAVY }}>{fmt(k.value)}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: STEEL }}>12-month ending cash — committed vs with pipeline</p>
          <ProjectionChart committed={p.committed} pipeline={p.pipeline} cushion={p.cushion} height={190} />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: STEEL }}>Owner take-home by month</p>
          <TakeHomeTable committed={p.committed} pipeline={p.pipeline} compact />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: STEEL }}>LOC draws &amp; paydowns</p>
            <LocByMonth committed={p.committed} pipeline={p.pipeline} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: STEEL }}>Top 5 expected inflows</p>
            <table className="min-w-full text-xs">
              <tbody className="divide-y">
                {p.topInflows.map((t, i) => (
                  <tr key={i}>
                    <td className="px-2 py-0.5" style={{ color: NAVY }}>{t.label.split(' — ')[0]}</td>
                    <td className="px-2 py-0.5 whitespace-nowrap">{formatDay(t.date)}</td>
                    <td className="px-2 py-0.5 text-right" style={{ color: STEEL }}>{fmt(t.amount)}</td>
                    <td className="px-2 py-0.5 text-right">{t.probability}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] text-gray-500 leading-snug">
          Operating account only (QBO). Ending cash is after LOC paydown, before the owner distribution; the distribution is
          assumed taken at month end. Committed = deals ≥ 90% probability; with pipeline adds lower-probability payments
          weighted by probability. Outflows are scheduled payments only (no payroll or taxes unless scheduled). Inflow
          amounts are Oculus's cash share (net of referral fees and other brokers' splits).
        </p>
      </div>
    </div>
  );
}
