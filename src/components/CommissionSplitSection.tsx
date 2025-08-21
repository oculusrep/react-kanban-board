import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, CommissionSplit, Broker } from '../lib/types';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface CommissionSplitSectionProps {
  deal: Deal;
  onDealUpdate: (updatedDeal: Deal) => void;
}

// Table-friendly inline edit component
interface InlinePercentageEditProps {
  value: number | null;
  onChange: (value: number | null) => void;
  label?: string;
}

const InlinePercentageEdit: React.FC<InlinePercentageEditProps> = ({ value, onChange, label }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayValue = value ? `${value.toFixed(1)}%` : '0.0%';

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(value?.toString() || '0');
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
      <input
        type="number"
        step="0.1"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-16 px-1 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={handleStartEdit}
      className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded text-sm"
      title={`Click to edit ${label || 'percentage'}`}
    >
      {displayValue}
    </span>
  );
};

export const CommissionSplitSection: React.FC<CommissionSplitSectionProps> = ({
  deal,
  onDealUpdate
}) => {
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    splitId: string;
    brokerName: string;
  }>({
    isOpen: false,
    splitId: '',
    brokerName: ''
  });

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
  const calculateUsdAmounts = (percentage: number) => {
    const agci = Number(deal.agci) || 0;
    return agci * (percentage / 100);
  };

  // Update a commission split field
  const updateCommissionSplit = async (splitId: string, field: string, value: number | null) => {
    console.log('🔧 updateCommissionSplit called:', { splitId, field, value });
    
    try {
      // Find the current split
      const currentSplit = commissionSplits.find(s => s.id === splitId);
      if (!currentSplit) return;

      // Calculate new USD amounts
      const updatedSplit = { ...currentSplit };
      
      if (field === 'split_origination_percent') {
        updatedSplit.split_origination_percent = value || 0;
        updatedSplit.split_origination_usd = calculateUsdAmounts(value || 0);
      } else if (field === 'split_site_percent') {
        updatedSplit.split_site_percent = value || 0;
        updatedSplit.split_site_usd = calculateUsdAmounts(value || 0);
      } else if (field === 'split_deal_percent') {
        updatedSplit.split_deal_percent = value || 0;
        updatedSplit.split_deal_usd = calculateUsdAmounts(value || 0);
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

      console.log('✅ Commission split updated successfully');

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
    try {
      const { error } = await supabase
        .from('commission_split')
        .delete()
        .eq('id', splitId);

      if (error) {
        // Handle foreign key constraint error specifically
        if (error.code === '23503' && error.message.includes('payment_split')) {
          setError('Cannot delete this broker split because it has related payments. You must delete the payments first, or contact support to safely remove this split.');
          return;
        }
        throw error;
      }

      setCommissionSplits(prev => prev.filter(split => split.id === splitId ? false : true));
      setError(null); // Clear any previous errors
      setDeleteModal({ isOpen: false, splitId: '', brokerName: '' }); // Close modal
    } catch (err) {
      console.error('Error deleting broker split:', err);
      setError('Failed to delete broker split: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setDeleteModal({ isOpen: false, splitId: '', brokerName: '' }); // Close modal
    }
  };

  // Show delete confirmation modal
  const showDeleteConfirmation = (splitId: string, brokerName: string) => {
    setDeleteModal({
      isOpen: true,
      splitId,
      brokerName
    });
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    deleteBrokerSplit(deleteModal.splitId);
  };

  // Handle delete cancellation
  const handleDeleteCancel = () => {
    setDeleteModal({ isOpen: false, splitId: '', brokerName: '' });
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
                      <InlinePercentageEdit
                        value={split.split_origination_percent}
                        onChange={(value) => updateCommissionSplit(split.id, 'split_origination_percent', value)}
                        label="Origination %"
                      />
                    </td>
                    
                    {/* Origination USD - Calculated */}
                    <td className="py-3 px-3 text-right text-gray-600">
                      ${Number(split.split_origination_usd || 0).toFixed(2)}
                    </td>
                    
                    {/* Site Percentage - EDITABLE */}
                    <td className="py-3 px-3 text-center">
                      <InlinePercentageEdit
                        value={split.split_site_percent}
                        onChange={(value) => updateCommissionSplit(split.id, 'split_site_percent', value)}
                        label="Site %"
                      />
                    </td>
                    
                    {/* Site USD - Calculated */}
                    <td className="py-3 px-3 text-right text-gray-600">
                      ${Number(split.split_site_usd || 0).toFixed(2)}
                    </td>
                    
                    {/* Deal Percentage - EDITABLE */}
                    <td className="py-3 px-3 text-center">
                      <InlinePercentageEdit
                        value={split.split_deal_percent}
                        onChange={(value) => updateCommissionSplit(split.id, 'split_deal_percent', value)}
                        label="Deal %"
                      />
                    </td>
                    
                    {/* Deal USD - Calculated */}
                    <td className="py-3 px-3 text-right text-gray-600">
                      ${Number(split.split_deal_usd || 0).toFixed(2)}
                    </td>
                    
                    {/* Total USD - Calculated */}
                    <td className="py-3 px-3 text-right font-semibold text-gray-900">
                      ${Number(split.split_broker_total || 0).toFixed(2)}
                    </td>
                    
                    {/* Delete Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => showDeleteConfirmation(split.id, broker?.name || split.broker_name || 'Unknown Broker')}
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
                
                {/* Origination % Total with validation */}
                <td className="py-3 px-3 text-center">
                  {(() => {
                    const total = commissionSplits.reduce((sum, split) => 
                      sum + (Number(split.split_origination_percent) || 0), 0
                    );
                    const isValid = Math.abs(total - 100) < 0.1; // Allow small rounding differences
                    return (
                      <span className={isValid ? 'text-blue-600' : 'text-red-600'}>
                        {total.toFixed(1)}%
                      </span>
                    );
                  })()}
                </td>
                
                <td className="py-3 px-3 text-right text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_origination_usd) || 0), 0
                  ).toFixed(2)}
                </td>
                
                {/* Site % Total with validation */}
                <td className="py-3 px-3 text-center">
                  {(() => {
                    const total = commissionSplits.reduce((sum, split) => 
                      sum + (Number(split.split_site_percent) || 0), 0
                    );
                    const isValid = Math.abs(total - 100) < 0.1; // Allow small rounding differences
                    return (
                      <span className={isValid ? 'text-blue-600' : 'text-red-600'}>
                        {total.toFixed(1)}%
                      </span>
                    );
                  })()}
                </td>
                
                <td className="py-3 px-3 text-right text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_site_usd) || 0), 0
                  ).toFixed(2)}
                </td>
                
                {/* Deal % Total with validation */}
                <td className="py-3 px-3 text-center">
                  {(() => {
                    const total = commissionSplits.reduce((sum, split) => 
                      sum + (Number(split.split_deal_percent) || 0), 0
                    );
                    const isValid = Math.abs(total - 100) < 0.1; // Allow small rounding differences
                    return (
                      <span className={isValid ? 'text-blue-600' : 'text-red-600'}>
                        {total.toFixed(1)}%
                      </span>
                    );
                  })()}
                </td>
                
                <td className="py-3 px-3 text-right text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_deal_usd) || 0), 0
                  ).toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right font-bold text-blue-600">
                  ${commissionSplits.reduce((sum, split) => 
                    sum + (Number(split.split_broker_total) || 0), 0
                  ).toFixed(2)}
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

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModal.isOpen}
        title="Delete Broker Split"
        itemName={deleteModal.brokerName}
        itemType="commission split for"
        message="This action cannot be undone. If this broker has related payments, the deletion will be blocked."
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
};

export default CommissionSplitSection;