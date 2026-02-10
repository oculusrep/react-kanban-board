import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Mike Minihan's broker ID
const MIKE_BROKER_ID = '38d4b67c-841d-4590-a909-523d3a4c6e4b';

interface OwedSplit {
  id: string;
  paymentId: string;
  dealId: string;
  dealName: string;
  paymentName: string;
  paymentAmount: number;
  paymentReceivedDate: string | null;
  splitAmount: number;
  splitOriginationUsd: number | null;
  splitSiteUsd: number | null;
  splitDealUsd: number | null;
  qbInvoiceNumber: string | null;
}

export default function MikeIsOwedReport() {
  const [loading, setLoading] = useState(true);
  const [owedSplits, setOwedSplits] = useState<OwedSplit[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOwedSplits();
  }, []);

  const fetchOwedSplits = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch payments that have been received since 1/1/2025
      const { data: payments, error: paymentError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_name,
          payment_amount,
          payment_received_date,
          qb_invoice_number,
          deal:deal_id (
            id,
            deal_name
          )
        `)
        .eq('payment_received', true)
        .eq('is_active', true)
        .gte('payment_received_date', '2026-01-01')
        .order('payment_received_date', { ascending: false });

      if (paymentError) throw paymentError;

      if (!payments || payments.length === 0) {
        setOwedSplits([]);
        setLoading(false);
        return;
      }

      const paymentIds = payments.map(p => p.id);

      // Fetch Mike's unpaid splits for these payments
      const { data: splits, error: splitError } = await supabase
        .from('payment_split')
        .select(`
          id,
          payment_id,
          split_broker_total,
          split_origination_usd,
          split_site_usd,
          split_deal_usd,
          paid
        `)
        .in('payment_id', paymentIds)
        .eq('broker_id', MIKE_BROKER_ID)
        .or('paid.eq.false,paid.is.null');

      if (splitError) throw splitError;

      // Build payment map for quick lookup
      const paymentMap = new Map(payments.map(p => [p.id, p]));

      // Process splits
      const processedSplits: OwedSplit[] = (splits || [])
        .filter(s => (s.split_broker_total || 0) > 0)
        .map(split => {
          const payment = paymentMap.get(split.payment_id);
          const deal = payment?.deal as any;

          return {
            id: split.id,
            paymentId: split.payment_id,
            dealId: payment?.deal_id || '',
            dealName: deal?.deal_name || 'Unknown Deal',
            paymentName: payment?.payment_name || 'Payment',
            paymentAmount: payment?.payment_amount || 0,
            paymentReceivedDate: payment?.payment_received_date,
            splitAmount: split.split_broker_total || 0,
            splitOriginationUsd: split.split_origination_usd,
            splitSiteUsd: split.split_site_usd,
            splitDealUsd: split.split_deal_usd,
            qbInvoiceNumber: payment?.qb_invoice_number,
          };
        })
        .sort((a, b) => {
          // Sort by received date descending
          if (!a.paymentReceivedDate && !b.paymentReceivedDate) return 0;
          if (!a.paymentReceivedDate) return 1;
          if (!b.paymentReceivedDate) return -1;
          return new Date(b.paymentReceivedDate).getTime() - new Date(a.paymentReceivedDate).getTime();
        });

      setOwedSplits(processedSplits);
    } catch (err: any) {
      console.error('Error fetching owed splits:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const totalOwed = useMemo(() => {
    return owedSplits.reduce((sum, split) => sum + split.splitAmount, 0);
  }, [owedSplits]);

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
          onClick={fetchOwedSplits}
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
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium opacity-90">Total Owed to Mike</h2>
            <p className="text-3xl font-bold mt-1">{formatCurrency(totalOwed)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-75">Unpaid Splits</p>
            <p className="text-2xl font-semibold">{owedSplits.length}</p>
          </div>
        </div>
        <p className="text-sm opacity-75 mt-4">
          From paid invoices since January 1, 2026
        </p>
      </div>

      {/* Table */}
      {owedSplits.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <p className="text-green-800 font-medium">All caught up!</p>
          <p className="text-green-600 text-sm mt-1">
            No unpaid splits for Mike on received payments since 1/1/2026.
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
                    QB Invoice
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Received
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Amount
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mike's Split
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {owedSplits.map((split) => (
                  <tr key={split.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <a
                        href={`/deal/${split.dealId}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {split.dealName}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {split.paymentName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {split.qbInvoiceNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(split.paymentReceivedDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {formatCurrency(split.paymentAmount)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">
                      {formatCurrency(split.splitAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    Total Owed:
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-green-700 text-right">
                    {formatCurrency(totalOwed)}
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
          onClick={fetchOwedSplits}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}
