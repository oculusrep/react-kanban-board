import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  MapIcon,
  TableCellsIcon,
  BookmarkIcon,
  FolderOpenIcon,
  ChevronDownIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { useAdvancedPropertySearch } from '../../hooks/useAdvancedPropertySearch';
import { PropertySearchResult, SortConfig, FilterGroup } from '../../types/advanced-search';
import { usePropertyRecordTypes } from '../../hooks/usePropertyRecordTypes';
import { useSavedSearches } from '../../hooks/useSavedSearches';
import SaveSearchModal from '../advanced-search/SaveSearchModal';

// Active filter type
interface ActiveFilter {
  id: string;
  field: string;
  label: string;
  operator: string;
  value: string;
  displayValue: string;
}

// Field configuration
interface FilterFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'number' | 'number-range' | 'boolean' | 'select';
  placeholder?: string;
  table: 'property' | 'property_unit';
  optionsKey?: string;
}

// All available fields
const ALL_FIELDS: FilterFieldConfig[] = [
  // Standard fields
  { key: 'property_record_type_id', label: 'Property Type', type: 'select', optionsKey: 'propertyRecordTypes', table: 'property' },
  { key: 'city', label: 'City', type: 'text', placeholder: 'Enter city...', table: 'property' },
  { key: 'state', label: 'State', type: 'text', placeholder: 'Enter state...', table: 'property' },
  { key: 'property_name', label: 'Property Name', type: 'text', placeholder: 'Search properties...', table: 'property' },
  { key: 'building_sqft', label: 'Building Sqft', type: 'number-range', placeholder: 'Sqft', table: 'property' },
  { key: 'available_sqft', label: 'Available Sqft', type: 'number-range', placeholder: 'Sqft', table: 'property' },
  { key: 'rent_psf', label: 'Rent PSF', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'asking_purchase_price', label: 'Purchase Price', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'acres', label: 'Acres', type: 'number-range', placeholder: 'Acres', table: 'property' },
  // Advanced fields
  { key: 'landlord', label: 'Landlord', type: 'text', placeholder: 'Enter landlord...', table: 'property' },
  { key: 'address', label: 'Address', type: 'text', placeholder: 'Enter address...', table: 'property' },
  { key: 'zip', label: 'ZIP Code', type: 'text', placeholder: 'Enter ZIP...', table: 'property' },
  { key: 'county', label: 'County', type: 'text', placeholder: 'Enter county...', table: 'property' },
  { key: 'trade_area', label: 'Trade Area', type: 'text', placeholder: 'Enter trade area...', table: 'property' },
  { key: 'nnn_psf', label: 'NNN PSF', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'all_in_rent', label: 'All-In Rent', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'end_cap', label: 'End Cap', type: 'boolean', table: 'property_unit' },
  { key: 'patio', label: 'Patio', type: 'boolean', table: 'property_unit' },
  { key: 'inline', label: 'Inline', type: 'boolean', table: 'property_unit' },
  { key: 'second_gen_restaurant', label: '2nd Gen Restaurant', type: 'boolean', table: 'property_unit' },
];

const PAGE_SIZE = 50;

export type SearchViewMode = 'map' | 'table';

interface PropertySearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  onPropertySelect: (propertyId: string) => void;
  onResultsChange?: (results: PropertySearchResult[]) => void;
  viewMode: SearchViewMode;
  onViewModeChange: (mode: SearchViewMode) => void;
}

export default function PropertySearchBar({
  isOpen,
  onClose,
  onPropertySelect,
  onResultsChange,
  viewMode,
  onViewModeChange,
}: PropertySearchBarProps) {
  // Filter state
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [selectedField, setSelectedField] = useState<FilterFieldConfig | null>(null);
  const [fieldValues, setFieldValues] = useState<{ value?: string; min?: string; max?: string }>({});
  const addFilterRef = useRef<HTMLDivElement>(null);

  // Results state
  const [results, setResults] = useState<PropertySearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    field: 'property_name',
    direction: 'asc',
  });

  // Search hook
  const { executeSearch, loading, error } = useAdvancedPropertySearch();

  // Property record types for select field
  const { propertyRecordTypes } = usePropertyRecordTypes();

  // Saved searches
  const { savedSearches, mySearches, publicSearches, saveSearch } = useSavedSearches();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedSearchesDropdown, setShowSavedSearchesDropdown] = useState(false);
  const savedSearchesDropdownRef = useRef<HTMLDivElement>(null);

  // Convert filters to filter groups for the search hook
  const convertFiltersToGroups = useCallback((filters: ActiveFilter[]) => {
    if (filters.length === 0) return [];

    const conditions = filters.map(filter => {
      const fieldConfig = ALL_FIELDS.find(f => f.key === filter.field);
      const fieldType = fieldConfig?.type === 'number-range' ? 'numeric' :
                        fieldConfig?.type === 'boolean' ? 'boolean' :
                        fieldConfig?.type === 'number' ? 'numeric' :
                        fieldConfig?.type === 'select' ? 'text' : 'text';

      return {
        id: filter.id,
        field: {
          key: filter.field,
          label: filter.label,
          type: fieldType as 'text' | 'numeric' | 'boolean' | 'date',
          table: fieldConfig?.table || 'property' as 'property' | 'property_unit',
        },
        operator: filter.operator as any,
        value: fieldType === 'numeric' ? Number(filter.value) :
               fieldType === 'boolean' ? filter.value === 'true' :
               filter.value,
        value2: null,
      };
    });

    return [{
      id: crypto.randomUUID(),
      conditions,
    }];
  }, []);

  // Execute search
  const handleSearch = useCallback(async () => {
    if (activeFilters.length === 0) return;

    setHasSearched(true);

    const filterGroups = convertFiltersToGroups(activeFilters);

    const { data, count } = await executeSearch({
      filterGroups,
      pageSize: PAGE_SIZE,
      offset: 0,
      sortConfig,
    });

    setResults(data);
    setTotalCount(count);
    onResultsChange?.(data);
  }, [activeFilters, sortConfig, executeSearch, convertFiltersToGroups, onResultsChange]);

  // Clear search
  const handleClear = () => {
    setActiveFilters([]);
    setResults([]);
    setTotalCount(0);
    setHasSearched(false);
    onResultsChange?.([]);
  };

  // Filter manipulation
  const removeFilter = (filterId: string) => {
    const newFilters = activeFilters.filter(f => f.id !== filterId);
    setActiveFilters(newFilters);

    // Re-run search if we still have filters
    if (newFilters.length > 0 && hasSearched) {
      // Trigger search with new filters
      setTimeout(() => {
        const filterGroups = convertFiltersToGroups(newFilters);
        executeSearch({
          filterGroups,
          pageSize: PAGE_SIZE,
          offset: 0,
          sortConfig,
        }).then(({ data, count }) => {
          setResults(data);
          setTotalCount(count);
          onResultsChange?.(data);
        });
      }, 0);
    } else if (newFilters.length === 0) {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      onResultsChange?.([]);
    }
  };

  const addFilter = (field: FilterFieldConfig, value: string, operator: string = 'contains', displayValue?: string) => {
    if (!value.trim()) return;

    const newFilter: ActiveFilter = {
      id: crypto.randomUUID(),
      field: field.key,
      label: field.label,
      operator,
      value: value.trim(),
      displayValue: displayValue || value.trim(),
    };

    setActiveFilters(prev => [...prev, newFilter]);
    setSelectedField(null);
    setFieldValues({});
    setShowAddFilter(false);
  };

  const addRangeFilter = (field: FilterFieldConfig, min?: string, max?: string) => {
    const newFilters: ActiveFilter[] = [];

    if (min?.trim()) {
      newFilters.push({
        id: crypto.randomUUID(),
        field: field.key,
        label: field.label,
        operator: 'greater_than',
        value: min.trim(),
        displayValue: `≥ ${formatNumber(min.trim())}`,
      });
    }

    if (max?.trim()) {
      newFilters.push({
        id: crypto.randomUUID(),
        field: field.key,
        label: field.label,
        operator: 'less_than',
        value: max.trim(),
        displayValue: `≤ ${formatNumber(max.trim())}`,
      });
    }

    if (newFilters.length > 0) {
      setActiveFilters(prev => [...prev, ...newFilters]);
      setSelectedField(null);
      setFieldValues({});
      setShowAddFilter(false);
    }
  };

  const addBooleanFilter = (field: FilterFieldConfig, value: boolean) => {
    const newFilter: ActiveFilter = {
      id: crypto.randomUUID(),
      field: field.key,
      label: field.label,
      operator: value ? 'is_true' : 'is_false',
      value: String(value),
      displayValue: value ? 'Yes' : 'No',
    };

    setActiveFilters(prev => [...prev, newFilter]);
    setSelectedField(null);
    setShowAddFilter(false);
  };

  const formatNumber = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString();
  };

  // Convert for saving
  const activeFiltersToFilterGroups = useCallback((filters: ActiveFilter[]): FilterGroup[] => {
    if (filters.length === 0) return [];

    const conditions = filters.map(filter => {
      const fieldConfig = ALL_FIELDS.find(f => f.key === filter.field);
      const fieldType = fieldConfig?.type === 'number-range' ? 'numeric' :
                        fieldConfig?.type === 'boolean' ? 'boolean' :
                        fieldConfig?.type === 'number' ? 'numeric' :
                        fieldConfig?.type === 'select' ? 'text' : 'text';

      return {
        id: filter.id,
        field: {
          key: filter.field,
          label: filter.label,
          type: fieldType as 'text' | 'numeric' | 'boolean' | 'date',
          table: fieldConfig?.table || 'property' as 'property' | 'property_unit',
        },
        operator: filter.operator as any,
        value: fieldType === 'numeric' ? Number(filter.value) :
               fieldType === 'boolean' ? filter.value === 'true' :
               filter.value,
        value2: null,
      };
    });

    return [{
      id: crypto.randomUUID(),
      conditions,
    }];
  }, []);

  // Convert for loading
  const filterGroupsToActiveFilters = useCallback((groups: FilterGroup[]): ActiveFilter[] => {
    const filters: ActiveFilter[] = [];

    for (const group of groups) {
      for (const condition of group.conditions) {
        if (!condition.field) continue;

        let displayValue = String(condition.value);
        if (condition.operator === 'greater_than') {
          displayValue = `≥ ${formatNumber(String(condition.value))}`;
        } else if (condition.operator === 'less_than') {
          displayValue = `≤ ${formatNumber(String(condition.value))}`;
        } else if (condition.operator === 'is_true') {
          displayValue = 'Yes';
        } else if (condition.operator === 'is_false') {
          displayValue = 'No';
        } else if (condition.field.key === 'property_record_type_id') {
          const prt = propertyRecordTypes.find(p => p.id === condition.value);
          displayValue = prt?.label || String(condition.value);
        }

        filters.push({
          id: condition.id,
          field: condition.field.key,
          label: condition.field.label,
          operator: condition.operator as string,
          value: String(condition.value),
          displayValue,
        });
      }
    }

    return filters;
  }, [propertyRecordTypes]);

  // Handle save search
  const handleSaveSearch = async (name: string, description: string, isPublic: boolean) => {
    const filterGroups = activeFiltersToFilterGroups(activeFilters);

    await saveSearch({
      name,
      description,
      isPublic,
      filterGroups,
      columns: ['property_name', 'address', 'city', 'state', 'building_sqft', 'rent_psf'],
      sortConfig,
    });

    setShowSaveModal(false);
  };

  // Handle load saved search
  const handleLoadSearch = async (searchId: string) => {
    const search = savedSearches.find(s => s.id === searchId);
    if (!search) return;

    const filters = filterGroupsToActiveFilters(search.filter_groups);
    setActiveFilters(filters);

    if (search.sort_config) {
      setSortConfig(search.sort_config);
    }

    setShowSavedSearchesDropdown(false);

    // Auto-run the search
    setHasSearched(true);
    const filterGroups = search.filter_groups;
    const { data, count } = await executeSearch({
      filterGroups,
      pageSize: PAGE_SIZE,
      offset: 0,
      sortConfig: search.sort_config || sortConfig,
    });

    setResults(data);
    setTotalCount(count);
    onResultsChange?.(data);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!showAddFilter && !showSavedSearchesDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (showSavedSearchesDropdown && savedSearchesDropdownRef.current && !savedSearchesDropdownRef.current.contains(target)) {
        setShowSavedSearchesDropdown(false);
      }
      if (showAddFilter && addFilterRef.current && !addFilterRef.current.contains(target)) {
        setShowAddFilter(false);
        setSelectedField(null);
      }
    };

    // Add listener on next tick to avoid catching the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showAddFilter, showSavedSearchesDropdown]);

  // Handle key press for filter input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && selectedField) {
      if (selectedField.type === 'number-range') {
        addRangeFilter(selectedField, fieldValues.min, fieldValues.max);
      } else if (selectedField.type === 'text') {
        addFilter(selectedField, fieldValues.value || '');
      }
    } else if (e.key === 'Escape') {
      setShowAddFilter(false);
      setSelectedField(null);
    }
  };

  const canSearch = activeFilters.length > 0;

  if (!isOpen) return null;

  return (
    <>
      <div className="bg-white border-b border-gray-200 shadow-sm relative" style={{ zIndex: 10000 }}>
        {/* Main Bar */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Search Icon & Label */}
          <div className="flex items-center gap-1.5 text-[#002147]">
            <MagnifyingGlassIcon className="h-4 w-4" />
            <span className="text-sm font-medium">Search</span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-300" />

          {/* Active Filter Pills */}
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto">
            {activeFilters.map(filter => (
              <div
                key={filter.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#002147] text-white text-xs rounded-full whitespace-nowrap"
              >
                <span className="font-medium">{filter.label}:</span>
                <span>{filter.displayValue}</span>
                <button
                  onClick={() => removeFilter(filter.id)}
                  className="ml-0.5 p-0.5 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Add Filter Button */}
            <div className="relative" ref={addFilterRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddFilter(!showAddFilter);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-[#4A6B94] border border-dashed border-[#8FA9C8] rounded-full hover:border-[#002147] hover:text-[#002147] transition-colors whitespace-nowrap"
              >
                <PlusIcon className="h-3 w-3" />
                Add Filter
              </button>
            </div>
          </div>

          {/* Add Filter Dropdown - rendered via portal to escape stacking contexts */}
          {showAddFilter && !selectedField && ReactDOM.createPortal(
            <div
              className="fixed bg-white rounded-md shadow-lg border border-gray-200 max-h-64 overflow-y-auto"
              style={{
                zIndex: 2147483647,
                top: addFilterRef.current ? addFilterRef.current.getBoundingClientRect().bottom + 4 : 0,
                left: addFilterRef.current ? addFilterRef.current.getBoundingClientRect().left : 0,
                width: '12rem'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {ALL_FIELDS.map(field => (
                <button
                  key={field.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedField(field);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                >
                  {field.label}
                </button>
              ))}
            </div>,
            document.body
          )}

          {/* Field Value Input - rendered via portal to escape stacking contexts */}
          {showAddFilter && selectedField && ReactDOM.createPortal(
            <div
              className="fixed bg-white rounded-md shadow-lg border border-gray-200 p-3"
              style={{
                zIndex: 2147483647,
                top: addFilterRef.current ? addFilterRef.current.getBoundingClientRect().bottom + 4 : 0,
                left: addFilterRef.current ? addFilterRef.current.getBoundingClientRect().left : 0,
                width: selectedField.type === 'number-range' ? '20rem' : '16rem'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-xs font-medium text-[#002147] mb-2">{selectedField.label}</div>

              {selectedField.type === 'text' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fieldValues.value || ''}
                    onChange={(e) => setFieldValues({ value: e.target.value })}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedField.placeholder}
                    className="flex-1 px-2 py-1 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => addFilter(selectedField, fieldValues.value || '')}
                    disabled={!fieldValues.value?.trim()}
                    className="px-2 py-1 text-xs bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              )}

              {selectedField.type === 'number-range' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={fieldValues.min || ''}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, min: e.target.value }))}
                      onKeyDown={handleKeyDown}
                      placeholder="Min"
                      className="w-24 px-2 py-1 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none"
                      autoFocus
                    />
                    <span className="text-gray-400 text-xs flex-shrink-0">to</span>
                    <input
                      type="number"
                      value={fieldValues.max || ''}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, max: e.target.value }))}
                      onKeyDown={handleKeyDown}
                      placeholder="Max"
                      className="w-24 px-2 py-1 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => addRangeFilter(selectedField, fieldValues.min, fieldValues.max)}
                    disabled={!fieldValues.min?.trim() && !fieldValues.max?.trim()}
                    className="w-full px-2 py-1 text-xs bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50"
                  >
                    Add Range
                  </button>
                </div>
              )}

              {selectedField.type === 'boolean' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => addBooleanFilter(selectedField, true)}
                    className="flex-1 px-2 py-1 text-xs bg-[#002147] text-white rounded hover:bg-[#001a38]"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => addBooleanFilter(selectedField, false)}
                    className="flex-1 px-2 py-1 text-xs border border-[#8FA9C8] text-[#4A6B94] rounded hover:bg-gray-50"
                  >
                    No
                  </button>
                </div>
              )}

              {selectedField.type === 'select' && selectedField.optionsKey === 'propertyRecordTypes' && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {propertyRecordTypes.map(prt => (
                    <button
                      key={prt.id}
                      onClick={() => addFilter(selectedField, prt.id, 'equals', prt.label)}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                    >
                      {prt.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => {
                  setSelectedField(null);
                  setFieldValues({});
                }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                ← Back to fields
              </button>
            </div>,
            document.body
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-gray-300" />

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={!canSearch || loading}
            className="flex items-center gap-1 px-3 py-1 bg-[#002147] text-white text-xs font-medium rounded hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <MagnifyingGlassIcon className="h-3.5 w-3.5" />
            {loading ? 'Searching...' : 'Search'}
          </button>

          {/* Results Count */}
          {hasSearched && (
            <span className="text-xs text-[#4A6B94] whitespace-nowrap">
              {totalCount} {totalCount === 1 ? 'result' : 'results'}
            </span>
          )}

          {/* View Toggle */}
          {hasSearched && results.length > 0 && (
            <>
              <div className="h-5 w-px bg-gray-300" />
              <div className="flex items-center border border-[#8FA9C8] rounded overflow-hidden">
                <button
                  onClick={() => onViewModeChange('map')}
                  className={`flex items-center gap-1 px-2 py-1 text-xs ${
                    viewMode === 'map'
                      ? 'bg-[#002147] text-white'
                      : 'bg-white text-[#4A6B94] hover:bg-gray-50'
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5" />
                  Map
                </button>
                <button
                  onClick={() => onViewModeChange('table')}
                  className={`flex items-center gap-1 px-2 py-1 text-xs ${
                    viewMode === 'table'
                      ? 'bg-[#002147] text-white'
                      : 'bg-white text-[#4A6B94] hover:bg-gray-50'
                  }`}
                >
                  <TableCellsIcon className="h-3.5 w-3.5" />
                  Table
                </button>
              </div>
            </>
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-gray-300" />

          {/* Save Button */}
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={!canSearch}
            className="p-1.5 text-[#4A6B94] hover:text-[#002147] hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Save Search"
          >
            <BookmarkIcon className="h-4 w-4" />
          </button>

          {/* Saved Searches */}
          <div className="relative" ref={savedSearchesDropdownRef}>
            <button
              onClick={() => setShowSavedSearchesDropdown(!showSavedSearchesDropdown)}
              className="p-1.5 text-[#4A6B94] hover:text-[#002147] hover:bg-gray-100 rounded transition-colors"
              title="Load Saved Search"
            >
              <FolderOpenIcon className="h-4 w-4" />
            </button>

            {showSavedSearchesDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-[1200] max-h-80 overflow-y-auto">
                {savedSearches.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No saved searches yet
                  </div>
                ) : (
                  <>
                    {mySearches.length > 0 && (
                      <div>
                        <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b">
                          My Searches
                        </div>
                        {mySearches.map(search => (
                          <button
                            key={search.id}
                            onClick={() => handleLoadSearch(search.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100"
                          >
                            <div className="font-medium text-[#002147]">{search.name}</div>
                            {search.description && (
                              <div className="text-xs text-gray-500 truncate">{search.description}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {publicSearches.length > 0 && (
                      <div>
                        <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b">
                          Public Searches
                        </div>
                        {publicSearches.map(search => (
                          <button
                            key={search.id}
                            onClick={() => handleLoadSearch(search.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100"
                          >
                            <div className="font-medium text-[#002147]">{search.name}</div>
                            <div className="text-xs text-gray-400">by {search.created_by_name}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Clear Button */}
          {activeFilters.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-[#4A6B94] hover:text-[#002147] transition-colors"
            >
              Clear
            </button>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Close Search"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-3 py-1 bg-red-50 text-red-600 text-xs">
            Error: {error}
          </div>
        )}
      </div>

      {/* Save Search Modal */}
      <SaveSearchModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveSearch}
        mode="create"
      />
    </>
  );
}
