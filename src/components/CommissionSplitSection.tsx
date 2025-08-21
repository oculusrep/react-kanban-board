import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, CommissionSplit, Broker } from '../lib/types';
import PercentageInput from './PercentageInput';

interface CommissionSplitSectionProps {
  deal: Deal;
  onDealUpdate: (updatedDeal: Deal) => void;
}

export const CommissionSplitSection: React.FC<CommissionSplitSectionProps> = ({
  deal,
  onDealUpdate
}) => {
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch commission splits and brokers for this deal
  useEffect(() => {
    const fetchCommissionData = async () => {
      if (!deal.id) return;

      try {
        setLoading(true);
        
        // Fetch commission splits for this deal
        const { data: splitsData, error: splitsError } = await supabase
          .from('commission_split')
          .select('*')
          .eq('deal_id', deal.id)
          .order('created_at');

        if (splitsError) throw splitsError;

        // Fetch all brokers
        const { data: brokersData, error: brokersError } = await supabase
          .from('broker')
          .select('*')
          .eq('active', true)
          .order('name');

        if (brokersError) throw brokersError;

        setCommissionSplits(splitsData || []);
        setBrokers(brokersData || []);
      } catch (err) {
        console.error('Error fetching commission data:', err);
        setError('Failed to load commission splits');
      } finally {
        setLoading(false);
      }
    };

    fetchCommissionData();
  }, [deal.id]);

  // Calculate USD amounts from percentages and AGCI
  const calculateUsdAmounts = (percentage: number, type: string) => {
    const agci = Number(deal.agci) || 0;
    return agci * (percentage / 100);
  };

  // Update a commission split field
  const updateCommissionSplit = async (splitId: string, field: string, value: number | null) => {
    try {
      const agci = Number(deal.agci) || 0;
      
      // Find the current split
      const currentSplit = commissionSplits.find(s => s.id === splitId);
      if (!currentSplit) return;

      // Calculate new USD amounts
      const updatedSplit = { ...currentSplit };
      
      if (field === 'split_origination_percent') {
        updatedSplit.split_origination_percent = value || 0;
        updatedSplit.split_origination_usd = calculateUsdAmounts(value || 0, 'origination');
      } else if (field === 'split_site_percent') {
        updatedSplit.split_site_percent = value || 0;
        updatedSplit.split_site_usd = calculateUsdAmounts(value || 0, 'site');
      } else if (field === 'split_deal_percent') {
        updatedSplit.split_deal_percent = value || 0;
        updatedSplit.split_deal_usd = calculateUsdAmounts(value || 0, 'deal');
      }

      // Recalculate total
      updatedSplit.split_broker_total = 
        updatedSplit.split_origination_usd + 
        updatedSplit.split_site_usd + 
        updatedSplit.split_deal_usd;

      // Update in database
      const { error } = await supabase
        .from('commission_split')
        .update({
          split_origination_percent: updatedSplit.split_origination_percent,
          split_origination_usd: updatedSplit.split_origination_usd,
          split_site_percent: updatedSplit.split_site_percent,
          split_site_usd: updatedSplit.split_site_usd,
          split_deal_percent: updatedSplit.split_deal_percent,
          split_deal_usd: updatedSplit.split_deal_usd,
          split_broker_total: updatedSplit.split_broker_total
        })
        .eq('id', splitId);

      if (error) throw error;

      // Update local state
      setCommissionSplits(prev => 
        prev.map(split => split.id === splitId ? updatedSplit : split)
      );

    } catch (err) {
      console.error('Error updating commission split:', err);
      setError('Failed to update commission split');
    }
  };

  // Add new broker split
  const addBrokerSplit = async (brokerId: string) => {
    if (!deal.id) return;

    try {
      const broker = brokers.find(b => b.id === brokerId);
      if (!broker) return;

      const newSplit = {
        deal_id: deal.id,
        broker_id: brokerId,
        split_name: broker.name,
        broker_name: broker.name,
        split_origination_percent: 0,
        split_origination_usd: 0,
        split_site_percent: 0,
        split_site_usd: 0,
        split_deal_percent: 0,
        split_deal_usd: 0,
        split_broker_total: 0
      };

      const { data, error } = await supabase
        .from('commission_split')
        .insert(newSplit)
        .select('*')
        .single();

      if (error) throw error;

      setCommissionSplits([...commissionSplits, data]);
    } catch (err) {
      console.error('Error adding broker split:', err);
      setError('Failed to add broker split');
    }
  };

  // Delete broker split
  const deleteBrokerSplit = async (splitId: string) => {
    if (!confirm('Are you sure you want to delete this broker split?')) return;

    try {
      const { error } = await supabase
        .from('commission_split')
        .delete()
        .eq('id', splitId);

      if (error) throw error;

      setCommissionSplits(prev => prev.filter(split => split.id !== splitId));
    } catch (err) {
      console.error('Error deleting broker split:', err);
      setError('Failed to delete broker split');
    }
  };

  // Get available brokers (not already assigned)
  const availableBrokers = brokers.filter(
    broker => !commissionSplits.some(split => split.broker_id === broker.id)
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Broker Commission Splits</h3>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Broker Commission Splits</h3>
        
        {/* Add Broker Dropdown */}
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {commissionSplits.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No broker splits configured for this deal.</p>
          {availableBrokers.length > 0 && (
            <p className="text-sm mt-2">Use the dropdown above to add brokers.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-3 font-medium text-gray-700">Broker</th>
                <th className="text-center py-3 px-3 font-medium text-gray-700">Origination %</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700">Origination $</th>
                <th className="text-center py-3 px-3 font-medium text-gray-700">Site %</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700">Site $</th>
                <th className="text-center py-3 px-3 font-medium text-gray-700">Deal %</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700">Deal $</th>
                <th className="text-right py-3 px-3 font-medium text-gray-700">Total $</th>
                <th className="w-16 text-center py-3 px-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {commissionSplits.map((split) => {
                const broker = brokers.find(b => b.id === split.broker_id);
                return (
                  <tr key={split.id} className="border-b border-gray-100">
                    <td className="py-3 px-3 font-medium text-gray-900">
                      {broker?.name || split.broker_name || 'Unknown Broker'}
                    </td>
                    
                    {/* Origination Percentage - EDITABLE */}
                    <td className="py-3 px-3 text-center">
                      <PercentageInput
                        label="Origination %"
                        value={Number(split.split_origination_percent) || 0}
                        onChange={(value) => updateCommissionSplit(split.id, 'split_origination_percent', value)}
                      />
                    </td>
                    
                    {/* Origination USD - Calculated */}
                    <td className="py-3 px-3 text-right text-gray-600">
                      ${Number(split.split_origination_usd || 0).toLocaleString()}
                    </td>
                    
                    {/* Site Percentage - EDITABLE */}
                    <td className="py-3 px-3 text-center">
                      <PercentageInput
                        label="Site %"
                        value={Number(split.split_site_percent) || 0}
                        onChange={(value) => updateCommissionSplit(split.id, 'split_site_percent', value)}
                      />
                    </td>
                    
                    {/* Site USD - Calculated */}
                    <td className="py-3 px-3 text-right text-gray-600">
                      ${Number(split.split_site_usd || 0).toLocaleString()}
                    </td>
                    
                    {/* Deal Percentage - EDITABLE */}
                    <td className="py-3 px-3 text-center">
                      <PercentageInput
                        label="Deal %"
                        value={Number(split.split_deal_percent) || 0}
                        onChange={(value) => updateCommissionSplit(split.id, 'split_deal_percent', value)}
                      />
                    </td>
                    
                    {/* Deal USD - Calculated */}
                    <td className="py-3 px-3 text-right text-gray-600">
                      ${Number(split.split_deal_usd || 0).toLocaleString()}
                    </td>
                    
                    {/* Total USD - Calculated */}
                    <td className="py-3 px-3 text-right font-semibold text-gray-900">
                      ${Number(split.split_broker_total || 0).toLocaleString()}
                    </td>
                    
                    {/* Delete Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => deleteBrokerSplit(split.id)}
                        className="text-red-500 hover:text-red-700 font-bold text-lg"
                        title="Delete broker split"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            
            {/* Totals Row */}
            <tfoot>
              <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
                <td className="py-3 px-3 text-gray-900">TOTALS</td>
                <td className="py-3 px-3 text-center text-blue-600">
                  {commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_origination_percent) || 0), 0
                  ).toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-right text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_origination_usd) || 0), 0
                  ).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-center text-blue-600">
                  {commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_site_percent) || 0), 0
                  ).toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-right text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_site_usd) || 0), 0
                  ).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-center text-blue-600">
                  {commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_deal_percent) || 0), 0
                  ).toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-right text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_deal_usd) || 0), 0
                  ).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-bold text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_broker_total) || 0), 0
                  ).toLocaleString()}
                </td>
                <td className="py-3 px-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-600 space-y-1">
        <p>• Split percentages are applied to AGCI: ${Number(deal.agci || 0).toLocaleString()}</p>
        <p>• These splits serve as templates for payment generation</p>
        <p>• Click on percentage values to edit them directly</p>
      </div>
    </div>
  );
};

export default CommissionSplitSection;