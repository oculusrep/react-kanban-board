import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Tapestry segment data from ESRI
 */
export interface TapestrySegment {
  code: string | null;
  name: string | null;
  description: string | null;
  lifemodes: string | null;
}

/**
 * Demographic data from ESRI GeoEnrichment
 */
export interface DemographicData {
  // Ring buffer demographics (1, 3, 5 mile)
  pop_1_mile: number | null;
  pop_3_mile: number | null;
  pop_5_mile: number | null;
  households_1_mile: number | null;
  households_3_mile: number | null;
  households_5_mile: number | null;
  hh_income_median_1_mile: number | null;
  hh_income_median_3_mile: number | null;
  hh_income_median_5_mile: number | null;
  hh_income_avg_1_mile: number | null;
  hh_income_avg_3_mile: number | null;
  hh_income_avg_5_mile: number | null;
  employees_1_mile: number | null;
  employees_3_mile: number | null;
  employees_5_mile: number | null;
  median_age_1_mile: number | null;
  median_age_3_mile: number | null;
  median_age_5_mile: number | null;
  daytime_pop_1_mile: number | null;
  daytime_pop_3_mile: number | null;
  daytime_pop_5_mile: number | null;
  // 10-minute drive time demographics
  pop_10min_drive: number | null;
  households_10min_drive: number | null;
  hh_income_median_10min_drive: number | null;
  hh_income_avg_10min_drive: number | null;
  employees_10min_drive: number | null;
  median_age_10min_drive: number | null;
  daytime_pop_10min_drive: number | null;
}

/**
 * Full enrichment result from ESRI GeoEnrichment API
 */
export interface GeoenrichmentResult {
  success: boolean;
  property_id: string;
  tapestry: TapestrySegment;
  demographics: DemographicData;
  raw_response?: unknown;
  error?: string;
}

interface UsePropertyGeoenrichmentReturn {
  isEnriching: boolean;
  enrichError: string | null;
  enrichProperty: (
    propertyId: string,
    latitude: number,
    longitude: number,
    forceRefresh?: boolean
  ) => Promise<GeoenrichmentResult | null>;
  saveEnrichmentToProperty: (
    propertyId: string,
    result: GeoenrichmentResult
  ) => Promise<boolean>;
  clearError: () => void;
}

/**
 * Hook for enriching properties with ESRI GeoEnrichment demographic and psychographic data
 */
export function usePropertyGeoenrichment(): UsePropertyGeoenrichmentReturn {
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setEnrichError(null);
  }, []);

  /**
   * Call ESRI GeoEnrichment API to get demographic and Tapestry data
   */
  const enrichProperty = useCallback(
    async (
      propertyId: string,
      latitude: number,
      longitude: number,
      forceRefresh = false
    ): Promise<GeoenrichmentResult | null> => {
      setIsEnriching(true);
      setEnrichError(null);

      try {
        console.log('[Geoenrichment] Enriching property:', propertyId, { latitude, longitude, forceRefresh });

        const { data, error } = await supabase.functions.invoke('esri-geoenrich', {
          body: {
            property_id: propertyId,
            latitude,
            longitude,
            force_refresh: forceRefresh,
          },
        });

        if (error) {
          console.error('[Geoenrichment] Edge function error:', error);
          setEnrichError(error.message || 'Failed to enrich property');
          return null;
        }

        if (!data.success) {
          console.error('[Geoenrichment] API error:', data.error);
          setEnrichError(data.error || 'Enrichment failed');
          return null;
        }

        console.log('[Geoenrichment] Success:', {
          tapestry: data.tapestry,
          pop_3_mile: data.demographics?.pop_3_mile,
        });

        return data as GeoenrichmentResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during enrichment';
        console.error('[Geoenrichment] Error:', err);
        setEnrichError(errorMessage);
        return null;
      } finally {
        setIsEnriching(false);
      }
    },
    []
  );

  /**
   * Save enrichment results to the property table
   */
  const saveEnrichmentToProperty = useCallback(
    async (propertyId: string, result: GeoenrichmentResult): Promise<boolean> => {
      try {
        console.log('[Geoenrichment] Saving to property:', propertyId);

        const now = new Date().toISOString();

        const { error } = await supabase
          .from('property')
          .update({
            // Metadata
            esri_enriched_at: now,
            esri_enrichment_data: result.raw_response,

            // Tapestry
            tapestry_segment_code: result.tapestry.code,
            tapestry_segment_name: result.tapestry.name,
            tapestry_segment_description: result.tapestry.description,
            tapestry_lifemodes: result.tapestry.lifemodes,

            // Demographics - Ring buffers
            pop_1_mile: result.demographics.pop_1_mile,
            pop_3_mile: result.demographics.pop_3_mile,
            pop_5_mile: result.demographics.pop_5_mile,
            households_1_mile: result.demographics.households_1_mile,
            households_3_mile: result.demographics.households_3_mile,
            households_5_mile: result.demographics.households_5_mile,
            hh_income_median_1_mile: result.demographics.hh_income_median_1_mile,
            hh_income_median_3_mile: result.demographics.hh_income_median_3_mile,
            hh_income_median_5_mile: result.demographics.hh_income_median_5_mile,
            hh_income_avg_1_mile: result.demographics.hh_income_avg_1_mile,
            hh_income_avg_3_mile: result.demographics.hh_income_avg_3_mile,
            hh_income_avg_5_mile: result.demographics.hh_income_avg_5_mile,
            employees_1_mile: result.demographics.employees_1_mile,
            employees_3_mile: result.demographics.employees_3_mile,
            employees_5_mile: result.demographics.employees_5_mile,
            median_age_1_mile: result.demographics.median_age_1_mile,
            median_age_3_mile: result.demographics.median_age_3_mile,
            median_age_5_mile: result.demographics.median_age_5_mile,
            daytime_pop_1_mile: result.demographics.daytime_pop_1_mile,
            daytime_pop_3_mile: result.demographics.daytime_pop_3_mile,
            daytime_pop_5_mile: result.demographics.daytime_pop_5_mile,

            // Demographics - 10-minute drive time
            pop_10min_drive: result.demographics.pop_10min_drive,
            households_10min_drive: result.demographics.households_10min_drive,
            hh_income_median_10min_drive: result.demographics.hh_income_median_10min_drive,
            hh_income_avg_10min_drive: result.demographics.hh_income_avg_10min_drive,
            employees_10min_drive: result.demographics.employees_10min_drive,
            median_age_10min_drive: result.demographics.median_age_10min_drive,
            daytime_pop_10min_drive: result.demographics.daytime_pop_10min_drive,
          })
          .eq('id', propertyId);

        if (error) {
          console.error('[Geoenrichment] Save error:', error);
          setEnrichError('Failed to save enrichment data');
          return false;
        }

        console.log('[Geoenrichment] Saved successfully');
        return true;
      } catch (err) {
        console.error('[Geoenrichment] Save error:', err);
        setEnrichError('Failed to save enrichment data');
        return false;
      }
    },
    []
  );

  return {
    isEnriching,
    enrichError,
    enrichProperty,
    saveEnrichmentToProperty,
    clearError,
  };
}

export default usePropertyGeoenrichment;

/**
 * Check if property enrichment data is stale (> 1 year old)
 */
export function isEnrichmentStale(esriEnrichedAt: string | null): boolean {
  if (!esriEnrichedAt) return false; // No data = not stale, just missing

  const enrichedDate = new Date(esriEnrichedAt);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  return enrichedDate < oneYearAgo;
}

/**
 * Format enrichment date for display
 */
export function formatEnrichmentDate(esriEnrichedAt: string | null): string {
  if (!esriEnrichedAt) return 'Never';

  const date = new Date(esriEnrichedAt);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
