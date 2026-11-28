import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Projection } from '../../lib/cashProjection';
import { CF, Money, money } from './cfTheme';

/** Light palette (planner print view) — OVIS brand colors. */
const LIGHT = { line1: '#002147', line2: '#4A6B94', grid: '#E5E7EB', axis: '#4A6B94', cushion: '#A27B5C', today: '#8FA9C8', text: '#002147' };
const DARK = { line1: CF.text, line2: CF.cyan, grid: CF.grid, axis: CF.muted, cushion: CF.amber, today: CF.cyan, text: CF.text };

const k = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n) / 1000)}k`;

/** Ending cash (after paydown, before distribution) — committed vs pipeline. Thin lines, no fills. */
export function ProjectionChart({ committed, pipeline, cushion, height = 260, dark = false }: { committed: Projection; pipeline: Projection; cushion: number; height?: number; dark?: boolean }) {
  const c = dark ? DARK : LIGHT;
  const rows = committed.months.map((m, i) => ({
    label: m.label.replace(' 20', " '"),
    committed: Math.round(m.endingCash),
    pipeline: Math.round(pipeline.months[i]?.endingCash ?? 0),
  }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: dark ? 9 : 11, fill: c.axis }} tickLine={false} axisLine={{ stroke: c.grid }} />
          <YAxis tickFormatter={k} tick={{ fontSize: dark ? 9 : 11, fill: c.axis, fontFamily: dark ? 'IBM Plex Mono, monospace' : undefined }} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            formatter={(v) => money(Number(v))}
            contentStyle={dark ? { background: CF.panel, border: `1px solid ${CF.border}`, borderRadius: 2, fontSize: 11 } : undefined}
            labelStyle={dark ? { color: CF.muted } : undefined}
            itemStyle={dark ? { fontFamily: 'IBM Plex Mono, monospace' } : undefined}
          />
          <Legend wrapperStyle={{ fontSize: dark ? 10 : 12, color: c.axis }} iconType="plainline" />
          <ReferenceLine y={cushion} stroke={c.cushion} strokeDasharray="4 3" strokeWidth={1} label={{ value: 'CUSHION', fontSize: 8, fill: c.cushion, position: 'insideBottomRight' }} />
          {dark && <ReferenceLine y={0} stroke={CF.faint} strokeWidth={1} />}
          <ReferenceLine x={rows[0]?.label} stroke={c.today} strokeWidth={1} label={{ value: 'TODAY', fontSize: 8, fill: c.today, position: 'insideTopRight' }} />
          <Line type="linear" dataKey="committed" name="Committed (≥90%)" stroke={c.line1} strokeWidth={1.25} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="pipeline" name="With pipeline (weighted)" stroke={c.line2} strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Month rows: ending cash, LOC draw/paydown, owner take-home — both scenarios. */
export function TakeHomeTable({ committed, pipeline, compact = false, dark = false }: { committed: Projection; pipeline: Projection; compact?: boolean; dark?: boolean }) {
  if (dark) {
    const loc = (draw: number, pay: number) =>
      draw > 0 ? <span className="cf-num cf-warn">+{money(draw)}</span> : pay > 0 ? <span className="cf-num cf-pos">−{money(pay)}</span> : <span className="cf-faint">·</span>;
    const end = (m: Projection['months'][number], cushion: boolean) => (
      <>
        <Money v={m.endingCash} tone={m.shortfall > 0 ? 'bad' : 'plain'} />
        {cushion && m.shortfall > 0 && <div className="cf-num cf-neg" style={{ fontSize: 10 }}>short {money(m.shortfall)}</div>}
      </>
    );
    return (
      <table className="cf-table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="r">Committed end</th>
            <th className="r">LOC</th>
            <th className="r">Take-home</th>
            <th className="r">Pipeline end</th>
            <th className="r">LOC</th>
            <th className="r">Take-home</th>
          </tr>
        </thead>
        <tbody>
          {committed.months.map((c, i) => {
            const p = pipeline.months[i];
            return (
              <tr key={c.month}>
                <td className="cf-strong whitespace-nowrap">{c.label}</td>
                <td className="r">{end(c, true)}</td>
                <td className="r">{loc(c.locDraw, c.locPaydown)}</td>
                <td className="r">{c.ownerDistribution > 0 ? <Money v={c.ownerDistribution} tone="in" /> : <span className="cf-faint cf-num">—</span>}</td>
                <td className="r">{end(p, true)}</td>
                <td className="r">{loc(p.locDraw, p.locPaydown)}</td>
                <td className="r">{p.ownerDistribution > 0 ? <Money v={p.ownerDistribution} tone="in" /> : <span className="cf-faint cf-num">—</span>}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td className="cf-label">12-mo total</td>
            <td colSpan={2}></td>
            <td className="r"><Money v={committed.totalDistribution} /></td>
            <td colSpan={2}></td>
            <td className="r"><Money v={pipeline.totalDistribution} /></td>
          </tr>
        </tbody>
      </table>
    );
  }

  const NAVY = LIGHT.text;
  const pad = compact ? 'px-2 py-0.5' : 'px-3 py-1.5';
  const loc = (draw: number, pay: number) =>
    draw > 0 ? <span style={{ color: LIGHT.cushion }}>draw {money(draw)}</span> : pay > 0 ? <span style={{ color: LIGHT.line2 }}>repay {money(pay)}</span> : '';
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full ${compact ? 'text-xs' : 'text-sm'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead style={{ backgroundColor: '#F8FAFC' }}>
          <tr className="text-xs uppercase tracking-wide" style={{ color: LIGHT.axis }}>
            <th className={`${pad} text-left`}>Month</th>
            <th className={`${pad} text-right`}>Committed end</th>
            <th className={`${pad} text-right`}>LOC</th>
            <th className={`${pad} text-right`}>Take-home</th>
            <th className={`${pad} text-right`}>Pipeline end</th>
            <th className={`${pad} text-right`}>LOC</th>
            <th className={`${pad} text-right`}>Take-home</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {committed.months.map((c, i) => {
            const p = pipeline.months[i];
            return (
              <tr key={c.month}>
                <td className={`${pad} whitespace-nowrap`} style={{ color: NAVY }}>{c.label}</td>
                <td className={`${pad} text-right`} style={{ color: c.endingCash < 0 ? '#B91C1C' : NAVY }}>{money(c.endingCash)}</td>
                <td className={`${pad} text-right`}>{loc(c.locDraw, c.locPaydown)}</td>
                <td className={`${pad} text-right font-semibold`} style={{ color: NAVY }}>{c.ownerDistribution > 0 ? money(c.ownerDistribution) : '—'}</td>
                <td className={`${pad} text-right`} style={{ color: p.endingCash < 0 ? '#B91C1C' : NAVY }}>{money(p.endingCash)}</td>
                <td className={`${pad} text-right`}>{loc(p.locDraw, p.locPaydown)}</td>
                <td className={`${pad} text-right font-semibold`} style={{ color: NAVY }}>{p.ownerDistribution > 0 ? money(p.ownerDistribution) : '—'}</td>
              </tr>
            );
          })}
          <tr className="font-semibold" style={{ backgroundColor: '#F8FAFC' }}>
            <td className={pad} style={{ color: NAVY }}>12-month total</td>
            <td colSpan={2}></td>
            <td className={`${pad} text-right`} style={{ color: NAVY }}>{money(committed.totalDistribution)}</td>
            <td colSpan={2}></td>
            <td className={`${pad} text-right`} style={{ color: NAVY }}>{money(pipeline.totalDistribution)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Each LOC draw and the inflow(s) that repay it (dark panel only). */
export function LocActivity({ committed, pipeline }: { committed: Projection; pipeline: Projection }) {
  const block = (title: string, proj: Projection) => (
    <div className="min-w-0">
      <div className="cf-label mb-0.5">{title}</div>
      {proj.draws.length === 0 ? (
        <div className="cf-muted">No LOC draws needed.</div>
      ) : (
        <table className="cf-table">
          <tbody>
            {proj.draws.map((d, i) => (
              <tr key={i}>
                <td className="cf-num whitespace-nowrap">{d.date}</td>
                <td className="r"><span className="cf-num cf-warn">+{money(d.amount)}</span></td>
                <td>
                  {d.repaidBy.length > 0 && (
                    <span className="cf-muted">
                      repaid {d.repaidBy.map((r) => `${money(r.amount)} ${r.month} · ${r.label.split(' — ')[0]}`).join('; ')}
                    </span>
                  )}
                  {d.outstanding > 0.5 && <span className="cf-neg"> {money(d.outstanding)} not repaid in 12 mo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {block('Committed — LOC draws', committed)}
      {block('With pipeline — LOC draws', pipeline)}
    </div>
  );
}
