import React, { useState } from 'react';
import { Database } from '../../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];

interface LocationSectionProps {
  property: Property;
  isEditing: boolean;
  onFieldUpdate: (field: keyof Property, value: any) => void;
  onGetCurrentLocation?: () => Promise<{ lat: number; lng: number }>;
}

const LocationSection: React.FC<LocationSectionProps> = ({
  property,
  isEditing,
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

  const formatCoordinate = (coord: number | null, type: 'lat' | 'lng'): string => {
    if (!coord) return 'Not set';
    const direction = type === 'lat' ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${Math.abs(coord).toFixed(6)}° ${direction}`;
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Location & Contact</h3>
        </div>
        
        {isEditing && onGetCurrentLocation && (
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Street Address*
          </label>
          {isEditing ? (
            <input
              type="text"
              value={property.address || ''}
              onChange={(e) => onFieldUpdate('address', e.target.value)}
              placeholder="123 Main Street"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
              {property.address || 'Not set'}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City*
          </label>
          {isEditing ? (
            <input
              type="text"
              value={property.city || ''}
              onChange={(e) => onFieldUpdate('city', e.target.value)}
              placeholder="San Francisco"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
              {property.city || 'Not set'}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State*
          </label>
          {isEditing ? (
            <input
              type="text"
              value={property.state || ''}
              onChange={(e) => onFieldUpdate('state', e.target.value)}
              placeholder="CA"
              maxLength={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
              {property.state || 'Not set'}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ZIP Code
          </label>
          {isEditing ? (
            <input
              type="text"
              value={property.zip || ''}
              onChange={(e) => onFieldUpdate('zip', e.target.value)}
              placeholder="94105"
              maxLength={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
              {property.zip || 'Not set'}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            County
          </label>
          {isEditing ? (
            <input
              type="text"
              value={property.county || ''}
              onChange={(e) => onFieldUpdate('county', e.target.value)}
              placeholder="San Francisco County"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
            />
          ) : (
            <div className="px-3 py-2 bg-gray-50 rounded-md min-h-[44px] flex items-center">
              {property.county || 'Not set'}
            </div>
          )}
        </div>
      </div>

      {/* GPS Coordinates */}
      <div className="border-t border-gray-200 pt-4 mb-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">GPS Coordinates</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Latitude
            </label>
            {isEditing ? (
              <input
                type="number"
                step="any"
                value={property.latitude || ''}
                onChange={(e) => onFieldUpdate('latitude', parseFloat(e.target.value) || null)}
                placeholder="37.7749"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded-md text-sm">
                {formatCoordinate(property.latitude, 'lat')}
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Longitude
            </label>
            {isEditing ? (
              <input
                type="number"
                step="any"
                value={property.longitude || ''}
                onChange={(e) => onFieldUpdate('longitude', parseFloat(e.target.value) || null)}
                placeholder="-122.4194"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            ) : (
              <div className="px-3 py-2 bg-gray-50 rounded-md text-sm">
                {formatCoordinate(property.longitude, 'lng')}
              </div>
            )}
          </div>
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
              {formatCoordinate(property.latitude, 'lat')}, {formatCoordinate(property.longitude, 'lng')}
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