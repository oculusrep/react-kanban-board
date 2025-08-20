import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Broker, CommissionSplit, DealUpdateHandler } from '../lib/types';

interface CommissionTabProps {
  dealId: string;
  deal: Deal;
  onDealUpdate: DealUpdateHandler;
}

const CommissionTab: React.FC<CommissionTabProps> = ({ dealId, deal: propDeal, onDealUpdate }) => {
  const [deal, setDeal] = useState<Deal | null>(propDeal);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Update local deal state when prop changes
  useEffect(() => {
    setDeal(propDeal);
  }, [propDeal]);
  const [editingField, setEditingField] = useState<string | null>(null);

  useEffect(() => {
    fetchCommissionData();
  }, [dealId]);

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      
      // Don't fetch deal data - we get it from props
      // Just fetch commission splits, brokers, and payments

      // Fetch commission splits
      const { data: splitsData, error: splitsError } = await supabase
        .from('commission_split')
        .select('*')
        .eq('deal_id', dealId);

      if (splitsError) throw splitsError;

      // Fetch all brokers to join with commission splits
      const { data: brokersData, error: brokersError } = await supabase
        .from('broker')
        .select('*');

      if (brokersError) throw brokersError;
      setBrokers(brokersData.filter(broker => broker.active));

      // Join commission splits with broker data
      const formattedSplits = splitsData.map(split => {
        const broker = brokersData.find(b => b.id === split.broker_id);
        return {
          ...split,
          broker_name: broker ? broker.name : 'Unknown Broker'
        };
      });
      setCommissionSplits(formattedSplits);

      // Fetch existing payments to check if generation is possible
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select('*')
        .eq('deal_id', dealId);

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Commission calculation logic
  const calculateCommissionAmounts = (dealData: Deal): Deal => {
    const dealValue = dealData.deal_value || 0;
    const commissionPercent = dealData.commission_percent || 0;
    const referralFeePercent = dealData.referral_fee_percent || 0;
    
    // Calculate Fee (same logic as DealDetailsForm)
    const calculatedFee = dealData.flat_fee_override ?? (dealValue * (commissionPercent / 100));
    
    // Calculate GCI (Gross Commission Income) - should this be from the fee or deal value?
    // Based on typical commission structures, GCI is usually the total commission earned
    const gci = calculatedFee;
    
    // Calculate Referral Fee USD - this should be from the total fee
    const referralFeeUsd = calculatedFee * (referralFeePercent / 100);
    
    // Calculate AGCI (Adjusted GCI) = GCI - Referral Fee
    const agci = gci - referralFeeUsd;
    
    // Calculate individual broker amounts from AGCI
    const houseUsd = agci * ((dealData.house_percent || 0) / 100);
    const originationUsd = agci * ((dealData.origination_percent || 0) / 100);
    const siteUsd = agci * ((dealData.site_percent || 0) / 100);
    const dealUsd = agci * ((dealData.deal_percent || 0) / 100);
    
    return {
      ...dealData,
      fee: Math.round(calculatedFee * 100) / 100,
      gci: Math.round(gci * 100) / 100,
      referral_fee_usd: Math.round(referralFeeUsd * 100) / 100,
      agci: Math.round(agci * 100) / 100,
      house_usd: Math.round(houseUsd * 100) / 100,
      origination_usd: Math.round(originationUsd * 100) / 100,
      site_usd: Math.round(siteUsd * 100) / 100,
      deal_usd: Math.round(dealUsd * 100) / 100,
    };
  };

  // Update field function with shared state management
  const updateField = async (field: string, value: any) => {
    if (!deal) return;
    
    const updatedDeal = {
      ...deal,
      [field]: value
    };
    
    // If commission_percent changes, we need to recalculate the fee AND all commission amounts
    // If other percentage fields change, we only need to recalculate commission amounts
    const fieldsToRecalculate = [
      'commission_percent', 'referral_fee_percent', 
      'house_percent', 'origination_percent', 'site_percent', 'deal_percent'
    ];
    
    let finalDeal = updatedDeal;
    if (fieldsToRecalculate.includes(field)) {
      finalDeal = calculateCommissionAmounts(updatedDeal);
    }
    
    // Auto-save to database
    try {
      const { error } = await supabase
        .from('deal')
        .update(finalDeal)
        .eq('id', dealId);

      if (error) throw error;
      
      // Update both local state AND parent state
      setDeal(finalDeal);
      onDealUpdate(finalDeal);
    } catch (err) {
      alert(`Error saving: ${err instanceof Error ? err.message : 'Failed to save'}`);
    }
  };

  const generatePayments = async () => {
    try {
      setIsGenerating(true);
      
      const { data, error } = await supabase.rpc('generate_payments_for_deal', {
        deal_uuid: dealId
      });

      if (error) throw error;

      // Refresh the data to show new payments
      await fetchCommissionData();
      
      alert(`Success: ${data}`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to generate payments'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatCurrencyHelper = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercentHelper = (percent: number | null): string => {
    if (percent === null || percent === undefined) return '0.0%';
    return `${percent.toFixed(1)}%`;
  };

  // Simple percentage input component to avoid FormattedInput type issues
  const PercentageInput = ({ 
    label, 
    value, 
    onChange 
  }: { 
    label: string; 
    value: number | null; 
    onChange: (v: number | null) => void; 
  }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');

    const displayValue = value ? `${value.toFixed(1)}%` : '0.0%';

    const handleStartEdit = () => {
      setIsEditing(true);
      setEditValue(value?.toString() || '');
    };

    const handleSave = () => {
      const numValue = parseFloat(editValue);
      onChange(isNaN(numValue) ? null : numValue);
      setIsEditing(false);
    };

    const handleCancel = () => {
      setIsEditing(false);
      setEditValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };

    if (isEditing) {
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <input
            type="number"
            step="0.1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
            autoFocus
          />
        </div>
      );
    }

    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div
          onClick={handleStartEdit}
          className="text-lg font-semibold cursor-pointer hover:bg-blue-50 px-3 py-2 rounded-md transition-colors border border-transparent hover:border-blue-200"
          title="Click to edit"
        >
          {displayValue}
        </div>
      </div>
    );
  };

  // Validation helper - SIMPLIFIED to avoid type issues
  const getValidationWarnings = (dealData: Deal) => {
    const warnings: string[] = [];
    
    // Safely get values with defaults
    const origination = Number(dealData.origination_percent) || 0;
    const site = Number(dealData.site_percent) || 0;
    const deal = Number(dealData.deal_percent) || 0;
    const commission = Number(dealData.commission_percent) || 0;
    const referral = Number(dealData.referral_fee_percent) || 0;
    
    // Calculate total
    const total = origination + site + deal;
    
    if (total > 100) {
      warnings.push('Broker split percentages total ' + total.toFixed(1) + '% (over 100%)');
    }
    
    if (commission > 50) {
      warnings.push('Commission rate ' + commission.toFixed(1) + '% seems high');
    }
    
    if (referral > 100) {
      warnings.push('Referral fee ' + referral.toFixed(1) + '% cannot exceed 100%');
    }
    
    return warnings;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading commission data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Commission Data</h3>
        <p className="text-red-600">{error}</p>
        <button 
          onClick={fetchCommissionData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="text-center text-gray-600 py-8">
        <p>Deal not found</p>
      </div>
    );
  }

  const hasPayments = payments.length > 0;
  const canGeneratePayments = commissionSplits.length > 0 && !hasPayments;
  const validationWarnings = getValidationWarnings(deal);

  return (
    <div className="space-y-6">
      {/* Deal-Level Commission Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-1">Deal Fee</h3>
          <p className="text-2xl font-bold text-blue-900">{formatCurrencyHelper(deal.fee)}</p>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800 mb-1">Number of Payments</h3>
          <p className="text-2xl font-bold text-purple-900">{deal.number_of_payments}</p>
        </div>
        
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-orange-800 mb-1">Commission Rate</h3>
          <p className="text-2xl font-bold text-orange-900">
            {deal.commission_percent ? `${deal.commission_percent.toFixed(1)}%` : '0%'}
          </p>
        </div>
      </div>

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Validation Warnings</h3>
              <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                {validationWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Deal-Level Commission Fields */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Commission Details</h3>
          <div className="flex space-x-3">
            {hasPayments && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                {payments.length} payments generated
              </span>
            )}
            <span className="text-sm text-gray-500">Click any percentage to edit</span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Top Row */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deal Fee</label>
              <div className="text-lg font-semibold text-gray-900 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.fee)}
              </div>
            </div>
            
            <PercentageInput
              label="Commission Rate %"
              value={deal.commission_percent}
              onChange={(v) => updateField('commission_percent', v)}
            />
            
            <PercentageInput
              label="Referral Fee %"
              value={deal.referral_fee_percent}
              onChange={(v) => updateField('referral_fee_percent', v)}
            />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Fee $</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.referral_fee_usd)}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Payments</label>
              <input
                type="number"
                step="1"
                min="1"
                value={deal.number_of_payments || 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('number_of_payments', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
              />
            </div>
          </div>

          {/* Second Row: Referral Payee and GCI/AGCI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Payee</label>
              <input
                type="text"
                value={deal.referral_payee || ''}
                onChange={(e) => updateField('referral_payee', e.target.value)}
                placeholder="Enter referral payee name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GCI</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.gci)}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AGCI</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.agci)}
              </div>
            </div>
          </div>

          {/* Third Row: House */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PercentageInput
              label="House %"
              value={deal.house_percent}
              onChange={(v) => updateField('house_percent', v)}
            />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">House $</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.house_usd)}
              </div>
            </div>
          </div>

          {/* Fourth Row: Origination */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PercentageInput
              label="Origination %"
              value={deal.origination_percent}
              onChange={(v) => updateField('origination_percent', v)}
            />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origination $</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.origination_usd)}
              </div>
            </div>
          </div>

          {/* Fifth Row: Site */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PercentageInput
              label="Site %"
              value={deal.site_percent}
              onChange={(v) => updateField('site_percent', v)}
            />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site $</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.site_usd)}
              </div>
            </div>
          </div>

          {/* Sixth Row: Deal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PercentageInput
              label="Deal %"
              value={deal.deal_percent}
              onChange={(v) => updateField('deal_percent', v)}
            />
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deal $</label>
              <div className="text-lg font-semibold text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
                {formatCurrencyHelper(deal.deal_usd)}
              </div>
            </div>
          </div>

          {/* Broker Percentage Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Broker Split Summary (Origination + Site + Deal)</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Origination:</span> {formatPercentHelper(deal.origination_percent)}
              </div>
              <div>
                <span className="text-blue-700">Site:</span> {formatPercentHelper(deal.site_percent)}
              </div>
              <div>
                <span className="text-blue-700">Deal:</span> {formatPercentHelper(deal.deal_percent)}
              </div>
              <div className="font-semibold">
                <span className="text-blue-700">Total:</span> {formatPercentHelper(
                  (deal.origination_percent || 0) + 
                  (deal.site_percent || 0) + 
                  (deal.deal_percent || 0)
                )}
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              House % is separate and not included in the 100% split validation.
            </div>
          </div>
        </div>
      </div>

      {/* Commission Splits Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Broker Commission Splits</h3>
          <div className="flex space-x-3">
            <button
              onClick={generatePayments}
              disabled={!canGeneratePayments || isGenerating}
              className={`px-4 py-2 rounded font-medium ${
                canGeneratePayments && !isGenerating
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? 'Generating...' : 'Generate Payments'}
            </button>
          </div>
        </div>

        {commissionSplits.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <p>No commission splits found for this deal.</p>
            <p className="text-sm mt-1">Commission splits are imported from Salesforce.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Broker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Origination
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Site
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {commissionSplits.map((split) => (
                  <tr key={split.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{split.broker_name}</div>
                      <div className="text-sm text-gray-500">{split.split_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatPercentHelper(split.split_origination_percent)}</div>
                      <div className="text-sm text-gray-500">{formatCurrencyHelper(split.split_origination_usd)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatPercentHelper(split.split_site_percent)}</div>
                      <div className="text-sm text-gray-500">{formatCurrencyHelper(split.split_site_usd)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatPercentHelper(split.split_deal_percent)}</div>
                      <div className="text-sm text-gray-500">{formatCurrencyHelper(split.split_deal_usd)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{formatCurrencyHelper(split.split_broker_total)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Generation Status */}
      {!canGeneratePayments && commissionSplits.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Payments Already Generated
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                This deal already has {payments.length} payment{payments.length !== 1 ? 's' : ''} generated. 
                To regenerate payments, you would need to delete the existing ones first.
              </p>
            </div>
          </div>
        </div>
      )}

      {commissionSplits.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                No Commission Splits Found
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                Commission splits are imported from Salesforce. If this deal should have commission data, 
                check that it exists in Salesforce and run the migration again.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionTab;