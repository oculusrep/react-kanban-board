import React, { useEffect, useState } from 'react';
import type { MerchantLocationWithBrand } from './layers/MerchantLayer';

interface MerchantContextMenuProps {
  x: number;
  y: number;
  isVisible: boolean;
  location: MerchantLocationWithBrand | null;
  /** Pin-drag verification is permission-gated; removal is not. */
  canVerify?: boolean;
  onVerifyLocation: (locationId: string) => void;
  /**
   * Remove this pin for everyone. Resolves once the exclusion is persisted;
   * rejects with a message to show inline.
   */
  onRemoveLocation?: (locationId: string, reason: string | null) => Promise<void>;
  onClose: () => void;
}

const MerchantContextMenu: React.FC<MerchantContextMenuProps> = ({
  x,
  y,
  isVisible,
  location,
  canVerify = false,
  onVerifyLocation,
  onRemoveLocation,
  onClose,
}) => {
  // Two-step removal: the menu item opens a confirm panel with an optional
  // reason, because this action applies to every user and isn't self-undoable.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [reason, setReason] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Reset per-open, so a previous confirm/error doesn't leak into the next pin.
  useEffect(() => {
    if (!isVisible) {
      setConfirmingRemove(false);
      setReason('');
      setRemoving(false);
      setRemoveError(null);
    }
  }, [isVisible, location?.id]);

  if (!isVisible || !location) return null;

  const menuWidth = 260;
  const menuHeight = confirmingRemove ? 260 : 180;
  const constrainedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const constrainedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const displayLat = location.verified_latitude ?? location.latitude;
  const displayLng = location.verified_longitude ?? location.longitude;

  const handleRemove = async () => {
    if (!onRemoveLocation) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemoveLocation(location.id, reason.trim() || null);
      onClose();
    } catch (e: any) {
      setRemoveError(e?.message || 'Failed to remove this pin.');
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[30]" onClick={onClose} />

      <div
        className="fixed z-[40] bg-white rounded-lg shadow-xl border border-gray-200 py-2"
        style={{
          left: `${Math.max(10, constrainedX)}px`,
          top: `${Math.max(10, constrainedY)}px`,
          width: `${menuWidth}px`,
        }}
      >
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs text-gray-500 font-medium">Merchant</div>
          <div className="text-sm font-semibold text-gray-900 truncate">
            {location.brand.name}
          </div>
          {location.name && location.name !== location.brand.name && (
            <div className="text-xs text-gray-600 truncate">{location.name}</div>
          )}
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

        {confirmingRemove ? (
          <div className="px-3 py-2">
            <div className="text-sm font-medium text-gray-900">Remove this pin?</div>
            <div className="text-xs text-gray-500 mt-1">
              It disappears from the map for <span className="font-medium">everyone</span>, and
              stays gone through future Google Places refreshes. An admin can restore it.
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional) — e.g. bike shop, not this brand"
              autoFocus
              className="mt-2 w-full text-xs px-2 py-1.5 border border-gray-300 rounded outline-none focus:border-[#4A6B94]"
            />
            {removeError && (
              <div className="mt-2 text-xs text-red-600">{removeError}</div>
            )}
            <div className="mt-2 flex justify-end space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingRemove(false);
                  setRemoveError(null);
                }}
                disabled={removing}
                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                disabled={removing}
                className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-60"
              >
                {removing ? 'Removing…' : 'Remove for everyone'}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-1">
            {canVerify && (
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
            )}

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

            {onRemoveLocation && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingRemove(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 border-t border-gray-100 mt-1 pt-2"
              >
                <span>🗑️</span>
                <span>Remove this pin (wrong merchant)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default MerchantContextMenu;
