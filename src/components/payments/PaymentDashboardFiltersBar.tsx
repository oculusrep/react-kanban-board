// src/components/payments/PaymentDashboardFiltersBar.tsx

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PaymentDashboardFilters } from '../../types/payment-dashboard';

interface PaymentDashboardFiltersBarProps {
  filters: PaymentDashboardFilters;
  onFilterChange: (filters: Partial<PaymentDashboardFilters>) => void;
}

interface DropdownOption {
  value: string;
  label: string;
}

const CustomDropdown: React.FC<{
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption?.label || options[0]?.label || 'Select...';

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-50 transition-colors flex items-center justify-between"
      >
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`ml-2 h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-sm text-left hover:bg-blue-50 transition-colors ${
                value === option.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

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

  const paymentStatusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Payments' },
    { value: 'received', label: 'Received' },
    { value: 'pending', label: 'Pending' },
  ];

  const disbursementStatusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Disbursements' },
    { value: 'paid', label: 'Fully Paid' },
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'partial', label: 'Partially Paid' },
  ];

  const brokerOptions: DropdownOption[] = [
    { value: '', label: 'All Brokers' },
    ...brokers.map(broker => ({ value: broker.id, label: broker.name })),
  ];

  const dealOptions: DropdownOption[] = [
    { value: '', label: 'All Deals' },
    ...deals.map(deal => ({ value: deal.id, label: deal.deal_name })),
  ];

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
        <CustomDropdown
          label="Payment Status"
          value={filters.paymentStatus}
          options={paymentStatusOptions}
          onChange={(value) => onFilterChange({ paymentStatus: value as any })}
        />

        {/* Disbursement Status (formerly Payout Status) */}
        <CustomDropdown
          label="Disbursement Status"
          value={filters.payoutStatus}
          options={disbursementStatusOptions}
          onChange={(value) => onFilterChange({ payoutStatus: value as any })}
        />

        {/* Broker Filter */}
        <CustomDropdown
          label="Broker"
          value={filters.brokerId || ''}
          options={brokerOptions}
          onChange={(value) => onFilterChange({ brokerId: value || null })}
        />

        {/* Deal Filter */}
        <CustomDropdown
          label="Deal"
          value={filters.dealId || ''}
          options={dealOptions}
          onChange={(value) => onFilterChange({ dealId: value || null })}
        />
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
