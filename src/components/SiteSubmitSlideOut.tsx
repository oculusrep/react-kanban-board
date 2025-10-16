import React from 'react';
import SlideOutPanel from './SlideOutPanel';

interface SiteSubmitSlideOutProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
}

export default function SiteSubmitSlideOut({
  isOpen,
  onClose,
  siteSubmitId
}: SiteSubmitSlideOutProps) {
  return (
    <SlideOutPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Site Submit Details"
      width="800px"
    >
      <iframe
        src={`/site-submit/${siteSubmitId}`}
        className="w-full h-full border-0"
        style={{ minHeight: 'calc(100vh - 120px)' }}
        title="Site Submit Details"
      />
    </SlideOutPanel>
  );
}
