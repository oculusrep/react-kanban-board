import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];

interface PropertyWithRelations extends Property {
  property_type?: PropertyType;
  property_stage?: PropertyStage;
}

interface UsePropertyResult {
  property: PropertyWithRelations | null;
  loading: boolean;
  error: string | null;
  updateProperty: (updates: Partial<Property>) => Promise<void>;
  createProperty: (property: Omit<Property, 'id' | 'created_at' | 'updated_at'>) => Promise<Property>;
  refreshProperty: () => Promise<void>;
}

export const useProperty = (propertyId?: string): UsePropertyResult => {
  const [property, setProperty] = useState<PropertyWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperty = useCallback(async () => {
    if (!propertyId) {
      setProperty(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('property')
        .select(`
          *,
          property_type:property_type_id (
            id,
            label,
            description,
            active
          ),
          property_stage:property_stage_id (
            id,
            label,
            description,
            active
          )
        `)
        .eq('id', propertyId)
        .single();

      if (error) throw error;
      setProperty(data);
    } catch (err) {
      console.error('Error fetching property:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch property');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchProperty();
  }, [fetchProperty]);

  const updateProperty = useCallback(async (updates: Partial<Property>) => {
    if (!propertyId) throw new Error('No property ID provided');

    try {
      setError(null);
      
      // Prepare update payload with timestamp
      const updatePayload = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('property')
        .update(updatePayload)
        .eq('id', propertyId)
        .select(`
          *,
          property_type:property_type_id (
            id,
            label,
            description,
            active
          ),
          property_stage:property_stage_id (
            id,
            label,
            description,
            active
          )
        `)
        .single();

      if (error) throw error;
      
      setProperty(data);
    } catch (err) {
      console.error('Error updating property:', err);
      setError(err instanceof Error ? err.message : 'Failed to update property');
      throw err;
    }
  }, [propertyId]);

  const createProperty = useCallback(async (propertyData: Omit<Property, 'id' | 'created_at' | 'updated_at'>): Promise<Property> => {
    try {
      setError(null);
      
      const { data, error } = await supabase
        .from('property')
        .insert([{
          ...propertyData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error creating property:', err);
      setError(err instanceof Error ? err.message : 'Failed to create property');
      throw err;
    }
  }, []);

  const refreshProperty = useCallback(async () => {
    await fetchProperty();
  }, [fetchProperty]);

  return {
    property,
    loading,
    error,
    updateProperty,
    createProperty,
    refreshProperty
  };
};