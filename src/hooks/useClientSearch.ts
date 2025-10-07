import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Client } from '../lib/types';

export interface ClientSearchResult {
  id: string;
  client_name: string;
  type: string | null;
  phone: string | null;
  deal_count: number;
  site_submit_count: number;
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

      // First, let's check if any clients match at all (regardless of active status) for debugging
      const { data: allMatchingClients, error: debugError } = await supabase
        .from('client')
        .select('id, client_name, is_active_client')
        .ilike('client_name', `%${query}%`)
        .limit(5);

      if (!debugError && allMatchingClients) {
        console.log(`🔍 Debug: Found ${allMatchingClients.length} clients matching "${query}" (any active status):`);
        allMatchingClients.forEach(c => {
          console.log(`  - "${c.client_name}": is_active_client = ${c.is_active_client}`);
        });
      }

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
        console.error('❌ Search error:', searchError);
        throw searchError;
      }

      if (!clients) {
        console.log('⚠️ No clients returned from query');
        return [];
      }

      console.log(`✅ Found ${clients.length} active clients matching "${query}"`);
      if (clients.length === 0) {
        console.log('💡 Tip: Make sure the client has is_active_client = true in the database');
      }

      // Get deal counts and site submit counts for each client
      const clientResults: ClientSearchResult[] = await Promise.all(
        clients.map(async (client) => {
          const { count: dealCount } = await supabase
            .from('deal')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id);

          // Count site submits with coordinates (either sf_property or verified)
          const { count: siteSubmitCount } = await supabase
            .from('site_submit')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id)
            .or('and(sf_property_latitude.not.is.null,sf_property_longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)');

          return {
            id: client.id,
            client_name: client.client_name || 'Unnamed Client',
            type: client.sf_client_type,
            phone: client.phone,
            deal_count: dealCount || 0,
            site_submit_count: siteSubmitCount || 0
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

      // Get deal counts and site submit counts for each client
      const clientResults: ClientSearchResult[] = await Promise.all(
        clients.map(async (client) => {
          const { count: dealCount } = await supabase
            .from('deal')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id);

          // Count site submits with coordinates (either sf_property or verified)
          const { count: siteSubmitCount } = await supabase
            .from('site_submit')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id)
            .or('and(sf_property_latitude.not.is.null,sf_property_longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)');

          return {
            id: client.id,
            client_name: client.client_name || 'Unnamed Client',
            type: client.sf_client_type,
            phone: client.phone,
            deal_count: dealCount || 0,
            site_submit_count: siteSubmitCount || 0
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