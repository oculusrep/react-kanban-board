import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import DealDetailsSlideout from '../DealDetailsSlideout';
import PaymentAmountOverrideModal from './PaymentAmountOverrideModal';

interface PaymentReconciliationRow {
  payment_id: string;
  deal_id: string;
  deal_name: string;
  payment_name: string | null;
  payment_sequence: number;
  booked_date: string | null;
  closed_date: string | null;
  payment_date_estimated: string | null;
  sf_payment_id: string | null;
  ovis_stage: string;
  sf_stage: string | null;
  stage_match: boolean;
  ovis_payment_amount: number;
  sf_payment_amount: number;
  payment_variance: number;
  ovis_agci: number;
  sf_agci: number;
  agci_variance: number;
  ovis_house: number;
  sf_house: number;
  house_variance: number;
  ovis_mike: number;
  sf_mike: number;
  mike_variance: number;
  ovis_arty: number;
  sf_arty: number;
  arty_variance: number;
  ovis_greg: number;
  sf_greg: number;
  greg_variance: number;
}

const PaymentReconciliationReport: React.FC = () => {
  const [reconciliationData, setReconciliationData] = useState<PaymentReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('deal_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
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

  // Estimated Payment Date Filter
  const [showEstPaymentDateMenu, setShowEstPaymentDateMenu] = useState(false);
  const estPaymentDateMenuRef = useRef<HTMLDivElement>(null);
  const [estPaymentDateFilter, setEstPaymentDateFilter] = useState<'all' | 'current_year' | 'last_2_years' | 'custom'>('all');
  const [estimatedPaymentDateFrom, setEstimatedPaymentDateFrom] = useState<string>('');
  const [estimatedPaymentDateTo, setEstimatedPaymentDateTo] = useState<string>('');

  // Deal slideout state
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [isSlideoutOpen, setIsSlideoutOpen] = useState(false);

  // Inline editing state for closed_date
  const [editingClosedDateDealId, setEditingClosedDateDealId] = useState<string | null>(null);
  const [editingClosedDateValue, setEditingClosedDateValue] = useState<string>('');

  // Payment override modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentForEdit, setSelectedPaymentForEdit] = useState<any>(null);

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
      if (estPaymentDateMenuRef.current && !estPaymentDateMenuRef.current.contains(event.target as Node)) {
        setShowEstPaymentDateMenu(false);
      }
    };

    if (showStageFilter || showClosedDateMenu || showBookedDateMenu || showEstPaymentDateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStageFilter, showClosedDateMenu, showBookedDateMenu, showEstPaymentDateMenu]);

  const fetchReconciliationData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[PaymentReconciliationReport] Starting data fetch...');

      // Fetch all deal stages
      const { data: allStagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label, active')
        .eq('active', true);

      if (stagesError) throw stagesError;

      // Filter out Lost stage
      const stagesData = allStagesData?.filter(s => !s.label.toLowerCase().includes('lost')) || [];
      const activeStageIds = stagesData.map(s => s.id);
      const stageLabelMap = new Map(stagesData.map(s => [s.id, s.label]));
      setStages(stagesData.map(s => s.label));

      console.log('[PaymentReconciliationReport] Active stages:', stagesData?.length);

      // Fetch OVIS deals with active stages
      const { data: ovisDeals, error: dealsError} = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          sf_id,
          stage_id,
          booked_date,
          closed_date
        `)
        .in('stage_id', activeStageIds);

      if (dealsError) throw dealsError;
      console.log('[PaymentReconciliationReport] OVIS deals:', ovisDeals?.length);

      // Fetch OVIS payments for these deals
      const dealIds = ovisDeals?.map(d => d.id) || [];
      const { data: ovisPayments, error: paymentsError } = await supabase
        .from('payment')
        .select('id, deal_id, sf_id, payment_amount, payment_name, payment_sequence, payment_date_estimated, agci')
        .in('deal_id', dealIds)
        .eq('is_active', true);

      if (paymentsError) throw paymentsError;
      console.log('[PaymentReconciliationReport] OVIS payments:', ovisPayments?.length);

      // Fetch OVIS payment splits to get broker totals
      const paymentIds = ovisPayments?.map(p => p.id) || [];
      const { data: ovisSplits, error: splitsError } = await supabase
        .from('payment_split')
        .select(`
          payment_id,
          split_origination_usd,
          split_site_usd,
          split_deal_usd,
          broker!inner(name)
        `)
        .in('payment_id', paymentIds);

      if (splitsError) throw splitsError;
      console.log('[PaymentReconciliationReport] OVIS splits:', ovisSplits?.length);

      // Get all SF IDs from deals
      const sfIds = ovisDeals?.filter(d => d.sf_id).map(d => d.sf_id) || [];
      console.log('[PaymentReconciliationReport] Fetching SF data for', sfIds.length, 'opportunities');

      // Fetch Salesforce Opportunity data for stages
      const { data: sfOpportunities, error: sfOppError } = await supabase
        .from('salesforce_Opportunity')
        .select('Id, StageName')
        .in('Id', sfIds);

      if (sfOppError) throw sfOppError;
      console.log('[PaymentReconciliationReport] SF opportunities:', sfOpportunities?.length);

      const sfStageMap = new Map(sfOpportunities?.map(o => [o.Id, o.StageName]) || []);

      // Fetch Salesforce Payment data
      const sfPaymentIds = ovisPayments?.filter((p: any) => p.sf_id).map((p: any) => p.sf_id) || [];
      const { data: sfPayments, error: sfPaymentError } = await supabase
        .from('salesforce_Payment__c')
        .select(`
          Id,
          Opportunity__c,
          Payment_Amount__c,
          AGCI__c,
          House_Dollars__c,
          Broker_Total_Mike__c,
          Broker_Total_Arty__c,
          Broker_Total_Greg__c
        `)
        .in('Id', sfPaymentIds)
        .eq('IsDeleted', false);

      if (sfPaymentError) throw sfPaymentError;
      console.log('[PaymentReconciliationReport] SF payments:', sfPayments?.length);

      const sfPaymentMap = new Map(sfPayments?.map((p: any) => [p.Id, p]) || []);

      // Aggregate split data by payment
      const splitsByPayment = new Map<string, {
        mikeTotal: number;
        artyTotal: number;
        gregTotal: number;
      }>();

      ovisSplits?.forEach((split: any) => {
        const existing = splitsByPayment.get(split.payment_id) || { mikeTotal: 0, artyTotal: 0, gregTotal: 0 };
        const total = (split.split_origination_usd || 0) + (split.split_site_usd || 0) + (split.split_deal_usd || 0);
        const brokerName = split.broker?.name?.toLowerCase() || '';

        if (brokerName.includes('mike')) {
          existing.mikeTotal += total;
        } else if (brokerName.includes('arty')) {
          existing.artyTotal += total;
        } else if (brokerName.includes('greg')) {
          existing.gregTotal += total;
        }

        splitsByPayment.set(split.payment_id, existing);
      });

      // Create reconciliation rows for each payment
      const rows: PaymentReconciliationRow[] = ovisPayments?.map((payment: any) => {
        const deal = ovisDeals?.find(d => d.id === payment.deal_id);
        if (!deal) return null;

        const ovisStage = stageLabelMap.get(deal.stage_id) || 'Unknown';
        const sfStage = deal.sf_id ? sfStageMap.get(deal.sf_id) || null : null;

        const ovisSplitData = splitsByPayment.get(payment.id) || { mikeTotal: 0, artyTotal: 0, gregTotal: 0 };

        const sfPayment = payment.sf_id ? sfPaymentMap.get(payment.sf_id) : null;
        const sfAgci = sfPayment?.AGCI__c || 0;
        const sfHouse = sfPayment?.House_Dollars__c || 0;

        return {
          payment_id: payment.id,
          deal_id: deal.id,
          deal_name: deal.deal_name || 'Unknown',
          payment_name: payment.payment_name,
          payment_sequence: payment.payment_sequence || 0,
          booked_date: deal.booked_date,
          closed_date: deal.closed_date,
          payment_date_estimated: payment.payment_date_estimated,
          sf_payment_id: payment.sf_id,
          ovis_stage: ovisStage,
          sf_stage: sfStage,
          stage_match: ovisStage === sfStage,
          ovis_payment_amount: payment.payment_amount || 0,
          sf_payment_amount: sfPayment?.Payment_Amount__c || 0,
          payment_variance: (payment.payment_amount || 0) - (sfPayment?.Payment_Amount__c || 0),
          ovis_agci: payment.agci || 0,
          sf_agci: sfAgci,
          agci_variance: (payment.agci || 0) - sfAgci,
          ovis_house: 0, // Would need to calculate from deal-level data
          sf_house: sfHouse,
          house_variance: 0 - sfHouse,
          ovis_mike: ovisSplitData.mikeTotal,
          sf_mike: sfPayment?.Broker_Total_Mike__c || 0,
          mike_variance: ovisSplitData.mikeTotal - (sfPayment?.Broker_Total_Mike__c || 0),
          ovis_arty: ovisSplitData.artyTotal,
          sf_arty: sfPayment?.Broker_Total_Arty__c || 0,
          arty_variance: ovisSplitData.artyTotal - (sfPayment?.Broker_Total_Arty__c || 0),
          ovis_greg: ovisSplitData.gregTotal,
          sf_greg: sfPayment?.Broker_Total_Greg__c || 0,
          greg_variance: ovisSplitData.gregTotal - (sfPayment?.Broker_Total_Greg__c || 0),
        };
      }).filter(Boolean) as PaymentReconciliationRow[];

      setReconciliationData(rows);
      console.log('[PaymentReconciliationReport] Reconciliation complete:', rows.length, 'rows');

    } catch (error: any) {
      console.error('[PaymentReconciliationReport] Error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = reconciliationData;

    // Filter by closed date based on selected option
    if (closedDateFilter === 'missing') {
      // Show only "Closed Paid" deals WITHOUT a closed_date
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          return !row.closed_date;
        }
        return true; // Keep non-Closed Paid deals
      });
    } else if (closedDateFilter === 'current_year') {
      // For "Closed Paid" deals: only show if closed_date >= 2025-01-01
      // For other stages: keep all
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          return row.closed_date && row.closed_date >= '2025-01-01';
        }
        return true; // Keep non-Closed Paid deals
      });
    } else if (closedDateFilter === 'last_2_years') {
      // For "Closed Paid" deals: only show if closed_date >= 2024-01-01
      // For other stages: keep all
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          return row.closed_date && row.closed_date >= '2024-01-01';
        }
        return true; // Keep non-Closed Paid deals
      });
    } else if (closedDateFilter === 'custom') {
      // Custom range for closed date (only applies to "Closed Paid" deals)
      filtered = filtered.filter(row => {
        if (row.ovis_stage === 'Closed Paid') {
          let valid = true;
          if (customClosedDateFrom && row.closed_date) {
            valid = valid && row.closed_date >= customClosedDateFrom;
          } else if (customClosedDateFrom && !row.closed_date) {
            valid = false; // Exclude if we require a from date but deal has no closed_date
          }
          if (customClosedDateTo && row.closed_date) {
            valid = valid && row.closed_date <= customClosedDateTo;
          } else if (customClosedDateTo && !row.closed_date) {
            valid = false; // Exclude if we require a to date but deal has no closed_date
          }
          return valid;
        }
        return true; // Keep non-Closed Paid deals
      });
    }
    // 'all_time' doesn't filter anything

    // Filter by stages (multi-select)
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
    // 'all' doesn't filter

    // Filter by estimated payment date
    if (estPaymentDateFilter === 'current_year') {
      filtered = filtered.filter(row => !row.payment_date_estimated || row.payment_date_estimated >= '2025-01-01');
    } else if (estPaymentDateFilter === 'last_2_years') {
      filtered = filtered.filter(row => !row.payment_date_estimated || row.payment_date_estimated >= '2024-01-01');
    } else if (estPaymentDateFilter === 'custom') {
      if (estimatedPaymentDateFrom) {
        filtered = filtered.filter(row =>
          row.payment_date_estimated && row.payment_date_estimated >= estimatedPaymentDateFrom
        );
      }
      if (estimatedPaymentDateTo) {
        filtered = filtered.filter(row =>
          row.payment_date_estimated && row.payment_date_estimated <= estimatedPaymentDateTo
        );
      }
    }
    // 'all' doesn't filter

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof PaymentReconciliationRow];
      let bVal: any = b[sortColumn as keyof PaymentReconciliationRow];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal?.toLowerCase() || '';
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

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
    bookedDateTo,
    estPaymentDateFilter,
    estimatedPaymentDateFrom,
    estimatedPaymentDateTo
  ]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredAndSortedData.reduce((acc, row) => {
      acc.ovisPaymentAmount += row.ovis_payment_amount;
      acc.sfPaymentAmount += row.sf_payment_amount;
      acc.ovisAGCI += row.ovis_agci;
      acc.sfAGCI += row.sf_agci;
      acc.ovisHouse += row.ovis_house;
      acc.sfHouse += row.sf_house;
      acc.ovisMike += row.ovis_mike;
      acc.sfMike += row.sf_mike;
      acc.ovisArty += row.ovis_arty;
      acc.sfArty += row.sf_arty;
      acc.ovisGreg += row.ovis_greg;
      acc.sfGreg += row.sf_greg;
      return acc;
    }, {
      ovisPaymentAmount: 0,
      sfPaymentAmount: 0,
      ovisAGCI: 0,
      sfAGCI: 0,
      ovisHouse: 0,
      sfHouse: 0,
      ovisMike: 0,
      sfMike: 0,
      ovisArty: 0,
      sfArty: 0,
      ovisGreg: 0,
      sfGreg: 0
    });
  }, [filteredAndSortedData]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
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

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getVarianceColor = (variance: number) => {
    if (Math.abs(variance) < 0.01) return 'text-gray-600';
    return variance > 0 ? 'text-green-600' : 'text-red-600';
  };

  const getClosedDateFilterLabel = () => {
    switch (closedDateFilter) {
      case 'missing':
        return 'Missing Date';
      case 'current_year':
        return '2025';
      case 'last_2_years':
        return '2024+';
      case 'all_time':
        return 'All Time';
      case 'custom':
        if (customClosedDateFrom && customClosedDateTo) {
          return `${customClosedDateFrom} to ${customClosedDateTo}`;
        } else if (customClosedDateFrom) {
          return `from ${customClosedDateFrom}`;
        } else if (customClosedDateTo) {
          return `to ${customClosedDateTo}`;
        }
        return 'Custom Range';
      default:
        return '2024+';
    }
  };

  const getBookedDateFilterLabel = () => {
    switch (bookedDateFilter) {
      case 'all':
        return 'All';
      case 'current_year':
        return '2025';
      case 'last_2_years':
        return '2024+';
      case 'custom':
        if (bookedDateFrom && bookedDateTo) {
          return `${bookedDateFrom} to ${bookedDateTo}`;
        } else if (bookedDateFrom) {
          return `from ${bookedDateFrom}`;
        } else if (bookedDateTo) {
          return `to ${bookedDateTo}`;
        }
        return 'Custom';
      default:
        return 'All';
    }
  };

  const getEstPaymentDateFilterLabel = () => {
    switch (estPaymentDateFilter) {
      case 'all':
        return 'All';
      case 'current_year':
        return '2025';
      case 'last_2_years':
        return '2024+';
      case 'custom':
        if (estimatedPaymentDateFrom && estimatedPaymentDateTo) {
          return `${estimatedPaymentDateFrom} to ${estimatedPaymentDateTo}`;
        } else if (estimatedPaymentDateFrom) {
          return `from ${estimatedPaymentDateFrom}`;
        } else if (estimatedPaymentDateTo) {
          return `to ${estimatedPaymentDateTo}`;
        }
        return 'Custom';
      default:
        return 'All';
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

      // Update local state
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

  const handleOpenPaymentModal = (row: PaymentReconciliationRow) => {
    setSelectedPaymentForEdit({
      paymentId: row.payment_id,
      currentAmount: row.ovis_payment_amount,
      paymentSequence: row.payment_sequence,
      dealName: row.deal_name,
    });
    setShowPaymentModal(true);
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-xs text-gray-600">Loading reconciliation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-800">Error loading data: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Payment Reconciliation Report</h2>
        <p className="text-xs text-gray-600 mt-1">
          Compare OVIS payment data with Salesforce at the payment level
        </p>
      </div>

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
          {' • '}
          <span className="font-medium">Est. Payment:</span> {getEstPaymentDateFilterLabel()}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {/* Stage Filter Toggle */}
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

            {/* Stage Filter Dropdown */}
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

          {/* Estimated Payment Date Filter */}
          <div className="relative" ref={estPaymentDateMenuRef}>
            <button
              onClick={() => setShowEstPaymentDateMenu(!showEstPaymentDateMenu)}
              className="px-3 py-1.5 border border-gray-300 rounded-md shadow-sm bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Est. Pmt: {estPaymentDateFilter === 'all' ? 'All' : estPaymentDateFilter === 'current_year' ? '2025' : estPaymentDateFilter === 'last_2_years' ? '2024+' : 'Custom'}
              <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showEstPaymentDateMenu && (
              <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-2">
                  <button onClick={() => { setEstPaymentDateFilter('all'); setShowEstPaymentDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${estPaymentDateFilter === 'all' ? 'bg-blue-50 font-semibold' : ''}`}>
                    All
                  </button>
                  <button onClick={() => { setEstPaymentDateFilter('current_year'); setShowEstPaymentDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${estPaymentDateFilter === 'current_year' ? 'bg-blue-50 font-semibold' : ''}`}>
                    This Year (2025)
                  </button>
                  <button onClick={() => { setEstPaymentDateFilter('last_2_years'); setShowEstPaymentDateMenu(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${estPaymentDateFilter === 'last_2_years' ? 'bg-blue-50 font-semibold' : ''}`}>
                    Last 2 Years (2024+)
                  </button>
                  <button onClick={() => setEstPaymentDateFilter('custom')} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded ${estPaymentDateFilter === 'custom' ? 'bg-blue-50 font-semibold' : ''}`}>
                    Custom Range
                  </button>
                  {estPaymentDateFilter === 'custom' && (
                    <div className="mt-2 p-2 border-t space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">From:</label>
                        <input type="date" value={estimatedPaymentDateFrom} onChange={(e) => setEstimatedPaymentDateFrom(e.target.value)} className="w-full px-2 py-1 text-xs border rounded" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">To:</label>
                        <input type="date" value={estimatedPaymentDateTo} onChange={(e) => setEstimatedPaymentDateTo(e.target.value)} className="w-full px-2 py-1 text-xs border rounded" />
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
              Showing {filteredAndSortedData.length} of {reconciliationData.length} payments
            </div>
          </div>
        </div>

        {/* Selected Stages Pills */}
        {selectedStages.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedStages.map(stage => (
              <span
                key={stage}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {stage}
                <button
                  onClick={() => handleStageToggle(stage)}
                  className="ml-1 inline-flex items-center justify-center w-3 h-3 rounded-full hover:bg-blue-200 text-xs"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => handleSort('deal_name')} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Deal / Payment {sortColumn === 'deal_name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('ovis_stage')} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Stage {sortColumn === 'ovis_stage' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('closed_date')} className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                Closed {sortColumn === 'closed_date' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">Payment Amt</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-purple-50">AGCI</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-orange-50">House $</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-red-50">Mike</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Arty</th>
              <th colSpan={3} className="px-2 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-pink-50">Greg</th>
            </tr>
            <tr>
              <th></th>
              <th></th>
              <th></th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-blue-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-blue-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-blue-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-purple-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-purple-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-purple-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-orange-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-orange-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-orange-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-red-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-red-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-red-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-yellow-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-yellow-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-yellow-50">Var</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-pink-50">OVIS</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-pink-50">SF</th>
              <th className="px-1 py-0.5 text-xs font-medium text-gray-500 text-center bg-pink-50">Var</th>
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
                  {row.payment_name && (
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      {row.payment_name}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPaymentModal(row);
                        }}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-1 rounded transition-colors"
                        title="Edit Payment"
                      >
                        💰→
                      </button>
                    </div>
                  )}
                </td>
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
                <td className="px-1 py-1.5 text-xs text-right bg-blue-50">{formatCurrency(row.ovis_payment_amount)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-blue-50">{formatCurrency(row.sf_payment_amount)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-blue-50 ${getVarianceColor(row.payment_variance)}`}>{formatCurrency(row.payment_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-purple-50">{formatCurrency(row.ovis_agci)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-purple-50">{formatCurrency(row.sf_agci)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-purple-50 ${getVarianceColor(row.agci_variance)}`}>{formatCurrency(row.agci_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-orange-50">{formatCurrency(row.ovis_house)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-orange-50">{formatCurrency(row.sf_house)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-orange-50 ${getVarianceColor(row.house_variance)}`}>{formatCurrency(row.house_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-red-50">{formatCurrency(row.ovis_mike)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-red-50">{formatCurrency(row.sf_mike)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-red-50 ${getVarianceColor(row.mike_variance)}`}>{formatCurrency(row.mike_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-yellow-50">{formatCurrency(row.ovis_arty)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-yellow-50">{formatCurrency(row.sf_arty)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-yellow-50 ${getVarianceColor(row.arty_variance)}`}>{formatCurrency(row.arty_variance)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-pink-50">{formatCurrency(row.ovis_greg)}</td>
                <td className="px-1 py-1.5 text-xs text-right bg-pink-50">{formatCurrency(row.sf_greg)}</td>
                <td className={`px-1 py-1.5 text-xs text-right font-semibold bg-pink-50 ${getVarianceColor(row.greg_variance)}`}>{formatCurrency(row.greg_variance)}</td>
              </tr>
            ))}
            {/* Totals Row */}
            <tr className="bg-gray-800 text-white font-bold">
              <td className="px-2 py-1.5 text-xs" colSpan={3}>TOTALS</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisPaymentAmount)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfPaymentAmount)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisPaymentAmount - totals.sfPaymentAmount)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisAGCI)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfAGCI)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisAGCI - totals.sfAGCI)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisHouse)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfHouse)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisHouse - totals.sfHouse)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisMike)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfMike)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisMike - totals.sfMike)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisArty)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfArty)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisArty - totals.sfArty)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisGreg)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.sfGreg)}</td>
              <td className="px-1 py-1.5 text-xs text-right">{formatCurrency(totals.ovisGreg - totals.sfGreg)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment Amount Override Modal */}
      {showPaymentModal && selectedPaymentForEdit && (
        <PaymentAmountOverrideModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedPaymentForEdit(null);
          }}
          paymentId={selectedPaymentForEdit.paymentId}
          currentAmount={selectedPaymentForEdit.currentAmount}
          paymentSequence={selectedPaymentForEdit.paymentSequence}
          dealName={selectedPaymentForEdit.dealName}
          onSuccess={() => {
            // Refresh the reconciliation data when payment is updated
            fetchReconciliationData();
            setShowPaymentModal(false);
            setSelectedPaymentForEdit(null);
          }}
        />
      )}

      {/* Deal Details Slideout */}
      <DealDetailsSlideout
        dealId={selectedDealId}
        isOpen={isSlideoutOpen}
        onClose={() => {
          setIsSlideoutOpen(false);
          setSelectedDealId(null);
        }}
        onDealUpdated={() => {
          // Refresh the reconciliation data when deal is updated
          fetchReconciliationData();
        }}
      />
    </div>
  );
};

export default PaymentReconciliationReport;
