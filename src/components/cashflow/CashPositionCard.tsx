import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { CASH_CONFIG, buildCalendar, todayET } from '../../lib/cashCalendar';
import { loadCashData } from './useCashData';
import { buildCashEvents, fmt } from './cashEvents';

/** app_settings key for the minimum cash Mike wants to keep in the bank (Finance Settings). */
export const CASH_CUSHION_KEY = 'cash_cushion_usd';

interface CardState {
  balance: number | null;
  asOf: string | null;
  lowest: { amount: number; date: string } | null;
  cushion: number;
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
  const navigate = useNavigate();
  const [state, setState] = useState<CardState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, cushionRow] = await Promise.all([
          loadCashData(supabase),
          supabase.from('app_settings').select('value').eq('key', CASH_CUSHION_KEY).maybeSingle(),
        ]);
        const today = todayET();
        const summary = buildCashEvents(data, today);
        const cal = buildCalendar(summary.startBalance, today, summary.events);
        const raw = cushionRow.data?.value;
        const cushion = Number(typeof raw === 'string' ? JSON.parse(raw) : raw) || 0;
        if (!cancelled) {
          setState({
            balance: data.balancesFetchedAt ? summary.startBalance : null,
            asOf: data.balancesFetchedAt,
            lowest: cal.lowest ? { amount: cal.lowest.balance, date: cal.lowest.date } : null,
            cushion,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load cash position');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const belowCushion = !!state?.lowest && state.balance !== null && state.lowest.amount < state.cushion;
  const red = '#B91C1C';

  return (
    <button
      onClick={() => navigate('/admin/budget/forecast?tab=cash')}
      className="w-full text-left bg-white rounded-xl border-2 p-6 hover:shadow-lg transition-all group"
      style={{ borderColor: belowCushion ? red : '#002147' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-8 w-8" style={{ color: '#002147' }} />
          <div>
            <h2 className="text-lg font-semibold" style={{ color: '#002147' }}>
              Cash Position ({CASH_CONFIG.CALENDAR_DAYS} days)
            </h2>
            <p className="text-xs text-gray-500">QBO bank balance and where it bottoms out</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#002147' }} />
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {!error && !state && <p className="mt-4 text-sm text-gray-500">Loading…</p>}
      {state && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide font-medium" style={{ color: '#4A6B94' }}>Bank balance</p>
            <p className="text-3xl font-bold" style={{ color: '#002147' }}>
              {state.balance !== null ? fmt(state.balance) : '—'}
            </p>
            <p className="text-xs text-gray-500">
              {state.asOf ? `As of ${formatET(state.asOf)}` : 'No QBO balance yet — Refresh now on the Cash tab'}
            </p>
          </div>
          <div className="sm:border-l sm:pl-4" style={{ borderColor: '#8FA9C8' }}>
            <p className="text-xs uppercase tracking-wide font-medium" style={{ color: belowCushion ? red : '#4A6B94' }}>
              {CASH_CONFIG.CALENDAR_DAYS}-day low point
            </p>
            <p className="text-3xl font-bold" style={{ color: belowCushion ? red : '#002147' }}>
              {state.lowest && state.balance !== null ? fmt(state.lowest.amount) : '—'}
            </p>
            <p className="text-xs" style={{ color: belowCushion ? red : '#6B7280' }}>
              {state.lowest && state.balance !== null ? `on ${formatDay(state.lowest.date)}` : ''}
              {' · '}cushion {fmt(state.cushion)}
              {belowCushion && ' — below cushion'}
            </p>
          </div>
        </div>
      )}
    </button>
  );
}
