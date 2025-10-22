// Payment Check Processing Component
// Reusable component for managing payment receipt and invoice status
// src/components/payments/PaymentCheckProcessing.tsx

import React from 'react';

interface PaymentCheckProcessingProps {
  paymentReceived: boolean;
  paymentReceivedDate: string | null;
  invoiceSent: boolean;
  invoiceDate: string | null;
  onUpdateField: (field: string, value: any) => void;
}

const PaymentCheckProcessing: React.FC<PaymentCheckProcessingProps> = ({
  paymentReceived,
  paymentReceivedDate,
  invoiceSent,
  invoiceDate,
  onUpdateField,
}) => {
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">
        Payment Check Processing
      </h4>
      <div className="bg-white rounded-lg border border-gray-200 px-4 py-2">
        <div className="flex items-center space-x-6 text-xs">
          {/* Payment Received */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={paymentReceived}
              onChange={(e) => {
                const checked = e.target.checked;
                onUpdateField('payment_received', checked);
                // Auto-set date if checked and no date exists
                if (checked && !paymentReceivedDate) {
                  onUpdateField('payment_received_date', getLocalDateString());
                } else if (!checked) {
                  onUpdateField('payment_received_date', null);
                }
              }}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
            />
            <span className="text-gray-700 font-medium">Payment Received</span>
            {paymentReceived && paymentReceivedDate && (
              <input
                type="date"
                value={paymentReceivedDate}
                onChange={(e) => {
                  onUpdateField('payment_received_date', e.target.value);
                }}
                className="text-gray-500 text-xs border-0 p-0 focus:ring-0 cursor-pointer hover:text-gray-700"
                style={{ width: '90px' }}
              />
            )}
          </div>

          {/* Invoice Sent */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={invoiceSent}
              onChange={(e) => {
                const checked = e.target.checked;
                onUpdateField('invoice_sent', checked);
                // Auto-set date if checked and no date exists
                if (checked && !invoiceDate) {
                  onUpdateField('payment_invoice_date', getLocalDateString());
                } else if (!checked) {
                  onUpdateField('payment_invoice_date', null);
                }
              }}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-gray-700 font-medium">Invoice Sent</span>
            {invoiceSent && invoiceDate && (
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  onUpdateField('payment_invoice_date', e.target.value);
                }}
                className="text-gray-500 text-xs border-0 p-0 focus:ring-0 cursor-pointer hover:text-gray-700"
                style={{ width: '90px' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCheckProcessing;
