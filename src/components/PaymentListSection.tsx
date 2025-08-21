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

  // Handle payment status change
  const handleStatusChange = async (paymentId: string, newStatus: string) => {
    try {
      const updates: Partial<Payment> = { status: newStatus };
      
      // If marking as sent or received, set payment_date to today if not already set
      const payment = payments.find(p => p.payment_id === paymentId);
      if ((newStatus === 'sent' || newStatus === 'received') && !payment?.payment_date) {
        updates.payment_date = new Date().toISOString().split('T')[0];
      }
      
      await onUpdatePayment(paymentId, updates);
    } catch (error) {
      console.error('Error updating payment status:', error);
    }
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
        await onDeletePayment(paymentToDelete.payment_id);
        setDeleteModalOpen(false);
        setPaymentToDelete(null);
      } catch (error) {
        console.error('Error deleting payment:', error);
      }
    }
  };

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'received':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
              const splits = getPaymentSplits(payment.payment_id);
              const isEditing = editingPayment === payment.payment_id;

              return (
                <tr key={payment.payment_id} className="hover:bg-gray-50">
                  {/* Payment Number */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{payment.payment_number}
                  </td>

                  {/* Amount */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={payment.payment_amount || 0}
                        onChange={(e) => handleAmountChange(payment.payment_id, parseFloat(e.target.value) || 0)}
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
                        onClick={() => setEditingPayment(payment.payment_id)}
                        className="hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                      >
                        ${(payment.payment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </button>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={payment.status || 'pending'}
                      onChange={(e) => handleStatusChange(payment.payment_id, e.target.value)}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border-0 ${getStatusBadgeColor(payment.status || 'pending')}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="sent">Sent</option>
                      <option value="received">Received</option>
                    </select>
                  </td>

                  {/* Payment Date */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <input
                      type="date"
                      value={payment.payment_date || ''}
                      onChange={(e) => handleDateChange(payment.payment_id, e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                    />
                  </td>

                  {/* Broker Splits */}
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {splits.length > 0 ? (
                      <div className="space-y-1">
                        {splits.map((split) => (
                          <div key={split.payment_split_id} className="flex justify-between text-xs">
                            <span className="text-gray-600">{getBrokerName(split.broker_id)}:</span>
                            <span className="font-medium">
                              ${(split.split_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                      onChange={(e) => handleNotesChange(payment.payment_id, e.target.value)}
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
        itemName={paymentToDelete ? `Payment #${paymentToDelete.payment_number}` : ''}
        message="This will permanently delete the payment and all associated commission splits. This action cannot be undone."
      />
    </div>
  );
};

export default PaymentListSection;