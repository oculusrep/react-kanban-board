import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type ContactClientRelation = Database['public']['Tables']['contact_client_relation']['Row'];
type Contact = Database['public']['Tables']['contact']['Row'];

export interface ClientContactRelationWithDetails extends ContactClientRelation {
  contact?: Contact;
}

export const useClientContacts = (clientId: string | null) => {
  const [relations, setRelations] = useState<ClientContactRelationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRelations = useCallback(async () => {
    if (!clientId) {
      setRelations([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch many-to-many relations from contact_client_relation table
      const { data, error: fetchError } = await supabase
        .from('contact_client_relation')
        .select(`
          *,
          contact:contact_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            mobile_phone,
            title,
            company,
            salutation,
            client_id
          )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch contacts with direct client_id reference
      const { data: directContacts, error: directError } = await supabase
        .from('contact')
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          mobile_phone,
          title,
          company,
          salutation,
          client_id
        `)
        .eq('client_id', clientId);

      if (directError) throw directError;

      const allRelations: ClientContactRelationWithDetails[] = [...(data || [])];

      // Add direct client_id contacts if they're not already in the many-to-many relations
      if (directContacts) {
        for (const contact of directContacts) {
          const alreadyExists = allRelations.some(r => r.contact_id === contact.id);
          if (!alreadyExists) {
            allRelations.unshift({
              id: `direct-${contact.id}`,
              contact_id: contact.id,
              client_id: clientId,
              role: null,
              is_primary: true,
              is_active: true,
              created_at: null,
              updated_at: null,
              contact: contact
            } as ClientContactRelationWithDetails);
          }
        }
      }

      setRelations(allRelations);
    } catch (err) {
      console.error('Error fetching client contacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  const addContactRelation = async (
    contactId: string,
    role?: string,
    isPrimary?: boolean
  ) => {
    if (!clientId) {
      throw new Error('Client ID is required');
    }

    try {
      // If setting as primary, unset other primary relations
      if (isPrimary) {
        await supabase
          .from('contact_client_relation')
          .update({ is_primary: false })
          .eq('client_id', clientId);
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
      console.error('Error adding contact relation:', err);
      throw err;
    }
  };

  const removeContactRelation = async (relationId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('contact_client_relation')
        .delete()
        .eq('id', relationId);

      if (deleteError) throw deleteError;
      await fetchRelations();
    } catch (err) {
      console.error('Error removing contact relation:', err);
      throw err;
    }
  };

  const setPrimaryContact = async (relationId: string) => {
    if (!clientId) {
      throw new Error('Client ID is required');
    }

    try {
      // Unset all primary flags for this client
      await supabase
        .from('contact_client_relation')
        .update({ is_primary: false })
        .eq('client_id', clientId);

      // Set new primary
      const { error: updateError } = await supabase
        .from('contact_client_relation')
        .update({ is_primary: true })
        .eq('id', relationId);

      if (updateError) throw updateError;
      await fetchRelations();
    } catch (err) {
      console.error('Error setting primary contact:', err);
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
    addContactRelation,
    removeContactRelation,
    setPrimaryContact,
    updateRelationRole
  };
};
