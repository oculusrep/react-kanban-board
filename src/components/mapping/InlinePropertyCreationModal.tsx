import React, { useState, useEffect } from 'react';
import { geocodingService } from '../../services/geocodingService';
import { usePropertyRecordTypes } from '../../hooks/usePropertyRecordTypes';
import { useProperty } from '../../hooks/useProperty';

interface InlinePropertyCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (property: any) => void;
  coordinates: { lat: number; lng: number };
}

interface PropertyFormData {
  property_record_type_id: string | null;
  property_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  property_notes: string;
}

const InlinePropertyCreationModal: React.FC<InlinePropertyCreationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  coordinates,
}) => {
  const [formData, setFormData] = useState<PropertyFormData>({
    property_record_type_id: null,
    property_name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    property_notes: `Created from map pin at coordinates: ${coordinates.lat.toFixed(6)}, ${coordinates.lng.toFixed(6)}`,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [reverseGeocodeError, setReverseGeocodeError] = useState<string | null>(null);

  const { propertyRecordTypes, isLoading: isLoadingRecordTypes } = usePropertyRecordTypes();
  const { createProperty } = useProperty();

  // Auto-populate address from coordinates when modal opens
  useEffect(() => {
    if (isOpen && coordinates && !formData.address) {
      const reverseGeocodeCoordinates = async () => {
        setIsReverseGeocoding(true);
        setReverseGeocodeError(null);

        try {
          console.log('🔄 Reverse geocoding coordinates:', coordinates);
          const result = await geocodingService.reverseGeocode(coordinates.lat, coordinates.lng);

          if ('latitude' in result) {
            console.log('✅ Reverse geocoding successful:', result);
            setFormData(prev => ({
              ...prev,
              address: result.street_address || result.formatted_address.split(',')[0] || '',
              city: result.city || '',
              state: result.state || '',
              zip: result.zip || '',
              property_notes: prev.property_notes + '\n\nAddress auto-populated from map coordinates via reverse geocoding.'
            }));
          } else {
            setReverseGeocodeError(result.error || 'Failed to determine address from coordinates');
          }
        } catch (error) {
          console.error('❌ Reverse geocoding error:', error);
          setReverseGeocodeError(error instanceof Error ? error.message : 'Failed to determine address from coordinates');
        } finally {
          setIsReverseGeocoding(false);
        }
      };

      reverseGeocodeCoordinates();
    }
  }, [isOpen, coordinates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.property_record_type_id || !formData.property_name.trim() || !formData.address.trim()) {
      alert('Please fill in all required fields (Property Type, Property Name, Address)');
      return;
    }

    setIsSubmitting(true);
    try {
      const propertyData = {
        property_record_type_id: formData.property_record_type_id,
        property_name: formData.property_name,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        property_notes: formData.property_notes,
        verified_latitude: coordinates.lat,
        verified_longitude: coordinates.lng,
      };

      const createdProperty = await createProperty(propertyData);
      console.log('✅ Property created successfully:', createdProperty);

      onSave(createdProperty);
      onClose();

      // Reset form
      setFormData({
        property_record_type_id: null,
        property_name: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        property_notes: '',
      });

    } catch (error) {
      console.error('Error creating property:', error);
      alert('Failed to create property. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldUpdate = (field: keyof PropertyFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[45]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 bg-white rounded-lg shadow-xl z-[50] flex flex-col max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Create Property from Pin</h3>
            <p className="text-sm text-gray-500 mt-1">
              Location: {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Reverse Geocoding Status */}
          {isReverseGeocoding && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center gap-2 text-blue-700 text-sm">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>🔄 Auto-populating address from coordinates...</span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {reverseGeocodeError && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="text-sm text-yellow-800">
                <strong>Address Auto-Population Failed:</strong> {reverseGeocodeError}
              </div>
              <button
                onClick={() => setReverseGeocodeError(null)}
                className="text-xs text-yellow-600 hover:text-yellow-500 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Property Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Type *
              </label>
              <select
                value={formData.property_record_type_id || ''}
                onChange={(e) => handleFieldUpdate('property_record_type_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select property type...</option>
                {propertyRecordTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Property Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Name *
              </label>
              <input
                type="text"
                value={formData.property_name}
                onChange={(e) => handleFieldUpdate('property_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Downtown Office Building"
                required
              />
            </div>

            {/* Address Fields */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleFieldUpdate('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123 Main Street"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleFieldUpdate('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="San Francisco"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => handleFieldUpdate('state', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="CA"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    value={formData.zip}
                    onChange={(e) => handleFieldUpdate('zip', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="94105"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.property_notes}
                onChange={(e) => handleFieldUpdate('property_notes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 h-20 resize-none"
                placeholder="Add any notes about this property..."
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isReverseGeocoding}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isSubmitting ? 'Creating...' : 'Create Property'}
          </button>
        </div>
      </div>
    </>
  );
};

export default InlinePropertyCreationModal;