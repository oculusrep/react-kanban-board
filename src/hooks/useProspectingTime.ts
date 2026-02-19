// Hook for managing prospecting time tracking
// src/hooks/useProspectingTime.ts

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ProspectingTimeEntry, ProspectingVacationDay, ProspectingSettings } from '../lib/types';

interface TimeStats {
  todayMinutes: number;
  weekMinutes: number;
  dailyGoalMinutes: number;
  todayPercentage: number;
  weekPercentage: number;
  streak: number;
}

interface UseProspectingTimeReturn {
  timeEntry: ProspectingTimeEntry | null;
  vacationDays: ProspectingVacationDay[];
  settings: ProspectingSettings | null;
  stats: TimeStats;
  loading: boolean;
  error: string | null;
  loadTimeData: () => Promise<void>;
  saveTimeEntry: (date: string, minutes: number, notes?: string) => Promise<boolean>;
  markVacationDay: (date: string, reason?: string) => Promise<boolean>;
  removeVacationDay: (date: string) => Promise<boolean>;
  updateSettings: (updates: Partial<Pick<ProspectingSettings, 'daily_time_goal_minutes' | 'stale_lead_days'>>) => Promise<boolean>;
}

// Helper to format date as YYYY-MM-DD in local timezone
const formatLocalDate = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Helper to get week bounds (Monday to Sunday) in local timezone
const getWeekBounds = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    start: formatLocalDate(monday),
    end: formatLocalDate(sunday)
  };
};

export const useProspectingTime = (): UseProspectingTimeReturn => {
  const [timeEntry, setTimeEntry] = useState<ProspectingTimeEntry | null>(null);
  const [vacationDays, setVacationDays] = useState<ProspectingVacationDay[]>([]);
  const [settings, setSettings] = useState<ProspectingSettings | null>(null);
  const [stats, setStats] = useState<TimeStats>({
    todayMinutes: 0,
    weekMinutes: 0,
    dailyGoalMinutes: 120,
    todayPercentage: 0,
    weekPercentage: 0,
    streak: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all time tracking data
  const loadTimeData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Use LOCAL date (not UTC) to match what we save
      const today = formatLocalDate(new Date());
      const weekBounds = getWeekBounds();

      // Load settings (or create defaults)
      const { data: settingsData, error: settingsError } = await supabase
        .from('prospecting_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

      let currentSettings = settingsData;
      if (!currentSettings) {
        // Create default settings
        const { data: newSettings, error: createError } = await supabase
          .from('prospecting_settings')
          .insert({
            user_id: user.id,
            daily_time_goal_minutes: 120,
            stale_lead_days: 45
          })
          .select()
          .single();

        if (createError) throw createError;
        currentSettings = newSettings;
      }
      setSettings(currentSettings);

      // Load today's time entry
      const { data: todayEntry, error: todayError } = await supabase
        .from('prospecting_time_entry')
        .select('*')
        .eq('user_id', user.id)
        .eq('entry_date', today)
        .maybeSingle();

      if (todayError && todayError.code !== 'PGRST116') throw todayError;
      setTimeEntry(todayEntry);

      // Load week's time entries
      const { data: weekEntries, error: weekError } = await supabase
        .from('prospecting_time_entry')
        .select('minutes')
        .eq('user_id', user.id)
        .gte('entry_date', weekBounds.start)
        .lte('entry_date', weekBounds.end);

      if (weekError) throw weekError;

      const weekMinutes = weekEntries?.reduce((sum, e) => sum + (e.minutes || 0), 0) || 0;

      // Load vacation days (for streak calculation)
      const { data: vacations, error: vacationError } = await supabase
        .from('prospecting_vacation_day')
        .select('*')
        .eq('user_id', user.id)
        .order('vacation_date', { ascending: false });

      if (vacationError) throw vacationError;
      setVacationDays(vacations || []);

      // Calculate streak using database function
      const { data: streakData, error: streakError } = await supabase
        .rpc('calculate_prospecting_streak', { p_user_id: user.id });

      if (streakError) {
        console.warn('Streak calculation failed:', streakError);
      }

      const dailyGoal = currentSettings?.daily_time_goal_minutes || 120;
      const todayMinutes = todayEntry?.minutes || 0;
      const weeklyGoal = dailyGoal * 5; // 5 workdays

      setStats({
        todayMinutes,
        weekMinutes,
        dailyGoalMinutes: dailyGoal,
        todayPercentage: Math.min(100, Math.round((todayMinutes / dailyGoal) * 100)),
        weekPercentage: Math.min(100, Math.round((weekMinutes / weeklyGoal) * 100)),
        streak: streakData || 0
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load time data';
      setError(message);
      console.error('Error loading time data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save or update a time entry
  const saveTimeEntry = useCallback(async (date: string, minutes: number, notes?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: upsertError } = await supabase
        .from('prospecting_time_entry')
        .upsert({
          entry_date: date,
          minutes,
          notes: notes || null,
          user_id: user.id
        }, {
          onConflict: 'entry_date,user_id'
        })
        .select()
        .single();

      if (upsertError) throw upsertError;

      // Update local state if it's today (use local date, not UTC)
      const today = formatLocalDate(new Date());
      if (date === today) {
        setTimeEntry(data);
      }

      // Reload stats
      await loadTimeData();

      console.log('✅ Saved time entry');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save time entry';
      setError(message);
      console.error('Error saving time entry:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadTimeData]);

  // Mark a day as vacation
  const markVacationDay = useCallback(async (date: string, reason?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('prospecting_vacation_day')
        .insert({
          vacation_date: date,
          reason: reason || null,
          user_id: user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setVacationDays(prev => [data, ...prev]);

      // Reload stats (streak may change)
      await loadTimeData();

      console.log('✅ Marked vacation day');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark vacation day';
      setError(message);
      console.error('Error marking vacation day:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadTimeData]);

  // Remove a vacation day
  const removeVacationDay = useCallback(async (date: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: deleteError } = await supabase
        .from('prospecting_vacation_day')
        .delete()
        .eq('vacation_date', date)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      setVacationDays(prev => prev.filter(v => v.vacation_date !== date));

      // Reload stats (streak may change)
      await loadTimeData();

      console.log('✅ Removed vacation day');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove vacation day';
      setError(message);
      console.error('Error removing vacation day:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadTimeData]);

  // Update user settings
  const updateSettings = useCallback(async (
    updates: Partial<Pick<ProspectingSettings, 'daily_time_goal_minutes' | 'stale_lead_days'>>
  ): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: updateError } = await supabase
        .from('prospecting_settings')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setSettings(data);

      // Reload stats with new goals
      await loadTimeData();

      console.log('✅ Updated settings');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings';
      setError(message);
      console.error('Error updating settings:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadTimeData]);

  return {
    timeEntry,
    vacationDays,
    settings,
    stats,
    loading,
    error,
    loadTimeData,
    saveTimeEntry,
    markVacationDay,
    removeVacationDay,
    updateSettings
  };
};
