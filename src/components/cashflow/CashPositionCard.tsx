import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { CASH_CONFIG, buildCalendar, todayET } from '../../lib/cashCalendar';
import { loadCashData } from './useCashData';
import { buildCashEvents } from './cashEvents';
import { Money, money, useCfFonts } from './cfTheme';
import { owedUrgency } from './OwedOutPanel';

/** app_settings key for the minimum cash Mike wants to keep in the bank (Finance Settings). */
export const CASH_CUSHION_KEY = 'cash_cushion_usd';

interface CardState {
  balance: number | null;
  asOf: string | null;
  lowest: { amount: number; date: string } | null;
  cushion: number;
  owedCount: number;
  owedTotal: number;
  owedRed: number;
}

function formatET(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

function formatDay(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Finance hub card: bank balance, 45-day low point, red when the low dips below the cushion. */
export function CashPositionCard() {
  useCfFonts();
  const navigate = useNavigate();
  const [state, setState] = useState<CardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadCashData(supabase);
        const today = todayET();
        const summary = buildCashEvents(data, today);
        const cal = buildCalendar(summary.startBalance, today, summary.events);
        const cushion = data.cushion;
        if (!cancelled) {
          setState({
            balance: data.balancesFetchedAt ? summary.startBalance : null,
            asOf: data.balancesFetchedAt,
            lowest: cal.lowest ? { amount: cal.lowest.balance, date: cal.lowest.date } : null,
            cushion,
            owedCount: summary.owed.length,
            owedTotal: summary.owed.reduce((t, o) => t + o.amount, 0),
            owedRed: summary.owed.filter((o) => owedUrgency(o.daysHeld) === 'red').length,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load cash position');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const belowCushion = !!state?.lowest && state.balance !== null && state.lowest.amount < state.cushion;

  const cells: { label: string; value: React.ReactNode; sub: string; tone?: string }[] = state
    ? [
        {
          label: 'Operating (book)',
          value: state.balance !== null ? <Money v={state.balance} /> : '—',
          sub: state.asOf ? `as of ${formatET(state.asOf)}` : 'no QBO balance — refresh on Cash tab',
        },
        {
          label: `${CASH_CONFIG.CALENDAR_DAYS}-day low`,
          value: state.lowest && state.balance !== null ? <Money v={state.lowest.amount} tone={belowCushion ? 'bad' : 'plain'} /> : '—',
          sub: state.lowest ? formatDay(state.lowest.date) : '',
          tone: belowCushion ? 'bad' : 'ok',
        },
        {
          label: 'Cushion',
          value: belowCushion ? <span className="cf-neg">BELOW</span> : <span className="cf-pos">CLEAR</span>,
          sub: `target ${money(state.cushion)}`,
          tone: belowCushion ? 'bad' : 'ok',
        },
        {
          label: 'Owed out',
          value: <Money v={state.owedTotal} tone={state.owedRed ? 'bad' : 'plain'} />,
          sub: state.owedCount === 0 ? 'nothing owed' : `${state.owedCount} item${state.owedCount === 1 ? '' : 's'}${state.owedRed ? ` · ${state.owedRed} >30d` : ''}`,
          tone: state.owedRed ? 'bad' : state.owedCount ? 'warn' : undefined,
        },
      ]
    : [];

  return (
    <button
      onClick={() => navigate('/admin/budget/forecast?tab=cash')}
      className="cf w-full text-left block"
      style={{ border: '1px solid var(--cf-border)', borderRadius: 4, padding: 6 }}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="cf-title">Cash position · {CASH_CONFIG.CALENDAR_DAYS} days</span>
        <span className="cf-btn">Open <ArrowRight className="h-3 w-3" /></span>
      </div>
      {error && <div className="cf-msg err">{error}</div>}
      {!error && !state && <div className="cf-muted px-1">Loading…</div>}
      {state && (
        <div className="cf-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {cells.map((c) => (
            <div key={c.label} className={`cf-kpi ${c.tone || ''}`}>
              <div className="cf-label">{c.label}</div>
              <div className="v">{c.value}</div>
              <div className="s">{c.sub}</div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
