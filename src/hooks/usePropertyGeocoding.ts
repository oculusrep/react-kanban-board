import { useState, useCallback } from 'react';
import { geocodingService, GeocodeResult, GeocodeError } from '../services/geocodingService';
import { Database } from '../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

interface UsePropertyGeocodingReturn {
  isGeocoding: boolean;
  geocodeError: string | null;
  geocodeProperty: (property: Partial<Property>) => Promise<Partial<Property>>;
  getCurrentLocation: () => Promise<{ lat: number; lng: number } | null>;
  clearError: () => void;
}

/**
 * Hook for handling property geocoding operations
 */
export function usePropertyGeocoding(): UsePropertyGeocodingReturn {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setGeocodeError(null);
  }, []);

  /**
   * Geocode a property's address and return updated property data
   */
  const geocodeProperty = useCallback(async (property: Partial<Property>): Promise<Partial<Property>> => {
    setIsGeocoding(true);
    setGeocodeError(null);

    try {
      // Build address string from property components
      const addressString = geocodingService.buildAddressString(
        property.address || '',
        property.city,
        property.state,
        property.zip
      );

      if (!addressString.trim()) {
        throw new Error('No address provided for geocoding');
      }

      console.log('🌍 Geocoding address:', addressString);

      const result = await geocodingService.geocodeAddress(addressString);

      if ('error' in result) {
        setGeocodeError(result.error);
        console.error('Geocoding failed:', result.error);
        return property; // Return original property if geocoding fails
      }

      const geocodedData = result as GeocodeResult;

      // Update property with geocoded data
      const updatedProperty: Partial<Property> = {
        ...property,
        latitude: geocodedData.latitude,
        longitude: geocodedData.longitude,
      };

      // Only update address components if they're not already set
      if (!property.city && geocodedData.city) {
        updatedProperty.city = geocodedData.city;
      }
      if (!property.state && geocodedData.state) {
        updatedProperty.state = geocodedData.state;
      }
      if (!property.zip && geocodedData.zip) {
        updatedProperty.zip = geocodedData.zip;
      }
      if (!property.county && geocodedData.county) {
        updatedProperty.county = geocodedData.county;
      }

      console.log('✅ Geocoding successful:', {
        address: addressString,
        coordinates: [geocodedData.latitude, geocodedData.longitude]
      });

      return updatedProperty;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Geocoding failed';
      setGeocodeError(errorMessage);
      console.error('Geocoding error:', error);
      return property; // Return original property if error occurs
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  /**
   * Get current location from browser geolocation API
   */
  const getCurrentLocation = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    setGeocodeError(null);

    try {
      const result = await geocodingService.getCurrentLocation();

      if ('error' in result) {
        setGeocodeError(result.error);
        return null;
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get current location';
      setGeocodeError(errorMessage);
      return null;
    }
  }, []);

  return {
    isGeocoding,
    geocodeError,
    geocodeProperty,
    getCurrentLocation,
    clearError,
  };
}

export default usePropertyGeocoding;