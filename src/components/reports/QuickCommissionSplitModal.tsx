import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../../lib/supabaseHelpers';
import { CommissionSplit, Broker } from '../../lib/types';
import { useCommissionCalculations } from '../../hooks/useCommissionCalculations';

// Principal broker IDs for quick setup
const PRINCIPAL_BROKER_IDS = {
  mike: '38d4b67c-841d-4590-a909-523d3a4c6e4b',    // Mike Minihan
  arty: '1d049634-32fe-4834-8ca1-33f1cff0055a',    // Arty Santos
  greg: 'dbfdd8d4-5241-4cc2-be83-f7763f5519bf',    // Greg Bennett
};

interface QuickCommissionSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  dealName: string;
  onSplitsUpdated: () => void;
}

interface DealData {
  id: string;
  deal_name: string | null;
  fee: number | null;
  agci: number | null;
  house_usd: number | null;
  referral_fee_usd: number | null;
  origination_percent: number | null;
  site_percent: number | null;
  deal_percent: number | null;
  stage?: { label: string };
}

// Format USD
const formatUSD = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export default function QuickCommissionSplitModal({
  isOpen,
  onClose,
  dealId,
  dealName,
  onSplitsUpdated
}: QuickCommissionSplitModalProps) {
  const [deal, setDeal] = useState<DealData | null>(null);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the commission calculations hook
  const { baseAmounts, totals } = useCommissionCalculations(deal, commissionSplits);

  // Fetch deal and splits on open
  useEffect(() => {
    if (isOpen && dealId) {
      fetchData();
    }
  }, [isOpen, dealId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch deal
      const { data: dealData, error: dealError } = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          fee,
          agci,
          house_usd,
          referral_fee_usd,
          origination_percent,
          site_percent,
          deal_percent,
          stage:stage_id(label)
        `)
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;
      setDeal(dealData);

      // Fetch existing commission splits
      const { data: splitsData, error: splitsError } = await supabase
        .from('commission_split')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at');

      if (splitsError) throw splitsError;
      setCommissionSplits(splitsData || []);

      // Fetch all brokers
      const { data: brokersData, error: brokersError } = await supabase
        .from('broker')
        .select('*')
        .order('name');

      if (brokersError) throw brokersError;
      setBrokers(brokersData || []);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Get broker name by ID
  const getBrokerName = (brokerId: string) => {
    const broker = brokers.find(b => b.id === brokerId);
    return broker ? broker.name : 'Unknown Broker';
  };

  // Quick setup - add Mike and Arty with default percentages
  const handleQuickSetup = async () => {
    if (!dealId) return;
    setSaving(true);
    setError(null);

    try {
      const principalBrokerIds = [
        PRINCIPAL_BROKER_IDS.mike,
        PRINCIPAL_BROKER_IDS.arty,
      ];

      // Check which brokers are already added
      const existingBrokerIds = commissionSplits.map(s => s.broker_id);
      const brokersToAdd = principalBrokerIds.filter(id => !existingBrokerIds.includes(id));

      if (brokersToAdd.length === 0) {
        setError('All principal brokers are already added');
        setSaving(false);
        return;
      }

      // Insert new splits with 0% defaults (user can edit)
      const newSplits = brokersToAdd.map(brokerId => ({
        deal_id: dealId,
        broker_id: brokerId,
        split_origination_percent: 0,
        split_origination_usd: 0,
        split_site_percent: 0,
        split_site_usd: 0,
        split_deal_percent: 0,
        split_deal_usd: 0,
        split_broker_total: 0,
      }));

      const { data, error: insertError } = await supabase
        .from('commission_split')
        .insert(newSplits.map(s => prepareInsert(s)))
        .select('*');

      if (insertError) throw insertError;

      setCommissionSplits(prev => [...prev, ...(data || [])]);
    } catch (err) {
      console.error('Error in quick setup:', err);
      setError(err instanceof Error ? err.message : 'Failed to add brokers');
    } finally {
      setSaving(false);
    }
  };

  // Add a single broker
  const addBrokerSplit = async (brokerId: string) => {
    if (!dealId) return;
    setSaving(true);

    try {
      const newSplit = {
        deal_id: dealId,
        broker_id: brokerId,
        split_origination_percent: 0,
        split_origination_usd: 0,
        split_site_percent: 0,
        split_site_usd: 0,
        split_deal_percent: 0,
        split_deal_usd: 0,
        split_broker_total: 0,
      };

      const { data, error: insertError } = await supabase
        .from('commission_split')
        .insert(prepareInsert(newSplit))
        .select('*')
        .single();

      if (insertError) throw insertError;

      setCommissionSplits(prev => [...prev, data]);
    } catch (err) {
      console.error('Error adding broker:', err);
      setError(err instanceof Error ? err.message : 'Failed to add broker');
    } finally {
      setSaving(false);
    }
  };

  // Update a commission split field
  const updateSplit = async (splitId: string, field: string, value: number | null) => {
    try {
      const currentSplit = commissionSplits.find(s => s.id === splitId);
      if (!currentSplit) return;

      const updatedSplit = { ...currentSplit };

      if (field === 'split_origination_percent') {
        updatedSplit.split_origination_percent = value || 0;
        updatedSplit.split_origination_usd = (value || 0) / 100 * baseAmounts.originationUSD;
      } else if (field === 'split_site_percent') {
        updatedSplit.split_site_percent = value || 0;
        updatedSplit.split_site_usd = (value || 0) / 100 * baseAmounts.siteUSD;
      } else if (field === 'split_deal_percent') {
        updatedSplit.split_deal_percent = value || 0;
        updatedSplit.split_deal_usd = (value || 0) / 100 * baseAmounts.dealUSD;
      }

      // Recalculate total
      updatedSplit.split_broker_total =
        (updatedSplit.split_origination_usd || 0) +
        (updatedSplit.split_site_usd || 0) +
        (updatedSplit.split_deal_usd || 0);

      // Update in database
      const { error: updateError } = await supabase
        .from('commission_split')
        .update(prepareUpdate({
          split_origination_percent: updatedSplit.split_origination_percent,
          split_origination_usd: updatedSplit.split_origination_usd,
          split_site_percent: updatedSplit.split_site_percent,
          split_site_usd: updatedSplit.split_site_usd,
          split_deal_percent: updatedSplit.split_deal_percent,
          split_deal_usd: updatedSplit.split_deal_usd,
          split_broker_total: updatedSplit.split_broker_total,
        }))
        .eq('id', splitId);

      if (updateError) throw updateError;

      // Update local state
      setCommissionSplits(prev =>
        prev.map(split => split.id === splitId ? updatedSplit : split)
      );
    } catch (err) {
      console.error('Error updating split:', err);
      setError(err instanceof Error ? err.message : 'Failed to update split');
    }
  };

  // Delete a commission split
  const deleteSplit = async (splitId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('commission_split')
        .delete()
        .eq('id', splitId);

      if (deleteError) {
        if (deleteError.code === '23503' && deleteError.message.includes('payment_split')) {
          setError('Cannot delete - this broker has related payments.');
          return;
        }
        throw deleteError;
      }

      setCommissionSplits(prev => prev.filter(s => s.id !== splitId));
      setError(null);
    } catch (err) {
      console.error('Error deleting split:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete split');
    }
  };

  // Handle close
  const handleClose = () => {
    onSplitsUpdated();
    onClose();
  };

  // Get available brokers (not already assigned)
  const availableBrokers = brokers.filter(
    broker => !commissionSplits.some(split => split.broker_id === broker.id)
  );

  // Check if principal brokers (Mike and Arty) are already added
  const hasPrincipalBrokers = [
    PRINCIPAL_BROKER_IDS.mike,
    PRINCIPAL_BROKER_IDS.arty,
  ].every(id => commissionSplits.some(s => s.broker_id === id));

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Commission Splits</h2>
              <p className="text-sm text-gray-500 mt-1">{dealName}</p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-light"
            >
              &times;
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                {/* Deal Info */}
                {deal && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">AGCI:</span>
                        <span className="ml-2 font-medium">{formatUSD(baseAmounts.agci)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Stage:</span>
                        <span className="ml-2 font-medium">{(deal.stage as any)?.label || 'Unknown'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Fee:</span>
                        <span className="ml-2 font-medium">{formatUSD(deal.fee)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm mt-2">
                      <div>
                        <span className="text-gray-500">Origination:</span>
                        <span className="ml-2">{deal.origination_percent || 0}%</span>
                        <span className="text-gray-400 ml-1">({formatUSD(baseAmounts.originationUSD)})</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Site:</span>
                        <span className="ml-2">{deal.site_percent || 0}%</span>
                        <span className="text-gray-400 ml-1">({formatUSD(baseAmounts.siteUSD)})</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Deal:</span>
                        <span className="ml-2">{deal.deal_percent || 0}%</span>
                        <span className="text-gray-400 ml-1">({formatUSD(baseAmounts.dealUSD)})</span>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 mb-4">
                  {!hasPrincipalBrokers && (
                    <button
                      onClick={handleQuickSetup}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Quick Setup (Add Mike & Arty)
                    </button>
                  )}

                  {availableBrokers.length > 0 && (
                    <select
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onChange={(e) => {
                        if (e.target.value) {
                          addBrokerSplit(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      disabled={saving}
                    >
                      <option value="">+ Add Broker</option>
                      {availableBrokers.map(broker => (
                        <option key={broker.id} value={broker.id}>
                          {broker.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Commission Splits Table */}
                {commissionSplits.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <p>No broker splits configured for this deal.</p>
                    <p className="text-sm mt-2">Click "Quick Setup" to add the three principal brokers, or use the dropdown to add individual brokers.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase">Broker</th>
                          <th className="text-center py-3 px-2 text-xs font-medium text-gray-500 uppercase">Origination %</th>
                          <th className="text-center py-3 px-2 text-xs font-medium text-gray-500 uppercase">Site %</th>
                          <th className="text-center py-3 px-2 text-xs font-medium text-gray-500 uppercase">Deal %</th>
                          <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 uppercase">Total $</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissionSplits.map((split) => (
                          <tr key={split.id} className="border-b border-gray-100">
                            <td className="py-2 px-2 text-sm font-medium text-gray-900">
                              {getBrokerName(split.broker_id)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={split.split_origination_percent || 0}
                                onChange={(e) => updateSplit(split.id, 'split_origination_percent', parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={split.split_site_percent || 0}
                                onChange={(e) => updateSplit(split.id, 'split_site_percent', parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={split.split_deal_percent || 0}
                                onChange={(e) => updateSplit(split.id, 'split_deal_percent', parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-sm text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </td>
                            <td className="py-2 px-2 text-right text-sm font-medium text-gray-900">
                              {formatUSD(
                                ((split.split_origination_percent || 0) / 100 * baseAmounts.originationUSD) +
                                ((split.split_site_percent || 0) / 100 * baseAmounts.siteUSD) +
                                ((split.split_deal_percent || 0) / 100 * baseAmounts.dealUSD)
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => deleteSplit(split.id)}
                                className="text-red-500 hover:text-red-700 font-bold"
                                title="Delete split"
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
                          <td className="py-3 px-2 text-sm text-gray-900">TOTALS</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`text-sm ${Math.abs(totals.originationPercent - 100) < 0.1 ? 'text-green-600' : totals.originationPercent > 100 ? 'text-red-600' : 'text-orange-600'}`}>
                              {totals.originationPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`text-sm ${Math.abs(totals.sitePercent - 100) < 0.1 ? 'text-green-600' : totals.sitePercent > 100 ? 'text-red-600' : 'text-orange-600'}`}>
                              {totals.sitePercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`text-sm ${Math.abs(totals.dealPercent - 100) < 0.1 ? 'text-green-600' : totals.dealPercent > 100 ? 'text-red-600' : 'text-orange-600'}`}>
                              {totals.dealPercent.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right text-sm font-semibold text-blue-600">
                            {formatUSD(commissionSplits.reduce((sum, split) => {
                              return sum +
                                ((split.split_origination_percent || 0) / 100 * baseAmounts.originationUSD) +
                                ((split.split_site_percent || 0) / 100 * baseAmounts.siteUSD) +
                                ((split.split_deal_percent || 0) / 100 * baseAmounts.dealUSD);
                            }, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Validation Messages */}
                {commissionSplits.length > 0 && (
                  <div className="mt-4 text-sm text-gray-600 space-y-1">
                    {totals.originationPercent !== 100 && totals.originationPercent > 0 && (
                      <p className="text-orange-600">
                        Origination splits total {totals.originationPercent.toFixed(1)}% (should be 100%)
                      </p>
                    )}
                    {totals.sitePercent !== 100 && totals.sitePercent > 0 && (
                      <p className="text-orange-600">
                        Site splits total {totals.sitePercent.toFixed(1)}% (should be 100%)
                      </p>
                    )}
                    {totals.dealPercent !== 100 && totals.dealPercent > 0 && (
                      <p className="text-orange-600">
                        Deal splits total {totals.dealPercent.toFixed(1)}% (should be 100%)
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
