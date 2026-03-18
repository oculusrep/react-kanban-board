import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { prepareInsert } from '../../lib/supabaseHelpers';
import { duplicateDetectionService, DuplicateMatch } from '../../services/duplicateDetectionService';
import { geocodingService } from '../../services/geocodingService';
import type { PlacesSearchResult } from '../../services/googlePlacesSearchService';

interface PropertyType {
  id: string;
  label: string;
}

interface AddClosedPlacePropertyModalProps {
  isOpen: boolean;
  place: PlacesSearchResult | null;
  onClose: () => void;
  onSuccess: (propertyId: string) => void;
}

// Parse address components from Google Places formatted_address or vicinity
function parseAddress(formattedAddress: string): {
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
} {
  // Format can be:
  // - Full: "123 Main St, City, ST 12345, USA"
  // - Vicinity only: "123 Main St, City" (from Nearby Search)
  const parts = formattedAddress.split(',').map(p => p.trim());

  let streetAddress = '';
  let city = '';
  let state = '';
  let zip = '';

  if (parts.length >= 4) {
    // Full format: "123 Main St, City, ST 12345, USA"
    streetAddress = parts[0];
    city = parts[1];
    const stateZipPart = parts[2].trim();

    const stateZipMatch = stateZipPart.match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2];
    } else {
      const stateMatch = stateZipPart.match(/\b([A-Z]{2})\b/);
      if (stateMatch) {
        state = stateMatch[1];
        const zipMatch = stateZipPart.match(/(\d{5}(?:-\d{4})?)/);
        if (zipMatch) {
          zip = zipMatch[1];
        }
      }
    }
  } else if (parts.length === 3) {
    // Could be "123 Main St, City, ST 12345" or "123 Main St, City, USA"
    streetAddress = parts[0];
    city = parts[1];
    const thirdPart = parts[2].trim();

    // Check if third part has state abbreviation
    const stateZipMatch = thirdPart.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2] || '';
    }
    // If third part is just "USA" or similar, state/zip stay empty
  } else if (parts.length === 2) {
    // Vicinity format: "123 Main St, City" - common from Nearby Search
    streetAddress = parts[0];
    city = parts[1];
    // State and zip will need to be filled manually or inferred from search context
  } else {
    streetAddress = formattedAddress;
  }

  return { streetAddress, city, state, zip };
}

const AddClosedPlacePropertyModal: React.FC<AddClosedPlacePropertyModalProps> = ({
  isOpen,
  place,
  onClose,
  onSuccess,
}) => {
  // Form state
  const [propertyName, setPropertyName] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [propertyTypeId, setPropertyTypeId] = useState<string>('');

  // UI state
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'add' | 'link'>('add');

  // Load property types
  useEffect(() => {
    const loadPropertyTypes = async () => {
      const { data, error } = await supabase
        .from('property_type')
        .select('id, label')
        .eq('active', true)
        .order('sort_order');

      if (error) {
        console.error('Failed to load property types:', error);
        return;
      }

      if (data) {
        setPropertyTypes(data);
        // Default to "Restaurant" if available
        const restaurant = data.find(t => t.label.toLowerCase().includes('restaurant'));
        if (restaurant) {
          setPropertyTypeId(restaurant.id);
        }
      }
    };

    if (isOpen) {
      loadPropertyTypes();
    }
  }, [isOpen]);

  // Pre-fill form when place changes
  useEffect(() => {
    if (place) {
      setPropertyName(place.name);

      // Parse the formatted address
      const parsed = parseAddress(place.formatted_address);
      setStreetAddress(parsed.streetAddress);
      setCity(parsed.city);
      setState(parsed.state);
      setZip(parsed.zip);

      // If city, state, or zip are missing, use reverse geocoding to fill them in
      if (!parsed.city || !parsed.state || !parsed.zip) {
        geocodingService.reverseGeocode(place.latitude, place.longitude)
          .then((result) => {
            if ('latitude' in result) {
              if (!parsed.city && result.city) setCity(result.city);
              if (!parsed.state && result.state) setState(result.state);
              if (!parsed.zip && result.zip) setZip(result.zip);
            }
          })
          .catch(() => {
            // Reverse geocoding failed, user will need to fill in manually
          });
      }

      // Check for duplicates
      checkDuplicates();
    }
  }, [place]);

  const checkDuplicates = async () => {
    if (!place) return;

    setCheckingDuplicates(true);
    try {
      const result = await duplicateDetectionService.checkForDuplicates(
        place.place_id,
        place.latitude,
        place.longitude,
        place.formatted_address
      );
      setDuplicates(result.matches);
    } catch (err) {
      console.error('Failed to check duplicates:', err);
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleSave = async () => {
    if (!place) return;

    // Validate required fields
    if (!propertyName.trim()) {
      setError('Property name is required');
      return;
    }
    if (!streetAddress.trim()) {
      setError('Address is required');
      return;
    }
    if (!city.trim()) {
      setError('City is required');
      return;
    }
    if (!state.trim()) {
      setError('State is required');
      return;
    }

    // Handle duplicate actions
    if (duplicates.length > 0 && duplicateAction === 'skip') {
      onClose();
      return;
    }

    if (duplicates.length > 0 && duplicateAction === 'link') {
      // Link the google_places_result to the existing property
      const existingProperty = duplicates[0].property;
      await linkPlaceToProperty(place.place_id, existingProperty.id);
      onSuccess(existingProperty.id);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Create the property
      const { data: newProperty, error: insertError } = await supabase
        .from('property')
        .insert(prepareInsert({
          property_name: propertyName.trim(),
          address: streetAddress.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim() || null,
          latitude: place.latitude,
          longitude: place.longitude,
          google_place_id: place.place_id,
          property_type_id: propertyTypeId || null,
          property_notes: `Source: Google Places Closed Business Search\nStatus: ${place.business_status}\nOriginal Address: ${place.formatted_address}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Update the google_places_result to link to this property
      await linkPlaceToProperty(place.place_id, newProperty.id);

      onSuccess(newProperty.id);
    } catch (err: any) {
      console.error('Failed to create property:', err);
      setError(err.message || 'Failed to create property');
    } finally {
      setIsSaving(false);
    }
  };

  const linkPlaceToProperty = async (placeId: string, propertyId: string) => {
    await supabase
      .from('google_places_result')
      .update({ property_id: propertyId })
      .eq('place_id', placeId);
  };

  if (!isOpen || !place) return null;

  return (
    <div className="fixed inset-0 z-[1100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block w-full max-w-lg p-6 my-8 text-left align-middle transition-all transform bg-white shadow-xl rounded-lg sm:my-16">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Add to Properties
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Business Status Badge */}
          <div className="mb-4">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              place.business_status === 'CLOSED_PERMANENTLY'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {place.business_status === 'CLOSED_PERMANENTLY' ? 'Permanently Closed' : 'Temporarily Closed'}
            </span>
          </div>

          {/* Duplicate Warning */}
          {duplicates.length > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-yellow-800">Potential Duplicate Found</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    {duplicates[0].matchType === 'place_id' && 'This exact place already exists in your properties.'}
                    {duplicates[0].matchType === 'proximity' && `A property exists ${Math.round(duplicates[0].distance || 0)}m away.`}
                    {duplicates[0].matchType === 'address' && 'A property with a similar address exists.'}
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    <strong>{duplicates[0].property.property_name}</strong>
                    <br />
                    {duplicates[0].property.address}, {duplicates[0].property.city}
                  </p>

                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicateAction"
                        value="skip"
                        checked={duplicateAction === 'skip'}
                        onChange={() => setDuplicateAction('skip')}
                        className="w-4 h-4 text-yellow-600"
                      />
                      <span className="text-sm text-yellow-700">Skip - Don't add this place</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicateAction"
                        value="link"
                        checked={duplicateAction === 'link'}
                        onChange={() => setDuplicateAction('link')}
                        className="w-4 h-4 text-yellow-600"
                      />
                      <span className="text-sm text-yellow-700">Link - Connect to existing property</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="duplicateAction"
                        value="add"
                        checked={duplicateAction === 'add'}
                        onChange={() => setDuplicateAction('add')}
                        className="w-4 h-4 text-yellow-600"
                      />
                      <span className="text-sm text-yellow-700">Add Anyway - Create new property</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {/* Property Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Name *
              </label>
              <input
                type="text"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Business name"
              />
            </div>

            {/* Property Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Type
              </label>
              <select
                value={propertyTypeId}
                onChange={(e) => setPropertyTypeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select type...</option>
                {propertyTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street Address *
              </label>
              <input
                type="text"
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* City, State, Zip */}
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City *
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State *
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  maxLength={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ZIP
                </label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  maxLength={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Coordinates (read-only) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Latitude
                </label>
                <input
                  type="text"
                  value={place.latitude.toFixed(6)}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Longitude
                </label>
                <input
                  type="text"
                  value={place.longitude.toFixed(6)}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || checkingDuplicates}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : duplicates.length > 0 && duplicateAction === 'link' ? (
                'Link to Existing'
              ) : duplicates.length > 0 && duplicateAction === 'skip' ? (
                'Skip'
              ) : (
                'Add to Properties'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddClosedPlacePropertyModal;
