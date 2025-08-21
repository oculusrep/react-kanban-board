import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Broker, CommissionSplit, DealUpdateHandler } from '../lib/types';
import CommissionDetailsSection from './CommissionDetailsSection';
import CommissionSplitSection from './CommissionSplitSection';

interface CommissionTabProps {
  dealId: string;
  deal: Deal;
  onDealUpdate: DealUpdateHandler;
}

interface SectionProps {
  title: string;
  help?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, help, children }) => {
  return (
    <section className="bg-white rounded-md border p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {help && (
          <span
            className="text-gray-500 text-xs border rounded-full w-4 h-4 inline-flex items-center justify-center"
            title={help}
            aria-label={help}
          >
            i
          </span>
        )}
      </div>
      {children}
    </section>
  );
};

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

  useEffect(() => {
    fetchCommissionData();
  }, [dealId]);

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      
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
    
    // Calculate Referral Fee USD - this should be from the total fee
    const referralFeeUsd = calculatedFee * (referralFeePercent / 100);

    // Calculate GCI (Gross Commission Income)
    const gci = calculatedFee - referralFeeUsd;
    
    // Calculate House USD = gci * house_percent
    const houseUsd = gci * ((dealData.house_percent || 0) / 100);
    
    // Calculate AGCI (Adjusted GCI) = GCI - House USD
    const agci = gci - houseUsd;
    
    // Calculate individual broker amounts from AGCI
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
    
    // Prepare update payload - only send the fields that can be updated
    // Start with core commission fields that we know exist
    const updatePayload: any = {
      commission_percent: finalDeal.commission_percent,
      referral_fee_percent: finalDeal.referral_fee_percent,
      house_percent: finalDeal.house_percent,
      origination_percent: finalDeal.origination_percent,
      site_percent: finalDeal.site_percent,
      deal_percent: finalDeal.deal_percent,
      number_of_payments: finalDeal.number_of_payments,
      fee: finalDeal.fee,
      updated_at: new Date().toISOString()
    };

    // Add calculated fields if they exist in the database
    if (finalDeal.gci !== undefined) updatePayload.gci = finalDeal.gci;
    if (finalDeal.referral_fee_usd !== undefined) updatePayload.referral_fee_usd = finalDeal.referral_fee_usd;
    if (finalDeal.agci !== undefined) updatePayload.agci = finalDeal.agci;
    if (finalDeal.house_usd !== undefined) updatePayload.house_usd = finalDeal.house_usd;
    if (finalDeal.origination_usd !== undefined) updatePayload.origination_usd = finalDeal.origination_usd;
    if (finalDeal.site_usd !== undefined) updatePayload.site_usd = finalDeal.site_usd;
    if (finalDeal.deal_usd !== undefined) updatePayload.deal_usd = finalDeal.deal_usd;
    
    // Handle referral payee - save as referral_payee_client_id in database
    if (field === 'referral_payee_client_id' && finalDeal.referral_payee_client_id !== undefined) {
      updatePayload.referral_payee_client_id = finalDeal.referral_payee_client_id;
    }
    
    // Auto-save to database
    try {
      console.log('Updating field:', field, 'with value:', value);
      console.log('Update payload:', updatePayload);
      
      const { data, error } = await supabase
        .from('deal')
        .update(updatePayload)
        .eq('id', dealId)
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      console.log('Update successful:', data);
      
      // Update both local state AND parent state
      setDeal(data);
      onDealUpdate(data);
    } catch (err) {
      console.error('Error saving:', err);
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

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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
        <div className="text-sm text-gray-600">Loading commission data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-red-800 mb-2">Error Loading Commission Data</h3>
        <p className="text-sm text-red-600">{error}</p>
        <button 
          onClick={fetchCommissionData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="text-center text-gray-600 py-8">
        <p className="text-sm">Deal not found</p>
      </div>
    );
  }

  const hasPayments = payments.length > 0;
  const validationWarnings = getValidationWarnings(deal);

  return (
    <div className="space-y-4">
      {/* Deal-Level Commission Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-xs font-medium text-blue-800 mb-1">Deal Fee</h3>
          <p className="text-lg font-bold text-blue-900">{formatCurrency(deal.fee)}</p>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-xs font-medium text-purple-800 mb-1">Number of Payments</h3>
          <p className="text-lg font-bold text-purple-900">{deal.number_of_payments}</p>
        </div>
        
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-xs font-medium text-orange-800 mb-1">Commission Rate</h3>
          <p className="text-lg font-bold text-orange-900">
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
              <ul className="mt-1 text-xs text-yellow-700 list-disc list-inside">
                {validationWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Payment Status Warnings */}
      {hasPayments && (
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
              <p className="mt-1 text-xs text-yellow-700">
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
              <p className="mt-1 text-xs text-blue-700">
                Commission splits are imported from Salesforce. If this deal should have commission data, 
                check that it exists in Salesforce and run the migration again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Commission Details Section - Now using the separate component */}
      <CommissionDetailsSection 
        deal={deal} 
        onFieldUpdate={updateField} 
      />

      {/* Commission Splits Section - NOW USING THE SEPARATE COMPONENT */}
      <CommissionSplitSection 
        deal={deal} 
        onDealUpdate={onDealUpdate} 
      />

      {/* Payment Generation Section */}
      <Section title="Payment Generation" help="Generate payments based on commission splits">
        <div className="flex justify-end mb-3">
          <button
            onClick={generatePayments}
            disabled={commissionSplits.length === 0 || hasPayments || isGenerating}
            className={`px-4 py-2 rounded font-medium text-sm ${
              commissionSplits.length > 0 && !hasPayments && !isGenerating
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isGenerating ? 'Generating...' : 'Generate Payments'}
          </button>
        </div>
        
        {commissionSplits.length === 0 && (
          <div className="text-center text-gray-500 py-4">
            <p className="text-sm">No commission splits available for payment generation.</p>
          </div>
        )}
      </Section>

      {/* Commission Split Summary for Quick Reference */}
      {commissionSplits.length > 0 && (
        <Section title="Quick Summary" help="Overview of commission allocation">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <h4 className="text-xs font-medium text-green-800 mb-1">Total Commission Splits</h4>
              <p className="text-lg font-bold text-green-900">{commissionSplits.length}</p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="text-xs font-medium text-blue-800 mb-1">Total Broker Amount</h4>
              <p className="text-lg font-bold text-blue-900">
                {formatCurrency(
                  commissionSplits.reduce((sum, split) => sum + (split.split_broker_total || 0), 0)
                )}
              </p>
            </div>
            
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <h4 className="text-xs font-medium text-purple-800 mb-1">Payments Status</h4>
              <p className="text-lg font-bold text-purple-900">
                {hasPayments ? `${payments.length} Generated` : 'Not Generated'}
              </p>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <h4 className="text-xs font-medium text-orange-800 mb-1">Per Payment Amount</h4>
              <p className="text-lg font-bold text-orange-900">
                {deal.number_of_payments && deal.fee ? 
                  formatCurrency(deal.fee / deal.number_of_payments) : 
                  '$0.00'
                }
              </p>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
};

export default CommissionTab;