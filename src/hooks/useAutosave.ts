import { useEffect, useRef, useCallback, useState } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutosaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  delay?: number; // Delay in milliseconds before saving (default: 1500ms)
  enabled?: boolean; // Whether autosave is enabled (default: true)
  onStatusChange?: (status: AutosaveStatus) => void;
}

interface UseAutosaveReturn {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  forceSave: () => Promise<void>;
}

/**
 * Hook for implementing autosave functionality with debouncing
 *
 * @param options - Configuration options
 * @returns Autosave status and controls
 *
 * @example
 * ```tsx
 * const { status, lastSavedAt } = useAutosave({
 *   data: formData,
 *   onSave: async (data) => {
 *     await supabase.from('table').update(data).eq('id', id);
 *   },
 *   delay: 1500,
 *   enabled: !isNewRecord
 * });
 * ```
 */
export function useAutosave<T>({
  data,
  onSave,
  delay = 1500,
  enabled = true,
  onStatusChange,
}: UseAutosaveOptions<T>): UseAutosaveReturn {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<T>(data);
  const isSavingRef = useRef(false);

  // Update status and notify callback
  const updateStatus = useCallback((newStatus: AutosaveStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  // Save function
  const save = useCallback(async () => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    updateStatus('saving');

    try {
      await onSave(data);
      setLastSavedAt(new Date());
      updateStatus('saved');
      previousDataRef.current = data;

      // Reset to idle after showing "saved" for 2 seconds
      setTimeout(() => {
        if (status === 'saved') {
          updateStatus('idle');
        }
      }, 2000);
    } catch (error) {
      console.error('Autosave error:', error);
      updateStatus('error');

      // Reset error status after 3 seconds
      setTimeout(() => {
        if (status === 'error') {
          updateStatus('idle');
        }
      }, 3000);
    } finally {
      isSavingRef.current = false;
    }
  }, [data, onSave, updateStatus, status]);

  // Force save (bypass debounce)
  const forceSave = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await save();
  }, [save]);

  // Debounced autosave effect
  useEffect(() => {
    if (!enabled) return;

    // Check if data has actually changed
    const hasChanged = JSON.stringify(previousDataRef.current) !== JSON.stringify(data);
    if (!hasChanged) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for autosave
    timeoutRef.current = setTimeout(() => {
      save();
    }, delay);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, save]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSavedAt,
    forceSave,
  };
}
