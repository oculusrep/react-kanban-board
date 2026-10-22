import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { EVENT_LABEL, ListingEvent, fetchListingEvents, fmtDateET, fmtMoney, fmtPct } from '../../lib/compListings';
import UserByIdDisplay from '../shared/UserByIdDisplay';

// Price/status history of one offering, newest first (spec §8.5). Each ask row shows its
// change vs the previous ask; a closed row shows the verified sale_comp figures.

const CHIP: Record<string, string> = {
  listed: 'border-[#4A6B94] text-[#4A6B94]',
  relisted: 'border-[#4A6B94] text-[#4A6B94]',
  price_change: 'border-[#A27B5C] text-[#A27B5C]',
  cap_change: 'border-[#A27B5C] text-[#A27B5C]',
  under_contract: 'border-[#002147] text-[#002147]',
  back_on_market: 'border-[#4A6B94] text-[#4A6B94]',
  off_market: 'border-gray-400 text-gray-500',
  closed: 'border-[#002147] bg-[#002147] text-white',
};

interface ClosedSale { id: string; sale_price: number | null; cap_rate: number | null; noi: number | null; buyer_name: string | null; seller_name: string | null; }

function delta(curr: number | null, prev: number | null) {
  if (curr == null || prev == null || prev === 0 || curr === prev) return null;
  const pct = ((curr - prev) / prev) * 100;
  return `${curr < prev ? '▼' : '▲'} ${fmtMoney(Math.abs(curr - prev))} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
}

const ASK_TYPES = new Set(['listed', 'relisted', 'price_change', 'cap_change', 'back_on_market']);

export function ListingTimeline({ listingId, refreshKey = 0 }: { listingId: string; refreshKey?: number }) {
  const [events, setEvents] = useState<ListingEvent[] | null>(null);
  const [sales, setSales] = useState<Record<string, ClosedSale>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchListingEvents(listingId)
      .then(async (ev) => {
        const saleIds = ev.map((e) => e.sale_comp_id).filter(Boolean) as string[];
        let byId: Record<string, ClosedSale> = {};
        if (saleIds.length) {
          const { data } = await supabase.from('sale_comp')
            .select('id, sale_price, cap_rate, noi, buyer_name, seller_name').in('id', saleIds);
          byId = Object.fromEntries(((data ?? []) as ClosedSale[]).map((s) => [s.id, s]));
        }
        if (!cancelled) { setEvents(ev); setSales(byId); }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [listingId, refreshKey]);

  if (error) return <p className="text-xs text-red-700">{error}</p>;
  if (!events) return <p className="text-xs text-gray-400">Loading history…</p>;
  if (events.length === 0) return <p className="text-xs text-gray-400">No history yet.</p>;

  // Previous ask for each ask event (events are newest-first).
  const prevAsk = (i: number) => events.slice(i + 1).find((e) => ASK_TYPES.has(e.event_type) && e.price != null)?.price ?? null;

  return (
    <ol className="relative border-l border-[#8FA9C8] ml-1.5 space-y-3">
      {events.map((e, i) => {
        const sale = e.sale_comp_id ? sales[e.sale_comp_id] : null;
        const d = ASK_TYPES.has(e.event_type) ? delta(e.price, prevAsk(i)) : null;
        return (
          <li key={e.id} className="ml-4">
            <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-white border-2 border-[#4A6B94]" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded border ${CHIP[e.event_type] ?? ''}`}>{EVENT_LABEL[e.event_type]}</span>
              <span className="text-gray-500">{fmtDateET(e.event_date)}</span>
              <span className="text-gray-400">
                · {e.recorded_by_kind === 'sweep' ? 'sweep' : e.recorded_by_id ? <UserByIdDisplay userId={e.recorded_by_id} /> : 'user'}
              </span>
            </div>
            {sale ? (
              <div className="text-sm text-[#002147] mt-0.5">
                Sold {fmtMoney(sale.sale_price)}{sale.cap_rate != null && ` @ ${fmtPct(sale.cap_rate)}`}
                {sale.noi != null && <span className="text-gray-500"> · NOI {fmtMoney(sale.noi)}</span>}
                <span className="text-gray-500"> · verified: {e.verification_method?.replace('_', ' ')}</span>
              </div>
            ) : (e.price != null || e.cap_rate != null) && (
              <div className="text-sm text-[#002147] mt-0.5">
                {fmtMoney(e.price)}{e.cap_rate != null && ` @ ${fmtPct(e.cap_rate)}`}
                {e.noi != null && <span className="text-gray-500"> · NOI {fmtMoney(e.noi)}</span>}
                {d && <span className={`ml-2 text-xs ${d.startsWith('▼') ? 'text-[#A27B5C]' : 'text-[#4A6B94]'}`}>{d}</span>}
              </div>
            )}
            {e.source_url && (
              <a href={e.source_url} target="_blank" rel="noreferrer" className="text-xs text-[#4A6B94] underline break-all">source</a>
            )}
            {e.note && <p className="text-xs text-gray-600 whitespace-pre-wrap">{e.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export default ListingTimeline;
