import React, { useState } from 'react';
import { Payment, PaymentSplit, Broker, Deal, Client, CommissionSplit } from '../../lib/types';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import BrokerSplitEditor from '../BrokerSplitEditor';
import PaymentDetails from './PaymentDetails';
import PaymentCheckProcessing from './PaymentCheckProcessing';
import { usePaymentSplitValidation } from '../../hooks/usePaymentSplitValidation';
import { usePaymentSplitCalculations } from '../../hooks/usePaymentSplitCalculations';
import { usePaymentDisbursement } from '../../hooks/usePaymentDisbursement';

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
  onUpdatePaymentSplit
}) => {
  const [paymentDetailsExpanded, setPaymentDetailsExpanded] = useState(false);
  const getBrokerName = (brokerId: string) => {
    const broker = brokers.find(b => b.id === brokerId);
    return broker ? broker.name : 'Unknown Broker';
  };

  const getReferralPayeeName = () => {
    if (!deal.referral_payee_client_id) return null;
    const client = clients?.find(c => c.id === deal.referral_payee_client_id);
    return client?.client_name || null;
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

          {/* Referral Fee Row */}
          {deal.referral_fee_usd && deal.referral_fee_usd > 0 && (
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
                      ${((deal.referral_fee_usd || 0) / (deal.number_of_payments || 1)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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