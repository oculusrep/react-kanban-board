import React, { useState, useEffect } from 'react';
import { Database } from '../../../database-schema';
import PropertyInputField from './PropertyInputField';
import PropertySelectField from './PropertySelectField';
import PropertyAutocompleteField from './PropertyAutocompleteField';
import { checkForLegacyRecordType } from '../../utils/propertyRecordTypeUtils';
import RecordMetadata from '../RecordMetadata';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];

interface PropertyDetailsSectionProps {
  property: Property;
  isEditing: boolean;
  onFieldUpdate: (field: keyof Property, value: any) => void;
  propertyRecordTypes?: PropertyRecordType[];
  dropboxSyncError?: string | null;
  onRetryDropboxSync?: () => void;
}

const PropertyDetailsSection: React.FC<PropertyDetailsSectionProps> = ({
  property,
  isEditing,
  onFieldUpdate,
  propertyRecordTypes = [],
  dropboxSyncError,
  onRetryDropboxSync
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [legacyRecordType, setLegacyRecordType] = useState<string | null>(null);

  // Check for legacy record type data
  useEffect(() => {
    const loadLegacyData = async () => {
      if (property.id && !property.property_record_type_id) {
        const legacy = await checkForLegacyRecordType(property.id);
        console.log('🔍 Legacy RecordTypeId found:', legacy);
        setLegacyRecordType(legacy);
      }
    };
    
    loadLegacyData();
  }, [property.id, property.property_record_type_id]);

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Property Details</h3>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transform transition-transform ${
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
        <div className="mt-3 space-y-3">
          {/* Property Record Type and Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <PropertySelectField
                label="Property Record Type"
                value={property.property_record_type_id}
                onChange={(value) => onFieldUpdate('property_record_type_id', value)}
                options={propertyRecordTypes.map(type => ({ id: type.id, label: type.label }))}
                placeholder={propertyRecordTypes.length === 0 ? "No record types available" : "Select record type..."}
                disabled={propertyRecordTypes.length === 0}
                tabIndex={1}
              />
              {/* Show legacy data if it exists */}
              {legacyRecordType && !property.property_record_type_id && (
                <div className="mt-1 text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                  Salesforce RecordTypeId: {legacyRecordType}
                </div>
              )}
            </div>

            <div>
              <PropertyInputField
                label="Property Name"
                value={property.property_name}
                onChange={(value) => onFieldUpdate('property_name', value)}
                placeholder="Property name or identifier"
                tabIndex={2}
              />
              {/* Show Dropbox sync error with retry button */}
              {dropboxSyncError && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-yellow-800 font-medium">Dropbox Sync Warning</p>
                      <p className="text-sm text-yellow-700 mt-1">{dropboxSyncError}</p>
                      {onRetryDropboxSync && (
                        <button
                          onClick={onRetryDropboxSync}
                          className="mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
                        >
                          Retry Sync
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <PropertyInputField
            label="Property Description"
            value={property.description}
            onChange={(value) => onFieldUpdate('description', value)}
            placeholder="Brief description of the property..."
            multiline={true}
            rows={3}
            tabIndex={3}
          />

          {/* Basic Market Information */}
          <div className="border-t border-gray-200 pt-3">
            <h4 className="text-xs font-medium text-gray-900 mb-2">Location Details</h4>
            <PropertyAutocompleteField
              label="Trade Area"
              value={property.trade_area}
              onChange={(value) => onFieldUpdate('trade_area', value)}
              field="trade_area"
              placeholder="Downtown, Suburb, etc."
              tabIndex={4}
            />
          </div>

          {/* Record Metadata */}
          {property.id && (
            <RecordMetadata
              createdAt={property.created_at}
              createdById={property.created_by_id}
              updatedAt={property.updated_at}
              updatedById={property.updated_by_id}
            />
          )}

        </div>
      )}
    </section>
  );
};

export default PropertyDetailsSection;