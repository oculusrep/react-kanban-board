import React, { useState } from 'react';
import { ChevronUpIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { PropertySearchResult, SortConfig, ALL_AVAILABLE_COLUMNS } from '../../types/advanced-search';

interface PropertySearchResultsTableProps {
  results: PropertySearchResult[];
  columns: string[];
  sortConfig: SortConfig | null;
  onSortChange: (config: SortConfig) => void;
  onRowClick: (propertyId: string) => void;
  selectedPropertyId: string | null;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  compact?: boolean;
}

// Format currency
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Format number
function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US').format(value);
}

// Get display value for a column
function getColumnValue(result: PropertySearchResult, column: string): React.ReactNode {
  switch (column) {
    case 'property_name':
      return result.property_name || '-';
    case 'address':
      return result.address || '-';
    case 'city':
      return result.city || '-';
    case 'state':
      return result.state || '-';
    case 'property_record_type':
      return result.property_record_type?.label || '-';
    case 'building_sqft':
      return formatNumber(result.building_sqft);
    case 'available_sqft':
      return (
        <span className={result.has_unit_matches && result.display_sqft !== result.available_sqft ? 'text-[#4A6B94] font-medium' : ''}>
          {formatNumber(result.display_sqft ?? result.available_sqft)}
          {result.has_unit_matches && result.matching_units && result.matching_units.length > 1 && (
            <span className="ml-1 text-xs text-gray-500">({result.matching_units.length} units)</span>
          )}
        </span>
      );
    case 'acres':
      return result.acres ? result.acres.toFixed(2) : '-';
    case 'asking_purchase_price':
      return formatCurrency(result.asking_purchase_price);
    case 'asking_lease_price':
      return formatCurrency(result.asking_lease_price);
    case 'rent_psf':
      return (
        <span className={result.has_unit_matches && result.display_rent !== result.rent_psf ? 'text-[#4A6B94] font-medium' : ''}>
          {result.display_rent ?? result.rent_psf ? `$${(result.display_rent ?? result.rent_psf)?.toFixed(2)}` : '-'}
        </span>
      );
    case 'all_in_rent':
      return result.all_in_rent ? `$${result.all_in_rent.toFixed(2)}` : '-';
    case 'nnn_psf':
      return (
        <span className={result.has_unit_matches && result.display_nnn !== result.nnn_psf ? 'text-[#4A6B94] font-medium' : ''}>
          {result.display_nnn ?? result.nnn_psf ? `$${(result.display_nnn ?? result.nnn_psf)?.toFixed(2)}` : '-'}
        </span>
      );
    case 'lease_expiration_date':
      return result.lease_expiration_date || '-';
    case 'description':
      return result.description ? (
        <span className="truncate max-w-[200px] block" title={result.description}>
          {result.description}
        </span>
      ) : '-';
    case 'landlord':
      return result.landlord || '-';
    case 'zip':
      return result.zip || '-';
    case 'country':
      return result.country || '-';
    case 'county':
      return result.county || '-';
    case 'trade_area':
      return result.trade_area || '-';
    case 'parcel_id':
      return result.parcel_id || '-';
    case 'costar_link':
      return result.costar_link ? (
        <a href={result.costar_link} target="_blank" rel="noopener noreferrer" className="text-[#4A6B94] hover:underline" onClick={e => e.stopPropagation()}>
          View
        </a>
      ) : '-';
    case 'reonomy_link':
      return result.reonomy_link ? (
        <a href={result.reonomy_link} target="_blank" rel="noopener noreferrer" className="text-[#4A6B94] hover:underline" onClick={e => e.stopPropagation()}>
          View
        </a>
      ) : '-';
    case 'property_notes':
      return result.property_notes ? (
        <span className="truncate max-w-[200px] block" title={result.property_notes}>
          {result.property_notes}
        </span>
      ) : '-';
    default:
      return '-';
  }
}

// Get column header label
function getColumnLabel(column: string): string {
  const col = ALL_AVAILABLE_COLUMNS.find(c => c.key === column);
  return col?.label || column;
}

// Expandable unit row
function UnitRow({ unit }: { unit: PropertySearchResult['matching_units'][0] }) {
  return (
    <tr className="bg-[#F8FAFC] text-sm">
      <td className="pl-12 py-2 text-gray-600">{unit.property_unit_name || 'Unnamed Unit'}</td>
      <td className="py-2 text-gray-600">{formatNumber(unit.sqft)}</td>
      <td className="py-2 text-gray-600">{unit.rent ? `$${unit.rent.toFixed(2)}` : '-'}</td>
      <td className="py-2 text-gray-600">{unit.nnn ? `$${unit.nnn.toFixed(2)}` : '-'}</td>
      <td className="py-2 text-gray-600">
        {[
          unit.end_cap && 'End Cap',
          unit.end_cap_drive_thru && 'Drive-Thru',
          unit.inline && 'Inline',
          unit.patio && 'Patio',
          unit.second_gen_restaurant && '2nd Gen',
        ].filter(Boolean).join(', ') || '-'}
      </td>
      <td className="py-2 text-gray-600">{unit.lease_expiration_date || '-'}</td>
      <td colSpan={10}></td>
    </tr>
  );
}

export default function PropertySearchResultsTable({
  results,
  columns,
  sortConfig,
  onSortChange,
  onRowClick,
  selectedPropertyId,
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  compact = false,
}: PropertySearchResultsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = (propertyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(propertyId)) {
      newExpanded.delete(propertyId);
    } else {
      newExpanded.add(propertyId);
    }
    setExpandedRows(newExpanded);
  };

  const handleSort = (column: string) => {
    if (sortConfig?.field === column) {
      onSortChange({
        field: column,
        direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
      });
    } else {
      onSortChange({ field: column, direction: 'asc' });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className={`min-w-full divide-y divide-gray-200 ${compact ? 'text-xs' : ''}`}>
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {/* Expand column - hide in compact mode */}
              {!compact && <th className="w-10 px-3 py-3"></th>}
              {columns.map(column => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className={`text-left text-xs font-medium text-[#002147] uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${
                    compact ? 'px-2 py-2' : 'px-4 py-3'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {compact ? getColumnLabel(column).split(' ')[0] : getColumnLabel(column)}
                    {sortConfig?.field === column && (
                      sortConfig.direction === 'asc' ? (
                        <ChevronUpIcon className="h-3 w-3" />
                      ) : (
                        <ChevronDownIcon className="h-3 w-3" />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map(result => {
              const isExpanded = expandedRows.has(result.id);
              const hasUnits = result.has_unit_matches && result.matching_units && result.matching_units.length > 0;
              const isSelected = selectedPropertyId === result.id;

              return (
                <React.Fragment key={result.id}>
                  <tr
                    onClick={() => onRowClick(result.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#002147] bg-opacity-10'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Expand button - hide in compact mode */}
                    {!compact && (
                      <td className="px-3 py-4">
                        {hasUnits && (
                          <button
                            onClick={(e) => toggleExpand(result.id, e)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                          >
                            <ChevronRightIcon
                              className={`h-4 w-4 text-gray-500 transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            />
                          </button>
                        )}
                      </td>
                    )}
                    {columns.map(column => (
                      <td
                        key={column}
                        className={`text-[#002147] whitespace-nowrap ${
                          compact ? 'px-2 py-2 text-xs' : 'px-4 py-4 text-sm'
                        }`}
                      >
                        {getColumnValue(result, column)}
                      </td>
                    ))}
                  </tr>
                  {/* Expanded unit rows - skip in compact mode */}
                  {!compact && isExpanded && hasUnits && (
                    <>
                      <tr className="bg-[#F8FAFC]">
                        <td colSpan={columns.length + 1} className="px-4 py-2">
                          <div className="text-xs font-medium text-[#4A6B94] uppercase">
                            Matching Units ({result.matching_units?.length})
                          </div>
                        </td>
                      </tr>
                      <tr className="bg-[#F8FAFC] text-xs font-medium text-gray-500 uppercase">
                        <td className="pl-12 py-1">Unit Name</td>
                        <td className="py-1">Sqft</td>
                        <td className="py-1">Rent</td>
                        <td className="py-1">NNN</td>
                        <td className="py-1">Features</td>
                        <td className="py-1">Lease Exp</td>
                        <td colSpan={Math.max(0, columns.length - 5)}></td>
                      </tr>
                      {result.matching_units?.map(unit => (
                        <UnitRow key={unit.id} unit={unit} />
                      ))}
                    </>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className={`flex items-center justify-between border-t border-gray-200 bg-white ${
        compact ? 'px-2 py-2' : 'px-4 py-3'
      }`}>
        <div className={`text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
          {compact ? `${startIndex}-${endIndex} of ${totalCount}` : `Showing ${startIndex} - ${endIndex} of ${totalCount} properties`}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
              compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
            }`}
          >
            {compact ? '‹' : 'Previous'}
          </button>
          <span className={`text-gray-600 ${compact ? 'text-xs' : 'text-sm'}`}>
            {compact ? `${currentPage}/${totalPages}` : `Page ${currentPage} of ${totalPages}`}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
              compact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
            }`}
          >
            {compact ? '›' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
