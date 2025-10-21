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

      // Fetch many-to-many relations
      const { data: relationsData, error: relationsError } = await supabase
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
            billing_state,
            parent_id
          )
        `)
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (relationsError) throw relationsError;

      // Fetch the contact's direct client_id
      const { data: contactData, error: contactError } = await supabase
        .from('contact')
        .select(`
          client_id,
          client:client_id (
            id,
            client_name,
            sf_client_type,
            phone,
            website,
            description,
            billing_city,
            billing_state,
            parent_id
          )
        `)
        .eq('id', contactId)
        .single();

      if (contactError) throw contactError;

      console.log('[useContactClients] Contact data:', contactData);
      console.log('[useContactClients] Contact client_id:', contactData?.client_id);
      console.log('[useContactClients] Contact client object:', contactData?.client);

      // Combine all relations
      const allRelations: ContactClientRelationWithDetails[] = [...(relationsData || [])];

      // Add direct client_id if it exists and not already in relations
      console.log('[useContactClients] Checking direct client_id...');
      console.log('[useContactClients] contactData?.client_id:', contactData?.client_id);
      console.log('[useContactClients] contactData.client:', contactData.client);
      if (contactData?.client_id && contactData.client) {
        console.log('[useContactClients] Direct client_id exists, checking if already in relations...');
        const alreadyExists = allRelations.some(r => r.client_id === contactData.client_id);
        console.log('[useContactClients] Already exists?', alreadyExists);
        if (!alreadyExists) {
          console.log('[useContactClients] Adding direct client to relations');
          allRelations.unshift({
            id: `direct-${contactData.client_id}`,
            contact_id: contactId,
            client_id: contactData.client_id,
            role: null,
            is_primary: true,
            is_active: true,
            created_at: null,
            updated_at: null,
            client: contactData.client
          } as ContactClientRelationWithDetails);
        }
      } else {
        console.log('[useContactClients] No direct client_id or client object is null');
      }

      console.log('[useContactClients] All relations after adding direct client:', allRelations);

      // Add parent clients if they exist
      const clientsToAddParentsFor = allRelations.filter(r => r.client?.parent_id);
      for (const relation of clientsToAddParentsFor) {
        if (relation.client?.parent_id) {
          // Check if parent is already in the list
          const parentAlreadyExists = allRelations.some(r => r.client_id === relation.client.parent_id);
          if (!parentAlreadyExists) {
            // Fetch parent client details
            const { data: parentClient, error: parentError } = await supabase
              .from('client')
              .select(`
                id,
                client_name,
                sf_client_type,
                phone,
                website,
                description,
                billing_city,
                billing_state,
                parent_id
              `)
              .eq('id', relation.client.parent_id)
              .single();

            if (!parentError && parentClient) {
              allRelations.push({
                id: `parent-${parentClient.id}`,
                contact_id: contactId,
                client_id: parentClient.id,
                role: 'Parent Client',
                is_primary: false,
                is_active: true,
                created_at: null,
                updated_at: null,
                client: parentClient
              } as ContactClientRelationWithDetails);
            }
          }
        }
      }

      setRelations(allRelations);
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

  const unsetPrimaryClient = async (relationId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('contact_client_relation')
        .update({ is_primary: false })
        .eq('id', relationId);

      if (updateError) throw updateError;
      await fetchRelations();
    } catch (err) {
      console.error('Error unsetting primary client:', err);
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
    unsetPrimaryClient,
    updateRelationRole
  };
};
