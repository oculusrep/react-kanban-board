import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  PaymentDashboardRow,
  PaymentDashboardFilters,
  PaymentSummaryStats
} from '../types/payment-dashboard';
import PaymentDashboardTable from '../components/payments/PaymentDashboardTable';
import PaymentDashboardFiltersBar from '../components/payments/PaymentDashboardFiltersBar';
import PaymentSummaryCards from '../components/payments/PaymentSummaryCards';
import ComparisonReportTab from '../components/payments/ComparisonReportTab';
import PaymentDiscrepancyReport from '../components/payments/PaymentDiscrepancyReport';
import SplitValidationTab from '../components/payments/SplitValidationTab';
import ReconciliationReport from '../components/payments/ReconciliationReport';
import PaymentReconciliationReport from '../components/payments/PaymentReconciliationReport';

type TabType = 'dashboard' | 'comparison' | 'discrepancies' | 'validation' | 'deal-reconciliation' | 'payment-reconciliation';

const PaymentDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [payments, setPayments] = useState<PaymentDashboardRow[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PaymentSummaryStats | null>(null);

  const [filters, setFilters] = useState<PaymentDashboardFilters>({
    searchQuery: '',
    paymentStatus: 'all',
    payoutStatus: 'all',
    dateRange: { start: null, end: null },
    dealStages: [],
    dealId: null,
  });

  // Fetch all payment data
  useEffect(() => {
    fetchPaymentData();
  }, []);

  // Set up real-time subscriptions for automatic updates
  useEffect(() => {
    // Subscribe to payment table changes
    const paymentSubscription = supabase
      .channel('payment-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment'
        },
        (payload) => {
          console.log('💰 Payment change detected:', payload.eventType);
          fetchPaymentData();
        }
      )
      .subscribe();

    // Subscribe to payment_split table changes (triggered by database triggers)
    const paymentSplitSubscription = supabase
      .channel('payment-split-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_split'
        },
        (payload) => {
          console.log('📊 Payment split change detected:', payload.eventType);
          fetchPaymentData();
        }
      )
      .subscribe();

    // Subscribe to commission_split changes (will trigger payment_split updates)
    const commissionSplitSubscription = supabase
      .channel('commission-split-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'commission_split'
        },
        (payload) => {
          console.log('🎯 Commission split change detected, payment splits will auto-update');
          // The database trigger will update payment_splits, which will trigger the above subscription
          // But let's refetch immediately to show the change faster
          fetchPaymentData();
        }
      )
      .subscribe();

    // Subscribe to deal changes (for fee/payment count changes)
    const dealSubscription = supabase
      .channel('deal-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deal'
        },
        (payload) => {
          console.log('💼 Deal change detected, payments may auto-update');
          fetchPaymentData();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(paymentSubscription);
      supabase.removeChannel(paymentSplitSubscription);
      supabase.removeChannel(commissionSplitSubscription);
      supabase.removeChannel(dealSubscription);
    };
  }, []);

  // Apply filters whenever payments or filters change
  useEffect(() => {
    applyFilters();
  }, [payments, filters]);

  const fetchPaymentData = async () => {
    try {
      setLoading(true);

      // Fetch payments with related data
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          sf_id,
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
          qb_sync_status,
          qb_last_sync,
          referral_fee_paid,
          referral_fee_paid_date,
          locked,
          deal!inner (
            deal_name,
            stage_id,
            number_of_payments,
            referral_fee_usd,
            referral_payee_client_id,
            client!deal_referral_payee_client_id_fkey (
              client_name
            )
          )
        `)
        .order('payment_received_date', { ascending: false, nullsFirst: false })
        .order('payment_date_estimated', { ascending: false, nullsFirst: false });

      if (paymentsError) throw paymentsError;

      // Fetch deal stages separately
      const { data: stagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label');

      if (stagesError) throw stagesError;

      // Create stage lookup map
      const stageMap = new Map<string, string>();
      stagesData?.forEach(stage => {
        stageMap.set(stage.id, stage.label);
      });

      // Fetch all payment splits with broker info
      const { data: splitsData, error: splitsError } = await supabase
        .from('payment_split')
        .select(`
          id,
          payment_id,
          broker_id,
          split_origination_usd,
          split_site_usd,
          split_deal_usd,
          split_broker_total,
          split_origination_percent,
          split_site_percent,
          split_deal_percent,
          paid,
          paid_date,
          broker!inner (
            name
          )
        `);

      if (splitsError) throw splitsError;

      // Transform data into PaymentDashboardRow format
      const transformedPayments: PaymentDashboardRow[] = (paymentsData || []).map((payment: any) => {
        const brokerSplits = (splitsData || [])
          .filter((split: any) => split.payment_id === payment.id)
          .map((split: any) => ({
            payment_split_id: split.id,
            broker_id: split.broker_id,
            broker_name: split.broker?.name || 'Unknown',
            split_origination_usd: split.split_origination_usd,
            split_site_usd: split.split_site_usd,
            split_deal_usd: split.split_deal_usd,
            split_broker_total: split.split_broker_total,
            split_origination_percent: split.split_origination_percent,
            split_site_percent: split.split_site_percent,
            split_deal_percent: split.split_deal_percent,
            paid: split.paid || false,
            paid_date: split.paid_date,
          }));

        const allBrokersPaid = brokerSplits.length > 0 && brokerSplits.every(b => b.paid);
        const totalBrokerAmount = brokerSplits.reduce((sum, b) => sum + (b.split_broker_total || 0), 0);

        // Calculate per-payment referral fee (proportional to payment amount)
        const dealTotalPayments = payment.deal?.number_of_payments || 1;
        const dealReferralFeeTotal = payment.deal?.referral_fee_usd || 0;
        const paymentReferralFee = dealReferralFeeTotal / dealTotalPayments;

        return {
          payment_id: payment.id,
          payment_sf_id: payment.sf_id,
          deal_id: payment.deal_id,
          deal_name: payment.deal?.deal_name || 'Unknown Deal',
          deal_stage: payment.deal?.stage_id ? stageMap.get(payment.deal.stage_id) || null : null,
          payment_sequence: payment.payment_sequence || 0,
          total_payments: dealTotalPayments,
          payment_amount: payment.payment_amount || 0,
          locked: payment.locked || false,
          payment_date_estimated: payment.payment_date_estimated,
          payment_received_date: payment.payment_received_date,
          payment_received: payment.payment_received || false,
          invoice_sent: payment.invoice_sent || false,
          payment_invoice_date: payment.payment_invoice_date,
          orep_invoice: payment.orep_invoice,
          qb_invoice_id: payment.qb_invoice_id,
          qb_invoice_number: payment.qb_invoice_number,
          qb_sync_status: payment.qb_sync_status,
          qb_last_sync: payment.qb_last_sync,
          referral_fee_usd: paymentReferralFee > 0 ? paymentReferralFee : null,
          referral_payee_name: payment.deal?.client?.client_name || null,
          referral_payee_client_id: payment.deal?.referral_payee_client_id || null,
          referral_fee_paid: payment.referral_fee_paid || false,
          referral_fee_paid_date: payment.referral_fee_paid_date,
          broker_splits: brokerSplits,
          all_brokers_paid: allBrokersPaid,
          total_broker_amount: totalBrokerAmount,
        };
      });

      setPayments(transformedPayments);
      calculateStats(transformedPayments);
    } catch (error) {
      console.error('Error fetching payment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (paymentsData: PaymentDashboardRow[]) => {
    const stats: PaymentSummaryStats = {
      total_payments: paymentsData.length,
      total_payment_amount: paymentsData.reduce((sum, p) => sum + p.payment_amount, 0),
      payments_received: paymentsData.filter(p => p.payment_received).length,
      payments_received_amount: paymentsData
        .filter(p => p.payment_received)
        .reduce((sum, p) => sum + p.payment_amount, 0),
      total_broker_payouts: paymentsData.reduce((sum, p) => sum + p.broker_splits.length, 0),
      broker_payouts_paid: paymentsData.reduce(
        (sum, p) => sum + p.broker_splits.filter(b => b.paid).length,
        0
      ),
      broker_payouts_paid_amount: paymentsData.reduce(
        (sum, p) => sum + p.broker_splits.filter(b => b.paid).reduce((s, b) => s + (b.split_broker_total || 0), 0),
        0
      ),
      total_referral_fees: paymentsData.filter(p => p.referral_fee_usd).length,
      referral_fees_paid: paymentsData.filter(p => p.referral_fee_paid).length,
      referral_fees_paid_amount: paymentsData
        .filter(p => p.referral_fee_paid)
        .reduce((sum, p) => sum + (p.referral_fee_usd || 0), 0),
    };

    setStats(stats);
  };

  const applyFilters = () => {
    let filtered = [...payments];

    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.deal_name.toLowerCase().includes(query) ||
        p.broker_splits.some(b => b.broker_name.toLowerCase().includes(query)) ||
        (p.referral_payee_name && p.referral_payee_name.toLowerCase().includes(query))
      );
    }

    // Payment status filter
    if (filters.paymentStatus !== 'all') {
      if (filters.paymentStatus === 'received') {
        filtered = filtered.filter(p => p.payment_received);
      } else if (filters.paymentStatus === 'pending') {
        filtered = filtered.filter(p => !p.payment_received);
      }
    }

    // Payout status filter
    if (filters.payoutStatus !== 'all') {
      if (filters.payoutStatus === 'paid') {
        filtered = filtered.filter(p =>
          p.all_brokers_paid &&
          (p.referral_fee_usd ? p.referral_fee_paid : true)
        );
      } else if (filters.payoutStatus === 'unpaid') {
        filtered = filtered.filter(p =>
          !p.all_brokers_paid ||
          (p.referral_fee_usd && !p.referral_fee_paid)
        );
      } else if (filters.payoutStatus === 'partial') {
        filtered = filtered.filter(p => {
          const someBrokersPaid = p.broker_splits.some(b => b.paid);
          const notAllBrokersPaid = !p.all_brokers_paid;
          return someBrokersPaid && notAllBrokersPaid;
        });
      }
    }

    // Date range filter
    if (filters.dateRange.start || filters.dateRange.end) {
      filtered = filtered.filter(p => {
        const paymentDate = p.payment_received_date || p.payment_date_estimated;
        if (!paymentDate) return false;

        const date = new Date(paymentDate);
        if (filters.dateRange.start && date < new Date(filters.dateRange.start)) return false;
        if (filters.dateRange.end && date > new Date(filters.dateRange.end)) return false;
        return true;
      });
    }

    // Deal stage filter (multi-select)
    if (filters.dealStages.length > 0) {
      filtered = filtered.filter(p => {
        // If "None" is selected, include payments without a deal stage
        if (filters.dealStages.includes('None') && !p.deal_stage) {
          return true;
        }
        // Otherwise, check if payment's stage is in selected stages
        return p.deal_stage && filters.dealStages.includes(p.deal_stage);
      });
    }

    // Deal filter
    if (filters.dealId) {
      filtered = filtered.filter(p => p.deal_id === filters.dealId);
    }

    setFilteredPayments(filtered);
  };

  const handleFilterChange = (newFilters: Partial<PaymentDashboardFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handlePaymentUpdate = () => {
    // Refresh data after any updates
    fetchPaymentData();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Payment Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track payments, broker commissions, and referral fees
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Payment Tracking
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`${
                activeTab === 'comparison'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Salesforce vs OVIS Comparison
            </button>
            <button
              onClick={() => setActiveTab('discrepancies')}
              className={`${
                activeTab === 'discrepancies'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Fix Discrepancies
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`${
                activeTab === 'validation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Split Validation
            </button>
            <button
              onClick={() => setActiveTab('deal-reconciliation')}
              className={`${
                activeTab === 'deal-reconciliation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Deal Reconciliation
            </button>
            <button
              onClick={() => setActiveTab('payment-reconciliation')}
              className={`${
                activeTab === 'payment-reconciliation'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Payment Reconciliation
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'deal-reconciliation' || activeTab === 'payment-reconciliation' ? (
        // Full-width container for reconciliation reports
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'deal-reconciliation' ? (
            <ReconciliationReport />
          ) : (
            <PaymentReconciliationReport />
          )}
        </div>
      ) : (
        // Regular max-width container for other tabs
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {activeTab === 'dashboard' ? (
            <>
              {/* Summary Stats */}
              {stats && <PaymentSummaryCards stats={stats} />}

              {/* Filters */}
              <PaymentDashboardFiltersBar
                filters={filters}
                onFilterChange={handleFilterChange}
              />

              {/* Record Count */}
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">{filteredPayments.length}</span>
                  {filteredPayments.length === 1 ? ' payment' : ' payments'} found
                  {filteredPayments.length !== payments.length && (
                    <span className="text-gray-500"> (filtered from {payments.length} total)</span>
                  )}
                </div>
              </div>

              {/* Payment Table */}
              <PaymentDashboardTable
                payments={filteredPayments}
                loading={loading}
                onPaymentUpdate={handlePaymentUpdate}
              />
            </>
          ) : activeTab === 'comparison' ? (
            <ComparisonReportTab />
          ) : activeTab === 'discrepancies' ? (
            <PaymentDiscrepancyReport />
          ) : (
            <SplitValidationTab />
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentDashboardPage;
