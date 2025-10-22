import React from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Payment, Deal } from '../../lib/types';
import { formatDateString } from '../../utils/dateUtils';

interface PaymentSummaryRowProps {
  payment: Payment;
  deal: Deal;
  totalPayments: number;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onUpdatePayment: (updates: Partial<Payment>) => Promise<void>;
  onDeletePayment: () => void;
}

const PaymentSummaryRow: React.FC<PaymentSummaryRowProps> = ({
  payment,
  deal,
  totalPayments,
  isExpanded,
  onToggleExpansion,
  onUpdatePayment,
  onDeletePayment
}) => {
  // DEBUG: Check payment date values
  console.log('📅 PaymentSummaryRow payment dates:', {
    id: payment.id,
    payment_sequence: payment.payment_sequence,
    payment_date_estimated: payment.payment_date_estimated,
    payment_received_date: payment.payment_received_date
  });

  // Calculate the correct payment amount based on deal commission
  const calculatedPaymentAmount = (deal.fee || 0) / (deal.number_of_payments || 1);

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
          <div className="text-xs text-gray-500">
            ${calculatedPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Invoice Number - 2 cols */}
      <div className="col-span-2">
        <div className={`text-xs ${payment.orep_invoice ? 'text-gray-500' : 'text-red-500'}`}>
          Invoice #
        </div>
        <input
          type="text"
          value={payment.orep_invoice || ''}
          onChange={(e) => onUpdatePayment({ orep_invoice: e.target.value || null })}
          placeholder="-"
          className="w-full border-0 bg-transparent px-0 py-0 text-sm text-gray-900 focus:outline-none focus:ring-0 placeholder-gray-400 cursor-text"
        />
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
              onChange={(e) => onUpdatePayment({ payment_date_estimated: e.target.value })}
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
      <div className="col-span-2 text-right">
        <button
          onClick={onDeletePayment}
          className="text-red-600 hover:text-red-900 text-sm whitespace-nowrap"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default PaymentSummaryRow;