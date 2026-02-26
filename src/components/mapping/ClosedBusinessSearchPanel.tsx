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
}

const ClosedBusinessSearchPanel: React.FC<ClosedBusinessSearchPanelProps> = ({
  isOpen,
  onClose,
  map,
  onSearchResults,
  onSaveAsLayer,
}) => {
  // Search form state
  const [searchType, setSearchType] = useState<'chain' | 'category'>('chain');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('both');
  const [selectedState, setSelectedState] = useState('GA');

  // Results state
  const [results, setResults] = useState<PlacesSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Budget state
  const [usageStats, setUsageStats] = useState<ApiUsageStats | null>(null);
  const [estimatedCalls, setEstimatedCalls] = useState(0);

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

  // Update estimated calls when search parameters change
  useEffect(() => {
    if (searchType === 'chain') {
      setEstimatedCalls(2); // Text search is typically 1-2 calls
    } else {
      // For category search, estimate based on state size
      setEstimatedCalls(30); // Grid-based search
    }
  }, [searchType, selectedState]);

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

  const handleSearch = async () => {
    if (!searchTerm.trim() || !selectedState) return;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      // Check budget first
      const { available, stats } = await googlePlacesSearchService.checkBudgetAvailable(estimatedCalls);
      setUsageStats(stats);

      if (!available) {
        setSearchError(
          `Insufficient budget. This search requires ~${estimatedCalls} API calls, ` +
          `but only $${(stats.remainingCents / 100).toFixed(2)} remaining.`
        );
        return;
      }

      // Perform search
      const searchResults = await googlePlacesSearchService.searchClosedInState(
        searchTerm.trim(),
        selectedState,
        statusFilter
      );

      setResults(searchResults);
      onSearchResults(searchResults);

      // Generate default layer name
      const stateName = googlePlacesSearchService.getStateName(selectedState);
      setLayerName(`${searchTerm} - ${stateName} - ${new Date().toLocaleDateString()}`);

      // Refresh usage stats
      await loadUsageStats();
    } catch (error) {
      console.error('Search failed:', error);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
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

        {/* Estimated API Calls */}
        <div className="text-xs text-gray-500">
          Estimated API calls: ~{estimatedCalls}
          {usageStats && (
            <span className="ml-1">
              (${((estimatedCalls * 2) / 100).toFixed(2)} estimated cost)
            </span>
          )}
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={isSearching || !searchTerm.trim() || usageStats?.isOverBudget}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSearching ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Searching...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
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
            <button
              onClick={() => setShowSaveOptions(true)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Save as Layer ({results.length} places)
            </button>
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
