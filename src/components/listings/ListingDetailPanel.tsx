import { useCallback, useEffect, useState } from 'react';
import {
  ListingStaging,
  ListingStatus,
  LISTING_STATUSES,
  fetchListing,
  updateListing,
  promoteListingToComp,
  regeocodeListing,
  fmtPrice,
  fmtCap,
  fmtDateET,
} from '../../lib/listingStaging';

// Overlay-first: renders one listing by id, so it mounts in the review page's side
// panel and in the map slideout alike (docs/OVIS_OVERLAY_UX.md).

interface ListingDetailPanelProps {
  listingId: string;
  onChanged?: (listing: ListingStaging) => void;
  onOpenComp?: (compPropertyId: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">{label}</div>
      <div className="text-sm text-[#002147]">{children}</div>
    </div>
  );
}

export function ListingDetailPanel({ listingId, onChanged, onOpenComp }: ListingDetailPanelProps) {
  const [listing, setListing] = useState<ListingStaging | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [guarantor, setGuarantor] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const l = await fetchListing(listingId);
      setListing(l);
      setNotes(l?.notes ?? '');
      setGuarantor(l?.guarantor_type ?? '');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load listing');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => { setInfo(null); load(); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      const fresh = await fetchListing(listingId);
      if (fresh) { setListing(fresh); onChanged?.(fresh); }
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-5 text-sm text-gray-500">Loading…</div>;
  if (!listing) return <div className="p-5 text-sm text-gray-500">{error ?? 'Listing not found.'}</div>;

  const setStatus = (status: ListingStatus) => run(() => updateListing(listing.id, { status }));
  const dirty = notes !== (listing.notes ?? '') || guarantor !== (listing.guarantor_type ?? '');

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 bg-[#002147] text-white flex-shrink-0">
        <div className="text-lg font-semibold">{listing.tenant ?? 'Tenant unknown'}</div>
        <div className="text-sm text-[#8FA9C8]">
          {listing.address}{listing.city ? `, ${listing.city}` : ''}, {listing.state}
        </div>
        <div className="mt-2 flex gap-4 text-sm">
          <span>{fmtPrice(listing.price)}</span>
          <span>{fmtCap(listing.cap_rate)} cap</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {error && <div className="text-sm text-red-700 border border-red-300 rounded p-2">{error}</div>}
        {info && <div className="text-sm text-[#4A6B94] border border-[#8FA9C8] rounded p-2">{info}</div>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Lease type">{listing.lease_type ?? '—'}</Field>
          <Field label="Term left">{listing.term_left ?? '—'}</Field>
          <Field label="Source">
            {listing.source_url ? (
              <a href={listing.source_url} target="_blank" rel="noreferrer" className="text-[#4A6B94] underline">
                {listing.source ?? 'Link'}
              </a>
            ) : (listing.source ?? '—')}
          </Field>
          <Field label="First / last seen">
            {fmtDateET(listing.first_seen)} / {fmtDateET(listing.last_seen)}
          </Field>
          <Field label="Map">
            {listing.lat != null ? (
              <span>Placed</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="text-[#A27B5C]">
                  {listing.geocode_status === 'failed' ? 'Not placed — address did not geocode' : 'Not placed yet'}
                </span>
                <button
                  disabled={busy}
                  onClick={() => run(async () => {
                    const r = await regeocodeListing(listing);
                    setInfo(r.ok ? `Placed: ${r.message}` : `Still not placed: ${r.message}`);
                  })}
                  className="text-xs text-[#4A6B94] underline disabled:opacity-50"
                >
                  Retry
                </button>
              </span>
            )}
          </Field>
          <Field label="VA task">{listing.va_task_id ? 'Created' : 'None'}</Field>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#8FA9C8] mb-1">Status</div>
          <div className="flex flex-wrap gap-1">
            {LISTING_STATUSES.filter((s) => s.value !== 'promoted').map((s) => (
              <button
                key={s.value}
                disabled={busy || listing.status === s.value}
                onClick={() => setStatus(s.value)}
                className={`px-3 py-1 rounded text-xs border ${
                  listing.status === s.value
                    ? 'bg-[#002147] text-white border-[#002147]'
                    : 'bg-white text-[#4A6B94] border-[#8FA9C8] hover:bg-[#8FA9C8]/10'
                }`}
              >
                {s.label}
              </button>
            ))}
            {listing.status === 'promoted' && (
              <span className="px-3 py-1 rounded text-xs bg-[#002147] text-white">Promoted</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">Guarantor</span>
            <select
              value={guarantor}
              onChange={(e) => setGuarantor(e.target.value)}
              className="mt-1 block w-full border border-[#8FA9C8] rounded px-2 py-1 text-sm"
            >
              <option value="">Unconfirmed</option>
              <option value="corporate">Corporate</option>
              <option value="franchisee">Franchisee</option>
              {guarantor && !['corporate', 'franchisee'].includes(guarantor) && <option value={guarantor}>{guarantor}</option>}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-[#8FA9C8]">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-1 block w-full border border-[#8FA9C8] rounded px-2 py-1 text-sm"
            />
          </label>
          {dirty && (
            <button
              disabled={busy}
              onClick={() => run(() => updateListing(listing.id, { notes: notes || null, guarantor_type: guarantor || null }))}
              className="px-3 py-1.5 rounded text-sm border border-[#4A6B94] text-[#4A6B94] disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 flex-shrink-0 flex items-center gap-3">
        {listing.comp_property_id ? (
          <button
            onClick={() => onOpenComp?.(listing.comp_property_id!)}
            className="px-4 py-2 rounded text-sm bg-white text-[#002147] border border-[#002147]"
          >
            Open comp
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => run(async () => {
              const compId = await promoteListingToComp(listing.id);
              setInfo('Comp created: location, lease and asking price.');
              onOpenComp?.(compId);
            })}
            className="px-4 py-2 rounded text-sm bg-[#002147] text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Promote to comp'}
          </button>
        )}
        <span className="text-xs text-gray-500">
          {listing.comp_property_id
            ? 'Linked to the Comp Database.'
            : 'Creates a comp location, lease and asking-price record.'}
        </span>
      </div>
    </div>
  );
}

export default ListingDetailPanel;
