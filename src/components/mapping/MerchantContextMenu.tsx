import React from 'react';
import type { MerchantLocationWithBrand } from './layers/MerchantLayer';

interface MerchantContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  location: MerchantLocationWithBrand | null;
  onVerifyLocation: (locationId: string) => void;
  onClose: () => void;
}

const MerchantContextMenu: React.FC<MerchantContextMenuProps> = ({
  x,
  y,
  isVisible,
  location,
  onVerifyLocation,
  onClose,
}) => {
  if (!isVisible || !location) return null;

  const menuWidth = 200;
  const menuHeight = 150;
  const constrainedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const constrainedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const displayLat = location.verified_latitude ?? location.latitude;
  const displayLng = location.verified_longitude ?? location.longitude;

  return (
    <>
      <div className="fixed inset-0 z-[30]" onClick={onClose} />

      <div
        className="fixed z-[40] bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[200px]"
        style={{
          left: `${Math.max(10, constrainedX)}px`,
          top: `${Math.max(10, constrainedY)}px`,
        }}
      >
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Merchant</div>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {location.brand.name}
          </div>
          {location.formatted_address && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {location.formatted_address}
            </div>
          )}
          {location.verified_latitude && (
            <div className="text-[10px] text-green-600 mt-1">
              ✓ Location verified
            </div>
          )}
        </div>

        <div className="py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onVerifyLocation(location.id);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-center space-x-2"
          >
            <span>🎯</span>
            <span>{location.verified_latitude ? 'Re-verify pin location' : 'Verify pin location'}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(`${displayLat}, ${displayLng}`);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📋</span>
            <span>Copy coordinates</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default MerchantContextMenu;
