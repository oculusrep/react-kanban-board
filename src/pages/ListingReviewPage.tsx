import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import {
  ListingStaging,
  ListingStatus,
  LISTING_STATUSES,
  LISTING_STATUS_LABEL,
  fetchListings,
  fmtPrice,
  fmtCap,
  fmtDateET,
} from '../lib/listingStaging';
import ListingStagingSlideout from '../components/mapping/slideouts/ListingStagingSlideout';
import CompDetailSlideout from '../components/mapping/slideouts/CompDetailSlideout';
import { CompProperty } from '../lib/compTypes';

// Review queue for NNN listings captured via the ovis-mcp intake tools.
// See docs/NNN_LISTING_INTAKE.md.

type Filter = ListingStatus | 'all';

const STATUS_PILL: Record<ListingStatus, string> = {
  pending_review: 'border-[#A27B5C] text-[#A27B5C]',
  reviewed: 'border-[#4A6B94] text-[#4A6B94]',
  promoted: 'border-[#002147] bg-[#002147] text-white',
  rejected: 'border-gray-300 text-gray-400',
  sold: 'border-[#8FA9C8] text-[#8FA9C8]',
};

export default function ListingReviewPage() {
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState<ListingStaging[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending_review');
  const [search, setSearch] = useState('');
  const [openComp, setOpenComp] = useState<CompProperty | null>(null);

  const selectedId = params.get('listing');
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('listing', id); else next.delete('listing');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setListings(await fetchListings());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: listings.length };
    listings.forEach((l) => { c[l.status] = (c[l.status] ?? 0) + 1; });
    return c;
  }, [listings]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) =>
      (filter === 'all' || l.status === filter) &&
      (!q || [l.tenant, l.address, l.city, l.source].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [listings, filter, search]);

  const unplaced = listings.filter((l) => l.lat == null && l.status !== 'rejected').length;

  const openCompById = async (compId: string) => {
    const { data } = await supabase.from('comp_property').select('*').eq('id', compId).maybeSingle();
    if (data) setOpenComp(data as CompProperty);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#002147]">NNN Listings</h1>
            <p className="text-sm text-[#4A6B94]">
              Captured by the OVIS MCP intake. Review, then promote to the Comp Database.
              {unplaced > 0 && (
                <span className="ml-2 text-[#A27B5C]">
                  {unplaced} not on the map (address didn't geocode).
                </span>
              )}
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant, address, city, source"
            className="border border-[#8FA9C8] rounded px-3 py-1.5 text-sm w-72 max-w-full bg-white"
          />
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {([{ value: 'all', label: 'All' }, ...LISTING_STATUSES] as { value: Filter; label: string }[]).map((s) => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`px-3 py-1 rounded text-sm border ${
                filter === s.value
                  ? 'bg-[#002147] text-white border-[#002147]'
                  : 'bg-white text-[#8FA9C8] border-[#8FA9C8] hover:text-[#4A6B94]'
              }`}
            >
              {s.label} ({counts[s.value] ?? 0})
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
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Cap</th>
                <th className="px-3 py-2">Lease</th>
                <th className="px-3 py-2">Term left</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">First seen</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">No listings.</td></tr>
              )}
              {visible.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => select(l.id)}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-[#8FA9C8]/10 ${
                    selectedId === l.id ? 'bg-[#8FA9C8]/20' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-[#002147]">{l.tenant ?? '—'}</td>
                  <td className="px-3 py-2 text-[#002147]">
                    {l.address}{l.city ? `, ${l.city}` : ''}
                    {l.lat == null && <span className="ml-1 text-[#A27B5C]" title="Not on the map">⚠</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A6B94]">{fmtPrice(l.price)}</td>
                  <td className="px-3 py-2 text-right text-[#4A6B94]">{fmtCap(l.cap_rate)}</td>
                  <td className="px-3 py-2">{l.lease_type ?? '—'}</td>
                  <td className="px-3 py-2">{l.term_left ?? '—'}</td>
                  <td className="px-3 py-2">{l.source ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateET(l.first_seen)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded border text-xs whitespace-nowrap ${STATUS_PILL[l.status]}`}>
                      {LISTING_STATUS_LABEL[l.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <ListingStagingSlideout
          listingId={selectedId}
          onClose={() => select(null)}
          onChanged={(fresh) => setListings((prev) => prev.map((l) => (l.id === fresh.id ? fresh : l)))}
          onOpenComp={openCompById}
        />
      )}
      {openComp && (
        <CompDetailSlideout comp={openComp} onClose={() => setOpenComp(null)} />
      )}
    </div>
  );
}
