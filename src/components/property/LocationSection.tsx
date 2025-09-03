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

      {/* Map Preview Placeholder */}
      {(property.latitude && property.longitude) && (
        <div className="border-t border-gray-200 pt-4">
          <div className="bg-gray-100 rounded-md p-6 text-center">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-sm text-gray-600">Map Preview</p>
            <p className="text-xs text-gray-500 mt-1">
              {property.latitude?.toFixed(6)}, {property.longitude?.toFixed(6)}
            </p>
            <button 
              className="mt-2 text-xs text-blue-600 hover:text-blue-800"
              onClick={() => {
                const url = `https://www.google.com/maps?q=${property.latitude},${property.longitude}`;
                window.open(url, '_blank');
              }}
            >
              View in Google Maps →
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default LocationSection;