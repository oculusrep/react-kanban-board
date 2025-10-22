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

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleTogglePaid = async (paid: boolean) => {
    const { error } = await supabase
      .from('payment_split')
      .update({
        paid: paid,
        paid_date: paid ? getLocalDateString() : null,
      })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating payment split:', error);
      alert('Failed to update broker payment status');
    } else {
      onUpdate();
    }
  };

  const handleUpdatePaidDate = async (date: string) => {
    const { error } = await supabase
      .from('payment_split')
      .update({ paid_date: date })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating paid date:', error);
      alert('Failed to update paid date');
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
            <input
              type="date"
              value={split.paid_date}
              onChange={(e) => handleUpdatePaidDate(e.target.value)}
              className="text-gray-500 text-xs border-0 p-0 focus:ring-0 cursor-pointer hover:text-gray-700"
              style={{ width: '90px' }}
            />
          )}
        </div>
      </td>
    </tr>
  );
};

export default BrokerPaymentRow;
