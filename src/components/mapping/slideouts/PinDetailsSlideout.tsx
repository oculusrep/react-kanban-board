import React, { useState } from 'react';

interface Property {
  id: string;
  property_name?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  property_notes?: string;
  latitude: number;
  longitude: number;
  verified_latitude?: number;
  verified_longitude?: number;
}

interface SiteSubmit {
  id: string;
  site_submit_name?: string;
  property_id: string;
  client_id?: string;
  year_1_rent?: number;
  ti?: number;
  property?: Property;
  client?: { client_name: string };
  submit_stage?: { name: string };
}

interface PinDetailsSlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  data: Property | SiteSubmit | null;
  type: 'property' | 'site_submit' | null;
}

type TabType = 'basic' | 'location' | 'units' | 'notes' | 'client' | 'financial';

const PinDetailsSlideout: React.FC<PinDetailsSlideoutProps> = ({
  isOpen,
  onClose,
  data,
  type
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [isEditing, setIsEditing] = useState(false);

  if (!data || !type) return null;

  const isProperty = type === 'property';
  const property = isProperty ? (data as Property) : (data as SiteSubmit).property;
  const siteSubmit = !isProperty ? (data as SiteSubmit) : null;

  // Tab configuration based on type
  const getAvailableTabs = (): { id: TabType; label: string; icon: string }[] => {
    const commonTabs = [
      { id: 'basic' as TabType, label: 'Basic Info', icon: '📋' },
      { id: 'location' as TabType, label: 'Location', icon: '📍' },
    ];

    if (isProperty) {
      return [
        ...commonTabs,
        { id: 'units' as TabType, label: 'Units', icon: '🏬' },
        { id: 'notes' as TabType, label: 'Notes', icon: '📝' },
      ];
    } else {
      return [
        ...commonTabs,
        { id: 'client' as TabType, label: 'Client', icon: '👤' },
        { id: 'financial' as TabType, label: 'Financial', icon: '💰' },
      ];
    }
  };

  const availableTabs = getAvailableTabs();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {isProperty ? 'Property Name' : 'Site Submit Name'}
              </label>
              <input
                type="text"
                value={isProperty ? property?.property_name || '' : siteSubmit?.site_submit_name || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
              <input
                type="text"
                value={property?.address || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  value={property?.city || ''}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ZIP</label>
                <input
                  type="text"
                  value={property?.zip || ''}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                />
              </div>
            </div>

            {!isProperty && siteSubmit?.submit_stage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stage</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                  {siteSubmit.submit_stage.name}
                </div>
              </div>
            )}
          </div>
        );

      case 'location':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Coordinates</label>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={property?.verified_latitude || property?.latitude || ''}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={property?.verified_longitude || property?.longitude || ''}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>

                {property?.verified_latitude && property?.verified_longitude && (
                  <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                    ✓ Verified coordinates available
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Location Actions</h4>
              <div className="space-y-2">
                <button className="w-full px-3 py-2 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors">
                  📍 Center Map on This Location
                </button>
                <button className="w-full px-3 py-2 text-sm bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 transition-colors">
                  🎯 Verify Pin Location
                </button>
              </div>
            </div>
          </div>
        );

      case 'client':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Client</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                {siteSubmit?.client?.client_name || 'No client assigned'}
              </div>
            </div>
          </div>
        );

      case 'financial':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year 1 Rent</label>
              <input
                type="number"
                value={siteSubmit?.year_1_rent || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">TI (Tenant Improvement)</label>
              <input
                type="number"
                value={siteSubmit?.ti || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
              />
            </div>
          </div>
        );

      case 'notes':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                rows={6}
                value={property?.property_notes || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                placeholder="Add notes about this property..."
              />
            </div>
          </div>
        );

      default:
        return <div>Content for {activeTab}</div>;
    }
  };

  return (
    <>
      {/* Slideout */}
      <div
        className={`fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-2xl transform transition-all duration-500 ease-in-out z-40 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          width: '400px',
          transitionProperty: 'transform, opacity, box-shadow',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Spring-like easing
          boxShadow: isOpen ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)' : 'none'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isProperty ? '🏢 Property Details' : '📍 Site Submit Details'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {property?.property_name || property?.address || 'Unnamed'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
            title="Close details"
          >
            <svg
              className="w-5 h-5 text-gray-400 transition-transform duration-200 hover:rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-0">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-300 transform hover:scale-105 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50 shadow-sm'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-1">
                  <span>{tab.icon}</span>
                  <span className="hidden sm:block">{tab.label}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 slideout-content">
          {renderTabContent()}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Edit {isProperty ? 'Property' : 'Site Submit'}
                </button>
              )}
            </div>

            <button className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              🔗 View Full Details
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black transition-opacity duration-500 ease-in-out z-30"
          style={{
            opacity: isOpen ? 0.3 : 0,
            backdropFilter: 'blur(2px)'
          }}
          onClick={onClose}
        />
      )}

      {/* Slide Arrow Indicator */}
      {isOpen && (
        <div
          className="fixed top-1/2 transform -translate-y-1/2 z-50 transition-all duration-700 ease-out"
          style={{
            right: '420px', // Just outside the slideout
            animation: 'slideArrow 2s ease-in-out infinite'
          }}
        >
          <div className="bg-blue-500 text-white p-2 rounded-full shadow-lg hover:bg-blue-600 transition-colors">
            <svg className="w-4 h-4 transform rotate-180" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
};

export default PinDetailsSlideout;