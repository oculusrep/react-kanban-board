// Broker Payment Row with Paid Checkbox
// src/components/payments/BrokerPaymentRow.tsx

import React from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BrokerPaymentSplit } from '../../types/payment-dashboard';

interface BrokerPaymentRowProps {
  split: BrokerPaymentSplit;
  onUpdate: () => void;
}

const BrokerPaymentRow: React.FC<BrokerPaymentRowProps> = ({ split, onUpdate }) => {
  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleTogglePaid = async (paid: boolean) => {
    const { error } = await supabase
      .from('payment_split')
      .update({
        paid: paid,
        paid_date: paid ? new Date().toISOString().split('T')[0] : null,
      })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating payment split:', error);
      alert('Failed to update broker payment status');
    } else {
      onUpdate();
    }
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">{split.broker_name}</td>
      <td className="px-4 py-3 text-sm text-right text-gray-600">
        {formatCurrency(split.split_origination_usd)}
      </td>
      <td className="px-4 py-3 text-sm text-right text-gray-600">
        {formatCurrency(split.split_site_usd)}
      </td>
      <td className="px-4 py-3 text-sm text-right text-gray-600">
        {formatCurrency(split.split_deal_usd)}
      </td>
      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
        {formatCurrency(split.split_broker_total)}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={split.paid}
            onChange={(e) => handleTogglePaid(e.target.checked)}
            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
          />
          {split.paid && split.paid_date && (
            <span className="text-xs text-gray-500">{formatDate(split.paid_date)}</span>
          )}
        </div>
      </td>
    </tr>
  );
};

export default BrokerPaymentRow;
