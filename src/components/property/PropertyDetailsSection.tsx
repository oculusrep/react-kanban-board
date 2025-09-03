import React, { useState } from 'react';
import { Database } from '../../../database-schema';
import PropertyInputField from './PropertyInputField';
import PropertySelectField from './PropertySelectField';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];

interface PropertyDetailsSectionProps {
  property: Property;
  isEditing: boolean;
  onFieldUpdate: (field: keyof Property, value: any) => void;
  propertyTypes?: PropertyType[];
}

const PropertyDetailsSection: React.FC<PropertyDetailsSectionProps> = ({
  property,
  isEditing,
  onFieldUpdate,
  propertyTypes = []
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">Property Details</h3>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-6">
          {/* Property Type and Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PropertySelectField
              label="Property Type"
              value={property.property_type_id}
              onChange={(value) => onFieldUpdate('property_type_id', value)}
              options={propertyTypes.map(type => ({ id: type.id, label: type.label }))}
              placeholder="Select property type..."
            />

            <PropertyInputField
              label="Property Name"
              value={property.property_name}
              onChange={(value) => onFieldUpdate('property_name', value)}
              placeholder="Property name or identifier"
            />
          </div>

          <PropertyInputField
            label="Property Description"
            value={property.description}
            onChange={(value) => onFieldUpdate('description', value)}
            placeholder="Brief description of the property..."
            multiline={true}
            rows={3}
          />

          {/* Basic Market Information */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Location Details</h4>
            <PropertyInputField
              label="Trade Area"
              value={property.trade_area}
              onChange={(value) => onFieldUpdate('trade_area', value)}
              placeholder="Downtown, Suburb, etc."
            />
          </div>

        </div>
      )}
    </section>
  );
};

export default PropertyDetailsSection;