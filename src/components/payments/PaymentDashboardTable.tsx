import React, { useState } from 'react';
import { PaymentDashboardRow } from '../../types/payment-dashboard';
import { ChevronDownIcon, ChevronRightIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

interface PaymentDashboardTableProps {
  rows: PaymentDashboardRow[];
  onUpdatePaymentSplitPaid: (splitId: string, paid: boolean) => Promise<void>;
  onUpdateReferralPaid: (paymentId: string, paid: boolean) => Promise<void>;
}

const PaymentDashboardTable: React.FC<PaymentDashboardTableProps> = ({
  rows,
  onUpdatePaymentSplitPaid,
  onUpdateReferralPaid
}) => {
  const navigate = useNavigate();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRowExpansion = (paymentId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-600">No payments found matching your filters</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Deal
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Received Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Disbursed
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pending
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((row) => {
              const isExpanded = expandedRows.has(row.payment.id);

              return (
                <React.Fragment key={row.payment.id}>
                  {/* Main Payment Row */}
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleRowExpansion(row.payment.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/deals/${row.deal.id}`)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {row.deal.deal_name || 'Untitled Deal'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.payment.payment_sequence || '-'} of {row.deal.number_of_payments || 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(row.payment.payment_received_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(row.payment.payment_amount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                      {formatCurrency(row.totalPaidOut)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600 text-right font-medium">
                      {formatCurrency(row.totalUnpaid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {row.fullyDisbursed ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircleIcon className="h-4 w-4 mr-1" />
                          Paid
                        </span>
                      ) : row.totalPaidOut > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <ClockIcon className="h-4 w-4 mr-1" />
                          Partial
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <ClockIcon className="h-4 w-4 mr-1" />
                          Unpaid
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Broker Split Details */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 bg-gray-50">
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-gray-900">Broker Commission Splits</h4>

                          {/* Broker Splits Table */}
                          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Broker</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Origination</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Site</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Deal</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Paid</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Paid Date</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {row.brokerSplits.map((split) => (
                                  <tr key={split.splitId} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                      {split.brokerName}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {formatCurrency(split.originationAmount)}
                                      <span className="text-xs text-gray-500 ml-1">({split.originationPercent}%)</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {formatCurrency(split.siteAmount)}
                                      <span className="text-xs text-gray-500 ml-1">({split.sitePercent}%)</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                                      {formatCurrency(split.dealAmount)}
                                      <span className="text-xs text-gray-500 ml-1">({split.dealPercent}%)</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                      {formatCurrency(split.totalAmount)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={split.paid}
                                        onChange={(e) => onUpdatePaymentSplitPaid(split.splitId, e.target.checked)}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 text-center">
                                      {formatDate(split.paidDate)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Referral Fee (if applicable) */}
                          {row.referralFee && (
                            <div className="mt-3">
                              <h4 className="text-sm font-medium text-gray-900 mb-2">Referral Fee</h4>
                              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {row.referralFee.payeeName}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                      {row.referralFee.percent ? `${row.referralFee.percent}% of total commission` : 'Referral fee'}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <p className="text-sm font-semibold text-purple-900">
                                      {formatCurrency(row.referralFee.amount)}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={row.referralFee.paid}
                                          onChange={(e) => onUpdateReferralPaid(row.payment.id, e.target.checked)}
                                          className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                        />
                                        <span className="text-xs text-gray-600">Paid</span>
                                      </label>
                                    </div>
                                    <p className="text-xs text-gray-600 min-w-[100px] text-right">
                                      {formatDate(row.referralFee.paidDate)}
                                    </p>
                                  </div>
                                </div>
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
