import { union } from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { GeoJSONGeometry } from './mapLayerService';

// ============================================================================
// Types
// ============================================================================

export type BoundaryType = 'county' | 'city' | 'zip' | 'msa';

export interface BoundarySearchResult {
  type: BoundaryType;
  geoid: string;
  name: string;
  state: string;
  stateFips: string;
  displayName: string; // "DeKalb County, GA"
}

export interface FetchedBoundary extends BoundarySearchResult {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface BoundaryError {
  error: string;
  code?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CENSUS_BASE_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
const COUNTIES_ENDPOINT = `${CENSUS_BASE_URL}/State_County/MapServer/1/query`;

// State FIPS codes
export const STATE_FIPS: Record<string, string> = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
  'CO': '08', 'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13',
  'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19',
  'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
  'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29',
  'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
  'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
  'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45',
  'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50',
  'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56',
  'DC': '11', 'PR': '72'
};

// Reverse lookup: FIPS to state abbreviation
export const FIPS_TO_STATE: Record<string, string> = Object.entries(STATE_FIPS).reduce(
  (acc, [state, fips]) => ({ ...acc, [fips]: state }),
  {}
);

// US States with names
export const US_STATES: { abbr: string; name: string; fips: string }[] = [
  { abbr: 'AL', name: 'Alabama', fips: '01' },
  { abbr: 'AK', name: 'Alaska', fips: '02' },
  { abbr: 'AZ', name: 'Arizona', fips: '04' },
  { abbr: 'AR', name: 'Arkansas', fips: '05' },
  { abbr: 'CA', name: 'California', fips: '06' },
  { abbr: 'CO', name: 'Colorado', fips: '08' },
  { abbr: 'CT', name: 'Connecticut', fips: '09' },
  { abbr: 'DE', name: 'Delaware', fips: '10' },
  { abbr: 'DC', name: 'District of Columbia', fips: '11' },
  { abbr: 'FL', name: 'Florida', fips: '12' },
  { abbr: 'GA', name: 'Georgia', fips: '13' },
  { abbr: 'HI', name: 'Hawaii', fips: '15' },
  { abbr: 'ID', name: 'Idaho', fips: '16' },
  { abbr: 'IL', name: 'Illinois', fips: '17' },
  { abbr: 'IN', name: 'Indiana', fips: '18' },
  { abbr: 'IA', name: 'Iowa', fips: '19' },
  { abbr: 'KS', name: 'Kansas', fips: '20' },
  { abbr: 'KY', name: 'Kentucky', fips: '21' },
  { abbr: 'LA', name: 'Louisiana', fips: '22' },
  { abbr: 'ME', name: 'Maine', fips: '23' },
  { abbr: 'MD', name: 'Maryland', fips: '24' },
  { abbr: 'MA', name: 'Massachusetts', fips: '25' },
  { abbr: 'MI', name: 'Michigan', fips: '26' },
  { abbr: 'MN', name: 'Minnesota', fips: '27' },
  { abbr: 'MS', name: 'Mississippi', fips: '28' },
  { abbr: 'MO', name: 'Missouri', fips: '29' },
  { abbr: 'MT', name: 'Montana', fips: '30' },
  { abbr: 'NE', name: 'Nebraska', fips: '31' },
  { abbr: 'NV', name: 'Nevada', fips: '32' },
  { abbr: 'NH', name: 'New Hampshire', fips: '33' },
  { abbr: 'NJ', name: 'New Jersey', fips: '34' },
  { abbr: 'NM', name: 'New Mexico', fips: '35' },
  { abbr: 'NY', name: 'New York', fips: '36' },
  { abbr: 'NC', name: 'North Carolina', fips: '37' },
  { abbr: 'ND', name: 'North Dakota', fips: '38' },
  { abbr: 'OH', name: 'Ohio', fips: '39' },
  { abbr: 'OK', name: 'Oklahoma', fips: '40' },
  { abbr: 'OR', name: 'Oregon', fips: '41' },
  { abbr: 'PA', name: 'Pennsylvania', fips: '42' },
  { abbr: 'RI', name: 'Rhode Island', fips: '44' },
  { abbr: 'SC', name: 'South Carolina', fips: '45' },
  { abbr: 'SD', name: 'South Dakota', fips: '46' },
  { abbr: 'TN', name: 'Tennessee', fips: '47' },
  { abbr: 'TX', name: 'Texas', fips: '48' },
  { abbr: 'UT', name: 'Utah', fips: '49' },
  { abbr: 'VT', name: 'Vermont', fips: '50' },
  { abbr: 'VA', name: 'Virginia', fips: '51' },
  { abbr: 'WA', name: 'Washington', fips: '53' },
  { abbr: 'WV', name: 'West Virginia', fips: '54' },
  { abbr: 'WI', name: 'Wisconsin', fips: '55' },
  { abbr: 'WY', name: 'Wyoming', fips: '56' },
];

// Southeastern states for priority display
export const SOUTHEASTERN_STATES = ['GA', 'SC', 'AL', 'TN', 'NC', 'FL'];

// ============================================================================
// Boundary Service Class
// ============================================================================

class BoundaryService {
  // Rate limiting
  private readonly RATE_LIMIT_MS = 100; // 10 requests per second max
  private lastRequest = 0;

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

  // --------------------------------------------------------------------------
  // County Search & Fetch
  // --------------------------------------------------------------------------

  /**
   * Search counties by name
   */
  async searchCounties(
    query: string,
    stateFips?: string
  ): Promise<BoundarySearchResult[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      await this.waitForRateLimit();

      // Build WHERE clause
      let where = `UPPER(NAME) LIKE UPPER('%${query.trim()}%')`;
      if (stateFips) {
        where += ` AND STATE='${stateFips}'`;
      }

      const params = new URLSearchParams({
        where,
        outFields: 'GEOID,NAME,STATE,STUSPS',
        f: 'json',
        returnGeometry: 'false',
        resultRecordCount: '20',
      });

      const response = await fetch(`${COUNTIES_ENDPOINT}?${params}`);

      if (!response.ok) {
        throw new Error(`Census API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return [];
      }

      return data.features.map((feature: any) => ({
        type: 'county' as BoundaryType,
        geoid: feature.attributes.GEOID,
        name: feature.attributes.NAME,
        state: feature.attributes.STUSPS || FIPS_TO_STATE[feature.attributes.STATE] || '',
        stateFips: feature.attributes.STATE,
        displayName: `${feature.attributes.NAME} County, ${feature.attributes.STUSPS || FIPS_TO_STATE[feature.attributes.STATE] || ''}`,
      }));
    } catch (error) {
      console.error('❌ County search error:', error);
      return [];
    }
  }

  /**
   * Get all counties for a state
   */
  async getCountiesForState(stateFips: string): Promise<BoundarySearchResult[]> {
    try {
      await this.waitForRateLimit();

      const params = new URLSearchParams({
        where: `STATE='${stateFips}'`,
        outFields: 'GEOID,NAME,STATE,STUSPS',
        f: 'json',
        returnGeometry: 'false',
        resultRecordCount: '500', // Most states have < 300 counties
        orderByFields: 'NAME ASC',
      });

      const response = await fetch(`${COUNTIES_ENDPOINT}?${params}`);

      if (!response.ok) {
        throw new Error(`Census API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return [];
      }

      const stateAbbr = FIPS_TO_STATE[stateFips] || '';

      return data.features.map((feature: any) => ({
        type: 'county' as BoundaryType,
        geoid: feature.attributes.GEOID,
        name: feature.attributes.NAME,
        state: feature.attributes.STUSPS || stateAbbr,
        stateFips: feature.attributes.STATE,
        displayName: `${feature.attributes.NAME} County, ${feature.attributes.STUSPS || stateAbbr}`,
      }));
    } catch (error) {
      console.error('❌ Get counties for state error:', error);
      return [];
    }
  }

  /**
   * Fetch county boundary geometry by GEOID
   */
  async fetchCountyGeometry(geoid: string): Promise<FetchedBoundary | BoundaryError> {
    try {
      await this.waitForRateLimit();

      const params = new URLSearchParams({
        where: `GEOID='${geoid}'`,
        outFields: 'GEOID,NAME,STATE,STUSPS',
        f: 'geojson',
        returnGeometry: 'true',
        outSR: '4326', // WGS84 coordinates
      });

      const response = await fetch(`${COUNTIES_ENDPOINT}?${params}`);

      if (!response.ok) {
        throw new Error(`Census API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.features || data.features.length === 0) {
        return { error: 'County not found', code: 'NOT_FOUND' };
      }

      const feature = data.features[0];
      const props = feature.properties;
      const stateAbbr = props.STUSPS || FIPS_TO_STATE[props.STATE] || '';

      return {
        type: 'county',
        geoid: props.GEOID,
        name: props.NAME,
        state: stateAbbr,
        stateFips: props.STATE,
        displayName: `${props.NAME} County, ${stateAbbr}`,
        geometry: feature.geometry,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch county geometry';
      console.error('❌ Fetch county geometry error:', errorMessage);
      return { error: errorMessage, code: 'FETCH_ERROR' };
    }
  }

  // --------------------------------------------------------------------------
  // Geometry Conversion
  // --------------------------------------------------------------------------

  /**
   * Convert Census GeoJSON geometry to our app's GeoJSONGeometry format
   * Census returns [lng, lat], we store [lat, lng]
   */
  convertToMapLayerGeometry(
    censusGeometry: FetchedBoundary['geometry']
  ): GeoJSONGeometry {
    if (censusGeometry.type === 'Polygon') {
      // Polygon: coordinates is number[][][]
      const coords = (censusGeometry.coordinates as number[][][])[0];
      const convertedCoords = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      return {
        type: 'polygon',
        coordinates: convertedCoords,
      };
    } else if (censusGeometry.type === 'MultiPolygon') {
      // MultiPolygon: coordinates is number[][][][]
      // For now, take the largest polygon (most points)
      const polygons = censusGeometry.coordinates as number[][][][];
      let largestPolygon = polygons[0];
      let maxPoints = polygons[0][0].length;

      for (const polygon of polygons) {
        if (polygon[0].length > maxPoints) {
          maxPoints = polygon[0].length;
          largestPolygon = polygon;
        }
      }

      const coords = largestPolygon[0];
      const convertedCoords = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      return {
        type: 'polygon',
        coordinates: convertedCoords,
      };
    }

    throw new Error(`Unsupported geometry type: ${censusGeometry.type}`);
  }

  /**
   * Convert our app's GeoJSONGeometry to GeoJSON Polygon for Turf.js
   */
  private toTurfPolygon(geometry: GeoJSONGeometry): Feature<Polygon> {
    if (geometry.type !== 'polygon') {
      throw new Error(`Cannot convert ${geometry.type} to polygon`);
    }

    // Convert [lat, lng] back to [lng, lat] for GeoJSON standard
    const coords = geometry.coordinates.map(([lat, lng]) => [lng, lat]);

    // Ensure the polygon is closed
    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([...first]);
      }
    }

    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [coords],
      },
    };
  }

  /**
   * Convert Census geometry directly to Turf polygon (for merge operations)
   */
  private censusTurfPolygon(
    censusGeometry: FetchedBoundary['geometry']
  ): Feature<Polygon | MultiPolygon> {
    if (censusGeometry.type === 'Polygon') {
      return {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: censusGeometry.coordinates as number[][][],
        },
      };
    } else {
      return {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: censusGeometry.coordinates as number[][][][],
        },
      };
    }
  }

  // --------------------------------------------------------------------------
  // Merge Operations
  // --------------------------------------------------------------------------

  /**
   * Merge multiple boundaries into a single polygon using Turf.js union
   */
  mergePolygons(boundaries: FetchedBoundary[]): GeoJSONGeometry {
    if (boundaries.length === 0) {
      throw new Error('No boundaries to merge');
    }

    if (boundaries.length === 1) {
      return this.convertToMapLayerGeometry(boundaries[0].geometry);
    }

    // Convert all boundaries to Turf features
    const features = boundaries.map(b => this.censusTurfPolygon(b.geometry));

    // Progressive union
    let merged: Feature<Polygon | MultiPolygon> | null = features[0];

    for (let i = 1; i < features.length; i++) {
      const result = union(merged as Feature<Polygon | MultiPolygon>, features[i] as Feature<Polygon | MultiPolygon>);
      if (result) {
        merged = result;
      }
    }

    if (!merged || !merged.geometry) {
      throw new Error('Merge operation failed');
    }

    // Convert result back to our format
    return this.convertTurfResultToMapLayer(merged.geometry);
  }

  /**
   * Convert Turf result geometry to our GeoJSONGeometry format
   */
  private convertTurfResultToMapLayer(
    turfGeometry: Polygon | MultiPolygon
  ): GeoJSONGeometry {
    if (turfGeometry.type === 'Polygon') {
      const coords = turfGeometry.coordinates[0];
      const convertedCoords = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      return {
        type: 'polygon',
        coordinates: convertedCoords,
      };
    } else if (turfGeometry.type === 'MultiPolygon') {
      // Take the largest polygon
      let largestPolygon = turfGeometry.coordinates[0];
      let maxPoints = turfGeometry.coordinates[0][0].length;

      for (const polygon of turfGeometry.coordinates) {
        if (polygon[0].length > maxPoints) {
          maxPoints = polygon[0].length;
          largestPolygon = polygon;
        }
      }

      const coords = largestPolygon[0];
      const convertedCoords = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      return {
        type: 'polygon',
        coordinates: convertedCoords,
      };
    }

    throw new Error(`Unsupported result geometry type: ${turfGeometry.type}`);
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Get state FIPS from abbreviation
   */
  getStateFips(stateAbbr: string): string | undefined {
    return STATE_FIPS[stateAbbr.toUpperCase()];
  }

  /**
   * Get state abbreviation from FIPS
   */
  getStateAbbr(stateFips: string): string | undefined {
    return FIPS_TO_STATE[stateFips];
  }

  /**
   * Check if a result is an error
   */
  isError(result: any): result is BoundaryError {
    return result && typeof result.error === 'string';
  }
}

// Export singleton instance
export const boundaryService = new BoundaryService();
export default boundaryService;
