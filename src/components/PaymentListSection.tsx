import React, { useState } from 'react';
import { Payment, PaymentSplit, Broker } from '../lib/types';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface PaymentListSectionProps {
  payments: Payment[];
  paymentSplits: PaymentSplit[];
  brokers: Broker[];
  onUpdatePayment: (paymentId: string, updates: Partial<Payment>) => Promise<void>;
  onDeletePayment: (paymentId: string) => Promise<void>;
}

const PaymentListSection: React.FC<PaymentListSectionProps> = ({
  payments,
  paymentSplits,
  brokers,
  onUpdatePayment,
  onDeletePayment
}) => {
  const [editingPayment, setEditingPayment] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);

  // Get payment splits for a specific payment
  const getPaymentSplits = (paymentId: string) => {
    return paymentSplits.filter(ps => ps.payment_id === paymentId);
  };

  // Get broker name by ID
  const getBrokerName = (brokerId: string) => {
    const broker = brokers.find(b => b.id === brokerId);
    return broker ? broker.name : 'Unknown Broker';
  };

// Delete this function or replace with:
const getStatusBadgeColor = (received: boolean) => {
  return received ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
};

  // Handle payment amount change
  const handleAmountChange = async (paymentId: string, newAmount: number) => {
    try {
      await onUpdatePayment(paymentId, { payment_amount: newAmount });
    } catch (error) {
      console.error('Error updating payment amount:', error);
    }
  };

  // Handle payment date change
  const handleDateChange = async (paymentId: string, newDate: string) => {
    try {
      await onUpdatePayment(paymentId, { payment_date: newDate });
    } catch (error) {
      console.error('Error updating payment date:', error);
    }
  };

  // Handle payment notes change
  const handleNotesChange = async (paymentId: string, newNotes: string) => {
    try {
      await onUpdatePayment(paymentId, { notes: newNotes });
    } catch (error) {
      console.error('Error updating payment notes:', error);
    }
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Payment Management</h3>
        <p className="text-sm text-gray-600 mt-1">
          Manage individual payments and track their status
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Broker Splits
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Notes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payments.map((payment) => {
              const splits = getPaymentSplits(payment.id);
              const isEditing = editingPayment === payment.id;

              return (
                <tr key={payment.id} className="hover:bg-gray-50">
                  {/* Payment Number */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{payment.payment_sequence}
                  </td>

                  {/* Amount */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={payment.payment_amount || 0}
                        onChange={(e) => handleAmountChange(payment.id, parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
                        onBlur={() => setEditingPayment(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingPayment(null);
                          if (e.key === 'Escape') setEditingPayment(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => setEditingPayment(payment.id)}
                        className="hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                      >
                        ${(payment.payment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </button>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={payment.payment_received || false}
                        onChange={(e) => onUpdatePayment(payment.id, { payment_received: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        payment.payment_received ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payment.payment_received ? 'Received' : 'Pending'}
                      </span>
                    </div>
                  </td>

                  {/* Payment Date */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <input
                      type="date"
                      value={payment.payment_date_actual || ''}
                      onChange={(e) => handleDateChange(payment.id, e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                    />
                  </td>

                  {/* Broker Splits */}
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {splits.length > 0 ? (
                      <div className="space-y-1">
                        {splits.map((split) => (
                          <div key={split.id} className="flex justify-between text-xs">
                            <span className="text-gray-600">{getBrokerName(split.broker_id)}:</span>
                            <span className="font-medium">
                              ${(split.split_broker_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">No splits</span>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <input
                      type="text"
                      value={payment.notes || ''}
                      onChange={(e) => handleNotesChange(payment.id, e.target.value)}
                      placeholder="Add notes..."
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                    />
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button
                      onClick={() => confirmDeletePayment(payment)}
                      className="text-red-600 hover:text-red-900 transition-colors"
                      title="Delete payment"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={executeDeletePayment}
        title="Delete Payment"
        itemName={paymentToDelete ? `Payment #${paymentToDelete.payment_sequence}` : ''}
        message="This will permanently delete the payment and all associated commission splits. This action cannot be undone."
      />
    </div>
  );
};

export default PaymentListSection;