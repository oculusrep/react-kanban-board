import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database } from '../../database-schema';
import PropertyInputField from './PropertyInputField';
import PropertyAutocompleteField from './PropertyAutocompleteField';
import PropertySelectField from './PropertySelectField';
import PropertyCurrencyField from './PropertyCurrencyField';
import PropertyPSFField from './PropertyPSFField';
import { usePropertyGeocoding } from '../../hooks/usePropertyGeocoding';
import { usePropertyRecordTypes } from '../../hooks/usePropertyRecordTypes';
import { useProperty } from '../../hooks/useProperty';

type Property = Database['public']['Tables']['property']['Row'];

interface NewPropertyFormData {
  property_record_type_id: string | null;
  property_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  trade_area: string;
  asking_lease_price: number | null;
  asking_purchase_price: number | null;
  rent_psf: number | null;
  nnn_psf: number | null;
  property_notes: string;
}

const NewPropertyPage: React.FC = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isGeocoding, geocodeError, geocodeProperty, getCurrentLocation, clearError } = usePropertyGeocoding();
  const { propertyRecordTypes, isLoading: isLoadingRecordTypes, error: recordTypesError } = usePropertyRecordTypes();
  const { createProperty } = useProperty();
  const [formData, setFormData] = useState<NewPropertyFormData>({
    property_record_type_id: null,
    property_name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    trade_area: '',
    asking_lease_price: null,
    asking_purchase_price: null,
    rent_psf: null,
    nnn_psf: null,
    property_notes: ''
  });

  const handleFieldUpdate = (field: keyof NewPropertyFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Get selected property record type to determine financial fields
  const selectedRecordType = propertyRecordTypes.find(rt => rt.id === formData.property_record_type_id);
  const recordTypeLabel = selectedRecordType?.label?.toLowerCase() || '';
  
  // Determine which fields to show based on property record type
  const isLandType = recordTypeLabel.includes('land');
  const isShoppingCenterType = recordTypeLabel.includes('shopping') || recordTypeLabel.includes('retail');
  
  // Show different field sets based on type
  const showLeaseFields = !isLandType && !isShoppingCenterType; // Show lease fields for non-land, non-shopping center properties
  const showPSFFields = !isLandType; // Show PSF for all building types (including shopping centers)
  const showPurchaseFields = isLandType; // Show purchase price for land

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    // Basic validation
    if (!formData.property_record_type_id) {
      alert('Please select a property record type');
      return;
    }
    if (!formData.property_name.trim() || !formData.address.trim() || !formData.city.trim() || !formData.state.trim()) {
      alert('Please fill in all required fields (Property Record Type, Property Name, Address, City, State)');
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('Creating new property:', formData);
      
      // Create the property in the database
      const propertyData = {
        property_record_type_id: formData.property_record_type_id,
        property_name: formData.property_name,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        trade_area: formData.trade_area,
        asking_lease_price: formData.asking_lease_price,
        asking_purchase_price: formData.asking_purchase_price,
        rent_psf: formData.rent_psf,
        nnn_psf: formData.nnn_psf,
        property_notes: formData.property_notes
      } as Omit<Property, 'id' | 'created_at' | 'updated_at'>;

      const createdProperty = await createProperty(propertyData);
      console.log('✅ Property created successfully:', createdProperty);
      
      // Then geocode in the background (don't block navigation)
      geocodeProperty(createdProperty).then((geocodedProperty) => {
        if (geocodedProperty.latitude && geocodedProperty.longitude) {
          console.log('✅ Property geocoded successfully:', {
            coordinates: [geocodedProperty.latitude, geocodedProperty.longitude]
          });
          // TODO: Update the created property with geocoded data via API
          // This could be done via a separate update call to the property
        } else if (geocodeError) {
          console.warn('⚠️ Property created but geocoding failed:', geocodeError);
        }
      }).catch((error) => {
        console.warn('⚠️ Property created but geocoding failed:', error);
      });
      
      // Navigate to property detail view with the real property ID
      navigate(`/property/${createdProperty.id}`);
      
    } catch (error) {
      console.error('Error creating property:', error);
      alert('Failed to create property. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(-1); // Go back to previous page
  };

  const handleGetCurrentLocation = async () => {
    const location = await getCurrentLocation();
    if (location) {
      // You could optionally reverse geocode this to get address components
      console.log('Current location:', location);
    }
  };

  const [showLocationTooltip, setShowLocationTooltip] = useState(false);
  const [showPinTooltip, setShowPinTooltip] = useState(false);

  const handleVerifyLocation = () => {
    setShowLocationTooltip(true);
    // Auto-hide after 4 seconds
    setTimeout(() => setShowLocationTooltip(false), 4000);
  };

  const handlePinLocation = () => {
    setShowPinTooltip(true);
    // Auto-hide after 4 seconds
    setTimeout(() => setShowPinTooltip(false), 4000);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Add New Property</h1>
              <p className="text-sm text-gray-600 mt-1">Enter essential property information to get started</p>
            </div>
            
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          </div>
        </div>

        {/* Error Display */}
        {recordTypesError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Unable to load property types</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{recordTypesError}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {geocodeError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.316 15.5C3.546 16.333 4.508 18 6.048 18z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Geocoding Notice</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>{geocodeError}</p>
                  <p className="mt-1">Don't worry - your property will still be created. You can manually enter coordinates later if needed.</p>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={clearError}
                    className="text-sm text-yellow-600 hover:text-yellow-500 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Property Record Type - First and Most Important */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900">Property Type</h3>
              <span className="text-red-500 text-sm">*Required</span>
            </div>

            <div className="max-w-md">
              <PropertySelectField
                label="Property Record Type*"
                value={formData.property_record_type_id}
                onChange={(value) => handleFieldUpdate('property_record_type_id', value)}
                options={propertyRecordTypes.map(type => ({ id: type.id, label: type.label }))}
                placeholder={isLoadingRecordTypes ? "Loading..." : propertyRecordTypes.length === 0 ? "No record types available" : "Select property type..."}
                disabled={isLoadingRecordTypes || propertyRecordTypes.length === 0}
                tabIndex={1}
                required={true}
                defaultText="Select Property Type"
              />
            </div>
          </section>

          {/* Basic Property Information */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Property Details</h3>
              </div>
              
              {/* Pin Location Icon */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handlePinLocation}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                  title="Pin current location"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>

                {/* Pin Tooltip Popup */}
                {showPinTooltip && (
                  <div className="absolute top-full right-0 mt-2 w-72 z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg relative">
                      <div className="absolute bottom-full right-4 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
                      <div className="font-medium text-yellow-200 mb-1">🚧 Future Feature</div>
                      <p>This will drop your current location geocode to create an address and geocode from where your computer or phone are located.</p>
                      <button
                        onClick={() => setShowPinTooltip(false)}
                        className="absolute top-1 right-1 text-gray-400 hover:text-white w-4 h-4 flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <PropertyInputField
                label="Property Name*"
                value={formData.property_name}
                onChange={(value) => handleFieldUpdate('property_name', value)}
                placeholder="Downtown Office Building"
                tabIndex={2}
                required={true}
                defaultText="Enter Property Name"
              />

              <PropertyInputField
                label="Street Address*"
                value={formData.address}
                onChange={(value) => handleFieldUpdate('address', value)}
                placeholder="123 Main Street"
                tabIndex={3}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <PropertyAutocompleteField
                  label="City*"
                  value={formData.city}
                  onChange={(value) => handleFieldUpdate('city', value)}
                  field="city"
                  placeholder="San Francisco"
                  tabIndex={4}
                />

                <PropertyAutocompleteField
                  label="State*"
                  value={formData.state}
                  onChange={(value) => handleFieldUpdate('state', value)}
                  field="state"
                  placeholder="CA"
                  tabIndex={5}
                />

                <PropertyInputField
                  label="ZIP Code"
                  value={formData.zip}
                  onChange={(value) => handleFieldUpdate('zip', value)}
                  placeholder="94105"
                  tabIndex={6}
                />
              </div>

              {/* Trade Area with Verify Location Button */}
              <div className="flex items-end gap-4 mt-4">
                <div className="flex-1">
                  <PropertyAutocompleteField
                    label="Trade Area"
                    value={formData.trade_area}
                    onChange={(value) => handleFieldUpdate('trade_area', value)}
                    field="trade_area"
                    placeholder="Downtown, Suburb, etc."
                    tabIndex={7}
                  />
                </div>
                
                {/* Verify Location Button */}
                <div className="relative pb-1">
                  <button
                    type="button"
                    onClick={handleVerifyLocation}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Verify Location
                  </button>

                  {/* Tooltip Popup */}
                  {showLocationTooltip && (
                    <div className="absolute bottom-full right-0 mb-2 w-64 z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg relative">
                        <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
                        <div className="font-medium text-yellow-200 mb-1">🚧 Future Feature</div>
                        <p>This will take you to a map where you can move the pin to the correct location and recode the address coordinates.</p>
                        <button
                          onClick={() => setShowLocationTooltip(false)}
                          className="absolute top-1 right-1 text-gray-400 hover:text-white w-4 h-4 flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Financial Information - Shows different fields based on property type */}
          {formData.property_record_type_id && (
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">
                  Financial Information
                  {isLandType && ' (Land)'}
                  {isShoppingCenterType && ' (Retail/Shopping)'}
                  {!isLandType && !isShoppingCenterType && ' (Building)'}
                </h3>
                <span className="text-sm text-gray-500 ml-2">(Optional - can be added later)</span>
              </div>

              {/* Land-specific fields */}
              {isLandType && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PropertyCurrencyField
                      label="Asking Purchase Price"
                      value={formData.asking_purchase_price}
                      onChange={(value) => handleFieldUpdate('asking_purchase_price', value)}
                      helpText="Land purchase price"
                      colorScheme="blue"
                      showLarge={true}
                      tabIndex={8}
                    />
                    
                    <PropertyCurrencyField
                      label="Asking Ground Lease Price"
                      value={formData.asking_lease_price}
                      onChange={(value) => handleFieldUpdate('asking_lease_price', value)}
                      helpText="Annual ground lease amount"
                      colorScheme="green"
                      showLarge={true}
                      tabIndex={9}
                    />
                  </div>
                </div>
              )}

              {/* Building/Retail lease fields */}
              {showLeaseFields && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PropertyCurrencyField
                      label="Asking Lease Price"
                      value={formData.asking_lease_price}
                      onChange={(value) => handleFieldUpdate('asking_lease_price', value)}
                      helpText="Annual lease amount"
                      colorScheme="green"
                      showLarge={true}
                      tabIndex={8}
                    />
                  </div>
                </div>
              )}

              {/* Per Square Foot fields for non-land properties */}
              {showPSFFields && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Per Square Foot Rates</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PropertyPSFField
                      label="Rent PSF"
                      value={formData.rent_psf}
                      onChange={(value) => handleFieldUpdate('rent_psf', value)}
                      helpText="Base rent per square foot"
                      tabIndex={9}
                    />

                    <PropertyPSFField
                      label="NNN PSF"
                      value={formData.nnn_psf}
                      onChange={(value) => handleFieldUpdate('nnn_psf', value)}
                      helpText="Triple net charges per square foot"
                      tabIndex={10}
                    />
                  </div>
                </div>
              )}

              {/* Helpful context about what fields will be available in the detailed view */}
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  ℹ️ Additional financial fields like square footage, occupancy rates, and detailed lease terms can be added in the detailed property view after creation.
                </p>
              </div>
            </section>
          )}

          {/* Show placeholder if no record type selected */}
          {!formData.property_record_type_id && (
            <section className="bg-gray-50 rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                <h3 className="text-lg font-medium text-gray-500">Financial Information</h3>
              </div>
              <p className="text-sm text-gray-500">Select a property record type above to see relevant financial fields.</p>
            </section>
          )}

          {/* Property Notes */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900">Initial Notes</h3>
            </div>

            <textarea
              value={formData.property_notes}
              onChange={(e) => handleFieldUpdate('property_notes', e.target.value)}
              placeholder="Add any initial notes about this property, market conditions, or other relevant information..."
              className="w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base resize-none min-h-[100px]"
              tabIndex={10}
            />

            <p className="text-xs text-gray-500 mt-2">
              You can add more detailed notes and use quick templates after the property is created.
            </p>
          </section>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              <span className="text-red-500">*</span> Required fields: Property Record Type, Property Name, Address, City, State
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || isGeocoding}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {(isSubmitting || isGeocoding) && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {isGeocoding ? 'Adding Location...' : isSubmitting ? 'Creating Property...' : 'Create Property'}
              </button>
            </div>
          </div>
        </form>

        {/* Background Geocoding Notice */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div>
              <div className="text-sm font-medium text-blue-800">Automatic Location Detection</div>
              <div className="text-xs text-blue-700 mt-1">
                The system automatically converts your address into GPS coordinates for mapping and location features. This happens in the background and won't delay property creation.
              </div>
              {isGeocoding && (
                <div className="mt-2 flex items-center gap-2 text-blue-600">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">Detecting location...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewPropertyPage;