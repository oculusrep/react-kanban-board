import React from 'react';
import SlideOutPanel from './SlideOutPanel';

interface PropertyDetailsSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId: string;
}

/**
 * Property Details slideout for non-map contexts
 *
 * Uses SlideOutPanel for consistent UX with Site Submit Details.
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
    >
      <iframe
        src={`/property/${propertyId}?embedded=true`}
        className="w-full h-full border-0"
        style={{ minHeight: 'calc(100vh - 120px)' }}
        title="Property Details"
      />
    </SlideOutPanel>
  );
}
