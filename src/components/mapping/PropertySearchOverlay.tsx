/**
 * @deprecated This component has been replaced by PropertySearchBar.tsx
 * PropertySearchBar provides a horizontal top bar filter interface instead of
 * the sidebar overlay approach. This file is kept for reference but is no longer used.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  MapIcon,
  TableCellsIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BookmarkIcon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { useAdvancedPropertySearch } from '../../hooks/useAdvancedPropertySearch';
import { PropertySearchResult, SortConfig, DEFAULT_COLUMNS, FilterGroup } from '../../types/advanced-search';
import PropertySearchResultsTable from '../advanced-search/PropertySearchResultsTable';
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
  optionsKey?: string; // For select fields, references which options array to use
}

// Standard fields
const STANDARD_FIELDS: FilterFieldConfig[] = [
  { key: 'property_record_type_id', label: 'Property Type', type: 'select', optionsKey: 'propertyRecordTypes', table: 'property' },
  { key: 'city', label: 'City', type: 'text', placeholder: 'Enter city...', table: 'property' },
  { key: 'state', label: 'State', type: 'text', placeholder: 'Enter state...', table: 'property' },
  { key: 'property_name', label: 'Property Name', type: 'text', placeholder: 'Search properties...', table: 'property' },
  { key: 'building_sqft', label: 'Building Sqft', type: 'number-range', placeholder: 'Sqft', table: 'property' },
  { key: 'available_sqft', label: 'Available Sqft', type: 'number-range', placeholder: 'Sqft', table: 'property' },
  { key: 'rent_psf', label: 'Rent PSF', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'asking_purchase_price', label: 'Purchase Price', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'acres', label: 'Acres', type: 'number-range', placeholder: 'Acres', table: 'property' },
];

// Advanced fields
const ADVANCED_FIELDS: FilterFieldConfig[] = [
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

export type SearchViewMode = 'filters' | 'map' | 'table';

interface PropertySearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onPropertySelect: (propertyId: string) => void;
  onResultsChange?: (results: PropertySearchResult[]) => void;
  onViewModeChange?: (mode: SearchViewMode) => void;
}

export default function PropertySearchOverlay({
  isOpen,
  onClose,
  onPropertySelect,
  onResultsChange,
  onViewModeChange,
}: PropertySearchOverlayProps) {
  // View mode: 'filters' shows the filter panel, 'results' shows search results
  const [viewMode, setViewMode] = useState<SearchViewMode>('filters');

  // Filter state
  const [activeTab, setActiveTab] = useState<'standard' | 'advanced'>('standard');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, { value?: string; min?: string; max?: string }>>({});

  // Results state
  const [results, setResults] = useState<PropertySearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    field: 'property_name',
    direction: 'asc',
  });
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Search hook
  const { executeSearch, loading, error } = useAdvancedPropertySearch();

  // Property record types for select field
  const { propertyRecordTypes } = usePropertyRecordTypes();

  // Saved searches
  const { savedSearches, mySearches, publicSearches, saveSearch, loading: savingSearch } = useSavedSearches();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedSearchesDropdown, setShowSavedSearchesDropdown] = useState(false);
  const savedSearchesDropdownRef = useRef<HTMLDivElement>(null);

  const currentFields = activeTab === 'standard' ? STANDARD_FIELDS : ADVANCED_FIELDS;

  // Convert filters to filter groups for the search hook
  const convertFiltersToGroups = useCallback((filters: ActiveFilter[]) => {
    if (filters.length === 0) return [];

    const conditions = filters.map(filter => {
      const fieldConfig = [...STANDARD_FIELDS, ...ADVANCED_FIELDS].find(f => f.key === filter.field);
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

  // Handle view mode change with parent notification
  const handleViewModeChange = useCallback((mode: SearchViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  }, [onViewModeChange]);

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
    onResultsChange?.(data);

    // Stay on filters view, but notify parent to show map
    setViewMode('filters');
    onViewModeChange?.('map');
  }, [activeFilters, sortConfig, executeSearch, convertFiltersToGroups, onResultsChange, onViewModeChange]);

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
    onResultsChange?.(data);
  }, [activeFilters, sortConfig, executeSearch, convertFiltersToGroups, onResultsChange]);

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
      onResultsChange?.(data);
    }
  }, [activeFilters, hasSearched, executeSearch, convertFiltersToGroups, onResultsChange]);

  // Handle row click
  const handleRowClick = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    onPropertySelect(propertyId);
  };

  // Clear search
  const handleClear = () => {
    setActiveFilters([]);
    setResults([]);
    setTotalCount(0);
    setHasSearched(false);
    setCurrentPage(1);
    handleViewModeChange('filters');
    onResultsChange?.([]);
  };

  // Filter manipulation functions
  const removeFilter = (filterId: string) => {
    setActiveFilters(prev => prev.filter(f => f.id !== filterId));
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
    setFieldValues(prev => {
      const updated = { ...prev };
      delete updated[field.key];
      return updated;
    });
    setExpandedField(null);
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
      setFieldValues(prev => {
        const updated = { ...prev };
        delete updated[field.key];
        return updated;
      });
      setExpandedField(null);
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
    setExpandedField(null);
  };

  const formatNumber = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString();
  };

  const hasActiveFilter = (fieldKey: string) => {
    return activeFilters.some(f => f.field === fieldKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: FilterFieldConfig) => {
    if (e.key === 'Enter') {
      const values = fieldValues[field.key];
      if (field.type === 'number-range') {
        addRangeFilter(field, values?.min, values?.max);
      } else if (field.type === 'text' || field.type === 'number') {
        addFilter(field, values?.value || '', field.type === 'text' ? 'contains' : 'equals');
      }
    }
  };

  const canSearch = activeFilters.length > 0;

  // Convert ActiveFilter[] to FilterGroup[] for saving
  const activeFiltersToFilterGroups = useCallback((filters: ActiveFilter[]): FilterGroup[] => {
    if (filters.length === 0) return [];

    const conditions = filters.map(filter => {
      const fieldConfig = [...STANDARD_FIELDS, ...ADVANCED_FIELDS].find(f => f.key === filter.field);
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

  // Convert FilterGroup[] to ActiveFilter[] for loading
  const filterGroupsToActiveFilters = useCallback((groups: FilterGroup[]): ActiveFilter[] => {
    const filters: ActiveFilter[] = [];

    for (const group of groups) {
      for (const condition of group.conditions) {
        if (!condition.field) continue;

        const fieldConfig = [...STANDARD_FIELDS, ...ADVANCED_FIELDS].find(f => f.key === condition.field?.key);

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
          // Look up the label for property record type
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
  const handleLoadSearch = (searchId: string) => {
    const search = savedSearches.find(s => s.id === searchId);
    if (!search) return;

    const filters = filterGroupsToActiveFilters(search.filter_groups);
    setActiveFilters(filters);

    if (search.sort_config) {
      setSortConfig(search.sort_config);
    }

    setShowSavedSearchesDropdown(false);
    setHasSearched(false);
    setResults([]);
    setTotalCount(0);
    handleViewModeChange('filters');
    onResultsChange?.([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (savedSearchesDropdownRef.current && !savedSearchesDropdownRef.current.contains(event.target as Node)) {
        setShowSavedSearchesDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed top-[64px] left-0 h-[calc(100vh-64px)] bg-white shadow-2xl z-[10002] flex flex-col transform transition-transform duration-300 ease-in-out"
      style={{ width: '420px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-[#002147]">
        <div className="flex items-center gap-2 text-white">
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span className="font-semibold">Property Search</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Saved Searches Dropdown */}
          <div className="relative" ref={savedSearchesDropdownRef}>
            <button
              onClick={() => setShowSavedSearchesDropdown(!showSavedSearchesDropdown)}
              className="flex items-center gap-1 p-1 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
              title="Saved Searches"
            >
              <FolderOpenIcon className="h-5 w-5" />
            </button>
            {showSavedSearchesDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-10 max-h-80 overflow-y-auto">
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
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 transition-colors"
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
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 transition-colors"
                          >
                            <div className="font-medium text-[#002147]">{search.name}</div>
                            <div className="text-xs text-gray-400">
                              by {search.created_by_name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white hover:bg-white hover:bg-opacity-20 rounded transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Results Bar - when we have results */}
      {hasSearched && results.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#002147]">
              {totalCount} {totalCount === 1 ? 'result' : 'results'}
            </span>
            <button
              onClick={() => handleViewModeChange('table')}
              className="flex items-center gap-1 px-2 py-1 text-xs text-[#4A6B94] hover:text-[#002147] hover:bg-gray-200 rounded transition-colors"
              title="View results in full table"
            >
              <TableCellsIcon className="h-3.5 w-3.5" />
              Full Table
            </button>
          </div>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-[#4A6B94] hover:text-[#002147] hover:bg-gray-200 rounded transition-colors"
            title="Save this search"
          >
            <BookmarkIcon className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tabs */}
            <div className="flex border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => setActiveTab('standard')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'standard'
                    ? 'text-[#002147] border-b-2 border-[#002147]'
                    : 'text-[#4A6B94] hover:text-[#002147]'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => setActiveTab('advanced')}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === 'advanced'
                    ? 'text-[#002147] border-b-2 border-[#002147]'
                    : 'text-[#4A6B94] hover:text-[#002147]'
                }`}
              >
                Advanced
              </button>
            </div>

            {/* Filter Fields */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-3 space-y-1">
                {currentFields.map(field => {
                  const isExpanded = expandedField === field.key;
                  const values = fieldValues[field.key] || {};
                  const hasFilter = hasActiveFilter(field.key);

                  return (
                    <div key={field.key} className="border border-gray-200 rounded-md overflow-hidden">
                      <button
                        onClick={() => setExpandedField(isExpanded ? null : field.key)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                          hasFilter ? 'bg-[#002147] bg-opacity-5' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className={`font-medium ${hasFilter ? 'text-[#002147]' : 'text-gray-700'}`}>
                          {field.label}
                          {hasFilter && <span className="ml-1 text-[10px] text-[#4A6B94]">•</span>}
                        </span>
                        {isExpanded ? (
                          <ChevronUpIcon className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                          <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                          {field.type === 'text' && (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={values.value || ''}
                                onChange={(e) => setFieldValues(prev => ({
                                  ...prev,
                                  [field.key]: { value: e.target.value }
                                }))}
                                onKeyDown={(e) => handleKeyDown(e, field)}
                                placeholder={field.placeholder}
                                className="flex-1 px-2 py-1 text-xs border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                                autoFocus
                              />
                              <button
                                onClick={() => addFilter(field, values.value || '')}
                                disabled={!values.value?.trim()}
                                className="px-2 py-1 text-xs bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Add
                              </button>
                            </div>
                          )}

                          {field.type === 'number-range' && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  value={values.min || ''}
                                  onChange={(e) => setFieldValues(prev => ({
                                    ...prev,
                                    [field.key]: { ...prev[field.key], min: e.target.value }
                                  }))}
                                  onKeyDown={(e) => handleKeyDown(e, field)}
                                  placeholder="Min"
                                  className="flex-1 px-2 py-1 text-xs border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                                  autoFocus
                                />
                                <span className="text-gray-400 text-xs">to</span>
                                <input
                                  type="number"
                                  value={values.max || ''}
                                  onChange={(e) => setFieldValues(prev => ({
                                    ...prev,
                                    [field.key]: { ...prev[field.key], max: e.target.value }
                                  }))}
                                  onKeyDown={(e) => handleKeyDown(e, field)}
                                  placeholder="Max"
                                  className="flex-1 px-2 py-1 text-xs border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                                />
                              </div>
                              <button
                                onClick={() => addRangeFilter(field, values.min, values.max)}
                                disabled={!values.min?.trim() && !values.max?.trim()}
                                className="w-full px-2 py-1 text-xs bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Add Range
                              </button>
                            </div>
                          )}

                          {field.type === 'boolean' && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => addBooleanFilter(field, true)}
                                className="flex-1 px-2 py-1 text-xs bg-[#002147] text-white rounded hover:bg-[#001a38]"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => addBooleanFilter(field, false)}
                                className="flex-1 px-2 py-1 text-xs border border-[#8FA9C8] text-[#4A6B94] rounded hover:bg-gray-100"
                              >
                                No
                              </button>
                            </div>
                          )}

                          {field.type === 'select' && field.optionsKey === 'propertyRecordTypes' && (
                            <div className="space-y-1">
                              {propertyRecordTypes.map(prt => (
                                <button
                                  key={prt.id}
                                  onClick={() => addFilter(field, prt.id, 'equals', prt.label)}
                                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 rounded border border-transparent hover:border-[#8FA9C8] transition-colors"
                                >
                                  {prt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Criteria Pills */}
            {activeFilters.length > 0 && (
              <div className="border-t border-gray-200 bg-gray-50 px-3 py-2 flex-shrink-0">
                <div className="text-xs font-medium text-[#4A6B94] mb-2">Selected Criteria</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeFilters.map(filter => (
                    <div
                      key={filter.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-[#002147] text-white text-xs rounded-full"
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
                </div>
              </div>
            )}

            {/* Search Actions */}
            <div className="px-3 py-3 border-t border-gray-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSearch}
                  disabled={!canSearch || loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-md hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  {loading ? 'Searching...' : 'Search'}
                </button>
                <button
                  onClick={() => setShowSaveModal(true)}
                  disabled={!canSearch}
                  className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-[#4A6B94] border border-[#8FA9C8] rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Save Search"
                >
                  <BookmarkIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={handleClear}
                  className="px-4 py-2 text-sm text-[#4A6B94] border border-[#8FA9C8] rounded-md hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              </div>
              {!canSearch && (
                <p className="mt-2 text-xs text-gray-500 text-center">
                  Add at least one filter
                </p>
              )}
              {error && (
                <p className="mt-2 text-xs text-red-600 text-center">
                  Error: {error}
                </p>
              )}
            </div>
      </div>

      {/* Save Search Modal */}
      <SaveSearchModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveSearch}
        mode="create"
      />
    </div>
  );
}
