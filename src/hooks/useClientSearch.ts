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
  /**
   * Set only on synthetic "All accounts" entries (see withFamilyEntries): the
   * root account plus every descendant. Its `id` is `family:<rootId>` and is
   * NOT a client id — use getClientIds() to filter.
   */
  family_clients?: { id: string; client_name: string }[];
}

/** Real client ids a selection covers: the whole family for an "All" entry. */
export const getClientIds = (client: ClientSearchResult): string[] =>
  client.family_clients?.length ? client.family_clients.map(c => c.id) : [client.id];

const MAX_FAMILY_DEPTH = 5;

/**
 * For every result that belongs to a parent/child account family (e.g.
 * Starbucks + "Starbucks - JW (Coastal GA)"), insert one "<Root> (All
 * accounts)" entry ahead of the family's first result, so the whole family
 * can be selected at once. Results that aren't in a family pass through.
 */
export async function withFamilyEntries(results: ClientSearchResult[]): Promise<ClientSearchResult[]> {
  const real = results.filter(r => !r.family_clients);
  if (real.length === 0) return results;

  try {
    // Walk each match up to its root account.
    const known = new Map<string, { client_name: string; parent_id: string | null }>();
    let pending = real.map(r => r.id);
    for (let depth = 0; pending.length > 0 && depth < MAX_FAMILY_DEPTH; depth++) {
      const { data, error } = await supabase
        .from('client')
        .select('id, client_name, parent_id')
        .in('id', pending);
      if (error) throw error;
      (data || []).forEach(c => known.set(c.id, { client_name: c.client_name || 'Unnamed Client', parent_id: c.parent_id }));
      pending = [...new Set((data || []).map(c => c.parent_id).filter((id): id is string => !!id && !known.has(id)))];
    }
    const rootOf = (id: string): string => {
      let cur = id;
      for (let i = 0; i < MAX_FAMILY_DEPTH; i++) {
        const parent = known.get(cur)?.parent_id;
        if (!parent || !known.has(parent)) return cur;
        cur = parent;
      }
      return cur;
    };
    const roots = [...new Set(real.map(r => rootOf(r.id)))];

    // Walk each root down to all of its descendants.
    const members = new Map<string, { id: string; client_name: string }[]>(
      roots.map(root => [root, [{ id: root, client_name: known.get(root)?.client_name || 'Unnamed Client' }]])
    );
    const rootByClient = new Map<string, string>(roots.map(r => [r, r]));
    let frontier = roots;
    for (let depth = 0; frontier.length > 0 && depth < MAX_FAMILY_DEPTH; depth++) {
      const { data, error } = await supabase
        .from('client')
        .select('id, client_name, parent_id')
        .in('parent_id', frontier)
        .order('client_name');
      if (error) throw error;
      const next: string[] = [];
      (data || []).forEach(c => {
        const root = rootByClient.get(c.parent_id as string);
        if (!root || rootByClient.has(c.id)) return;
        rootByClient.set(c.id, root);
        members.get(root)!.push({ id: c.id, client_name: c.client_name || 'Unnamed Client' });
        next.push(c.id);
      });
      frontier = next;
    }

    const familyEntries = new Map<string, ClientSearchResult>();
    await Promise.all(
      roots
        .filter(root => (members.get(root)?.length ?? 0) > 1)
        .map(async root => {
          const family = members.get(root)!;
          const ids = family.map(c => c.id);
          const [{ count: dealCount }, { count: siteSubmitCount }] = await Promise.all([
            supabase.from('deal').select('*', { count: 'exact', head: true }).in('client_id', ids),
            supabase.from('site_submit').select('*', { count: 'exact', head: true }).in('client_id', ids),
          ]);
          familyEntries.set(root, {
            id: `family:${root}`,
            client_name: `${family[0].client_name} (All accounts)`,
            type: `${family.length} accounts`,
            phone: null,
            deal_count: dealCount || 0,
            site_submit_count: siteSubmitCount || 0,
            family_clients: family,
          });
        })
    );
    if (familyEntries.size === 0) return results;

    const out: ClientSearchResult[] = [];
    const emitted = new Set<string>();
    results.forEach(r => {
      const root = r.family_clients ? null : rootOf(r.id);
      const entry = root ? familyEntries.get(root) : undefined;
      if (root && entry && !emitted.has(root)) {
        out.push(entry);
        emitted.add(root);
      }
      out.push(r);
    });
    return out;
  } catch (err) {
    console.error('❌ Client family lookup failed:', err);
    return results;
  }
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