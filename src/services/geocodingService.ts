export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  provider?: 'google' | 'openstreetmap';
}

export interface GeocodeError {
  error: string;
  code?: string;
}

/**
 * Enhanced geocoding service that uses Google Geocoding API as primary
 * with OpenStreetMap Nominatim as fallback
 */
class GeocodingService {
  private readonly GOOGLE_GEOCODING_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
  private readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
  private readonly USER_AGENT = 'PropertyKanbanApp/1.0';

  // Rate limiting for batch operations
  private readonly GOOGLE_RATE_LIMIT_MS = 100; // 10 requests per second max
  private readonly OSM_RATE_LIMIT_MS = 1100; // ~1 request per second (Nominatim policy)
  private lastGoogleRequest = 0;
  private lastOsmRequest = 0;

  /**
   * Rate limiter utility
   */
  private async waitForRateLimit(lastRequest: number, rateLimit: number): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequest;
    if (timeSinceLastRequest < rateLimit) {
      const waitTime = rateLimit - timeSinceLastRequest;
      console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Geocode using Google Geocoding API (primary method)
   */
  private async geocodeWithGoogle(address: string): Promise<GeocodeResult | GeocodeError> {
    // Use dedicated Geocoding API key, fallback to Maps API key
    const apiKey = import.meta.env.VITE_GOOGLE_GEOCODING_API_KEY || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { error: 'Google Maps/Geocoding API key not configured', code: 'MISSING_API_KEY' };
    }

    try {
      // Apply rate limiting
      await this.waitForRateLimit(this.lastGoogleRequest, this.GOOGLE_RATE_LIMIT_MS);
      this.lastGoogleRequest = Date.now();

      const response = await fetch(
        `${this.GOOGLE_GEOCODING_BASE_URL}?` + new URLSearchParams({
          address: address,
          key: apiKey,
          region: 'us', // Bias results to US
        })
      );

      if (!response.ok) {
        throw new Error(`Google Geocoding API responded with status: ${response.status}`);
      }

      const data = await response.json();

      console.log('📊 Google API Response Status:', data.status);

      if (data.status === 'REQUEST_DENIED') {
        const errorMsg = `Google API error: ${data.error_message || 'Request denied'}`;
        console.error('❌ Google REQUEST_DENIED:', errorMsg);
        return { error: errorMsg, code: 'REQUEST_DENIED' };
      }

      if (data.status === 'OVER_QUERY_LIMIT') {
        console.error('❌ Google QUOTA_EXCEEDED');
        return { error: 'Google API quota exceeded', code: 'QUOTA_EXCEEDED' };
      }

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        console.error('❌ Google NOT_FOUND or NO_RESULTS, status:', data.status);
        return { error: `Address not found by Google (status: ${data.status})`, code: 'NOT_FOUND' };
      }

      const result = data.results[0];
      const { geometry, formatted_address, address_components } = result;

      // Parse address components
      const components = {
        city: '',
        state: '',
        zip: '',
        county: ''
      };

      address_components.forEach((component: any) => {
        const types = component.types;
        if (types.includes('locality')) {
          components.city = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          components.state = component.short_name;
        } else if (types.includes('postal_code')) {
          components.zip = component.long_name;
        } else if (types.includes('administrative_area_level_2')) {
          components.county = component.long_name;
        }
      });

      console.log('✅ Google Geocoding successful:', formatted_address);

      return {
        latitude: geometry.location.lat,
        longitude: geometry.location.lng,
        formatted_address,
        city: components.city || undefined,
        state: components.state || undefined,
        zip: components.zip || undefined,
        county: components.county || undefined,
        provider: 'google',
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google geocoding failed';
      console.error('❌ Google Geocoding error:', errorMessage);
      return {
        error: errorMessage,
        code: 'GOOGLE_ERROR'
      };
    }
  }

  /**
   * Geocode using OpenStreetMap Nominatim (fallback service)
   */
  private async geocodeWithOSM(address: string): Promise<GeocodeResult | GeocodeError> {
    try {
      // Apply rate limiting
      await this.waitForRateLimit(this.lastOsmRequest, this.OSM_RATE_LIMIT_MS);
      this.lastOsmRequest = Date.now();

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
        throw new Error(`OSM Geocoding API responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        return { error: 'Address not found by OSM', code: 'NOT_FOUND' };
      }

      const result = data[0];
      const addressComponents = result.address || {};

      console.log('✅ OSM Geocoding successful:', result.display_name);

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
        provider: 'openstreetmap',
      };

    } catch (error) {
      console.error('OSM Geocoding error:', error);
      return {
        error: error instanceof Error ? error.message : 'OSM geocoding failed',
        code: 'OSM_ERROR'
      };
    }
  }

  /**
   * Primary geocoding method with Google -> OSM fallback
   */
  async geocodeAddress(address: string): Promise<GeocodeResult | GeocodeError> {
    try {
      console.log('🌍 Starting geocoding for:', address);

      // Try Google Geocoding API first
      console.log('🔄 Trying Google Geocoding API...');
      const googleResult = await this.geocodeWithGoogle(address);

      if ('latitude' in googleResult) {
        console.log('✅ Google geocoding successful');
        return googleResult;
      }

      // If Google fails, try OpenStreetMap as fallback
      console.log('🔄 Google failed, trying OpenStreetMap fallback...');
      const osmResult = await this.geocodeWithOSM(address);

      if ('latitude' in osmResult) {
        console.log('✅ OSM fallback successful');
        return osmResult;
      }

      // Both services failed
      console.error('❌ Both geocoding services failed');
      return {
        error: `Geocoding failed: Google (${googleResult.error}), OSM (${osmResult.error})`,
        code: 'ALL_SERVICES_FAILED'
      };

    } catch (error) {
      console.error('❌ Geocoding error:', error);
      return {
        error: error instanceof Error ? error.message : 'Geocoding failed',
        code: 'GEOCODING_ERROR'
      };
    }
  }

  /**
   * Batch geocoding with proper rate limiting and error handling
   */
  async batchGeocodeAddresses(
    addresses: string[],
    options: {
      onProgress?: (completed: number, total: number, current?: string) => void;
      onSuccess?: (address: string, result: GeocodeResult) => void;
      onError?: (address: string, error: GeocodeError) => void;
      maxRetries?: number;
    } = {}
  ): Promise<{
    successful: { address: string; result: GeocodeResult }[];
    failed: { address: string; error: GeocodeError }[];
  }> {
    const { onProgress, onSuccess, onError, maxRetries = 2 } = options;
    const successful: { address: string; result: GeocodeResult }[] = [];
    const failed: { address: string; error: GeocodeError }[] = [];

    console.log(`🚀 Starting batch geocoding for ${addresses.length} addresses`);

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      let attempts = 0;
      let lastError: GeocodeError | null = null;

      onProgress?.(i, addresses.length, address);

      while (attempts < maxRetries) {
        try {
          console.log(`📍 Geocoding (${i + 1}/${addresses.length}): ${address} (attempt ${attempts + 1})`);

          const result = await this.geocodeAddress(address);

          if ('latitude' in result) {
            successful.push({ address, result });
            onSuccess?.(address, result);
            console.log(`✅ Success for: ${address}`);
            break;
          } else {
            lastError = result;
            attempts++;

            // If it's a quota error, wait longer before retry
            if (result.code === 'QUOTA_EXCEEDED') {
              console.log('⏱️ Quota exceeded, waiting 60 seconds before retry...');
              await new Promise(resolve => setTimeout(resolve, 60000));
            } else if (attempts < maxRetries) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }
        } catch (error) {
          lastError = {
            error: error instanceof Error ? error.message : 'Unknown error',
            code: 'BATCH_ERROR'
          };
          attempts++;

          if (attempts < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      // If all attempts failed
      if (attempts >= maxRetries && lastError) {
        failed.push({ address, error: lastError });
        onError?.(address, lastError);
        console.error(`❌ Failed after ${maxRetries} attempts: ${address}`, lastError);
      }

      // Progress update
      if (onProgress) {
        onProgress(i + 1, addresses.length);
      }
    }

    console.log(`🎯 Batch geocoding complete: ${successful.length} successful, ${failed.length} failed`);

    return { successful, failed };
  }

  /**
   * Get properties that need geocoding from database
   * Properties need geocoding if both latitude/longitude AND verified_latitude/verified_longitude are null
   */
  async getPropertiesNeedingGeocoding(
    limit: number = 50,
    supabaseClient?: any
  ): Promise<{
    id: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
    property_name?: string;
  }[]> {
    if (!supabaseClient) {
      console.log('📋 No Supabase client provided - returning empty array');
      return [];
    }

    try {
      console.log(`📋 Getting properties needing geocoding (limit: ${limit})...`);

      const { data, error } = await supabaseClient
        .from('property')
        .select('id, property_name, address, city, state, zip, latitude, longitude, verified_latitude, verified_longitude')
        .is('latitude', null)
        .is('longitude', null)
        .is('verified_latitude', null)
        .is('verified_longitude', null)
        .not('address', 'is', null)
        .neq('address', '')
        .limit(limit);

      if (error) {
        console.error('❌ Database error getting properties:', error);
        throw error;
      }

      const properties = (data || []).map(prop => ({
        id: prop.id,
        address: prop.address,
        city: prop.city,
        state: prop.state,
        zip: prop.zip,
        property_name: prop.property_name
      }));

      console.log(`✅ Found ${properties.length} properties needing geocoding`);
      return properties;

    } catch (error) {
      console.error('❌ Error getting properties needing geocoding:', error);
      return [];
    }
  }

  /**
   * Update property coordinates in database
   */
  async updatePropertyCoordinates(
    propertyId: string,
    result: GeocodeResult,
    supabaseClient?: any,
    useVerifiedFields: boolean = false
  ): Promise<boolean> {
    if (!supabaseClient) {
      console.log('📋 No Supabase client provided - skipping database update');
      return false;
    }

    try {
      const updateData = useVerifiedFields
        ? {
            verified_latitude: result.latitude,
            verified_longitude: result.longitude,
            updated_at: new Date().toISOString()
          }
        : {
            latitude: result.latitude,
            longitude: result.longitude,
            updated_at: new Date().toISOString()
          };

      // Also update address components if they're empty and we have them
      if (result.city) updateData.city = result.city;
      if (result.state) updateData.state = result.state;
      if (result.zip) updateData.zip = result.zip;
      if (result.county) updateData.county = result.county;

      const { error } = await supabaseClient
        .from('property')
        .update(updateData)
        .eq('id', propertyId);

      if (error) {
        console.error('❌ Database error updating property:', error);
        return false;
      }

      console.log(`✅ Updated property ${propertyId} coordinates`);
      return true;

    } catch (error) {
      console.error('❌ Error updating property coordinates:', error);
      return false;
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