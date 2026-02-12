// Hook for loading prospecting metrics
// src/hooks/useProspectingMetrics.ts

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ProspectingWeeklyMetrics, StaleLead, HunterLead } from '../lib/types';

interface ProspectingDashboardData {
  metrics: ProspectingWeeklyMetrics | null;
  staleLeads: StaleLead[];
  newLeads: HunterLead[];
  dueTaskCount: number;
}

interface UseProspectingMetricsReturn {
  data: ProspectingDashboardData;
  loading: boolean;
  error: string | null;
  loadDashboardData: () => Promise<void>;
  loadWeeklyMetrics: () => Promise<ProspectingWeeklyMetrics | null>;
  loadStaleLeads: () => Promise<StaleLead[]>;
  loadNewLeads: () => Promise<HunterLead[]>;
}

export const useProspectingMetrics = (): UseProspectingMetricsReturn => {
  const [data, setData] = useState<ProspectingDashboardData>({
    metrics: null,
    staleLeads: [],
    newLeads: [],
    dueTaskCount: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load weekly metrics from the view
  const loadWeeklyMetrics = useCallback(async (): Promise<ProspectingWeeklyMetrics | null> => {
    try {
      const { data: metrics, error: metricsError } = await supabase
        .from('v_prospecting_weekly_metrics')
        .select('*')
        .single();

      if (metricsError) throw metricsError;
      return metrics;
    } catch (err) {
      console.error('Error loading weekly metrics:', err);
      return null;
    }
  }, []);

  // Load stale leads (targets) from the view
  const loadStaleLeads = useCallback(async (): Promise<StaleLead[]> => {
    try {
      const { data: leads, error: leadsError } = await supabase
        .from('v_prospecting_stale_targets')
        .select('*')
        .limit(10);

      if (leadsError) throw leadsError;
      return leads || [];
    } catch (err) {
      console.error('Error loading stale leads:', err);
      return [];
    }
  }, []);

  // Load new targets (status = 'new')
  const loadNewLeads = useCallback(async (): Promise<HunterLead[]> => {
    try {
      const { data: leads, error: leadsError } = await supabase
        .from('target')
        .select('*')
        .eq('status', 'new')
        .order('last_signal_at', { ascending: false })
        .limit(10);

      if (leadsError) throw leadsError;
      return leads || [];
    } catch (err) {
      console.error('Error loading new leads:', err);
      return [];
    }
  }, []);

  // Load count of prospecting tasks due today
  const loadDueTaskCount = useCallback(async (): Promise<number> => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // First, find the Prospecting category ID
      const { data: category, error: catError } = await supabase
        .from('task_category')
        .select('id')
        .eq('name', 'Prospecting')
        .maybeSingle();

      if (catError || !category) {
        // Category doesn't exist yet, return 0
        return 0;
      }

      // Count tasks due today in Prospecting category
      const { count, error: countError } = await supabase
        .from('task')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', category.id)
        .eq('is_complete', false)
        .lte('due_date', today);

      if (countError) throw countError;
      return count || 0;
    } catch (err) {
      console.error('Error loading due task count:', err);
      return 0;
    }
  }, []);

  // Load all dashboard data
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load all data in parallel
      const [metrics, staleLeads, newLeads, dueTaskCount] = await Promise.all([
        loadWeeklyMetrics(),
        loadStaleLeads(),
        loadNewLeads(),
        loadDueTaskCount()
      ]);

      setData({
        metrics,
        staleLeads,
        newLeads,
        dueTaskCount
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(message);
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [loadWeeklyMetrics, loadStaleLeads, loadNewLeads, loadDueTaskCount]);

  return {
    data,
    loading,
    error,
    loadDashboardData,
    loadWeeklyMetrics,
    loadStaleLeads,
    loadNewLeads
  };
};
