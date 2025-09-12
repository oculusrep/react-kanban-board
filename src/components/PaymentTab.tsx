import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Payment, PaymentSplit, Broker, CommissionSplit, Client } from '../lib/types';
import { usePaymentCalculations } from '../hooks/usePaymentCalculations';
import PaymentGenerationSection from './PaymentGenerationSection';
import PaymentListSection from './payments/PaymentListSection';
import PaymentStatusCard from './PaymentStatusCard';
import CommissionBreakdownBar from './CommissionBreakdownBar';
import { usePaymentStatus } from '../hooks/usePaymentStatus';

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

  // Use centralized payment calculations
  const {
    calculatedPaymentAmount,
    totalCalculatedPayments,
    paymentCommissionBreakdown,
    canGeneratePayments,
    validationMessages
  } = usePaymentCalculations(deal, payments, commissionSplits);

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

      // Call the database function to generate payments
      const { data, error } = await supabase.rpc('generate_payments_for_deal', {
        deal_uuid: deal.id
      });

      if (error) throw error;

      // Refresh payment data after generation
      await fetchPaymentData();

    } catch (err) {
      console.error('Error generating payments:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate payments');
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

  useEffect(() => {
    fetchPaymentData();
  }, [fetchPaymentData]);

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
        generatingPayments={generatingPayments}
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

      </div>
  );
};

export default PaymentTab;