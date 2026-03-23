import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PaymentDashboardRow } from '../../types/payment-dashboard';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface AgedUpcomingPaymentsTabProps {
  onPaymentUpdate: () => void;
}

const AgedUpcomingPaymentsTab: React.FC<AgedUpcomingPaymentsTabProps> = ({ onPaymentUpdate }) => {
  const [payments, setPayments] = useState<PaymentDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinnedPaymentIds, setPinnedPaymentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      // Fetch pending payments with estimated dates directly from payment table
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_sequence,
          payment_amount,
          payment_date_estimated,
          payment_received_date,
          payment_received,
          invoice_sent,
          payment_invoice_date,
          orep_invoice,
          qb_invoice_id,
          qb_invoice_number,
          locked,
          deal!inner (
            deal_name,
            stage_id,
            number_of_payments
          )
        `)
        .eq('is_active', true)
        .eq('payment_received', false)
        .not('payment_date_estimated', 'is', null)
        .order('payment_date_estimated', { ascending: true });

      if (paymentsError) throw paymentsError;

      // Fetch deal stages for labeling
      const { data: stagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label');

      if (stagesError) throw stagesError;

      const stageMap = new Map<string, string>();
      stagesData?.forEach(stage => {
        stageMap.set(stage.id, stage.label);
      });

      // Transform data into PaymentDashboardRow format
      const transformedPayments: PaymentDashboardRow[] = (paymentsData || [])
        .map((payment: any): PaymentDashboardRow | null => {
          const dealStage = payment.deal?.stage_id ? stageMap.get(payment.deal.stage_id) || null : null;

          // Filter out Lost stage deals
          if (dealStage === 'Lost') return null;

          return {
            payment_id: payment.id,
            payment_sf_id: null,
            deal_id: payment.deal_id,
            deal_name: payment.deal?.deal_name || 'Unknown Deal',
            deal_stage: dealStage,
            payment_sequence: payment.payment_sequence || 1,
            total_payments: payment.deal?.number_of_payments || 1,
            payment_amount: payment.payment_amount || 0,
            payment_date_estimated: payment.payment_date_estimated,
            payment_received: payment.payment_received || false,
            payment_received_date: payment.payment_received_date,
            orep_invoice: payment.orep_invoice,
            invoice_sent: payment.invoice_sent || false,
            payment_invoice_date: payment.payment_invoice_date,
            locked: payment.locked || false,
            broker_splits: [],
            total_broker_amount: 0,
            all_brokers_paid: false,
            referral_fee_usd: null,
            referral_fee_paid: false,
            referral_fee_paid_date: null,
            referral_payee_name: null,
            referral_payee_client_id: null,
            qb_invoice_id: payment.qb_invoice_id,
            qb_invoice_number: payment.qb_invoice_number,
            qb_sync_status: null,
            qb_last_sync: null,
          };
        })
        .filter((p): p is PaymentDashboardRow => p !== null);

      setPayments(transformedPayments);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
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

  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const today = getLocalDateString();
  const thirtyDaysFromNow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // Split into overdue and upcoming (next 30 days), but always include pinned payments
  const overduePayments = payments.filter(p =>
    pinnedPaymentIds.has(p.payment_id) || (p.payment_date_estimated && p.payment_date_estimated < today)
  );
  const upcomingPayments = payments.filter(p =>
    pinnedPaymentIds.has(p.payment_id) || (
      p.payment_date_estimated &&
      p.payment_date_estimated >= today &&
      p.payment_date_estimated <= thirtyDaysFromNow
    )
  );

  // Calculate totals
  const overdueTotal = overduePayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
  const upcomingTotal = upcomingPayments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);

  const getDaysOverdue = (dateString: string) => {
    const estDate = new Date(dateString + 'T00:00:00');
    const now = new Date();
    const diffTime = now.getTime() - estDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getDaysUntil = (dateString: string) => {
    const estDate = new Date(dateString + 'T00:00:00');
    const now = new Date();
    const diffTime = estDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleUpdateEstimatedDate = async (paymentId: string, newDate: string) => {
    const { error } = await supabase
      .from('payment')
      .update({ payment_date_estimated: newDate || null })
      .eq('id', paymentId);

    if (error) {
      console.error('Error updating date:', error);
      alert('Failed to update date');
      return;
    }

    onPaymentUpdate();
    fetchPayments();
  };

  const handleMarkReceived = async (paymentId: string) => {
    const { error } = await supabase
      .from('payment')
      .update({
        payment_received: true,
        payment_received_date: getLocalDateString()
      })
      .eq('id', paymentId);

    if (error) {
      console.error('Error marking received:', error);
      alert('Failed to mark as received');
      return;
    }

    onPaymentUpdate();
    fetchPayments();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const handlePinPayment = (paymentId: string) => {
    setPinnedPaymentIds(prev => new Set(prev).add(paymentId));
  };

  const handleUnpinPayment = (paymentId: string) => {
    setPinnedPaymentIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(paymentId);
      return newSet;
    });
  };

  const renderPaymentTable = (paymentList: PaymentDashboardRow[], isOverdue: boolean) => {
    if (paymentList.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          {isOverdue ? 'No overdue payments' : 'No upcoming payments in the next 30 days'}
        </div>
      );
    }

    return (
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-8 px-2 py-3"></th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Date</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              {isOverdue ? 'Days Overdue' : 'Days Until'}
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Invoice</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {paymentList.map((payment) => {
            const days = isOverdue
              ? getDaysOverdue(payment.payment_date_estimated!)
              : getDaysUntil(payment.payment_date_estimated!);
            const isPinned = pinnedPaymentIds.has(payment.payment_id);

            return (
              <tr key={payment.payment_id} className={`hover:bg-gray-50 ${isPinned ? 'bg-blue-50 border-l-4 border-l-blue-400' : ''}`}>
                <td className="px-2 py-3">
                  {isPinned && (
                    <button
                      onClick={() => handleUnpinPayment(payment.payment_id)}
                      className="text-blue-400 hover:text-blue-600 p-0.5 rounded hover:bg-blue-100"
                      title="Unpin payment (remove from view)"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/deal/${payment.deal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:text-blue-900 hover:underline"
                  >
                    {payment.deal_name}
                  </a>
                  {payment.deal_stage && (
                    <div className="text-xs text-gray-500">{payment.deal_stage}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {payment.payment_sequence} of {payment.total_payments}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                  {formatCurrency(payment.payment_amount)}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="date"
                    value={payment.payment_date_estimated || ''}
                    onFocus={() => {
                      // Pin the payment when date picker is opened so it stays visible during editing
                      if (!isPinned) {
                        handlePinPayment(payment.payment_id);
                      }
                    }}
                    onChange={(e) => handleUpdateEstimatedDate(payment.payment_id, e.target.value)}
                    className="border-0 bg-transparent px-0 py-0 text-sm text-gray-900 focus:outline-none focus:ring-0 cursor-text"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isOverdue
                      ? days > 30
                        ? 'bg-red-100 text-red-800'
                        : days > 14
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-yellow-100 text-yellow-800'
                      : days <= 7
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}>
                    {days} {days === 1 ? 'day' : 'days'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-sm">
                  {payment.orep_invoice ? (
                    <span className="text-gray-900">{payment.orep_invoice}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleMarkReceived(payment.payment_id)}
                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Received
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="space-y-8">
      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-red-800">Overdue Payments</div>
              <div className="text-2xl font-bold text-red-900">{overduePayments.length}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-red-700">Total</div>
              <div className="text-xl font-semibold text-red-900">{formatCurrency(overdueTotal)}</div>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-800">Due in Next 30 Days</div>
              <div className="text-2xl font-bold text-blue-900">{upcomingPayments.length}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-700">Total</div>
              <div className="text-xl font-semibold text-blue-900">{formatCurrency(upcomingTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Section */}
      <div>
        <h3 className="text-lg font-semibold text-red-900 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Overdue Payments
        </h3>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {renderPaymentTable(overduePayments, true)}
        </div>
      </div>

      {/* Upcoming Section */}
      <div>
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Upcoming Payments (Next 30 Days)
        </h3>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {renderPaymentTable(upcomingPayments, false)}
        </div>
      </div>
    </div>
  );
};

export default AgedUpcomingPaymentsTab;
