import React from 'react';
import { Database } from '../../../database-schema';
import PropertyInputField from './PropertyInputField';
import PropertyCurrencyField from './PropertyCurrencyField';
import PropertyPSFField from './PropertyPSFField';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];

interface PropertyWithRelations extends Property {
  property_record_type?: PropertyRecordType;
}

interface FinancialSectionProps {
  property: PropertyWithRelations;
  onFieldUpdate: (field: keyof Property, value: any) => void;
}

const FinancialSection: React.FC<FinancialSectionProps> = ({
  property,
  onFieldUpdate
}) => {
  // Get current property record type info
  const propertyRecordTypeLabel = property.property_record_type?.label?.toLowerCase() || '';

  // Determine which fields to show based on property record type
  const isLandType = propertyRecordTypeLabel.includes('land');
  const isShoppingCenterType = propertyRecordTypeLabel.includes('shopping') || propertyRecordTypeLabel.includes('retail');

  // For now, show different field sets based on type
  const showLeaseFields = !isLandType && !isShoppingCenterType; // Show lease fields for non-land, non-shopping center properties
  const showPSFFields = !isLandType; // Show PSF for all building types (including shopping centers)
  const showSquareFootageFields = !isLandType; // Show SF for buildings

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900">Financial Information</h3>
      </div>

      {/* Conditional Pricing Fields */}
      {showLeaseFields && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <PropertyCurrencyField
            label="Asking Lease Price"
            value={property.asking_lease_price}
            onChange={(value) => onFieldUpdate('asking_lease_price', value)}
            helpText="Annual lease amount"
            showLarge={true}
            colorScheme="green"
            tabIndex={14}
          />
        </div>
      )}

      {/* Per Square Foot Rates - Only for leasable properties */}
      {showPSFFields && (
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Per Square Foot Rates</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PropertyPSFField
              label="Rent PSF"
              value={property.rent_psf}
              onChange={(value) => onFieldUpdate('rent_psf', value)}
              helpText="Base rent per square foot"
              tabIndex={15}
            />

            <PropertyPSFField
              label="NNN PSF"
              value={property.nnn_psf}
              onChange={(value) => onFieldUpdate('nnn_psf', value)}
              helpText="Triple net charges per square foot"
              tabIndex={16}
            />
          </div>

          {/* Calculate total rent if both values available */}
          {property.rent_psf && property.nnn_psf && property.available_sqft && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <div className="text-sm font-medium text-blue-900 mb-1">All-In Rent Calculation</div>
              <div className="text-lg font-bold text-blue-700">
                ${((property.rent_psf + property.nnn_psf)).toFixed(2)} / SF
              </div>
              <div className="text-sm text-blue-600">
                Total annual: ${((property.rent_psf + property.nnn_psf) * property.available_sqft).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Square Footage - Only for buildings */}
      {showSquareFootageFields && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Square Footage</h4>
          {isShoppingCenterType ? (
            // Shopping Centers - Just Available Sqft
            <div className="grid grid-cols-1 gap-4">
              <PropertyInputField
                label="Available Sqft"
                value={property.available_sqft}
                onChange={(value) => onFieldUpdate('available_sqft', value)}
                type="number"
                placeholder="0"
                tabIndex={17}
              />
            </div>
          ) : (
            // Other building types - Full square footage details
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PropertyInputField
                  label="Building Size"
                  value={property.building_sqft}
                  onChange={(value) => onFieldUpdate('building_sqft', value)}
                  type="number"
                  placeholder="0"
                  tabIndex={17}
                />

                <PropertyInputField
                  label="Available Size"
                  value={property.available_sqft}
                  onChange={(value) => onFieldUpdate('available_sqft', value)}
                  type="number"
                  placeholder="0"
                  tabIndex={18}
                />
              </div>

              {/* Occupancy percentage if both values available */}
              {property.building_sqft && property.available_sqft && (
                <div className="mt-3 p-2 bg-gray-50 rounded-md">
                  <div className="text-sm text-gray-600">
                    Occupancy: {(((property.building_sqft - property.available_sqft) / property.building_sqft) * 100).toFixed(1)}%
                    ({(property.building_sqft - property.available_sqft).toLocaleString()} SF occupied)
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Land-specific fields */}
      {isLandType && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Land Information</h4>

          {/* Row 1: Asking Purchase Price, Asking Ground Lease Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <PropertyCurrencyField
              label="Asking Purchase Price"
              value={property.asking_purchase_price}
              onChange={(value) => onFieldUpdate('asking_purchase_price', value)}
              showLarge={true}
              colorScheme="blue"
              tabIndex={19}
            />

            <PropertyCurrencyField
              label="Asking Ground Lease Price"
              value={property.asking_lease_price}
              onChange={(value) => onFieldUpdate('asking_lease_price', value)}
              showLarge={true}
              colorScheme="green"
              tabIndex={20}
            />
          </div>

          {/* Row 2: NNN, Acres */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <PropertyInputField
              label="NNN"
              value={property.nnn_psf}
              onChange={(value) => onFieldUpdate('nnn_psf', value)}
              type="number"
              placeholder="0"
              tabIndex={21}
            />

            <PropertyInputField
              label="Acres"
              value={property.acres}
              onChange={(value) => onFieldUpdate('acres', value)}
              type="number"
              placeholder="0"
              tabIndex={22}
            />
          </div>

          {/* Row 3: Building Sqft, Lease Expiration Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PropertyInputField
              label="Building Sqft"
              value={property.building_sqft}
              onChange={(value) => onFieldUpdate('building_sqft', value)}
              type="number"
              placeholder="0"
              tabIndex={23}
            />

            <PropertyInputField
              label="Lease Expiration Date"
              value={property.lease_expiration_date}
              onChange={(value) => onFieldUpdate('lease_expiration_date', value)}
              type="text"
              placeholder="MM/DD/YYYY"
              tabIndex={24}
            />
          </div>
        </div>
      )}
    </section>
  );
};

export default FinancialSection;
