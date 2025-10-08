import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { geocodingService } from '../services/geocodingService';

interface ReverseGeocodingProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentProperty?: string;
}

interface ReverseGeocodingLog {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export function useReverseGeocodingBatch() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<ReverseGeocodingProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
  });
  const [logs, setLogs] = useState<ReverseGeocodingLog[]>([]);

  const abortController = useRef<AbortController | null>(null);
  const pauseFlag = useRef(false);

  const addLog = useCallback((type: ReverseGeocodingLog['type'], message: string) => {
    const log: ReverseGeocodingLog = {
      timestamp: new Date(),
      type,
      message,
    };
    setLogs((prev) => [...prev, log]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  const refreshPropertiesCount = useCallback(async (): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('property')
        .select('id', { count: 'exact', head: true })
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .is('address', null);

      if (error) {
        console.error('Error counting properties:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error counting properties:', error);
      return 0;
    }
  }, []);

  const getPropertiesNeedingReverseGeocoding = useCallback(async (limit: number) => {
    try {
      const { data, error } = await supabase
        .from('property')
        .select('id, property_name, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .is('address', null)
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching properties:', error);
      addLog('error', `Failed to fetch properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }, [addLog]);

  const updatePropertyAddress = useCallback(async (
    propertyId: string,
    address: string,
    city?: string,
    state?: string,
    zip?: string
  ): Promise<boolean> => {
    try {
      const updateData: any = {
        address,
        updated_at: new Date().toISOString(),
      };

      // Only update city/state/zip if they're currently empty
      if (city) updateData.city = city;
      if (state) updateData.state = state;
      if (zip) updateData.zip = zip;

      const { error } = await supabase
        .from('property')
        .update(updateData)
        .eq('id', propertyId);

      if (error) {
        console.error('Database update error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating property:', error);
      return false;
    }
  }, []);

  const startBatch = useCallback(async (limit: number = 50) => {
    if (isRunning) {
      addLog('warning', 'Batch reverse geocoding already running');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    pauseFlag.current = false;
    abortController.current = new AbortController();

    setProgress({
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
    });

    setLogs([]);
    addLog('info', `Starting batch reverse geocoding (limit: ${limit} properties)`);

    try {
      // Fetch properties
      const properties = await getPropertiesNeedingReverseGeocoding(limit);

      if (properties.length === 0) {
        addLog('info', 'No properties need reverse geocoding');
        setIsRunning(false);
        return;
      }

      addLog('info', `Found ${properties.length} properties to reverse geocode`);

      setProgress((prev) => ({
        ...prev,
        total: properties.length,
      }));

      // Process each property
      for (let i = 0; i < properties.length; i++) {
        // Check if paused
        while (pauseFlag.current && !abortController.current?.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Check if stopped
        if (abortController.current?.signal.aborted) {
          addLog('warning', 'Batch reverse geocoding stopped by user');
          break;
        }

        const property = properties[i];

        setProgress((prev) => ({
          ...prev,
          currentProperty: property.property_name || property.id,
        }));

        addLog('info', `Processing ${i + 1}/${properties.length}: ${property.property_name || property.id}`);

        try {
          // Reverse geocode using lat/long
          const result = await geocodingService.reverseGeocode(
            property.latitude,
            property.longitude
          );

          if ('latitude' in result) {
            // Success - update property
            const updated = await updatePropertyAddress(
              property.id,
              result.street_address || result.formatted_address,
              result.city,
              result.state,
              result.zip
            );

            if (updated) {
              setProgress((prev) => ({
                ...prev,
                processed: prev.processed + 1,
                successful: prev.successful + 1,
              }));
              addLog('success', `✓ ${property.property_name || property.id}: ${result.street_address || result.formatted_address}`);
            } else {
              setProgress((prev) => ({
                ...prev,
                processed: prev.processed + 1,
                failed: prev.failed + 1,
              }));
              addLog('error', `✗ ${property.property_name || property.id}: Failed to update database`);
            }
          } else {
            // Failed to geocode
            setProgress((prev) => ({
              ...prev,
              processed: prev.processed + 1,
              failed: prev.failed + 1,
            }));
            addLog('error', `✗ ${property.property_name || property.id}: ${result.error}`);
          }
        } catch (error) {
          setProgress((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            failed: prev.failed + 1,
          }));
          addLog('error', `✗ ${property.property_name || property.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Rate limiting - wait 1.2 seconds between requests (OSM policy)
        if (i < properties.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }

      addLog('info', `Batch complete: ${progress.successful} successful, ${progress.failed} failed`);
    } catch (error) {
      addLog('error', `Batch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      pauseFlag.current = false;
      setProgress((prev) => ({
        ...prev,
        currentProperty: undefined,
      }));
    }
  }, [isRunning, addLog, getPropertiesNeedingReverseGeocoding, updatePropertyAddress, progress.successful, progress.failed]);

  const pauseBatch = useCallback(() => {
    if (!isRunning || isPaused) return;
    pauseFlag.current = true;
    setIsPaused(true);
    addLog('info', 'Batch paused');
  }, [isRunning, isPaused, addLog]);

  const resumeBatch = useCallback(() => {
    if (!isRunning || !isPaused) return;
    pauseFlag.current = false;
    setIsPaused(false);
    addLog('info', 'Batch resumed');
  }, [isRunning, isPaused, addLog]);

  const stopBatch = useCallback(() => {
    if (!isRunning) return;
    abortController.current?.abort();
    setIsRunning(false);
    setIsPaused(false);
    pauseFlag.current = false;
    addLog('warning', 'Batch stopped');
  }, [isRunning, addLog]);

  const clearResults = useCallback(() => {
    setLogs([]);
    setProgress({
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
    });
  }, []);

  return {
    isRunning,
    isPaused,
    progress,
    logs,
    startBatch,
    pauseBatch,
    resumeBatch,
    stopBatch,
    clearResults,
    refreshPropertiesCount,
  };
}
