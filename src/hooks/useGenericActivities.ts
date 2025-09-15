import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ActivityWithRelations, ParentObject } from '../types/activity';

interface UseGenericActivitiesResult {
  activities: ActivityWithRelations[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useGenericActivities(parentObject: ParentObject | null): UseGenericActivitiesResult {
  const [activities, setActivities] = useState<ActivityWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = async () => {
    if (!parentObject) {
      setActivities([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Fetching activities for:', parentObject);

      // Build the query based on parent object type
      let query = supabase
        .from('activity')
        .select(`
          *,
          activity_status!activity_status_id_fkey (
            name,
            color,
            is_closed
          ),
          activity_type!activity_activity_type_id_fkey (
            name,
            color
          ),
          activity_priority!activity_activity_priority_id_fkey (
            name,
            color
          ),
          activity_task_type!activity_activity_task_type_id_fkey (
            name,
            category
          ),
          owner:user!activity_owner_id_fkey (
            first_name,
            last_name,
            email
          ),
          updated_by_user:user!activity_updated_by_fkey (
            first_name,
            last_name,
            email
          ),
          contact!activity_contact_id_fkey (
            first_name,
            last_name,
            company
          )
        `);

      // Add filter based on parent object type
      switch (parentObject.type) {
        case 'deal':
          query = query.eq('deal_id', parentObject.id);
          break;
        case 'contact':
          query = query.eq('contact_id', parentObject.id);
          break;
        case 'client':
          query = query.eq('client_id', parentObject.id);
          break;
        case 'property':
          query = query.eq('property_id', parentObject.id);
          break;
        case 'site_submit':
          query = query.eq('site_submit_id', parentObject.id);
          break;
        case 'assignment':
          query = query.eq('assignment_id', parentObject.id);
          break;
        default:
          // Fallback to related_object fields
          query = query
            .eq('related_object_type', parentObject.type)
            .eq('related_object_id', parentObject.id);
          break;
      }

      const { data, error: fetchError } = await query.order('activity_date', { ascending: false });

      if (fetchError) {
        console.error('Error fetching activities:', fetchError);
        throw fetchError;
      }

      console.log(`Found ${data?.length || 0} activities for ${parentObject.type}:${parentObject.id}`);
      setActivities(data || []);

    } catch (error) {
      console.error('Error in fetchActivities:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  };

  const refetch = () => {
    fetchActivities();
  };

  useEffect(() => {
    fetchActivities();
  }, [parentObject?.id, parentObject?.type]);

  return { activities, loading, error, refetch };
}

// Legacy hook for backward compatibility
export function useActivities(dealId: string | null) {
  const parentObject = dealId ? { id: dealId, type: 'deal' as const, name: '' } : null;
  return useGenericActivities(parentObject);
}