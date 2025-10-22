import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { PaymentDashboardRow } from '../../types/payment-dashboard';
import BrokerPaymentRow from './BrokerPaymentRow';
import ReferralFeeRow from './ReferralFeeRow';
import PaymentDetailSidebar from './PaymentDetailSidebar';
import PaymentCheckProcessing from './PaymentCheckProcessing';

interface PaymentDashboardTableProps {
  payments: PaymentDashboardRow[];
  loading: boolean;
  onPaymentUpdate: () => void;
}

const PaymentDashboardTable: React.FC<PaymentDashboardTableProps> = ({
  payments,
  loading,
  onPaymentUpdate,
}) => {
  const navigate = useNavigate();
  const [localPayments, setLocalPayments] = useState<PaymentDashboardRow[]>(payments);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedPayment, setSelectedPayment] = useState<PaymentDashboardRow | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync local payments with parent when parent data changes
  useEffect(() => {
    setLocalPayments(payments);
  }, [payments]);

  const toggleRow = (paymentId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId);
    } else {
      newExpanded.add(paymentId);
    }
    setExpandedRows(newExpanded);
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleMarkPaymentReceived = async (paymentId: string, received: boolean) => {
    const { error } = await supabase
      .from('payment')
      .update({
        payment_received: received,
        payment_received_date: received ? new Date().toISOString().split('T')[0] : null,
      })
      .eq('id', paymentId);

    if (error) {
      console.error('Error updating payment:', error);
      alert('Failed to update payment status');
    } else {
      onPaymentUpdate();
    }
  };

  const handleUpdatePaymentField = async (paymentId: string, field: string, value: any) => {
    // Optimistic update - update local state immediately
    setLocalPayments(prevPayments =>
      prevPayments.map(payment =>
        payment.payment_id === paymentId
          ? { ...payment, [field]: value }
          : payment
      )
    );

    // Update database in background
    const { error } = await supabase
      .from('payment')
      .update({ [field]: value })
      .eq('id', paymentId);

    if (error) {
      console.error(`Error updating payment ${field}:`, error);
      alert(`Failed to update payment ${field}`);
      // Revert on error by refetching
      onPaymentUpdate();
    }
  };

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getPayoutStatusBadge = (payment: PaymentDashboardRow) => {
    const hasReferralFee = payment.referral_fee_usd && payment.referral_fee_usd > 0;
    const allBrokersPaid = payment.all_brokers_paid;
    const referralPaid = payment.referral_fee_paid;

    if (allBrokersPaid && (!hasReferralFee || referralPaid)) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Fully Paid</span>;
    } else if (payment.broker_splits.some(b => b.paid) || referralPaid) {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">Partial</span>;
    } else {
      return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">Unpaid</span>;
    }
  };

  const handleOpenSidebar = (payment: PaymentDashboardRow) => {
    setSelectedPayment(payment);
    setIsSidebarOpen(true);
    setOpenMenuId(null);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedPayment(null);
  };

  const toggleMenu = (paymentId: string) => {
    setOpenMenuId(openMenuId === paymentId ? null : paymentId);
  };

  const handleDeletePayment = (paymentId: string) => {
    setPaymentToDelete(paymentId);
    setShowDeleteConfirm(true);
    setOpenMenuId(null);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;

    try {
      // First delete all payment splits
      const { error: splitsError } = await supabase
        .from('payment_splits')
        .delete()
        .eq('payment_id', paymentToDelete);

      if (splitsError) throw splitsError;

      // Then delete the payment
      const { error: paymentError } = await supabase
        .from('payment')
        .delete()
        .eq('id', paymentToDelete);

      if (paymentError) throw paymentError;

      // Refresh data
      onPaymentUpdate();

      // Close dialog
      setShowDeleteConfirm(false);
      setPaymentToDelete(null);
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment');
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPaymentToDelete(null);
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (localPayments.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-12 text-center">
        <p className="text-gray-500">No payments found matching your filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Deal
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Payment
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Est. Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Received
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Brokers
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Payout Status
              </th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {localPayments.map((payment) => {
              const isExpanded = expandedRows.has(payment.payment_id);
              return (
                <React.Fragment key={payment.payment_id}>
                  {/* Main Payment Row */}
                  <tr className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-2 py-3">
                      <button
                        onClick={() => toggleRow(payment.payment_id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg
                          className={`h-5 w-5 transform transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/deal/${payment.deal_id}`);
                        }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline"
                      >
                        {payment.deal_name}
                      </button>
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-gray-900"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      Payment {payment.payment_sequence} of {payment.total_payments}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {formatCurrency(payment.payment_amount)}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-gray-500"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {formatDate(payment.payment_date_estimated)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={payment.payment_received}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleMarkPaymentReceived(payment.payment_id, e.target.checked);
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-gray-500">
                          {payment.payment_received_date
                            ? formatDate(payment.payment_received_date)
                            : '-'}
                        </span>
                      </div>
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-gray-500"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {payment.broker_splits.length} broker(s)
                      <br />
                      <span className="text-xs text-gray-400">
                        {formatCurrency(payment.total_broker_amount)}
                      </span>
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {getPayoutStatusBadge(payment)}
                    </td>
                    <td className="px-2 py-3 whitespace-nowrap text-sm relative">
                      <div ref={openMenuId === payment.payment_id ? menuRef : null}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMenu(payment.payment_id);
                          }}
                          className="text-gray-400 hover:text-gray-600 p-1"
                        >
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                        {openMenuId === payment.payment_id && (
                          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                            <div className="py-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenSidebar(payment);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                View Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(payment.payment_id);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                              >
                                Delete Payment
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} className="px-0 py-0 bg-gray-50">
                        <div className="px-12 py-4">
                          {/* Payment Check Processing Section */}
                          <PaymentCheckProcessing
                            paymentReceived={payment.payment_received}
                            paymentReceivedDate={payment.payment_received_date}
                            invoiceSent={payment.invoice_sent}
                            invoiceDate={payment.payment_invoice_date}
                            onUpdateField={(field, value) => handleUpdatePaymentField(payment.payment_id, field, value)}
                          />

                          {/* Broker Splits */}
                          {payment.broker_splits.length > 0 && (
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Broker Commission Breakdown
                              </h4>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                        Broker
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Origination
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Site
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Deal
                                      </th>
                                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                                        Total
                                      </th>
                                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                        Paid
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-200">
                                    {payment.broker_splits.map((split) => (
                                      <BrokerPaymentRow
                                        key={split.payment_split_id}
                                        split={split}
                                        onUpdate={onPaymentUpdate}
                                      />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Referral Fee */}
                          {payment.referral_fee_usd && payment.referral_fee_usd > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                Referral Fee
                              </h4>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <ReferralFeeRow
                                  paymentId={payment.payment_id}
                                  payeeName={payment.referral_payee_name || 'Unknown'}
                                  amount={payment.referral_fee_usd}
                                  paid={payment.referral_fee_paid}
                                  paidDate={payment.referral_fee_paid_date}
                                  onUpdate={onPaymentUpdate}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payment Detail Sidebar */}
      {selectedPayment && (
        <PaymentDetailSidebar
          payment={selectedPayment}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
          onUpdate={onPaymentUpdate}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Payment?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete this payment and all associated broker commission splits. This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button onClick={cancelDelete} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
                Cancel
              </button>
              <button onClick={confirmDelete} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                Delete Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentDashboardTable;
