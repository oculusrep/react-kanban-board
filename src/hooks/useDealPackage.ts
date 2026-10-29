import { useCallback, useEffect, useState } from 'react';
import { DealPackageInfo, fetchDealPackage, onPackageChanged } from '../lib/packageTracker';

// Package Tracker state for one deal. Refetches when any surface (badge, panel,
// header bar) writes to this deal's package.
export default function useDealPackage(dealId: string | null | undefined) {
  const [info, setInfo] = useState<DealPackageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dealId) { setInfo(null); return; }
    setLoading(true);
    try {
      setInfo(await fetchDealPackage(dealId));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load package');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => (dealId ? onPackageChanged(dealId, load) : undefined), [dealId, load]);

  return { info, loading, error, reload: load };
}
