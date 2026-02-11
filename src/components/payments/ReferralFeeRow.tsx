// Referral Fee Row with Paid Checkbox and QBO Bill Creation
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

interface QBReferralResult {
  success: boolean;
  message?: string;
  qbEntityId?: string;
  qbDocNumber?: string;
  amount?: number;
  referralPayee?: string;
  error?: string;
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
  const [isCreatingQBEntry, setIsCreatingQBEntry] = useState(false);

  // Sync with props when they change
  useEffect(() => {
    setLocalPaid(paid);
    setLocalPaidDate(paidDate);
  }, [paid, paidDate]);

  // Create QBO Bill for referral fee when marking as paid
  const createQBReferralEntry = async (paidDate: string): Promise<QBReferralResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-create-referral-entry', {
        body: {
          paymentId: paymentId,
          paidDate: paidDate,
        },
      });

      if (error) {
        console.error('QBO referral entry error:', error);
        return { success: false, error: error.message };
      }

      return data as QBReferralResult;
    } catch (err) {
      console.error('QBO referral entry exception:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

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
      return;
    }

    // If marking as paid, create QBO Bill for the referral fee
    if (isPaid && newDate) {
      setIsCreatingQBEntry(true);
      const result = await createQBReferralEntry(newDate);
      setIsCreatingQBEntry(false);

      if (result.success) {
        console.log(`Created QBO Bill #${result.qbDocNumber} for referral fee to ${result.referralPayee}`);
      } else if (result.error?.includes('No referral payee')) {
        // No referral payee set on deal - this is expected for deals without referral fees
        console.log('No referral payee set on this deal - skipping QBO bill');
      } else if (result.error?.includes('No QuickBooks commission mapping configured')) {
        // No mapping configured - warn but don't block
        console.warn(`No QBO mapping for referral partner: ${result.error}`);
      } else if (result.error?.includes('QuickBooks is not connected')) {
        // QBO not connected - silent fail, just log
        console.log('QuickBooks not connected - skipping referral fee bill');
      } else if (result.error?.includes('Referral fee amount is 0')) {
        // No referral fee amount - expected for some deals
        console.log('Referral fee amount is 0 - skipping QBO bill');
      } else {
        // Other error - log but don't block the paid status update
        console.error('Failed to create QBO referral entry:', result.error);
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
            disabled={isCreatingQBEntry}
            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded disabled:opacity-50"
          />
          {isCreatingQBEntry && (
            <span className="text-xs text-blue-600 animate-pulse">Syncing to QBO...</span>
          )}
          {localPaid && localPaidDate && !isCreatingQBEntry ? (
            <input
              type="date"
              value={localPaidDate}
              onChange={(e) => handleUpdatePaidDate(e.target.value)}
              className="text-gray-500 text-xs border-0 p-0 focus:ring-0 cursor-pointer hover:text-gray-700"
              style={{ width: '90px' }}
            />
          ) : !isCreatingQBEntry ? (
            <span className="text-sm text-gray-500">
              {localPaid ? 'Paid' : 'Mark as Paid'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ReferralFeeRow;
