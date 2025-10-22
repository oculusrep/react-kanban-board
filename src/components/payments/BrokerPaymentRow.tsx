// Broker Payment Row with Paid Checkbox
// src/components/payments/BrokerPaymentRow.tsx

import React, { useState, useEffect } from 'react';
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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent: number | null) => {
    if (percent === null) return '';
    return `${Math.round(percent)}%`;
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

  const [localPaid, setLocalPaid] = useState(split.paid);
  const [localPaidDate, setLocalPaidDate] = useState(split.paid_date);

  // Sync with props when they change
  useEffect(() => {
    setLocalPaid(split.paid);
    setLocalPaidDate(split.paid_date);
  }, [split.paid, split.paid_date]);

  const handleTogglePaid = async (paid: boolean) => {
    const newDate = paid ? getLocalDateString() : null;

    // Optimistic update
    setLocalPaid(paid);
    setLocalPaidDate(newDate);

    const { error } = await supabase
      .from('payment_split')
      .update({
        paid: paid,
        paid_date: newDate,
      })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating payment split:', error);
      alert('Failed to update broker payment status');
      // Revert on error
      setLocalPaid(split.paid);
      setLocalPaidDate(split.paid_date);
    }
  };

  const handleUpdatePaidDate = async (date: string) => {
    // Optimistic update
    setLocalPaidDate(date);

    const { error } = await supabase
      .from('payment_split')
      .update({ paid_date: date })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating paid date:', error);
      alert('Failed to update paid date');
      // Revert on error
      setLocalPaidDate(split.paid_date);
    }
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-2 py-2 text-sm text-gray-900">{split.broker_name}</td>
      <td className="px-2 py-2 text-sm text-center">
        <div className="flex flex-col items-center">
          <span className="text-gray-900">{formatCurrency(split.split_origination_usd)}</span>
          <span className="text-xs text-gray-500">{formatPercent(split.split_origination_percent)}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-sm text-center">
        <div className="flex flex-col items-center">
          <span className="text-gray-900">{formatCurrency(split.split_site_usd)}</span>
          <span className="text-xs text-gray-500">{formatPercent(split.split_site_percent)}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-sm text-center">
        <div className="flex flex-col items-center">
          <span className="text-gray-900">{formatCurrency(split.split_deal_usd)}</span>
          <span className="text-xs text-gray-500">{formatPercent(split.split_deal_percent)}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-sm text-center font-medium text-gray-900">
        {formatCurrency(split.split_broker_total)}
      </td>
      <td className="px-2 py-2 text-sm">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={localPaid}
            onChange={(e) => handleTogglePaid(e.target.checked)}
            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
          />
          {localPaid && localPaidDate && (
            <input
              type="date"
              value={localPaidDate}
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
