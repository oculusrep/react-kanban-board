import { supabase } from '../lib/supabaseClient';
import { STATE_FIPS, US_STATES } from './boundaryService';

// ============================================================================
// Types
// ============================================================================

export interface PlacesSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  business_status: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  types: string[];
  rating?: number;
  user_ratings_total?: number;
  phone_number?: string;
  website?: string;
  raw_data?: google.maps.places.PlaceResult;
}

export type StatusFilter = 'permanently_closed' | 'temporarily_closed' | 'both';
export type GeographyType = 'state' | 'county' | 'city' | 'zip' | 'radius' | 'polygon';

export interface GeographyData {
  // For state
  state?: string; // State abbreviation like 'GA'
  // For radius search
  lat?: number;
  lng?: number;
  radius?: number; // in meters
  // For polygon
  polygon?: [number, number][]; // [lat, lng] pairs
  // For city/zip
  city?: string;
  zip?: string;
}

export interface PlacesSearchConfig {
  queryType: 'text' | 'nearby';
  searchTerm: string;
  statusFilter: StatusFilter;
  geographyType: GeographyType;
  geographyData: GeographyData;
  gridSizeMeters?: number;
}

export interface ApiUsageStats {
  usedCents: number;
  limitCents: number;
  remainingCents: number;
  usedRequests: number;
  warnAtPercent: number;
  isOverBudget: boolean;
  isNearBudget: boolean;
}

export interface SavedQuery {
  id: string;
  name: string;
  query_type: 'text' | 'nearby';
  search_term: string;
  status_filter: StatusFilter;
  geography_type: GeographyType;
  geography_data: GeographyData;
  grid_size_meters: number;
  last_run_at: string | null;
  result_count: number;
  layer_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
}

// State bounding boxes for grid calculation (approximate)
// Format: { north, south, east, west }
const STATE_BOUNDS: Record<string, { north: number; south: number; east: number; west: number }> = {
  'GA': { north: 35.0, south: 30.35, east: -80.84, west: -85.61 },
  'FL': { north: 31.0, south: 24.4, east: -80.03, west: -87.63 },
  'AL': { north: 35.0, south: 30.14, east: -84.89, west: -88.47 },
  'SC': { north: 35.21, south: 32.03, east: -78.54, west: -83.35 },
  'NC': { north: 36.59, south: 33.84, east: -75.46, west: -84.32 },
  'TN': { north: 36.68, south: 34.98, east: -81.65, west: -90.31 },
  // Add more states as needed
};

// Cost estimates in cents per request (Google Places API pricing)
const COST_PER_REQUEST_CENTS = 2; // ~$0.017 per request, rounded up

// ============================================================================
// Service Class
// ============================================================================

class GooglePlacesSearchService {
  // Rate limiting
  private readonly RATE_LIMIT_MS = 100; // 10 requests per second max
  private lastRequest = 0;

  // PlacesService instance (set when searching)
  private placesService: google.maps.places.PlacesService | null = null;

  /**
   * Rate limiter utility
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
      const waitTime = this.RATE_LIMIT_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequest = Date.now();
  }

  /**
   * Initialize PlacesService with a map or div element
   */
  initPlacesService(mapOrDiv: google.maps.Map | HTMLDivElement): void {
    this.placesService = new google.maps.places.PlacesService(mapOrDiv);
  }

  // --------------------------------------------------------------------------
  // Budget & Usage Tracking
  // --------------------------------------------------------------------------

  /**
   * Get current API usage stats for the month
   */
  async getApiUsageStats(): Promise<ApiUsageStats> {
    // Get budget settings
    const { data: settings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'google_places_api_budget')
      .single();

    const budgetConfig = settings?.value || { monthly_budget_cents: 20000, warn_at_percent: 80 };
    const limitCents = budgetConfig.monthly_budget_cents;
    const warnAtPercent = budgetConfig.warn_at_percent;

    // Get current month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: logs } = await supabase
      .from('google_places_api_log')
      .select('estimated_cost_cents, request_count')
      .gte('created_at', startOfMonth.toISOString());

    const usedCents = logs?.reduce((sum, log) => sum + (log.estimated_cost_cents || 0), 0) || 0;
    const usedRequests = logs?.reduce((sum, log) => sum + (log.request_count || 0), 0) || 0;
    const remainingCents = Math.max(0, limitCents - usedCents);
    const usagePercent = (usedCents / limitCents) * 100;

    return {
      usedCents,
      limitCents,
      remainingCents,
      usedRequests,
      warnAtPercent,
      isOverBudget: usedCents >= limitCents,
      isNearBudget: usagePercent >= warnAtPercent,
    };
  }

  /**
   * Check if we have budget for a given number of API calls
   */
  async checkBudgetAvailable(estimatedCalls: number): Promise<{ available: boolean; stats: ApiUsageStats }> {
    const stats = await this.getApiUsageStats();
    const estimatedCost = estimatedCalls * COST_PER_REQUEST_CENTS;
    const available = stats.remainingCents >= estimatedCost;
    return { available, stats };
  }

  /**
   * Log an API request for usage tracking
   */
  async logApiUsage(
    requestType: string,
    apiEndpoint: string,
    requestCount: number = 1,
    resultsCount: number = 0,
    responseStatus: string = 'OK',
    queryId?: string
  ): Promise<void> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    await supabase.from('google_places_api_log').insert({
      request_type: requestType,
      api_endpoint: apiEndpoint,
      request_count: requestCount,
      estimated_cost_cents: requestCount * COST_PER_REQUEST_CENTS,
      results_count: resultsCount,
      response_status: responseStatus,
      query_id: queryId || null,
      created_by_id: userId,
    });
  }

  // --------------------------------------------------------------------------
  // Text Search (for chain names)
  // --------------------------------------------------------------------------

  /**
   * Perform a Text Search for a business name within bounds
   * Best for searching chain names like "Del Taco"
   */
  async textSearch(
    query: string,
    bounds: google.maps.LatLngBounds,
    queryId?: string
  ): Promise<PlacesSearchResult[]> {
    if (!this.placesService) {
      throw new Error('PlacesService not initialized. Call initPlacesService first.');
    }

    const allResults: PlacesSearchResult[] = [];
    let pageToken: string | undefined;
    let requestCount = 0;

    do {
      await this.waitForRateLimit();
      requestCount++;

      const results = await new Promise<{
        results: google.maps.places.PlaceResult[];
        nextPageToken?: string;
      }>((resolve, reject) => {
        const request: google.maps.places.TextSearchRequest = {
          query: query,
          bounds: bounds,
        };

        this.placesService!.textSearch(request, (results, status, pagination) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            resolve({
              results,
              nextPageToken: pagination?.hasNextPage ? 'has_more' : undefined,
            });
            // Store pagination for next page fetch
            if (pagination?.hasNextPage) {
              pageToken = 'pending';
              // Wait a bit then fetch next page
              setTimeout(() => {
                pagination.nextPage();
              }, 2000);
            } else {
              pageToken = undefined;
            }
          } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve({ results: [] });
          } else {
            reject(new Error(`Places API error: ${status}`));
          }
        });
      });

      // Convert to our format
      for (const place of results.results) {
        if (place.place_id && place.geometry?.location) {
          allResults.push(this.convertPlaceResult(place));
        }
      }

      // Only continue if we had a next page token
      if (!results.nextPageToken) {
        pageToken = undefined;
      }
    } while (pageToken && requestCount < 3); // Max 3 pages (60 results)

    // Log API usage
    await this.logApiUsage(
      'text_search',
      'textSearch',
      requestCount,
      allResults.length,
      'OK',
      queryId
    );

    return this.deduplicateResults(allResults);
  }

  /**
   * Search for closed businesses in a state using Text Search
   * Uses multiple search strategies to find closed businesses
   */
  async searchClosedInState(
    searchTerm: string,
    stateAbbr: string,
    statusFilter: StatusFilter,
    queryId?: string
  ): Promise<PlacesSearchResult[]> {
    // Get state bounds
    const bounds = this.getStateBounds(stateAbbr);
    if (!bounds) {
      throw new Error(`Unknown state: ${stateAbbr}`);
    }

    const stateName = US_STATES.find(s => s.abbr === stateAbbr)?.name || stateAbbr;
    const allResults: PlacesSearchResult[] = [];

    // Strategy 1: Search with just the business name + state
    // This finds currently operational locations that Google knows about
    const query1 = `${searchTerm} ${stateName}`;
    console.log(`🔍 Search 1: "${query1}"`);
    const results1 = await this.textSearch(query1, bounds, queryId);
    allResults.push(...results1);

    // Strategy 2: Search with "closed" keyword to find closed businesses
    // Google sometimes shows closed locations when "closed" is in the query
    const query2 = `${searchTerm} closed ${stateName}`;
    console.log(`🔍 Search 2: "${query2}"`);
    const results2 = await this.textSearch(query2, bounds, queryId);
    allResults.push(...results2);

    // Strategy 3: Search with "permanently closed" to specifically target those
    if (statusFilter === 'permanently_closed' || statusFilter === 'both') {
      const query3 = `${searchTerm} permanently closed ${stateName}`;
      console.log(`🔍 Search 3: "${query3}"`);
      const results3 = await this.textSearch(query3, bounds, queryId);
      allResults.push(...results3);
    }

    // Deduplicate across all searches
    const deduplicated = this.deduplicateResults(allResults);

    // Filter by status
    const filtered = this.filterByStatus(deduplicated, statusFilter);

    console.log(`✅ Found ${deduplicated.length} unique places, ${filtered.length} match status filter`);

    return filtered;
  }

  // --------------------------------------------------------------------------
  // Grid-based Nearby Search (for broader categories)
  // --------------------------------------------------------------------------

  /**
   * Calculate grid cell centers to cover a bounding box
   */
  calculateGridCells(
    bounds: google.maps.LatLngBounds,
    cellSizeMeters: number
  ): google.maps.LatLng[] {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // Convert cell size to approximate degrees
    // 1 degree latitude ≈ 111km
    // 1 degree longitude varies with latitude
    const latDegrees = cellSizeMeters / 111000;
    const midLat = (ne.lat() + sw.lat()) / 2;
    const lngDegrees = cellSizeMeters / (111000 * Math.cos(midLat * Math.PI / 180));

    const cells: google.maps.LatLng[] = [];

    for (let lat = sw.lat(); lat <= ne.lat(); lat += latDegrees) {
      for (let lng = sw.lng(); lng <= ne.lng(); lng += lngDegrees) {
        cells.push(new google.maps.LatLng(lat + latDegrees / 2, lng + lngDegrees / 2));
      }
    }

    return cells;
  }

  /**
   * Perform Nearby Search with grid coverage for a large area
   */
  async nearbySearchWithGrid(
    keyword: string,
    bounds: google.maps.LatLngBounds,
    gridSizeMeters: number = 50000,
    statusFilter: StatusFilter,
    queryId?: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<PlacesSearchResult[]> {
    if (!this.placesService) {
      throw new Error('PlacesService not initialized. Call initPlacesService first.');
    }

    // Check budget before starting
    const gridCells = this.calculateGridCells(bounds, gridSizeMeters);
    const { available, stats } = await this.checkBudgetAvailable(gridCells.length);

    if (!available) {
      throw new Error(
        `Insufficient budget. This search requires ~${gridCells.length} API calls ` +
        `($${(gridCells.length * COST_PER_REQUEST_CENTS / 100).toFixed(2)}), ` +
        `but only $${(stats.remainingCents / 100).toFixed(2)} remaining.`
      );
    }

    console.log(`🗺️ Grid search: ${gridCells.length} cells of ${gridSizeMeters}m`);

    const allResults: PlacesSearchResult[] = [];
    let requestCount = 0;

    for (let i = 0; i < gridCells.length; i++) {
      const center = gridCells[i];
      await this.waitForRateLimit();
      requestCount++;

      if (onProgress) {
        onProgress(i + 1, gridCells.length);
      }

      try {
        const results = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
          const request: google.maps.places.PlaceSearchRequest = {
            location: center,
            radius: gridSizeMeters / 2, // Radius is half the cell size
            keyword: keyword,
          };

          this.placesService!.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              resolve(results);
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              resolve([]);
            } else {
              reject(new Error(`Places API error: ${status}`));
            }
          });
        });

        for (const place of results) {
          if (place.place_id && place.geometry?.location) {
            allResults.push(this.convertPlaceResult(place));
          }
        }
      } catch (error) {
        console.warn(`Grid cell ${i + 1} search failed:`, error);
        // Continue with other cells
      }
    }

    // Log API usage
    await this.logApiUsage(
      'nearby_search_grid',
      'nearbySearch',
      requestCount,
      allResults.length,
      'OK',
      queryId
    );

    // Deduplicate and filter
    const deduplicated = this.deduplicateResults(allResults);
    const filtered = this.filterByStatus(deduplicated, statusFilter);

    console.log(
      `✅ Grid search complete: ${requestCount} calls, ` +
      `${allResults.length} raw results, ${deduplicated.length} unique, ` +
      `${filtered.length} match status filter`
    );

    return filtered;
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Convert Google PlaceResult to our format
   */
  private convertPlaceResult(place: google.maps.places.PlaceResult): PlacesSearchResult {
    return {
      place_id: place.place_id!,
      name: place.name || 'Unknown',
      formatted_address: place.formatted_address || place.vicinity || '',
      latitude: place.geometry!.location!.lat(),
      longitude: place.geometry!.location!.lng(),
      business_status: (place.business_status as PlacesSearchResult['business_status']) || 'OPERATIONAL',
      types: place.types || [],
      rating: place.rating,
      user_ratings_total: place.user_ratings_total,
      raw_data: place,
    };
  }

  /**
   * Filter results by business status
   */
  filterByStatus(results: PlacesSearchResult[], filter: StatusFilter): PlacesSearchResult[] {
    return results.filter(place => {
      switch (filter) {
        case 'permanently_closed':
          return place.business_status === 'CLOSED_PERMANENTLY';
        case 'temporarily_closed':
          return place.business_status === 'CLOSED_TEMPORARILY';
        case 'both':
          return (
            place.business_status === 'CLOSED_PERMANENTLY' ||
            place.business_status === 'CLOSED_TEMPORARILY'
          );
        default:
          return true;
      }
    });
  }

  /**
   * Deduplicate results by place_id
   */
  deduplicateResults(results: PlacesSearchResult[]): PlacesSearchResult[] {
    const seen = new Set<string>();
    return results.filter(place => {
      if (seen.has(place.place_id)) {
        return false;
      }
      seen.add(place.place_id);
      return true;
    });
  }

  /**
   * Get Google Maps LatLngBounds for a state
   */
  getStateBounds(stateAbbr: string): google.maps.LatLngBounds | null {
    const bounds = STATE_BOUNDS[stateAbbr.toUpperCase()];
    if (!bounds) {
      // Try to create approximate bounds
      // For now, return null for unknown states
      console.warn(`No bounds defined for state: ${stateAbbr}`);
      return null;
    }

    return new google.maps.LatLngBounds(
      new google.maps.LatLng(bounds.south, bounds.west),
      new google.maps.LatLng(bounds.north, bounds.east)
    );
  }

  /**
   * Estimate the number of API calls needed for a search
   */
  estimateApiCalls(config: PlacesSearchConfig): number {
    if (config.queryType === 'text') {
      // Text search is typically 1-3 calls depending on results
      return 2;
    }

    // For grid-based nearby search, calculate number of cells
    if (config.geographyType === 'state' && config.geographyData.state) {
      const bounds = this.getStateBounds(config.geographyData.state);
      if (bounds) {
        const cells = this.calculateGridCells(bounds, config.gridSizeMeters || 50000);
        return cells.length;
      }
    }

    // Default estimate
    return 10;
  }

  /**
   * Get the display name for a state
   */
  getStateName(stateAbbr: string): string {
    return US_STATES.find(s => s.abbr === stateAbbr.toUpperCase())?.name || stateAbbr;
  }
}

// Export singleton instance
export const googlePlacesSearchService = new GooglePlacesSearchService();
export default googlePlacesSearchService;
