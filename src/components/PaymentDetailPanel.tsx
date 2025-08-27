import React from 'react';
import { Payment, PaymentSplit, Broker, Deal } from '../lib/types';
import BrokerSplitEditor from './BrokerSplitEditor';
import { usePaymentSplitValidation } from '../hooks/usePaymentSplitValidation';
import { usePaymentSplitCalculations } from '../hooks/usePaymentSplitCalculations';

interface PaymentDetailPanelProps {
  payment: Payment;
  splits: PaymentSplit[];
  brokers: Broker[];
  dealAmounts: { origination_usd?: number; site_usd?: number; deal_usd?: number };
  deal: Deal;
  onSplitPercentageChange: (splitId: string, field: string, value: number | null) => void;
}

const PaymentDetailPanel: React.FC<PaymentDetailPanelProps> = ({
  payment,
  splits,
  brokers,
  dealAmounts,
  deal,
  onSplitPercentageChange
}) => {
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

  return (
    <div className="border-t border-gray-200 bg-white">
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
              {validationTotals.deal !== 100 && `Deal: ${validationTotals.deal}% `}
              {validationTotals.site !== 100 && `Site: ${validationTotals.site}% `}
              {validationTotals.origination !== 100 && `Origination: ${validationTotals.origination}% `}
              (must equal 100% each)
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentDetailPanel;