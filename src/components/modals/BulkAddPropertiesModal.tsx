import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { prepareInsert } from '../../lib/supabaseHelpers';
import { duplicateDetectionService, DuplicateCheckResult } from '../../services/duplicateDetectionService';
import type { PlacesSearchResult } from '../../services/googlePlacesSearchService';

interface PropertyType {
  id: string;
  name: string;
}

interface PlaceWithDuplicateStatus extends PlacesSearchResult {
  duplicateResult?: DuplicateCheckResult;
  action: 'add' | 'skip' | 'link';
  selected: boolean;
}

interface BulkAddPropertiesModalProps {
  isOpen: boolean;
  places: PlacesSearchResult[];
  onClose: () => void;
  onSuccess: (addedCount: number, skippedCount: number, linkedCount: number) => void;
}

// Parse address components from Google Places formatted_address
function parseAddress(formattedAddress: string): {
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
} {
  const parts = formattedAddress.split(',').map(p => p.trim());

  let streetAddress = '';
  let city = '';
  let state = '';
  let zip = '';

  if (parts.length >= 3) {
    streetAddress = parts[0];
    city = parts[1];
    const stateZipPart = parts[2];
    const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5})?/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2] || '';
    }
  } else if (parts.length === 2) {
    streetAddress = parts[0];
    const stateZipMatch = parts[1].match(/([A-Z]{2})\s*(\d{5})?/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2] || '';
    }
  } else {
    streetAddress = formattedAddress;
  }

  return { streetAddress, city, state, zip };
}

const BulkAddPropertiesModal: React.FC<BulkAddPropertiesModalProps> = ({
  isOpen,
  places,
  onClose,
  onSuccess,
}) => {
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [selectedPropertyTypeId, setSelectedPropertyTypeId] = useState<string>('');
  const [placesWithStatus, setPlacesWithStatus] = useState<PlaceWithDuplicateStatus[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load property types
  useEffect(() => {
    const loadPropertyTypes = async () => {
      const { data, error } = await supabase
        .from('property_type')
        .select('id, name')
        .order('name');

      if (!error && data) {
        setPropertyTypes(data);
        const restaurant = data.find(t => t.name.toLowerCase().includes('restaurant'));
        if (restaurant) {
          setSelectedPropertyTypeId(restaurant.id);
        }
      }
    };

    if (isOpen) {
      loadPropertyTypes();
    }
  }, [isOpen]);

  // Initialize places and check duplicates when modal opens
  useEffect(() => {
    if (isOpen && places.length > 0) {
      checkAllDuplicates();
    }
  }, [isOpen, places]);

  const checkAllDuplicates = async () => {
    setIsCheckingDuplicates(true);
    setPlacesWithStatus([]);

    try {
      // Batch check for duplicates
      const duplicateResults = await duplicateDetectionService.checkMultipleForDuplicates(
        places.map(p => ({
          place_id: p.place_id,
          latitude: p.latitude,
          longitude: p.longitude,
          formatted_address: p.formatted_address,
        }))
      );

      // Build the places list with duplicate status
      const withStatus: PlaceWithDuplicateStatus[] = places.map(place => {
        const dupResult = duplicateResults.get(place.place_id);
        return {
          ...place,
          duplicateResult: dupResult,
          action: dupResult?.hasDuplicate ? 'skip' : 'add',
          selected: !dupResult?.hasDuplicate, // Pre-select non-duplicates
        };
      });

      setPlacesWithStatus(withStatus);
    } catch (err) {
      console.error('Failed to check duplicates:', err);
      // Still show all places as selectable
      setPlacesWithStatus(places.map(p => ({
        ...p,
        action: 'add',
        selected: true,
      })));
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const toggleSelect = (placeId: string) => {
    setPlacesWithStatus(prev =>
      prev.map(p =>
        p.place_id === placeId ? { ...p, selected: !p.selected } : p
      )
    );
  };

  const setAction = (placeId: string, action: 'add' | 'skip' | 'link') => {
    setPlacesWithStatus(prev =>
      prev.map(p =>
        p.place_id === placeId ? { ...p, action, selected: action !== 'skip' } : p
      )
    );
  };

  const selectAll = () => {
    setPlacesWithStatus(prev => prev.map(p => ({ ...p, selected: true })));
  };

  const selectNone = () => {
    setPlacesWithStatus(prev => prev.map(p => ({ ...p, selected: false })));
  };

  const selectNonDuplicates = () => {
    setPlacesWithStatus(prev =>
      prev.map(p => ({
        ...p,
        selected: !p.duplicateResult?.hasDuplicate,
      }))
    );
  };

  const handleBulkAdd = async () => {
    const selectedPlaces = placesWithStatus.filter(p => p.selected);
    if (selectedPlaces.length === 0) {
      setError('No places selected');
      return;
    }

    setIsSaving(true);
    setError(null);
    setProgress({ current: 0, total: selectedPlaces.length });

    let addedCount = 0;
    let skippedCount = 0;
    let linkedCount = 0;

    try {
      for (let i = 0; i < selectedPlaces.length; i++) {
        const place = selectedPlaces[i];
        setProgress({ current: i + 1, total: selectedPlaces.length });

        if (place.action === 'skip') {
          skippedCount++;
          continue;
        }

        if (place.action === 'link' && place.duplicateResult?.matches[0]) {
          // Link to existing property
          const existingPropertyId = place.duplicateResult.matches[0].property.id;
          await supabase
            .from('google_places_result')
            .update({ property_id: existingPropertyId })
            .eq('place_id', place.place_id);
          linkedCount++;
          continue;
        }

        // Add as new property
        const parsed = parseAddress(place.formatted_address);

        const { data: newProperty, error: insertError } = await supabase
          .from('property')
          .insert(prepareInsert({
            property_name: place.name,
            address: parsed.streetAddress,
            city: parsed.city,
            state: parsed.state,
            zip_code: parsed.zip || null,
            latitude: place.latitude,
            longitude: place.longitude,
            google_place_id: place.place_id,
            property_type_id: selectedPropertyTypeId || null,
            property_notes: `Source: Google Places Closed Business Search (Bulk Add)\nStatus: ${place.business_status}\nOriginal Address: ${place.formatted_address}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
          .select('id')
          .single();

        if (insertError) {
          console.error(`Failed to add ${place.name}:`, insertError);
          continue;
        }

        // Link the google_places_result to the new property
        await supabase
          .from('google_places_result')
          .update({ property_id: newProperty.id })
          .eq('place_id', place.place_id);

        addedCount++;
      }

      onSuccess(addedCount, skippedCount, linkedCount);
    } catch (err: any) {
      console.error('Bulk add failed:', err);
      setError(err.message || 'Bulk add failed');
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  };

  if (!isOpen) return null;

  const selectedCount = placesWithStatus.filter(p => p.selected).length;
  const duplicateCount = placesWithStatus.filter(p => p.duplicateResult?.hasDuplicate).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block w-full max-w-3xl p-6 my-8 text-left align-middle transition-all transform bg-white shadow-xl rounded-lg sm:my-16 max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Bulk Add to Properties
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

          {/* Summary */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{places.length}</span> places found
              {duplicateCount > 0 && (
                <span className="ml-2 text-yellow-600">
                  ({duplicateCount} potential duplicates)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="text-sm text-blue-600 hover:underline"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={selectNone}
                className="text-sm text-blue-600 hover:underline"
              >
                Select None
              </button>
              {duplicateCount > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={selectNonDuplicates}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Skip Duplicates
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Property Type Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property Type (applies to all new properties)
            </label>
            <select
              value={selectedPropertyTypeId}
              onChange={(e) => setSelectedPropertyTypeId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select type...</option>
              {propertyTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          {/* Places List */}
          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg mb-4">
            {isCheckingDuplicates ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mr-3" />
                <span className="text-gray-600">Checking for duplicates...</span>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                      <input
                        type="checkbox"
                        checked={selectedCount === placesWithStatus.length && placesWithStatus.length > 0}
                        onChange={() => selectedCount === placesWithStatus.length ? selectNone() : selectAll()}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Business
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {placesWithStatus.map(place => (
                    <tr
                      key={place.place_id}
                      className={place.selected ? 'bg-blue-50' : ''}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={place.selected}
                          onChange={() => toggleSelect(place.place_id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm">{place.name}</div>
                        <div className="text-xs text-gray-500">{place.formatted_address}</div>
                      </td>
                      <td className="px-4 py-3">
                        {place.duplicateResult?.hasDuplicate ? (
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="text-xs text-yellow-700">
                              {place.duplicateResult.matches[0].matchType === 'place_id' ? 'Exact' :
                               place.duplicateResult.matches[0].matchType === 'proximity' ? `${Math.round(place.duplicateResult.matches[0].distance || 0)}m` :
                               'Similar'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-green-600">New</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {place.duplicateResult?.hasDuplicate ? (
                          <select
                            value={place.action}
                            onChange={(e) => setAction(place.place_id, e.target.value as 'add' | 'skip' | 'link')}
                            className="text-xs px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="skip">Skip</option>
                            <option value="link">Link to Existing</option>
                            <option value="add">Add Anyway</option>
                          </select>
                        ) : (
                          <span className="text-xs text-gray-500">Will add</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Progress */}
          {progress && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                <span className="text-sm text-blue-700">
                  Processing {progress.current} of {progress.total}...
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {selectedCount} of {placesWithStatus.length} selected
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAdd}
                disabled={isSaving || isCheckingDuplicates || selectedCount === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Adding...
                  </>
                ) : (
                  `Add ${selectedCount} to Properties`
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkAddPropertiesModal;
