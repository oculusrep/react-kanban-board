import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Payment, Deal } from '../../lib/types';
import { formatDateString } from '../../utils/dateUtils';
import { supabase } from '../../lib/supabaseClient';
import PaymentAmountOverrideModal from './PaymentAmountOverrideModal';

interface PaymentSummaryRowProps {
  payment: Payment;
  deal: Deal;
  totalPayments: number;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onUpdatePayment: (updates: Partial<Payment>) => Promise<void>;
  onDeletePayment: () => void;
  onRefresh?: () => void;
}

const PaymentSummaryRow: React.FC<PaymentSummaryRowProps> = ({
  payment,
  deal,
  totalPayments,
  isExpanded,
  onToggleExpansion,
  onUpdatePayment,
  onDeletePayment,
  onRefresh
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [syncingToQB, setSyncingToQB] = useState(false);
  const [qbSyncMessage, setQbSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync payment to QuickBooks
  const handleSyncToQuickBooks = async () => {
    setSyncingToQB(true);
    setQbSyncMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setQbSyncMessage({ type: 'error', text: 'You must be logged in to sync' });
        setSyncingToQB(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            paymentId: payment.id,
            sendEmail: false,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync');
      }

      const envLabel = result.qbEnvironment === 'production' ? '' : ` (${result.qbEnvironment || 'sandbox'})`;
      const message = result.linked
        ? `Linked to invoice #${result.qbInvoiceNumber}${envLabel}`
        : `Invoice #${result.qbInvoiceNumber} created${envLabel}`;

      setQbSyncMessage({ type: 'success', text: message });
      if (onRefresh) onRefresh();
    } catch (error: any) {
      setQbSyncMessage({ type: 'error', text: error.message || 'Sync failed' });
    } finally {
      setSyncingToQB(false);
      // Clear message after 4 seconds
      setTimeout(() => setQbSyncMessage(null), 4000);
    }
  };

  // Sync due date changes to QuickBooks (if payment is already linked)
  const syncDueDateToQuickBooks = async (dueDate: string) => {
    // Only sync if payment is already linked to QB
    if (!(payment as any).qb_invoice_id) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-update-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ paymentId: payment.id, dueDate }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('Failed to sync due date to QB:', result.error);
        setQbSyncMessage({ type: 'error', text: `QB sync failed: ${result.error}` });
        setTimeout(() => setQbSyncMessage(null), 4000);
        return;
      }

      setQbSyncMessage({ type: 'success', text: 'Due date synced to QB' });
      setTimeout(() => setQbSyncMessage(null), 3000);
    } catch (error: any) {
      console.error('Error syncing due date to QB:', error);
    }
  };

  // Handle date change with QB sync
  const handleDateChange = async (newDate: string) => {
    await onUpdatePayment({ payment_date_estimated: newDate });
    // Sync to QB after updating OVIS
    if (newDate) {
      syncDueDateToQuickBooks(newDate);
    }
  };

  // DEBUG: Check payment date values
  console.log('📅 PaymentSummaryRow payment dates:', {
    id: payment.id,
    payment_sequence: payment.payment_sequence,
    payment_date_estimated: payment.payment_date_estimated,
    payment_received_date: payment.payment_received_date
  });

  // Use stored payment amount (respects overrides) as the source of truth
  const storedPaymentAmount = payment.payment_amount || 0;

  // Calculate what the amount would be without override (for comparison)
  const calculatedPaymentAmount = (deal.fee || 0) / (deal.number_of_payments || 1);

  const handleClearOverride = async () => {
    try {
      await onUpdatePayment({
        amount_override: false,
        override_at: null,
        override_by: null,
      } as any);
      setShowMenu(false);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Error clearing override:', error);
    }
  };

  return (
    <div className="p-4 grid grid-cols-12 items-center gap-4">
      {/* Expand Button + Payment Info - 3 cols */}
      <div className="col-span-3 flex items-center space-x-3">
        <button
          onClick={onToggleExpansion}
          className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-gray-500" />
          )}
        </button>
        
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900 truncate">
            Payment {payment.payment_sequence} of {totalPayments}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-1">
            ${storedPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {(payment as any).amount_override && (
              <span className="text-orange-600" title="Amount has been manually adjusted">🚩</span>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Number + QB Sync - 2 cols */}
      <div className="col-span-2">
        <div className={`text-xs ${payment.orep_invoice ? 'text-gray-500' : 'text-red-500'}`}>
          Invoice #
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={payment.orep_invoice || ''}
            onChange={(e) => onUpdatePayment({ orep_invoice: e.target.value || null })}
            placeholder="-"
            className="w-16 border-0 bg-transparent px-0 py-0 text-sm text-gray-900 focus:outline-none focus:ring-0 placeholder-gray-400 cursor-text"
          />
          {/* QB Sync Status/Button */}
          {(payment as any).qb_invoice_id ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700" title={`QB Invoice ID: ${(payment as any).qb_invoice_id}`}>
              <CheckCircleIcon className="w-3 h-3" />
              QB #{(payment as any).qb_invoice_number || (payment as any).qb_invoice_id}
            </span>
          ) : (
            <button
              onClick={handleSyncToQuickBooks}
              disabled={syncingToQB}
              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 disabled:opacity-50"
              title="Sync to QuickBooks"
            >
              {syncingToQB ? '...' : 'QB'}
            </button>
          )}
        </div>
        {/* QB Sync Message */}
        {qbSyncMessage && (
          <div className={`text-xs mt-1 ${qbSyncMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {qbSyncMessage.text}
          </div>
        )}
      </div>

      {/* Status - 2 cols */}
      <div className="col-span-2 flex items-center space-x-2">
        <input
          type="checkbox"
          checked={payment.payment_received || false}
          onChange={(e) => onUpdatePayment({ payment_received: e.target.checked })}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0"
        />
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
          payment.payment_received ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {payment.payment_received ? 'Received' : 'Pending'}
        </span>
      </div>

      {/* Date - 3 cols */}
      <div className="col-span-3">
        {payment.payment_received ? (
          // Show static paid date when payment is received
          <div className="w-full px-2 py-1 text-sm">
            <div className="font-medium text-green-800">
              Paid Date: {formatDateString(payment.payment_received_date)}
            </div>
          </div>
        ) : (
          // Show editable estimated date when payment is pending
          <div>
            {payment.payment_date_estimated && (
              <div className="text-xs text-gray-400 mb-1">
                Estimated Pmt Date
              </div>
            )}
            <input
              type="date"
              value={payment.payment_date_estimated || ''}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
              placeholder="Estimated payment date"
            />
            {!payment.payment_date_estimated && (
              <div className="text-xs text-gray-400 mt-1">
                Set estimated payment date
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions - 2 cols */}
      <div className="col-span-2 text-right relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="text-gray-400 hover:text-gray-600 focus:outline-none p-1"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        {showMenu && (
          <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
            <div className="py-1">
              <button
                onClick={() => {
                  setShowOverrideModal(true);
                  setShowMenu(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {(payment as any)?.amount_override ? '📝 Edit Override' : '🔧 Override Amount'}
              </button>
              {(payment as any)?.amount_override && (
                <button
                  onClick={handleClearOverride}
                  className="block w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-gray-100"
                >
                  🔓 Clear Override
                </button>
              )}
              <button
                onClick={() => {
                  onDeletePayment();
                  setShowMenu(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-gray-100"
              >
                🗑️ Delete Payment
              </button>
            </div>
          </div>
        )}
        {(payment as any)?.amount_override && (
          <span className="ml-2 text-xs text-orange-600" title="Amount has been manually adjusted">
            🚩
          </span>
        )}
      </div>

      {/* Override Modal */}
      <PaymentAmountOverrideModal
        isOpen={showOverrideModal}
        onClose={() => setShowOverrideModal(false)}
        paymentId={payment.id}
        currentAmount={payment.payment_amount}
        paymentSequence={payment.payment_sequence}
        dealName={deal.deal_name}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};

export default PaymentSummaryRow;