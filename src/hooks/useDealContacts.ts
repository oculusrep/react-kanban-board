// hooks/useDealContacts.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface DealContact {
  id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  role_label: string;
  primary_contact: boolean;
  contact_id: string | null;
}

export const useDealContacts = (dealId: string | null) => {
  const [contacts, setContacts] = useState<DealContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContacts = async () => {
      if (!dealId) {
        setContacts([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch deal contacts with separate queries to avoid TypeScript issues
        const { data: dealContactData, error: dealContactError } = await supabase
          .from('deal_contact')
          .select('id, contact_id, role_id, primary_contact')
          .eq('deal_id', dealId);

        if (dealContactError) throw dealContactError;

        if (!dealContactData || dealContactData.length === 0) {
          setContacts([]);
          setLoading(false);
          return;
        }

        // Get unique contact IDs and role IDs
        const contactIds = [...new Set(dealContactData.map(dc => dc.contact_id).filter(Boolean))];
        const roleIds = [...new Set(dealContactData.map(dc => dc.role_id).filter(Boolean))];

        // Fetch contacts
        const { data: contactData, error: contactError } = await supabase
          .from('contact')
          .select('id, first_name, last_name, email, phone')
          .in('id', contactIds);

        if (contactError) throw contactError;

        // Fetch roles
        const { data: roleData, error: roleError } = await supabase
          .from('contact_role')
          .select('role_id, label')
          .in('role_id', roleIds);

        if (roleError) throw roleError;

        // Create lookup maps
        const contactMap = new Map();
        contactData?.forEach(contact => {
          contactMap.set(contact.id, contact);
        });

        const roleMap = new Map();
        roleData?.forEach(role => {
          roleMap.set(role.role_id, role);
        });

        // Combine the data
        const combinedContacts: DealContact[] = dealContactData.map(dealContact => {
          const contact = contactMap.get(dealContact.contact_id);
          const role = roleMap.get(dealContact.role_id);

          let contactName = 'Unknown Contact';
          if (contact) {
            const firstName = contact.first_name || '';
            const lastName = contact.last_name || '';
            if (firstName && lastName) {
              contactName = `${firstName} ${lastName}`;
            } else if (firstName) {
              contactName = firstName;
            } else if (lastName) {
              contactName = lastName;
            }
          }

          return {
            id: dealContact.id,
            contact_name: contactName,
            contact_email: contact?.email || null,
            contact_phone: contact?.phone || null,
            role_label: role?.label || 'No Role',
            primary_contact: dealContact.primary_contact || false,
            contact_id: dealContact.contact_id,
          };
        });

        // Sort by primary first, then by role
        combinedContacts.sort((a, b) => {
          if (a.primary_contact && !b.primary_contact) return -1;
          if (!a.primary_contact && b.primary_contact) return 1;
          return a.role_label.localeCompare(b.role_label);
        });

        setContacts(combinedContacts);

      } catch (err) {
        console.error('Error fetching deal contacts:', err);
        setError('Failed to load contacts');
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [dealId]);

  return { contacts, loading, error, refetch: () => {
    if (dealId) {
      setLoading(true);
      // The useEffect will trigger a refetch
    }
  }};
};