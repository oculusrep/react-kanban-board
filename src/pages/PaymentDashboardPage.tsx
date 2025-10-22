import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Payment, PaymentSplit, Broker, Deal, Client } from '../lib/types';
import {
  PaymentDashboardRow,
  BrokerPaymentSplit,
  ReferralFeeInfo,
  PaymentDashboardFilters,
  PaymentSummaryStats
} from '../types/payment-dashboard';
import { CurrencyDollarIcon, ClockIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import PaymentDashboardTable from '../components/payments/PaymentDashboardTable';

type TabType = 'dashboard' | 'comparison';

const PaymentDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Filter state
  const [filters, setFilters] = useState<PaymentDashboardFilters>({
    dateFrom: null,
    dateTo: null,
    showPaidOnly: false,
    showUnpaidOnly: false,
    showPartiallyPaid: false,
    brokerId: null,
    dealId: null,
    clientId: null,
    searchTerm: ''
  });

  // Fetch all data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all payments with their related deals
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select('*')
        .order('payment_received_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Fetch all payment splits
      const { data: splitsData, error: splitsError } = await supabase
        .from('payment_split')
        .select('*');

      if (splitsError) throw splitsError;

      // Fetch all brokers
      const { data: brokersData, error: brokersError } = await supabase
        .from('broker')
        .select('*')
        .order('name');

      if (brokersError) throw brokersError;

      // Fetch all deals
      const { data: dealsData, error: dealsError } = await supabase
        .from('deal')
        .select('*');

      if (dealsError) throw dealsError;

      // Fetch all clients (for referral payee names)
      const { data: clientsData, error: clientsError } = await supabase
        .from('client')
        .select('*');

      if (clientsError) throw clientsError;

      setPayments(paymentsData || []);
      setPaymentSplits(splitsData || []);
      setBrokers(brokersData || []);
      setDeals(dealsData || []);
      setClients(clientsData || []);

    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Failed to load payment dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Transform data into dashboard rows
  const dashboardRows: PaymentDashboardRow[] = useMemo(() => {
    return payments.map(payment => {
      const deal = deals.find(d => d.id === payment.deal_id);
      if (!deal) return null;

      // Get payment splits for this payment
      const splits = paymentSplits.filter(ps => ps.payment_id === payment.id);

      // Calculate broker splits
      const brokerSplits: BrokerPaymentSplit[] = splits.map(split => {
        const broker = brokers.find(b => b.id === split.broker_id);
        const brokerName = broker?.name || 'Unknown Broker';

        return {
          splitId: split.id,
          brokerId: split.broker_id,
          brokerName,
          originationAmount: split.origination_usd || 0,
          siteAmount: split.site_usd || 0,
          dealAmount: split.deal_usd || 0,
          totalAmount: (split.origination_usd || 0) + (split.site_usd || 0) + (split.deal_usd || 0),
          originationPercent: split.origination_percent || 0,
          sitePercent: split.site_percent || 0,
          dealPercent: split.deal_percent || 0,
          paid: split.paid || false,
          paidDate: split.paid_date,
          paymentSplit: split
        };
      });

      // Calculate referral fee info (if applicable)
      let referralFee: ReferralFeeInfo | undefined;
      if (deal.referral_fee_usd && deal.referral_fee_usd > 0) {
        const referralPayeeClient = clients.find(c => c.id === deal.referral_payee_client_id);
        const numberOfPayments = deal.number_of_payments || 1;

        referralFee = {
          payeeClientId: deal.referral_payee_client_id || '',
          payeeName: referralPayeeClient?.client_name || 'Unknown',
          amount: (deal.referral_fee_usd || 0) / numberOfPayments,
          percent: deal.referral_fee_percent,
          paid: payment.referral_fee_paid || false,
          paidDate: payment.referral_fee_paid_date
        };
      }

      // Calculate totals
      const totalBrokerCommission = brokerSplits.reduce((sum, bs) => sum + bs.totalAmount, 0);
      const totalPaidOut = brokerSplits
        .filter(bs => bs.paid)
        .reduce((sum, bs) => sum + bs.totalAmount, 0)
        + (referralFee?.paid ? referralFee.amount : 0);
      const totalUnpaid = totalBrokerCommission + (referralFee?.amount || 0) - totalPaidOut;

      // Status flags
      const allBrokersPaid = brokerSplits.length > 0 && brokerSplits.every(bs => bs.paid);
      const referralPaid = !referralFee || referralFee.paid;
      const fullyDisbursed = allBrokersPaid && referralPaid;

      return {
        payment,
        deal,
        brokerSplits,
        referralFee,
        totalBrokerCommission,
        totalPaidOut,
        totalUnpaid,
        allBrokersPaid,
        referralPaid,
        fullyDisbursed
      };
    }).filter(row => row !== null) as PaymentDashboardRow[];
  }, [payments, paymentSplits, brokers, deals, clients]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return dashboardRows.filter(row => {
      // Date filters
      if (filters.dateFrom && row.payment.payment_received_date) {
        if (new Date(row.payment.payment_received_date) < new Date(filters.dateFrom)) {
          return false;
        }
      }
      if (filters.dateTo && row.payment.payment_received_date) {
        if (new Date(row.payment.payment_received_date) > new Date(filters.dateTo)) {
          return false;
        }
      }

      // Status filters
      if (filters.showPaidOnly && !row.fullyDisbursed) return false;
      if (filters.showUnpaidOnly && row.fullyDisbursed) return false;
      if (filters.showPartiallyPaid && (row.fullyDisbursed || row.totalPaidOut === 0)) return false;

      // Entity filters
      if (filters.brokerId && !row.brokerSplits.some(bs => bs.brokerId === filters.brokerId)) {
        return false;
      }
      if (filters.dealId && row.deal.id !== filters.dealId) return false;
      if (filters.clientId && row.deal.client_id !== filters.clientId) return false;

      // Search term
      if (filters.searchTerm) {
        const term = filters.searchTerm.toLowerCase();
        const dealName = row.deal.deal_name?.toLowerCase() || '';
        const brokerNames = row.brokerSplits.map(bs => bs.brokerName.toLowerCase()).join(' ');
        if (!dealName.includes(term) && !brokerNames.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [dashboardRows, filters]);

  // Calculate summary stats
  const summaryStats: PaymentSummaryStats = useMemo(() => {
    const totalPayments = filteredRows.length;
    const fullyPaidPayments = filteredRows.filter(row => row.fullyDisbursed).length;
    const unpaidPayments = filteredRows.filter(row => row.totalPaidOut === 0).length;
    const partiallyPaidPayments = totalPayments - fullyPaidPayments - unpaidPayments;

    const totalCommissionReceived = filteredRows.reduce((sum, row) => sum + (row.payment.payment_amount || 0), 0);
    const totalDisbursed = filteredRows.reduce((sum, row) => sum + row.totalPaidOut, 0);
    const totalPendingDisbursement = filteredRows.reduce((sum, row) => sum + row.totalUnpaid, 0);

    const totalBrokersAwaitingPayment = filteredRows.reduce((sum, row) => {
      return sum + row.brokerSplits.filter(bs => !bs.paid).length;
    }, 0);

    const totalReferralFeesUnpaid = filteredRows.filter(row => row.referralFee && !row.referralFee.paid).length;

    return {
      totalPayments,
      fullyPaidPayments,
      partiallyPaidPayments,
      unpaidPayments,
      totalCommissionReceived,
      totalDisbursed,
      totalPendingDisbursement,
      totalBrokersAwaitingPayment,
      totalReferralFeesUnpaid
    };
  }, [filteredRows]);

  // Handle payment split paid status update
  const handleUpdatePaymentSplitPaid = async (splitId: string, paid: boolean) => {
    try {
      const { error } = await supabase
        .from('payment_split')
        .update({
          paid,
          paid_date: paid ? new Date().toISOString() : null
        })
        .eq('id', splitId);

      if (error) throw error;

      // Refresh data
      await fetchDashboardData();
    } catch (err: any) {
      console.error('Error updating payment split:', err);
      alert('Failed to update payment status');
    }
  };

  // Handle referral fee paid status update
  const handleUpdateReferralPaid = async (paymentId: string, paid: boolean) => {
    try {
      const { error } = await supabase
        .from('payment')
        .update({
          referral_fee_paid: paid,
          referral_fee_paid_date: paid ? new Date().toISOString() : null
        })
        .eq('id', paymentId);

      if (error) throw error;

      // Refresh data
      await fetchDashboardData();
    } catch (err: any) {
      console.error('Error updating referral payment:', err);
      alert('Failed to update referral payment status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-red-600 mx-auto" />
          <p className="mt-4 text-red-600 font-medium">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Payment Dashboard</h1>
        <p className="text-sm text-gray-600 mt-1">Track commission payments and disbursements</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'comparison'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Salesforce Comparison
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CurrencyDollarIcon className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Received</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${summaryStats.totalCommissionReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Total Disbursed</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${summaryStats.totalDisbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ClockIcon className="h-8 w-8 text-orange-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Pending Disbursement</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      ${summaryStats.totalPendingDisbursement.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ExclamationCircleIcon className="h-8 w-8 text-red-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-500">Awaiting Payment</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {summaryStats.totalBrokersAwaitingPayment} broker{summaryStats.totalBrokersAwaitingPayment !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Table */}
            <PaymentDashboardTable
              rows={filteredRows}
              onUpdatePaymentSplitPaid={handleUpdatePaymentSplitPaid}
              onUpdateReferralPaid={handleUpdateReferralPaid}
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Salesforce comparison report coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentDashboardPage;
