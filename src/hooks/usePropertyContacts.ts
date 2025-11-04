import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];
type Client = Database['public']['Tables']['client']['Row'];

export interface PropertyContactWithDetails extends Contact {
  client?: Client;
  isPrimaryContact?: boolean;
  fromDeal?: boolean;
}

interface UsePropertyContactsOptions {
  propertyId: string;
  enabled?: boolean; // Allow conditional fetching
}

/**
 * Custom hook to fetch contacts associated with a property
 *
 * Fetches contacts from:
 * 1. property_contact junction table
 * 2. property.contact_id (primary contact, legacy support)
 *
 * @param options - Hook configuration
 * @returns Contact data, loading state, error state, and refresh function
 */
export function usePropertyContacts({ propertyId, enabled = true }: UsePropertyContactsOptions) {
  const [contacts, setContacts] = useState<PropertyContactWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {

    if (!propertyId || !enabled) {
      setContacts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get contacts through the property_contact junction table
      const { data: propertyContacts, error: junctionError } = await supabase
        .from('property_contact')
        .select(`
          *,
          contact!property_contact_contact_id_fkey (
            *,
            client:client_id (
              id,
              client_name,
              phone
            )
          )
        `)
        .eq('property_id', propertyId);

      if (junctionError) throw junctionError;

      const allContacts: PropertyContactWithDetails[] = [];

      // Process junction table contacts
      if (propertyContacts) {
        propertyContacts.forEach((pc: any) => {
          if (pc.contact) {
            allContacts.push({
              ...pc.contact,
              client: pc.contact.client || undefined,
              isPrimaryContact: false,
              fromDeal: false,
            });
          }
        });
      }

      // Also check for the property's primary contact (legacy support)
      const { data: property, error: propertyError } = await supabase
        .from('property')
        .select('contact_id')
        .eq('id', propertyId)
        .single();

      if (!propertyError && property?.contact_id) {
        // Mark the primary contact if it exists in our list
        const primaryContactIndex = allContacts.findIndex(c => c.id === property.contact_id);
        if (primaryContactIndex >= 0) {
          allContacts[primaryContactIndex].isPrimaryContact = true;
        } else {
          // If primary contact not in junction table, fetch it separately
          const { data: primaryContact, error: contactError } = await supabase
            .from('contact')
            .select(`
              *,
              client:client_id (
                id,
                client_name,
                phone
              )
            `)
            .eq('id', property.contact_id)
            .single();

          if (!contactError && primaryContact) {
            allContacts.unshift({
              ...primaryContact,
              isPrimaryContact: true,
              fromDeal: false,
            });
          }
        }
      }

      setContacts(allContacts);
    } catch (err) {
      console.error('usePropertyContacts: Error fetching contacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [propertyId, enabled]);

  useEffect(() => {
    fetchContacts();
  }, [propertyId, enabled, fetchContacts]);

  return {
    contacts,
    loading,
    error,
    refetch: fetchContacts,
  };
}
