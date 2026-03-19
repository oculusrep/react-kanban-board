// src/components/payments/PaymentDashboardFiltersBar.tsx

import React from 'react';
import { PaymentDashboardFilters } from '../../types/payment-dashboard';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface PaymentDashboardFiltersBarProps {
  filters: PaymentDashboardFilters;
  onFilterChange: (filters: Partial<PaymentDashboardFilters>) => void;
}

type QuickFilter = 'pending' | 'received' | 'unpaid' | 'overdue' | 'all';

const PaymentDashboardFiltersBar: React.FC<PaymentDashboardFiltersBarProps> = ({
  filters,
  onFilterChange,
}) => {
  // Determine which quick filter is active based on current filter state
  const getActiveQuickFilter = (): QuickFilter => {
    if (filters.dataQuality === 'overdue') return 'overdue';
    if (filters.payoutStatus === 'unpaid') return 'unpaid';
    if (filters.paymentStatus === 'received') return 'received';
    if (filters.paymentStatus === 'pending') return 'pending';
    return 'all';
  };

  const activeFilter = getActiveQuickFilter();

  const handleQuickFilter = (filter: QuickFilter) => {
    // Reset to base state first
    const baseFilters: Partial<PaymentDashboardFilters> = {
      paymentStatus: 'all',
      payoutStatus: 'all',
      dataQuality: 'all',
      dealStages: [],
      dateRange: { start: null, end: null },
    };

    switch (filter) {
      case 'pending':
        onFilterChange({ ...baseFilters, paymentStatus: 'pending' });
        break;
      case 'received':
        onFilterChange({ ...baseFilters, paymentStatus: 'received' });
        break;
      case 'unpaid':
        onFilterChange({ ...baseFilters, payoutStatus: 'unpaid' });
        break;
      case 'overdue':
        onFilterChange({ ...baseFilters, dataQuality: 'overdue' });
        break;
      case 'all':
      default:
        onFilterChange(baseFilters);
        break;
    }
  };

  const quickFilters: { key: QuickFilter; label: string; color: string; activeColor: string }[] = [
    { key: 'all', label: 'All', color: 'bg-gray-100 text-gray-700 hover:bg-gray-200', activeColor: 'bg-gray-700 text-white' },
    { key: 'pending', label: 'Pending', color: 'bg-amber-50 text-amber-700 hover:bg-amber-100', activeColor: 'bg-amber-600 text-white' },
    { key: 'received', label: 'Received', color: 'bg-green-50 text-green-700 hover:bg-green-100', activeColor: 'bg-green-600 text-white' },
    { key: 'unpaid', label: 'Unpaid Disbursements', color: 'bg-red-50 text-red-700 hover:bg-red-100', activeColor: 'bg-red-600 text-white' },
    { key: 'overdue', label: 'Overdue', color: 'bg-rose-50 text-rose-700 hover:bg-rose-100', activeColor: 'bg-rose-600 text-white' },
  ];

  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      {/* Quick Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {quickFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => handleQuickFilter(filter.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeFilter === filter.key ? filter.activeColor : filter.color
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-64">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
          placeholder="Search deals, brokers..."
          className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {filters.searchQuery && (
          <button
            onClick={() => onFilterChange({ searchQuery: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentDashboardFiltersBar;
