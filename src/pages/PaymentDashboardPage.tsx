import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Bars3Icon } from '@heroicons/react/24/outline';
import {
  PaymentDashboardRow,
  PaymentDashboardFilters,
  PaymentSummaryStats,
  DealWithoutPayments
} from '../types/payment-dashboard';
import PaymentDashboardTable from '../components/payments/PaymentDashboardTable';
import PaymentDashboardFiltersBar from '../components/payments/PaymentDashboardFiltersBar';
import DealsWithoutPaymentsTable from '../components/payments/DealsWithoutPaymentsTable';
import PaymentSummaryCards from '../components/payments/PaymentSummaryCards';
import ComparisonReportTab from '../components/payments/ComparisonReportTab';
import PaymentDiscrepancyReport from '../components/payments/PaymentDiscrepancyReport';
import SplitValidationTab from '../components/payments/SplitValidationTab';
import ReconciliationReport from '../components/payments/ReconciliationReport';
import PaymentReconciliationReport from '../components/payments/PaymentReconciliationReport';
import DisbursementReportTab from '../components/payments/DisbursementReportTab';

type TabType = 'dashboard' | 'comparison' | 'discrepancies' | 'validation' | 'deal-reconciliation' | 'payment-reconciliation' | 'disbursements';

const PaymentDashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [payments, setPayments] = useState<PaymentDashboardRow[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<PaymentDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PaymentSummaryStats | null>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  // Bulk selection state for data quality actions
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Get initial dataQuality filter from URL if present
  const urlDataQuality = searchParams.get('dataQuality') as PaymentDashboardFilters['dataQuality'] | null;
  const initialDataQuality = urlDataQuality && ['all', 'missing_dates', 'overdue', 'no_payments'].includes(urlDataQuality)
    ? urlDataQuality
    : 'all';

  const [filters, setFilters] = useState<PaymentDashboardFilters>({
    searchQuery: '',
    paymentStatus: initialDataQuality === 'all' ? 'pending' : 'all', // Show all payment statuses when filtering by data quality
    payoutStatus: 'all',
    dateRange: { start: null, end: null },
    dealStages: initialDataQuality === 'all' ? ['Booked', 'Executed Payable', 'Closed Paid'] : [], // Show all stages when filtering by data quality
    dealId: null,
    dataQuality: initialDataQuality,
  });

  // Deals without payments (for data quality filter)
  const [dealsWithoutPayments, setDealsWithoutPayments] = useState<DealWithoutPayments[]>([]);

  // Fetch all payment data
  useEffect(() => {
    fetchPaymentData();
    fetchDealsWithoutPayments();
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

  // Click outside to close tools menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setShowToolsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  const fetchDealsWithoutPayments = async () => {
    try {
      // Fetch deals that have number_of_payments > 0 but no actual payment records
      // Using stages that should have payments
      const activeStages = ['Booked', 'Executed Payable', 'Closed Paid'];

      // Get stage IDs for active stages
      const { data: stagesData } = await supabase
        .from('deal_stage')
        .select('id, label')
        .in('label', activeStages);

      const stageIds = stagesData?.map(s => s.id) || [];
      const stageMap = new Map(stagesData?.map(s => [s.id, s.label]) || []);

      // Get all deals in these stages with number_of_payments > 0
      const { data: dealsData, error: dealsError } = await supabase
        .from('deal')
        .select(`
          id,
          deal_name,
          stage_id,
          number_of_payments,
          total_fee,
          created_at
        `)
        .in('stage_id', stageIds)
        .gt('number_of_payments', 0);

      if (dealsError) throw dealsError;

      // Get all deal IDs that have at least one payment
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select('deal_id');

      if (paymentsError) throw paymentsError;

      const dealsWithPayments = new Set(paymentsData?.map(p => p.deal_id) || []);

      // Filter to deals that have NO payments
      const dealsWithout = (dealsData || [])
        .filter(deal => !dealsWithPayments.has(deal.id))
        .map(deal => ({
          deal_id: deal.id,
          deal_name: deal.deal_name || 'Unknown Deal',
          deal_stage: stageMap.get(deal.stage_id) || null,
          number_of_payments: deal.number_of_payments || 0,
          total_fee: deal.total_fee,
          created_at: deal.created_at,
        }));

      setDealsWithoutPayments(dealsWithout);
    } catch (error) {
      console.error('Error fetching deals without payments:', error);
    }
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

    // Data quality filter (only applies to payment list, not deals without payments)
    if (filters.dataQuality === 'missing_dates') {
      filtered = filtered.filter(p => !p.payment_date_estimated);
    } else if (filters.dataQuality === 'overdue') {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(p =>
        p.payment_date_estimated &&
        p.payment_date_estimated < today &&
        !p.payment_received
      );
    }
    // 'no_payments' filter shows a different view entirely, handled in render

    setFilteredPayments(filtered);
  };

  const handleFilterChange = (newFilters: Partial<PaymentDashboardFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));

    // Update URL when dataQuality changes
    if (newFilters.dataQuality !== undefined) {
      if (newFilters.dataQuality === 'all') {
        searchParams.delete('dataQuality');
      } else {
        searchParams.set('dataQuality', newFilters.dataQuality);
      }
      setSearchParams(searchParams, { replace: true });
    }
  };

  const handlePaymentUpdate = () => {
    // Refresh data after any updates
    fetchPaymentData();
  };

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedPaymentIds(new Set());
  }, [filters.dataQuality]);

  // Toggle selection for a single payment
  const handleToggleSelect = (paymentId: string) => {
    setSelectedPaymentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paymentId)) {
        newSet.delete(paymentId);
      } else {
        newSet.add(paymentId);
      }
      return newSet;
    });
  };

  // Select/deselect all visible payments
  const handleSelectAll = () => {
    if (selectedPaymentIds.size === filteredPayments.length) {
      setSelectedPaymentIds(new Set());
    } else {
      setSelectedPaymentIds(new Set(filteredPayments.map(p => p.payment_id)));
    }
  };

  // Mark selected payments as historical (set dates from deal close/created date)
  const handleMarkAsHistorical = async () => {
    if (selectedPaymentIds.size === 0) return;

    const confirmed = window.confirm(
      `Mark ${selectedPaymentIds.size} payment(s) as historical?\n\n` +
      `This will set each payment's estimated and received dates to the deal's closed date (or created date if no closed date), ` +
      `and mark them as received.`
    );

    if (!confirmed) return;

    setBulkActionLoading(true);

    try {
      // Get the deal IDs for selected payments
      const selectedPayments = filteredPayments.filter(p => selectedPaymentIds.has(p.payment_id));
      const dealIds = [...new Set(selectedPayments.map(p => p.deal_id))];

      // Fetch deal close dates
      const { data: deals, error: dealsError } = await supabase
        .from('deal')
        .select('id, closed_date, created_at')
        .in('id', dealIds);

      if (dealsError) throw dealsError;

      // Create a map of deal_id to historical date
      const dealDateMap = new Map<string, string>();
      deals?.forEach(deal => {
        // Use closed_date if available, otherwise use created_at date
        const historicalDate = deal.closed_date ||
          (deal.created_at ? deal.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
        dealDateMap.set(deal.id, historicalDate);
      });

      // Update each selected payment
      const updatePromises = selectedPayments.map(payment => {
        const historicalDate = dealDateMap.get(payment.deal_id) || new Date().toISOString().split('T')[0];
        return supabase
          .from('payment')
          .update({
            payment_date_estimated: historicalDate,
            payment_received_date: historicalDate,
            payment_received: true,
          })
          .eq('id', payment.payment_id);
      });

      const results = await Promise.all(updatePromises);

      // Check for errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('Some updates failed:', errors);
        alert(`${errors.length} of ${selectedPayments.length} updates failed. Check console for details.`);
      }

      // Clear selection and refresh
      setSelectedPaymentIds(new Set());
      fetchPaymentData();

    } catch (error) {
      console.error('Error marking payments as historical:', error);
      alert('Failed to mark payments as historical. Check console for details.');
    } finally {
      setBulkActionLoading(false);
    }
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
          <nav className="-mb-px flex items-center justify-between">
            <div className="flex space-x-8">
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
              {/* Show active utility tab name if one is selected */}
              {activeTab !== 'dashboard' && (
                <span className="whitespace-nowrap py-4 px-1 border-b-2 border-blue-500 text-blue-600 font-medium text-sm">
                  {activeTab === 'comparison' && 'SF vs OVIS Comparison'}
                  {activeTab === 'discrepancies' && 'Fix Discrepancies'}
                  {activeTab === 'validation' && 'Split Validation'}
                  {activeTab === 'deal-reconciliation' && 'Deal Reconciliation'}
                  {activeTab === 'payment-reconciliation' && 'Payment Reconciliation'}
                  {activeTab === 'disbursements' && 'Disbursement Report'}
                </span>
              )}
            </div>

            {/* Tools Menu */}
            <div className="relative" ref={toolsMenuRef}>
              <button
                onClick={() => setShowToolsMenu(!showToolsMenu)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Bars3Icon className="h-5 w-5" />
                Tools
              </button>
              {showToolsMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setActiveTab('comparison');
                        setShowToolsMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        activeTab === 'comparison' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Salesforce vs OVIS Comparison
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('discrepancies');
                        setShowToolsMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        activeTab === 'discrepancies' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Fix Discrepancies
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('validation');
                        setShowToolsMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        activeTab === 'validation' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Split Validation
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('deal-reconciliation');
                        setShowToolsMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        activeTab === 'deal-reconciliation' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Deal Reconciliation
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('payment-reconciliation');
                        setShowToolsMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        activeTab === 'payment-reconciliation' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Payment Reconciliation
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('disbursements');
                        setShowToolsMenu(false);
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        activeTab === 'disbursements' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Disbursement Report
                    </button>
                  </div>
                </div>
              )}
            </div>
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
              {/* Summary Stats - hide when viewing deals without payments */}
              {stats && filters.dataQuality !== 'no_payments' && (
                <PaymentSummaryCards stats={stats} />
              )}

              {/* Filters */}
              <PaymentDashboardFiltersBar
                filters={filters}
                onFilterChange={handleFilterChange}
              />

              {/* Show different content based on data quality filter */}
              {filters.dataQuality === 'no_payments' ? (
                <DealsWithoutPaymentsTable
                  deals={dealsWithoutPayments}
                  loading={loading}
                />
              ) : (
                <>
                  {/* Record Count and Bulk Actions */}
                  <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{filteredPayments.length}</span>
                      {filteredPayments.length === 1 ? ' payment' : ' payments'} found
                      {filteredPayments.length !== payments.length && (
                        <span className="text-gray-500"> (filtered from {payments.length} total)</span>
                      )}
                      {filters.dataQuality === 'missing_dates' && (
                        <span className="ml-2 text-amber-600 font-medium">
                          (showing payments missing estimated dates)
                        </span>
                      )}
                      {filters.dataQuality === 'overdue' && (
                        <span className="ml-2 text-red-600 font-medium">
                          (showing overdue payments)
                        </span>
                      )}
                    </div>

                    {/* Bulk Actions - only show for missing_dates filter */}
                    {filters.dataQuality === 'missing_dates' && (
                      <div className="flex items-center gap-3">
                        {selectedPaymentIds.size > 0 && (
                          <span className="text-sm text-gray-600">
                            {selectedPaymentIds.size} selected
                          </span>
                        )}
                        <button
                          onClick={handleMarkAsHistorical}
                          disabled={selectedPaymentIds.size === 0 || bulkActionLoading}
                          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            selectedPaymentIds.size > 0
                              ? 'bg-amber-600 text-white hover:bg-amber-700'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          {bulkActionLoading ? (
                            <>
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Processing...
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Mark as Historical
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Payment Table */}
                  <PaymentDashboardTable
                    payments={filteredPayments}
                    loading={loading}
                    onPaymentUpdate={handlePaymentUpdate}
                    showSelection={filters.dataQuality === 'missing_dates'}
                    selectedIds={selectedPaymentIds}
                    onToggleSelect={handleToggleSelect}
                    onSelectAll={handleSelectAll}
                  />
                </>
              )}
            </>
          ) : activeTab === 'comparison' ? (
            <ComparisonReportTab />
          ) : activeTab === 'discrepancies' ? (
            <PaymentDiscrepancyReport />
          ) : activeTab === 'validation' ? (
            <SplitValidationTab />
          ) : activeTab === 'disbursements' ? (
            <DisbursementReportTab />
          ) : null}
        </div>
      )}
    </div>
  );
};

export default PaymentDashboardPage;
