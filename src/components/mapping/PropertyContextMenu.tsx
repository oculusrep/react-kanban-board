import React from 'react';

interface PropertyContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  property: any | null;
  onVerifyLocation: (propertyId: string) => void;
  onDeleteProperty?: (propertyId: string) => void;
  onCreateSiteSubmit?: (propertyId: string) => void;
  onClose: () => void;
}

const PropertyContextMenu: React.FC<PropertyContextMenuProps> = ({
  x,
  y,
  isVisible,
  property,
  onVerifyLocation,
  onDeleteProperty,
  onCreateSiteSubmit,
  onClose,
}) => {
  if (!isVisible || !property) return null;

  // Constrain menu position to viewport to prevent horizontal scrolling
  const menuWidth = 200;
  const menuHeight = 250; // approximate
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
        {/* Header with property info */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Property</div>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {property.property_name || property.address}
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onVerifyLocation(property.id);
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
              const coords = property.verified_latitude && property.verified_longitude
                ? `${property.verified_latitude}, ${property.verified_longitude}`
                : `${property.latitude}, ${property.longitude}`;
              navigator.clipboard.writeText(coords);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📋</span>
            <span>Copy Coordinates</span>
          </button>

          {/* Create Site Submit */}
          {onCreateSiteSubmit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateSiteSubmit(property.id);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 hover:text-blue-800 flex items-center space-x-2 border-t border-gray-100"
            >
              <span>📝</span>
              <span>Create Site Submit</span>
            </button>
          )}

          {/* Delete Property - Only show if handler provided */}
          {onDeleteProperty && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteProperty(property.id);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center space-x-2 border-t border-gray-100"
            >
              <span>🗑️</span>
              <span>Delete Property</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default PropertyContextMenu;