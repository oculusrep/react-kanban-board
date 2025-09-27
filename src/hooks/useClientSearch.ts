import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Client } from '../lib/types';

export interface ClientSearchResult {
  id: string;
  client_name: string;
  type: string | null;
  phone: string | null;
  deal_count: number;
}

export const useClientSearch = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchActiveClients = useCallback(async (query: string): Promise<ClientSearchResult[]> => {
    if (!query || query.trim().length < 2) {
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`🔍 Searching active clients for: "${query}"`);

      // Search active clients with deal counts
      const { data: clients, error: searchError } = await supabase
        .from('client')
        .select(`
          id,
          client_name,
          sf_client_type,
          phone
        `)
        .eq('is_active_client', true)
        .ilike('client_name', `%${query}%`)
        .order('client_name')
        .limit(10);

      if (searchError) {
        throw searchError;
      }

      if (!clients) {
        return [];
      }

      // Get deal counts for each client
      const clientResults: ClientSearchResult[] = await Promise.all(
        clients.map(async (client) => {
          const { count } = await supabase
            .from('deal')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id);

          return {
            id: client.id,
            client_name: client.client_name || 'Unnamed Client',
            type: client.sf_client_type,
            phone: client.phone,
            deal_count: count || 0
          };
        })
      );

      console.log(`✅ Found ${clientResults.length} active clients`);
      return clientResults;

    } catch (err) {
      console.error('❌ Client search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAllActiveClients = useCallback(async (): Promise<ClientSearchResult[]> => {
    setLoading(true);
    setError(null);

    try {
      console.log('📋 Fetching all active clients...');

      const { data: clients, error: fetchError } = await supabase
        .from('client')
        .select(`
          id,
          client_name,
          sf_client_type,
          phone
        `)
        .eq('is_active_client', true)
        .order('client_name')
        .limit(50); // Reasonable limit for dropdown

      if (fetchError) {
        throw fetchError;
      }

      if (!clients) {
        return [];
      }

      // Get deal counts for each client
      const clientResults: ClientSearchResult[] = await Promise.all(
        clients.map(async (client) => {
          const { count } = await supabase
            .from('deal')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id);

          return {
            id: client.id,
            client_name: client.client_name || 'Unnamed Client',
            type: client.sf_client_type,
            phone: client.phone,
            deal_count: count || 0
          };
        })
      );

      console.log(`✅ Loaded ${clientResults.length} active clients`);
      return clientResults;

    } catch (err) {
      console.error('❌ Client fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load clients');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    searchActiveClients,
    getAllActiveClients,
    loading,
    error
  };
};