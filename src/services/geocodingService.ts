export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
}

export interface GeocodeError {
  error: string;
  code?: string;
}

/**
 * Geocoding service that uses multiple providers with fallbacks
 */
class GeocodingService {
  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly USER_AGENT = 'PropertyKanbanApp/1.0';

  /**
   * Geocode an address using OpenStreetMap Nominatim (free service)
   */
  async geocodeAddress(address: string): Promise<GeocodeResult | GeocodeError> {
    try {
      // Clean and format the address
      const cleanAddress = address.trim().replace(/\s+/g, ' ');
      if (!cleanAddress) {
        return { error: 'Address is required' };
      }

      // Use Nominatim for free geocoding
      const response = await fetch(
        `${this.NOMINATIM_BASE_URL}?` + new URLSearchParams({
          q: cleanAddress,
          format: 'json',
          limit: '1',
          addressdetails: '1',
          countrycodes: 'us', // Assuming US properties
        }),
        {
          headers: {
            'User-Agent': this.USER_AGENT,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Geocoding API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        return { error: 'Address not found', code: 'NOT_FOUND' };
      }

      const result = data[0];
      const addressComponents = result.address || {};

      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        formatted_address: result.display_name,
        city: addressComponents.city || 
              addressComponents.town || 
              addressComponents.village || 
              addressComponents.hamlet,
        state: addressComponents.state,
        zip: addressComponents.postcode,
        county: addressComponents.county,
      };

    } catch (error) {
      console.error('Geocoding error:', error);
      return { 
        error: error instanceof Error ? error.message : 'Geocoding failed',
        code: 'GEOCODING_ERROR'
      };
    }
  }

  /**
   * Reverse geocode coordinates to get address
   */
  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | GeocodeError> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?` + new URLSearchParams({
          lat: lat.toString(),
          lon: lng.toString(),
          format: 'json',
          addressdetails: '1',
        }),
        {
          headers: {
            'User-Agent': this.USER_AGENT,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Reverse geocoding API responded with status: ${response.status}`);
      }

      const result = await response.json();

      if (!result) {
        return { error: 'Location not found', code: 'NOT_FOUND' };
      }

      const addressComponents = result.address || {};

      return {
        latitude: lat,
        longitude: lng,
        formatted_address: result.display_name,
        city: addressComponents.city || 
              addressComponents.town || 
              addressComponents.village || 
              addressComponents.hamlet,
        state: addressComponents.state,
        zip: addressComponents.postcode,
        county: addressComponents.county,
      };

    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return { 
        error: error instanceof Error ? error.message : 'Reverse geocoding failed',
        code: 'REVERSE_GEOCODING_ERROR'
      };
    }
  }

  /**
   * Build a full address string from components
   */
  buildAddressString(street: string, city?: string, state?: string, zip?: string): string {
    const parts = [street];
    
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zip) parts.push(zip);
    
    return parts.join(', ');
  }

  /**
   * Validate coordinates
   */
  isValidCoordinates(lat: number, lng: number): boolean {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /**
   * Get current location using browser geolocation API
   */
  async getCurrentLocation(): Promise<{ lat: number; lng: number } | GeocodeError> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ error: 'Geolocation is not supported by this browser', code: 'NOT_SUPPORTED' });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          let errorMessage = 'Failed to get current location';
          let errorCode = 'LOCATION_ERROR';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied by user';
              errorCode = 'PERMISSION_DENIED';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable';
              errorCode = 'POSITION_UNAVAILABLE';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out';
              errorCode = 'TIMEOUT';
              break;
          }

          resolve({ error: errorMessage, code: errorCode });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        }
      );
    });
  }
}

// Export singleton instance
export const geocodingService = new GeocodingService();
export default geocodingService;