import React, { useState, useEffect, useCallback } from 'react';
import {
  googlePlacesSearchService,
  type PlacesSearchResult,
  type StatusFilter,
  type ApiUsageStats,
} from '../../services/googlePlacesSearchService';
import {
  closedPlacesLayerService,
  type SavedQuery,
} from '../../services/closedPlacesLayerService';
import { US_STATES, SOUTHEASTERN_STATES } from '../../services/boundaryService';

interface ClosedBusinessSearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  map: google.maps.Map | null;
  onSearchResults: (results: PlacesSearchResult[]) => void;
  onSaveAsLayer: (results: PlacesSearchResult[], layerName: string, queryId?: string) => Promise<void>;
  onBulkAddToProperties?: () => void;
}

const ClosedBusinessSearchPanel: React.FC<ClosedBusinessSearchPanelProps> = ({
  isOpen,
  onClose,
  map,
  onSearchResults,
  onSaveAsLayer,
  onBulkAddToProperties,
}) => {
  // Search form state
  const [searchType, setSearchType] = useState<'chain' | 'category'>('chain');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('both');
  const [selectedState, setSelectedState] = useState('GA');
  const [useGridSearch, setUseGridSearch] = useState(false);
  const [gridSizeKm, setGridSizeKm] = useState(50); // Default 50km grid

  // Results state
  const [results, setResults] = useState<PlacesSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<{ current: number; total: number } | null>(null);

  // Budget state
  const [usageStats, setUsageStats] = useState<ApiUsageStats | null>(null);
  const [estimatedCalls, setEstimatedCalls] = useState(0);
  const [showCostWarning, setShowCostWarning] = useState(false);

  // Save state
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [layerName, setLayerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Saved queries state
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [showSavedQueries, setShowSavedQueries] = useState(false);
  const [saveQueryName, setSaveQueryName] = useState('');
  const [showSaveQueryForm, setShowSaveQueryForm] = useState(false);

  // Sort states with southeastern states first
  const sortedStates = [...US_STATES].sort((a, b) => {
    const aIsSE = SOUTHEASTERN_STATES.includes(a.abbr);
    const bIsSE = SOUTHEASTERN_STATES.includes(b.abbr);
    if (aIsSE && !bIsSE) return -1;
    if (!aIsSE && bIsSE) return 1;
    return a.name.localeCompare(b.name);
  });

  // Initialize PlacesService when map is available
  useEffect(() => {
    if (map) {
      googlePlacesSearchService.initPlacesService(map);
    }
  }, [map]);

  // Load usage stats and saved queries on mount
  useEffect(() => {
    if (isOpen) {
      loadUsageStats();
      loadSavedQueries();
    }
  }, [isOpen]);

  // Calculate grid cells for a state
  const calculateGridCells = (stateAbbr: string, gridSizeMeters: number): number => {
    // State bounds (approximate)
    const STATE_BOUNDS: Record<string, { north: number; south: number; east: number; west: number }> = {
      'GA': { north: 35.0, south: 30.35, east: -80.84, west: -85.61 },
      'FL': { north: 31.0, south: 24.4, east: -80.03, west: -87.63 },
      'AL': { north: 35.0, south: 30.14, east: -84.89, west: -88.47 },
      'SC': { north: 35.21, south: 32.03, east: -78.54, west: -83.35 },
      'NC': { north: 36.59, south: 33.84, east: -75.46, west: -84.32 },
      'TN': { north: 36.68, south: 34.98, east: -81.65, west: -90.31 },
    };

    const bounds = STATE_BOUNDS[stateAbbr.toUpperCase()];
    if (!bounds) return 100; // Default estimate for unknown states

    // Convert grid size to degrees
    const latDegrees = gridSizeMeters / 111000;
    const midLat = (bounds.north + bounds.south) / 2;
    const lngDegrees = gridSizeMeters / (111000 * Math.cos(midLat * Math.PI / 180));

    const latRange = bounds.north - bounds.south;
    const lngRange = bounds.east - bounds.west;

    const cellsLat = Math.ceil(latRange / latDegrees);
    const cellsLng = Math.ceil(Math.abs(lngRange) / lngDegrees);

    return cellsLat * cellsLng;
  };

  // Update estimated calls when search parameters change
  useEffect(() => {
    if (useGridSearch) {
      // Grid search: calculate actual grid cells needed
      const gridSizeMeters = gridSizeKm * 1000;
      const gridCells = calculateGridCells(selectedState, gridSizeMeters);
      setEstimatedCalls(gridCells);
    } else if (searchType === 'chain') {
      // Chain search uses multiple text search strategies
      setEstimatedCalls(6); // ~2 calls per strategy × 3 strategies
    } else {
      // Category search without grid
      setEstimatedCalls(6);
    }
  }, [searchType, selectedState, useGridSearch, gridSizeKm]);

  const loadUsageStats = async () => {
    try {
      const stats = await googlePlacesSearchService.getApiUsageStats();
      setUsageStats(stats);
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };

  const loadSavedQueries = async () => {
    try {
      const queries = await closedPlacesLayerService.getSavedQueries();
      setSavedQueries(queries);
    } catch (error) {
      console.error('Failed to load saved queries:', error);
    }
  };

  const handleSearch = async (bypassWarning = false) => {
    if (!searchTerm.trim() || !selectedState) return;

    // Show cost warning for expensive searches (> $5 estimated)
    const estimatedCost = (estimatedCalls * 2) / 100;
    if (!bypassWarning && estimatedCost > 5) {
      setShowCostWarning(true);
      return;
    }

    setShowCostWarning(false);
    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setSearchProgress(null);

    try {
      // Check budget first
      const { available, stats } = await googlePlacesSearchService.checkBudgetAvailable(estimatedCalls);
      setUsageStats(stats);

      if (!available) {
        setSearchError(
          `Insufficient budget. This search requires ~${estimatedCalls} API calls ` +
          `($${estimatedCost.toFixed(2)}), but only $${(stats.remainingCents / 100).toFixed(2)} remaining.`
        );
        return;
      }

      let searchResults: PlacesSearchResult[];

      if (useGridSearch) {
        // Grid-based search for more comprehensive coverage
        const bounds = googlePlacesSearchService.getStateBounds(selectedState);
        if (!bounds) {
          throw new Error(`State bounds not available for ${selectedState}`);
        }

        searchResults = await googlePlacesSearchService.nearbySearchWithGrid(
          searchTerm.trim(),
          bounds,
          gridSizeKm * 1000, // Convert km to meters
          statusFilter,
          undefined,
          (current, total) => setSearchProgress({ current, total })
        );
      } else {
        // Standard text-based search
        searchResults = await googlePlacesSearchService.searchClosedInState(
          searchTerm.trim(),
          selectedState,
          statusFilter
        );
      }

      setResults(searchResults);
      onSearchResults(searchResults);

      // Generate default layer name
      const stateName = googlePlacesSearchService.getStateName(selectedState);
      const searchMethod = useGridSearch ? `Grid ${gridSizeKm}km` : 'Text';
      setLayerName(`${searchTerm} - ${stateName} (${searchMethod}) - ${new Date().toLocaleDateString()}`);

      // Refresh usage stats
      await loadUsageStats();
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
      setSearchProgress(null);
    }
  };

  const handleSaveAsLayer = async () => {
    if (results.length === 0 || !layerName.trim()) return;

    setIsSaving(true);
    try {
      await onSaveAsLayer(results, layerName.trim());
      setShowSaveOptions(false);
      setLayerName('');
    } catch (error) {
      console.error('Failed to save layer:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveQuery = async () => {
    if (!saveQueryName.trim() || !searchTerm.trim()) return;

    try {
      await closedPlacesLayerService.createSavedQuery({
        name: saveQueryName.trim(),
        queryType: searchType === 'chain' ? 'text' : 'nearby',
        searchTerm: searchTerm.trim(),
        statusFilter,
        geographyType: 'state',
        geographyData: { state: selectedState },
      });
      await loadSavedQueries();
      setShowSaveQueryForm(false);
      setSaveQueryName('');
    } catch (error) {
      console.error('Failed to save query:', error);
    }
  };

  const handleRunSavedQuery = async (query: SavedQuery) => {
    setSearchTerm(query.search_term);
    setStatusFilter(query.status_filter);
    if (query.geography_data.state) {
      setSelectedState(query.geography_data.state);
    }
    setSearchType(query.query_type === 'text' ? 'chain' : 'category');
    setShowSavedQueries(false);

    // Run the search after a brief delay to let state update
    setTimeout(() => {
      handleSearch();
    }, 100);
  };

  const handleDeleteSavedQuery = async (queryId: string) => {
    try {
      await closedPlacesLayerService.deleteSavedQuery(queryId);
      await loadSavedQueries();
    } catch (error) {
      console.error('Failed to delete query:', error);
    }
  };

  const handleCancel = () => {
    setResults([]);
    setSearchError(null);
    setShowSaveOptions(false);
    setLayerName('');
    onSearchResults([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-32 w-96 z-[1000] bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col max-h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">Closed Business Search</h3>
          <p className="text-xs text-gray-500">Find closed businesses via Google Places</p>
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

      {/* Budget Display */}
      {usageStats && (
        <div className={`px-4 py-2 text-xs border-b ${
          usageStats.isOverBudget
            ? 'bg-red-50 border-red-200 text-red-700'
            : usageStats.isNearBudget
            ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
            : 'bg-gray-50 border-gray-200 text-gray-600'
        }`}>
          <div className="flex justify-between items-center">
            <span>
              API Budget: ${(usageStats.usedCents / 100).toFixed(2)} / ${(usageStats.limitCents / 100).toFixed(2)}
            </span>
            <span className="font-medium">
              {usageStats.usedRequests} calls this month
            </span>
          </div>
          {usageStats.isOverBudget && (
            <div className="mt-1 font-medium">Budget exceeded - searches blocked</div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Saved Queries Toggle */}
        <div className="flex justify-between items-center">
          <button
            onClick={() => setShowSavedQueries(!showSavedQueries)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            Saved Queries ({savedQueries.length})
          </button>
        </div>

        {/* Saved Queries List */}
        {showSavedQueries && savedQueries.length > 0 && (
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
            {savedQueries.map(query => (
              <div
                key={query.id}
                className="px-3 py-2 border-b border-gray-100 last:border-b-0 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{query.name}</div>
                  <div className="text-xs text-gray-500">
                    {query.search_term} in {query.geography_data.state}
                    {query.last_run_at && ` • Last run: ${new Date(query.last_run_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => handleRunSavedQuery(query)}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Run
                  </button>
                  <button
                    onClick={() => handleDeleteSavedQuery(query.id)}
                    className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Search Type</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSearchType('chain')}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border ${
                searchType === 'chain'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Chain Name
            </button>
            <button
              onClick={() => setSearchType('category')}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border ${
                searchType === 'category'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Category
            </button>
          </div>
        </div>

        {/* Search Term */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {searchType === 'chain' ? 'Chain Name' : 'Business Category'}
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={searchType === 'chain' ? 'e.g., Del Taco' : 'e.g., restaurant'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="both">Both (Permanently & Temporarily)</option>
            <option value="permanently_closed">Permanently Closed Only</option>
            <option value="temporarily_closed">Temporarily Closed Only</option>
          </select>
        </div>

        {/* State Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {sortedStates.map(state => (
              <option key={state.fips} value={state.abbr}>
                {state.name} {SOUTHEASTERN_STATES.includes(state.abbr) ? '★' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Grid Search Option */}
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useGridSearch}
                onChange={(e) => setUseGridSearch(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Grid Search</span>
            </label>
            <span className="text-xs text-gray-500">More thorough, higher cost</span>
          </div>

          {useGridSearch && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Grid Size: {gridSizeKm} km
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={gridSizeKm}
                onChange={(e) => setGridSizeKm(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10km (thorough)</span>
                <span>100km (fast)</span>
              </div>
            </div>
          )}
        </div>

        {/* Estimated API Calls & Cost */}
        <div className={`p-3 rounded-lg ${
          estimatedCalls > 500
            ? 'bg-red-50 border border-red-200'
            : estimatedCalls > 100
            ? 'bg-yellow-50 border border-yellow-200'
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Estimated Cost</span>
            <span className={`text-sm font-bold ${
              estimatedCalls > 500 ? 'text-red-600' : estimatedCalls > 100 ? 'text-yellow-600' : 'text-gray-900'
            }`}>
              ${((estimatedCalls * 2) / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-500">API Calls</span>
            <span className="text-xs text-gray-600">~{estimatedCalls.toLocaleString()} calls</span>
          </div>
          {useGridSearch && (
            <div className="text-xs text-gray-500 mt-2">
              Grid search covers the entire state in {gridSizeKm}km cells
            </div>
          )}
        </div>

        {/* Cost Warning */}
        {showCostWarning && (
          <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-yellow-800">High Cost Search</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  This search will cost approximately <strong>${((estimatedCalls * 2) / 100).toFixed(2)}</strong> ({estimatedCalls.toLocaleString()} API calls).
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleSearch(true)}
                    className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                  >
                    Proceed Anyway
                  </button>
                  <button
                    onClick={() => setShowCostWarning(false)}
                    className="px-3 py-1.5 text-yellow-700 text-sm hover:bg-yellow-100 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Progress */}
        {searchProgress && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="text-sm text-blue-700">
                Searching grid cell {searchProgress.current} of {searchProgress.total}...
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(searchProgress.current / searchProgress.total) * 100}%` }}
              ></div>
            </div>
            <div className="text-xs text-blue-600 mt-1 text-right">
              {Math.round((searchProgress.current / searchProgress.total) * 100)}%
            </div>
          </div>
        )}

        {/* Search Button */}
        <button
          onClick={() => handleSearch()}
          disabled={isSearching || !searchTerm.trim() || usageStats?.isOverBudget || showCostWarning}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSearching ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              {searchProgress ? `Searching (${searchProgress.current}/${searchProgress.total})...` : 'Searching...'}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {useGridSearch ? `Grid Search (~$${((estimatedCalls * 2) / 100).toFixed(2)})` : 'Search'}
            </>
          )}
        </button>

        {/* Error Display */}
        {searchError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {searchError}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-700">
                Results ({results.length})
              </h4>
              {!showSaveQueryForm && (
                <button
                  onClick={() => setShowSaveQueryForm(true)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Save Query
                </button>
              )}
            </div>

            {/* Save Query Form */}
            {showSaveQueryForm && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="text"
                  value={saveQueryName}
                  onChange={(e) => setSaveQueryName(e.target.value)}
                  placeholder="Query name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveQuery}
                    disabled={!saveQueryName.trim()}
                    className="flex-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowSaveQueryForm(false)}
                    className="px-3 py-1 text-gray-600 text-sm hover:bg-gray-200 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Results List */}
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
              {results.map(place => (
                <div
                  key={place.place_id}
                  className="px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {place.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {place.formatted_address}
                      </div>
                    </div>
                    <span className={`ml-2 px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                      place.business_status === 'CLOSED_PERMANENTLY'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {place.business_status === 'CLOSED_PERMANENTLY' ? 'Permanent' : 'Temporary'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer - Save Options */}
      {results.length > 0 && (
        <div className="p-4 border-t border-gray-200 space-y-3">
          {!showSaveOptions ? (
            <div className="space-y-2">
              <button
                onClick={() => setShowSaveOptions(true)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Save as Layer ({results.length} places)
              </button>
              {onBulkAddToProperties && (
                <button
                  onClick={onBulkAddToProperties}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Bulk Add to Properties ({results.length})
                </button>
              )}
            </div>
          ) : (
            <>
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

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveOptions(false)}
                  className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsLayer}
                  disabled={isSaving || !layerName.trim()}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Layer'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty State Footer */}
      {results.length === 0 && !isSearching && (
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 text-center">
            Enter a business name or category and select a state to search
          </div>
        </div>
      )}
    </div>
  );
};

export default ClosedBusinessSearchPanel;
