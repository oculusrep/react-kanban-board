import React from 'react';
import type { PlacesSearchResult } from '../../../services/googlePlacesSearchService';

interface ClosedPlacePopupProps {
  place: PlacesSearchResult;
  onClose: () => void;
  onAddToProperties?: (place: PlacesSearchResult) => void;
  onViewOnGoogle?: (place: PlacesSearchResult) => void;
  showAddButton?: boolean; // false for portal view
}

const ClosedPlacePopup: React.FC<ClosedPlacePopupProps> = ({
  place,
  onClose,
  onAddToProperties,
  onViewOnGoogle,
  showAddButton = true,
}) => {
  const isPermanent = place.business_status === 'CLOSED_PERMANENTLY';

  // Format business type for display
  const getBusinessType = () => {
    if (!place.types || place.types.length === 0) return null;

    const typeMap: Record<string, string> = {
      restaurant: 'Restaurant',
      cafe: 'Cafe',
      bar: 'Bar',
      store: 'Store',
      grocery_or_supermarket: 'Grocery Store',
      shopping_mall: 'Shopping Mall',
      gas_station: 'Gas Station',
      bank: 'Bank',
      gym: 'Gym',
      pharmacy: 'Pharmacy',
      convenience_store: 'Convenience Store',
      clothing_store: 'Clothing Store',
      electronics_store: 'Electronics Store',
      furniture_store: 'Furniture Store',
      home_goods_store: 'Home Goods Store',
      department_store: 'Department Store',
      supermarket: 'Supermarket',
      bakery: 'Bakery',
      meal_takeaway: 'Takeaway',
      meal_delivery: 'Delivery',
    };

    // Find first matching type
    for (const type of place.types) {
      if (typeMap[type]) {
        return typeMap[type];
      }
    }

    // Return first type with formatting
    return place.types[0]
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleViewOnGoogle = () => {
    const url = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;
    window.open(url, '_blank');
    onViewOnGoogle?.(place);
  };

  const businessType = getBusinessType();

  return (
    <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-72 overflow-hidden">
      {/* Header with status */}
      <div className={`px-4 py-3 ${isPermanent ? 'bg-red-50' : 'bg-yellow-50'}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="font-semibold text-gray-900 truncate">{place.name}</h3>
            {businessType && (
              <p className="text-xs text-gray-500">{businessType}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Badge */}
        <div className="mt-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            isPermanent
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            <span className={`w-2 h-2 rounded-full mr-1.5 ${
              isPermanent ? 'bg-red-500' : 'bg-yellow-500'
            }`}></span>
            {isPermanent ? 'Permanently Closed' : 'Temporarily Closed'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* Address */}
        {place.formatted_address && (
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-600 flex-1">{place.formatted_address}</p>
          </div>
        )}

        {/* Rating */}
        {place.rating && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm text-gray-600">
              {place.rating.toFixed(1)}
              {place.user_ratings_total && (
                <span className="text-gray-400 ml-1">
                  ({place.user_ratings_total.toLocaleString()} reviews)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Phone */}
        {place.phone_number && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a
              href={`tel:${place.phone_number}`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {place.phone_number}
            </a>
          </div>
        )}

        {/* Website */}
        {place.website && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 truncate"
            >
              {new URL(place.website).hostname}
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex gap-2">
        <button
          onClick={handleViewOnGoogle}
          className="flex-1 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          View on Google
        </button>

        {showAddButton && onAddToProperties && (
          <button
            onClick={() => onAddToProperties(place)}
            className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add to Properties
          </button>
        )}
      </div>
    </div>
  );
};

export default ClosedPlacePopup;
