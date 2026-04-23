import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  CancelToken,
  IngestAllProgress,
  MerchantBrandRow,
  estimateIngestCostCents,
  ingestBrands,
  initMerchantIngestService,
} from '../../../services/merchantIngestService';
import {
  BRAND_COLOR_DARK,
  BRAND_COLOR_LIGHT,
  BRAND_COLOR_MED,
  BRAND_COLOR_WARN,
} from './shared';

interface BrandStats {
  totalBrands: number;
  brandsWithDomain: number;
  brandsWithLocations: number;
  brandsStale: number; // last_ingested_at older than 30 days OR never
  totalLocations: number;
}

interface ApiLogEntry {
  id: string;
  request_type: string;
  request_count: number;
  estimated_cost_cents: number;
  results_count: number;
  response_status: string;
  created_at: string;
}

export default function IngestionTab() {
  const [brands, setBrands] = useState<MerchantBrandRow[]>([]);
  const [stats, setStats] = useState<BrandStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<ApiLogEntry[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<IngestAllProgress | null>(null);
  const cancelRef = useRef<CancelToken>({ cancelled: false });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load all brands (paginate to be safe)
      const PAGE = 1000;
      type FullBrandRow = MerchantBrandRow & {
        last_ingested_at: string | null;
        brandfetch_domain: string | null;
      };
      let allBrands: FullBrandRow[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('merchant_brand')
          .select(
            'id, name, places_search_query, places_type_filter, last_ingested_at, brandfetch_domain, is_active',
          )
          .eq('is_active', true)
          .order('name')
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        allBrands = allBrands.concat((data as FullBrandRow[]) ?? []);
        hasMore = (data?.length ?? 0) === PAGE;
        offset += PAGE;
      }
      setBrands(allBrands);

      // Stats
      const { count: totalLocations } = await supabase
        .from('merchant_location')
        .select('id', { count: 'exact', head: true });

      const { data: locBrandIds } = await supabase
        .from('merchant_location')
        .select('brand_id');
      const brandsWithLocations = new Set((locBrandIds ?? []).map((r) => r.brand_id)).size;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const brandsStale = allBrands.filter(
        (b) => !b.last_ingested_at || b.last_ingested_at < thirtyDaysAgo,
      ).length;
      const brandsWithDomain = allBrands.filter((b) => b.brandfetch_domain).length;

      setStats({
        totalBrands: allBrands.length,
        brandsWithDomain,
        brandsWithLocations,
        brandsStale,
        totalLocations: totalLocations ?? 0,
      });

      // Recent API log entries (last 20)
      const { data: logs } = await supabase
        .from('google_places_api_log')
        .select('id, request_type, request_count, estimated_cost_cents, results_count, response_status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentLogs((logs as ApiLogEntry[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load ingestion state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Ensure Maps SDK is warmed up when the tab mounts, so the first ingest
  // doesn't take an extra 1-2s loading the SDK.
  useEffect(() => {
    initMerchantIngestService().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('Maps SDK preload failed (will retry on ingest):', e);
    });
  }, []);

  const estimatedCostCents = useMemo(
    () => estimateIngestCostCents(brands.length),
    [brands.length],
  );

  const startIngestAll = async () => {
    setConfirmOpen(false);
    setRunning(true);
    cancelRef.current = { cancelled: false };
    setProgress(null);
    try {
      await ingestBrands(brands, (p) => setProgress({ ...p }), cancelRef.current);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ingestion failed');
    } finally {
      setRunning(false);
      await loadAll();
    }
  };

  const requestCancel = () => {
    cancelRef.current.cancelled = true;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Brands" value={stats?.totalBrands ?? 0} />
        <StatCard
          label="With Brandfetch domain"
          value={stats?.brandsWithDomain ?? 0}
          accent={BRAND_COLOR_MED}
        />
        <StatCard
          label="With Places locations"
          value={stats?.brandsWithLocations ?? 0}
          accent={BRAND_COLOR_MED}
        />
        <StatCard
          label="Stale (>30 days)"
          value={stats?.brandsStale ?? 0}
          accent={(stats?.brandsStale ?? 0) > 0 ? BRAND_COLOR_WARN : BRAND_COLOR_LIGHT}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Total merchant locations in DB"
          value={stats?.totalLocations ?? 0}
          accent={BRAND_COLOR_DARK}
        />
        <StatCard
          label="Est. cost to ingest all"
          value={formatDollars(estimatedCostCents)}
          accent={BRAND_COLOR_DARK}
          asCurrency
        />
      </div>

      {/* Control panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: BRAND_COLOR_DARK }}>
          Ingest Google Places
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          For every active brand, run a Google Places Text Search to find physical GA locations
          and save them to the map. Upserts by <code className="text-xs">google_place_id</code> —
          running again is safe and updates existing rows.
        </p>

        {loading && <div className="text-sm text-gray-500">Loading state…</div>}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
            {error}
          </div>
        )}

        {!loading && !error && !running && !progress && (
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={brands.length === 0}
            className="px-5 py-3 text-sm font-medium text-white rounded hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND_COLOR_DARK }}
          >
            Ingest all {brands.length.toLocaleString()} brands — est. {formatDollars(estimatedCostCents)}
          </button>
        )}

        {progress && (
          <ProgressPanel
            progress={progress}
            running={running}
            onCancel={requestCancel}
            onReset={() => {
              setProgress(null);
              loadAll();
            }}
          />
        )}
      </div>

      {/* Recent API activity */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold" style={{ color: BRAND_COLOR_DARK }}>
            Recent Places API activity
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Last 20 entries from <code>google_places_api_log</code>. Includes ingestion runs and
            other Places API usage across OVIS.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Requests</th>
                <th className="px-4 py-2">Results</th>
                <th className="px-4 py-2">Cost</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 text-xs">
                  <td className="px-4 py-2 text-gray-600">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-2">{log.request_type}</td>
                  <td className="px-4 py-2">{log.request_count}</td>
                  <td className="px-4 py-2">{log.results_count}</td>
                  <td className="px-4 py-2">{formatDollars(log.estimated_cost_cents)}</td>
                  <td className="px-4 py-2 text-gray-600">{log.response_status}</td>
                </tr>
              ))}
              {recentLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-xs">
                    No Places API activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirmOpen && (
        <ConfirmModal
          brandCount={brands.length}
          estimatedCostCents={estimatedCostCents}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={startIngestAll}
        />
      )}
    </div>
  );
}

// ---------- Helpers + subcomponents ----------

function StatCard({
  label,
  value,
  accent,
  asCurrency,
}: {
  label: string;
  value: number | string;
  accent?: string;
  asCurrency?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: accent ?? BRAND_COLOR_DARK }}>
        {asCurrency ? value : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function ProgressPanel({
  progress,
  running,
  onCancel,
  onReset,
}: {
  progress: IngestAllProgress;
  running: boolean;
  onCancel: () => void;
  onReset: () => void;
}) {
  const pct =
    progress.total > 0 ? Math.round((progress.currentIndex / progress.total) * 100) : 0;
  const errorsCount = progress.results.filter((r) => r.error).length;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-baseline text-sm">
        <div>
          <span className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
            {progress.finished
              ? progress.cancelled
                ? 'Cancelled'
                : 'Complete'
              : `Ingesting: ${progress.currentBrandName || '…'}`}
          </span>
          <span className="text-gray-500 ml-2">
            {progress.currentIndex} / {progress.total}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          <strong>+{progress.totalNewLocations}</strong> new ·{' '}
          <strong>~{progress.totalUpdatedLocations}</strong> updated ·{' '}
          <strong>{progress.totalStatusChanges}</strong> status changes ·{' '}
          <strong>{formatDollars(progress.totalCostCents)}</strong> spent
        </div>
      </div>

      <div className="w-full h-2 rounded bg-gray-100 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: BRAND_COLOR_DARK }}
        />
      </div>

      {errorsCount > 0 && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {errorsCount} brand{errorsCount === 1 ? '' : 's'} errored. See recent log below for
          details; you can re-run the affected ones later.
        </div>
      )}

      <div className="flex gap-2">
        {running && (
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm text-gray-700 rounded border border-gray-300 hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
        {!running && (
          <button
            onClick={onReset}
            className="px-3 py-2 text-sm text-white rounded hover:opacity-90"
            style={{ backgroundColor: BRAND_COLOR_MED }}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmModal({
  brandCount,
  estimatedCostCents,
  onCancel,
  onConfirm,
}: {
  brandCount: number;
  estimatedCostCents: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-2" style={{ color: BRAND_COLOR_DARK }}>
          Ingest all merchant brands?
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          This will run a Google Places Text Search for each of{' '}
          <strong>{brandCount.toLocaleString()}</strong> active brands and upsert their GA
          locations into the map. Existing rows update; duplicates are not created.
        </p>
        <div className="text-sm mb-4 space-y-1">
          <div>
            <strong>Estimated cost:</strong> {formatDollars(estimatedCostCents)}
          </div>
          <div>
            <strong>Estimated time:</strong> ~{Math.ceil(brandCount / 3)}s (roughly 3 brands/sec)
          </div>
          <div className="text-xs text-gray-500 italic">
            Cost gets logged to google_places_api_log alongside other Places API usage.
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 rounded border border-gray-300 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white rounded hover:opacity-90"
            style={{ backgroundColor: BRAND_COLOR_DARK }}
          >
            Start ingestion
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}
