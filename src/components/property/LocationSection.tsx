import React, { useState } from 'react';
import { Database } from '../../../database-schema';
import PropertyAutocompleteField from './PropertyAutocompleteField';
import PropertyInputField from './PropertyInputField';

type Property = Database['public']['Tables']['property']['Row'];

interface LocationSectionProps {
  property: Property;
  onFieldUpdate: (field: keyof Property, value: any) => void;
  onGetCurrentLocation?: () => Promise<{ lat: number; lng: number }>;
}

const LocationSection: React.FC<LocationSectionProps> = ({
  property,
  onFieldUpdate,
  onGetCurrentLocation
}) => {
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  // Helper function to get the best available coordinates (prioritize verified coordinates)
  const getBestCoordinates = () => {
    const hasVerified = property.verified_latitude && property.verified_longitude;
    const hasRegular = property.latitude && property.longitude;
    
    if (hasVerified) {
      return {
        lat: property.verified_latitude,
        lng: property.verified_longitude,
        source: 'verified'
      };
    } else if (hasRegular) {
      return {
        lat: property.latitude,
        lng: property.longitude,
        source: 'regular'
      };
    }
    
    return null;
  };

  // Helper function to get Google Maps URL
  const getGoogleMapsUrl = () => {
    const coords = getBestCoordinates();
    return coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : null;
  };

  // Copy Google Maps link to clipboard
  const copyMapLink = async () => {
    const url = getGoogleMapsUrl();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: open in new tab if clipboard fails
      window.open(url, '_blank');
    }
  };

  const handleGetCurrentLocation = async () => {
    if (!onGetCurrentLocation) return;

    try {
      setIsGettingLocation(true);
      const coords = await onGetCurrentLocation();
      onFieldUpdate('latitude', coords.lat);
      onFieldUpdate('longitude', coords.lng);
    } catch (error) {
      console.error('Error getting current location:', error);
    } finally {
      setIsGettingLocation(false);
    }
  };


  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Location</h3>
        </div>
        
        {onGetCurrentLocation && (
          <button
            onClick={handleGetCurrentLocation}
            disabled={isGettingLocation}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors text-sm disabled:opacity-50"
          >
            {isGettingLocation ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            Use Current Location
          </button>
        )}
      </div>

      {/* Address Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="sm:col-span-2">
          <PropertyInputField
            label="Street Address*"
            value={property.address}
            onChange={(value) => onFieldUpdate('address', value)}
            placeholder="123 Main Street"
            tabIndex={1}
          />
        </div>

        <PropertyAutocompleteField
          label="City*"
          value={property.city}
          onChange={(value) => onFieldUpdate('city', value)}
          field="city"
          placeholder="San Francisco"
          tabIndex={2}
        />

        <PropertyAutocompleteField
          label="State*"
          value={property.state}
          onChange={(value) => onFieldUpdate('state', value)}
          field="state"
          placeholder="CA"
          tabIndex={3}
        />

        <PropertyInputField
          label="ZIP Code"
          value={property.zip}
          onChange={(value) => onFieldUpdate('zip', value)}
          placeholder="94105"
          tabIndex={4}
        />

        <PropertyAutocompleteField
          label="County"
          value={property.county}
          onChange={(value) => onFieldUpdate('county', value)}
          field="county"
          placeholder="San Francisco County"
          tabIndex={5}
        />
      </div>

      {/* GPS Coordinates */}
      <div className="border-t border-gray-200 pt-4 mb-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">GPS Coordinates</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PropertyInputField
            label="Latitude"
            value={property.latitude}
            onChange={(value) => onFieldUpdate('latitude', value)}
            type="number"
            placeholder="37.7749"
            inputMode="decimal"
            tabIndex={6}
          />
          
          <PropertyInputField
            label="Longitude"
            value={property.longitude}
            onChange={(value) => onFieldUpdate('longitude', value)}
            type="number"
            placeholder="-122.4194"
            inputMode="decimal"
            tabIndex={7}
          />

          <PropertyInputField
            label="Verified Latitude"
            value={property.verified_latitude}
            onChange={(value) => onFieldUpdate('verified_latitude', value)}
            type="number"
            placeholder="37.7749"
            inputMode="decimal"
            tabIndex={8}
          />
          
          <PropertyInputField
            label="Verified Longitude"
            value={property.verified_longitude}
            onChange={(value) => onFieldUpdate('verified_longitude', value)}
            type="number"
            placeholder="-122.4194"
            inputMode="decimal"
            tabIndex={9}
          />
        </div>
      </div>

      {/* Map Preview - Uses verified coordinates when available */}
      {getBestCoordinates() && (
        <div className="border-t border-gray-200 pt-4">
          <div className="bg-gray-100 rounded-md p-6 text-center">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm text-gray-600">Map Preview</p>
            <p className="text-xs text-gray-500 mt-1">
              {getBestCoordinates()?.lat?.toFixed(6)}, {getBestCoordinates()?.lng?.toFixed(6)}
              {getBestCoordinates()?.source === 'verified' && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  Verified
                </span>
              )}
            </p>
            <div className="mt-3 flex gap-2 justify-center">
              <button 
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                onClick={() => {
                  const url = getGoogleMapsUrl();
                  if (url) window.open(url, '_blank');
                }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in Maps
              </button>
              <button 
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md transition-colors"
                onClick={copyMapLink}
              >
                {copyStatus === 'copied' ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default LocationSection;