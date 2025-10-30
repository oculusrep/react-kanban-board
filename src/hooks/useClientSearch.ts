import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Client } from '../lib/types';
import { buildFuzzyOrQuery, sortByRelevance } from '../utils/searchUtils';

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

      // Search active clients with fuzzy matching
      const fuzzyQuery = buildFuzzyOrQuery(['client_name', 'sf_client_type'], query);
      const { data: clients, error: searchError } = await supabase
        .from('client')
        .select(`
          id,
          client_name,
          sf_client_type,
          phone
        `)
        .eq('is_active_client', true)
        .or(fuzzyQuery)
        .limit(30); // Fetch more for better fuzzy results

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

          // Count all site submits for this client
          // Note: Coordinate filtering happens in the map layer via getDisplayCoordinates()
          const { count: siteSubmitCount } = await supabase
            .from('site_submit')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id);

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

      // Sort by relevance and limit to top 10 results
      const sorted = sortByRelevance(clientResults, query, 'client_name');
      const topResults = sorted.slice(0, 10);

      console.log(`✅ Found ${clientResults.length} active clients, returning top ${topResults.length}`);
      return topResults;

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

          // Count all site submits for this client
          // Note: Coordinate filtering happens in the map layer via getDisplayCoordinates()
          const { count: siteSubmitCount } = await supabase
            .from('site_submit')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client.id);

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