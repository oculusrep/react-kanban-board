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
  radii?: number[];
  drive_times?: number[];
  raw_response?: unknown;
  error?: string;
}

/**
 * Client-specific demographics stored as JSONB on site_submit
 */
export interface ClientDemographicsData {
  radii: number[];
  drive_times: number[];
  sidebar_radius?: number | null;
  enriched_at: string;
  data: Record<string, number | null>;
  tapestry: TapestrySegment;
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
    result: GeoenrichmentResult,
    latitude: number,
    longitude: number
  ) => Promise<boolean>;
  enrichForClient: (
    propertyId: string,
    latitude: number,
    longitude: number,
    radii: number[],
    driveTimes: number[]
  ) => Promise<GeoenrichmentResult | null>;
  saveClientDemographicsToSiteSubmit: (
    siteSubmitId: string,
    result: GeoenrichmentResult,
    radii: number[],
    driveTimes: number[],
    sidebarRadius?: number | null
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
    async (
      propertyId: string,
      result: GeoenrichmentResult,
      latitude: number,
      longitude: number
    ): Promise<boolean> => {
      try {
        console.log('[Geoenrichment] Saving to property:', propertyId);

        const now = new Date().toISOString();

        const { error } = await supabase
          .from('property')
          .update({
            // Metadata
            esri_enriched_at: now,
            esri_enrichment_data: result.raw_response,
            esri_enriched_latitude: latitude,
            esri_enriched_longitude: longitude,

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

  /**
   * Call ESRI GeoEnrichment API with client-specific radii and drive times
   */
  const enrichForClient = useCallback(
    async (
      propertyId: string,
      latitude: number,
      longitude: number,
      radii: number[],
      driveTimes: number[]
    ): Promise<GeoenrichmentResult | null> => {
      setIsEnriching(true);
      setEnrichError(null);

      try {
        console.log('[Geoenrichment] Client enrichment:', propertyId, { latitude, longitude, radii, driveTimes });

        const { data, error } = await supabase.functions.invoke('esri-geoenrich', {
          body: {
            property_id: propertyId,
            latitude,
            longitude,
            custom_radii: radii,
            custom_drive_times: driveTimes,
          },
        });

        if (error) {
          console.error('[Geoenrichment] Client enrichment error:', error);
          setEnrichError(error.message || 'Failed to enrich for client');
          return null;
        }

        if (!data.success) {
          console.error('[Geoenrichment] Client enrichment API error:', data.error);
          setEnrichError(data.error || 'Client enrichment failed');
          return null;
        }

        console.log('[Geoenrichment] Client enrichment success');
        return data as GeoenrichmentResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during client enrichment';
        console.error('[Geoenrichment] Client enrichment error:', err);
        setEnrichError(errorMessage);
        return null;
      } finally {
        setIsEnriching(false);
      }
    },
    []
  );

  /**
   * Save client-specific demographics to the site_submit record as JSONB
   */
  const saveClientDemographicsToSiteSubmit = useCallback(
    async (
      siteSubmitId: string,
      result: GeoenrichmentResult,
      radii: number[],
      driveTimes: number[],
      sidebarRadius?: number | null
    ): Promise<boolean> => {
      try {
        console.log('[Geoenrichment] Saving client demographics to site_submit:', siteSubmitId);

        const clientDemographics: ClientDemographicsData = {
          radii,
          drive_times: driveTimes,
          sidebar_radius: sidebarRadius ?? null,
          enriched_at: new Date().toISOString(),
          data: result.demographics as unknown as Record<string, number | null>,
          tapestry: result.tapestry,
        };

        const { error } = await supabase
          .from('site_submit')
          .update({ client_demographics: clientDemographics })
          .eq('id', siteSubmitId);

        if (error) {
          console.error('[Geoenrichment] Save client demographics error:', error);
          setEnrichError('Failed to save client demographics');
          return false;
        }

        console.log('[Geoenrichment] Client demographics saved successfully');
        return true;
      } catch (err) {
        console.error('[Geoenrichment] Save client demographics error:', err);
        setEnrichError('Failed to save client demographics');
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
    enrichForClient,
    saveClientDemographicsToSiteSubmit,
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

/**
 * Check if property coordinates have changed since last enrichment
 * Uses a threshold of ~50 meters (0.0005 degrees) to account for minor geocoding variations
 */
export function haveCoordinatesChanged(
  currentLatitude: number | null,
  currentLongitude: number | null,
  enrichedLatitude: number | null,
  enrichedLongitude: number | null
): boolean {
  // If no enrichment has been done yet, coordinates haven't "changed"
  if (enrichedLatitude === null || enrichedLongitude === null) {
    return false;
  }

  // If current coordinates are missing, can't determine change
  if (currentLatitude === null || currentLongitude === null) {
    return false;
  }

  // ~50 meters threshold (0.0005 degrees ≈ 55 meters at equator)
  const THRESHOLD = 0.0005;

  const latDiff = Math.abs(currentLatitude - enrichedLatitude);
  const lngDiff = Math.abs(currentLongitude - enrichedLongitude);

  return latDiff > THRESHOLD || lngDiff > THRESHOLD;
}
