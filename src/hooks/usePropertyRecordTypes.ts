import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../database-schema';

type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];

interface UsePropertyRecordTypesReturn {
  propertyRecordTypes: PropertyRecordType[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage property record types
 */
export function usePropertyRecordTypes(): UsePropertyRecordTypesReturn {
  const [propertyRecordTypes, setPropertyRecordTypes] = useState<PropertyRecordType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPropertyRecordTypes = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: supabaseError } = await supabase
          .from('property_record_type')
          .select('*')
          .eq('active', true)
          .order('sort_order');

        if (supabaseError) {
          throw supabaseError;
        }

        setPropertyRecordTypes(data || []);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch property record types';
        setError(errorMessage);
        console.error('Error fetching property record types:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPropertyRecordTypes();
  }, []);

  return {
    propertyRecordTypes,
    isLoading,
    error,
  };
}

export default usePropertyRecordTypes;