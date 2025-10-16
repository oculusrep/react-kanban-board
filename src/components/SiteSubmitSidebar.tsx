import React from 'react';

interface SiteSubmitSidebarProps {
  siteSubmitId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onClose?: () => void;
  propertySlideoutOpen?: boolean;
}

const SiteSubmitSidebar: React.FC<SiteSubmitSidebarProps> = ({
  siteSubmitId,
  isMinimized = false,
  onMinimize,
  onClose,
  propertySlideoutOpen = false
}) => {
  // Calculate right position based on whether property slideout is open
  // Property slideout is 500px wide, so push site submit sidebar to the left
  const rightPosition = propertySlideoutOpen ? '500px' : '0';

  return (
    <div
      className={`fixed top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
        isMinimized ? 'w-12' : 'w-[600px]'
      } z-30 ${isMinimized ? 'overflow-hidden' : 'overflow-y-auto'}`}
      style={{
        top: '180px',
        height: 'calc(100vh - 180px)',
        right: rightPosition
      }}
    >
      {/* Header with minimize/expand controls */}
      <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
        {!isMinimized && (
          <h3 className="text-sm font-medium text-gray-700">Site Submit Info</h3>
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
