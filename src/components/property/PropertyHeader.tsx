import React from 'react';
import { Database } from '../../../database-schema';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];

interface PropertyWithRelations extends Property {
  property_type?: PropertyType;
  property_stage?: PropertyStage;
}

interface PropertyHeaderProps {
  property: PropertyWithRelations;
  isEditing: boolean;
  onToggleEdit: () => void;
  onBack: () => void;
  onGetLocation?: () => void;
  onCallContact?: () => void;
  onDelete?: () => void;
  onOpenMap?: () => void;
}

const PropertyHeader: React.FC<PropertyHeaderProps> = ({
  property,
  isEditing,
  onToggleEdit,
  onBack,
  onGetLocation,
  onCallContact,
  onDelete,
  onOpenMap
}) => {
  const getStageColor = (stageLabel?: string): string => {
    if (!stageLabel) return 'bg-gray-100 text-gray-800 border-gray-200';
    
    const stageColors: Record<string, string> = {
      'Prospecting': 'bg-blue-100 text-blue-800 border-blue-200',
      'Qualified': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Under Contract': 'bg-purple-100 text-purple-800 border-purple-200',
      'Closed': 'bg-green-100 text-green-800 border-green-200',
      'Lost': 'bg-red-100 text-red-800 border-red-200',
    };
    return stageColors[stageLabel] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const PropertyIcon = () => (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );

  return (
    <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white shadow-sm">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          {/* Back Button & Property Label */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 rounded-lg">
              <PropertyIcon />
              <span className="text-white text-sm font-medium">Property</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {onGetLocation && (
              <button
                onClick={onGetLocation}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors"
                title="Get current location"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
            
            {onCallContact && property.contact_id && (
              <button
                onClick={onCallContact}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-600 hover:bg-green-500 transition-colors"
                title="Call contact"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            )}

            {onOpenMap && property.id && (
              <button
                onClick={onOpenMap}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors"
                title="Open on map"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </button>
            )}

            {onDelete && property.id && (
              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
                title="Delete Property"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}

          </div>
        </div>

        {/* Property Title and Stage */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold leading-tight mb-2">
              {property.property_name || property.address || 'Unnamed Property'}
            </h1>
            {property.address && property.property_name && (
              <p className="text-slate-300 text-sm">{property.address}</p>
            )}
          </div>

        </div>

        {/* Property Type and Key Info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 text-sm">
          <div>
            <div className="text-slate-300 font-medium mb-1">Type</div>
            <div className="text-white">
              {property.property_type?.label || 'Not set'}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Building Size</div>
            <div className="text-white">
              {property.building_sqft ? `${property.building_sqft.toLocaleString()} SF` : 'Not set'}
            </div>
          </div>

          <div>
            <div className="text-slate-300 font-medium mb-1">Available Size</div>
            <div className="text-white">
              {property.available_sqft ? `${property.available_sqft.toLocaleString()} SF` : 'Not set'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyHeader;