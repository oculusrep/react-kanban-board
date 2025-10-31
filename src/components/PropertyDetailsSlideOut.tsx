import React from 'react';
import SlideOutPanel from './SlideOutPanel';
import PropertyDetailsSlideoutContent from './PropertyDetailsSlideoutContent';

interface PropertyDetailsSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
}

/**
 * Property Details slideout for non-map contexts
 *
 * Uses SlideOutPanel with tab-based content for clean UX.
 * For map contexts, use PinDetailsSlideout instead.
 */
export default function PropertyDetailsSlideOut({
  isOpen,
  onClose,
  propertyId
}: PropertyDetailsSlideOutProps) {
  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Property Details"
      width="900px"
      canMinimize={true}
    >
      <PropertyDetailsSlideoutContent propertyId={propertyId} />
    </SlideOutPanel>
  );
}
