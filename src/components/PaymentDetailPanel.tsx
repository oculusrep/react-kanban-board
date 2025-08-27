import React from 'react';
import { Payment, PaymentSplit, Broker } from '../lib/types';
import BrokerSplitEditor from './BrokerSplitEditor';

interface PaymentDetailPanelProps {
  payment: Payment;
  splits: PaymentSplit[];
  brokers: Broker[];
  onSplitPercentageChange: (splitId: string, field: string, value: number | null) => void;
}

const PaymentDetailPanel: React.FC<PaymentDetailPanelProps> = ({
  payment,
  splits,
  brokers,
  onSplitPercentageChange
}) => {
  const getBrokerName = (brokerId: string) => {
    const broker = brokers.find(b => b.id === brokerId);
    return broker ? broker.name : 'Unknown Broker';
  };

  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h4 className="text-base font-medium text-gray-900">Commission Breakdown</h4>
          <p className="text-xs text-gray-600 mt-1">
            Payment #{payment.payment_sequence} • ${(payment.payment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        
        {/* Broker Split Cards */}
        <div className="space-y-4">
          {splits.map((split) => (
            <BrokerSplitEditor
              key={split.id}
              split={split}
              brokerName={getBrokerName(split.broker_id)}
              paymentAmount={payment.payment_amount || 0}
              onPercentageChange={(field, value) => onSplitPercentageChange(split.id, field, value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaymentDetailPanel;