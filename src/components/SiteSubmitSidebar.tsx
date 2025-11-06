import React, { useRef } from 'react';

interface SiteSubmitSidebarProps {
  siteSubmitId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onClose?: () => void;
  propertySlideoutOpen?: boolean;
  propertySlideoutMinimized?: boolean;
}

const SiteSubmitSidebar: React.FC<SiteSubmitSidebarProps> = ({
  siteSubmitId,
  isMinimized = false,
  onMinimize,
  onClose,
  propertySlideoutOpen = false,
  propertySlideoutMinimized = false
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Calculate right position based on property slideout state
  // Property slideout is 900px wide when expanded, 48px when minimized
  const rightPosition = propertySlideoutOpen
    ? (propertySlideoutMinimized ? '48px' : '900px')
    : '0';

  // Handle Submit Site button click
  const handleSubmitSite = () => {
    if (iframeRef.current?.contentWindow) {
      // Send message to iframe to trigger email send
      iframeRef.current.contentWindow.postMessage({
        type: 'SUBMIT_SITE',
        siteSubmitId: siteSubmitId
      }, '*');
    }
  };

  return (
    <div
      className={`fixed top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
        isMinimized ? 'w-12' : 'w-[600px]'
      } z-50 ${isMinimized ? 'overflow-hidden' : 'overflow-y-auto'}`}
      style={{
        top: '180px',
        height: 'calc(100vh - 180px)',
        right: rightPosition
      }}
    >
      {/* Header with minimize/expand controls */}
      <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
        {!isMinimized && (
          <div className="flex items-center gap-2 flex-1">
            <h3 className="text-sm font-medium text-gray-700">Site Submit Info</h3>
            <button
              onClick={handleSubmitSite}
              className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 flex items-center gap-1.5"
              title="Submit site via email"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              Submit Site
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {!isMinimized && onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 hover:text-gray-600 rounded-md transition-colors text-gray-500"
              title="Close sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={onMinimize}
            className={`p-2 hover:bg-blue-100 hover:text-blue-600 rounded-md transition-colors group ${
              isMinimized ? 'text-gray-600' : 'text-gray-500'
            }`}
            title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMinimized ? (
                // Expand icon
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M4 12h16" />
              ) : (
                // Minimize icon
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M20 12H4" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Sidebar Content - iframe with full page */}
      {!isMinimized && (
        <div className="h-full">
          <iframe
            ref={iframeRef}
            src={`/site-submit/${siteSubmitId}?embedded=true`}
            className="w-full h-full border-0"
            title="Site Submit Details"
          />
        </div>
      )}
    </div>
  );
};

export default SiteSubmitSidebar;
