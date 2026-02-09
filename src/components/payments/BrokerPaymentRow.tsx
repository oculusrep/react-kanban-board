// Broker Payment Row with Paid Checkbox
// src/components/payments/BrokerPaymentRow.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BrokerPaymentSplit } from '../../types/payment-dashboard';

interface BrokerPaymentRowProps {
  split: BrokerPaymentSplit;
  paymentId: string;
  onUpdate: () => void;
  onOptimisticUpdate?: (splitId: string, updates: { paid?: boolean; paid_date?: string | null }) => void;
}

interface QBCommissionResult {
  success: boolean;
  message?: string;
  qbEntityType?: 'Bill' | 'JournalEntry';
  qbDocNumber?: string;
  alreadyExists?: boolean;
  notFound?: boolean;
  error?: string;
}

const BrokerPaymentRow: React.FC<BrokerPaymentRowProps> = ({ split, paymentId, onUpdate, onOptimisticUpdate }) => {
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
  const [isCreatingQBEntry, setIsCreatingQBEntry] = useState(false);

  // Sync with props when they change
  useEffect(() => {
    setLocalPaid(split.paid);
    setLocalPaidDate(split.paid_date);
  }, [split.paid, split.paid_date]);

  // Create QBO commission entry (Bill or Journal Entry) when marking as paid
  const createQBCommissionEntry = async (paidDate: string): Promise<QBCommissionResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-create-commission-entry', {
        body: {
          paymentSplitId: split.payment_split_id,
          paidDate: paidDate,
        },
      });

      if (error) {
        console.error('QBO commission entry error:', error);
        return { success: false, error: error.message };
      }

      return data as QBCommissionResult;
    } catch (err) {
      console.error('QBO commission entry exception:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  // Delete QBO commission entry (Bill or Journal Entry) when unmarking as paid
  const deleteQBCommissionEntry = async (): Promise<QBCommissionResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-delete-commission-entry', {
        body: {
          paymentSplitId: split.payment_split_id,
        },
      });

      if (error) {
        console.error('QBO commission delete error:', error);
        return { success: false, error: error.message };
      }

      return data as QBCommissionResult;
    } catch (err) {
      console.error('QBO commission delete exception:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  const handleTogglePaid = async (paid: boolean) => {
    const newDate = paid ? getLocalDateString() : null;

    // Optimistic update locally
    setLocalPaid(paid);
    setLocalPaidDate(newDate);

    // Update parent's local state for smooth UI
    if (onOptimisticUpdate) {
      onOptimisticUpdate(split.payment_split_id, { paid, paid_date: newDate });
    }

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
      if (onOptimisticUpdate) {
        onOptimisticUpdate(split.payment_split_id, { paid: split.paid, paid_date: split.paid_date });
      }
      return;
    }

    // If marking as paid, create QBO commission entry (Bill or Journal Entry)
    if (paid && newDate) {
      setIsCreatingQBEntry(true);
      const result = await createQBCommissionEntry(newDate);
      setIsCreatingQBEntry(false);

      if (result.success) {
        if (result.alreadyExists) {
          // Entry already exists, no action needed
          console.log('QBO commission entry already exists for this payment split');
        } else {
          // Show success message
          const entryType = result.qbEntityType === 'Bill' ? 'Bill' : 'Journal Entry';
          console.log(`Created QBO ${entryType} #${result.qbDocNumber} for ${split.broker_name}`);
        }
      } else if (result.error?.includes('No QuickBooks commission mapping configured')) {
        // No mapping configured - this is expected for brokers without QBO setup
        console.log(`No QBO mapping for ${split.broker_name} - skipping commission entry`);
      } else if (result.error?.includes('QuickBooks is not connected')) {
        // QBO not connected - silent fail, just log
        console.log('QuickBooks not connected - skipping commission entry');
      } else {
        // Other error - log but don't block the paid status update
        console.error('Failed to create QBO commission entry:', result.error);
      }
    }

    // If unmarking as paid, delete the QBO commission entry (Bill or Journal Entry)
    if (!paid) {
      setIsCreatingQBEntry(true);
      const result = await deleteQBCommissionEntry();
      setIsCreatingQBEntry(false);

      if (result.success) {
        if (result.notFound) {
          // No entry to delete, which is fine
          console.log('No QBO commission entry to delete for this payment split');
        } else {
          // Show success message
          const entryType = result.qbEntityType === 'Bill' ? 'Bill' : 'Journal Entry';
          console.log(`Deleted QBO ${entryType} #${result.qbDocNumber} for ${split.broker_name}`);
        }
      } else {
        // Error deleting - log but don't block the unpaid status update
        console.error('Failed to delete QBO commission entry:', result.error);
      }
    }
  };

  const handleUpdatePaidDate = async (date: string) => {
    // Optimistic update locally
    setLocalPaidDate(date);

    // Update parent's local state for smooth UI
    if (onOptimisticUpdate) {
      onOptimisticUpdate(split.payment_split_id, { paid_date: date });
    }

    const { error } = await supabase
      .from('payment_split')
      .update({ paid_date: date })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating paid date:', error);
      alert('Failed to update paid date');
      // Revert on error
      setLocalPaidDate(split.paid_date);
      if (onOptimisticUpdate) {
        onOptimisticUpdate(split.payment_split_id, { paid_date: split.paid_date });
      }
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
            disabled={isCreatingQBEntry}
            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded disabled:opacity-50"
          />
          {isCreatingQBEntry && (
            <span className="text-xs text-blue-600 animate-pulse">Syncing to QBO...</span>
          )}
          {localPaid && localPaidDate && !isCreatingQBEntry && (
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
