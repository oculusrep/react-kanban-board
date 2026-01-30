import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

interface Client {
  id: string;
  client_name: string;
  logo_url: string | null;
}

interface PortalContextType {
  // Client access
  accessibleClients: Client[];
  selectedClientId: string | null;
  selectedClient: Client | null;
  setSelectedClientId: (clientId: string | null) => void;

  // User info
  isInternalUser: boolean;
  contactId: string | null;

  // Loading states
  loading: boolean;
  error: string | null;

  // Refresh function
  refreshClients: () => Promise<void>;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

interface PortalProviderProps {
  children: ReactNode;
}

export function PortalProvider({ children }: PortalProviderProps) {
  const { user, userRole } = useAuth();
  const [accessibleClients, setAccessibleClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isInternalUser = userRole ? ['admin', 'broker_full', 'broker_limited', 'assistant'].includes(userRole) : false;

  const selectedClient = accessibleClients.find(c => c.id === selectedClientId) || null;

  // Fetch accessible clients
  const refreshClients = async () => {
    if (!user) {
      setAccessibleClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isInternalUser) {
        // Internal users can see all active clients
        const { data, error: fetchError } = await supabase
          .from('client')
          .select('id, client_name, logo_url')
          .eq('is_active_client', true)
          .order('client_name');

        if (fetchError) throw fetchError;

        setAccessibleClients(data || []);
      } else {
        // Portal users - find their contact and get accessible clients
        const { data: contactData, error: contactError } = await supabase
          .from('contact')
          .select('id')
          .ilike('email', user.email || '')
          .eq('portal_access_enabled', true)
          .single();

        if (contactError || !contactData) {
          setError('Portal access not configured');
          setAccessibleClients([]);
          setLoading(false);
          return;
        }

        setContactId(contactData.id);

        // Get clients this contact has access to
        const { data: accessData, error: accessError } = await supabase
          .from('portal_user_client_access')
          .select(`
            client_id,
            client:client_id (
              id,
              client_name,
              logo_url
            )
          `)
          .eq('contact_id', contactData.id)
          .eq('is_active', true);

        if (accessError) throw accessError;

        const clients = (accessData || [])
          .map(a => a.client as unknown as Client)
          .filter(c => c !== null);

        setAccessibleClients(clients);

        // Auto-select if only one client
        if (clients.length === 1 && !selectedClientId) {
          setSelectedClientId(clients[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching portal clients:', err);
      setError('Failed to load client access');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    refreshClients();
  }, [user, userRole]);

  const value: PortalContextType = {
    accessibleClients,
    selectedClientId,
    selectedClient,
    setSelectedClientId,
    isInternalUser,
    contactId,
    loading,
    error,
    refreshClients,
  };

  return (
    <PortalContext.Provider value={value}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (context === undefined) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return context;
}
