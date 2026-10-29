import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  ListingFacts, VERIFICATION_OPTIONS, VerificationMethod,
  fetchListingFact, setReviewStatus, recordEvent, recordClose, markStillListed,
  fmtMoney, fmtPct, fmtDateET, todayET,
} from '../../lib/compListings';
import { GUARANTOR_TYPE_OPTIONS, LISTING_STATUS_LABEL } from '../../lib/compTypes';
import ListingTimeline from './ListingTimeline';

// One NNN listing (an operating_memorandum offering) for review: approve/reject the comp,
// record status / price / close, and its price history. Takes an id, so it mounts in the
// review page slideout or anywhere else (docs/OVIS_OVERLAY_UX.md). Diligence (rent,
// options, APN, OM PDF) happens on the comp itself — "Open comp".

interface ListingPanelProps {
  listingId: string;
  onChanged?: () => void;
  onOpenComp?: (compPropertyId: string) => void;
}

type Form = null | 'price' | 'close';

const inputCls = 'mt-0.5 block w-full border border-[#8FA9C8] rounded px-2 py-1 text-sm';
const btnPrimary = 'px-3 py-1.5 rounded text-sm bg-[#002147] text-white disabled:opacity-50';
const btnSecondary = 'px-3 py-1.5 rounded text-sm border border-[#8FA9C8] text-[#4A6B94] hover:bg-[#8FA9C8]/10 disabled:opacity-50';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#8FA9C8]">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">{label}</span>
      {children}
    </label>
  );
}

const toNum = (v: string): number | null => {
  const n = Number(v.replace(/[$,%\s]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};

function PriceChangeForm({ busy, onSubmit, onCancel }: {
  busy: boolean;
  onSubmit: (v: { price: number | null; cap: number | null; date: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState('');
  const [cap, setCap] = useState('');
  const [date, setDate] = useState(todayET());
  const [note, setNote] = useState('');
  return (
    <div className="border border-[#8FA9C8] rounded p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Labeled label="New ask ($)"><input className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} /></Labeled>
        <Labeled label="Cap (%)"><input className={inputCls} value={cap} onChange={(e) => setCap(e.target.value)} /></Labeled>
        <Labeled label="Date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Labeled>
      </div>
      <Labeled label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Labeled>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || (toNum(price) == null && toNum(cap) == null)}
          onClick={() => onSubmit({ price: toNum(price), cap: toNum(cap), date, note })}>Record change</button>
        <button className={btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CloseForm({ busy, onSubmit, onCancel }: {
  busy: boolean;
  onSubmit: (v: { date: string; price: number; cap: number | null; noi: number | null; verification: VerificationMethod; buyer: string; seller: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayET());
  const [price, setPrice] = useState('');
  const [cap, setCap] = useState('');
  const [noi, setNoi] = useState('');
  const [verification, setVerification] = useState<VerificationMethod | ''>('');
  const [buyer, setBuyer] = useState('');
  const [seller, setSeller] = useState('');
  const [note, setNote] = useState('');
  const ready = toNum(price) != null && date && verification;
  return (
    <div className="border border-[#002147] rounded p-3 space-y-2">
      <p className="text-xs text-[#4A6B94]">
        Closed figures come only from a verified source and are never copied from the ask.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Close date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Labeled>
        <Labeled label="Verified by">
          <select className={inputCls} value={verification} onChange={(e) => setVerification(e.target.value as VerificationMethod)}>
            <option value="">Select…</option>
            {VERIFICATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Sold price ($)"><input className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} /></Labeled>
        <Labeled label="Sold cap (%)"><input className={inputCls} value={cap} onChange={(e) => setCap(e.target.value)} /></Labeled>
        <Labeled label="NOI used for the cap ($)"><input className={inputCls} value={noi} onChange={(e) => setNoi(e.target.value)} /></Labeled>
        <div />
        <Labeled label="Buyer"><input className={inputCls} value={buyer} onChange={(e) => setBuyer(e.target.value)} /></Labeled>
        <Labeled label="Seller"><input className={inputCls} value={seller} onChange={(e) => setSeller(e.target.value)} /></Labeled>
      </div>
      <Labeled label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Labeled>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !ready}
          onClick={() => onSubmit({ date, price: toNum(price)!, cap: toNum(cap), noi: toNum(noi), verification: verification as VerificationMethod, buyer, seller, note })}>
          Record close
        </button>
        <button className={btnSecondary} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function ListingPanel({ listingId, onChanged, onOpenComp }: ListingPanelProps) {
  const [l, setL] = useState<ListingFacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [sharedAddress, setSharedAddress] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const f = await fetchListingFact(listingId);
      setL(f);
      if (f?.address_norm) {
        const { count } = await supabase.from('comp_property')
          .select('id', { count: 'exact', head: true }).eq('address_norm', f.address_norm);
        setSharedAddress(Math.max(0, (count ?? 1) - 1));
      } else setSharedAddress(0);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => { setLoading(true); setForm(null); load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setForm(null);
      await load();
      setHistoryKey((k) => k + 1);
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-5 text-sm text-gray-500">Loading…</div>;
  if (!l) return <div className="p-5 text-sm text-gray-500">{error ?? 'Listing not found.'}</div>;

  const status = l.listing_status;
  const guarantor = GUARANTOR_TYPE_OPTIONS.find((g) => g.value === l.guarantor_type)?.label;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 bg-[#002147] text-white flex-shrink-0 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{l.tenant ?? l.property_name ?? 'Tenant unknown'}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/15 uppercase">{LISTING_STATUS_LABEL[status]}</span>
          {l.review_status !== 'reviewed' && (
            <span className="text-[11px] px-1.5 py-0.5 rounded border border-[#A27B5C] text-[#F3D9C4] uppercase">
              {l.review_status === 'pending_review' ? 'Pending review' : 'Rejected'}
            </span>
          )}
        </div>
        <div className="text-sm text-[#8FA9C8]">
          {[l.address, l.city, l.state].filter(Boolean).join(', ')}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <Stat label="Current ask" value={<>{fmtMoney(l.current_ask)}<div className="text-xs text-[#8FA9C8]">{fmtPct(l.current_cap)} cap</div></>} />
          <Stat label="Original ask" value={<>{fmtMoney(l.original_ask)}<div className="text-xs text-[#8FA9C8]">{fmtPct(l.original_cap)} cap</div></>} />
          <Stat label="Reduction" value={l.total_reduction_pct ? `${l.total_reduction_pct}%` : '—'} />
          <Stat label="Days on market" value={l.days_on_market ?? '—'} />
        </div>
        {l.closed_price != null && (
          <div className="mt-2 text-sm">
            Sold {fmtMoney(l.closed_price)}{l.closed_cap != null && ` @ ${fmtPct(l.closed_cap)}`} on {fmtDateET(l.close_date)}
            {l.ask_to_close_cap_spread_bps != null && (
              <span className="text-[#8FA9C8]"> · {l.ask_to_close_cap_spread_bps > 0 ? '+' : ''}{l.ask_to_close_cap_spread_bps} bps vs ask</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {error && <div className="text-sm text-red-700 border border-red-300 rounded p-2">{error}</div>}

        {(l.lat == null || l.possibly_off_market || sharedAddress > 0) && (
          <div className="space-y-2">
            {l.lat == null && (
              <div className="text-sm border border-[#A27B5C] text-[#A27B5C] rounded p-2">
                Not on the map — the address did not geocode. Set the location from <b>Open comp</b> → edit location.
              </div>
            )}
            {sharedAddress > 0 && (
              <div className="text-sm border border-[#A27B5C] text-[#A27B5C] rounded p-2">
                {sharedAddress === 1 ? 'Another comp shares' : `${sharedAddress} other comps share`} this address. The sweep
                attached the listing to the best match; check it is the right property.
              </div>
            )}
            {l.possibly_off_market && (
              <div className="text-sm border border-[#A27B5C] rounded p-2 space-y-2">
                <div className="text-[#A27B5C]">
                  Possibly off market — not seen by the sweep since {fmtDateET(l.last_seen_at)}. Nothing closes automatically.
                </div>
                <div className="flex gap-2">
                  <button className={btnPrimary} disabled={busy}
                    onClick={() => run(() => recordEvent({ listingId: l.listing_id, type: 'off_market', note: 'Confirmed off market (unseen 21+ days)' }))}>
                    Confirm off market
                  </button>
                  <button className={btnSecondary} disabled={busy} onClick={() => run(() => markStillListed(l.listing_id))}>
                    Still listed
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Stat label="Lease type (as listed)" value={l.listed_lease_type ?? '—'} />
          <Stat label="Term left (as listed)" value={l.listed_term_remaining ?? '—'} />
          <Stat label="Guarantor" value={guarantor ? `${guarantor}${l.guarantor_name ? ` — ${l.guarantor_name}` : ''}` : 'Unconfirmed'} />
          <Stat label="Broker" value={[l.broker_name, l.brokerage].filter(Boolean).join(', ') || '—'} />
          <Stat label="Source" value={l.source_url
            ? <a href={l.source_url} target="_blank" rel="noreferrer" className="text-[#4A6B94] underline">{l.source_type ?? 'link'}</a>
            : (l.source_type ?? '—')} />
          <Stat label="First / last seen" value={`${fmtDateET(l.first_seen_at)} / ${fmtDateET(l.last_seen_at)}`} />
        </div>

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">Review</div>
          <div className="flex flex-wrap gap-2">
            {l.review_status !== 'reviewed' && (
              <button className={btnPrimary} disabled={busy} onClick={() => run(() => setReviewStatus(l.comp_property_id, 'reviewed'))}>
                Approve — show on Comp Database
              </button>
            )}
            {l.review_status !== 'rejected' && (
              <button className={btnSecondary} disabled={busy} onClick={() => run(() => setReviewStatus(l.comp_property_id, 'rejected'))}>
                Reject
              </button>
            )}
            {l.review_status === 'rejected' && (
              <button className={btnSecondary} disabled={busy} onClick={() => run(() => setReviewStatus(l.comp_property_id, 'pending_review'))}>
                Back to pending
              </button>
            )}
          </div>
        </div>

        {status !== 'sold' && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">Listing</div>
            <div className="flex flex-wrap gap-2">
              {status === 'active' && (
                <button className={btnSecondary} disabled={busy} onClick={() => run(() => recordEvent({ listingId: l.listing_id, type: 'under_contract' }))}>
                  Under contract
                </button>
              )}
              {status !== 'active' && (
                <button className={btnSecondary} disabled={busy} onClick={() => run(() => recordEvent({ listingId: l.listing_id, type: 'back_on_market' }))}>
                  Back on market
                </button>
              )}
              {status !== 'off_market' && !l.possibly_off_market && (
                <button className={btnSecondary} disabled={busy} onClick={() => run(() => recordEvent({ listingId: l.listing_id, type: 'off_market' }))}>
                  Off market
                </button>
              )}
              <button className={btnSecondary} disabled={busy} onClick={() => setForm(form === 'price' ? null : 'price')}>
                Record price change
              </button>
              <button className={btnSecondary} disabled={busy} onClick={() => setForm(form === 'close' ? null : 'close')}>
                Record close
              </button>
            </div>
            {form === 'price' && (
              <PriceChangeForm busy={busy} onCancel={() => setForm(null)}
                onSubmit={(v) => run(() => recordEvent({
                  listingId: l.listing_id,
                  type: v.price != null && v.price !== l.current_ask ? 'price_change' : 'cap_change',
                  eventDate: v.date, price: v.price ?? l.current_ask, capRate: v.cap ?? l.current_cap, note: v.note || null,
                }))} />
            )}
            {form === 'close' && (
              <CloseForm busy={busy} onCancel={() => setForm(null)}
                onSubmit={(v) => run(() => recordClose({
                  listingId: l.listing_id, closeDate: v.date, price: v.price, capRate: v.cap, noi: v.noi,
                  verification: v.verification, buyer: v.buyer || null, seller: v.seller || null, note: v.note || null,
                }))} />
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">Price history</div>
          <ListingTimeline listingId={l.listing_id} refreshKey={historyKey} />
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 flex-shrink-0 flex items-center gap-3">
        <button onClick={() => onOpenComp?.(l.comp_property_id)} className={btnPrimary}>Open comp</button>
        <span className="text-xs text-gray-500">Diligence (rent, increases, options, dates, APN, OM PDF) goes on the comp.</span>
      </div>
    </div>
  );
}

export default ListingPanel;
