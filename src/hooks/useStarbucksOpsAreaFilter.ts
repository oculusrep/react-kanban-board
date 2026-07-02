import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface OpsAreaOption {
  planned_ops_area_id: number | null;
  planned_ops_area_name: string | null;
  count: number;
}

// null in selectedIds means "no filter — show all ops areas".
// A Set (even empty) means "only show these ids"; an empty set therefore hides everything,
// which matches how the priority-visibility checkboxes already work.
export type SelectedOpsAreaIds = Set<number> | null;

const STORAGE_KEY = 'starbucks_target_area_ops_area_filter_v1';

function loadFromStorage(): SelectedOpsAreaIds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed === null) return null;
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((n): n is number => typeof n === 'number'));
  } catch {
    return null;
  }
}

function persist(selected: SelectedOpsAreaIds) {
  try {
    if (selected === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected]));
    }
  } catch {
    // localStorage unavailable (Safari private mode, quota) — state still works in-session
  }
}

export function useStarbucksOpsAreaFilter() {
  const [options, setOptions] = useState<OpsAreaOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<SelectedOpsAreaIds>(loadFromStorage);

  useEffect(() => {
    persist(selectedIds);
  }, [selectedIds]);

  const fetchOptions = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_starbucks_target_area_ops_areas');
      if (error) throw error;
      setOptions(((data ?? []) as OpsAreaOption[]).map(row => ({
        ...row,
        count: Number(row.count),
      })));
      setLoaded(true);
    } catch (err) {
      console.error('useStarbucksOpsAreaFilter fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const toggleId = useCallback((id: number) => {
    setSelectedIds(prev => {
      // Materialize "all" into an explicit set the first time the user touches a box,
      // so unchecking one leaves the others checked.
      const base = prev === null ? new Set(options.map(o => o.planned_ops_area_id).filter((n): n is number => n != null)) : new Set(prev);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });
  }, [options]);

  const selectAll = useCallback(() => setSelectedIds(null), []);
  const selectNone = useCallback(() => setSelectedIds(new Set()), []);

  return {
    options,
    loading,
    selectedIds,
    fetchOptions,
    toggleId,
    selectAll,
    selectNone,
  };
}
