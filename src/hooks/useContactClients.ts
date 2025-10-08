import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type ContactClientRelation = Database['public']['Tables']['contact_client_relation']['Row'];
type Client = Database['public']['Tables']['client']['Row'];

export interface ContactClientRelationWithDetails extends ContactClientRelation {
  client?: Client;
}

export const useContactClients = (contactId: string | null) => {
  const [relations, setRelations] = useState<ContactClientRelationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRelations = useCallback(async () => {
    if (!contactId) {
      setRelations([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('contact_client_relation')
        .select(`
          *,
          client:client_id (
            id,
            client_name,
            sf_client_type,
            phone,
            website,
            description,
            billing_city,
            billing_state
          )
        `)
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (fetchError) throw fetchError;
      setRelations(data || []);
    } catch (err) {
      console.error('Error fetching contact clients:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const addClientRelation = async (
    clientId: string,
    role?: string,
    isPrimary?: boolean
  ) => {
    if (!contactId) {
      throw new Error('Contact ID is required');
    }

    try {
      // If setting as primary, unset other primary relations
      if (isPrimary) {
        await supabase
          .from('contact_client_relation')
          .update({ is_primary: false })
          .eq('contact_id', contactId);
      }

      const { data, error: insertError } = await supabase
        .from('contact_client_relation')
        .insert({
          contact_id: contactId,
          client_id: clientId,
          role: role || null,
          is_primary: isPrimary || false,
          is_active: true
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await fetchRelations();
      return data;
    } catch (err) {
      console.error('Error adding client relation:', err);
      throw err;
    }
  };

  const removeClientRelation = async (relationId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('contact_client_relation')
        .delete()
        .eq('id', relationId);

      if (deleteError) throw deleteError;
      await fetchRelations();
    } catch (err) {
      console.error('Error removing client relation:', err);
      throw err;
    }
  };

  const setPrimaryClient = async (relationId: string) => {
    if (!contactId) {
      throw new Error('Contact ID is required');
    }

    try {
      // Unset all primary flags for this contact
      await supabase
        .from('contact_client_relation')
        .update({ is_primary: false })
        .eq('contact_id', contactId);

      // Set new primary
      const { error: updateError } = await supabase
        .from('contact_client_relation')
        .update({ is_primary: true })
        .eq('id', relationId);

      if (updateError) throw updateError;
      await fetchRelations();
    } catch (err) {
      console.error('Error setting primary client:', err);
      throw err;
    }
  };

  const updateRelationRole = async (relationId: string, role: string) => {
    try {
      const { error: updateError } = await supabase
        .from('contact_client_relation')
        .update({ role })
        .eq('id', relationId);

      if (updateError) throw updateError;
      await fetchRelations();
    } catch (err) {
      console.error('Error updating relation role:', err);
      throw err;
    }
  };

  return {
    relations,
    loading,
    error,
    refreshRelations: fetchRelations,
    addClientRelation,
    removeClientRelation,
    setPrimaryClient,
    updateRelationRole
  };
};
