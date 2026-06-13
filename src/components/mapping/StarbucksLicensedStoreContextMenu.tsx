import React from 'react';
import type { StarbucksLicensedStore } from './layers/StarbucksLicensedStoreLayer';

interface StarbucksLicensedStoreContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  store: StarbucksLicensedStore | null;
  onVerifyLocation: (storeNumber: string) => void;
  onResetLocation?: (storeNumber: string) => void;
  onClose: () => void;
}

const StarbucksLicensedStoreContextMenu: React.FC<StarbucksLicensedStoreContextMenuProps> = ({
  x,
  y,
  isVisible,
  store,
  onVerifyLocation,
  onResetLocation,
  onClose,
}) => {
  if (!isVisible || !store) return null;

  const isVerified = store.verified_latitude != null && store.verified_longitude != null;

  const menuWidth = 220;
  const menuHeight = 180;
  const constrainedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const constrainedY = Math.min(y, window.innerHeight - menuHeight - 10);

  return (
    <>
      <div className="fixed inset-0 z-[30]" onClick={onClose} />

      <div
        className="fixed z-[40] bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[220px]"
        style={{
          left: `${Math.max(10, constrainedX)}px`,
          top: `${Math.max(10, constrainedY)}px`,
        }}
      >
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Licensed Store</div>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {store.store_name || `Store ${store.store_number}`}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            #{store.store_number}
            {store.store_type ? ` · ${store.store_type}` : ''}
          </div>
        </div>

        <div className="py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onVerifyLocation(store.store_number);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-center space-x-2"
          >
            <span>🎯</span>
            <span>{isVerified ? 'Move Pin Location' : 'Verify Pin Location'}</span>
          </button>

          {isVerified && onResetLocation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResetLocation(store.store_number);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center space-x-2"
            >
              <span>🔄</span>
              <span>Reset to Original Location</span>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              const lat = store.verified_latitude ?? store.latitude;
              const lng = store.verified_longitude ?? store.longitude;
              if (lat != null && lng != null) {
                navigator.clipboard.writeText(`${lat}, ${lng}`);
              }
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

export default StarbucksLicensedStoreContextMenu;
