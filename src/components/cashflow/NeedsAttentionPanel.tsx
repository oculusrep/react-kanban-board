import { useMemo, useState } from 'react';
import { daysBetween } from '../../lib/cashCalendar';
import { CashData, STAGE } from './useCashData';
import { fmt } from './cashEvents';

interface Props {
  data: CashData;
  today: string;
  onOpenDeal: (dealId: string) => void;
}

interface Row {
  key: string;
  dealId: string | null;
  dealName: string;
  client: string;
  team: string[];
  amount: number | null;
  days: number | null;
  daysLabel?: string;
}

/** Read-only v1 panel: Missing fee, Missing payout date, Past due. */
export function NeedsAttentionPanel({ data, today, onOpenDeal }: Props) {
  const groups = useMemo(() => {
    const team = (dealId: string | null) => (dealId && data.dealTeam.get(dealId)) || [];
    const open = data.payments.filter((p) => !p.payment_received && p.deal?.stage_id !== STAGE.lost);

    const missingFee: Row[] = data.openDeals
      .filter((d) => !(Number(d.fee) > 0) && !(Number(d.gci) > 0))
      .map((d) => ({
        key: d.id,
        dealId: d.id,
        dealName: d.deal_name || 'Unknown deal',
        client: d.client?.client_name || '',
        team: team(d.id),
        amount: null,
        days: null,
      }));

    const missingDate: Row[] = open
      .filter((p) => !p.payment_date_estimated)
      .map((p) => ({
        key: p.id,
        dealId: p.deal_id,
        dealName: `${p.deal?.deal_name || 'Unknown deal'} — ${p.payment_name || 'Payment'}`,
        client: p.deal?.client?.client_name || '',
        team: team(p.deal_id),
        amount: Number(p.payment_amount) || 0,
        days: null,
      }));

    const pastDue: Row[] = open
      .filter((p) => p.payment_date_estimated && p.payment_date_estimated < today)
      .map((p) => ({
        key: p.id,
        dealId: p.deal_id,
        dealName: `${p.deal?.deal_name || 'Unknown deal'} — ${p.payment_name || 'Payment'}`,
        client: p.deal?.client?.client_name || '',
        team: team(p.deal_id),
        amount: Number(p.payment_amount) || 0,
        days: daysBetween(p.payment_date_estimated!, today),
        daysLabel: 'days overdue',
      }))
      .sort((a, b) => (b.days || 0) - (a.days || 0));

    return [
      { id: 'pastDue', title: 'Past due', rows: pastDue },
      { id: 'missingDate', title: 'Missing payout date', rows: missingDate },
      { id: 'missingFee', title: 'Missing fee', rows: missingFee },
    ];
  }, [data, today]);

  const [openGroup, setOpenGroup] = useState<string | null>('pastDue');

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b" style={{ borderColor: '#8FA9C8' }}>
        <h3 className="font-semibold" style={{ color: '#002147' }}>Needs attention</h3>
        <p className="text-xs text-gray-500">Click a row to open the deal.</p>
      </div>
      {groups.map((g) => (
        <div key={g.id} className="border-b last:border-b-0">
          <button
            onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm hover:bg-gray-50"
          >
            <span className="font-medium" style={{ color: '#002147' }}>{g.title}</span>
            <span
              className="min-w-[2rem] text-center px-2 py-0.5 rounded-full text-xs font-semibold"
              style={g.rows.length > 0 ? { border: '1px solid #A27B5C', color: '#A27B5C' } : { border: '1px solid #8FA9C8', color: '#8FA9C8' }}
            >
              {g.rows.length}
            </span>
          </button>
          {openGroup === g.id && (
            <ul className="max-h-96 overflow-y-auto">
              {g.rows.length === 0 && <li className="px-4 py-2 text-xs text-gray-500">Nothing here.</li>}
              {g.rows.map((r) => (
                <li key={r.key}>
                  <button
                    disabled={!r.dealId}
                    onClick={() => r.dealId && onOpenDeal(r.dealId)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate" style={{ color: '#002147' }}>{r.dealName}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {r.client && <>{r.client} · </>}
                        {r.team.length > 0 ? r.team.join(', ') : <span style={{ color: '#A27B5C' }}>No deal team (no commission split)</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {r.amount !== null && <div style={{ color: '#4A6B94' }}>{fmt(r.amount)}</div>}
                      {r.days !== null && <div className="text-xs" style={{ color: '#A27B5C' }}>{r.days} {r.daysLabel}</div>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
