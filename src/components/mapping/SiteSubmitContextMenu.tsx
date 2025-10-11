import React from 'react';

interface SiteSubmit {
  id: string;
  site_submit_name?: string;
  client_id: string | null;
  property_id: string | null;
  submit_stage_id: string | null;
  sf_property_latitude: number;
  sf_property_longitude: number;
  verified_latitude?: number;
  verified_longitude?: number;
  notes?: string;
  year_1_rent?: number;
  ti?: number;
  client?: {
    id: string;
    client_name: string;
  };
  submit_stage?: {
    id: string;
    name: string;
  };
  property?: {
    id: string;
    property_name?: string;
    address: string;
  };
}

interface SiteSubmitContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  siteSubmit: SiteSubmit | null;
  onVerifyLocation: (siteSubmitId: string) => void;
  onResetLocation?: (siteSubmitId: string) => void;
  onClose: () => void;
}

const SiteSubmitContextMenu: React.FC<SiteSubmitContextMenuProps> = ({
  x,
  y,
  isVisible,
  siteSubmit,
  onVerifyLocation,
  onResetLocation,
  onClose,
}) => {
  if (!isVisible || !siteSubmit) return null;

  const getDisplayCoordinates = () => {
    if (siteSubmit.verified_latitude && siteSubmit.verified_longitude) {
      return `${siteSubmit.verified_latitude}, ${siteSubmit.verified_longitude}`;
    }
    return `${siteSubmit.sf_property_latitude}, ${siteSubmit.sf_property_longitude}`;
  };

  const isVerifiedLocation = siteSubmit.verified_latitude && siteSubmit.verified_longitude;

  // Constrain menu position to viewport to prevent horizontal scrolling
  const menuWidth = 200;
  const menuHeight = 200; // approximate
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
        {/* Header with site submit info */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Site Submit</div>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {siteSubmit.site_submit_name || siteSubmit.client?.client_name || 'Site Submit'}
          </div>
          {siteSubmit.submit_stage && (
            <div className="text-xs text-blue-600 mt-1">
              {siteSubmit.submit_stage.name}
            </div>
          )}
        </div>

        {/* Menu Items */}
        <div className="py-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onVerifyLocation(siteSubmit.id);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 flex items-center space-x-2"
          >
            <span>🎯</span>
            <span>{isVerifiedLocation ? 'Move Pin Location' : 'Verify Pin Location'}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(getDisplayCoordinates());
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
          >
            <span>📋</span>
            <span>Copy Coordinates</span>
          </button>

          {isVerifiedLocation && onResetLocation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResetLocation(siteSubmit.id);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center space-x-2"
            >
              <span>🔄</span>
              <span>Reset to Property Location</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default SiteSubmitContextMenu;