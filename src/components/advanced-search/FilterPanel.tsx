import React, { useState, useMemo } from 'react';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

// Active filter pill type
export interface ActiveFilter {
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
  type: 'text' | 'number' | 'select' | 'boolean' | 'number-range';
  options?: { value: string; label: string }[];
  placeholder?: string;
  table: 'property' | 'property_unit';
}

// Standard fields - most commonly used
const STANDARD_FIELDS: FilterFieldConfig[] = [
  { key: 'city', label: 'City', type: 'text', placeholder: 'Enter city...', table: 'property' },
  { key: 'state', label: 'State', type: 'text', placeholder: 'Enter state...', table: 'property' },
  { key: 'property_name', label: 'Property Name', type: 'text', placeholder: 'Search properties...', table: 'property' },
  { key: 'building_sqft', label: 'Building Sqft', type: 'number-range', placeholder: 'Sqft', table: 'property' },
  { key: 'available_sqft', label: 'Available Sqft', type: 'number-range', placeholder: 'Sqft', table: 'property' },
  { key: 'rent_psf', label: 'Rent PSF', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'asking_purchase_price', label: 'Purchase Price', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'acres', label: 'Acres', type: 'number-range', placeholder: 'Acres', table: 'property' },
];

// Advanced fields - less commonly used
const ADVANCED_FIELDS: FilterFieldConfig[] = [
  { key: 'landlord', label: 'Landlord', type: 'text', placeholder: 'Enter landlord...', table: 'property' },
  { key: 'address', label: 'Address', type: 'text', placeholder: 'Enter address...', table: 'property' },
  { key: 'zip', label: 'ZIP Code', type: 'text', placeholder: 'Enter ZIP...', table: 'property' },
  { key: 'county', label: 'County', type: 'text', placeholder: 'Enter county...', table: 'property' },
  { key: 'trade_area', label: 'Trade Area', type: 'text', placeholder: 'Enter trade area...', table: 'property' },
  { key: 'nnn_psf', label: 'NNN PSF', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'all_in_rent', label: 'All-In Rent', type: 'number-range', placeholder: '$', table: 'property' },
  { key: 'asking_lease_price', label: 'Lease Price', type: 'number-range', placeholder: '$', table: 'property' },
  // Unit fields
  { key: 'end_cap', label: 'End Cap', type: 'boolean', table: 'property_unit' },
  { key: 'patio', label: 'Patio', type: 'boolean', table: 'property_unit' },
  { key: 'inline', label: 'Inline', type: 'boolean', table: 'property_unit' },
  { key: 'second_gen_restaurant', label: '2nd Gen Restaurant', type: 'boolean', table: 'property_unit' },
];

interface FilterPanelProps {
  activeFilters: ActiveFilter[];
  onFiltersChange: (filters: ActiveFilter[]) => void;
  onSearch: () => void;
  onClear: () => void;
  loading: boolean;
  resultCount: number | null;
  hasSearched: boolean;
  error?: string | null;
}

export default function FilterPanel({
  activeFilters,
  onFiltersChange,
  onSearch,
  onClear,
  loading,
  resultCount,
  hasSearched,
  error,
}: FilterPanelProps) {
  const [activeTab, setActiveTab] = useState<'standard' | 'advanced'>('standard');
  const [expandedField, setExpandedField] = useState<string | null>(null);

  // Field input values (before adding as filter)
  const [fieldValues, setFieldValues] = useState<Record<string, { value?: string; min?: string; max?: string }>>({});

  const currentFields = activeTab === 'standard' ? STANDARD_FIELDS : ADVANCED_FIELDS;

  // Remove a filter
  const removeFilter = (filterId: string) => {
    onFiltersChange(activeFilters.filter(f => f.id !== filterId));
  };

  // Add a filter from field input
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

    onFiltersChange([...activeFilters, newFilter]);

    // Clear the field input
    setFieldValues(prev => {
      const updated = { ...prev };
      delete updated[field.key];
      return updated;
    });
    setExpandedField(null);
  };

  // Add range filter (min/max)
  const addRangeFilter = (field: FilterFieldConfig, min?: string, max?: string) => {
    const newFilters: ActiveFilter[] = [];

    if (min && min.trim()) {
      newFilters.push({
        id: crypto.randomUUID(),
        field: field.key,
        label: field.label,
        operator: 'greater_than',
        value: min.trim(),
        displayValue: `≥ ${formatNumber(min.trim())}`,
      });
    }

    if (max && max.trim()) {
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
      onFiltersChange([...activeFilters, ...newFilters]);
      setFieldValues(prev => {
        const updated = { ...prev };
        delete updated[field.key];
        return updated;
      });
      setExpandedField(null);
    }
  };

  // Add boolean filter
  const addBooleanFilter = (field: FilterFieldConfig, value: boolean) => {
    const newFilter: ActiveFilter = {
      id: crypto.randomUUID(),
      field: field.key,
      label: field.label,
      operator: value ? 'is_true' : 'is_false',
      value: String(value),
      displayValue: value ? 'Yes' : 'No',
    };

    onFiltersChange([...activeFilters, newFilter]);
    setExpandedField(null);
  };

  // Format number for display
  const formatNumber = (val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return num.toLocaleString();
  };

  // Check if field already has an active filter
  const hasActiveFilter = (fieldKey: string) => {
    return activeFilters.some(f => f.field === fieldKey);
  };

  // Handle Enter key in text/number inputs
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

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
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
                {/* Field Header */}
                <button
                  onClick={() => setExpandedField(isExpanded ? null : field.key)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                    hasFilter ? 'bg-[#002147] bg-opacity-5' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`font-medium ${hasFilter ? 'text-[#002147]' : 'text-gray-700'}`}>
                    {field.label}
                    {hasFilter && <span className="ml-1 text-xs text-[#4A6B94]">•</span>}
                  </span>
                  {isExpanded ? (
                    <ChevronUpIcon className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                  )}
                </button>

                {/* Field Input (when expanded) */}
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
                          className="flex-1 px-2 py-1.5 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                          autoFocus
                        />
                        <button
                          onClick={() => addFilter(field, values.value || '')}
                          disabled={!values.value?.trim()}
                          className="px-3 py-1.5 text-sm bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                    )}

                    {field.type === 'number' && (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={values.value || ''}
                          onChange={(e) => setFieldValues(prev => ({
                            ...prev,
                            [field.key]: { value: e.target.value }
                          }))}
                          onKeyDown={(e) => handleKeyDown(e, field)}
                          placeholder={field.placeholder}
                          className="flex-1 px-2 py-1.5 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                          autoFocus
                        />
                        <button
                          onClick={() => addFilter(field, values.value || '', 'equals')}
                          disabled={!values.value?.trim()}
                          className="px-3 py-1.5 text-sm bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add
                        </button>
                      </div>
                    )}

                    {field.type === 'number-range' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={values.min || ''}
                            onChange={(e) => setFieldValues(prev => ({
                              ...prev,
                              [field.key]: { ...prev[field.key], min: e.target.value }
                            }))}
                            onKeyDown={(e) => handleKeyDown(e, field)}
                            placeholder="Min"
                            className="flex-1 px-2 py-1.5 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                            autoFocus
                          />
                          <span className="text-gray-400">to</span>
                          <input
                            type="number"
                            value={values.max || ''}
                            onChange={(e) => setFieldValues(prev => ({
                              ...prev,
                              [field.key]: { ...prev[field.key], max: e.target.value }
                            }))}
                            onKeyDown={(e) => handleKeyDown(e, field)}
                            placeholder="Max"
                            className="flex-1 px-2 py-1.5 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                          />
                        </div>
                        <button
                          onClick={() => addRangeFilter(field, values.min, values.max)}
                          disabled={!values.min?.trim() && !values.max?.trim()}
                          className="w-full px-3 py-1.5 text-sm bg-[#002147] text-white rounded hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Add Range
                        </button>
                      </div>
                    )}

                    {field.type === 'boolean' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => addBooleanFilter(field, true)}
                          className="flex-1 px-3 py-1.5 text-sm bg-[#002147] text-white rounded hover:bg-[#001a38]"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => addBooleanFilter(field, false)}
                          className="flex-1 px-3 py-1.5 text-sm border border-[#8FA9C8] text-[#4A6B94] rounded hover:bg-gray-100"
                        >
                          No
                        </button>
                      </div>
                    )}

                    {field.type === 'select' && field.options && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            const option = field.options?.find(o => o.value === e.target.value);
                            addFilter(field, e.target.value, 'equals', option?.label);
                          }
                        }}
                        className="w-full px-2 py-1.5 text-sm border border-[#8FA9C8] rounded focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
                      >
                        <option value="">Select...</option>
                        {field.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Criteria (Filter Pills) */}
      {activeFilters.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
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
      <div className="px-3 py-3 border-t border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <button
            onClick={onSearch}
            disabled={!canSearch || loading}
            className="flex-1 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-md hover:bg-[#001a38] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            onClick={onClear}
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
        {hasSearched && resultCount !== null && (
          <p className="mt-2 text-xs text-[#4A6B94] text-center">
            {resultCount} {resultCount === 1 ? 'property' : 'properties'} found
          </p>
        )}
      </div>
    </div>
  );
}

// Helper to convert ActiveFilter[] to FilterGroup[] for the search hook
export function convertFiltersToGroups(activeFilters: ActiveFilter[]) {
  if (activeFilters.length === 0) return [];

  // Group all filters by field to determine which table they belong to
  // All conditions in a single AND group
  const conditions = activeFilters.map(filter => {
    const fieldConfig = [...STANDARD_FIELDS, ...ADVANCED_FIELDS].find(f => f.key === filter.field);
    const fieldType = fieldConfig?.type === 'number-range' ? 'numeric' :
                      fieldConfig?.type === 'boolean' ? 'boolean' :
                      fieldConfig?.type === 'number' ? 'numeric' : 'text';

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
}
