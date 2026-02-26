import { supabase } from '../lib/supabaseClient';
import { mapLayerService, type MapLayer, type CreateLayerInput } from './mapLayerService';
import type {
  PlacesSearchResult,
  SavedQuery,
  PlacesSearchConfig,
  StatusFilter,
  GeographyType,
  GeographyData,
} from './googlePlacesSearchService';

// ============================================================================
// Types
// ============================================================================

export interface CreateSavedQueryInput {
  name: string;
  queryType: 'text' | 'nearby';
  searchTerm: string;
  statusFilter: StatusFilter;
  geographyType: GeographyType;
  geographyData: GeographyData;
  gridSizeMeters?: number;
}

export interface StoredPlaceResult {
  id: string;
  place_id: string;
  query_id: string | null;
  layer_id: string | null;
  name: string;
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  business_status: string;
  types: string[] | null;
  rating: number | null;
  user_ratings_total: number | null;
  phone_number: string | null;
  website: string | null;
  raw_data: any;
  property_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

// ============================================================================
// Service Class
// ============================================================================

class ClosedPlacesLayerService {
  // --------------------------------------------------------------------------
  // Saved Queries CRUD
  // --------------------------------------------------------------------------

  /**
   * Create a new saved query
   */
  async createSavedQuery(input: CreateSavedQueryInput): Promise<SavedQuery> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    const { data, error } = await supabase
      .from('google_places_saved_query')
      .insert({
        name: input.name,
        query_type: input.queryType,
        search_term: input.searchTerm,
        status_filter: input.statusFilter,
        geography_type: input.geographyType,
        geography_data: input.geographyData,
        grid_size_meters: input.gridSizeMeters || 50000,
        created_by_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating saved query:', error);
      throw error;
    }

    return data as SavedQuery;
  }

  /**
   * Get all saved queries
   */
  async getSavedQueries(): Promise<SavedQuery[]> {
    const { data, error } = await supabase
      .from('google_places_saved_query')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting saved queries:', error);
      throw error;
    }

    return (data || []) as SavedQuery[];
  }

  /**
   * Get a single saved query by ID
   */
  async getSavedQuery(id: string): Promise<SavedQuery | null> {
    const { data, error } = await supabase
      .from('google_places_saved_query')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('Error getting saved query:', error);
      throw error;
    }

    return data as SavedQuery;
  }

  /**
   * Update a saved query
   */
  async updateSavedQuery(
    id: string,
    updates: Partial<CreateSavedQueryInput> & { last_run_at?: string; result_count?: number; layer_id?: string }
  ): Promise<SavedQuery> {
    const { data, error } = await supabase
      .from('google_places_saved_query')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating saved query:', error);
      throw error;
    }

    return data as SavedQuery;
  }

  /**
   * Delete a saved query
   */
  async deleteSavedQuery(id: string): Promise<void> {
    const { error } = await supabase
      .from('google_places_saved_query')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting saved query:', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Results Management
  // --------------------------------------------------------------------------

  /**
   * Store search results in the database
   */
  async storeResults(
    results: PlacesSearchResult[],
    queryId?: string,
    layerId?: string
  ): Promise<StoredPlaceResult[]> {
    if (results.length === 0) return [];

    const now = new Date().toISOString();

    // Prepare records for upsert
    const records = results.map(result => ({
      place_id: result.place_id,
      query_id: queryId || null,
      layer_id: layerId || null,
      name: result.name,
      formatted_address: result.formatted_address,
      latitude: result.latitude,
      longitude: result.longitude,
      business_status: result.business_status,
      types: result.types,
      rating: result.rating || null,
      user_ratings_total: result.user_ratings_total || null,
      phone_number: result.phone_number || null,
      website: result.website || null,
      raw_data: result.raw_data || null,
      last_seen_at: now,
    }));

    // Use upsert to handle duplicates (same place_id + layer_id)
    const { data, error } = await supabase
      .from('google_places_result')
      .upsert(records, {
        onConflict: 'place_id,layer_id',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error('Error storing results:', error);
      throw error;
    }

    return (data || []) as StoredPlaceResult[];
  }

  /**
   * Get stored results for a layer
   */
  async getResultsForLayer(layerId: string): Promise<StoredPlaceResult[]> {
    const { data, error } = await supabase
      .from('google_places_result')
      .select('*')
      .eq('layer_id', layerId)
      .order('name');

    if (error) {
      console.error('Error getting results for layer:', error);
      throw error;
    }

    return (data || []) as StoredPlaceResult[];
  }

  /**
   * Get stored results for a query
   */
  async getResultsForQuery(queryId: string): Promise<StoredPlaceResult[]> {
    const { data, error } = await supabase
      .from('google_places_result')
      .select('*')
      .eq('query_id', queryId)
      .order('name');

    if (error) {
      console.error('Error getting results for query:', error);
      throw error;
    }

    return (data || []) as StoredPlaceResult[];
  }

  // --------------------------------------------------------------------------
  // Layer Integration
  // --------------------------------------------------------------------------

  /**
   * Save search results as a new map layer
   */
  async saveResultsAsLayer(
    results: PlacesSearchResult[],
    layerName: string,
    queryId?: string,
    color: string = '#DC2626' // Default red for closed businesses
  ): Promise<MapLayer> {
    // Create the layer
    const layer = await mapLayerService.createLayer({
      name: layerName,
      description: `Closed business search results (${results.length} places)`,
      layer_type: 'custom',
      default_color: color,
      default_opacity: 0.8,
      default_stroke_width: 2,
    });

    // Store results with layer reference
    await this.storeResults(results, queryId, layer.id);

    // Update saved query with layer reference if provided
    if (queryId) {
      await this.updateSavedQuery(queryId, {
        layer_id: layer.id,
        last_run_at: new Date().toISOString(),
        result_count: results.length,
      });
    }

    // Create map shapes for each result (as points/small circles)
    for (const result of results) {
      await mapLayerService.createShape({
        layer_id: layer.id,
        name: result.name,
        shape_type: 'circle',
        geometry: {
          type: 'circle',
          center: [result.latitude, result.longitude],
          radius: 50, // 50 meter radius for visibility
        },
        color: result.business_status === 'CLOSED_PERMANENTLY' ? '#DC2626' : '#F59E0B',
        description: `${result.formatted_address}\nStatus: ${result.business_status}`,
      });
    }

    return layer;
  }

  /**
   * Update an existing layer with new results
   */
  async updateLayerWithResults(
    layerId: string,
    results: PlacesSearchResult[],
    queryId?: string
  ): Promise<MapLayer> {
    // Get current layer
    const layer = await mapLayerService.getLayer(layerId, true);
    if (!layer) {
      throw new Error('Layer not found');
    }

    // Delete existing shapes
    if (layer.shapes) {
      for (const shape of layer.shapes) {
        await mapLayerService.deleteShape(shape.id);
      }
    }

    // Delete existing results for this layer
    await supabase
      .from('google_places_result')
      .delete()
      .eq('layer_id', layerId);

    // Store new results
    await this.storeResults(results, queryId, layerId);

    // Create new shapes
    for (const result of results) {
      await mapLayerService.createShape({
        layer_id: layerId,
        name: result.name,
        shape_type: 'circle',
        geometry: {
          type: 'circle',
          center: [result.latitude, result.longitude],
          radius: 50,
        },
        color: result.business_status === 'CLOSED_PERMANENTLY' ? '#DC2626' : '#F59E0B',
        description: `${result.formatted_address}\nStatus: ${result.business_status}`,
      });
    }

    // Update layer description
    await mapLayerService.updateLayer(layerId, {
      description: `Closed business search results (${results.length} places) - Updated ${new Date().toLocaleDateString()}`,
    });

    // Update saved query if provided
    if (queryId) {
      await this.updateSavedQuery(queryId, {
        last_run_at: new Date().toISOString(),
        result_count: results.length,
      });
    }

    return (await mapLayerService.getLayer(layerId, true))!;
  }

  // --------------------------------------------------------------------------
  // Property Integration
  // --------------------------------------------------------------------------

  /**
   * Link a place result to a property
   */
  async linkResultToProperty(resultId: string, propertyId: string): Promise<void> {
    const { error } = await supabase
      .from('google_places_result')
      .update({ property_id: propertyId })
      .eq('id', resultId);

    if (error) {
      console.error('Error linking result to property:', error);
      throw error;
    }
  }

  /**
   * Get results that have been added to properties
   */
  async getResultsWithProperties(): Promise<StoredPlaceResult[]> {
    const { data, error } = await supabase
      .from('google_places_result')
      .select('*')
      .not('property_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting results with properties:', error);
      throw error;
    }

    return (data || []) as StoredPlaceResult[];
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Convert stored result back to PlacesSearchResult format
   */
  storedToSearchResult(stored: StoredPlaceResult): PlacesSearchResult {
    return {
      place_id: stored.place_id,
      name: stored.name,
      formatted_address: stored.formatted_address || '',
      latitude: stored.latitude,
      longitude: stored.longitude,
      business_status: stored.business_status as PlacesSearchResult['business_status'],
      types: stored.types || [],
      rating: stored.rating || undefined,
      user_ratings_total: stored.user_ratings_total || undefined,
      phone_number: stored.phone_number || undefined,
      website: stored.website || undefined,
    };
  }

  /**
   * Get search config from a saved query
   */
  queryToConfig(query: SavedQuery): PlacesSearchConfig {
    return {
      queryType: query.query_type,
      searchTerm: query.search_term,
      statusFilter: query.status_filter,
      geographyType: query.geography_type,
      geographyData: query.geography_data,
      gridSizeMeters: query.grid_size_meters,
    };
  }
}

// Export singleton instance
export const closedPlacesLayerService = new ClosedPlacesLayerService();
export default closedPlacesLayerService;
