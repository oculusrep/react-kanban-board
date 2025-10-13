import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface AssignmentSearchResult {
  id: string;
  assignment_name: string;
  client_id: string | null;
  client_name?: string | null;
  assignment_value: number | null;
  due_date: string | null;
  progress: string | null;
}

export const useAssignmentSearch = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchAssignments = useCallback(async (query: string, clientId?: string | null): Promise<AssignmentSearchResult[]> => {
    if (!query || query.trim().length < 2) {
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`🔍 Searching assignments for: "${query}"${clientId ? ` (client: ${clientId})` : ''}`);

      // Search assignments without nested joins
      let queryBuilder = supabase
        .from('assignment')
        .select(`
          id,
          assignment_name,
          client_id,
          assignment_value,
          due_date,
          progress
        `)
        .ilike('assignment_name', `%${query}%`);

      // Filter by client if provided
      if (clientId) {
        queryBuilder = queryBuilder.eq('client_id', clientId);
      }

      const { data: assignments, error: searchError } = await queryBuilder
        .order('assignment_name')
        .limit(10);

      if (searchError) {
        console.error('❌ Search error:', searchError);
        throw searchError;
      }

      if (!assignments) {
        console.log('⚠️ No assignments returned from query');
        return [];
      }

      console.log(`✅ Found ${assignments.length} assignments matching "${query}"`);

      // Fetch client names separately
      const clientIds = [...new Set(assignments.map(a => a.client_id).filter(Boolean))];
      const clientsMap = new Map();

      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('client')
          .select('id, client_name')
          .in('id', clientIds);

        clients?.forEach(c => clientsMap.set(c.id, c));
      }

      // Map to result format
      const assignmentResults: AssignmentSearchResult[] = assignments.map((assignment: any) => {
        const client = assignment.client_id ? clientsMap.get(assignment.client_id) : null;
        return {
          id: assignment.id,
          assignment_name: assignment.assignment_name || 'Unnamed Assignment',
          client_id: assignment.client_id,
          client_name: client?.client_name || null,
          assignment_value: assignment.assignment_value,
          due_date: assignment.due_date,
          progress: assignment.progress
        };
      });

      return assignmentResults;

    } catch (err) {
      console.error('❌ Assignment search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getAllAssignments = useCallback(async (clientId?: string | null, limit: number = 50): Promise<AssignmentSearchResult[]> => {
    setLoading(true);
    setError(null);

    try {
      console.log(`📋 Fetching all assignments...${clientId ? ` (client: ${clientId})` : ''}`);

      let queryBuilder = supabase
        .from('assignment')
        .select(`
          id,
          assignment_name,
          client_id,
          assignment_value,
          due_date,
          progress
        `);

      // Filter by client if provided
      if (clientId) {
        queryBuilder = queryBuilder.eq('client_id', clientId);
      }

      const { data: assignments, error: fetchError } = await queryBuilder
        .order('assignment_name')
        .limit(limit);

      if (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        throw fetchError;
      }

      if (!assignments) {
        console.log('⚠️ No assignments returned');
        return [];
      }

      console.log(`✅ Found ${assignments.length} assignments`);

      // Fetch client names separately
      const clientIds = [...new Set(assignments.map(a => a.client_id).filter(Boolean))];
      const clientsMap = new Map();

      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from('client')
          .select('id, client_name')
          .in('id', clientIds);

        clients?.forEach(c => clientsMap.set(c.id, c));
      }

      // Map to result format
      const assignmentResults: AssignmentSearchResult[] = assignments.map((assignment: any) => {
        const client = assignment.client_id ? clientsMap.get(assignment.client_id) : null;
        return {
          id: assignment.id,
          assignment_name: assignment.assignment_name || 'Unnamed Assignment',
          client_id: assignment.client_id,
          client_name: client?.client_name || null,
          assignment_value: assignment.assignment_value,
          due_date: assignment.due_date,
          progress: assignment.progress
        };
      });

      console.log(`✅ Loaded ${assignmentResults.length} assignments`);
      return assignmentResults;

    } catch (err) {
      console.error('❌ Assignment fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    searchAssignments,
    getAllAssignments,
    loading,
    error
  };
};
