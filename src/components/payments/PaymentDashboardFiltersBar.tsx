// src/components/payments/PaymentDashboardFiltersBar.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PaymentDashboardFilters } from '../../types/payment-dashboard';

interface PaymentDashboardFiltersBarProps {
  filters: PaymentDashboardFilters;
  onFilterChange: (filters: Partial<PaymentDashboardFilters>) => void;
}

const PaymentDashboardFiltersBar: React.FC<PaymentDashboardFiltersBarProps> = ({
  filters,
  onFilterChange,
}) => {
  const [brokers, setBrokers] = useState<{ id: string; name: string }[]>([]);
  const [deals, setDeals] = useState<{ id: string; deal_name: string }[]>([]);

  useEffect(() => {
    fetchBrokers();
    fetchDeals();
  }, []);

  const fetchBrokers = async () => {
    const { data } = await supabase
      .from('broker')
      .select('id, name')
      .eq('active', true)
      .order('name');

    if (data) setBrokers(data);
  };

  const fetchDeals = async () => {
    const { data } = await supabase
      .from('deal')
      .select('id, deal_name')
      .not('deal_name', 'is', null)
      .order('deal_name')
      .limit(100);

    if (data) setDeals(data);
  };

  const handleClearFilters = () => {
    onFilterChange({
      searchQuery: '',
      paymentStatus: 'all',
      payoutStatus: 'all',
      dateRange: { start: null, end: null },
      brokerId: null,
      dealId: null,
    });
  };

  const hasActiveFilters =
    filters.searchQuery ||
    filters.paymentStatus !== 'all' ||
    filters.payoutStatus !== 'all' ||
    filters.dateRange.start ||
    filters.dateRange.end ||
    filters.brokerId ||
    filters.dealId;

  return (
    <div className="bg-white shadow rounded-lg p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Search */}
        <div className="xl:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            placeholder="Deal name, broker, or payee..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Payment Status */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Payment Status
          </label>
          <select
            value={filters.paymentStatus}
            onChange={(e) => onFilterChange({ paymentStatus: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="received">Received</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {/* Payout Status */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Payout Status
          </label>
          <select
            value={filters.payoutStatus}
            onChange={(e) => onFilterChange({ payoutStatus: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="paid">Fully Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially Paid</option>
          </select>
        </div>

        {/* Broker Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Broker
          </label>
          <select
            value={filters.brokerId || ''}
            onChange={(e) => onFilterChange({ brokerId: e.target.value || null })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Brokers</option>
            {brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.name}
              </option>
            ))}
          </select>
        </div>

        {/* Deal Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Deal
          </label>
          <select
            value={filters.dealId || ''}
            onChange={(e) => onFilterChange({ dealId: e.target.value || null })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Deals</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.deal_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Date Range - Second Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={filters.dateRange.start || ''}
            onChange={(e) =>
              onFilterChange({
                dateRange: { ...filters.dateRange, start: e.target.value || null },
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={filters.dateRange.end || ''}
            onChange={(e) =>
              onFilterChange({
                dateRange: { ...filters.dateRange, end: e.target.value || null },
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Clear Filters Button */}
        <div className="flex items-end">
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentDashboardFiltersBar;
