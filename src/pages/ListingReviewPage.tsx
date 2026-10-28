import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ListingFacts, fetchListingFacts, fmtMoney, fmtPct, fmtDateET } from '../lib/compListings';
import { CompProperty, LISTING_STATUS_LABEL } from '../lib/compTypes';
import ListingSlideout from '../components/listings/ListingSlideout';
import CompDetailSlideout from '../components/mapping/slideouts/CompDetailSlideout';

// Review queue for NNN listings. Listings live in the comp database (comp_property +
// operating_memorandum + comp_listing_event); this page reads comp_listing_facts.
// Spec: docs/NNN_LISTING_INTAKE_SPEC_v2.md §6 / §8.

type TabKey = 'pending' | 'active' | 'relisted' | 'possibly_off' | 'closed' | 'rejected' | 'all';

const DAY = 86_400_000;

const TABS: { key: TabKey; label: string; test: (l: ListingFacts) => boolean }[] = [
  { key: 'pending', label: 'Pending review', test: (l) => l.review_status === 'pending_review' },
  { key: 'active', label: 'Active', test: (l) => l.listing_status === 'active' && l.review_status !== 'rejected' },
  {
    key: 'relisted', label: 'Re-listed existing comps',
    // New offering in the last 30 days on a comp that existed before it.
    test: (l) => l.review_status === 'reviewed'
      && Date.now() - new Date(l.first_seen_at).getTime() < 30 * DAY
      && new Date(l.property_created_at).getTime() < new Date(l.first_seen_at).getTime() - 60_000,
  },
  { key: 'possibly_off', label: 'Possibly off market', test: (l) => l.possibly_off_market && l.review_status !== 'rejected' },
  {
    key: 'closed', label: 'Under contract / off market / sold',
    test: (l) => l.listing_status !== 'active' && l.review_status !== 'rejected',
  },
  { key: 'rejected', label: 'Rejected', test: (l) => l.review_status === 'rejected' },
  { key: 'all', label: 'All', test: () => true },
];

export default function ListingReviewPage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ListingFacts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('pending');
  const [search, setSearch] = useState('');
  const [openComp, setOpenComp] = useState<CompProperty | null>(null);

  const selectedId = params.get('listing');
  const compParam = params.get('comp'); // direct link to a comp record (VA tasks)
  const setParam = (key: string, id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set(key, id); else next.delete(key);
    setParams(next, { replace: true });
  };
  const select = (id: string | null) => setParam('listing', id);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchListingFacts());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, rows.filter(t.test).length])) as Record<TabKey, number>,
    [rows],
  );

  const visible = useMemo(() => {
    const test = TABS.find((t) => t.key === tab)!.test;
    const q = search.trim().toLowerCase();
    return rows.filter((l) => test(l)
      && (!q || [l.tenant, l.property_name, l.address, l.city].some((v) => v?.toLowerCase().includes(q))));
  }, [rows, tab, search]);

  const unplaced = rows.filter((l) => l.lat == null && l.review_status !== 'rejected').length;

  const openCompById = (compId: string) => setParam('comp', compId);

  // ?comp=<id> opens the comp slideout over the queue — the link VA tasks carry.
  useEffect(() => {
    if (!compParam) { setOpenComp(null); return; }
    let cancelled = false;
    supabase.from('comp_property').select('*').eq('id', compParam).maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) setError(err?.message ?? 'That comp no longer exists.');
        else setOpenComp(data as CompProperty);
      });
    return () => { cancelled = true; };
  }, [compParam]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#002147]">NNN Listings</h1>
            <p className="text-sm text-[#4A6B94]">
              Offerings in the Comp Database. Approve to show a new comp on the map; diligence happens on the comp.
              {unplaced > 0 && <span className="ml-2 text-[#A27B5C]">{unplaced} not on the map (address didn't geocode).</span>}
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, address, city"
            className="border border-[#8FA9C8] rounded px-3 py-1.5 text-sm w-72 max-w-full bg-white"
          />
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 rounded text-sm border ${
                tab === t.key
                  ? 'bg-[#002147] text-white border-[#002147]'
                  : 'bg-white text-[#8FA9C8] border-[#8FA9C8] hover:text-[#4A6B94]'
              }`}
            >
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>

        {error && <div className="mb-3 text-sm text-red-700 border border-red-300 rounded p-2 bg-white">{error}</div>}

        <div className="bg-white border border-[#8FA9C8] rounded overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-[#4A6B94] border-b border-[#8FA9C8]">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2 text-right">Ask</th>
                <th className="px-3 py-2 text-right">Cap</th>
                <th className="px-3 py-2 text-right">Reduction</th>
                <th className="px-3 py-2 text-right">DOM</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">First seen</th>
                <th className="px-3 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">No listings.</td></tr>
              )}
              {visible.map((l) => (
                <tr
                  key={l.listing_id}
                  onClick={() => select(l.listing_id)}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-[#8FA9C8]/10 ${selectedId === l.listing_id ? 'bg-[#8FA9C8]/20' : ''}`}
                >
                  <td className="px-3 py-2 font-medium text-[#002147]">
                    {l.tenant ?? l.property_name ?? '—'}
                    {l.review_status === 'pending_review' && (
                      <span className="ml-2 text-[10px] px-1 py-0.5 rounded border border-[#A27B5C] text-[#A27B5C] uppercase">pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#002147]">
                    {[l.address, l.city].filter(Boolean).join(', ') || '—'}
                    {l.lat == null && <span className="ml-1 text-[#A27B5C]" title="Not on the map">⚠</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A6B94]">{fmtMoney(l.current_ask)}</td>
                  <td className="px-3 py-2 text-right text-[#4A6B94]">{fmtPct(l.current_cap)}</td>
                  <td className="px-3 py-2 text-right">{l.total_reduction_pct ? `${l.total_reduction_pct}%` : '—'}</td>
                  <td className="px-3 py-2 text-right">{l.days_on_market ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {LISTING_STATUS_LABEL[l.listing_status]}
                    {l.possibly_off_market && <span className="ml-1 text-[#A27B5C]" title="Not seen by the sweep for 21+ days">⏸</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateET(l.first_seen_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateET(l.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <ListingSlideout
          listingId={selectedId}
          onClose={() => select(null)}
          onChanged={load}
          onOpenComp={openCompById}
        />
      )}
      {openComp && (
        <CompDetailSlideout comp={openComp} onClose={() => setParam('comp', null)} onSaved={load} />
      )}
    </div>
  );
}
