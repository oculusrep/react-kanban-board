import React, { useState } from 'react';
import { Payment, PaymentSplit, Broker, Deal, Client, CommissionSplit } from '../../lib/types';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import BrokerSplitEditor from '../BrokerSplitEditor';
import PaymentDetails from './PaymentDetails';
import PaymentCheckProcessing from './PaymentCheckProcessing';
import { usePaymentSplitValidation } from '../../hooks/usePaymentSplitValidation';
import { usePaymentSplitCalculations } from '../../hooks/usePaymentSplitCalculations';
import { usePaymentDisbursement } from '../../hooks/usePaymentDisbursement';
import { supabase } from '../../lib/supabaseClient';
import { deleteQBInvoice } from '../../services/quickbooksService';

interface PaymentDetailPanelProps {
  payment: Payment;
  splits: PaymentSplit[];
  brokers: Broker[];
  clients?: Client[];
  commissionSplits?: CommissionSplit[];
  dealAmounts: { origination_usd?: number; site_usd?: number; deal_usd?: number };
  deal: Deal;
  onSplitPercentageChange: (splitId: string, field: string, value: number | null) => void;
  onUpdatePayment: (updates: Partial<Payment>) => Promise<void>;
  onUpdatePaymentSplit?: (splitId: string, field: string, value: any) => Promise<void>;
  onRefresh?: () => void;
}

const PaymentDetailPanel: React.FC<PaymentDetailPanelProps> = ({
  payment,
  splits,
  brokers,
  clients,
  commissionSplits,
  dealAmounts,
  deal,
  onSplitPercentageChange,
  onUpdatePayment,
  onUpdatePaymentSplit,
  onRefresh
}) => {
  const [paymentDetailsExpanded, setPaymentDetailsExpanded] = useState(false);
  const [syncingToQB, setSyncingToQB] = useState(false);
  const [deletingFromQB, setDeletingFromQB] = useState(false);
  const [qbSyncMessage, setQbSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getBrokerName = (brokerId: string) => {
    const broker = brokers.find(b => b.id === brokerId);
    return broker ? broker.name : 'Unknown Broker';
  };

  const getReferralPayeeName = () => {
    if (!deal.referral_payee_client_id) return null;
    const client = clients?.find(c => c.id === deal.referral_payee_client_id);
    return client?.client_name || null;
  };

  // Validate required fields for QuickBooks invoice creation
  const validateInvoiceFields = (): string[] => {
    const errors: string[] = [];

    if (!deal.bill_to_company_name) {
      errors.push('Bill-To Company is required');
    }
    if (!deal.bill_to_contact_name) {
      errors.push('Bill-To Contact Name is required');
    }
    if (!deal.bill_to_email) {
      errors.push('Invoice Email is required');
    }
    if (!payment.payment_amount || payment.payment_amount <= 0) {
      errors.push('Payment Amount must be greater than 0');
    }
    if (!payment.payment_date_estimated) {
      errors.push('Estimated Payment Date is required');
    }

    return errors;
  };

  // QuickBooks sync functions
  const handleSyncToQuickBooks = async (sendEmail: boolean = false, forceResync: boolean = false) => {
    // Validate required fields before syncing
    const validationErrors = validateInvoiceFields();
    if (validationErrors.length > 0) {
      setQbSyncMessage({
        type: 'error',
        text: `Missing required fields: ${validationErrors.join(', ')}. Please fill in the Bill-To Information section above.`
      });
      return;
    }

    setSyncingToQB(true);
    setQbSyncMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setQbSyncMessage({ type: 'error', text: 'You must be logged in to sync to QuickBooks' });
        setSyncingToQB(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/quickbooks-sync-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey
        },
        body: JSON.stringify({
          paymentId: payment.id,
          sendEmail,
          forceResync
        })
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        setQbSyncMessage({ type: 'error', text: result?.error || 'Failed to sync invoice' });
        return;
      }

      const envLabel = result.qbEnvironment === 'production' ? '' : ` (${result.qbEnvironment || 'sandbox'})`;
      const action = result.wasUpdate ? 'updated' : (result.linked ? 'linked' : 'created');
      setQbSyncMessage({
        type: 'success',
        text: result.emailSent
          ? `Invoice #${result.qbInvoiceNumber} ${action} and sent${envLabel}`
          : `Invoice #${result.qbInvoiceNumber} ${action}${envLabel}`
      });

      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('QuickBooks sync error:', error);
      setQbSyncMessage({ type: 'error', text: error.message || 'Failed to sync to QuickBooks' });
    } finally {
      setSyncingToQB(false);
      setTimeout(() => setQbSyncMessage(null), 5000);
    }
  };

  const handleSendQBInvoice = async () => {
    setSyncingToQB(true);
    setQbSyncMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setQbSyncMessage({ type: 'error', text: 'You must be logged in' });
        setSyncingToQB(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/quickbooks-send-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey
        },
        body: JSON.stringify({ paymentId: payment.id })
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        setQbSyncMessage({ type: 'error', text: result?.error || 'Failed to send invoice' });
        return;
      }

      setQbSyncMessage({ type: 'success', text: result.message || 'Invoice sent!' });
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('Send invoice error:', error);
      setQbSyncMessage({ type: 'error', text: error.message || 'Failed to send invoice' });
    } finally {
      setSyncingToQB(false);
      setTimeout(() => setQbSyncMessage(null), 5000);
    }
  };

  const handleDeleteFromQuickBooks = async () => {
    if (!window.confirm('Are you sure you want to delete this invoice from QuickBooks? This action cannot be undone.')) {
      return;
    }

    setDeletingFromQB(true);
    setQbSyncMessage(null);

    try {
      const result = await deleteQBInvoice(payment.id);

      if (!result.success) {
        setQbSyncMessage({ type: 'error', text: result.error || 'Failed to delete invoice' });
        return;
      }

      setQbSyncMessage({ type: 'success', text: result.message || 'Invoice deleted from QuickBooks' });
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('QuickBooks delete error:', error);
      setQbSyncMessage({ type: 'error', text: error.message || 'Failed to delete invoice' });
    } finally {
      setDeletingFromQB(false);
      setTimeout(() => setQbSyncMessage(null), 5000);
    }
  };

  const formatQBSyncDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Use AGCI directly from the payment record (calculated by database trigger)
  const paymentAGCI = payment.agci || 0;
  const calculatedSplits = usePaymentSplitCalculations(
    splits, 
    dealAmounts, 
    deal, 
    payment.payment_amount || 0
  );
  const validationTotals = usePaymentSplitValidation(calculatedSplits);

  // Disbursement functionality
  const {
    updateReferralPaid,
    updateReferralPaidDate,
    updatePaymentSplitPaid,
    updatePaymentSplitPaidDate
  } = usePaymentDisbursement();

  const handleUpdateReferralPaid = async (paymentId: string, paid: boolean) => {
    try {
      await updateReferralPaid(paymentId, paid);

      // Update the parent's payment state to reflect the change
      if (onUpdatePayment) {
        const updates: Partial<Payment> = {
          referral_fee_paid: paid,
          referral_fee_paid_date: paid ? new Date().toISOString() : null
        };
        await onUpdatePayment(updates);
        console.log('✅ Referral fee paid status updated, parent state refreshed');
      }

    } catch (error) {
      console.error('Error updating referral payment status:', error);
      // TODO: Add user-friendly error handling
    }
  };

  const handleUpdatePaymentSplitPaid = async (splitId: string, paid: boolean) => {
    try {
      await updatePaymentSplitPaid(splitId, paid);

      // Update the parent's payment split state to reflect the change
      if (onUpdatePaymentSplit) {
        // Update paid status
        await onUpdatePaymentSplit(splitId, 'paid', paid);
        // Update paid_date (will be set to today's date or null)
        const today = paid ? (() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })() : null;
        await onUpdatePaymentSplit(splitId, 'paid_date', today);
        console.log('✅ Payment split paid status updated, parent state refreshed');
      }

    } catch (error) {
      console.error('Error updating payment split status:', error);
      // TODO: Add user-friendly error handling
    }
  };

  const handleUpdatePaymentSplitPaidDate = async (splitId: string, date: string) => {
    try {
      await updatePaymentSplitPaidDate(splitId, date);

      // Update the parent's payment split state to reflect the change
      if (onUpdatePaymentSplit) {
        await onUpdatePaymentSplit(splitId, 'paid_date', date);
        console.log('✅ Payment split paid date updated, parent state refreshed');
      }

    } catch (error) {
      console.error('Error updating payment split paid date:', error);
    }
  };

  const handleUpdateReferralPaidDate = async (date: string) => {
    try {
      await updateReferralPaidDate(payment.id, date);

      // Update the parent's payment state
      if (onUpdatePayment) {
        await onUpdatePayment({ referral_fee_paid_date: date });
        console.log('✅ Referral fee paid date updated, parent state refreshed');
      }

    } catch (error) {
      console.error('Error updating referral paid date:', error);
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white">
      {/* Commission Breakdown Section */}
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h4 className="text-base font-medium text-gray-900">Commission Breakdown</h4>
          <p className="text-xs text-gray-600 mt-1">
            Payment #{payment.payment_sequence} • AGCI: ${paymentAGCI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Payment Check Processing */}
        <PaymentCheckProcessing
          paymentReceived={payment.payment_received || false}
          paymentReceivedDate={payment.payment_received_date || null}
          invoiceSent={payment.invoice_sent || false}
          invoiceDate={payment.payment_invoice_date || null}
          onUpdateField={(field, value) => {
            onUpdatePayment({ [field]: value });
          }}
        />

        {/* QuickBooks Sync Section */}
        <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-gray-900">QuickBooks Invoice</h5>
            {payment.qb_invoice_id ? (
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Synced
                </span>
                <span className="text-sm text-gray-700">
                  Invoice #{payment.qb_invoice_number}
                </span>
                {payment.invoice_sent && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    Sent
                  </span>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => handleSyncToQuickBooks(false)}
                  disabled={syncingToQB}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncingToQB ? 'Syncing...' : 'Create Invoice'}
                </button>
                <button
                  onClick={() => handleSyncToQuickBooks(true)}
                  disabled={syncingToQB}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncingToQB ? 'Syncing...' : 'Create & Send'}
                </button>
              </div>
            )}
          </div>
          {/* Action buttons when invoice is synced */}
          {payment.qb_invoice_id && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => handleSyncToQuickBooks(false, true)}
                disabled={syncingToQB}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Update the invoice in QuickBooks with current OVIS data"
              >
                {syncingToQB ? 'Syncing...' : 'Resync Invoice'}
              </button>
              {!payment.invoice_sent && (
                <button
                  onClick={handleSendQBInvoice}
                  disabled={syncingToQB}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {syncingToQB ? 'Sending...' : 'Send Invoice'}
                </button>
              )}
              <button
                onClick={handleDeleteFromQuickBooks}
                disabled={deletingFromQB || syncingToQB}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Delete this invoice from QuickBooks"
              >
                {deletingFromQB ? 'Deleting...' : 'Delete Invoice'}
              </button>
              {payment.qb_last_sync && (
                <span className="text-xs text-gray-500 ml-auto">
                  Last synced {formatQBSyncDate(payment.qb_last_sync)}
                </span>
              )}
            </div>
          )}
          {qbSyncMessage && (
            <div className={`mt-2 p-2 rounded text-xs ${
              qbSyncMessage.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {qbSyncMessage.text}
            </div>
          )}
        </div>

        {/* Broker Split Cards or No Broker Split Section */}
        <div className="space-y-4">
          {splits.length === 0 ? (
            /* No Broker Split Section - shown when there are no broker commission splits */
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900">
                      No Broker Split
                    </h5>
                    <p className="text-xs text-gray-600 mt-1">
                      Deal-level commission (AGCI)
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-blue-900">
                    ${paymentAGCI.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Broker Split Cards - shown when there are broker commission splits */
            calculatedSplits.map((split) => (
              <BrokerSplitEditor
                key={split.id}
                split={split}
                brokerName={getBrokerName(split.broker_id)}
                paymentAmount={payment.payment_amount || 0}
                onPercentageChange={(field, value) => onSplitPercentageChange(split.id, field, value)}
                validationTotals={validationTotals}
                onPaidChange={handleUpdatePaymentSplitPaid}
                onPaidDateChange={handleUpdatePaymentSplitPaidDate}
              />
            ))
          )}

          {/* Referral Fee Row - only show if payment has referral fee amount */}
          {deal.referral_fee_usd && deal.referral_fee_usd > 0 && payment.referral_fee_usd && payment.referral_fee_usd > 0 && (
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900">
                      Referral Fee {getReferralPayeeName() ? `- ${getReferralPayeeName()}` : ''}
                    </h5>
                    <p className="text-xs text-gray-600 mt-1">
                      {deal.referral_fee_percent ? `${deal.referral_fee_percent}%` : ''} of total commission
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-purple-900">
                      ${(payment.referral_fee_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={payment.referral_fee_paid || false}
                        onChange={(e) => handleUpdateReferralPaid(payment.id, e.target.checked)}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-xs text-gray-600">Paid</span>
                    </label>
                  </div>
                </div>

                {/* Referral Paid Date Input */}
                {payment.referral_fee_paid && (
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs text-gray-600">Paid on:</span>
                    <input
                      type="date"
                      value={payment.referral_fee_paid_date ? new Date(payment.referral_fee_paid_date).toISOString().split('T')[0] : ''}
                      onChange={(e) => handleUpdateReferralPaidDate(e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Validation Summary - only show when there are broker splits */}
        {splits.length > 0 && !validationTotals.isValid && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
            <div className="text-sm font-medium text-red-800">Percentage Validation Errors:</div>
            <div className="text-xs text-red-600 mt-1">
              {validationTotals.origination !== 100 && `Origination: ${validationTotals.origination}% `}
              {validationTotals.site !== 100 && `Site: ${validationTotals.site}% `}
              {validationTotals.deal !== 100 && `Deal: ${validationTotals.deal}% `}
              (must equal 100% each)
            </div>
          </div>
        )}
      </div>

      {/* Expandable Payment Details Section */}
      <div className="border-t border-gray-200">
        {/* Payment Details Header - Clickable */}
        <div 
          className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => setPaymentDetailsExpanded(!paymentDetailsExpanded)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-gray-900">Payment Details</h4>
              <p className="text-xs text-gray-600 mt-1">
                Dates, tracking, and referral information
              </p>
            </div>
            <button className="p-1 hover:bg-gray-200 rounded">
              {paymentDetailsExpanded ? (
                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Payment Details Content */}
        {paymentDetailsExpanded && (
          <PaymentDetails 
            payment={payment}
            deal={deal}
            clients={clients}
            brokers={brokers}
            paymentSplits={splits}
            commissionSplits={commissionSplits}
            onUpdatePayment={onUpdatePayment}
            onUpdateReferralPaid={handleUpdateReferralPaid}
            onUpdatePaymentSplitPaid={handleUpdatePaymentSplitPaid}
          />
        )}
      </div>
    </div>
  );
};

export default PaymentDetailPanel;