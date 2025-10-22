import React, { useState } from 'react';
import { Payment, PaymentSplit, Broker, Deal, Client, CommissionSplit } from '../../lib/types';
import { supabase } from '../../lib/supabaseClient';
import DeleteConfirmationModal from '../DeleteConfirmationModal';
import PaymentSummaryRow from './PaymentSummaryRow';
import PaymentDetailPanel from './PaymentDetailPanel';

interface PaymentListSectionProps {
  payments: Payment[];
  paymentSplits: PaymentSplit[];
  brokers: Broker[];
  clients?: Client[];
  commissionSplits?: CommissionSplit[];
  deal: Deal;
  onUpdatePayment: (paymentId: string, updates: Partial<Payment>) => Promise<void>;
  onDeletePayment: (paymentId: string) => Promise<void>;
  onUpdatePaymentSplit?: (splitId: string, field: string, value: number | null) => Promise<void>;
}

const PaymentListSection: React.FC<PaymentListSectionProps> = ({
  payments,
  paymentSplits,
  brokers,
  clients,
  commissionSplits,
  deal,
  onUpdatePayment,
  onDeletePayment,
  onUpdatePaymentSplit
}) => {
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

  // Toggle payment expansion
  const togglePaymentExpansion = (paymentId: string) => {
    setExpandedPayments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  // Get payment splits for a specific payment
  const getPaymentSplits = (paymentId: string) => {
    return paymentSplits.filter(ps => ps.payment_id === paymentId);
  };



  // Confirm delete payment
  const confirmDeletePayment = (payment: Payment) => {
    setPaymentToDelete(payment);
    setDeleteModalOpen(true);
  };

  // Execute delete payment
  const executeDeletePayment = async () => {
    if (paymentToDelete) {
      try {
        await onDeletePayment(paymentToDelete.id);
        setDeleteModalOpen(false);
        setPaymentToDelete(null);
      } catch (error) {
        console.error('Error deleting payment:', error);
      }
    }
  };

  // Handle payment split percentage change
  const handleSplitPercentageChange = async (splitId: string, field: string, newValue: number | null) => {
    try {
      const { error } = await supabase
        .from('payment_split')
        .update({ [field]: newValue || 0 })
        .eq('id', splitId);

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      // Notify parent component to update local state
      if (onUpdatePaymentSplit) {
        await onUpdatePaymentSplit(splitId, field, newValue);
      }
      
    } catch (error) {
      console.error('Error updating payment split:', error);
      alert('Failed to update split percentage. Please try again.');
    }
  };



  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Payment Management</h3>
        <p className="text-sm text-gray-600 mt-1">
          Manage individual payments and track their status
        </p>
      </div>

      <div className="space-y-3">
        {payments.map((payment) => {
          const splits = getPaymentSplits(payment.id);
          const isExpanded = expandedPayments.has(payment.id);

          return (
            <div key={payment.id} className="border border-gray-200 rounded-lg bg-white">
              {/* Main Payment Row */}
              <PaymentSummaryRow
                payment={payment}
                totalPayments={payments.length}
                isExpanded={isExpanded}
                onToggleExpansion={() => togglePaymentExpansion(payment.id)}
                onUpdatePayment={(updates) => onUpdatePayment(payment.id, updates)}
                onDeletePayment={() => confirmDeletePayment(payment)}
              />

              {/* Expandable Detail Panel */}
              {isExpanded && (
                <PaymentDetailPanel
                  payment={payment}
                  splits={splits}
                  brokers={brokers}
                  clients={clients}
                  commissionSplits={commissionSplits}
                  dealAmounts={{
                    origination_usd: deal.origination_usd || 0,
                    site_usd: deal.site_usd || 0,
                    deal_usd: deal.deal_usd || 0
                  }}
                  deal={deal}
                  onSplitPercentageChange={handleSplitPercentageChange}
                  onUpdatePayment={(updates) => onUpdatePayment(payment.id, updates)}
                  onUpdatePaymentSplit={onUpdatePaymentSplit}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={executeDeletePayment}
        title="Delete Payment"
        itemName={paymentToDelete ? `Payment ${paymentToDelete.payment_sequence} of ${payments.length}` : ''}
        message="This will permanently delete the payment and all associated commission splits. This action cannot be undone."
      />
    </div>
  );
};

export default PaymentListSection;