import React from 'react';

interface MapContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  coordinates: { lat: number; lng: number } | null;
  onCreateProperty: () => void;
  onClose: () => void;
}

const MapContextMenu: React.FC<MapContextMenuProps> = ({
  x,
  y,
  isVisible,
  coordinates,
  onCreateProperty,
  onClose,
}) => {
  if (!isVisible || !coordinates) return null;

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
          left: `${x}px`,
          top: `${y}px`,
        }}
      >
        {/* Header with coordinates */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Location</div>
          <div className="text-xs font-mono text-gray-700">
            {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateProperty();
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2"
          >
            <span>🏢</span>
            <span>Create Property Here</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(`${coordinates.lat}, ${coordinates.lng}`);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📋</span>
            <span>Copy Coordinates</span>
          </button>

          <a
            href={`https://www.google.com/maps?q=${coordinates.lat},${coordinates.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2 no-underline"
          >
            <span>🗺️</span>
            <span>View in Google Maps</span>
          </a>
        </div>
      </div>
    </>
  );
};

export default MapContextMenu;