import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  DisbursementRow,
  DisbursementFilters,
  DisbursementSummary
} from '../../types/disbursement-report';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

const DisbursementReportTab: React.FC = () => {
  const [disbursements, setDisbursements] = useState<DisbursementRow[]>([]);
  const [filteredDisbursements, setFilteredDisbursements] = useState<DisbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DisbursementSummary | null>(null);
  const [payeeOptions, setPayeeOptions] = useState<string[]>([]);

  const [filters, setFilters] = useState<DisbursementFilters>({
    searchQuery: '',
    payeeFilter: null,
    disbursementStatus: 'all',
    receivedStatus: 'all',
    dateRange: { start: null, end: null },
    type: 'all',
  });

  useEffect(() => {
    fetchDisbursements();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [disbursements, filters]);

  const fetchDisbursements = async () => {
    try {
      setLoading(true);

      // Fetch all payments with broker splits and referral fees
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          deal_id,
          payment_sequence,
          orep_invoice,
          qb_invoice_number,
          payment_received,
          referral_fee_paid,
          referral_fee_paid_date,
          deal!inner (
            deal_name,
            number_of_payments,
            referral_fee_usd,
            referral_payee_client_id,
            client!deal_referral_payee_client_id_fkey (
              client_name
            )
          )
        `);

      if (paymentsError) throw paymentsError;

      // Fetch all broker payment splits
      const { data: splitsData, error: splitsError } = await supabase
        .from('payment_split')
        .select(`
          id,
          payment_id,
          broker_id,
          split_broker_total,
          paid,
          paid_date,
          broker!inner (
            name
          )
        `);

      if (splitsError) throw splitsError;

      const allDisbursements: DisbursementRow[] = [];
      const payeeSet = new Set<string>();

      // Process broker splits
      splitsData?.forEach((split: any) => {
        const payment = paymentsData?.find((p: any) => p.id === split.payment_id);
        if (!payment) return;

        const totalPayments = payment.deal?.number_of_payments || 1;
        const paymentName = `Payment ${payment.payment_sequence} of ${totalPayments}`;

        allDisbursements.push({
          id: `broker-${split.id}`,
          type: 'broker',
          payee_name: split.broker?.name || 'Unknown',
          payee_id: split.broker_id,
          deal_id: payment.deal_id,
          deal_name: payment.deal?.deal_name || 'Unknown',
          ovis_invoice: payment.orep_invoice,
          qbo_invoice_number: payment.qb_invoice_number,
          payment_id: payment.id,
          payment_sequence: payment.payment_sequence,
          total_payments: totalPayments,
          payment_name: paymentName,
          amount: split.split_broker_total || 0,
          paid_date: split.paid_date,
          payment_received: payment.payment_received || false,
          disbursement_paid: split.paid || false,
        });

        payeeSet.add(split.broker?.name || 'Unknown');
      });

      // Process referral fees
      paymentsData?.forEach((payment: any) => {
        const referralFeeTotal = payment.deal?.referral_fee_usd || 0;
        const totalPayments = payment.deal?.number_of_payments || 1;
        const referralFeePerPayment = referralFeeTotal / totalPayments;

        if (referralFeePerPayment > 0 && payment.deal?.referral_payee_client_id) {
          const payeeName = payment.deal?.client?.client_name || 'Unknown';
          const paymentName = `Payment ${payment.payment_sequence} of ${totalPayments}`;

          allDisbursements.push({
            id: `referral-${payment.id}`,
            type: 'referral',
            payee_name: payeeName,
            payee_id: payment.deal.referral_payee_client_id,
            deal_id: payment.deal_id,
            deal_name: payment.deal?.deal_name || 'Unknown',
            ovis_invoice: payment.orep_invoice,
            qbo_invoice_number: payment.qb_invoice_number,
            payment_id: payment.id,
            payment_sequence: payment.payment_sequence,
            total_payments: totalPayments,
            payment_name: paymentName,
            amount: referralFeePerPayment,
            paid_date: payment.referral_fee_paid_date,
            payment_received: payment.payment_received || false,
            disbursement_paid: payment.referral_fee_paid || false,
          });

          payeeSet.add(payeeName);
        }
      });

      // Sort by paid date (most recent first), then by unpaid
      allDisbursements.sort((a, b) => {
        if (a.paid_date && b.paid_date) {
          return new Date(b.paid_date).getTime() - new Date(a.paid_date).getTime();
        }
        if (a.paid_date && !b.paid_date) return -1;
        if (!a.paid_date && b.paid_date) return 1;
        return a.payee_name.localeCompare(b.payee_name);
      });

      setDisbursements(allDisbursements);
      setPayeeOptions(Array.from(payeeSet).sort());
      calculateSummary(allDisbursements);
    } catch (error) {
      console.error('Error fetching disbursements:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (data: DisbursementRow[]) => {
    const summary: DisbursementSummary = {
      total_disbursements: data.length,
      total_amount: data.reduce((sum, d) => sum + d.amount, 0),
      paid_disbursements: data.filter(d => d.disbursement_paid).length,
      paid_amount: data.filter(d => d.disbursement_paid).reduce((sum, d) => sum + d.amount, 0),
      unpaid_disbursements: data.filter(d => !d.disbursement_paid).length,
      unpaid_amount: data.filter(d => !d.disbursement_paid).reduce((sum, d) => sum + d.amount, 0),
    };
    setSummary(summary);
  };

  const applyFilters = () => {
    let filtered = [...disbursements];

    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.payee_name.toLowerCase().includes(query) ||
        d.deal_name.toLowerCase().includes(query) ||
        (d.ovis_invoice && d.ovis_invoice.toLowerCase().includes(query)) ||
        (d.qbo_invoice_number && d.qbo_invoice_number.toLowerCase().includes(query))
      );
    }

    // Payee filter
    if (filters.payeeFilter) {
      filtered = filtered.filter(d => d.payee_name === filters.payeeFilter);
    }

    // Disbursement status filter
    if (filters.disbursementStatus !== 'all') {
      if (filters.disbursementStatus === 'paid') {
        filtered = filtered.filter(d => d.disbursement_paid);
      } else if (filters.disbursementStatus === 'unpaid') {
        filtered = filtered.filter(d => !d.disbursement_paid);
      }
    }

    // Received status filter
    if (filters.receivedStatus !== 'all') {
      if (filters.receivedStatus === 'received') {
        filtered = filtered.filter(d => d.payment_received);
      } else if (filters.receivedStatus === 'pending') {
        filtered = filtered.filter(d => !d.payment_received);
      }
    }

    // Type filter
    if (filters.type !== 'all') {
      filtered = filtered.filter(d => d.type === filters.type);
    }

    // Date range filter (on paid_date)
    if (filters.dateRange.start || filters.dateRange.end) {
      filtered = filtered.filter(d => {
        if (!d.paid_date) return false;
        const date = new Date(d.paid_date);
        if (filters.dateRange.start && date < new Date(filters.dateRange.start)) return false;
        if (filters.dateRange.end && date > new Date(filters.dateRange.end)) return false;
        return true;
      });
    }

    setFilteredDisbursements(filtered);
  };

  const formatCurrency = (amount: number) => {
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

  const BROKER_SHORTCUTS = [
    { label: "Mike's Disbursements", brokerName: 'Mike Minihan' },
    { label: "Greg's Disbursements", brokerName: 'Greg Bennett' },
    { label: "Arty's Disbursements", brokerName: 'Arty Santos' },
  ];

  const handleShortcutChange = (brokerName: string) => {
    if (brokerName) {
      setFilters(prev => ({ ...prev, payeeFilter: brokerName }));
    } else {
      setFilters(prev => ({ ...prev, payeeFilter: null }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Shortcuts */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Quick Shortcuts</label>
        <select
          value={filters.payeeFilter || ''}
          onChange={(e) => handleShortcutChange(e.target.value)}
          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Select a broker...</option>
          {BROKER_SHORTCUTS.map(shortcut => (
            <option key={shortcut.brokerName} value={shortcut.brokerName}>
              {shortcut.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-500">Total Disbursements</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-2xl font-semibold text-gray-900">{summary.total_disbursements}</div>
              <div className="ml-2 text-sm text-gray-500">{formatCurrency(summary.total_amount)}</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-500">Paid</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-2xl font-semibold text-green-600">{summary.paid_disbursements}</div>
              <div className="ml-2 text-sm text-gray-500">{formatCurrency(summary.paid_amount)}</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-500">Unpaid</div>
            <div className="mt-2 flex items-baseline">
              <div className="text-2xl font-semibold text-orange-600">{summary.unpaid_disbursements}</div>
              <div className="ml-2 text-sm text-gray-500">{formatCurrency(summary.unpaid_amount)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                placeholder="Payee, deal, invoice..."
                className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Payee Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payee</label>
            <select
              value={filters.payeeFilter || ''}
              onChange={(e) => setFilters(prev => ({ ...prev, payeeFilter: e.target.value || null }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Payees</option>
              {payeeOptions.map(payee => (
                <option key={payee} value={payee}>{payee}</option>
              ))}
            </select>
          </div>

          {/* Disbursement Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Disbursement Status</label>
            <select
              value={filters.disbursementStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, disbursementStatus: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>

          {/* Received Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Payment Received Status</label>
            <select
              value={filters.receivedStatus}
              onChange={(e) => setFilters(prev => ({ ...prev, receivedStatus: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="received">Received</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="broker">Broker</option>
              <option value="referral">Referral</option>
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Paid Date Range</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={filters.dateRange.start || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  dateRange: { ...prev.dateRange, start: e.target.value || null }
                }))}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="date"
                value={filters.dateRange.end || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  dateRange: { ...prev.dateRange, end: e.target.value || null }
                }))}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Clear Filters Button */}
        {(filters.searchQuery || filters.payeeFilter || filters.disbursementStatus !== 'all' ||
          filters.receivedStatus !== 'all' || filters.type !== 'all' ||
          filters.dateRange.start || filters.dateRange.end) && (
          <button
            onClick={() => setFilters({
              searchQuery: '',
              payeeFilter: null,
              disbursementStatus: 'all',
              receivedStatus: 'all',
              dateRange: { start: null, end: null },
              type: 'all',
            })}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        <span className="font-medium text-gray-900">{filteredDisbursements.length}</span>
        {filteredDisbursements.length === 1 ? ' disbursement' : ' disbursements'} found
        {filteredDisbursements.length !== disbursements.length && (
          <span className="text-gray-500"> (filtered from {disbursements.length} total)</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-500">Loading disbursements...</p>
          </div>
        ) : filteredDisbursements.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No disbursements found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Broker/Payee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Deal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    OVIS INV#
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QBO INV#
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paid Date
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Received
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Disbursement
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDisbursements.map((disbursement) => (
                  <tr key={disbursement.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        disbursement.type === 'broker'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {disbursement.type === 'broker' ? 'Broker' : 'Referral'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {disbursement.payee_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {disbursement.deal_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {disbursement.ovis_invoice || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {disbursement.qbo_invoice_number || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {disbursement.payment_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(disbursement.amount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(disbursement.paid_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {disbursement.payment_received ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mx-auto" title="Payment Received" />
                      ) : (
                        <ClockIcon className="h-5 w-5 text-gray-400 mx-auto" title="Payment Pending" />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {disbursement.disbursement_paid ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mx-auto" title="Disbursement Paid" />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-orange-500 mx-auto" title="Disbursement Unpaid" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DisbursementReportTab;
