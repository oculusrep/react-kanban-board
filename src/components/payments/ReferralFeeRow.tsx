// Referral Fee Row with Paid Checkbox
// src/components/payments/ReferralFeeRow.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface ReferralFeeRowProps {
  paymentId: string;
  payeeName: string;
  amount: number;
  paid: boolean;
  paidDate: string | null;
  onUpdate: () => void;
  onOptimisticUpdate?: (updates: { referral_fee_paid?: boolean; referral_fee_paid_date?: string | null }) => void;
}

const ReferralFeeRow: React.FC<ReferralFeeRowProps> = ({
  paymentId,
  payeeName,
  amount,
  paid,
  paidDate,
  onUpdate,
  onOptimisticUpdate,
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

  const [localPaid, setLocalPaid] = useState(paid);
  const [localPaidDate, setLocalPaidDate] = useState(paidDate);

  // Sync with props when they change
  useEffect(() => {
    setLocalPaid(paid);
    setLocalPaidDate(paidDate);
  }, [paid, paidDate]);

  const handleTogglePaid = async (isPaid: boolean) => {
    const newDate = isPaid ? getLocalDateString() : null;

    // Optimistic update locally
    setLocalPaid(isPaid);
    setLocalPaidDate(newDate);

    // Update parent's local state for smooth UI
    if (onOptimisticUpdate) {
      onOptimisticUpdate({ referral_fee_paid: isPaid, referral_fee_paid_date: newDate });
    }

    const { error } = await supabase
      .from('payment')
      .update({
        referral_fee_paid: isPaid,
        referral_fee_paid_date: newDate,
      })
      .eq('id', paymentId);

    if (error) {
      console.error('Error updating referral fee payment:', error);
      alert('Failed to update referral fee payment status');
      // Revert on error
      setLocalPaid(paid);
      setLocalPaidDate(paidDate);
      if (onOptimisticUpdate) {
        onOptimisticUpdate({ referral_fee_paid: paid, referral_fee_paid_date: paidDate });
      }
    }
  };

  const handleUpdatePaidDate = async (date: string) => {
    // Optimistic update locally
    setLocalPaidDate(date);

    // Update parent's local state for smooth UI
    if (onOptimisticUpdate) {
      onOptimisticUpdate({ referral_fee_paid_date: date });
    }

    const { error } = await supabase
      .from('payment')
      .update({ referral_fee_paid_date: date })
      .eq('id', paymentId);

    if (error) {
      console.error('Error updating referral fee paid date:', error);
      alert('Failed to update paid date');
      // Revert on error
      setLocalPaidDate(paidDate);
      if (onOptimisticUpdate) {
        onOptimisticUpdate({ referral_fee_paid_date: paidDate });
      }
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Payee: {payeeName}</p>
              <p className="text-sm text-gray-500">Referral Fee</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-gray-900">{formatCurrency(amount)}</p>
            </div>
          </div>
        </div>
        <div className="ml-6 flex items-center space-x-2">
          <input
            type="checkbox"
            checked={localPaid}
            onChange={(e) => handleTogglePaid(e.target.checked)}
            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
          />
          {localPaid && localPaidDate ? (
            <input
              type="date"
              value={localPaidDate}
              onChange={(e) => handleUpdatePaidDate(e.target.value)}
              className="text-gray-500 text-xs border-0 p-0 focus:ring-0 cursor-pointer hover:text-gray-700"
              style={{ width: '90px' }}
            />
          ) : (
            <span className="text-sm text-gray-500">
              {localPaid ? 'Paid' : 'Mark as Paid'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferralFeeRow;
