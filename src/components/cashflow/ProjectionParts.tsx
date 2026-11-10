import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Projection } from '../../lib/cashProjection';
import { fmt } from './cashEvents';

const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRA = '#A27B5C';

const k = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n) / 1000)}k`;

/** Ending cash (after paydown, before distribution) — committed vs pipeline. */
export function ProjectionChart({ committed, pipeline, cushion, height = 260 }: { committed: Projection; pipeline: Projection; cushion: number; height?: number }) {
  const rows = committed.months.map((m, i) => ({
    label: m.label.replace(' 20', " '"),
    committed: Math.round(m.endingCash),
    pipeline: Math.round(pipeline.months[i]?.endingCash ?? 0),
  }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: STEEL }} />
          <YAxis tickFormatter={k} tick={{ fontSize: 11, fill: STEEL }} width={56} />
          <Tooltip formatter={(v) => fmt(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={cushion} stroke={TERRA} strokeDasharray="4 4" label={{ value: 'Cushion', fontSize: 10, fill: TERRA, position: 'insideTopLeft' }} />
          <Line type="monotone" dataKey="committed" name="Committed (≥90%)" stroke={NAVY} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="pipeline" name="With pipeline (weighted)" stroke={SLATE} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Month rows: ending cash, LOC draw/paydown, owner take-home — both scenarios. */
export function TakeHomeTable({ committed, pipeline, compact = false }: { committed: Projection; pipeline: Projection; compact?: boolean }) {
  const pad = compact ? 'px-2 py-0.5' : 'px-3 py-1.5';
  const loc = (draw: number, pay: number) =>
    draw > 0 ? <span style={{ color: TERRA }}>draw {fmt(draw)}</span> : pay > 0 ? <span style={{ color: STEEL }}>repay {fmt(pay)}</span> : '';
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead style={{ backgroundColor: '#F8FAFC' }}>
          <tr className="text-xs uppercase tracking-wide" style={{ color: STEEL }}>
            <th className={`${pad} text-left`} rowSpan={2}>Month</th>
            <th className={`${pad} text-center border-l`} colSpan={3} style={{ borderColor: SLATE }}>Committed (≥90%)</th>
            <th className={`${pad} text-center border-l`} colSpan={3} style={{ borderColor: SLATE }}>With pipeline</th>
          </tr>
          <tr className="text-xs uppercase tracking-wide" style={{ color: STEEL }}>
            <th className={`${pad} text-right border-l`} style={{ borderColor: SLATE }}>Ending cash</th>
            <th className={`${pad} text-right`}>LOC</th>
            <th className={`${pad} text-right`}>Owner take-home</th>
            <th className={`${pad} text-right border-l`} style={{ borderColor: SLATE }}>Ending cash</th>
            <th className={`${pad} text-right`}>LOC</th>
            <th className={`${pad} text-right`}>Owner take-home</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {committed.months.map((c, i) => {
            const p = pipeline.months[i];
            return (
              <tr key={c.month}>
                <td className={`${pad} whitespace-nowrap`} style={{ color: NAVY }}>{c.label}</td>
                <td className={`${pad} text-right border-l`} style={{ borderColor: SLATE, color: c.shortfall > 0 ? '#B91C1C' : NAVY }}>
                  {fmt(c.endingCash)}{c.shortfall > 0 && <div className="text-xs">short {fmt(c.shortfall)}</div>}
                </td>
                <td className={`${pad} text-right text-xs`}>{loc(c.locDraw, c.locPaydown)}</td>
                <td className={`${pad} text-right font-semibold`} style={{ color: c.ownerDistribution > 0 ? NAVY : SLATE }}>{fmt(c.ownerDistribution)}</td>
                <td className={`${pad} text-right border-l`} style={{ borderColor: SLATE, color: p.shortfall > 0 ? '#B91C1C' : NAVY }}>
                  {fmt(p.endingCash)}{p.shortfall > 0 && <div className="text-xs">short {fmt(p.shortfall)}</div>}
                </td>
                <td className={`${pad} text-right text-xs`}>{loc(p.locDraw, p.locPaydown)}</td>
                <td className={`${pad} text-right font-semibold`} style={{ color: p.ownerDistribution > 0 ? NAVY : SLATE }}>{fmt(p.ownerDistribution)}</td>
              </tr>
            );
          })}
          <tr className="font-semibold" style={{ backgroundColor: '#F8FAFC' }}>
            <td className={pad} style={{ color: NAVY }}>12-month total</td>
            <td className={`${pad} border-l`} style={{ borderColor: SLATE }} colSpan={2}></td>
            <td className={`${pad} text-right`} style={{ color: NAVY }}>{fmt(committed.totalDistribution)}</td>
            <td className={`${pad} border-l`} style={{ borderColor: SLATE }} colSpan={2}></td>
            <td className={`${pad} text-right`} style={{ color: NAVY }}>{fmt(pipeline.totalDistribution)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Each LOC draw and the inflow(s) that repay it. */
export function LocActivity({ committed, pipeline, compact = false }: { committed: Projection; pipeline: Projection; compact?: boolean }) {
  const block = (title: string, proj: Projection) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: STEEL }}>{title}</p>
      {proj.draws.length === 0 ? (
        <p className="text-xs text-gray-500">No LOC draws needed.</p>
      ) : (
        <ul className={`space-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
          {proj.draws.map((d, i) => (
            <li key={i}>
              <span style={{ color: TERRA }}>Draw {fmt(d.amount)}</span> on {d.date}
              {d.repaidBy.length > 0 && (
                <span className="text-gray-600">
                  {' '}→ repaid {d.repaidBy.map((r) => `${fmt(r.amount)} in ${r.month} from ${r.label} (${r.date})`).join('; ')}
                </span>
              )}
              {d.outstanding > 0.5 && <span style={{ color: '#B91C1C' }}> — {fmt(d.outstanding)} not repaid within 12 months</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {block('Committed', committed)}
      {block('With pipeline', pipeline)}
    </div>
  );
}
