import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { PaymentDashboardRow } from '../../types/payment-dashboard';
import BrokerPaymentRow from './BrokerPaymentRow';
import ReferralFeeRow from './ReferralFeeRow';

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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (payments.length === 0) {
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
              <th className="w-8 px-3 py-3"></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Deal
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Est. Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Received
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Brokers
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payout Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payments.map((payment) => {
              const isExpanded = expandedRows.has(payment.payment_id);
              return (
                <React.Fragment key={payment.payment_id}>
                  {/* Main Payment Row */}
                  <tr className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-4">
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
                      className="px-6 py-4 whitespace-nowrap"
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
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      Payment {payment.payment_sequence} of {payment.total_payments}
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {formatCurrency(payment.payment_amount)}
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {formatDate(payment.payment_date_estimated)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
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
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {payment.broker_splits.length} broker(s)
                      <br />
                      <span className="text-xs text-gray-400">
                        {formatCurrency(payment.total_broker_amount)}
                      </span>
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap"
                      onClick={() => toggleRow(payment.payment_id)}
                    >
                      {getPayoutStatusBadge(payment)}
                    </td>
                  </tr>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="px-0 py-0 bg-gray-50">
                        <div className="px-12 py-4">
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
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                        Broker
                                      </th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                        Origination
                                      </th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                        Site
                                      </th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                        Deal
                                      </th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                        Total
                                      </th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
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
    </div>
  );
};

export default PaymentDashboardTable;
