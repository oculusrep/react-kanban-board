import React from 'react';
import SlideOutPanel from './SlideOutPanel';

interface SiteSubmitSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
  propertySlideoutOpen?: boolean;
  propertySlideoutMinimized?: boolean;
}

export default function SiteSubmitSlideOut({
  isOpen,
  onClose,
  siteSubmitId,
  propertySlideoutOpen = false,
  propertySlideoutMinimized = false
}: SiteSubmitSlideOutProps) {
  // Calculate rightOffset based on property slideout state
  const rightOffset = propertySlideoutOpen
    ? (propertySlideoutMinimized ? 48 : 900)  // 48px when minimized, 900px when expanded
    : 0;  // 0 when closed

  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Site Submit Details"
      width="800px"
      rightOffset={rightOffset}
      canMinimize={true}
    >
      <iframe
        src={`/site-submit/${siteSubmitId}?embedded=true`}
        className="w-full h-full border-0"
        style={{ minHeight: 'calc(100vh - 120px)' }}
        title="Site Submit Details"
      />
    </SlideOutPanel>
  );
}
