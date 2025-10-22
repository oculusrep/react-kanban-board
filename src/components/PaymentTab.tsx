import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Payment, PaymentSplit, Broker, CommissionSplit, Client } from '../lib/types';
import { usePaymentCalculations } from '../hooks/usePaymentCalculations';
import PaymentGenerationSection from './PaymentGenerationSection';
import PaymentListSection from './payments/PaymentListSection';
import PaymentStatusCard from './PaymentStatusCard';
import CommissionBreakdownBar from './CommissionBreakdownBar';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

// Add caching for payment data
const paymentDataCache = new Map<string, {
  payments: PaymentWithProperty[];
  paymentSplits: PaymentSplit[];
  commissionSplits: CommissionSplit[];
  brokers: Broker[];
  clients: Client[];
  timestamp: number;
}>();

const PAYMENT_CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

// Enhanced Payment type with joined property data
interface PaymentWithProperty extends Payment {
  deal?: {
    id: string;
    property_id: string;
    property?: {
      id: string;
      property_name: string;
      address: string;
      city: string;
      state: string;
      zip: string;
    };
  };
}

interface PaymentTabProps {
  deal: Deal;
  onDealUpdate: (updates: Partial<Deal>) => Promise<void>;
}

const PaymentTab: React.FC<PaymentTabProps> = ({ deal, onDealUpdate }) => {
  const [payments, setPayments] = useState<PaymentWithProperty[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPayments, setGeneratingPayments] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const { toast, showToast, hideToast } = useToast();

  // Use centralized payment calculations
  const {
    calculatedPaymentAmount,
    totalCalculatedPayments,
    paymentCommissionBreakdown,
    canGeneratePayments,
    validationMessages
  } = usePaymentCalculations(deal, payments, commissionSplits);

  // Check if payment splits are out of sync with commission splits
  const paymentSplitsOutOfSync = useMemo(() => {
    if (payments.length === 0 || commissionSplits.length === 0) {
      return false; // No payments or splits to check
    }

    // Get unique broker IDs from commission splits
    const commissionBrokerIds = new Set(commissionSplits.map(cs => cs.broker_id));

    // Get unique broker IDs from payment splits
    const paymentSplitBrokerIds = new Set(paymentSplits.map(ps => ps.broker_id));

    // Check if the broker lists match
    if (commissionBrokerIds.size !== paymentSplitBrokerIds.size) {
      console.log('🔍 Payment splits out of sync: different number of brokers');
      return true;
    }

    // Check if all brokers in commission splits exist in payment splits
    for (const brokerId of commissionBrokerIds) {
      if (!paymentSplitBrokerIds.has(brokerId)) {
        console.log('🔍 Payment splits out of sync: broker missing from payment splits', brokerId);
        return true;
      }
    }

    // Check if all brokers in payment splits exist in commission splits
    for (const brokerId of paymentSplitBrokerIds) {
      if (!commissionBrokerIds.has(brokerId)) {
        console.log('🔍 Payment splits out of sync: broker in payment splits not in commission splits', brokerId);
        return true;
      }
    }

    console.log('✅ Payment splits are in sync with commission splits');
    return false;
  }, [payments, paymentSplits, commissionSplits]);

  // Optimized fetch with caching
  const fetchPaymentData = useCallback(async () => {
    if (!deal.id) return;

    // Check cache first
    const cached = paymentDataCache.get(deal.id);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < PAYMENT_CACHE_DURATION) {
      console.log('📦 Using cached payment data for deal:', deal.id);
      setPayments(cached.payments);
      setPaymentSplits(cached.paymentSplits);
      setCommissionSplits(cached.commissionSplits);
      setBrokers(cached.brokers);
      setClients(cached.clients);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Execute all queries in parallel for better performance
      const [
        paymentsResult,
        commissionSplitsResult,
        brokersResult,
        clientsResult
      ] = await Promise.all([
        // Payments for this deal
        supabase
          .from('payment')
          .select('*')
          .eq('deal_id', deal.id)
          .order('payment_sequence', { ascending: true }),
        
        // Commission splits for this deal
        supabase
          .from('commission_split')
          .select('*')
          .eq('deal_id', deal.id),
        
        // All brokers (lighter query)
        supabase
          .from('broker')
          .select('id, name')
          .order('name'),
        
        // Clients (with error handling)
        supabase
          .from('client')
          .select('*')
          .order('client_name')
      ]);

      if (paymentsResult.error) throw paymentsResult.error;
      if (commissionSplitsResult.error) throw commissionSplitsResult.error;
      if (brokersResult.error) throw brokersResult.error;
      if (clientsResult.error) throw clientsResult.error;

      const paymentsData = paymentsResult.data || [];
      const commissionSplitsData = commissionSplitsResult.data || [];
      const brokersData = brokersResult.data || [];
      const clientsData = clientsResult.data || [];

      // Fetch payment splits only if we have payments (conditional query)
      let paymentSplitsData: PaymentSplit[] = [];
      const paymentIds = paymentsData.map((p: any) => p.id);
      
      if (paymentIds.length > 0) {
        const { data: splitsData, error: splitsError } = await supabase
          .from('payment_split')
          .select('*')
          .in('payment_id', paymentIds);

        if (splitsError) throw splitsError;
        paymentSplitsData = splitsData || [];
      }

      // Cache the results for faster subsequent loads
      paymentDataCache.set(deal.id, {
        payments: paymentsData,
        paymentSplits: paymentSplitsData,
        commissionSplits: commissionSplitsData,
        brokers: brokersData,
        clients: clientsData,
        timestamp: Date.now()
      });

      // Limit cache size to prevent memory leaks
      if (paymentDataCache.size > 50) {
        const firstKey = paymentDataCache.keys().next().value;
        if (firstKey !== undefined) {
          paymentDataCache.delete(firstKey);
        }
      }

      setPayments(paymentsData);
      setPaymentSplits(paymentSplitsData);
      setCommissionSplits(commissionSplitsData);
      setBrokers(brokersData);
      setClients(clientsData);

    } catch (err) {
      console.error('Error fetching payment data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }, [deal.id]);

  // Generate payments for the deal
  const generatePayments = async () => {
    if (!deal.id) return;

    try {
      setGeneratingPayments(true);
      setError(null);

      console.log('🔵 Generating payments for deal:', deal.id);
      console.log('🔵 Deal data:', { fee: deal.fee, number_of_payments: deal.number_of_payments });

      // Call the database function to generate payments
      const { data, error } = await supabase.rpc('generate_payments_for_deal', {
        deal_uuid: deal.id
      });

      if (error) {
        console.error('❌ Database error:', error);
        throw error;
      }

      console.log('✅ Payment generation response:', data);

      // Clear cache for this deal to force fresh data
      paymentDataCache.delete(deal.id);

      // Refresh payment data after generation
      await fetchPaymentData();

    } catch (err) {
      console.error('❌ Error generating payments:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate payments');
    } finally {
      setGeneratingPayments(false);
    }
  };

  const regeneratePaymentSplits = async () => {
    if (!deal.id) return;

    // Show confirmation dialog instead of window.confirm
    setShowRegenerateConfirm(true);
  };

  const handleConfirmRegenerate = async () => {
    setShowRegenerateConfirm(false);

    if (!deal.id) return;

    try {
      setGeneratingPayments(true);
      setError(null);

      console.log('🔵 Regenerating payment splits for deal:', deal.id);

      // Step 1: Delete all existing payment splits for this deal's payments
      const paymentIds = payments.map(p => p.id);
      if (paymentIds.length === 0) {
        showToast('No payments found to regenerate splits for', { type: 'info' });
        return;
      }

      const { error: deleteError } = await supabase
        .from('payment_split')
        .delete()
        .in('payment_id', paymentIds);

      if (deleteError) {
        console.error('❌ Error deleting old payment splits:', deleteError);
        throw deleteError;
      }

      console.log('✅ Deleted old payment splits');

      // Step 2: Get all commission splits for this deal
      if (commissionSplits.length === 0) {
        showToast('No commission splits found. Please set up commission splits first.', { type: 'error' });
        return;
      }

      console.log('🔵 Commission splits:', commissionSplits);

      // Step 3: Create new payment splits for each payment based on commission splits
      const newPaymentSplits: any[] = [];

      // For each payment, create splits based on commission splits
      for (const payment of payments) {
        const paymentAmount = payment.payment_amount || 0;

        // Calculate per-payment commission breakdown (matching usePaymentCalculations logic)
        const totalReferralFee = deal.referral_fee_usd || 0;
        const totalHouseFee = deal.house_usd || 0;
        const numberOfPayments = deal.number_of_payments || 1;

        const referralFeePerPayment = totalReferralFee / numberOfPayments;
        const houseFeePerPayment = totalHouseFee / numberOfPayments;
        const agci = paymentAmount - referralFeePerPayment - houseFeePerPayment;

        // Commission split amounts (applied to AGCI)
        const originationPercent = deal.origination_percent || 0;
        const sitePercent = deal.site_percent || 0;
        const dealPercent = deal.deal_percent || 0;

        const originationUsd = (originationPercent / 100) * agci;
        const siteUsd = (sitePercent / 100) * agci;
        const dealUsd = (dealPercent / 100) * agci;

        console.log(`🔵 Payment ${payment.payment_sequence}: amount=${paymentAmount}, agci=${agci}`);
        console.log(`   Breakdown: origination=${originationUsd}, site=${siteUsd}, deal=${dealUsd}`);

        // Create a payment split for each commission split (broker)
        for (const commissionSplit of commissionSplits) {
          // Calculate broker amounts based on their split percentages
          const brokerOriginationAmount = ((commissionSplit.split_origination_percent || 0) / 100) * originationUsd;
          const brokerSiteAmount = ((commissionSplit.split_site_percent || 0) / 100) * siteUsd;
          const brokerDealAmount = ((commissionSplit.split_deal_percent || 0) / 100) * dealUsd;
          const totalBrokerAmount = brokerOriginationAmount + brokerSiteAmount + brokerDealAmount;

          newPaymentSplits.push({
            payment_id: payment.id,
            broker_id: commissionSplit.broker_id,
            commission_split_id: commissionSplit.id,
            split_origination_percent: commissionSplit.split_origination_percent,
            split_site_percent: commissionSplit.split_site_percent,
            split_deal_percent: commissionSplit.split_deal_percent,
            split_origination_usd: brokerOriginationAmount,
            split_site_usd: brokerSiteAmount,
            split_deal_usd: brokerDealAmount,
            split_broker_total: totalBrokerAmount,
            paid: false
          });

          console.log(`  - Split for broker ${commissionSplit.broker_id}: $${totalBrokerAmount.toFixed(2)}`);
          console.log(`    (orig: ${commissionSplit.split_origination_percent}% = $${brokerOriginationAmount.toFixed(2)}, ` +
                     `site: ${commissionSplit.split_site_percent}% = $${brokerSiteAmount.toFixed(2)}, ` +
                     `deal: ${commissionSplit.split_deal_percent}% = $${brokerDealAmount.toFixed(2)})`);
        }
      }

      console.log('🔵 Creating payment splits:', newPaymentSplits);

      // Step 4: Insert new payment splits
      if (newPaymentSplits.length > 0) {
        const { error: insertError } = await supabase
          .from('payment_split')
          .insert(newPaymentSplits);

        if (insertError) {
          console.error('❌ Error inserting new payment splits:', insertError);
          throw insertError;
        }
      }

      console.log('✅ Payment splits regenerated successfully');

      // Clear cache for this deal to force fresh data
      paymentDataCache.delete(deal.id);

      // Refresh payment data after regeneration
      await fetchPaymentData();

      showToast('Payment splits have been successfully regenerated!', { type: 'success' });

    } catch (err) {
      console.error('❌ Error regenerating payment splits:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate payment splits';
      setError(errorMessage);
      showToast(errorMessage, { type: 'error', duration: 5000 });
    } finally {
      setGeneratingPayments(false);
    }
  };

  // Update payment in database
  const updatePayment = async (paymentId: string, updates: Partial<Payment>) => {
    try {
      const { error } = await supabase
        .from('payment')
        .update(updates)
        .eq('id', paymentId);

      if (error) throw error;

      // Update local state
      setPayments(prev => prev.map(p => 
        p.id === paymentId ? { ...p, ...updates } : p
      ));

    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to update payment');
    }
  };

  // Delete payment
  const deletePayment = async (paymentId: string) => {
    try {
      // First delete payment splits
      const { error: splitsError } = await supabase
        .from('payment_split')
        .delete()
        .eq('payment_id', paymentId);

      if (splitsError) throw splitsError;

      // Then delete payment
      const { error: paymentError } = await supabase
        .from('payment')
        .delete()
        .eq('id', paymentId);

      if (paymentError) throw paymentError;

      // Update local state
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      setPaymentSplits(prev => prev.filter(ps => ps.payment_id !== paymentId));

    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
    }
  };

  // Clear cache and fetch data when component mounts to ensure fresh data
  useEffect(() => {
    // Clear cache for this deal to ensure we get fresh data when switching to this tab
    paymentDataCache.delete(deal.id);
    fetchPaymentData();
  }, [fetchPaymentData, deal.id]);

  // Real-time subscriptions for automatic updates
  useEffect(() => {
    if (!deal.id) return;

    console.log('🔔 Setting up real-time subscriptions for PaymentTab, deal:', deal.id);

    // Subscribe to payment table changes for this deal
    const paymentSubscription = supabase
      .channel(`payment-changes-${deal.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payment',
        filter: `deal_id=eq.${deal.id}`
      }, (payload) => {
        console.log('💰 Payment change detected:', payload.eventType);
        // Clear cache and refetch
        paymentDataCache.delete(deal.id);
        fetchPaymentData();
      })
      .subscribe();

    // Subscribe to payment_split table changes
    const paymentSplitSubscription = supabase
      .channel(`payment-split-changes-${deal.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payment_split'
      }, (payload) => {
        console.log('📊 Payment split change detected:', payload.eventType);
        // Clear cache and refetch
        paymentDataCache.delete(deal.id);
        fetchPaymentData();
      })
      .subscribe();

    // Subscribe to commission_split changes for this deal
    const commissionSplitSubscription = supabase
      .channel(`commission-split-changes-${deal.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'commission_split',
        filter: `deal_id=eq.${deal.id}`
      }, (payload) => {
        console.log('🎯 Commission split change detected');
        // Clear cache and refetch
        paymentDataCache.delete(deal.id);
        fetchPaymentData();
      })
      .subscribe();

    // Subscribe to deal changes
    const dealSubscription = supabase
      .channel(`deal-changes-${deal.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'deal',
        filter: `id=eq.${deal.id}`
      }, (payload) => {
        console.log('💼 Deal change detected');
        // Clear cache and refetch
        paymentDataCache.delete(deal.id);
        fetchPaymentData();
      })
      .subscribe();

    // Cleanup subscriptions when component unmounts or deal changes
    return () => {
      console.log('🔕 Cleaning up real-time subscriptions for PaymentTab');
      supabase.removeChannel(paymentSubscription);
      supabase.removeChannel(paymentSplitSubscription);
      supabase.removeChannel(commissionSplitSubscription);
      supabase.removeChannel(dealSubscription);
    };
  }, [deal.id, fetchPaymentData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading payment data...</div>
      </div>
    );
  }

  const hasPayments = payments.length > 0;
  const totalPaymentAmount = payments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
  const commissionFee = deal.fee || 0;
  const { statusSummary, hasOverdue, hasActionItems, completionRate } = usePaymentStatus(payments);

  // Helper function for currency formatting
  const formatUSD = (amount: number): string => {
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">{error}</div>
        </div>
      )}

      {/* Payment Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-600">Total Commission</div>
          <div className="text-2xl font-bold text-blue-900">
            ${formatUSD(commissionFee)}
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-medium text-green-600">Calculated Payments</div>
          <div className="text-2xl font-bold text-green-900">
            ${formatUSD(totalCalculatedPayments)}
          </div>
          <div className="text-xs text-green-600 mt-1">
            {deal.number_of_payments || 1} × ${formatUSD(calculatedPaymentAmount)}
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-sm font-medium text-purple-600">AGCI Available</div>
          <div className="text-2xl font-bold text-purple-900">
            ${formatUSD(deal.agci || 0)}
          </div>
          <div className="text-xs text-purple-600 mt-1">
            After house & referral fees
          </div>
        </div>

       <PaymentStatusCard 
        statusSummary={statusSummary}
        hasOverdue={hasOverdue}
        completionRate={completionRate}
      />
      </div>

      {/* Commission Breakdown Bar */}
      <CommissionBreakdownBar
        deal={deal}
        commissionSplits={commissionSplits}
        className="mb-6"
      />

      {/* Payment Generation Section */}
      <PaymentGenerationSection
        deal={deal}
        hasPayments={hasPayments}
        existingPayments={payments}
        commissionSplits={commissionSplits}
        onGeneratePayments={generatePayments}
        onRegeneratePaymentSplits={regeneratePaymentSplits}
        generatingPayments={generatingPayments}
        showRegenerateButton={paymentSplitsOutOfSync}
      />

      {/* Payment List Section */}
      {hasPayments ? (
        <div className="space-y-6">
          
          <PaymentListSection
            payments={payments}
            paymentSplits={paymentSplits}
            brokers={brokers}
            clients={clients}
            commissionSplits={commissionSplits}
            deal={deal}
            onUpdatePayment={updatePayment}
            onDeletePayment={deletePayment}
            onUpdatePaymentSplit={async (splitId, field, value) => {
              // Update local state immediately instead of full refresh
              setPaymentSplits(prev => 
                prev.map(split => 
                  split.id === splitId 
                    ? { ...split, [field]: value !== null ? value : (field === 'paid' ? false : 0) }
                    : split
                )
              );
            }}
          />
        </div>
      ) : (
        /* No Payments State */
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-gray-500 text-lg mb-2">No payments generated yet</div>
          <div className="text-gray-400 text-sm">
            {canGeneratePayments ? 
              'Click "Generate Payments" above to create payment records' :
              'Complete commission configuration to enable payment generation'
            }
          </div>
          {validationMessages.length > 0 && (
            <div className="mt-4 text-left max-w-md mx-auto">
              <div className="text-sm text-gray-600 mb-2">Required configuration:</div>
              <ul className="text-sm text-gray-500 space-y-1">
                {validationMessages.map((message, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-gray-400 mr-1">•</span>
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Toast notifications */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />

      {/* Regenerate confirmation dialog */}
      <ConfirmDialog
        isOpen={showRegenerateConfirm}
        title="Regenerate Payment Splits"
        message="This will delete all existing payment splits and regenerate them based on current commission splits. Any manual adjustments to payment splits will be lost. Continue?"
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
        confirmButtonClass="bg-orange-600 hover:bg-orange-700"
        onConfirm={handleConfirmRegenerate}
        onCancel={() => setShowRegenerateConfirm(false)}
      />

      </div>
  );
};

export default PaymentTab;