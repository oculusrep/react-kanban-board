import React, { useState, useCallback, useEffect } from 'react';
import {
  MagnifyingGlassIcon,
  MapIcon,
  TableCellsIcon,
  AdjustmentsHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import {
  SortConfig,
  PropertySearchResult,
  DEFAULT_COLUMNS,
} from '../types/advanced-search';
import { useAdvancedPropertySearch } from '../hooks/useAdvancedPropertySearch';
import FilterPanel, { ActiveFilter, convertFiltersToGroups } from '../components/advanced-search/FilterPanel';
import PropertySearchResultsTable from '../components/advanced-search/PropertySearchResultsTable';
import ColumnCustomizer from '../components/advanced-search/ColumnCustomizer';
import SearchMapView from '../components/advanced-search/SearchMapView';
import PropertySidebar from '../components/property/PropertySidebar';

const PAGE_SIZE = 50;

type ViewMode = 'map' | 'table';

export default function AdvancedPropertySearchPage() {
  // Filter state - using new pill-based approach
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);

  // Results state
  const [results, setResults] = useState<PropertySearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Sorting
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    field: 'property_name',
    direction: 'asc',
  });

  // Columns
  const [selectedColumns, setSelectedColumns] = useState<string[]>([...DEFAULT_COLUMNS]);

  // View mode - map is default
  const [viewMode, setViewMode] = useState<ViewMode>('map');

  // Filter sidebar state
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(true);

  // Selected property for sidebar
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Search hook
  const { executeSearch, loading, error } = useAdvancedPropertySearch();

  // Execute search
  const handleSearch = useCallback(async () => {
    if (activeFilters.length === 0) return;

    setHasSearched(true);
    setCurrentPage(1);

    const filterGroups = convertFiltersToGroups(activeFilters);

    const { data, count } = await executeSearch({
      filterGroups,
      pageSize: PAGE_SIZE,
      offset: 0,
      sortConfig,
    });

    setResults(data);
    setTotalCount(count);
  }, [activeFilters, sortConfig, executeSearch]);

  // Handle page change
  const handlePageChange = useCallback(async (page: number) => {
    setCurrentPage(page);
    const offset = (page - 1) * PAGE_SIZE;

    const filterGroups = convertFiltersToGroups(activeFilters);

    const { data, count } = await executeSearch({
      filterGroups,
      pageSize: PAGE_SIZE,
      offset,
      sortConfig,
    });

    setResults(data);
    setTotalCount(count);
  }, [activeFilters, sortConfig, executeSearch]);

  // Handle sort change
  const handleSortChange = useCallback(async (newSortConfig: SortConfig) => {
    setSortConfig(newSortConfig);

    if (hasSearched) {
      setCurrentPage(1);
      const filterGroups = convertFiltersToGroups(activeFilters);

      const { data, count } = await executeSearch({
        filterGroups,
        pageSize: PAGE_SIZE,
        offset: 0,
        sortConfig: newSortConfig,
      });

      setResults(data);
      setTotalCount(count);
    }
  }, [activeFilters, hasSearched, executeSearch]);

  // Handle row/pin click
  const handlePropertySelect = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    setSidebarOpen(true);
  };

  // Clear search
  const handleClear = () => {
    setActiveFilters([]);
    setResults([]);
    setTotalCount(0);
    setHasSearched(false);
    setCurrentPage(1);
  };

  // Handle enter key to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && activeFilters.length > 0 && !loading) {
        // Only trigger if not focused in an input
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          handleSearch();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeFilters.length, loading, handleSearch]);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#F8FAFC]">
      {/* Left Filter Sidebar */}
      <div
        className={`flex-shrink-0 bg-white border-r border-gray-200 transition-all duration-300 flex flex-col ${
          filterSidebarOpen ? 'w-80' : 'w-0'
        }`}
        style={{ overflow: filterSidebarOpen ? 'visible' : 'hidden' }}
      >
        {filterSidebarOpen && (
          <>
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="h-5 w-5 text-[#002147]" />
                <span className="font-semibold text-[#002147]">Search</span>
              </div>
              <button
                onClick={() => setFilterSidebarOpen(false)}
                className="p-1 text-gray-400 hover:text-[#002147] rounded transition-colors"
                title="Collapse filters"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Filter Panel */}
            <FilterPanel
              activeFilters={activeFilters}
              onFiltersChange={setActiveFilters}
              onSearch={handleSearch}
              onClear={handleClear}
              loading={loading}
              resultCount={hasSearched ? totalCount : null}
              hasSearched={hasSearched}
              error={error}
            />
          </>
        )}
      </div>

      {/* Collapsed Sidebar Toggle */}
      {!filterSidebarOpen && (
        <button
          onClick={() => setFilterSidebarOpen(true)}
          className="flex-shrink-0 w-10 bg-white border-r border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#002147] hover:bg-gray-50 transition-colors"
          title="Expand filters"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center border border-[#8FA9C8] rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                  viewMode === 'map'
                    ? 'bg-[#002147] text-white'
                    : 'bg-white text-[#4A6B94] hover:bg-gray-50'
                }`}
              >
                <MapIcon className="h-4 w-4" />
                Map
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                  viewMode === 'table'
                    ? 'bg-[#002147] text-white'
                    : 'bg-white text-[#4A6B94] hover:bg-gray-50'
                }`}
              >
                <TableCellsIcon className="h-4 w-4" />
                Table
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'table' && (
              <ColumnCustomizer
                selectedColumns={selectedColumns}
                onChange={setSelectedColumns}
              />
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative">
          {!hasSearched ? (
            // Empty state
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
              <MagnifyingGlassIcon className="h-16 w-16 mb-4 text-gray-300" />
              <p className="text-lg font-medium">Build your search</p>
              <p className="text-sm">Add filter criteria and click Search</p>
            </div>
          ) : results.length === 0 ? (
            // No results
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
              <MagnifyingGlassIcon className="h-16 w-16 mb-4 text-gray-300" />
              <p className="text-lg font-medium">No properties found</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          ) : (
            <>
              {/* Map View - always mounted for state preservation */}
              <div
                className="absolute inset-0"
                style={{ display: viewMode === 'map' ? 'block' : 'none' }}
              >
                <SearchMapView
                  results={results}
                  selectedPropertyId={selectedPropertyId}
                  onPropertySelect={handlePropertySelect}
                />
              </div>

              {/* Table View - always mounted for state preservation */}
              <div
                className="absolute inset-0 overflow-auto"
                style={{ display: viewMode === 'table' ? 'block' : 'none' }}
              >
                <PropertySearchResultsTable
                  results={results}
                  columns={selectedColumns}
                  sortConfig={sortConfig}
                  onSortChange={handleSortChange}
                  onRowClick={handlePropertySelect}
                  selectedPropertyId={selectedPropertyId}
                  currentPage={currentPage}
                  pageSize={PAGE_SIZE}
                  totalCount={totalCount}
                  onPageChange={handlePageChange}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Property Sidebar */}
      {selectedPropertyId && (
        <PropertySidebar
          propertyId={selectedPropertyId}
          isOpen={sidebarOpen}
          onClose={() => {
            setSidebarOpen(false);
            setSelectedPropertyId(null);
          }}
        />
      )}
    </div>
  );
}
