import React from 'react';

export interface PlaceDetails {
  placeId: string;
  name: string;
  address?: string;
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  openingHours?: {
    isOpen?: boolean;  // undefined means we don't know the current open/closed status
    weekdayText?: string[];
  };
  rating?: number;
  userRatingsTotal?: number;
  website?: string;
  phoneNumber?: string;
  types?: string[];
}

interface PlaceInfoPopupProps {
  place: PlaceDetails;
  onClose: () => void;
  onOpenWebsite?: () => void;
}

const PlaceInfoPopup: React.FC<PlaceInfoPopupProps> = ({
  place,
  onClose,
  onOpenWebsite
}) => {
  // Format business status for display
  const getBusinessStatusDisplay = () => {
    // Handle temporary and permanent closures first (these take priority)
    if (place.businessStatus === 'CLOSED_TEMPORARILY') {
      return {
        label: 'Temporarily Closed',
        color: 'bg-yellow-100 text-yellow-800',
        icon: '🟡'
      };
    }

    if (place.businessStatus === 'CLOSED_PERMANENTLY') {
      return {
        label: 'Permanently Closed',
        color: 'bg-red-100 text-red-800',
        icon: '🔴'
      };
    }

    // For operational businesses (or unknown status), check opening hours
    if (place.openingHours?.isOpen === true) {
      return {
        label: 'Open Now',
        color: 'bg-green-100 text-green-800',
        icon: '🟢'
      };
    }

    if (place.openingHours?.isOpen === false) {
      return {
        label: 'Closed Now',
        color: 'bg-gray-100 text-gray-800',
        icon: '⚪'
      };
    }

    // If we don't have opening hours data, don't show a status badge
    // (unless it's explicitly OPERATIONAL, in which case show it's open)
    if (place.businessStatus === 'OPERATIONAL') {
      return {
        label: 'Open',
        color: 'bg-green-100 text-green-800',
        icon: '🟢'
      };
    }

    // No status to display
    return null;
  };

  const businessStatus = getBusinessStatusDisplay();

  // Get primary type for display
  const getPrimaryType = () => {
    if (!place.types || place.types.length === 0) return null;
    // Map common Google place types to friendly names
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
      hospital: 'Hospital',
      pharmacy: 'Pharmacy',
      school: 'School',
      university: 'University',
      park: 'Park',
      church: 'Church',
      lodging: 'Hotel',
      movie_theater: 'Movie Theater',
      parking: 'Parking',
      car_dealer: 'Car Dealer',
      car_repair: 'Auto Repair',
      car_wash: 'Car Wash',
      convenience_store: 'Convenience Store',
      department_store: 'Department Store',
      electronics_store: 'Electronics Store',
      furniture_store: 'Furniture Store',
      hardware_store: 'Hardware Store',
      home_goods_store: 'Home Goods',
      jewelry_store: 'Jewelry Store',
      liquor_store: 'Liquor Store',
      pet_store: 'Pet Store',
      shoe_store: 'Shoe Store',
      supermarket: 'Supermarket',
      beauty_salon: 'Beauty Salon',
      hair_care: 'Hair Salon',
      spa: 'Spa',
      dentist: 'Dentist',
      doctor: 'Doctor',
      veterinary_care: 'Veterinarian',
      bakery: 'Bakery',
      meal_delivery: 'Meal Delivery',
      meal_takeaway: 'Takeaway',
    };

    for (const type of place.types) {
      if (typeMap[type]) {
        return typeMap[type];
      }
    }
    return null;
  };

  const primaryType = getPrimaryType();

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-72">
      {/* Header */}
      <div className="bg-blue-600 text-white px-3 py-2 rounded-t-lg flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">
            {place.name}
          </h3>
          {primaryType && (
            <div className="text-xs text-blue-100 truncate">{primaryType}</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white hover:text-blue-100 ml-2 flex-shrink-0"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {/* Business Status Badge */}
        {businessStatus && (
          <div className="flex items-center">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${businessStatus.color}`}>
              <span className="mr-1">{businessStatus.icon}</span>
              {businessStatus.label}
            </span>
          </div>
        )}

        {/* Address */}
        {place.address && (
          <div className="text-xs text-gray-600">
            <div className="flex items-start">
              <svg className="w-3.5 h-3.5 mr-1.5 mt-0.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{place.address}</span>
            </div>
          </div>
        )}

        {/* Rating */}
        {place.rating && (
          <div className="flex items-center text-xs">
            <div className="flex items-center text-yellow-500 mr-1">
              {'★'.repeat(Math.round(place.rating))}
              {'☆'.repeat(5 - Math.round(place.rating))}
            </div>
            <span className="text-gray-600">
              {place.rating.toFixed(1)}
              {place.userRatingsTotal && (
                <span className="text-gray-400 ml-1">({place.userRatingsTotal.toLocaleString()} reviews)</span>
              )}
            </span>
          </div>
        )}

        {/* Phone */}
        {place.phoneNumber && (
          <div className="text-xs text-gray-600 flex items-center">
            <svg className="w-3.5 h-3.5 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a href={`tel:${place.phoneNumber}`} className="hover:text-blue-600">
              {place.phoneNumber}
            </a>
          </div>
        )}

        {/* Opening Hours (expandable) */}
        {place.openingHours?.weekdayText && place.openingHours.weekdayText.length > 0 && (
          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer hover:text-gray-800 flex items-center">
              <svg className="w-3.5 h-3.5 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Hours
            </summary>
            <div className="mt-1 ml-5 space-y-0.5">
              {place.openingHours.weekdayText.map((day, index) => (
                <div key={index} className="text-gray-500">{day}</div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Website Button */}
      {place.website && (
        <div className="px-3 pb-2 pt-1">
          <a
            href={place.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenWebsite?.();
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 px-3 rounded text-xs transition-colors flex items-center justify-center"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Visit Website
          </a>
        </div>
      )}
    </div>
  );
};

export default PlaceInfoPopup;
