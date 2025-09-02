import React, { useState } from 'react';
import { Payment, Deal, Client, Broker, PaymentSplit, CommissionSplit } from '../../lib/types';
import { formatDateForInput, formatDateStringWithFallback } from '../../utils/dateUtils';
import PaymentDisbursementModal from './PaymentDisbursementModal';

interface PaymentDetailsProps {
  payment: Payment;
  deal: Deal;
  clients?: Client[];
  brokers?: Broker[];
  paymentSplits?: PaymentSplit[];
  commissionSplits?: CommissionSplit[];
  onUpdatePayment: (updates: Partial<Payment>) => Promise<void>;
  onUpdateReferralPaid?: (paymentId: string, paid: boolean) => Promise<void>;
  onUpdatePaymentSplitPaid?: (splitId: string, paid: boolean) => Promise<void>;
}

const PaymentDetails: React.FC<PaymentDetailsProps> = ({
  payment,
  deal,
  clients,
  brokers,
  paymentSplits,
  commissionSplits,
  onUpdatePayment,
  onUpdateReferralPaid,
  onUpdatePaymentSplitPaid
}) => {
  const [disbursementModalOpen, setDisbursementModalOpen] = useState(false);
  
  // Use the utility functions for consistent date handling
  
  // Get referral payee client name
  const getReferralPayeeName = () => {
    if (!deal.referral_payee_client_id) return 'No referral payee set';
    if (!clients || clients.length === 0) return 'Client data not available';
    const client = clients.find(c => c.id === deal.referral_payee_client_id);
    return client ? client.client_name || 'Unknown Client' : 'Client not found';
  };

  // Calculate proportional referral fee for this payment
  const getProportionalReferralFee = () => {
    if (!deal.referral_fee_usd || deal.referral_fee_usd === 0) return 0;
    
    const dealAmount = deal.fee || deal.deal_usd || 0;
    const paymentAmount = payment.payment_amount || 0;
    
    if (dealAmount === 0) return 0;
    
    return deal.referral_fee_usd * (paymentAmount / dealAmount);
  };

  const renderDateField = (
    label: string,
    fieldName: keyof Payment,
    showDisplayValue: boolean = false
  ) => {
    const currentValue = payment[fieldName] as string | null;

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">
          {label}
        </label>
        {showDisplayValue && currentValue && (
          <div className="text-xs text-gray-500 mb-1">
            {formatDateStringWithFallback(currentValue)}
          </div>
        )}
        <input
          type="date"
          value={formatDateForInput(currentValue)}
          onChange={(e) => onUpdatePayment({ [fieldName]: e.target.value || null })}
          className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    );
  };

  const renderTextField = (
    label: string,
    fieldName: keyof Payment,
    placeholder?: string
  ) => {
    const currentValue = payment[fieldName] as string | null;

    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">
          {label}
        </label>
        <input
          type="text"
          value={currentValue || ''}
          onChange={(e) => onUpdatePayment({ [fieldName]: e.target.value || null })}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    );
  };

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <div className="p-4 md:p-6">
        <h4 className="text-sm font-medium text-gray-900 mb-4">Payment Details</h4>
        
        {/* Payment Date Fields */}
        <div className="mb-6">
          <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">Payment Dates & Tracking</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Estimated Payment Date */}
            {renderDateField(
              'Estimated Payment Date',
              'payment_date_estimated'
            )}

            {/* Payment Received Date */}
            {renderDateField(
              'Payment Received Date',
              'payment_received_date'
            )}

            {/* Invoice Date */}
            {renderDateField(
              'Invoice Date',
              'payment_invoice_date'
            )}

            {/* OREP Invoice */}
            {renderTextField(
              'OREP Invoice',
              'orep_invoice',
              'Enter OREP Invoice number'
            )}
          </div>
        </div>

        {/* Referral Information */}
        {(deal.referral_payee_client_id || deal.referral_fee_usd || deal.referral_fee_percent) && (
          <div className="mb-6">
            <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">Referral Information</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {/* Referral Payee */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                  Referral Payee
                </label>
                <div className="w-full px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-md text-gray-600">
                  {getReferralPayeeName()}
                </div>
              </div>

              {/* Referral Fee */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                  Referral Fee
                </label>
                <div className="w-full px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-md text-gray-600">
                  {(() => {
                    const proportionalFee = getProportionalReferralFee();
                    const fullDealFee = deal.referral_fee_usd || 0;
                    
                    if (proportionalFee === 0) return 'No referral fee for this payment';
                    
                    return (
                      <>
                        ${proportionalFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        <span className="ml-2 text-xs text-gray-500">
                          (${fullDealFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} total)
                        </span>
                        {deal.referral_fee_percent && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({deal.referral_fee_percent}%)
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Salesforce Date Fields (Read-only) */}
        {(payment.sf_payment_date_est || payment.sf_payment_date_actual || payment.sf_payment_date_received || payment.sf_payment_invoice_date) && (
          <div className="mt-6">
            <h5 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">Salesforce Date Fields (Read-only)</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {payment.sf_payment_date_est && (
                <div>
                  <span className="font-medium text-gray-600">SF Est Date:</span>{' '}
                  <span className="text-gray-500">{formatDateStringWithFallback(payment.sf_payment_date_est)}</span>
                </div>
              )}
              {payment.sf_payment_date_actual && (
                <div>
                  <span className="font-medium text-gray-600">SF Actual Date:</span>{' '}
                  <span className="text-gray-500">{formatDateStringWithFallback(payment.sf_payment_date_actual)}</span>
                </div>
              )}
              {payment.sf_payment_date_received && (
                <div>
                  <span className="font-medium text-gray-600">SF Received Date:</span>{' '}
                  <span className="text-gray-500">{formatDateStringWithFallback(payment.sf_payment_date_received)}</span>
                </div>
              )}
              {payment.sf_payment_invoice_date && (
                <div>
                  <span className="font-medium text-gray-600">SF Invoice Date:</span>{' '}
                  <span className="text-gray-500">{formatDateStringWithFallback(payment.sf_payment_invoice_date)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Additional Info */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs text-gray-500">
            <div>
              <span className="font-medium">Payment Received:</span>{' '}
              {payment.payment_received ? 'Yes' : 'No'}
              {payment.payment_received_date && (
                <span className="ml-1">({formatDateStringWithFallback(payment.payment_received_date)})</span>
              )}
            </div>
            <div>
              <span className="font-medium">SF Payment Status:</span>{' '}
              {payment.sf_payment_status || 'Not set'}
            </div>
            {/* QB sync info hidden until QuickBooks integration is active */}
            {payment.qb_sync_status && (
              <div>
                <span className="font-medium">QB Sync Status:</span>{' '}
                {payment.qb_sync_status}
              </div>
            )}
            {payment.qb_last_sync && (
              <div>
                <span className="font-medium">Last QB Sync:</span>{' '}
                {formatDateStringWithFallback(payment.qb_last_sync)}
              </div>
            )}
          </div>
        </div>

        {/* Payment Received Section with Disbursement Trigger */}
        <div className="mt-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id={`payment-received-${payment.id}`}
                checked={payment.payment_received || false}
                onChange={async (e) => {
                  const newReceived = e.target.checked;
                  await onUpdatePayment({ payment_received: newReceived });
                  
                  // If marking as received and there are disbursements, open modal
                  if (newReceived && (
                    (deal.referral_fee_usd && deal.referral_fee_usd > 0) || 
                    (paymentSplits && paymentSplits.some(split => (split.split_broker_total || 0) > 0))
                  )) {
                    setDisbursementModalOpen(true);
                  }
                }}
                className="h-5 w-5 text-blue-600 rounded border-2 border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div>
                <label 
                  htmlFor={`payment-received-${payment.id}`}
                  className="text-sm font-semibold text-blue-900 cursor-pointer"
                >
                  Payment Received
                </label>
                <p className="text-xs text-blue-700">
                  {payment.payment_received 
                    ? 'Payment has been received - manage disbursements below'
                    : 'Check when payment is received to manage disbursements'
                  }
                </p>
              </div>
            </div>
            
            {/* Disbursement Quick Actions */}
            {payment.payment_received && (
              <button
                onClick={() => setDisbursementModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Manage Disbursements
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Disbursement Modal */}
      {disbursementModalOpen && (
        <PaymentDisbursementModal
          isOpen={disbursementModalOpen}
          onClose={() => setDisbursementModalOpen(false)}
          payment={payment}
          deal={deal}
          clients={clients || []}
          brokers={brokers || []}
          paymentSplits={paymentSplits || []}
          onUpdateReferralPaid={onUpdateReferralPaid || (async () => {})}
          onUpdatePaymentSplitPaid={onUpdatePaymentSplitPaid || (async () => {})}
        />
      )}
    </div>
  );
};

export default PaymentDetails;