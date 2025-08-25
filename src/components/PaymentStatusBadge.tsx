import React from 'react';
import { Payment } from '../lib/types';
import { usePaymentStatus } from '../hooks/usePaymentStatus';

interface PaymentStatusBadgeProps {
  payment: Payment;
  showDate?: boolean;
}

const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ 
  payment, 
  showDate = true 
}) => {
  const { getPaymentStatus } = usePaymentStatus([]);
  const status = getPaymentStatus(payment);
  
  const statusConfig = {
    received: { 
      bg: 'bg-green-100', 
      text: 'text-green-800', 
      label: '✅ Received',
      date: payment.payment_received_date,
      dateLabel: 'Received:'
    },
    sent: { 
      bg: 'bg-blue-100', 
      text: 'text-blue-800', 
      label: '📧 Sent',
      date: payment.payment_invoice_date,
      dateLabel: 'Invoiced:'
    },
    overdue: { 
      bg: 'bg-red-100', 
      text: 'text-red-800', 
      label: '⚠️ Overdue',
      date: payment.payment_date_estimated,
      dateLabel: 'Due:'
    },
    pending: { 
      bg: 'bg-yellow-100', 
      text: 'text-yellow-800', 
      label: '⏳ Pending',
      date: payment.payment_date_estimated,
      dateLabel: 'Due:'
    }
  };
  
  const config = statusConfig[status];
  
  return (
    <div className={`inline-flex flex-col items-start px-2 py-1 rounded text-xs ${config.bg} ${config.text}`}>
      <span className="font-medium">{config.label}</span>
      {showDate && config.date && (
        <span className="text-xs opacity-75 mt-0.5">
          {config.dateLabel} {new Date(config.date).toLocaleDateString()}
        </span>
      )}
    </div>
  );
};

export default PaymentStatusBadge;