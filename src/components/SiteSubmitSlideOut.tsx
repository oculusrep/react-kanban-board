import React from 'react';
import SlideOutPanel from './SlideOutPanel';

interface SiteSubmitSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
  propertySlideoutOpen?: boolean;
  propertySlideoutMinimized?: boolean;
  rightOffset?: number; // Direct offset override
}

export default function SiteSubmitSlideOut({
  isOpen,
  onClose,
  siteSubmitId,
  propertySlideoutOpen = false,
  propertySlideoutMinimized = false,
  rightOffset: rightOffsetProp
}: SiteSubmitSlideOutProps) {
  // Calculate rightOffset based on property slideout state or use direct prop
  const rightOffset = rightOffsetProp !== undefined
    ? rightOffsetProp
    : (propertySlideoutOpen
        ? (propertySlideoutMinimized ? 48 : 900)  // 48px when minimized, 900px when expanded
        : 0);  // 0 when closed

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
