import React from 'react';
import SlideOutPanel from './SlideOutPanel';

interface SiteSubmitSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
  propertySlideoutOpen?: boolean;
}

export default function SiteSubmitSlideOut({
  isOpen,
  onClose,
  siteSubmitId,
  propertySlideoutOpen = false
}: SiteSubmitSlideOutProps) {
  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Site Submit Details"
      width="800px"
      rightOffset={propertySlideoutOpen ? 900 : 0}
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
