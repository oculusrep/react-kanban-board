import React from 'react';

interface RestaurantContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  restaurant: any | null;
  onVerifyLocation: (storeNo: string) => void;
  onClose: () => void;
}

const RestaurantContextMenu: React.FC<RestaurantContextMenuProps> = ({
  x,
  y,
  isVisible,
  restaurant,
  onVerifyLocation,
  onClose,
}) => {
  if (!isVisible || !restaurant) return null;

  // Constrain menu position to viewport to prevent horizontal scrolling
  const menuWidth = 200;
  const menuHeight = 150; // approximate
  const constrainedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const constrainedY = Math.min(y, window.innerHeight - menuHeight - 10);

  return (
    <>
      {/* Backdrop to close menu */}
      <div
        className="fixed inset-0 z-[30]"
        onClick={onClose}
      />

      {/* Context Menu */}
      <div
        className="fixed z-[40] bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[200px]"
        style={{
          left: `${Math.max(10, constrainedX)}px`,
          top: `${Math.max(10, constrainedY)}px`,
        }}
      >
        {/* Header with restaurant info */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Restaurant</div>
          <div className="text-sm font-semibold text-gray-900 truncate capitalize">
            {restaurant.chain?.toLowerCase() || 'Unknown'}
          </div>
          {restaurant.geoaddress && (
            <div className="text-xs text-gray-500 truncate capitalize mt-0.5">
              {restaurant.geoaddress.toLowerCase()}
            </div>
          )}
        </div>

        {/* Menu Items */}
        <div className="py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onVerifyLocation(restaurant.store_no);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-center space-x-2"
          >
            <span>🎯</span>
            <span>Verify Pin Location</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const coords = restaurant.verified_latitude && restaurant.verified_longitude
                ? `${restaurant.verified_latitude}, ${restaurant.verified_longitude}`
                : `${restaurant.latitude}, ${restaurant.longitude}`;
              navigator.clipboard.writeText(coords);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📋</span>
            <span>Copy Coordinates</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default RestaurantContextMenu;
