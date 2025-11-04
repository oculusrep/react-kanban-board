import React from 'react';
import SlideOutPanel from './SlideOutPanel';
import PropertyDetailsSlideoutContent from './PropertyDetailsSlideoutContent';

interface PropertyDetailsSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
  isMinimized?: boolean;
  onMinimizeChange?: (minimized: boolean) => void;
  onSiteSubmitClick?: (siteSubmitId: string) => void;
}

/**
 * Property Details slideout for non-map contexts
 *
 * Uses SlideOutPanel with tab-based content for clean UX.
 * For map contexts, use PinDetailsSlideout instead.
 */
const PropertyDetailsSlideOut = React.memo(function PropertyDetailsSlideOut({
  isOpen,
  onClose,
  propertyId,
  isMinimized,
  onMinimizeChange,
  onSiteSubmitClick
}: PropertyDetailsSlideOutProps) {
  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Property Details"
      width="900px"
      canMinimize={true}
      isMinimized={isMinimized}
      onMinimizeChange={onMinimizeChange}
    >
      <PropertyDetailsSlideoutContent
        propertyId={propertyId}
        onSiteSubmitClick={onSiteSubmitClick}
      />
    </SlideOutPanel>
  );
});

export default PropertyDetailsSlideOut;
