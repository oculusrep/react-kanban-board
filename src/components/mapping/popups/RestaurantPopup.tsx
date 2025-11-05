import React from 'react';
import { RestaurantWithTrends } from '../layers/RestaurantLayer';

interface RestaurantPopupProps {
  restaurant: RestaurantWithTrends;
  onViewDetails?: () => void;
  onClose: () => void;
}

const RestaurantPopup: React.FC<RestaurantPopupProps> = ({
  restaurant,
  onViewDetails,
  onClose
}) => {
  // Format sales for display
  const formatSales = (salesK: number | null) => {
    if (salesK === null || salesK === undefined) return 'N/A';
    const sales = salesK * 1000;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(sales);
  };

  const latestTrend = restaurant.latest_trend;
  const coords = restaurant.verified_latitude && restaurant.verified_longitude
    ? { verified: true }
    : { verified: false };

  // Format ZIP code without decimal
  const formatZip = (zip: string | null) => {
    if (!zip) return '';
    // Remove decimal places if present
    return zip.split('.')[0];
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 w-64">
      {/* Header */}
      <div className="bg-red-600 text-white px-3 py-2 rounded-t-lg flex items-center justify-between">
        <h3 className="font-semibold text-sm truncate capitalize">
          {restaurant.chain?.toLowerCase() || 'Restaurant'}
        </h3>
        <button
          onClick={onClose}
          className="text-white hover:text-red-100 ml-2 flex-shrink-0"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-1">
        {/* Address - small gray text, no label */}
        {restaurant.geoaddress && (
          <div className="text-xs text-gray-500 capitalize">
            {restaurant.geoaddress.toLowerCase()}
          </div>
        )}

        {/* City, State, ZIP - small gray text */}
        {(restaurant.geocity || restaurant.geostate) && (
          <div className="text-xs text-gray-500 capitalize">
            {restaurant.geocity && <span>{restaurant.geocity.toLowerCase()}</span>}
            {restaurant.geocity && restaurant.geostate && <span>, </span>}
            {restaurant.geostate && <span>{restaurant.geostate}</span>}
            {restaurant.geozip && <span> {formatZip(restaurant.geozip)}</span>}
          </div>
        )}

        {/* Latest Sales Data - Large and Bold */}
        {latestTrend && (
          <>
            <div className="border-t border-gray-200 pt-2 mt-2" />
            <div className="text-center">
              <div className="text-xs text-gray-600 mb-1">{latestTrend.year} Sales</div>
              <div className="text-lg font-bold text-gray-900">
                {formatSales(latestTrend.curr_annual_sls_k)}
              </div>
            </div>
            {latestTrend.curr_natl_grade && (
              <div className="text-xs text-gray-700 text-center mt-1">
                <span className="font-medium">Grade:</span> {latestTrend.curr_natl_grade}
              </div>
            )}
          </>
        )}

        {/* Year Built - at bottom in gray */}
        {restaurant.yr_built && (
          <div className="text-xs text-gray-500 text-center mt-2">
            Built {restaurant.yr_built}
          </div>
        )}
      </div>

      {/* View Details Button */}
      {onViewDetails && (
        <div className="px-3 pb-2 pt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-1.5 px-3 rounded text-xs transition-colors"
          >
            📊 View Trend Details
          </button>
        </div>
      )}
    </div>
  );
};

export default RestaurantPopup;
