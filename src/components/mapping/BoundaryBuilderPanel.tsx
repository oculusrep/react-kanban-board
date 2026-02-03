import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  boundaryService,
  BoundarySearchResult,
  FetchedBoundary,
  US_STATES,
  SOUTHEASTERN_STATES,
} from '../../services/boundaryService';
import BoundarySearchBox from './BoundarySearchBox';

interface BoundaryBuilderPanelProps {
  isOpen: boolean;
  onClose: () => void;
  map: google.maps.Map | null;
  onSaveCollection: (boundaries: FetchedBoundary[], layerName: string) => Promise<void>;
  onSaveMerged: (boundaries: FetchedBoundary[], layerName: string) => Promise<void>;
}

interface PreviewPolygon {
  boundary: FetchedBoundary;
  polygon: google.maps.Polygon;
}

const BoundaryBuilderPanel: React.FC<BoundaryBuilderPanelProps> = ({
  isOpen,
  onClose,
  map,
  onSaveCollection,
  onSaveMerged,
}) => {
  // Collection state
  const [collection, setCollection] = useState<FetchedBoundary[]>([]);
  const [loadingBoundaries, setLoadingBoundaries] = useState<Set<string>>(new Set());

  // Browse by state
  const [selectedState, setSelectedState] = useState<string>('');
  const [stateCounties, setStateCounties] = useState<BoundarySearchResult[]>([]);
  const [isLoadingCounties, setIsLoadingCounties] = useState(false);
  const [selectedCounties, setSelectedCounties] = useState<Set<string>>(new Set());

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [layerName, setLayerName] = useState('');
  const [showSaveOptions, setShowSaveOptions] = useState(false);

  // Preview polygons on map
  const previewPolygonsRef = useRef<Map<string, PreviewPolygon>>(new Map());

  // Existing boundary IDs for search box
  const existingBoundaryIds = new Set(collection.map(b => b.geoid));

  // Sort states with southeastern states first
  const sortedStates = [...US_STATES].sort((a, b) => {
    const aIsSE = SOUTHEASTERN_STATES.includes(a.abbr);
    const bIsSE = SOUTHEASTERN_STATES.includes(b.abbr);
    if (aIsSE && !bIsSE) return -1;
    if (!aIsSE && bIsSE) return 1;
    return a.name.localeCompare(b.name);
  });

  // Load counties when state changes
  useEffect(() => {
    if (!selectedState) {
      setStateCounties([]);
      return;
    }

    const loadCounties = async () => {
      setIsLoadingCounties(true);
      try {
        const counties = await boundaryService.getCountiesForState(selectedState);
        setStateCounties(counties);
      } catch (error) {
        console.error('Failed to load counties:', error);
        setStateCounties([]);
      } finally {
        setIsLoadingCounties(false);
      }
    };

    loadCounties();
  }, [selectedState]);

  // Clean up preview polygons when panel closes
  useEffect(() => {
    if (!isOpen) {
      // Clear all preview polygons
      previewPolygonsRef.current.forEach(({ polygon }) => {
        polygon.setMap(null);
      });
      previewPolygonsRef.current.clear();
    }
  }, [isOpen]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      previewPolygonsRef.current.forEach(({ polygon }) => {
        polygon.setMap(null);
      });
      previewPolygonsRef.current.clear();
    };
  }, []);

  // Create preview polygon on map
  const createPreviewPolygon = useCallback((boundary: FetchedBoundary) => {
    if (!map) return;

    // Convert Census coordinates [lng, lat] to Google Maps format
    let paths: google.maps.LatLngLiteral[] = [];

    if (boundary.geometry.type === 'Polygon') {
      const coords = boundary.geometry.coordinates as number[][][];
      paths = coords[0].map(([lng, lat]) => ({ lat, lng }));
    } else if (boundary.geometry.type === 'MultiPolygon') {
      // Take the largest polygon for preview
      const polygons = boundary.geometry.coordinates as number[][][][];
      let largestPolygon = polygons[0];
      let maxPoints = polygons[0][0].length;

      for (const polygon of polygons) {
        if (polygon[0].length > maxPoints) {
          maxPoints = polygon[0].length;
          largestPolygon = polygon;
        }
      }

      paths = largestPolygon[0].map(([lng, lat]) => ({ lat, lng }));
    }

    const polygon = new google.maps.Polygon({
      paths,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.2,
      map,
      clickable: true,
      zIndex: 50,
    });

    // Click to remove from collection
    polygon.addListener('click', () => {
      removeBoundary(boundary.geoid);
    });

    previewPolygonsRef.current.set(boundary.geoid, { boundary, polygon });
  }, [map]);

  // Remove preview polygon from map
  const removePreviewPolygon = useCallback((geoid: string) => {
    const preview = previewPolygonsRef.current.get(geoid);
    if (preview) {
      preview.polygon.setMap(null);
      previewPolygonsRef.current.delete(geoid);
    }
  }, []);

  // Add boundary to collection
  const addBoundary = useCallback(async (searchResult: BoundarySearchResult) => {
    // Skip if already in collection
    if (collection.some(b => b.geoid === searchResult.geoid)) {
      return;
    }

    // Set loading state
    setLoadingBoundaries(prev => new Set(prev).add(searchResult.geoid));

    try {
      // Fetch full geometry
      const result = await boundaryService.fetchCountyGeometry(searchResult.geoid);

      if (boundaryService.isError(result)) {
        console.error('Failed to fetch boundary:', result.error);
        return;
      }

      // Add to collection
      setCollection(prev => [...prev, result]);

      // Create preview polygon
      createPreviewPolygon(result);
    } finally {
      setLoadingBoundaries(prev => {
        const next = new Set(prev);
        next.delete(searchResult.geoid);
        return next;
      });
    }
  }, [collection, createPreviewPolygon]);

  // Remove boundary from collection
  const removeBoundary = useCallback((geoid: string) => {
    setCollection(prev => prev.filter(b => b.geoid !== geoid));
    removePreviewPolygon(geoid);
    setSelectedCounties(prev => {
      const next = new Set(prev);
      next.delete(geoid);
      return next;
    });
  }, [removePreviewPolygon]);

  // Toggle county selection in browse mode
  const toggleCountySelection = (geoid: string) => {
    setSelectedCounties(prev => {
      const next = new Set(prev);
      if (next.has(geoid)) {
        next.delete(geoid);
      } else {
        next.add(geoid);
      }
      return next;
    });
  };

  // Add selected counties from browse
  const addSelectedCounties = async () => {
    const countiesToAdd = stateCounties.filter(
      c => selectedCounties.has(c.geoid) && !existingBoundaryIds.has(c.geoid)
    );

    for (const county of countiesToAdd) {
      await addBoundary(county);
    }

    setSelectedCounties(new Set());
  };

  // Fit map to show all boundaries
  const fitMapToBounds = useCallback(() => {
    if (!map || collection.length === 0) return;

    const bounds = new google.maps.LatLngBounds();

    previewPolygonsRef.current.forEach(({ polygon }) => {
      polygon.getPath().forEach(point => {
        bounds.extend(point);
      });
    });

    map.fitBounds(bounds, { padding: 50 });
  }, [map, collection]);

  // Handle save as collection
  const handleSaveCollection = async () => {
    if (collection.length === 0 || !layerName.trim()) return;

    setIsSaving(true);
    try {
      await onSaveCollection(collection, layerName.trim());
      // Clear collection and close
      setCollection([]);
      previewPolygonsRef.current.forEach(({ polygon }) => {
        polygon.setMap(null);
      });
      previewPolygonsRef.current.clear();
      setLayerName('');
      setShowSaveOptions(false);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Handle save as merged
  const handleSaveMerged = async () => {
    if (collection.length === 0 || !layerName.trim()) return;

    setIsSaving(true);
    try {
      await onSaveMerged(collection, layerName.trim());
      // Clear collection and close
      setCollection([]);
      previewPolygonsRef.current.forEach(({ polygon }) => {
        polygon.setMap(null);
      });
      previewPolygonsRef.current.clear();
      setLayerName('');
      setShowSaveOptions(false);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel and clear
  const handleCancel = () => {
    setCollection([]);
    previewPolygonsRef.current.forEach(({ polygon }) => {
      polygon.setMap(null);
    });
    previewPolygonsRef.current.clear();
    setSelectedState('');
    setStateCounties([]);
    setSelectedCounties(new Set());
    setLayerName('');
    setShowSaveOptions(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-32 w-96 z-[1000] bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col max-h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">Boundary Builder</h3>
          <p className="text-xs text-gray-500">Build territory from counties</p>
        </div>
        <button
          onClick={handleCancel}
          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Search Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Counties
          </label>
          <BoundarySearchBox
            onSelect={addBoundary}
            existingBoundaryIds={existingBoundaryIds}
            placeholder="Type county name..."
          />
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or browse by state</span>
          </div>
        </div>

        {/* Browse by State Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Browse by State
          </label>
          <select
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
              setSelectedCounties(new Set());
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a state...</option>
            {sortedStates.map(state => (
              <option key={state.fips} value={state.fips}>
                {state.name} {SOUTHEASTERN_STATES.includes(state.abbr) ? '★' : ''}
              </option>
            ))}
          </select>

          {/* County List */}
          {selectedState && (
            <div className="mt-3 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              {isLoadingCounties ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  Loading counties...
                </div>
              ) : stateCounties.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No counties found
                </div>
              ) : (
                <>
                  {stateCounties.map(county => {
                    const isInCollection = existingBoundaryIds.has(county.geoid);
                    const isSelected = selectedCounties.has(county.geoid);
                    const isLoading = loadingBoundaries.has(county.geoid);

                    return (
                      <div
                        key={county.geoid}
                        onClick={() => {
                          if (!isInCollection && !isLoading) {
                            toggleCountySelection(county.geoid);
                          }
                        }}
                        className={`px-3 py-2 border-b border-gray-100 last:border-b-0 cursor-pointer flex items-center justify-between ${
                          isInCollection
                            ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center">
                          {!isInCollection && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCountySelection(county.geoid)}
                              disabled={isLoading}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-2"
                            />
                          )}
                          <span className={`text-sm ${isInCollection ? 'text-gray-400' : 'text-gray-900'}`}>
                            {county.name} County
                          </span>
                        </div>
                        {isInCollection && (
                          <span className="text-xs text-gray-400">Added</span>
                        )}
                        {isLoading && (
                          <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Add Selected Button */}
          {selectedCounties.size > 0 && (
            <button
              onClick={addSelectedCounties}
              className="mt-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Add Selected ({selectedCounties.size})
            </button>
          )}
        </div>

        {/* Collection Section */}
        {collection.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">
                Collection ({collection.length})
              </h4>
              <button
                onClick={fitMapToBounds}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Fit to bounds
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
              {collection.map(boundary => (
                <div
                  key={boundary.geoid}
                  className="px-3 py-2 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-900">{boundary.displayName}</span>
                  <button
                    onClick={() => removeBoundary(boundary.geoid)}
                    className="text-xs text-red-600 hover:text-red-800 px-2 py-1 hover:bg-red-50 rounded"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {collection.length > 0 && (
        <div className="p-4 border-t border-gray-200 space-y-3">
          {!showSaveOptions ? (
            <button
              onClick={() => setShowSaveOptions(true)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Save Territory ({collection.length} boundaries)
            </button>
          ) : (
            <>
              {/* Layer Name Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Layer Name
                </label>
                <input
                  type="text"
                  value={layerName}
                  onChange={(e) => setLayerName(e.target.value)}
                  placeholder="Enter layer name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Save Options */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveCollection}
                  disabled={isSaving || !layerName.trim()}
                  className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save as Collection'}
                </button>
                <button
                  onClick={handleSaveMerged}
                  disabled={isSaving || !layerName.trim()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Merge & Save'}
                </button>
              </div>

              <button
                onClick={() => setShowSaveOptions(false)}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Empty State Footer */}
      {collection.length === 0 && (
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            Search for counties or browse by state to build your territory
          </div>
        </div>
      )}
    </div>
  );
};

export default BoundaryBuilderPanel;
