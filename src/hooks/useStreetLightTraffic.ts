import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface StreetLightSegment {
  id: string;
  road_name?: string | null;
  road_type?: string | null;
  /** Encoded polyline or raw coordinate array — depends on API response shape */
  geometry?: { type: string; coordinates: number[][] };
}

export interface StreetLightMetric {
  segment_id: string;
  aadt?: number | null;
  [key: string]: unknown;
}

export interface ClassifyResult {
  up_to_date: Array<StreetLightSegment & { aadt: number | null; date_range_end: string }>;
  stale: Array<StreetLightSegment & { aadt: number | null; date_range_end: string }>;
  new: StreetLightSegment[];
  date_ranges: Array<{ start_date: string; end_date: string }>;
}

export interface MetricsResult {
  success: boolean;
  usage_log_id?: string;
  segment_count?: number;
  cost_usd?: number;
  metrics?: StreetLightMetric[];
  error?: string;
  message?: string;
}

export interface UsageStatus {
  /** Remaining quota from StreetLight /usage endpoint */
  raw?: unknown;
  /** Locally computed daily usage (segments used today by this user) */
  used_today?: number;
  daily_limit?: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseStreetLightTrafficReturn {
  segments: StreetLightSegment[];
  isLoading: boolean;
  error: string | null;
  usageStatus: UsageStatus | null;

  loadGeometry: (bounds: MapBounds) => Promise<StreetLightSegment[]>;
  classifySegments: (bounds: MapBounds) => Promise<ClassifyResult | null>;
  fetchMetrics: (checkedSegmentIds: string[]) => Promise<MetricsResult | null>;
  refreshUsageStatus: () => Promise<void>;
  clearError: () => void;
}

export function useStreetLightTraffic(): UseStreetLightTrafficReturn {
  const [segments, setSegments] = useState<StreetLightSegment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Load road segment geometry for the given map bounds.
   * Results are cached server-side in streetlight_segment.
   */
  const loadGeometry = useCallback(async (bounds: MapBounds): Promise<StreetLightSegment[]> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[StreetLightTraffic] loadGeometry:', bounds);

      const { data, error: fnError } = await supabase.functions.invoke('streetlight', {
        body: { action: 'geometry', bounds },
      });

      if (fnError) {
        // Log full error context including response body if available
        const context = (fnError as unknown as { context?: { json?: () => Promise<unknown> } })?.context;
        if (context?.json) {
          context.json().then((body: unknown) => console.error('[StreetLightTraffic] error body:', body));
        }
        console.error('[StreetLightTraffic] loadGeometry error:', fnError.message, fnError);
        setError(fnError.message || 'Failed to load road segments');
        return [];
      }

      if (!data?.success) {
        setError(data?.error || 'Failed to load geometry');
        return [];
      }

      const result: StreetLightSegment[] = data.segments ?? [];
      setSegments(result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error loading geometry';
      console.error('[StreetLightTraffic] loadGeometry exception:', err);
      setError(msg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Classify segments in the current bounds into 3 buckets:
   *   - up_to_date: fresh AADT metrics
   *   - stale: metrics exist but for older date range
   *   - new: no metrics at all
   */
  const classifySegments = useCallback(async (bounds: MapBounds): Promise<ClassifyResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[StreetLightTraffic] classifySegments:', bounds);

      const { data, error: fnError } = await supabase.functions.invoke('streetlight', {
        body: { action: 'classify', bounds },
      });

      if (fnError) {
        console.error('[StreetLightTraffic] classifySegments error:', fnError);
        setError(fnError.message || 'Failed to classify segments');
        return null;
      }

      if (!data?.success) {
        setError(data?.error || 'Failed to classify segments');
        return null;
      }

      return {
        up_to_date: data.up_to_date ?? [],
        stale: data.stale ?? [],
        new: data.new ?? [],
        date_ranges: data.date_ranges ?? [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error classifying segments';
      console.error('[StreetLightTraffic] classifySegments exception:', err);
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch AADT metrics for the selected segment IDs.
   * Enforces quota limits; returns the spend summary on success.
   */
  const fetchMetrics = useCallback(async (checkedSegmentIds: string[]): Promise<MetricsResult | null> => {
    if (checkedSegmentIds.length === 0) return null;

    setIsLoading(true);
    setError(null);

    try {
      console.log('[StreetLightTraffic] fetchMetrics:', checkedSegmentIds.length, 'segments');

      const { data, error: fnError } = await supabase.functions.invoke('streetlight', {
        body: { action: 'metrics', segment_ids: checkedSegmentIds },
      });

      if (fnError) {
        console.error('[StreetLightTraffic] fetchMetrics error:', fnError);
        setError(fnError.message || 'Failed to fetch metrics');
        return null;
      }

      if (!data?.success) {
        // Quota errors are returned as success: false with an error code — surface them
        const result: MetricsResult = {
          success: false,
          error: data?.error ?? 'fetch_failed',
          message: data?.message,
        };
        setError(data?.message || data?.error || 'Failed to fetch metrics');
        return result;
      }

      console.log('[StreetLightTraffic] fetchMetrics success:', {
        segment_count: data.segment_count,
        cost_usd: data.cost_usd,
      });

      return data as MetricsResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error fetching metrics';
      console.error('[StreetLightTraffic] fetchMetrics exception:', err);
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh usage status (quota remaining, daily limit, etc.)
   */
  const refreshUsageStatus = useCallback(async (): Promise<void> => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('streetlight', {
        body: { action: 'usage' },
      });

      if (fnError || !data?.success) {
        console.warn('[StreetLightTraffic] Usage status unavailable:', fnError?.message ?? data?.error);
        return;
      }

      setUsageStatus({ raw: data });
    } catch (err) {
      console.warn('[StreetLightTraffic] refreshUsageStatus exception:', err);
    }
  }, []);

  // Load usage status on mount
  useEffect(() => {
    refreshUsageStatus();
  }, [refreshUsageStatus]);

  return {
    segments,
    isLoading,
    error,
    usageStatus,
    loadGeometry,
    classifySegments,
    fetchMetrics,
    refreshUsageStatus,
    clearError,
  };
}

export default useStreetLightTraffic;
