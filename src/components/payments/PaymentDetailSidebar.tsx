// Payment Detail Sidebar
// src/components/payments/PaymentDetailSidebar.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentDashboardRow } from '../../types/payment-dashboard';
import { supabase } from '../../lib/supabaseClient';

interface PaymentDetailSidebarProps {
  payment: PaymentDashboardRow | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const PaymentDetailSidebar: React.FC<PaymentDetailSidebarProps> = ({
  payment,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const navigate = useNavigate();
  const [syncingToQB, setSyncingToQB] = useState(false);
  const [qbSyncMessage, setQbSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Clear message when payment changes
  useEffect(() => {
    setQbSyncMessage(null);
  }, [payment?.payment_id]);

  const handleSyncToQuickBooks = async (sendEmail: boolean = false) => {
    if (!payment) return;

    setSyncingToQB(true);
    setQbSyncMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setQbSyncMessage({ type: 'error', text: 'You must be logged in to sync to QuickBooks' });
        return;
      }

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-invoice`;
      console.log('QuickBooks sync - URL:', functionUrl);
      console.log('QuickBooks sync - Payment ID:', payment.payment_id);

      const response = await fetch(
        functionUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            paymentId: payment.payment_id,
            sendEmail
          })
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        setQbSyncMessage({ type: 'error', text: result.error || 'Failed to sync invoice' });
        return;
      }

      setQbSyncMessage({
        type: 'success',
        text: result.emailSent
          ? `Invoice ${result.qbInvoiceNumber} created and sent!`
          : `Invoice ${result.qbInvoiceNumber} created in QuickBooks`
      });

      // Refresh the data
      onUpdate();
    } catch (error: any) {
      console.error('QuickBooks sync error:', error);
      setQbSyncMessage({ type: 'error', text: error.message || 'Failed to sync to QuickBooks' });
    } finally {
      setSyncingToQB(false);
    }
  };

  if (!payment) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[600px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
              <p className="text-sm text-gray-500 mt-1">
                Payment {payment.payment_sequence} of {payment.total_payments}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Deal Information */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Deal Information
              </h3>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <button
                  onClick={() => {
                    navigate(`/deal/${payment.deal_id}?tab=payments`);
                    onClose();
                  }}
                  className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {payment.deal_name}
                </button>
                <div className="mt-2 text-sm text-gray-600">
                  Deal ID: {payment.deal_id.substring(0, 8)}...
                </div>
              </div>
            </div>

            {/* Payment Amount */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Payment Amount
              </h3>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <div className="text-4xl font-bold text-gray-900">
                  {formatCurrency(payment.payment_amount)}
                </div>
                <div className="text-sm text-gray-600 mt-2">
                  Payment {payment.payment_sequence} of {payment.total_payments}
                </div>
              </div>
            </div>

            {/* Payment Dates */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Payment Dates
              </h3>
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Estimated Date</span>
                  <span className="text-sm text-gray-900">
                    {formatDate(payment.payment_date_estimated)}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Received Date</span>
                  <span className="text-sm text-gray-900">
                    {formatDate(payment.payment_received_date)}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  {payment.payment_received ? (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Received
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Broker Commission Breakdown */}
            {payment.broker_splits.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Broker Commissions ({payment.broker_splits.length})
                </h3>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {payment.broker_splits.map((split) => (
                    <div
                      key={split.payment_split_id}
                      className="p-4 border-b border-gray-200 last:border-b-0"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-semibold text-gray-900">{split.broker_name}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {split.paid ? (
                              <span className="text-green-600">✓ Paid</span>
                            ) : (
                              <span className="text-red-600">Unpaid</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">
                            {formatCurrency(split.split_broker_total)}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-blue-50 rounded p-2">
                          <div className="text-gray-600">Origination</div>
                          <div className="font-semibold text-gray-900 mt-1">
                            {formatCurrency(split.split_origination_usd)}
                          </div>
                        </div>
                        <div className="bg-green-50 rounded p-2">
                          <div className="text-gray-600">Site</div>
                          <div className="font-semibold text-gray-900 mt-1">
                            {formatCurrency(split.split_site_usd)}
                          </div>
                        </div>
                        <div className="bg-purple-50 rounded p-2">
                          <div className="text-gray-600">Deal</div>
                          <div className="font-semibold text-gray-900 mt-1">
                            {formatCurrency(split.split_deal_usd)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-700">Total Broker Commissions</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(payment.total_broker_amount)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Referral Fee */}
            {payment.referral_fee_usd && payment.referral_fee_usd > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Referral Fee
                </h3>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {payment.referral_payee_name || 'Unknown Payee'}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {payment.referral_fee_paid ? (
                          <span className="text-green-600">✓ Paid</span>
                        ) : (
                          <span className="text-red-600">Unpaid</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">
                        {formatCurrency(payment.referral_fee_usd)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* QuickBooks Integration */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                QuickBooks
              </h3>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                {payment.qb_invoice_id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Synced
                      </span>
                      <span className="text-sm text-gray-600">
                        Invoice #{payment.qb_invoice_number || payment.qb_invoice_id}
                      </span>
                    </div>
                    {payment.qb_last_sync && (
                      <div className="text-xs text-gray-500">
                        Last synced: {formatDate(payment.qb_last_sync)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                        Not Synced
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSyncToQuickBooks(false)}
                        disabled={syncingToQB}
                        className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {syncingToQB ? 'Syncing...' : 'Create Invoice'}
                      </button>
                      <button
                        onClick={() => handleSyncToQuickBooks(true)}
                        disabled={syncingToQB}
                        className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {syncingToQB ? 'Syncing...' : 'Create & Send'}
                      </button>
                    </div>
                  </div>
                )}
                {qbSyncMessage && (
                  <div className={`mt-3 p-2 rounded text-sm ${
                    qbSyncMessage.type === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {qbSyncMessage.text}
                  </div>
                )}
              </div>
            </div>

            {/* Payment Summary */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Payment Summary
              </h3>
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm text-gray-700">Payment Amount</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(payment.payment_amount)}
                  </span>
                </div>
                {payment.referral_fee_usd && (
                  <div className="p-4 flex justify-between items-center">
                    <span className="text-sm text-gray-700">Referral Fee</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(payment.referral_fee_usd)}
                    </span>
                  </div>
                )}
                <div className="p-4 flex justify-between items-center">
                  <span className="text-sm text-gray-700">Total Broker Commissions</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(payment.total_broker_amount)}
                  </span>
                </div>
                <div className="p-4 flex justify-between items-center bg-gray-50">
                  <span className="text-sm font-semibold text-gray-900">Payout Status</span>
                  {payment.all_brokers_paid &&
                  (!payment.referral_fee_usd || payment.referral_fee_paid) ? (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Fully Paid
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  navigate(`/deal/${payment.deal_id}?tab=payments`);
                  onClose();
                }}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                View Deal Details
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors font-medium text-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PaymentDetailSidebar;
