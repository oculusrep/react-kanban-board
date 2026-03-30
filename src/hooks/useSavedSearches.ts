import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { SavedSearch, FilterGroup, SortConfig } from '../types/advanced-search';

interface SaveSearchParams {
  name: string;
  description?: string;
  isPublic: boolean;
  filterGroups: FilterGroup[];
  columns: string[];
  sortConfig: SortConfig | null;
}

export function useSavedSearches() {
  const { user } = useAuth();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all saved searches (user's own + public)
  const fetchSavedSearches = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch saved searches with creator info
      const { data, error: fetchError } = await supabase
        .from('saved_search')
        .select(`
          *,
          created_by:created_by_id (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform to include created_by_name
      const searches: SavedSearch[] = (data || []).map(search => ({
        id: search.id,
        name: search.name,
        description: search.description,
        created_by_id: search.created_by_id,
        is_public: search.is_public,
        filter_groups: search.filter_groups as FilterGroup[],
        column_config: search.column_config as string[] | null,
        sort_config: search.sort_config as SortConfig | null,
        created_at: search.created_at,
        updated_at: search.updated_at,
        created_by_name: (search.created_by as { name?: string })?.name || 'Unknown',
      }));

      setSavedSearches(searches);
    } catch (err) {
      console.error('Error fetching saved searches:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch saved searches');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load searches on mount
  useEffect(() => {
    fetchSavedSearches();
  }, [fetchSavedSearches]);

  // Save a new search
  const saveSearch = useCallback(async (params: SaveSearchParams): Promise<SavedSearch | null> => {
    if (!user) return null;

    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('saved_search')
        .insert({
          name: params.name,
          description: params.description || null,
          is_public: params.isPublic,
          filter_groups: params.filterGroups,
          column_config: params.columns,
          sort_config: params.sortConfig,
          created_by_id: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Refresh the list
      await fetchSavedSearches();

      return data as SavedSearch;
    } catch (err) {
      console.error('Error saving search:', err);
      setError(err instanceof Error ? err.message : 'Failed to save search');
      return null;
    }
  }, [user, fetchSavedSearches]);

  // Update an existing search
  const updateSearch = useCallback(async (
    id: string,
    params: Partial<SaveSearchParams>
  ): Promise<boolean> => {
    if (!user) return false;

    setError(null);

    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (params.name !== undefined) updateData.name = params.name;
      if (params.description !== undefined) updateData.description = params.description;
      if (params.isPublic !== undefined) updateData.is_public = params.isPublic;
      if (params.filterGroups !== undefined) updateData.filter_groups = params.filterGroups;
      if (params.columns !== undefined) updateData.column_config = params.columns;
      if (params.sortConfig !== undefined) updateData.sort_config = params.sortConfig;

      const { error: updateError } = await supabase
        .from('saved_search')
        .update(updateData)
        .eq('id', id)
        .eq('created_by_id', user.id); // Only allow updating own searches

      if (updateError) throw updateError;

      // Refresh the list
      await fetchSavedSearches();

      return true;
    } catch (err) {
      console.error('Error updating search:', err);
      setError(err instanceof Error ? err.message : 'Failed to update search');
      return false;
    }
  }, [user, fetchSavedSearches]);

  // Delete a search
  const deleteSearch = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;

    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('saved_search')
        .delete()
        .eq('id', id)
        .eq('created_by_id', user.id); // Only allow deleting own searches

      if (deleteError) throw deleteError;

      // Refresh the list
      await fetchSavedSearches();

      return true;
    } catch (err) {
      console.error('Error deleting search:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete search');
      return false;
    }
  }, [user, fetchSavedSearches]);

  // Copy a search (create a new one based on existing)
  const copySearch = useCallback(async (
    searchId: string,
    newName: string
  ): Promise<SavedSearch | null> => {
    const sourcSearch = savedSearches.find(s => s.id === searchId);
    if (!sourcSearch) return null;

    return saveSearch({
      name: newName,
      description: sourcSearch.description || undefined,
      isPublic: false, // Copies are always private initially
      filterGroups: sourcSearch.filter_groups,
      columns: sourcSearch.column_config || [],
      sortConfig: sourcSearch.sort_config,
    });
  }, [savedSearches, saveSearch]);

  // Get a single search by ID
  const getSearch = useCallback((id: string): SavedSearch | undefined => {
    return savedSearches.find(s => s.id === id);
  }, [savedSearches]);

  // Get user's own searches
  const mySearches = savedSearches.filter(s => s.created_by_id === user?.id);

  // Get public searches from others
  const publicSearches = savedSearches.filter(s => s.is_public && s.created_by_id !== user?.id);

  return {
    savedSearches,
    mySearches,
    publicSearches,
    loading,
    error,
    saveSearch,
    updateSearch,
    deleteSearch,
    copySearch,
    getSearch,
    refreshSearches: fetchSavedSearches,
  };
}
