import { Payment } from '../lib/types';

export type PaymentStatus = 'received' | 'sent' | 'overdue' | 'pending';

export interface PaymentStatusSummary {
  pending: number;
  sent: number;
  overdue: number;
  received: number;
  total: number;
}

export const usePaymentStatus = (payments: Payment[]) => {
  const getPaymentStatus = (payment: Payment): PaymentStatus => {
    // First check if payment was received
    if (payment.payment_received) {
      return 'received';
    }
    
    // Check if invoice was sent but payment not received
    if (payment.invoice_sent && !payment.payment_received) {
      // If estimated date exists and is past, it's overdue
      if (payment.payment_date_estimated) {
        const estimatedDate = new Date(payment.payment_date_estimated);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time for accurate date comparison
        
        if (estimatedDate < today) {
          return 'overdue';
        }
      }
      // Invoice sent but not overdue yet
      return 'sent';
    }
    
    // No invoice sent yet, check if overdue based on estimated date
    if (payment.payment_date_estimated && !payment.invoice_sent) {
      const estimatedDate = new Date(payment.payment_date_estimated);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (estimatedDate < today) {
        return 'overdue'; // Should have been invoiced by now
      }
    }
    
    // Default to pending
    return 'pending';
  };

  // Calculate status summary
  const statusSummary: PaymentStatusSummary = payments.reduce((acc, payment) => {
    const status = getPaymentStatus(payment);
    acc[status] = (acc[status] || 0) + 1;
    acc.total++;
    return acc;
  }, { pending: 0, sent: 0, overdue: 0, received: 0, total: 0 });

  // Helper properties
  const hasOverdue = statusSummary.overdue > 0;
  const hasActionItems = statusSummary.overdue > 0 || statusSummary.sent > 0;
  const completionRate = statusSummary.total > 0 ? (statusSummary.received / statusSummary.total) * 100 : 0;

  return {
    getPaymentStatus,
    statusSummary,
    hasOverdue,
    hasActionItems,
    completionRate
  };
};