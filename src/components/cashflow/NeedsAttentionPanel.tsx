import { useMemo, useState } from 'react';
import { daysBetween } from '../../lib/cashCalendar';
import { CashData, STAGE } from './useCashData';
import { Money } from './cfTheme';

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
    <div className="cf-panel">
      <div className="cf-ph">
        <span className="cf-title">Needs attention</span>
        <span className="cf-note">click a row to open the deal</span>
      </div>
      {groups.map((g) => (
        <div key={g.id} style={{ borderBottom: '1px solid var(--cf-row)' }}>
          <button
            onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}
            className="w-full px-2 py-1 flex items-center justify-between text-left"
          >
            <span className="cf-label">{openGroup === g.id ? '▾' : '▸'} {g.title}</span>
            <span className={`cf-num ${g.rows.length > 0 ? 'cf-warn' : 'cf-faint'}`}>{g.rows.length}</span>
          </button>
          {openGroup === g.id && (
            <div className="cf-scroll" style={{ maxHeight: 260 }}>
              <table className="cf-table">
                <tbody>
                  {g.rows.length === 0 && <tr><td className="cf-muted">Nothing here.</td></tr>}
                  {g.rows.map((r) => (
                    <tr key={r.key} className={r.dealId ? 'cursor-pointer' : ''} onClick={() => r.dealId && onOpenDeal(r.dealId)}>
                      <td className="min-w-0">
                        <div className="cf-strong truncate">{r.dealName}</div>
                        <div className="cf-faint truncate">
                          {r.client && <>{r.client} · </>}
                          {r.team.length > 0 ? r.team.join(', ') : <span className="cf-warn">No deal team</span>}
                        </div>
                      </td>
                      <td className="r">
                        {r.amount !== null && <Money v={r.amount} />}
                        {r.days !== null && <div className="cf-num cf-neg">{r.days}d</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
