import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import {
  CancelToken,
  IngestAllProgress,
  IngestBrandResult,
  MerchantBrandRow,
  estimateIngestCostCents,
  ingestBrand,
  ingestBrands,
  initMerchantIngestService,
} from '../../../services/merchantIngestService';
import {
  DEFAULT_REGION_ID,
  MERCHANT_REGIONS,
  MerchantRegion,
  getRegion,
} from '../../../services/merchantRegions';
import {
  BRAND_COLOR_DARK,
  BRAND_COLOR_LIGHT,
  BRAND_COLOR_MED,
  BRAND_COLOR_WARN,
} from './shared';

interface BrandStats {
  totalBrands: number;
  brandsWithDomain: number;
  /** Brands with at least one cached location INSIDE the selected region. */
  brandsWithLocations: number;
  /** Never ingested for this region, or last ingested >30 days ago. */
  brandsStale: number;
  /** merchant_location rows inside the selected region. */
  totalLocations: number;
  /** merchant_location rows everywhere, for context. */
  totalLocationsAllRegions: number;
}

/** One brand's ingest history for the selected region. */
interface RegionIngestRow {
  last_ingested_at: string;
  locations_found: number;
  /** Stopped on the per-brand call ceiling — coverage may be incomplete. */
  truncated: boolean;
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

type FullBrandRow = MerchantBrandRow & {
  last_ingested_at: string | null;
  brandfetch_domain: string | null;
  category_id: string | null;
};

/** A favorite the current user can see: own, shared with them, or the org default. */
interface FavoriteOption {
  id: string;
  name: string;
  /** Disambiguated label for the dropdown — duplicate names carry an owner suffix. */
  label: string;
  brandIds: Set<string>;
  isDefault: boolean;
}

/** Scope of a run: every active brand, or one favorite's brands. */
const SCOPE_ALL = 'all';

const SKIP_RECENT_HOURS = 48;

export default function IngestionTab() {
  const { userTableId } = useAuth();
  const [brands, setBrands] = useState<FullBrandRow[]>([]);
  const [regionId, setRegionId] = useState<string>(DEFAULT_REGION_ID);
  const region: MerchantRegion = getRegion(regionId);
  const [regionIngest, setRegionIngest] = useState<Map<string, RegionIngestRow>>(new Map());
  const [categoryNames, setCategoryNames] = useState<Map<string, string>>(new Map());
  const [locationsByBrand, setLocationsByBrand] = useState<Map<string, number>>(new Map());
  const [totalLocationsAllRegions, setTotalLocationsAllRegions] = useState(0);
  const [favorites, setFavorites] = useState<FavoriteOption[]>([]);
  const [scopeId, setScopeId] = useState<string>(SCOPE_ALL);
  const [skipRecent, setSkipRecent] = useState(true);
  const [budgetDollars, setBudgetDollars] = useState('75');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<ApiLogEntry[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<IngestAllProgress | null>(null);
  const cancelRef = useRef<CancelToken>({ cancelled: false });

  // Single-brand test panel
  const [testBrandName, setTestBrandName] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<IngestBrandResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load all brands (paginate to be safe)
      const PAGE = 1000;
      let allBrands: FullBrandRow[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('merchant_brand')
          .select(
            'id, name, places_search_query, places_type_filter, places_display_name, places_name_exclude, last_ingested_at, brandfetch_domain, is_active, category_id',
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

      // Per-region ingest history. This — not merchant_brand.last_ingested_at —
      // is what drives skip-recent and the stale count, because the brand-level
      // column is bumped by an ingest of ANY region.
      const ingestByBrand = new Map<string, RegionIngestRow>();
      let riOffset = 0;
      let riHasMore = true;
      while (riHasMore) {
        const { data, error } = await supabase
          .from('merchant_brand_region_ingest')
          .select('brand_id, last_ingested_at, locations_found, truncated')
          .eq('region_id', regionId)
          .range(riOffset, riOffset + PAGE - 1);
        if (error) throw error;
        (data ?? []).forEach((r) =>
          ingestByBrand.set(r.brand_id, {
            last_ingested_at: r.last_ingested_at,
            locations_found: r.locations_found,
            truncated: !!r.truncated,
          }),
        );
        riHasMore = (data?.length ?? 0) === PAGE;
        riOffset += PAGE;
      }
      setRegionIngest(ingestByBrand);

      // Category names, for the end-of-run truncation report.
      const { data: cats } = await supabase
        .from('merchant_category')
        .select('id, name');
      setCategoryNames(new Map((cats ?? []).map((c) => [c.id as string, c.name as string])));

      // Favorites the current user can run. RLS already limits this to
      // own + shared-with-me + the org default, so no client-side filter is
      // needed — and "shared with me" works the day someone shares one, even
      // though nothing is shared today.
      const { data: favRows, error: favErr } = await supabase
        .from('merchant_favorite')
        .select('id, name, is_default, owner_user_id, brands:merchant_favorite_brand(brand_id)')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });
      if (favErr) throw favErr;

      // Owner emails, only for the names that actually collide — two
      // favorites called "Burritos" are indistinguishable otherwise.
      const nameCounts = new Map<string, number>();
      for (const f of favRows ?? []) {
        nameCounts.set(f.name as string, (nameCounts.get(f.name as string) ?? 0) + 1);
      }
      const ownerIds = Array.from(
        new Set(
          (favRows ?? [])
            .filter((f) => (nameCounts.get(f.name as string) ?? 0) > 1)
            .map((f) => f.owner_user_id as string)
            .filter(Boolean),
        ),
      );
      const ownerEmails = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('user')
          .select('id, email')
          .in('id', ownerIds);
        (owners ?? []).forEach((o) =>
          ownerEmails.set(o.id as string, (o.email as string) ?? ''),
        );
      }

      setFavorites(
        (favRows ?? []).map((f: any) => {
          const collides = (nameCounts.get(f.name) ?? 0) > 1;
          const ownerLabel =
            f.owner_user_id === userTableId
              ? 'me'
              : (ownerEmails.get(f.owner_user_id) || 'shared').split('@')[0];
          return {
            id: f.id,
            name: f.name,
            label:
              `${f.name}${f.is_default ? ' — org default' : ''}` +
              (collides ? ` (${ownerLabel})` : ''),
            brandIds: new Set<string>((f.brands ?? []).map((b: any) => b.brand_id)),
            isDefault: !!f.is_default,
          };
        }),
      );

      // Location coverage, scoped to the selected region.
      //
      // merchant_location has no region column — region membership is decided
      // in code by region.accept() — so the rows are counted client-side.
      // Paginate: a naive select is capped at 1000 rows by Supabase's default
      // limit, which made the unique-brand count come out wildly low (bug
      // observed 2026-04-23).
      const inRegionByBrand = new Map<string, number>();
      let totalLocationsAllRegions = 0;
      let locOffset = 0;
      let locHasMore = true;
      while (locHasMore) {
        const { data } = await supabase
          .from('merchant_location')
          .select('brand_id, latitude, longitude, formatted_address')
          .range(locOffset, locOffset + PAGE - 1);
        if (!data) break;
        for (const r of data) {
          totalLocationsAllRegions++;
          if (
            !region.accept({
              latitude: Number(r.latitude),
              longitude: Number(r.longitude),
              formatted_address: r.formatted_address ?? '',
            })
          ) {
            continue;
          }
          inRegionByBrand.set(r.brand_id, (inRegionByBrand.get(r.brand_id) ?? 0) + 1);
        }
        locHasMore = data.length === PAGE;
        locOffset += PAGE;
      }
      setLocationsByBrand(inRegionByBrand);
      setTotalLocationsAllRegions(totalLocationsAllRegions);

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
    // Region scopes every number on this tab, so a change reloads all of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  // Ensure Maps SDK is warmed up when the tab mounts, so the first ingest
  // doesn't take an extra 1-2s loading the SDK.
  useEffect(() => {
    initMerchantIngestService().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('Maps SDK preload failed (will retry on ingest):', e);
    });
  }, []);

  // Brands that will actually run through ingestion, based on the
  // skip-recent toggle. Used for button labels, cost, and the confirm modal.
  const selectedFavorite = useMemo(
    () => (scopeId === SCOPE_ALL ? null : favorites.find((f) => f.id === scopeId) ?? null),
    [scopeId, favorites],
  );

  /** Active brands in the current scope, before skip-recent. */
  const scopedBrands = useMemo(
    () =>
      selectedFavorite
        ? brands.filter((b) => selectedFavorite.brandIds.has(b.id))
        : brands,
    [brands, selectedFavorite],
  );

  const brandsToIngest = useMemo(() => {
    if (!skipRecent) return scopedBrands;
    const cutoff = new Date(
      Date.now() - SKIP_RECENT_HOURS * 60 * 60 * 1000,
    ).toISOString();
    return scopedBrands.filter((b) => {
      const seen = regionIngest.get(b.id);
      if (!seen) return true;
      // A brand that stopped on the per-brand call ceiling has incomplete
      // coverage. Skipping it would mean the run meant to fill the gap is
      // the one that passes over it.
      if (seen.truncated) return true;
      return seen.last_ingested_at < cutoff;
    });
  }, [scopedBrands, skipRecent, regionIngest]);

  const skippedCount = scopedBrands.length - brandsToIngest.length;

  /**
   * Every headline number follows the scope, so picking a favorite reframes
   * the whole tab rather than just the run button.
   */
  const stats: BrandStats = useMemo(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let brandsWithLocations = 0;
    let totalLocations = 0;
    let brandsStale = 0;
    let brandsWithDomain = 0;
    for (const b of scopedBrands) {
      const n = locationsByBrand.get(b.id) ?? 0;
      if (n > 0) brandsWithLocations++;
      totalLocations += n;
      if (b.brandfetch_domain) brandsWithDomain++;
      const seen = regionIngest.get(b.id);
      if (!seen || seen.truncated || seen.last_ingested_at < thirtyDaysAgo) brandsStale++;
    }
    return {
      totalBrands: scopedBrands.length,
      brandsWithDomain,
      brandsWithLocations,
      brandsStale,
      totalLocations,
      totalLocationsAllRegions,
    };
  }, [scopedBrands, locationsByBrand, regionIngest, totalLocationsAllRegions]);

  /** Brands in scope whose last run for this region was truncated. */
  const truncatedInScope = useMemo(
    () =>
      scopedBrands
        .filter((b) => regionIngest.get(b.id)?.truncated)
        .map((b) => ({
          name: b.name,
          category: categoryNames.get(b.category_id ?? '') ?? 'Uncategorised',
        }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [scopedBrands, regionIngest, categoryNames],
  );

  const estimatedCostCents = useMemo(
    () => estimateIngestCostCents(brandsToIngest.length, region),
    [brandsToIngest.length, region],
  );

  const startIngestAll = async () => {
    setConfirmOpen(false);
    setRunning(true);
    cancelRef.current = { cancelled: false };
    setProgress(null);
    try {
      const parsedBudget = parseFloat(budgetDollars);
      await ingestBrands(
        brandsToIngest,
        region,
        Number.isFinite(parsedBudget) && parsedBudget > 0
          ? Math.round(parsedBudget * 100)
          : Infinity,
        (p) => setProgress({ ...p }),
        cancelRef.current,
      );
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

  const runTestBrand = async () => {
    const trimmed = testBrandName.trim();
    if (!trimmed) return;
    setTestError(null);
    setTestResult(null);
    setTesting(true);
    try {
      // Find the brand row by case-insensitive name match.
      const match = brands.find((b) => b.name.toLowerCase() === trimmed.toLowerCase());
      if (!match) {
        setTestError(
          `No active brand named "${trimmed}" found. Check the Brands tab for the exact name.`,
        );
        return;
      }
      const r = await ingestBrand(match, region);
      setTestResult(r);
      await loadAll();
    } catch (e: unknown) {
      setTestError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Region picker — scopes every number, every button and every cost on
          this tab. Ingestion geography is a registry in merchantRegions.ts. */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <label
          htmlFor="merchant-region"
          className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-2"
        >
          Region
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="merchant-region"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            disabled={running || testing}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            style={{ color: BRAND_COLOR_DARK }}
          >
            {MERCHANT_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-500">
            Ingest history, staleness and coverage below are all counted for
            this region only. Brands, categories and logos are shared across
            regions.
          </span>
        </div>

        <label
          htmlFor="merchant-scope"
          className="block text-xs font-medium uppercase tracking-wider text-gray-500 mt-4 mb-2"
        >
          Brands to run
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="merchant-scope"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            disabled={running || testing}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            style={{ color: BRAND_COLOR_DARK }}
          >
            <option value={SCOPE_ALL}>All active brands ({brands.length})</option>
            {favorites.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({f.brandIds.size})
              </option>
            ))}
          </select>
          {selectedFavorite ? (
            <span className="text-xs text-gray-500">
              Only this favorite's brands will be ingested. Same per-brand ceiling and run
              budget as a full run.
              {selectedFavorite.isDefault &&
                ' This is the org default, auto-applied on every user\u2019s first Merchants drawer open.'}
            </span>
          ) : (
            <span className="text-xs text-gray-500">
              Every active brand in the master list.
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Brands" value={stats.totalBrands} />
        <StatCard
          label="With Brandfetch domain"
          value={stats.brandsWithDomain}
          accent={BRAND_COLOR_MED}
        />
        <StatCard
          label={`With ${region.locationLabel} locations`}
          value={stats.brandsWithLocations}
          accent={BRAND_COLOR_MED}
          hint={`of ${(stats.totalBrands).toLocaleString()} active brands`}
        />
        <StatCard
          label="Stale here (>30 days)"
          value={stats.brandsStale}
          accent={(stats.brandsStale) > 0 ? BRAND_COLOR_WARN : BRAND_COLOR_LIGHT}
          hint="never ingested for this region, or over 30 days ago"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label={`Cached locations in ${region.name}`}
          value={stats.totalLocations}
          accent={BRAND_COLOR_DARK}
          hint={`${(stats.totalLocationsAllRegions).toLocaleString()} in merchant_location across all regions`}
        />
        <StatCard
          label="Est. cost to ingest all"
          value={formatDollars(estimatedCostCents)}
          accent={BRAND_COLOR_DARK}
          asCurrency
          hint={
            region.costBasis === 'measured'
              ? `~${region.avgRequestsPerBrand} Places calls/brand, measured on a full run`
              : `~${region.avgRequestsPerBrand} Places calls/brand — ESTIMATE, not yet calibrated against a real run`
          }
        />
      </div>

      {/* Single-brand test panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: BRAND_COLOR_DARK }}>
          Test a single brand
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Run ingestion for one brand, into <strong>{region.name}</strong>, before committing
          to the full run. Good for verifying coverage before you spend. Cost is 2¢ for a
          brand that fits under the 20-result cap.{' '}
          {region.strategy.kind === 'named'
            ? `A brand that trips the cap also pays for ${region.strategy.subAreas.length} sub-area searches, plus ${region.strategy.phase3Grid ** 2} more per saturated sub-area.`
            : `A brand that trips the cap splits the region ${region.strategy.split}×${region.strategy.split} and recurses only into cells that also cap, to depth ${region.strategy.maxDepth}.`}{' '}
          Hard ceiling {region.maxRequestsPerBrand} calls ({formatDollars(region.maxRequestsPerBrand * 2)}) per brand.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={testBrandName}
            onChange={(e) => setTestBrandName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !testing) runTestBrand();
            }}
            placeholder="Brand name (e.g. Starbucks)"
            disabled={testing || running}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={runTestBrand}
            disabled={testing || running || !testBrandName.trim()}
            className="px-4 py-2 text-sm font-medium text-white rounded hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND_COLOR_MED }}
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
        {testError && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {testError}
          </div>
        )}
        {testResult && !testResult.error && (
          <div className="mt-4 text-sm border rounded p-3" style={{ borderColor: BRAND_COLOR_LIGHT }}>
            <div className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
              {testResult.brandName}
            </div>
            <div className="text-gray-600 mt-1 space-y-0.5 text-xs">
              <div>
                <strong>{testResult.locationsFound}</strong> {region.locationLabel} locations
                kept (after region, name-match and ancillary filters)
              </div>
              <div>
                <strong>{testResult.newLocations}</strong> new + <strong>{testResult.updatedLocations}</strong>{' '}
                updated in merchant_location
              </div>
              {testResult.statusChanges > 0 && (
                <div>
                  <strong>{testResult.statusChanges}</strong> status changes → closure alerts
                  raised
                </div>
              )}
              <div>
                Cost: {formatDollars(testResult.costCents)} over {testResult.requests} Places
                call{testResult.requests === 1 ? '' : 's'}
              </div>
              {testResult.truncated && (
                <div style={{ color: BRAND_COLOR_WARN }}>
                  Hit the {region.maxRequestsPerBrand}-call ceiling — coverage for this brand
                  may be incomplete.
                </div>
              )}
            </div>
          </div>
        )}
        {testResult?.error && (
          <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
            {testResult.brandName}: {testResult.error}
          </div>
        )}
      </div>

      {/* Control panel */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-1" style={{ color: BRAND_COLOR_DARK }}>
          Ingest Google Places
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          For every active brand, run a Google Places Text Search to find physical locations in{' '}
          <strong>{region.name}</strong> and save them to the map. Upserts by{' '}
          <code className="text-xs">google_place_id</code> — running again is safe, and re-running
          a different region never disturbs this one's rows.
        </p>

        {loading && <div className="text-sm text-gray-500">Loading state…</div>}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4">
            {error}
          </div>
        )}

        {!loading && !error && !running && !progress && (
          <div className="space-y-4">
            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipRecent}
                onChange={(e) => setSkipRecent(e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
                  Skip brands ingested into {region.name} in the last {SKIP_RECENT_HOURS} hours
                </span>
                <span className="text-gray-500">
                  {' '}— use this to resume an interrupted run without re-paying for brands already
                  done. Uncheck to force a full re-ingestion of all {brands.length.toLocaleString()}{' '}
                  brands.
                </span>
              </span>
            </label>

            {truncatedInScope.length > 0 && (
              <div
                className="text-xs rounded p-2 border"
                style={{ color: BRAND_COLOR_WARN, borderColor: BRAND_COLOR_WARN }}
              >
                {truncatedInScope.length} brand
                {truncatedInScope.length === 1 ? '' : 's'} in this scope stopped on the
                per-brand call ceiling last time, so coverage may be incomplete. They are
                never skipped by skip-recent:{' '}
                {truncatedInScope.map((t) => `${t.name} (${t.category})`).join(', ')}.
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
                Stop the run at
              </span>
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="1"
                step="5"
                value={budgetDollars}
                onChange={(e) => setBudgetDollars(e.target.value)}
                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <span className="text-gray-500 text-xs">
                — hard ceiling on the whole run, checked between brands. Blank or 0 removes
                it. Per brand, {region.name} is capped at{' '}
                {region.maxRequestsPerBrand} Places calls (
                {formatDollars(region.maxRequestsPerBrand * 2)}).
              </span>
            </label>

            <button
              onClick={() => setConfirmOpen(true)}
              disabled={brandsToIngest.length === 0}
              className="px-5 py-3 text-sm font-medium text-white rounded hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: BRAND_COLOR_DARK }}
            >
              {skipRecent && skippedCount > 0
                ? `Ingest ${brandsToIngest.length.toLocaleString()} brands (${skippedCount.toLocaleString()} skipped) — est. ${formatDollars(estimatedCostCents)}`
                : `Ingest all ${brandsToIngest.length.toLocaleString()} brands — est. ${formatDollars(estimatedCostCents)}`}
            </button>
            {brandsToIngest.length === 0 && (
              <p className="text-xs text-gray-500 italic">
                All brands were ingested into {region.name} within the last{' '}
                {SKIP_RECENT_HOURS} hours. Uncheck the box above to force a re-ingestion.
              </p>
            )}
          </div>
        )}

        {progress && (
          <ProgressPanel
            progress={progress}
            categoryFor={(brandId) =>
              categoryNames.get(brands.find((b) => b.id === brandId)?.category_id ?? '') ??
              'Uncategorised'
            }
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
          brandCount={brandsToIngest.length}
          region={region}
          skippedCount={skipRecent ? skippedCount : 0}
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
  hint,
}: {
  label: string;
  value: number | string;
  accent?: string;
  asCurrency?: boolean;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: accent ?? BRAND_COLOR_DARK }}>
        {asCurrency ? value : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

function ProgressPanel({
  progress,
  categoryFor,
  running,
  onCancel,
  onReset,
}: {
  progress: IngestAllProgress;
  categoryFor: (brandId: string) => string;
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
                : progress.budgetExhausted
                  ? 'Stopped — run budget reached'
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

      {progress.budgetExhausted && (
        <div
          className="text-xs rounded p-2 border"
          style={{ color: BRAND_COLOR_WARN, borderColor: BRAND_COLOR_WARN }}
        >
          The run stopped at its dollar ceiling with{' '}
          {(progress.total - progress.currentIndex).toLocaleString()} brand
          {progress.total - progress.currentIndex === 1 ? '' : 's'} not yet ingested. Raise the
          ceiling and run again — skip-recent will resume where this left off.
        </div>
      )}

      {progress.totalTruncated > 0 && (
        <div
          className="text-xs rounded p-2 border space-y-1"
          style={{ color: BRAND_COLOR_WARN, borderColor: BRAND_COLOR_WARN }}
        >
          <div className="font-medium">
            {progress.totalTruncated} brand{progress.totalTruncated === 1 ? '' : 's'} hit the
            per-brand call ceiling — coverage may be incomplete. Re-run these individually
            with a raised ceiling; skip-recent will not pass over them.
          </div>
          <ul className="list-disc pl-4">
            {truncatedByCategory(progress, categoryFor).map(([category, names]) => (
              <li key={category}>
                <strong>{category}:</strong> {names.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

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
  region,
  skippedCount,
  estimatedCostCents,
  onCancel,
  onConfirm,
}: {
  brandCount: number;
  region: MerchantRegion;
  skippedCount: number;
  estimatedCostCents: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold mb-2" style={{ color: BRAND_COLOR_DARK }}>
          {skippedCount > 0
            ? `Resume ingestion into ${region.name}?`
            : `Ingest all merchant brands into ${region.name}?`}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          This will run a Google Places Text Search for{' '}
          <strong>{brandCount.toLocaleString()}</strong> active brand
          {brandCount === 1 ? '' : 's'} and upsert their{' '}
          <strong>{region.locationLabel}</strong> locations into the map. Existing rows update;
          duplicates are not created; other regions are untouched.
          {skippedCount > 0 && (
            <>
              {' '}
              <strong>{skippedCount.toLocaleString()}</strong> brand
              {skippedCount === 1 ? '' : 's'} ingested in the last 48 hours will be skipped.
            </>
          )}
        </p>
        <div className="text-sm mb-4 space-y-1">
          <div>
            <strong>Estimated cost:</strong> {formatDollars(estimatedCostCents)}
            {region.costBasis === 'estimated' && (
              <span className="text-gray-500">
                {' '}— estimate only; this region has never been fully run, so treat it as a
                lower bound
              </span>
            )}
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

/** Group the run's truncated brands by category, for the end-of-run report. */
function truncatedByCategory(
  progress: IngestAllProgress,
  categoryFor: (brandId: string) => string,
): Array<[string, string[]]> {
  const byCategory = new Map<string, string[]>();
  for (const r of progress.results) {
    if (!r.truncated) continue;
    const cat = categoryFor(r.brandId);
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), r.brandName]);
  }
  return Array.from(byCategory.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
