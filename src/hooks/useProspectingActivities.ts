// Hook for managing prospecting activities
// src/hooks/useProspectingActivities.ts

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ProspectingActivity, ProspectingActivityType } from '../lib/types';

interface UseProspectingActivitiesReturn {
  activities: ProspectingActivity[];
  loading: boolean;
  error: string | null;
  loadActivities: (leadId?: string, contactId?: string) => Promise<void>;
  logActivity: (
    activityType: ProspectingActivityType,
    options: {
      leadId?: string;
      contactId?: string;
      notes?: string;
      emailSubject?: string;
    }
  ) => Promise<ProspectingActivity | null>;
  deleteActivity: (activityId: string) => Promise<boolean>;
}

export const useProspectingActivities = (): UseProspectingActivitiesReturn => {
  const [activities, setActivities] = useState<ProspectingActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load activities for a lead or contact
  const loadActivities = useCallback(async (leadId?: string, contactId?: string) => {
    if (!leadId && !contactId) {
      setActivities([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('prospecting_activity')
        .select('*')
        .order('created_at', { ascending: false });

      if (leadId) {
        query = query.eq('target_id', leadId);
      } else if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setActivities(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load activities';
      setError(message);
      console.error('Error loading activities:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Log a new activity
  const logActivity = useCallback(async (
    activityType: ProspectingActivityType,
    options: {
      leadId?: string;
      contactId?: string;
      notes?: string;
      emailSubject?: string;
    }
  ): Promise<ProspectingActivity | null> => {
    const { leadId, contactId, notes, emailSubject } = options;

    if (!leadId && !contactId) {
      setError('Must provide either a lead ID or contact ID');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('prospecting_activity')
        .insert({
          target_id: leadId || null,
          contact_id: contactId || null,
          activity_type: activityType,
          notes: notes || null,
          email_subject: emailSubject || null,
          created_by: user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to local state
      setActivities(prev => [data, ...prev]);

      console.log(`✅ Logged ${activityType} activity`);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log activity';
      setError(message);
      console.error('Error logging activity:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete an activity
  const deleteActivity = useCallback(async (activityId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('prospecting_activity')
        .delete()
        .eq('id', activityId);

      if (deleteError) throw deleteError;

      // Remove from local state
      setActivities(prev => prev.filter(a => a.id !== activityId));

      console.log('✅ Deleted activity');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete activity';
      setError(message);
      console.error('Error deleting activity:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    activities,
    loading,
    error,
    loadActivities,
    logActivity,
    deleteActivity
  };
};
