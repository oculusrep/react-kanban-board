import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { propertyCache } from '../utils/propertyCache';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];
type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];

interface PropertyWithRelations extends Property {
  property_type?: PropertyType;
  property_stage?: PropertyStage;
  property_record_type?: PropertyRecordType;
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

      // First get the basic property data
      const { data: propertyData, error: propertyError } = await supabase
        .from('property')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (propertyError) throw propertyError;

      // Then fetch related data if IDs exist
      const [propertyTypeResponse, propertyStageResponse, propertyRecordTypeResponse] = await Promise.all([
        propertyData.property_type_id 
          ? supabase.from('property_type').select('*').eq('id', propertyData.property_type_id).single()
          : Promise.resolve({ data: null, error: null }),
        propertyData.property_stage_id
          ? supabase.from('property_stage').select('*').eq('id', propertyData.property_stage_id).single()
          : Promise.resolve({ data: null, error: null }),
        propertyData.property_record_type_id
          ? supabase.from('property_record_type').select('*').eq('id', propertyData.property_record_type_id).single()
          : Promise.resolve({ data: null, error: null })
      ]);

      // Combine the data
      const enrichedProperty: PropertyWithRelations = {
        ...propertyData,
        property_type: propertyTypeResponse.data || undefined,
        property_stage: propertyStageResponse.data || undefined,
        property_record_type: propertyRecordTypeResponse.data || undefined
      };

      setProperty(enrichedProperty);
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
      // Note: updated_by_id is automatically set by auth.uid() database default
      const updatePayload: any = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      console.log('🔧 useProperty.updateProperty - propertyId:', propertyId);
      console.log('🔧 useProperty.updateProperty - updates received:', updates);
      console.log('🔧 useProperty.updateProperty - property_notes in updates:', updates.property_notes);
      console.log('🔧 useProperty.updateProperty - updatePayload:', updatePayload);

      const { data, error } = await supabase
        .from('property')
        .update(prepareUpdate(updatePayload))
        .eq('id', propertyId)
        .select('*')
        .single();

      if (error) {
        console.error('❌ Supabase update error:', error);
        throw error;
      }

      console.log('✅ Supabase update successful, returned data:', data);
      console.log('✅ property_notes in returned data:', data?.property_notes);
      console.log('✅ updated_by_id in returned data:', data?.updated_by_id);

      // Update the cache with the new property data
      if (data) {
        propertyCache.updateCachedProperty(data);
      }

      setProperty(data);
    } catch (err) {
      console.error('Error updating property:', err);
      setError(err instanceof Error ? err.message : 'Failed to update property');
      throw err;
    }
  }, [propertyId]);

  const createProperty = useCallback(async (propertyData: Omit<Property, 'id' | 'created_at' | 'updated_at'>): Promise<Property> => {
    const payload = prepareInsert({
      ...propertyData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Safari/iOS PWA frequently throws "TypeError: Load failed" on the first fetch
    // after the tab wakes or when cellular signal hiccups. Retry once on network errors.
    const isTransientNetworkError = (err: any) => {
      const msg = (err?.message || '').toLowerCase();
      return err instanceof TypeError
        || msg.includes('load failed')
        || msg.includes('failed to fetch')
        || msg.includes('networkerror');
    };

    const attemptInsert = async () => {
      const { data, error } = await supabase
        .from('property')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    };

    try {
      setError(null);

      let data;
      try {
        data = await attemptInsert();
      } catch (err) {
        if (!isTransientNetworkError(err)) throw err;
        console.warn('⚠️ Property insert hit a network error, retrying once:', err);
        await new Promise(resolve => setTimeout(resolve, 500));
        data = await attemptInsert();
      }

      if (data) {
        propertyCache.updateCachedProperty(data);
      }

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