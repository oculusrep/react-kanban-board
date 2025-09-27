import React, { useState, useEffect } from 'react';

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
  submit_stage_id?: string;
  year_1_rent?: number;
  ti?: number;
  notes?: string;
  // New fields for Submit tab
  property_unit?: string;
  sf_property_unit?: string; // Database field name
  date_submitted?: string;
  loi_written?: boolean;
  loi_date?: string;
  delivery_date?: string;
  delivery_timeframe?: string;
  created_at?: string;
  updated_at?: string;
  // Related data
  property?: Property;
  client?: { client_name: string };
  submit_stage?: { id: string; name: string };
  property_unit?: { property_unit_name: string };
}

interface PinDetailsSlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  data: Property | SiteSubmit | null;
  type: 'property' | 'site_submit' | null;
  onVerifyLocation?: (propertyId: string) => void;
  isVerifyingLocation?: boolean;
}

type TabType = 'property' | 'submit' | 'financial' | 'activity' | 'location';

const PinDetailsSlideout: React.FC<PinDetailsSlideoutProps> = ({
  isOpen,
  onClose,
  onOpen,
  data,
  type,
  onVerifyLocation,
  isVerifyingLocation = false
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(type === 'site_submit' ? 'submit' : 'property');
  const [isEditing, setIsEditing] = useState(false);
  const [propertyStatus, setPropertyStatus] = useState<'lease' | 'purchase'>('lease');

  // Reset to default tab when type changes
  useEffect(() => {
    setActiveTab(type === 'site_submit' ? 'submit' : 'property');
  }, [type]);

  if (!data || !type) return null;

  const isProperty = type === 'property';
  const property = isProperty ? (data as Property) : (data as SiteSubmit).property;
  const siteSubmit = !isProperty ? (data as SiteSubmit) : null;

  // Tab configuration based on type
  const getAvailableTabs = (): { id: TabType; label: string; icon: string }[] => {
    if (isProperty) {
      return [
        { id: 'property' as TabType, label: 'PROPERTY', icon: '🏢' },
        { id: 'financial' as TabType, label: 'FINANCIAL', icon: '💰' },
        { id: 'activity' as TabType, label: 'ACTIVITY', icon: '📋' },
        { id: 'location' as TabType, label: 'LOCATION', icon: '📍' },
      ];
    } else {
      return [
        { id: 'submit' as TabType, label: 'SUBMIT', icon: '📝' },
        { id: 'financial' as TabType, label: 'FINANCIAL', icon: '💰' },
        { id: 'activity' as TabType, label: 'ACTIVITY', icon: '📋' },
        { id: 'location' as TabType, label: 'LOCATION', icon: '📍' },
      ];
    }
  };

  const availableTabs = getAvailableTabs();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'submit':
        return (
          <div className="space-y-3">
            {/* Submit Stage - Editable */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
              <select
                value={siteSubmit?.submit_stage?.name || ''}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              >
                <option value="">Select Stage...</option>
                <option value="Submitted-Reviewing">Submitted-Reviewing</option>
                <option value="Ready to Submit">Ready to Submit</option>
                <option value="Pre-Submittal">Pre-Submittal</option>
                <option value="Mike to Review">Mike to Review</option>
                <option value="Pursuing Ownership">Pursuing Ownership</option>
                <option value="Pass">Pass</option>
                <option value="Use Declined">Use Declined</option>
                <option value="Use Conflict">Use Conflict</option>
                <option value="Not Available">Not Available</option>
                <option value="Protected">Protected</option>
                <option value="Unassigned Territory">Unassigned Territory</option>
                <option value="Lost / Killed">Lost / Killed</option>
                <option value="Monitor">Monitor</option>
                <option value="LOI">LOI</option>
                <option value="At Lease/PSA">At Lease/PSA</option>
                <option value="Under Contract / Contingent">Under Contract / Contingent</option>
                <option value="Booked">Booked</option>
                <option value="Executed Deal">Executed Deal</option>
                <option value="Closed - Under Construction">Closed - Under Construction</option>
                <option value="Store Open">Store Open</option>
              </select>
            </div>

            {/* Property Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Property Name</label>
              <input
                type="text"
                value={siteSubmit?.property?.property_name || ''}
                disabled={!isEditing}
                placeholder="Enter property name..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Property Unit (if not null) */}
            {(siteSubmit?.property_unit?.property_unit_name || siteSubmit?.sf_property_unit) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Property Unit</label>
                <input
                  type="text"
                  value={siteSubmit?.property_unit?.property_unit_name || siteSubmit?.sf_property_unit || ''}
                  disabled={!isEditing}
                  placeholder="Enter unit name..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
                />
              </div>
            )}

            {/* Date Submitted */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date Submitted</label>
              <input
                type="date"
                value={
                  siteSubmit?.date_submitted ||
                  (siteSubmit?.created_at ? siteSubmit.created_at.split('T')[0] : '')
                }
                disabled={!isEditing}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* LOI Written Boolean */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">LOI Written</label>
              <div className="flex items-center space-x-3">
                <label className="flex items-center text-sm">
                  <input
                    type="radio"
                    name="loi_written"
                    checked={siteSubmit?.loi_written === true}
                    disabled={!isEditing}
                    className="mr-1 scale-90"
                  />
                  Yes
                </label>
                <label className="flex items-center text-sm">
                  <input
                    type="radio"
                    name="loi_written"
                    checked={siteSubmit?.loi_written === false}
                    disabled={!isEditing}
                    className="mr-1 scale-90"
                  />
                  No
                </label>
              </div>
            </div>

            {/* LOI Date (shows if LOI Written is true) */}
            {siteSubmit?.loi_written && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">LOI Date</label>
                <input
                  type="date"
                  value={siteSubmit?.loi_date ? siteSubmit.loi_date.split('T')[0] : ''}
                  disabled={!isEditing}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
                />
              </div>
            )}

            {/* Delivery Date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Date</label>
              <input
                type="date"
                value={siteSubmit?.delivery_date ? siteSubmit.delivery_date.split('T')[0] : ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Delivery Timeframe */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Timeframe</label>
              <input
                type="text"
                value={siteSubmit?.delivery_timeframe || ''}
                disabled={!isEditing}
                placeholder="e.g., 60-90 days..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>

            {/* Year 1 Rent & TI in same row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Year 1 Rent</label>
                <input
                  type="number"
                  value={siteSubmit?.year_1_rent || ''}
                  disabled={!isEditing}
                  placeholder="Amount..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">TI</label>
                <input
                  type="number"
                  value={siteSubmit?.ti || ''}
                  disabled={!isEditing}
                  placeholder="Amount..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={3}
                value={siteSubmit?.notes || ''}
                disabled={!isEditing}
                placeholder="Enter notes..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600"
              />
            </div>
          </div>
        );

      case 'property':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                {isProperty ? 'Property Name' : 'Site Submit Name'}
              </label>
              <input
                type="text"
                value={isProperty ? property?.property_name || '' : siteSubmit?.site_submit_name || ''}
                disabled={!isEditing}
                placeholder="Enter value..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Address</label>
              <input
                type="text"
                value={property?.address || ''}
                disabled={!isEditing}
                placeholder="Enter address..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 transition-all duration-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">City</label>
                <input
                  type="text"
                  value={property?.city || ''}
                  disabled={!isEditing}
                  placeholder="Enter city..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 transition-all duration-200"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">ZIP</label>
                <input
                  type="text"
                  value={property?.zip || ''}
                  disabled={!isEditing}
                  placeholder="Enter ZIP..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 transition-all duration-200"
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
                <button
                  onClick={() => onVerifyLocation && property && onVerifyLocation(property.id)}
                  disabled={!onVerifyLocation || !property || isVerifyingLocation}
                  className={`w-full px-3 py-2 text-sm border rounded-md transition-colors ${
                    isVerifyingLocation
                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                      : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isVerifyingLocation ? '🔄 Drag Pin to Verify...' : '🎯 Verify Pin Location'}
                </button>
              </div>
            </div>
          </div>
        );

      case 'financial':
        return (
          <div className="space-y-6">
            {isProperty ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Market Rent PSF</label>
                    <input
                      type="number"
                      placeholder="Enter value..."
                      disabled={!isEditing}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Annual Gross Rent</label>
                    <input
                      type="number"
                      placeholder="$ 0"
                      disabled={!isEditing}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600 transition-all duration-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Lease Type</label>
                    <select
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    >
                      <option>Full Service/Modified Gross</option>
                      <option>Triple Net</option>
                      <option>Gross</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Square Footage</label>
                    <input
                      type="number"
                      placeholder="Enter value..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Tenant Allowance PSF</label>
                    <input
                      type="number"
                      placeholder="$ 0"
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Leasing Agent</label>
                    <input
                      type="text"
                      placeholder="Enter name..."
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Year 1 Rent</label>
                  <input
                    type="number"
                    value={siteSubmit?.year_1_rent || ''}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">TI (Tenant Improvement)</label>
                  <input
                    type="number"
                    value={siteSubmit?.ti || ''}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                  />
                </div>
              </>
            )}
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
              <textarea
                rows={6}
                value={property?.property_notes || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                placeholder="Enter value..."
              />
            </div>
            {!isProperty && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Client</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                  {siteSubmit?.client?.client_name || 'No client assigned'}
                </div>
              </div>
            )}
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
        className={`fixed right-0 bg-white border-l border-gray-200 shadow-2xl transform transition-all duration-500 ease-in-out z-40 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          top: '67px', // Snap directly under the nav bar (precise measurement)
          height: 'calc(100vh - 67px)', // Full height minus exact nav bar height
          width: '400px',
          transitionProperty: 'transform, opacity, box-shadow',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Spring-like easing
          boxShadow: isOpen ? '0 25px 50px -12px rgba(0, 0, 0, 0.25)' : 'none'
        }}
      >
        {/* Hero Section */}
        <div className="relative">
          {/* Hero Image */}
          <div className="h-48 bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 relative overflow-hidden">
            {/* Property Image Placeholder */}
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-4xl mb-2">🏢</div>
                <div className="text-sm opacity-90">Property Image</div>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-black bg-opacity-20 hover:bg-black hover:bg-opacity-40 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
              title="Close details"
            >
              <svg
                className="w-5 h-5 text-white transition-transform duration-200 hover:rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* "SEE IN PIPELINE" Badge */}
            <div className="absolute top-4 left-4">
              <div className="bg-orange-500 text-white px-3 py-1 rounded text-xs font-semibold">
                SEE IN PIPELINE
              </div>
            </div>
          </div>

          {/* Property Header Info */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">
                  {property?.property_name || property?.address || 'Unnamed Property'}
                </h1>
                <p className="text-sm text-gray-600 mb-3">
                  by {property?.city || 'Unknown Location'}
                </p>

                {/* Property Status */}
                <div className="flex items-center space-x-3 mb-4">
                  <div className="text-sm text-gray-600 font-medium">Property is for...</div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPropertyStatus('lease')}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${
                        propertyStatus === 'lease'
                          ? 'bg-orange-100 text-orange-700 border-orange-200 shadow-sm'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {propertyStatus === 'lease' ? '●' : '○'} Lease
                    </button>
                    <button
                      onClick={() => setPropertyStatus('purchase')}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 ${
                        propertyStatus === 'purchase'
                          ? 'bg-orange-100 text-orange-700 border-orange-200 shadow-sm'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {propertyStatus === 'purchase' ? '●' : '○'} Purchase
                    </button>
                  </div>
                </div>
              </div>

              {/* User Avatar */}
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-600">J</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex space-x-0 px-6">
            {availableTabs.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-6 py-4 text-sm font-semibold transition-all duration-200 border-b-3 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-white'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                } ${index === 0 ? '' : 'ml-8'}`}
              >
                <div className="flex items-center justify-center">
                  <span className="font-medium tracking-wide">{tab.label}</span>
                </div>

                {/* Active tab indicator */}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{
            scrollBehavior: 'smooth',
            minHeight: 0 // Ensures flex-1 works properly with overflow
          }}
        >
          {renderTabContent()}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          {isEditing ? (
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md"
              >
                SAVE CHANGES
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-200 font-medium text-sm"
              >
                CANCEL
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Primary Action Buttons */}
              <div className="flex items-center space-x-2">
                {isProperty && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-all duration-200 font-medium text-sm"
                  >
                    EDIT PROPERTY
                  </button>
                )}
                <button className="flex-1 px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-all duration-200 font-medium text-sm">
                  VIEW IN PIPELINE
                </button>
              </div>

              {/* Tertiary Actions */}
              <div className="flex items-center justify-center pt-1">
                <button className="text-xs text-gray-500 hover:text-gray-700 transition-colors font-medium">
                  VIEW FULL DETAILS →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>


      {/* Slide Out Arrow - When slideout is open */}
      {isOpen && (
        <div
          className="fixed z-[60] transition-all duration-300 ease-out cursor-pointer"
          style={{
            top: 'calc(50vh + 33.5px)', // Center of visible slideout area (50% + half of nav bar height)
            right: '395px', // Just outside the slideout border
            transform: 'translateY(-50%)'
          }}
          onClick={onClose}
        >
          <div className="bg-white border-2 border-gray-300 text-gray-600 px-2 py-3 rounded-l-md shadow-xl hover:bg-gray-50 hover:text-gray-800 hover:border-gray-400 transition-all duration-200">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}

      {/* Slide In Arrow - When slideout is closed but property is selected */}
      {!isOpen && data && (
        <div
          className="fixed z-50 transition-all duration-300 ease-out cursor-pointer"
          style={{
            top: 'calc(50vh + 33.5px)', // Center of available map area (accounting for nav bar)
            right: '20px',
            transform: 'translateY(-50%)',
            animation: 'slideArrow 2s ease-in-out infinite'
          }}
          onClick={onOpen}
        >
          <div className="bg-blue-500 text-white p-3 rounded-l-lg shadow-lg hover:bg-blue-600 transition-all duration-200">
            <svg className="w-5 h-5 transform rotate-180" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
};

export default PinDetailsSlideout;