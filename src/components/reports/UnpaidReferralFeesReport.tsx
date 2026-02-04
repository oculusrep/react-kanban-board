import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface UnpaidReferralFee {
  id: string;
  dealId: string;
  dealName: string;
  paymentName: string;
  paymentAmount: number;
  paymentReceivedDate: string | null;
  referralFeeUsd: number;
  referralPayeeName: string | null;
  qbInvoiceNumber: string | null;
}

export default function UnpaidReferralFeesReport() {
  const [loading, setLoading] = useState(true);
  const [unpaidFees, setUnpaidFees] = useState<UnpaidReferralFee[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUnpaidReferralFees();
  }, []);

  const fetchUnpaidReferralFees = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch payments that have been received since 1/1/2025 with unpaid referral fees
      const { data: payments, error: paymentError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_name,
          payment_amount,
          payment_received_date,
          referral_fee_usd,
          referral_fee_paid,
          qb_invoice_number,
          deal:deal_id (
            id,
            deal_name,
            referral_payee_client_id,
            referral_payee:referral_payee_client_id (
              id,
              client_name
            )
          )
        `)
        .eq('payment_received', true)
        .eq('is_active', true)
        .gt('referral_fee_usd', 0)
        .or('referral_fee_paid.eq.false,referral_fee_paid.is.null')
        .gte('payment_received_date', '2025-01-01')
        .order('payment_received_date', { ascending: false });

      if (paymentError) throw paymentError;

      // Process payments
      const processedFees: UnpaidReferralFee[] = (payments || [])
        .filter(p => (p.referral_fee_usd || 0) > 0)
        .map(payment => {
          const deal = payment.deal as any;
          const referralPayee = deal?.referral_payee as any;

          return {
            id: payment.id,
            dealId: payment.deal_id,
            dealName: deal?.deal_name || 'Unknown Deal',
            paymentName: payment.payment_name || 'Payment',
            paymentAmount: payment.payment_amount || 0,
            paymentReceivedDate: payment.payment_received_date,
            referralFeeUsd: payment.referral_fee_usd || 0,
            referralPayeeName: referralPayee?.client_name || null,
            qbInvoiceNumber: payment.qb_invoice_number,
          };
        })
        .sort((a, b) => {
          // Sort by received date descending
          if (!a.paymentReceivedDate && !b.paymentReceivedDate) return 0;
          if (!a.paymentReceivedDate) return 1;
          if (!b.paymentReceivedDate) return -1;
          return new Date(b.paymentReceivedDate).getTime() - new Date(a.paymentReceivedDate).getTime();
        });

      setUnpaidFees(processedFees);
    } catch (err: any) {
      console.error('Error fetching unpaid referral fees:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const totalUnpaid = useMemo(() => {
    return unpaidFees.reduce((sum, fee) => sum + fee.referralFeeUsd, 0);
  }, [unpaidFees]);

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error loading report</h3>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={fetchUnpaidReferralFees}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg p-6 text-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium opacity-90">Total Unpaid Referral Fees</h2>
            <p className="text-3xl font-bold mt-1">{formatCurrency(totalUnpaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">Unpaid Payments</p>
            <p className="text-2xl font-semibold">{unpaidFees.length}</p>
          </div>
        </div>
        <p className="text-sm opacity-75 mt-4">
          From paid invoices since January 1, 2025
        </p>
      </div>

      {/* Table */}
      {unpaidFees.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-800 font-medium">All caught up!</p>
          <p className="text-green-600 text-sm mt-1">
            No unpaid referral fees on received payments since 1/1/2025.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Referral Payee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Received
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Amount
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Referral Fee
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unpaidFees.map((fee) => (
                  <tr key={fee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <a
                        href={`/deals/${fee.dealId}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {fee.dealName}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {fee.paymentName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {fee.referralPayeeName || <span className="text-gray-400 italic">Not set</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(fee.paymentReceivedDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatCurrency(fee.paymentAmount)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-purple-600 text-right">
                      {formatCurrency(fee.referralFeeUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    Total Unpaid:
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-purple-700 text-right">
                    {formatCurrency(totalUnpaid)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchUnpaidReferralFees}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}
