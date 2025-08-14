import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// Types for our commission data
interface Broker {
  id: string;
  name: string;
  active: boolean;
}

interface CommissionSplit {
  id: string;
  split_name: string;
  broker_id: string;
  broker_name: string;
  split_origination_percent: number;
  split_origination_usd: number;
  split_site_percent: number;
  split_site_usd: number;
  split_deal_percent: number;
  split_deal_usd: number;
  split_broker_total: number;
}

interface Deal {
  id: string;
  deal_name: string;
  fee: number;
  commission_percent: number;
  referral_fee_percent: number;
  referral_fee_usd: number;
  referral_payee: string;
  gci: number;
  agci: number;
  house_percent: number;
  house_usd: number;
  origination_percent: number;
  origination_usd: number;
  site_percent: number;
  site_usd: number;
  deal_percent: number;
  deal_usd: number;
  number_of_payments: number;
  sf_multiple_payments: boolean;
}

interface CommissionTabProps {
  dealId: string;
}

const CommissionTab: React.FC<CommissionTabProps> = ({ dealId }) => {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedDeal, setEditedDeal] = useState<Deal | null>(null);

  useEffect(() => {
    fetchCommissionData();
  }, [dealId]);

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      
      // Fetch deal data
      const { data: dealData, error: dealError } = await supabase
        .from('deal')
        .select('*')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;
      setDeal(dealData);
      setEditedDeal(dealData);

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

  const saveDealChanges = async () => {
    if (!editedDeal) return;
    
    try {
      setIsGenerating(true);
      
      const { error } = await supabase
        .from('deal')
        .update(editedDeal)
        .eq('id', dealId);

      if (error) throw error;
      
      setDeal(editedDeal);
      setIsEditing(false);
      alert('Commission details saved successfully!');
    } catch (err) {
      alert(`Error saving: ${err instanceof Error ? err.message : 'Failed to save'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const cancelEditing = () => {
    setEditedDeal(deal);
    setIsEditing(false);
  };

  const handleFieldChange = (field: keyof Deal, value: number | string) => {
    if (!editedDeal) return;
    
    setEditedDeal({
      ...editedDeal,
      [field]: value
    });
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

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (percent: number | null) => {
    if (percent === null || percent === undefined) return '0%';
    return `${percent.toFixed(1)}%`;
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

  const currentDeal = isEditing ? editedDeal : deal;
  if (!currentDeal) {
    return (
      <div className="text-center text-gray-600 py-8">
        <p>Deal not found</p>
      </div>
    );
  }

  const hasPayments = payments.length > 0;
  const canGeneratePayments = commissionSplits.length > 0 && !hasPayments;

  return (
    <div className="space-y-6">
      {/* Deal-Level Commission Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-1">Deal Fee</h3>
          <p className="text-2xl font-bold text-blue-900">{formatCurrency(currentDeal.fee)}</p>
        </div>
        
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800 mb-1">Number of Payments</h3>
          <p className="text-2xl font-bold text-purple-900">{currentDeal.number_of_payments}</p>
        </div>
        
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-orange-800 mb-1">Commission Rate</h3>
          <p className="text-2xl font-bold text-orange-900">
            {currentDeal.commission_percent ? `${currentDeal.commission_percent.toFixed(1)}%` : '0%'}
          </p>
        </div>
      </div>

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
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
              >
                Edit
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={saveDealChanges}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:bg-gray-400"
                >
                  {isGenerating ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEditing}
                  className="px-4 py-2 bg-gray-500 text-white rounded font-medium hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Top Row: Referral and GCI */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Fee %</label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editedDeal?.referral_fee_percent || 0}
                  onChange={(e) => handleFieldChange('referral_fee_percent', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{formatPercent(currentDeal.referral_fee_percent)}</div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Fee $</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.referral_fee_usd)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referral Payee</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedDeal?.referral_payee || ''}
                  onChange={(e) => handleFieldChange('referral_payee', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{currentDeal.referral_payee || 'None'}</div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GCI</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.gci)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Payments</label>
              {isEditing ? (
                <input
                  type="number"
                  min="1"
                  value={editedDeal?.number_of_payments || 1}
                  onChange={(e) => handleFieldChange('number_of_payments', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{currentDeal.number_of_payments}</div>
              )}
            </div>
          </div>

          {/* Second Row: House */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">House %</label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editedDeal?.house_percent || 0}
                  onChange={(e) => handleFieldChange('house_percent', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{formatPercent(currentDeal.house_percent)}</div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">House $</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.house_usd)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AGCI</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.agci)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Oculus Net</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.agci)}</div>
            </div>
          </div>

          {/* Third Row: Origination */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origination %</label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editedDeal?.origination_percent || 0}
                  onChange={(e) => handleFieldChange('origination_percent', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{formatPercent(currentDeal.origination_percent)}</div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origination $</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.origination_usd)}</div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site %</label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editedDeal?.site_percent || 0}
                  onChange={(e) => handleFieldChange('site_percent', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{formatPercent(currentDeal.site_percent)}</div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site $</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.site_usd)}</div>
            </div>
          </div>

          {/* Fourth Row: Deal */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deal %</label>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editedDeal?.deal_percent || 0}
                  onChange={(e) => handleFieldChange('deal_percent', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="text-lg font-semibold">{formatPercent(currentDeal.deal_percent)}</div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deal $</label>
              <div className="text-lg font-semibold text-gray-600">{formatCurrency(currentDeal.deal_usd)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Commission Splits Table - Still showing broker-level splits */}
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
                      <div className="text-sm text-gray-900">{formatPercent(split.split_origination_percent)}</div>
                      <div className="text-sm text-gray-500">{formatCurrency(split.split_origination_usd)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatPercent(split.split_site_percent)}</div>
                      <div className="text-sm text-gray-500">{formatCurrency(split.split_site_usd)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatPercent(split.split_deal_percent)}</div>
                      <div className="text-sm text-gray-500">{formatCurrency(split.split_deal_usd)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(split.split_broker_total)}</div>
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