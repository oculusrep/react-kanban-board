import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../database-schema';

type Activity = Database['public']['Tables']['activity']['Row'];
type ActivityStatus = Database['public']['Tables']['activity_status']['Row'];
type ActivityType = Database['public']['Tables']['activity_type']['Row'];
type ActivityPriority = Database['public']['Tables']['activity_priority']['Row'];
type ActivityTaskType = Database['public']['Tables']['activity_task_type']['Row'];
type User = Database['public']['Tables']['user']['Row'];
type Contact = Database['public']['Tables']['contact']['Row'];

export interface ActivityWithRelations extends Activity {
  activity_status?: ActivityStatus;
  activity_type?: ActivityType;
  activity_priority?: ActivityPriority;
  activity_task_type?: ActivityTaskType;
  owner?: User;
  contact?: Contact;
  // Audit fields added by migration but not yet in generated schema
  created_by_id?: string | null;
  updated_by_id?: string | null;
  updated_by_user?: User;
}

interface UseActivitiesResult {
  activities: ActivityWithRelations[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useActivities(dealId: string | null): UseActivitiesResult {
  const [activities, setActivities] = useState<ActivityWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = async () => {
    if (!dealId) {
      setActivities([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Fetching activities for deal:', dealId);

      // First, check if the activity table exists at all
      const { data, error: fetchError } = await supabase
        .from('activity')
        .select('*')
        .eq('deal_id', dealId)
        .limit(10);

      if (fetchError) {
        console.error('Error fetching activities:', fetchError);
        
        // Check if it's a table not found error
        if (fetchError.message.includes('does not exist') || fetchError.message.includes('relation') || fetchError.code === '42P01') {
          setError('Activity table not found. Please run the database migration to create activity tables.');
        } else {
          setError(`Database error: ${fetchError.message}`);
        }
        return;
      }

      console.log(`Found ${data?.length || 0} activities for deal ${dealId}`);
      setActivities(data || []);
    } catch (err) {
      console.error('Error in useActivities:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred while fetching activities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [dealId]);

  return {
    activities,
    loading,
    error,
    refetch: fetchActivities
  };
}