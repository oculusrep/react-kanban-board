import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import DealDetailsSlideout from '../DealDetailsSlideout';

interface DealReconciliationRow {
  deal_id: string;
  deal_name: string;
  client_name: string | null;
  property_display: string | null;
  ovis_stage: string;
  sf_stage: string | null;
  stage_match: boolean;
  closed_date: string | null;
  booked_date: string | null;

  // Deal Value
  ovis_deal_value: number;
  sf_deal_value: number;
  deal_value_variance: number;

  // Fee/Commission
  ovis_fee: number;
  sf_fee: number;
  fee_variance: number;

  // Commission Rate
  ovis_commission_rate: number;
  sf_commission_rate: number;
  commission_rate_variance: number;

  // AGCI
  ovis_agci: number;
  sf_agci: number;
  agci_variance: number;

  // House
  ovis_house: number;
  sf_house: number;
  house_variance: number;
}

export default function DealReconciliationReport() {
  const [reconciliationData, setReconciliationData] = useState<DealReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [showStageFilter, setShowStageFilter] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Closed Date Filter
  const [showClosedDateMenu, setShowClosedDateMenu] = useState(false);
  const closedDateMenuRef = useRef<HTMLDivElement>(null);
  const [closedDateFilter, setClosedDateFilter] = useState<'current_year' | 'last_2_years' | 'all_time' | 'missing' | 'custom'>('last_2_years');
  const [customClosedDateFrom, setCustomClosedDateFrom] = useState<string>('');
  const [customClosedDateTo, setCustomClosedDateTo] = useState<string>('');

  // Booked Date Filter
  const [showBookedDateMenu, setShowBookedDateMenu] = useState(false);
  const bookedDateMenuRef = useRef<HTMLDivElement>(null);
  const [bookedDateFilter, setBookedDateFilter] = useState<'all' | 'current_year' | 'last_2_years' | 'custom'>('all');
  const [bookedDateFrom, setBookedDateFrom] = useState<string>('');
  const [bookedDateTo, setBookedDateTo] = useState<string>('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('deal_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Deal slideout
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [isSlideoutOpen, setIsSlideoutOpen] = useState(false);

  // Inline editing for closed_date
  const [editingClosedDateDealId, setEditingClosedDateDealId] = useState<string | null>(null);
  const [editingClosedDateValue, setEditingClosedDateValue] = useState<string>('');

  useEffect(() => {
    fetchReconciliationData();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowStageFilter(false);
      }
      if (closedDateMenuRef.current && !closedDateMenuRef.current.contains(event.target as Node)) {
        setShowClosedDateMenu(false);
      }
      if (bookedDateMenuRef.current && !bookedDateMenuRef.current.contains(event.target as Node)) {
        setShowBookedDateMenu(false);
      }
    };

    if (showStageFilter || showClosedDateMenu || showBookedDateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStageFilter, showClosedDateMenu, showBookedDateMenu]);

  const fetchReconciliationData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all deal stages
      const { data: stagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label')
        .neq('label', 'Lost')
        .order('label');

      if (stagesError) throw stagesError;

      const activeStages = stagesData || [];
      const activeStageIds = activeStages.map(s => s.id);
      setStages(activeStages.map(s => s.label));

      // Fetch OVIS deals
      const { data: ovisDeals, error: dealsError } = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          sf_id,
          stage_id,
          closed_date,
          booked_date,
          deal_value,
          commission_percent,
          fee,
          referral_fee_usd,
          house_usd,
          client:client_id(client_name),
          property:property_id(property_name),
          property_unit_id,
          stage:stage_id(label)
        `)
        .in('stage_id', activeStageIds);

      if (dealsError) throw dealsError;

      // Fetch property units
      const propertyUnitIds = (ovisDeals || [])
        .map(deal => deal.property_unit_id)
        .filter(id => id !== null);

      const propertyUnitsMap = new Map<string, string>();
      if (propertyUnitIds.length > 0) {
        const { data: unitsData } = await supabase
          .from('property_unit')
          .select('id, property_unit_name')
          .in('id', propertyUnitIds);

        if (unitsData) {
          unitsData.forEach(unit => {
            propertyUnitsMap.set(unit.id, unit.property_unit_name);
          });
        }
      }

      // Fetch Salesforce opportunities
      const sfIds = (ovisDeals || [])
        .map(deal => deal.sf_id)
        .filter(id => id !== null);

      console.log('[DealReconciliation] Total OVIS deals:', ovisDeals?.length);
      console.log('[DealReconciliation] Deals with SF IDs:', sfIds.length);
      console.log('[DealReconciliation] SF IDs:', sfIds);

      const salesforceMap = new Map<string, any>();
      if (sfIds.length > 0) {
        // First, try to get all columns to see what's available
        const { data: sfDataAll, error: sfErrorAll } = await supabase
          .from('salesforce_Opportunity')
          .select('*')
          .in('Id', sfIds)
          .eq('IsDeleted', false)
          .limit(1);

        console.log('[DealReconciliation] SF sample record (all fields):', sfDataAll?.[0]);

        const { data: sfData, error: sfError } = await supabase
          .from('salesforce_Opportunity')
          .select(`
            Id,
            Deal_Value__c,
            Amount,
            StageName,
            Commission_Percent__c,
            Commission__c,
            Referral_Fee__c,
            House__c,
            CloseDate
          `)
          .in('Id', sfIds)
          .eq('IsDeleted', false);

        if (sfError) {
          console.error('[DealReconciliation] Salesforce query error:', sfError);
        }

        console.log('[DealReconciliation] SF opportunities fetched:', sfData?.length);
        console.log('[DealReconciliation] SF data sample:', sfData?.[0]);

        if (sfData) {
          sfData.forEach(sf => {
            salesforceMap.set(sf.Id, sf);
          });
        }
      }

      // Build reconciliation rows
      const rows: DealReconciliationRow[] = (ovisDeals || []).map(deal => {
        const sfData = deal.sf_id ? salesforceMap.get(deal.sf_id) : null;

        // Property display
        const propertyName = deal.property?.property_name || null;
        const unitName = deal.property_unit_id ? propertyUnitsMap.get(deal.property_unit_id) || null : null;
        const propertyDisplay = propertyName && unitName
          ? `${propertyName} - ${unitName}`
          : propertyName;

        // OVIS values
        const ovisDealValue = deal.deal_value || 0;
        const ovisFee = deal.fee || 0;
        const ovisCommissionRate = deal.commission_percent || 0;
        const ovisReferralFee = deal.referral_fee_usd || 0;
        const ovisAGCI = ovisFee - ovisReferralFee;
        const ovisHouse = deal.house_usd || 0;

        // Salesforce values
        const sfDealValue = sfData?.Deal_Value__c || sfData?.Amount || 0;
        const sfFee = sfData?.Commission__c || 0;
        const sfCommissionRate = sfData?.Commission_Percent__c || 0;
        const sfReferralFee = sfData?.Referral_Fee__c || 0;
        const sfAGCI = sfFee - sfReferralFee;
        const sfHouse = sfData?.House__c || 0;

        // Stages
        const ovisStage = deal.stage?.label || '';
        const sfStage = sfData?.StageName || null;

        return {
          deal_id: deal.id,
          deal_name: deal.deal_name || 'Unnamed Deal',
          client_name: deal.client?.client_name || null,
          property_display: propertyDisplay,
          ovis_stage: ovisStage,
          sf_stage: sfStage,
          stage_match: ovisStage === sfStage,
          closed_date: deal.closed_date,
          booked_date: deal.booked_date,

          ovis_deal_value: ovisDealValue,
          sf_deal_value: sfDealValue,
          deal_value_variance: ovisDealValue - sfDealValue,

          ovis_fee: ovisFee,
          sf_fee: sfFee,
          fee_variance: ovisFee - sfFee,

          ovis_commission_rate: ovisCommissionRate,
          sf_commission_rate: sfCommissionRate,
          commission_rate_variance: ovisCommissionRate - sfCommissionRate,

          ovis_agci: ovisAGCI,
          sf_agci: sfAGCI,
          agci_variance: ovisAGCI - sfAGCI,

          ovis_house: ovisHouse,
          sf_house: sfHouse,
          house_variance: ovisHouse - sfHouse,
        };
      });

      setReconciliationData(rows);
    } catch (err) {
      console.error('Error fetching deal reconciliation data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleStageToggle = (stage: string) => {
    setSelectedStages(prev =>
      prev.includes(stage)
        ? prev.filter(s => s !== stage)
        : [...prev, stage]
    );
  };

  const handleSelectAllStages = () => {
    if (selectedStages.length === stages.length) {
      setSelectedStages([]);
    } else {
      setSelectedStages([...stages]);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleClosedDateEdit = (dealId: string, currentDate: string | null) => {
    setEditingClosedDateDealId(dealId);
    setEditingClosedDateValue(currentDate || '');
  };

  const handleClosedDateSave = async (dealId: string) => {
    try {
      const { error } = await supabase
        .from('deal')
        .update({ closed_date: editingClosedDateValue || null })
        .eq('id', dealId);

      if (error) throw error;

      setReconciliationData(prev => prev.map(row =>
        row.deal_id === dealId
          ? { ...row, closed_date: editingClosedDateValue || null }
          : row
      ));

      setEditingClosedDateDealId(null);
      setEditingClosedDateValue('');
    } catch (err) {
      console.error('Error updating closed date:', err);
      alert('Failed to update closed date');
    }
  };

  const handleClosedDateCancel = () => {
    setEditingClosedDateDealId(null);
    setEditingClosedDateValue('');
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = reconciliationData;

    // Filter by closed date
    if (closedDateFilter === 'missing') {
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          return !row.closed_date;
        }
        return true;
      });
    } else if (closedDateFilter === 'current_year') {
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          return row.closed_date && row.closed_date >= '2025-01-01';
        }
        return true;
      });
    } else if (closedDateFilter === 'last_2_years') {
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          return row.closed_date && row.closed_date >= '2024-01-01';
        }
        return true;
      });
    } else if (closedDateFilter === 'custom') {
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          let valid = true;
          if (customClosedDateFrom && row.closed_date) {
            valid = valid && row.closed_date >= customClosedDateFrom;
          } else if (customClosedDateFrom && !row.closed_date) {
            valid = false;
          }
          if (customClosedDateTo && row.closed_date) {
            valid = valid && row.closed_date <= customClosedDateTo;
          } else if (customClosedDateTo && !row.closed_date) {
            valid = false;
          }
          return valid;
        }
        return true;
      });
    }

    // Filter by stages
    if (selectedStages.length > 0) {
      filtered = filtered.filter(row => selectedStages.includes(row.ovis_stage));
    }

    // Filter by booked date
    if (bookedDateFilter === 'current_year') {
      filtered = filtered.filter(row => !row.booked_date || row.booked_date >= '2025-01-01');
    } else if (bookedDateFilter === 'last_2_years') {
      filtered = filtered.filter(row => !row.booked_date || row.booked_date >= '2024-01-01');
    } else if (bookedDateFilter === 'custom') {
      if (bookedDateFrom) {
        filtered = filtered.filter(row =>
          row.booked_date && row.booked_date >= bookedDateFrom
        );
      }
      if (bookedDateTo) {
        filtered = filtered.filter(row =>
          row.booked_date && row.booked_date <= bookedDateTo
        );
      }
    }

    // Sort
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn as keyof DealReconciliationRow];
        const bVal = b[sortColumn as keyof DealReconciliationRow];

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        return 0;
      });
    }

    return filtered;
  }, [
    reconciliationData,
    selectedStages,
    sortColumn,
    sortDirection,
    closedDateFilter,
    customClosedDateFrom,
    customClosedDateTo,
    bookedDateFilter,
    bookedDateFrom,
    bookedDateTo
  ]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getVarianceColor = (variance: number) => {
    if (Math.abs(variance) < 0.01) return 'text-gray-600';
    return variance > 0 ? 'text-green-600' : 'text-red-600';
  };

  const getClosedDateFilterLabel = () => {
    switch (closedDateFilter) {
      case 'missing': return 'Missing Date';
      case 'current_year': return '2025';
      case 'last_2_years': return '2024+';
      case 'all_time': return 'All Time';
      case 'custom':
        if (customClosedDateFrom && customClosedDateTo) {
          return `${customClosedDateFrom} to ${customClosedDateTo}`;
        } else if (customClosedDateFrom) {
          return `from ${customClosedDateFrom}`;
        } else if (customClosedDateTo) {
          return `to ${customClosedDateTo}`;
        }
        return 'Custom Range';
      default: return '2024+';
    }
  };

  const getBookedDateFilterLabel = () => {
    switch (bookedDateFilter) {
      case 'all': return 'All';
      case 'current_year': return '2025';
      case 'last_2_years': return '2024+';
      case 'custom':
        if (bookedDateFrom && bookedDateTo) {
          return `${bookedDateFrom} to ${bookedDateTo}`;
        } else if (bookedDateFrom) {
          return `from ${bookedDateFrom}`;
        } else if (bookedDateTo) {
          return `to ${bookedDateTo}`;
        }
        return 'Custom';
      default: return 'All';
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return filteredAndSortedData.reduce((acc, row) => ({
      ovisDealValue: acc.ovisDealValue + row.ovis_deal_value,
      sfDealValue: acc.sfDealValue + row.sf_deal_value,
      ovisFee: acc.ovisFee + row.ovis_fee,
      sfFee: acc.sfFee + row.sf_fee,
      ovisAGCI: acc.ovisAGCI + row.ovis_agci,
      sfAGCI: acc.sfAGCI + row.sf_agci,
      ovisHouse: acc.ovisHouse + row.ovis_house,
      sfHouse: acc.sfHouse + row.sf_house,
    }), {
      ovisDealValue: 0,
      sfDealValue: 0,
      ovisFee: 0,
      sfFee: 0,
      ovisAGCI: 0,
      sfAGCI: 0,
      ovisHouse: 0,
      sfHouse: 0,
    });
  }, [filteredAndSortedData]);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-xs text-gray-600">Loading deal reconciliation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Filter Criteria Banner */}
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
        <div className="text-xs text-gray-700">
          <span className="font-semibold">Active Filters:</span>
          {' '}
          <span className="font-medium">Stages:</span> {selectedStages.length > 0 ? selectedStages.join(', ') : 'All'}
          {' • '}
          <span className="font-medium">Closed Date:</span> {getClosedDateFilterLabel()}
          {' • '}
          <span className="font-medium">Booked:</span> {getBookedDateFilterLabel()}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {/* Stage Filter */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setShowStageFilter(!showStageFilter)}
              className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Stages {selectedStages.length > 0 && `(${selectedStages.length})`}
              <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showStageFilter && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">Select Stages</span>
                    <button
                      onClick={handleSelectAllStages}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {selectedStages.length === stages.length ? 'Clear All' : 'Select All'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {stages.map(stage => (
                      <label key={stage} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                        <input
                          type="checkbox"
                          checked={selectedStages.includes(stage)}
                          onChange={() => handleStageToggle(stage)}
                          className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-xs text-gray-700">{stage}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Closed Date Filter */}
          <div className="relative" ref={closedDateMenuRef}>
            <button
              onClick={() => setShowClosedDateMenu(!showClosedDateMenu)}
              className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Closed: {closedDateFilter === 'missing' ? 'Missing' : closedDateFilter === 'current_year' ? '2025' : closedDateFilter === 'last_2_years' ? '2024+' : closedDateFilter === 'all_time' ? 'All' : 'Custom'}
              <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showClosedDateMenu && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-2">
                  <button onClick={() => { setClosedDateFilter('missing'); setShowClosedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${closedDateFilter === 'missing' ? 'bg-orange-50 font-semibold text-orange-700' : ''}`}>
                    ⚠️ Missing Closed Date
                  </button>
                  <div className="border-t border-gray-200 my-1"></div>
                  <button onClick={() => { setClosedDateFilter('current_year'); setShowClosedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${closedDateFilter === 'current_year' ? 'bg-blue-50 font-semibold' : ''}`}>
                    This Year (2025)
                  </button>
                  <button onClick={() => { setClosedDateFilter('last_2_years'); setShowClosedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${closedDateFilter === 'last_2_years' ? 'bg-blue-50 font-semibold' : ''}`}>
                    Last 2 Years (2024+)
                  </button>
                  <button onClick={() => { setClosedDateFilter('all_time'); setShowClosedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${closedDateFilter === 'all_time' ? 'bg-blue-50 font-semibold' : ''}`}>
                    All Time
                  </button>
                  <button onClick={() => setClosedDateFilter('custom')} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${closedDateFilter === 'custom' ? 'bg-blue-50 font-semibold' : ''}`}>
                    Custom Range
                  </button>
                  {closedDateFilter === 'custom' && (
                    <div className="mt-2 p-2 border-t space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">From:</label>
                        <input type="date" value={customClosedDateFrom} onChange={(e) => setCustomClosedDateFrom(e.target.value)} className="w-full px-2 py-1 text-xs border rounded" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">To:</label>
                        <input type="date" value={customClosedDateTo} onChange={(e) => setCustomClosedDateTo(e.target.value)} className="w-full px-2 py-1 text-xs border rounded" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Booked Date Filter */}
          <div className="relative" ref={bookedDateMenuRef}>
            <button
              onClick={() => setShowBookedDateMenu(!showBookedDateMenu)}
              className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Booked: {bookedDateFilter === 'all' ? 'All' : bookedDateFilter === 'current_year' ? '2025' : bookedDateFilter === 'last_2_years' ? '2024+' : 'Custom'}
              <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showBookedDateMenu && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-2">
                  <button onClick={() => { setBookedDateFilter('all'); setShowBookedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${bookedDateFilter === 'all' ? 'bg-blue-50 font-semibold' : ''}`}>
                    All
                  </button>
                  <button onClick={() => { setBookedDateFilter('current_year'); setShowBookedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${bookedDateFilter === 'current_year' ? 'bg-blue-50 font-semibold' : ''}`}>
                    This Year (2025)
                  </button>
                  <button onClick={() => { setBookedDateFilter('last_2_years'); setShowBookedDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${bookedDateFilter === 'last_2_years' ? 'bg-blue-50 font-semibold' : ''}`}>
                    Last 2 Years (2024+)
                  </button>
                  <button onClick={() => setBookedDateFilter('custom')} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${bookedDateFilter === 'custom' ? 'bg-blue-50 font-semibold' : ''}`}>
                    Custom Range
                  </button>
                  {bookedDateFilter === 'custom' && (
                    <div className="mt-2 p-2 border-t space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">From:</label>
                        <input type="date" value={bookedDateFrom} onChange={(e) => setBookedDateFrom(e.target.value)} className="w-full px-2 py-1 text-xs border rounded" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">To:</label>
                        <input type="date" value={bookedDateTo} onChange={(e) => setBookedDateTo(e.target.value)} className="w-full px-2 py-1 text-xs border rounded" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-600">
              Showing {filteredAndSortedData.length} of {reconciliationData.length} deals
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => handleSort('deal_name')} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Deal {sortColumn === 'deal_name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
              <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
              <th onClick={() => handleSort('ovis_stage')} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Stage {sortColumn === 'ovis_stage' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('closed_date')} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Closed {sortColumn === 'closed_date' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Deal Value</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">Fee</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-purple-50">Comm %</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-orange-50">AGCI</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-red-50">House $</th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-blue-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-blue-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-blue-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-green-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-green-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-green-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-purple-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-purple-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-purple-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-orange-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-orange-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-orange-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-red-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-red-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-red-50">Var</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 text-xs text-gray-900">
                  <button
                    onClick={() => {
                      setSelectedDealId(row.deal_id);
                      setIsSlideoutOpen(true);
                    }}
                    className="text-blue-600 hover:underline block text-left"
                  >
                    {row.deal_name}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-xs text-gray-600">{row.client_name || '-'}</td>
                <td className="px-2 py-1.5 text-xs text-gray-600">{row.property_display || '-'}</td>
                <td className="px-2 py-1.5 text-xs text-gray-600 whitespace-nowrap">
                  {row.ovis_stage}
                  {!row.stage_match && row.sf_stage && (
                    <div className="text-xs text-orange-600">SF: {row.sf_stage}</div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-xs text-gray-600 whitespace-nowrap">
                  {editingClosedDateDealId === row.deal_id ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="date"
                        value={editingClosedDateValue}
                        onChange={(e) => setEditingClosedDateValue(e.target.value)}
                        className="px-1 py-0.5 text-xs border border-blue-500 rounded"
                        autoFocus
                      />
                      <button
                        onClick={() => handleClosedDateSave(row.deal_id)}
                        className="px-1 py-0.5 bg-green-600 text-white rounded hover:bg-green-700"
                        title="Save"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleClosedDateCancel}
                        className="px-1 py-0.5 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleClosedDateEdit(row.deal_id, row.closed_date)}
                      className={`hover:bg-gray-200 px-1 py-0.5 rounded ${!row.closed_date ? 'text-orange-600 font-semibold' : ''}`}
                      title="Click to edit"
                    >
                      {row.closed_date || '⚠️ Missing'}
                    </button>
                  )}
                </td>
                <td className="px-1 py-1.5 text-xs text-right bg-blue-50">{formatCurrency(row.ovis_deal_value)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-blue-50">{formatCurrency(row.sf_deal_value)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-blue-50 ${getVarianceColor(row.deal_value_variance)}`}>{formatCurrency(row.deal_value_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-green-50">{formatCurrency(row.ovis_fee)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-green-50">{formatCurrency(row.sf_fee)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-green-50 ${getVarianceColor(row.fee_variance)}`}>{formatCurrency(row.fee_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-purple-50">{formatPercent(row.ovis_commission_rate)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-purple-50">{formatPercent(row.sf_commission_rate)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-purple-50 ${getVarianceColor(row.commission_rate_variance)}`}>{formatPercent(row.commission_rate_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-orange-50">{formatCurrency(row.ovis_agci)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-orange-50">{formatCurrency(row.sf_agci)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-orange-50 ${getVarianceColor(row.agci_variance)}`}>{formatCurrency(row.agci_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-red-50">{formatCurrency(row.ovis_house)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-red-50">{formatCurrency(row.sf_house)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-red-50 ${getVarianceColor(row.house_variance)}`}>{formatCurrency(row.house_variance)}</td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr className="bg-gray-800 text-white font-bold">
              <td className="px-2 py-1.5 text-xs" colSpan={5}>TOTALS</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisDealValue)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfDealValue)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisDealValue - totals.sfDealValue)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisFee)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfFee)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisFee - totals.sfFee)}</td>
              <td className="px-1 py-1.5 text-xs text-right" colSpan={3}>-</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisAGCI)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfAGCI)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisAGCI - totals.sfAGCI)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisHouse)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfHouse)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisHouse - totals.sfHouse)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Deal Details Slideout */}
      <DealDetailsSlideout
        dealId={selectedDealId}
        isOpen={isSlideoutOpen}
        onClose={() => {
          setIsSlideoutOpen(false);
          setSelectedDealId(null);
        }}
        onDealUpdated={() => {
          fetchReconciliationData();
        }}
      />
    </div>
  );
}
