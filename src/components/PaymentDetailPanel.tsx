import React from 'react';
import { PencilIcon } from '@heroicons/react/24/outline';
import { Payment, PaymentSplit, Broker } from '../lib/types';
import BrokerSplitEditor from './BrokerSplitEditor';

interface PaymentDetailPanelProps {
  payment: Payment;
  splits: PaymentSplit[];
  brokers: Broker[];
  isEditing: boolean;
  onToggleEditing: () => void;
  onSplitPercentageChange: (splitId: string, field: string, value: number | null) => void;
}

const PaymentDetailPanel: React.FC<PaymentDetailPanelProps> = ({
  payment,
  splits,
  brokers,
  isEditing,
  onToggleEditing,
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
        <div className="flex justify-between items-center mb-6">
          <div>
            <h4 className="text-base font-medium text-gray-900">Commission Breakdown</h4>
            <p className="text-xs text-gray-600 mt-1">
              Payment #{payment.payment_sequence} • ${(payment.payment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button
            onClick={onToggleEditing}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center space-x-2"
          >
            <PencilIcon className="h-4 w-4" />
            <span>{isEditing ? 'Save Changes' : 'Edit Splits'}</span>
          </button>
        </div>
        
        {/* Broker Split Cards */}
        <div className="space-y-4">
          {splits.map((split) => (
            <BrokerSplitEditor
              key={split.id}
              split={split}
              brokerName={getBrokerName(split.broker_id)}
              paymentAmount={payment.payment_amount || 0}
              isEditing={isEditing}
              onPercentageChange={(field, value) => onSplitPercentageChange(split.id, field, value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaymentDetailPanel;