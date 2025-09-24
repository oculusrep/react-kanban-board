import { useState, useCallback, useRef } from 'react';
import { geocodingService } from '../services/geocodingService';
import { supabase } from '../lib/supabaseClient';

interface PropertyToGeocode {
  id: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  property_name?: string;
}

interface BatchResult {
  total: number;
  successful: number;
  failed: number;
  processed: number;
  currentAddress?: string;
  results: {
    successful: { property: PropertyToGeocode; coordinates: { lat: number; lng: number } }[];
    failed: { property: PropertyToGeocode; error: string }[];
  };
}

interface UseGeocodingBatchReturn {
  // State
  isRunning: boolean;
  isPaused: boolean;
  progress: BatchResult;
  logs: string[];

  // Actions
  startBatch: (limit?: number) => Promise<void>;
  pauseBatch: () => void;
  resumeBatch: () => void;
  stopBatch: () => void;
  clearResults: () => void;

  // Data
  refreshPropertiesCount: () => Promise<number>;
}

export function useGeocodingBatch(): UseGeocodingBatchReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<BatchResult>({
    total: 0,
    successful: 0,
    failed: 0,
    processed: 0,
    results: { successful: [], failed: [] }
  });
  const [logs, setLogs] = useState<string[]>([]);

  // Use refs to track batch state across async operations
  const shouldStopRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentBatchRef = useRef<PropertyToGeocode[]>([]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(`🏢 Batch Geocoding: ${message}`);
    setLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
  }, []);

  const updateProgress = useCallback((update: Partial<BatchResult>) => {
    setProgress(prev => ({
      ...prev,
      ...update,
      results: {
        successful: update.results?.successful ?? prev.results.successful,
        failed: update.results?.failed ?? prev.results.failed,
      }
    }));
  }, []);

  const refreshPropertiesCount = useCallback(async (): Promise<number> => {
    try {
      const properties = await geocodingService.getPropertiesNeedingGeocoding(1000, supabase);
      return properties.length;
    } catch (error) {
      console.error('Error getting properties count:', error);
      return 0;
    }
  }, []);

  const startBatch = useCallback(async (limit: number = 100) => {
    if (isRunning) return;

    try {
      setIsRunning(true);
      setIsPaused(false);
      shouldStopRef.current = false;
      isPausedRef.current = false;

      addLog(`🚀 Starting batch geocoding (limit: ${limit})`);

      // Get properties that need geocoding
      const properties = await geocodingService.getPropertiesNeedingGeocoding(limit, supabase);

      if (properties.length === 0) {
        addLog('✅ No properties need geocoding - all done!');
        setIsRunning(false);
        return;
      }

      currentBatchRef.current = properties;

      updateProgress({
        total: properties.length,
        processed: 0,
        successful: 0,
        failed: 0,
        results: { successful: [], failed: [] }
      });

      addLog(`📋 Found ${properties.length} properties needing geocoding`);

      // Process properties one by one with proper rate limiting
      for (let i = 0; i < properties.length; i++) {
        // Check for stop/pause
        if (shouldStopRef.current) {
          addLog('⏹️ Batch processing stopped by user');
          break;
        }

        while (isPausedRef.current && !shouldStopRef.current) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Check pause state every second
        }

        if (shouldStopRef.current) break;

        const property = properties[i];
        const progressNum = i + 1;

        updateProgress({
          processed: progressNum,
          currentAddress: `${property.address}, ${property.city || ''}, ${property.state || ''}`.trim()
        });

        addLog(`📍 (${progressNum}/${properties.length}) Geocoding: ${property.property_name || property.address}`);

        try {
          // Build full address
          const fullAddress = geocodingService.buildAddressString(
            property.address,
            property.city,
            property.state,
            property.zip
          );

          // Geocode the address
          const result = await geocodingService.geocodeAddress(fullAddress);

          if ('latitude' in result) {
            // Success - update database
            const updateSuccess = await geocodingService.updatePropertyCoordinates(
              property.id,
              result,
              supabase,
              false // Use regular coordinates, not verified
            );

            if (updateSuccess) {
              const successEntry = {
                property,
                coordinates: { lat: result.latitude, lng: result.longitude }
              };

              setProgress(prev => ({
                ...prev,
                successful: prev.successful + 1,
                results: {
                  ...prev.results,
                  successful: [...prev.results.successful, successEntry]
                }
              }));

              addLog(`✅ Success: ${property.property_name || property.address} -> ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)} (${result.provider})`);
            } else {
              addLog(`⚠️ Geocoded but failed to update database: ${property.property_name || property.address}`);
            }
          } else {
            // Failed geocoding
            const failedEntry = {
              property,
              error: result.error
            };

            setProgress(prev => ({
              ...prev,
              failed: prev.failed + 1,
              results: {
                ...prev.results,
                failed: [...prev.results.failed, failedEntry]
              }
            }));

            addLog(`❌ Failed: ${property.property_name || property.address} - ${result.error}`);
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          const failedEntry = {
            property,
            error: errorMessage
          };

          setProgress(prev => ({
            ...prev,
            failed: prev.failed + 1,
            results: {
              ...prev.results,
              failed: [...prev.results.failed, failedEntry]
            }
          }));

          addLog(`❌ Error: ${property.property_name || property.address} - ${errorMessage}`);
        }
      }

      updateProgress({ currentAddress: undefined });

      // Use a slight delay to ensure final state is captured
      setTimeout(() => {
        setProgress(prev => {
          addLog(`🎯 Batch complete: ${prev.successful} successful, ${prev.failed} failed out of ${prev.total} total`);
          return prev;
        });
      }, 100);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Batch processing failed';
      addLog(`❌ Batch error: ${errorMessage}`);
      console.error('Batch geocoding error:', error);
    } finally {
      setIsRunning(false);
      setIsPaused(false);
      shouldStopRef.current = false;
      isPausedRef.current = false;
    }
  }, [isRunning, addLog, updateProgress, progress]);

  const pauseBatch = useCallback(() => {
    if (!isRunning || isPaused) return;

    setIsPaused(true);
    isPausedRef.current = true;
    addLog('⏸️ Batch processing paused');
  }, [isRunning, isPaused, addLog]);

  const resumeBatch = useCallback(() => {
    if (!isRunning || !isPaused) return;

    setIsPaused(false);
    isPausedRef.current = false;
    addLog('▶️ Batch processing resumed');
  }, [isRunning, isPaused, addLog]);

  const stopBatch = useCallback(() => {
    if (!isRunning) return;

    shouldStopRef.current = true;
    isPausedRef.current = false;
    addLog('⏹️ Stopping batch processing...');
  }, [isRunning, addLog]);

  const clearResults = useCallback(() => {
    if (isRunning) return; // Don't clear while running

    setProgress({
      total: 0,
      successful: 0,
      failed: 0,
      processed: 0,
      results: { successful: [], failed: [] }
    });
    setLogs([]);
    addLog('🗑️ Results cleared');
  }, [isRunning, addLog]);

  return {
    // State
    isRunning,
    isPaused,
    progress,
    logs,

    // Actions
    startBatch,
    pauseBatch,
    resumeBatch,
    stopBatch,
    clearResults,

    // Data
    refreshPropertiesCount,
  };
}

export default useGeocodingBatch;