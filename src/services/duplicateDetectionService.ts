import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

export interface DuplicateMatch {
  matchType: 'place_id' | 'proximity' | 'address';
  property: Property;
  confidence: 'exact' | 'high' | 'medium';
  distance?: number; // meters, for proximity matches
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  matches: DuplicateMatch[];
}

class DuplicateDetectionService {
  /**
   * Check for duplicate properties using a 3-tier detection system:
   * 1. Exact match on google_place_id
   * 2. Proximity match (within X meters)
   * 3. Fuzzy address match
   */
  async checkForDuplicates(
    placeId: string,
    latitude: number,
    longitude: number,
    address: string,
    proximityMeters: number = 50
  ): Promise<DuplicateCheckResult> {
    const matches: DuplicateMatch[] = [];

    // Tier 1: Check for exact place_id match
    const placeIdMatch = await this.findByPlaceId(placeId);
    if (placeIdMatch) {
      matches.push({
        matchType: 'place_id',
        property: placeIdMatch,
        confidence: 'exact',
      });
      // Return immediately - exact match is definitive
      return { hasDuplicate: true, matches };
    }

    // Tier 2: Check for proximity match
    const proximityMatches = await this.findByProximity(latitude, longitude, proximityMeters);
    proximityMatches.forEach(match => {
      matches.push({
        matchType: 'proximity',
        property: match.property,
        confidence: match.distance < 25 ? 'high' : 'medium',
        distance: match.distance,
      });
    });

    // Tier 3: Check for fuzzy address match (only if no proximity matches)
    if (matches.length === 0 && address) {
      const addressMatches = await this.findByFuzzyAddress(address);
      addressMatches.forEach(match => {
        matches.push({
          matchType: 'address',
          property: match,
          confidence: 'medium',
        });
      });
    }

    return {
      hasDuplicate: matches.length > 0,
      matches,
    };
  }

  /**
   * Tier 1: Find property by exact Google Place ID
   */
  async findByPlaceId(placeId: string): Promise<Property | null> {
    const { data, error } = await supabase
      .from('property')
      .select('*')
      .eq('google_place_id', placeId)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error finding property by place_id:', error);
    }

    return data || null;
  }

  /**
   * Tier 2: Find properties within X meters of a location
   * Uses simple lat/lng distance calculation (Haversine approximation)
   */
  async findByProximity(
    latitude: number,
    longitude: number,
    radiusMeters: number
  ): Promise<{ property: Property; distance: number }[]> {
    // Convert radius to approximate degrees (1 degree ≈ 111km at equator)
    // Use a slightly larger search box to account for projection distortion
    const radiusDegrees = (radiusMeters / 111000) * 1.5;

    const { data, error } = await supabase
      .from('property')
      .select('*')
      .gte('latitude', latitude - radiusDegrees)
      .lte('latitude', latitude + radiusDegrees)
      .gte('longitude', longitude - radiusDegrees)
      .lte('longitude', longitude + radiusDegrees)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (error) {
      console.error('Error finding properties by proximity:', error);
      return [];
    }

    // Calculate actual distance for each match and filter
    const matches: { property: Property; distance: number }[] = [];

    (data || []).forEach(property => {
      if (property.latitude && property.longitude) {
        const distance = this.calculateDistance(
          latitude, longitude,
          property.latitude, property.longitude
        );

        if (distance <= radiusMeters) {
          matches.push({ property, distance });
        }
      }
    });

    // Sort by distance
    return matches.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Tier 3: Find properties with similar addresses
   * Normalizes addresses and checks for matches
   */
  async findByFuzzyAddress(address: string): Promise<Property[]> {
    const normalized = this.normalizeAddress(address);

    if (!normalized) return [];

    // Search for properties with similar normalized addresses
    const { data, error } = await supabase
      .from('property')
      .select('*')
      .or(`address.ilike.%${normalized}%`);

    if (error) {
      console.error('Error finding properties by address:', error);
      return [];
    }

    // Further filter by comparing normalized versions
    return (data || []).filter(property => {
      if (!property.address) return false;
      const propNormalized = this.normalizeAddress(property.address);
      return propNormalized && this.addressSimilarity(normalized, propNormalized) > 0.8;
    });
  }

  /**
   * Check multiple places for duplicates at once (for bulk operations)
   */
  async checkMultipleForDuplicates(
    places: Array<{
      place_id: string;
      latitude: number;
      longitude: number;
      formatted_address: string;
    }>
  ): Promise<Map<string, DuplicateCheckResult>> {
    const results = new Map<string, DuplicateCheckResult>();

    // Get all existing google_place_ids in one query
    const placeIds = places.map(p => p.place_id);
    const { data: existingByPlaceId } = await supabase
      .from('property')
      .select('*')
      .in('google_place_id', placeIds);

    const placeIdMap = new Map<string, Property>();
    (existingByPlaceId || []).forEach(prop => {
      if (prop.google_place_id) {
        placeIdMap.set(prop.google_place_id, prop);
      }
    });

    // Check each place
    for (const place of places) {
      // Quick check for place_id match first
      const placeIdMatch = placeIdMap.get(place.place_id);
      if (placeIdMatch) {
        results.set(place.place_id, {
          hasDuplicate: true,
          matches: [{
            matchType: 'place_id',
            property: placeIdMatch,
            confidence: 'exact',
          }],
        });
        continue;
      }

      // Full check for proximity/address
      const result = await this.checkForDuplicates(
        place.place_id,
        place.latitude,
        place.longitude,
        place.formatted_address
      );
      results.set(place.place_id, result);
    }

    return results;
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in meters
   */
  private calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Normalize an address for comparison
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[,.\-#]/g, ' ')
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\bboulevard\b/g, 'blvd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\broad\b/g, 'rd')
      .replace(/\blane\b/g, 'ln')
      .replace(/\bcourt\b/g, 'ct')
      .replace(/\bplace\b/g, 'pl')
      .replace(/\bnorth\b/g, 'n')
      .replace(/\bsouth\b/g, 's')
      .replace(/\beast\b/g, 'e')
      .replace(/\bwest\b/g, 'w')
      .replace(/\bsuite\b/g, 'ste')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate similarity between two normalized addresses (0-1)
   */
  private addressSimilarity(addr1: string, addr2: string): number {
    const words1 = addr1.split(' ');
    const words2 = addr2.split(' ');

    let matches = 0;
    words1.forEach(word => {
      if (words2.includes(word)) matches++;
    });

    return matches / Math.max(words1.length, words2.length);
  }
}

// Export singleton instance
export const duplicateDetectionService = new DuplicateDetectionService();
export default duplicateDetectionService;
