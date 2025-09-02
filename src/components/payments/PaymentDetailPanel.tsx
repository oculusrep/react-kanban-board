import React, { useState } from 'react';
import { Payment, PaymentSplit, Broker, Deal, Client, CommissionSplit } from '../../lib/types';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import BrokerSplitEditor from '../BrokerSplitEditor';
import PaymentDetails from './PaymentDetails';
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
  onUpdatePaymentSplit?: (splitId: string, updates: Partial<PaymentSplit>) => Promise<void>;
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

  // Calculate AGCI for this payment
  const calculatePaymentAGCI = () => {
    const paymentAmount = payment.payment_amount || 0;
    const numberOfPayments = deal.number_of_payments || 1;
    
    // Proportional referral and house fees for this payment
    const referralFeeUSD = (deal.referral_fee_usd || 0) / numberOfPayments;
    const houseFeeUSD = (deal.house_usd || 0) / numberOfPayments;
    
    // AGCI = Payment Amount - Referral Fee - House Fee
    return paymentAmount - referralFeeUSD - houseFeeUSD;
  };

  const paymentAGCI = calculatePaymentAGCI();
  const calculatedSplits = usePaymentSplitCalculations(
    splits, 
    dealAmounts, 
    deal, 
    payment.payment_amount || 0
  );
  const validationTotals = usePaymentSplitValidation(calculatedSplits);

  // Disbursement functionality
  const { updateReferralPaid, updatePaymentSplitPaid } = usePaymentDisbursement();

  const handleUpdateReferralPaid = async (paymentId: string, paid: boolean) => {
    try {
      await updateReferralPaid(paymentId, paid);
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
        await onUpdatePaymentSplit(splitId, { paid });
        console.log('✅ Payment split paid status updated, parent state refreshed');
      }
      
    } catch (error) {
      console.error('Error updating payment split status:', error);
      // TODO: Add user-friendly error handling
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
        
        {/* Broker Split Cards */}
        <div className="space-y-4">
          {calculatedSplits.map((split) => (
            <BrokerSplitEditor
              key={split.id}
              split={split}
              brokerName={getBrokerName(split.broker_id)}
              paymentAmount={payment.payment_amount || 0}
              onPercentageChange={(field, value) => onSplitPercentageChange(split.id, field, value)}
              validationTotals={validationTotals}
            />
          ))}
        </div>
        
        {/* Validation Summary */}
        {!validationTotals.isValid && (
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